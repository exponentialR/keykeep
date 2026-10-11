import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker,{allowedEmail} from './cloud/worker.js';
import {derive,encrypt,unlock,rekey} from './crypto.js';
import {VaultSync,markChanged} from './sync.js';
import {compareVaults,combineVaults} from './reconcile.js';
function database(){
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('./cloud/schema.sql',import.meta.url),'utf8'));
  return {raw:db,prepare(sql){let args=[];const query={bind(...values){args=values;return query;},async all(){return {results:db.prepare(sql).all(...args)};},async first(){return db.prepare(sql).get(...args)||null;},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};return query;},async batch(queries){return Promise.all(queries.map(q=>q.run()));}};
}
const wire={version:1,salt:btoa('s'.repeat(16)),iv:btoa('i'.repeat(12)),data:btoa('d'.repeat(20))};
test('cloud API denies unauthenticated access and strips public indexes; version conflicts retain history',async()=>{
  const DB=database(),origin='https://passwords.example.test';
  const env={DB,ORIGIN:origin,OIDC_ISSUER:'https://example.cloudflareaccess.com/cdn-cgi/access/sso/oidc/client',OIDC_CLIENT_ID:'client',OIDC_CLIENT_SECRET:'synthetic',ALLOWED_EMAIL:'owner@example.test'};
  const vaultId=await digestText(env.ALLOWED_EMAIL);
  const token='synthetic-session',digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),x=>x.toString(16).padStart(2,'0')).join('');
  const send=(method,body,extra={})=>worker.fetch(new Request(origin+'/api/vault',{method,headers:{Cookie:'__Host-keykeep-session='+token,Origin:origin,'X-Keykeep-Request':'1','X-Keykeep-Vault':vaultId,'Content-Type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{})}),env);
  assert.equal((await send('GET')).status,401);
  await DB.prepare('INSERT INTO sessions VALUES(?,?,?,?)').bind(digest,'user',env.ALLOWED_EMAIL,Math.floor(Date.now()/1000)+600).run();
  assert.equal((await send('PUT',{}, {Origin:'https://attacker.test'})).status,403);
  const first={baseVersion:0,writeId:crypto.randomUUID(),envelope:{...wire,index:[{name:'private'}]}};
  assert.equal((await send('PUT',first)).status,200);assert.equal((await send('PUT',first)).status,200);
  let stored=await (await send('GET')).json();assert.equal(stored.version,1);assert.ok(!stored.envelope.index);
  env.VAULT_OWNER=env.ALLOWED_EMAIL;env.ALLOWED_EMAILS=env.ALLOWED_EMAIL+',alias@example.test';
  await DB.prepare('UPDATE sessions SET email=? WHERE token_hash=?').bind('alias@example.test',digest).run();
  const aliasVault=await (await send('GET')).json();assert.deepEqual(aliasVault,stored);
  await DB.prepare('UPDATE sessions SET email=? WHERE token_hash=?').bind('stranger@example.test',digest).run();
  assert.equal((await send('GET')).status,401);
  await DB.prepare('UPDATE sessions SET email=? WHERE token_hash=?').bind('alias@example.test',digest).run();
  assert.equal((await send('PUT',{...first,writeId:crypto.randomUUID()})).status,409);
  assert.equal((await send('PUT',{...first,baseVersion:1,writeId:crypto.randomUUID(),envelope:{...wire,iv:btoa('j'.repeat(12))}})).status,200);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM vault_history').get().n,1);
  assert.equal((await worker.fetch(new Request(origin+'/auth/callback?state=forged&code=forged'),env)).status,400);
  assert.equal((await worker.fetch(new Request('https://wrong.test/api/vault'),env)).status,403);
  DB.raw.close();
});

test('explicit email aliases share a fixed vault owner and reject other addresses',()=>{
  const env={ALLOWED_EMAILS:'owner@example.test,alias@example.test',VAULT_OWNER:'owner@example.test'};
  assert.ok(allowedEmail('owner@example.test',env));
  assert.ok(allowedEmail('alias@example.test',env));
  assert.equal(allowedEmail('someone@gmail.com',env),false);
  assert.equal(allowedEmail(undefined,env),false);
});

const digestText=async value=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('hex');
test('two isolated clients preserve offline edits, reconcile through the real Worker and follow key rotation',async()=>{
 const DB=database(),origin='https://vault.example.test',email='owner@example.test';
 const env={DB,ORIGIN:origin,OIDC_ISSUER:'https://example.cloudflareaccess.com/oidc/client',OIDC_CLIENT_ID:'client',OIDC_CLIENT_SECRET:'synthetic',ALLOWED_EMAILS:email,VAULT_OWNER:email};
 const token='two-client-synthetic-session',vaultId=await digestText(email);
 await DB.prepare('INSERT INTO sessions VALUES(?,?,?,?)').bind(await digestText(token),'subject',email,Math.floor(Date.now()/1000)+600).run();
 function client(){
  const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  let online=true;
  const request=async(path,options={})=>{
   if(!online)throw new Error('offline');
   const response=await worker.fetch(new Request(origin+path,{...options,headers:{Cookie:'__Host-keykeep-session='+token,Origin:origin,'X-Keykeep-Request':'1','X-Keykeep-Vault':vaultId,'Content-Type':'application/json'}}),env);
   if(!response.ok)throw new Error('HTTP '+response.status);
   return response.json();
  };
  const engine=new VaultSync({storage,request});
  return {storage,engine,offline:()=>{online=false;},online:()=>{online=true;}};
 }
 const a=client(),b=client(),master='synthetic-master-12345',nextMaster='synthetic-new-master-12345';
 const salt=crypto.getRandomValues(new Uint8Array(16)),key=await derive(master,salt);
 const entry=id=>({id,name:id,username:'sample@example.test',password:'SampleOnly!'+id,createdAt:'2026-10-01T09:00:00.000Z',updatedAt:'2026-10-01T09:00:00.000Z'});
 const initial=await encrypt([entry('initial')],key,salt);
 a.storage.setItem('keykeep.v1',JSON.stringify(markChanged(initial,null)));
 try{
  await a.engine.run();await b.engine.run();
  assert.equal((await unlock(b.engine.read(),master)).entries.length,1);
  a.offline();
  const local=markChanged(await encrypt([entry('initial'),entry('offline-A')],key,salt),a.engine.read());
  a.storage.setItem('keykeep.v1',JSON.stringify(local));
  await assert.rejects(a.engine.run(),/offline/);assert.deepEqual(a.engine.read(),local);
  b.storage.setItem('keykeep.v1',JSON.stringify(markChanged(await encrypt([entry('initial'),entry('online-B')],key,salt),b.engine.read())));
  await b.engine.run();a.online();await a.engine.run();assert.equal(a.engine.read().sync.dirty,true);
  const snapshot=await a.engine.inspectConflict();
  const left=await unlock(snapshot.local,master),right=await unlock(snapshot.remote.envelope,master);
  const combined=combineVaults(compareVaults(left.entries,right.entries),{});
  await a.engine.combine(await encrypt(combined,left.key,left.salt),snapshot);await b.engine.run();
  assert.deepEqual((await unlock(b.engine.read(),master)).entries.map(e=>e.id).sort(),['initial','offline-A','online-B']);
  const originals=JSON.parse(a.storage.getItem('keykeep.recoveries.v1'));
  assert.equal(originals.length,2);for(const copy of originals)assert.equal((await unlock(copy.envelope,master)).entries.length,2);
  const rotated=await rekey(a.engine.read(),master,nextMaster);
  a.storage.setItem('keykeep.v1',JSON.stringify(markChanged(rotated.envelope,a.engine.read())));
  await a.engine.run();await b.engine.run();
  await assert.rejects(unlock(b.engine.read(),master));assert.equal((await unlock(b.engine.read(),nextMaster)).entries.length,3);
  assert.equal((await unlock(initial,master)).entries.length,1);
  const stored=DB.raw.prepare('SELECT envelope FROM vaults').get().envelope;
  assert.ok(!stored.includes('sample@example.test'));assert.ok(!stored.includes('SampleOnly!'));
 }finally{DB.raw.close();}
});
test('public requests require owner approval; guests have isolated vaults and cannot administer or reuse another account tab',async()=>{
 const DB=database(),origin='https://passwords.example.test';
 const env={DB,ORIGIN:origin,OIDC_ISSUER:'https://example.cloudflareaccess.com/oidc/client',OIDC_CLIENT_ID:'client',OIDC_CLIENT_SECRET:'synthetic',ALLOWED_EMAILS:'owner@example.test,alias@example.test',VAULT_OWNER:'owner@example.test',ASSETS:{fetch:async request=>new Response(new URL(request.url).pathname)}};
 async function login(email){const token=crypto.randomUUID();await DB.prepare('INSERT INTO sessions VALUES(?,?,?,?)').bind(await digestText(token),'subject-'+email,email,Math.floor(Date.now()/1000)+600).run();return token;}
 const owner=await login('owner@example.test'),guest=await login('guest@example.test');
 const send=(path,{token,method='GET',body,vaultId,originHeader=origin,ip='test-ip'}={})=>worker.fetch(new Request(origin+path,{method,headers:{...(token?{Cookie:'__Host-keykeep-session='+token}:{}),Origin:originHeader,'X-Keykeep-Request':'1','Content-Type':'application/json','CF-Connecting-IP':ip,...(vaultId?{'X-Keykeep-Vault':vaultId}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
 assert.equal(await (await send('/')).text(),'/public/');
 for(const path of ['/app','/app.js','/admin','/admin.js','/account.js'])assert.equal((await send(path)).status,302);
 assert.equal((await send('/api/session',{token:guest})).status,401);
 assert.equal((await send('/api/access-request',{method:'POST',body:{email:'guest@example.test'},originHeader:'https://evil.test'})).status,403);
 assert.equal((await send('/api/access-request',{method:'POST',body:{email:'invalid'}})).status,400);
 assert.equal((await send('/api/access-request',{method:'POST',body:{email:'Guest@example.test'}})).status,202);
 assert.equal((await send('/api/session',{token:guest})).status,401);
 assert.equal((await send('/api/access-requests',{token:owner})).status,200);
 const decision=status=>send('/api/access-requests',{token:owner,method:'POST',body:{email:'guest@example.test',status}});
 assert.equal((await decision('approved')).status,200);
 const identity=await (await send('/api/session',{token:guest})).json();assert.equal(identity.admin,false);assert.equal(identity.legacyOwner,false);
 const ownIdentity=await (await send('/api/session',{token:owner})).json();assert.notEqual(identity.vaultId,ownIdentity.vaultId);
 assert.equal((await send('/api/access-requests',{token:guest})).status,403);
 assert.equal((await send('/admin',{token:guest})).status,403);
 assert.equal(await (await send('/app',{token:guest})).text(),'/private/');
 const body={baseVersion:0,writeId:crypto.randomUUID(),envelope:wire};
 assert.equal((await send('/api/vault',{token:owner,vaultId:ownIdentity.vaultId,method:'PUT',body})).status,200);
 assert.equal((await send('/api/vault',{token:guest,vaultId:ownIdentity.vaultId,method:'PUT',body})).status,403);
 assert.equal((await send('/api/vault',{token:guest,method:'PUT',body})).status,403);
 assert.equal((await (await send('/api/vault',{token:guest,vaultId:identity.vaultId})).json()).envelope,null);
 assert.equal((await send('/api/vault',{token:guest,vaultId:identity.vaultId,method:'PUT',body})).status,200);
 assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM vaults').get().n,2);
 assert.equal((await decision('declined')).status,200);
 assert.equal((await send('/api/vault',{token:guest,vaultId:identity.vaultId})).status,401);
 assert.equal((await send('/api/access-request',{method:'POST',body:{email:'guest@example.test'}})).status,202);
 assert.equal(DB.raw.prepare('SELECT status FROM access_requests WHERE email=?').get('guest@example.test').status,'declined');
 for(let i=0;i<10;i++)await send('/api/access-request',{method:'POST',body:{email:'flood@example.test'},ip:'flood'});
 assert.equal((await send('/api/access-request',{method:'POST',body:{email:'flood@example.test'},ip:'flood'})).status,429);
 assert.equal((await send('/api/access-request',{method:'POST',body:{email:'guest@example.test',junk:'x'.repeat(5000)},ip:'big'})).status,400);
 DB.raw.close();
});

test('email tests are owner-only, preserve access decisions and send once through the outbox',async()=>{
 const DB=database(),origin='https://passwords.example.test';
 const env={DB,ORIGIN:origin,OIDC_ISSUER:'https://example.cloudflareaccess.com/oidc/client',OIDC_CLIENT_ID:'client',OIDC_CLIENT_SECRET:'synthetic',ALLOWED_EMAILS:'owner@example.test,alias@example.test',VAULT_OWNER:'owner@example.test',EMAIL_FROM:'Keykeep <access@notify.example.test>',RESEND_API_KEY:'synthetic'};
 const token='owner-test-session';await DB.prepare('INSERT INTO sessions VALUES(?,?,?,?)').bind(await digestText(token),'owner','owner@example.test',Math.floor(Date.now()/1000)+600).run();
 DB.raw.exec("INSERT INTO access_requests VALUES('alias@example.test','pending','now',NULL,NULL); INSERT INTO access_requests VALUES('member@example.test','approved','now','now','owner@example.test')");
 const send=(email,session=token)=>worker.fetch(new Request(origin+'/api/access-requests',{method:'POST',headers:{Cookie:'__Host-keykeep-session='+session,Origin:origin,'X-Keykeep-Request':'1','Content-Type':'application/json'},body:JSON.stringify({email,test:true})}),env);
 const originalFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'https://api.resend.com/emails');const payload=JSON.parse(options.body);assert.deepEqual(payload.to,['alias@example.test']);assert.match(payload.subject,/^\[TEST\]/);return Response.json({id:'test-provider-id'});};
 try{
  assert.equal((await send('member@example.test')).status,400);
  assert.equal((await send('alias@example.test','invalid')).status,401);
  assert.equal((await (await send('alias@example.test')).json()).notification.state,'sent');
  assert.equal((await (await send('alias@example.test')).json()).notification.state,'sent');assert.equal(calls,1);
  assert.equal(DB.raw.prepare('SELECT status FROM access_requests WHERE email=?').get('alias@example.test').status,'pending');
  assert.equal(DB.raw.prepare('SELECT count(*) n FROM vaults').get().n,0);
  const memberToken='member-session';await DB.prepare('INSERT INTO sessions VALUES(?,?,?,?)').bind(await digestText(memberToken),'member','member@example.test',Math.floor(Date.now()/1000)+600).run();
  assert.equal((await send('alias@example.test',memberToken)).status,403);
 }finally{globalThis.fetch=originalFetch;DB.raw.close();}
});

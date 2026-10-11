import {sendApproval,approvalMessage} from './email.js';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {validate} from '../crypto.js';
const encoder=new TextEncoder();
const random=()=>crypto.randomUUID()+crypto.randomUUID();
const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text))),x=>x.toString(16).padStart(2,'0')).join('');
const cookie=(name,value,age)=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const cookies=request=>Object.fromEntries((request.headers.get('Cookie')||'').split(';').map(v=>v.trim().split('=')));
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const keys=new Map();
export function wireEnvelope(value){
  validate(value);
  return {version:value.version,salt:value.salt,iv:value.iv,data:value.data};
}
export function allowedEmail(email,env){return typeof email==='string' && (env.ALLOWED_EMAILS||env.ALLOWED_EMAIL||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());}
const normalEmail=email=>typeof email==='string'?email.trim().toLowerCase():'';
export async function admitted(email,env){
  if(allowedEmail(email,env))return true;
  return (await env.DB.prepare('SELECT status FROM access_requests WHERE email=?').bind(normalEmail(email)).first())?.status==='approved';
}
export const vaultOwner=(email,env)=>allowedEmail(email,env)?(env.VAULT_OWNER||env.ALLOWED_EMAIL):'member:'+normalEmail(email);
const vaultIdentity=(email,env)=>hash(vaultOwner(email,env));
async function readJSON(request,max=4096){
  const reader=request.body?.getReader();if(!reader)throw new Error('Missing body');
  let length=0,text='';const decoder=new TextDecoder();
  while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();throw new Error('Body too large');}text+=decoder.decode(value,{stream:true});}
  return JSON.parse(text+decoder.decode());
}
const redirect=path=>new Response(null,{status:302,headers:{Location:path,'Cache-Control':'private, no-store'}});
function configured(env){return env.DB && env.ORIGIN && env.OIDC_ISSUER && env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET && (env.ALLOWED_EMAILS||env.ALLOWED_EMAIL) && (env.VAULT_OWNER||env.ALLOWED_EMAIL); }
function issuer(env){
  const url=new URL(env.OIDC_ISSUER);
  if(url.protocol!=='https:'||!url.hostname.endsWith('.cloudflareaccess.com')||url.search||url.hash)throw new Error('Invalid identity provider');
  return url.href.replace(/\/$/,'');
}
export async function sessionFor(request,env){
  const token=cookies(request)['__Host-keykeep-session']; if(!token)return null;
  const row=await env.DB.prepare('SELECT subject,email,expires FROM sessions WHERE token_hash=? AND expires>?').bind(await hash(token),Math.floor(Date.now()/1000)).first();
  return row && await admitted(row.email,env) ? row : null;
}
async function handle(request,env){
  const url=new URL(request.url), path=url.pathname;
  // Public assets contain no private app shell. Unknown routes must never use the SPA fallback.
  const publicAssets=['/welcome.js','/style.css','/sw.js','/manifest.webmanifest','/icon.svg','/icon-192.png','/icon-512.png'];
  if(publicAssets.includes(path))return env.ASSETS.fetch(request);
  if(path==='/'||path==='/index.html'||path==='/welcome.html'){
    return env.ASSETS.fetch(new Request(new URL('/public/',url),request));
  }
  if(!configured(env))return json({error:'Cloud sign-in is not configured yet.'},503);
  if(url.origin!==env.ORIGIN)return json({error:'Use the configured Keykeep address.'},403);
  const now=Math.floor(Date.now()/1000);
  if(path==='/api/access-request'&&request.method==='POST'){
    if(request.headers.get('Origin')!==env.ORIGIN||request.headers.get('X-Keykeep-Request')!=='1')return json({error:'Request origin rejected.'},403);
    const bucket=await hash((request.headers.get('CF-Connecting-IP')||'unknown')+':'+Math.floor(now/86400));
    await env.DB.prepare('DELETE FROM request_limits WHERE expires<?').bind(now).run();
    const limit=await env.DB.prepare('INSERT INTO request_limits(bucket,count,expires) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket,now+86400).first();
    if(limit.count>10)return json({error:'Too many requests. Please try again tomorrow.'},429);
    const body=await readJSON(request),email=normalEmail(body.email);
    if(email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({error:'Enter a valid email address.'},400);
    if(!body.website)await env.DB.prepare("INSERT OR IGNORE INTO access_requests(email,status,requested) VALUES(?,'pending',?)").bind(email,new Date().toISOString()).run();
    return json({message:env.RESEND_API_KEY&&env.EMAIL_FROM?'Request received. We will email you if your access is approved.':'Request received. Access is reviewed manually. Email notifications are not connected yet; once approved, sign in with this email.'},202);
  }

  if(path==='/auth/login'&&request.method==='GET'){
    const state=random(),nonce=random(),verifier=random();
    const challenge=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(verifier))))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM login_attempts WHERE expires<?').bind(now),
      env.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(now),
      env.DB.prepare('INSERT INTO login_attempts(state_hash,verifier,nonce,expires) VALUES(?,?,?,?)').bind(await hash(state),verifier,nonce,now+600),
    ]);
    const target=new URL(issuer(env)+'/authorization');
    for(const [key,value]of Object.entries({response_type:'code',client_id:env.OIDC_CLIENT_ID,redirect_uri:env.ORIGIN+'/auth/callback',scope:'openid email',state,nonce,code_challenge:challenge,code_challenge_method:'S256'}))target.searchParams.set(key,value);
    return new Response(null,{status:302,headers:{Location:target.href,'Set-Cookie':cookie('__Host-keykeep-state',state,600)}});
  }
  if(path==='/auth/callback'&&request.method==='GET'){
    const state=url.searchParams.get('state'),code=url.searchParams.get('code');
    if(!state||!code||state!==cookies(request)['__Host-keykeep-state'])return json({error:'Sign-in expired. Start again.'},400);
    const flow=await env.DB.prepare('DELETE FROM login_attempts WHERE state_hash=? AND expires>? RETURNING verifier,nonce').bind(await hash(state),now).first();
    if(!flow)return json({error:'Sign-in expired or already used.'},400);
    const source=issuer(env);
    const response=await fetch(source+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:env.ORIGIN+'/auth/callback',client_id:env.OIDC_CLIENT_ID,client_secret:env.OIDC_CLIENT_SECRET,code_verifier:flow.verifier})});
    if(!response.ok)return json({error:'Sign-in could not be completed.'},401);
    const result=await response.json();
    if(!keys.has(source))keys.set(source,createRemoteJWKSet(new URL(source+'/jwks')));
    const {payload}=await jwtVerify(result.id_token,keys.get(source),{issuer:source,audience:env.OIDC_CLIENT_ID,algorithms:['RS256'],requiredClaims:['exp','iat','sub','nonce','email']});
    if(payload.nonce!==flow.nonce||payload.email_verified===false)return json({error:'This account could not be verified.'},403);
    if(!await admitted(payload.email,env))return redirect('/?access=pending');
    const token=random();
    await env.DB.prepare('INSERT INTO sessions(token_hash,subject,email,expires) VALUES(?,?,?,?)').bind(await hash(token),payload.sub,payload.email,now+28800).run();
    const headers=new Headers({Location:'/app', 'Cache-Control':'no-store'});
    headers.append('Set-Cookie',cookie('__Host-keykeep-session',token,28800));headers.append('Set-Cookie',cookie('__Host-keykeep-state','',0));
    return new Response(null,{status:302,headers});
  }
  const user=await sessionFor(request,env);
  if(!user)return path.startsWith('/api/')?json({error:'Sign in to access your vault.'},401):redirect('/');
  if(request.method!=='GET' && (request.headers.get('Origin')!==env.ORIGIN||request.headers.get('X-Keykeep-Request')!=='1'))return json({error:'Request origin rejected.'},403);
  if(path==='/api/session'&&request.method==='GET')return json({email:user.email,vaultId:await vaultIdentity(user.email,env),admin:allowedEmail(user.email,env),legacyOwner:allowedEmail(user.email,env)&&env.MIGRATE_LEGACY_OWNER!=='0'});
  if(path==='/api/logout'&&request.method==='POST'){
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(cookies(request)['__Host-keykeep-session'])).run();
    return new Response(null,{status:204,headers:{'Set-Cookie':cookie('__Host-keykeep-session','',0)}});
  }
  if(path==='/app'&&request.method==='GET')return env.ASSETS.fetch(new Request(new URL('/private/',url),request));
  const appAssets=['/app.js','/account.js','/login.js','/crypto.js','/model.js','/reconcile.js','/sync.js','/pwa.js'];
  if(appAssets.includes(path)&&request.method==='GET')return env.ASSETS.fetch(request);
  if(path==='/admin'||path==='/admin.js'||path==='/api/access-requests'){
    if(!allowedEmail(user.email,env))return json({error:'Owner access required.'},403);
    if(path==='/admin'&&request.method==='GET')return env.ASSETS.fetch(new Request(new URL('/manage/',url),request));
    if(path==='/admin.js'&&request.method==='GET')return env.ASSETS.fetch(request);
    if(path==='/api/access-requests'&&request.method==='GET'){
      const rows=await env.DB.prepare('SELECT email,status,requested,reviewed FROM access_requests ORDER BY requested DESC LIMIT 200').all();
      for(const row of rows.results){row.owner=allowedEmail(row.email,env);row.notification=await env.DB.prepare('SELECT state,detail,first_attempt FROM approval_emails WHERE email=? ORDER BY rowid DESC LIMIT 1').bind(row.email).first();}
      return json({requests:rows.results,emailConfigured:!!(env.RESEND_API_KEY&&env.EMAIL_FROM),testRecipients:(env.ALLOWED_EMAILS||env.ALLOWED_EMAIL).split(',').map(normalEmail)});
    }
    if(path==='/api/access-requests'&&request.method==='POST'){
      const body=await readJSON(request),email=normalEmail(body.email);
      if(body.test===true){
        if(!allowedEmail(email,env))return json({error:'Tests can only be sent to owner addresses.'},400);
        const payload=approvalMessage(email,env);payload.subject='[TEST] '+payload.subject;
        await env.DB.prepare('INSERT OR IGNORE INTO approval_emails(id,email,created,payload) VALUES(?,?,?,?)').bind(`owner-test/${email}`,email,new Date().toISOString(),JSON.stringify(payload)).run();
        return json({ok:true,notification:await sendApproval(env,email)});
      }
      if(allowedEmail(email,env)||!['approved','declined'].includes(body.status))return json({error:'Invalid decision.'},400);
      if(body.retry===true)return json({ok:true,notification:await sendApproval(env,email)});
      const result=await env.DB.prepare('UPDATE access_requests SET status=?,reviewed=?,reviewer=? WHERE email=?').bind(body.status,new Date().toISOString(),normalEmail(user.email),email).run();
      if(!result.meta.changes)return json({error:'Request not found.'},404);
      let notification=null;
      if(body.status==='approved'){try{notification=await sendApproval(env,email);}catch{notification={state:'pending',detail:'Approved. Email is pending; retry from this page.'};}}
      return json({ok:true,notification});
    }
    return json({error:'Method not allowed'},405);
  }
  if(path!=='/api/vault')return json({error:'Not found'},404);
  const owner=vaultOwner(user.email,env);
  // Reject stale tabs and pre-migration clients before reading or writing any vault.
  if(request.headers.get('X-Keykeep-Vault')!==await vaultIdentity(user.email,env))return json({error:'Account changed. Close Keykeep and sign in again.'},403);
  if(request.method==='GET'){
    const row=await env.DB.prepare('SELECT version,envelope,write_id,updated FROM vaults WHERE owner=?').bind(owner).first();
    return json(row?{version:row.version,envelope:JSON.parse(row.envelope),writeId:row.write_id,updated:row.updated}:{version:0,envelope:null});
  }
  if(request.method!=='PUT')return json({error:'Method not allowed'},405);
  if(request.headers.get('Content-Type')!=='application/json')return json({error:'Expected JSON'},415);
  // Read with a hard cap even when the caller omits Content-Length.
  const reader=request.body?.getReader();if(!reader)return json({error:'Missing body'},400);
  let size=0;const chunks=[];
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2100000){await reader.cancel();return json({error:'Vault too large'},413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const body=JSON.parse(new TextDecoder().decode(bytes));
  if(!Number.isSafeInteger(body.baseVersion)||body.baseVersion<0||!/^[-a-zA-Z0-9]{16,100}$/.test(body.writeId||''))return json({error:'Invalid version or write ID'},400);
  const envelope=JSON.stringify(wireEnvelope(body.envelope));
  const current=await env.DB.prepare('SELECT version,envelope,write_id FROM vaults WHERE owner=?').bind(owner).first();
  if(current?.write_id===body.writeId){
    return current.envelope===envelope?json({version:current.version,writeId:body.writeId}):json({error:'Write ID reused with different content'},409);
  }
  const updated=new Date().toISOString();let result;
  if(body.baseVersion===0)result=await env.DB.prepare('INSERT OR IGNORE INTO vaults(owner,version,envelope,write_id,updated) VALUES(?,1,?,?,?)').bind(owner,envelope,body.writeId,updated).run();
  else result=await env.DB.prepare('UPDATE vaults SET version=version+1,envelope=?,write_id=?,updated=? WHERE owner=? AND version=?').bind(envelope,body.writeId,updated,owner,body.baseVersion).run();
  if(result.meta.changes!==1)return json({error:'Another device changed the vault. Your local copy is preserved.'},409);
  return json({version:body.baseVersion+1,writeId:body.writeId});
}
export default {async fetch(request,env){
  let response;
  try{response=await handle(request,env);}catch{response=json({error:'Request could not be completed safely.'},400);}
  const headers=new Headers(response.headers);
  headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');
  headers.set('Cache-Control','private, no-store');
  return new Response(response.body,{status:response.status,headers});
}};

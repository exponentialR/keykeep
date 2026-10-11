import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {websiteOrigin,appAddress,checkedLogin,matchingLogins} from './login.js';
import {createHandoffs} from './extension/handoff.js';
import {readLoginForm} from './extension/capture.js';
const login={name:'Sample mail',username:'alex@example.com',password:' fictional secret ',website:'https://mail.example.com'};
test('login capture strips URL secrets, rejects unsafe destinations, and matches only active same-origin accounts',()=>{
  assert.equal(websiteOrigin('https://mail.example.com/login?token=secret#secret'),login.website);
  for(const url of ['http://example.com','javascript:alert(1)','https://user:pass@example.com'])assert.throws(()=>websiteOrigin(url));
  assert.equal(appAddress('https://vault.example.com'), 'https://vault.example.com/app');
  for(const url of ['https://vault.example.com/admin','https://vault.example.com/app?token=secret'])assert.throws(()=>appAddress(url));
  assert.deepEqual(checkedLogin({...login,extra:'discard'}),login);
  assert.throws(()=>checkedLogin({...login,password:'x'.repeat(4097)}));
  const entries=[{...login,id:'1'},{...login,id:'2',deletedAt:'date'},{...login,id:'3',website:'https://other.example.com'},{...login,id:'4',username:'other'}];
  assert.deepEqual(matchingLogins(entries,login).map(e=>e.id),['1']);
});
test('password handoffs are single-use, bound to the exact app tab/main frame and expire without persistence',()=>{
  let now=1000;const store=createHandoffs({now:()=>now});const app='https://vault.example.com/app';
  const nonce=store.stage(login,app);store.bind(nonce,10);
  const sender={frameId:0,tab:{id:10},url:app};
  for(const invalid of [{...sender,tab:{id:11}},{...sender,frameId:1},{...sender,url:'https://evil.example.com/app'},{...sender,url:'https://vault.example.com/admin'},{...sender,url:app+'?secret=1'}])assert.equal(store.claim(nonce,invalid),null);
  assert.deepEqual(store.claim(nonce,sender),{...login,expires:121000});assert.equal(store.claim(nonce,sender),null);
  const expired=store.stage(login,app);store.bind(expired,10);now+=120001;assert.equal(store.claim(expired,sender),null);
  const closed=store.stage(login,app);store.bind(closed,10);store.close(10);assert.equal(store.claim(closed,sender),null);
  const cleared=store.stage(login,app);store.bind(cleared,10);store.clear();assert.equal(store.claim(cleared,sender),null);
});
test('click capture selects visible filled password fields and nearby username, excluding OTP and empty/hidden fields',()=>{
  const input=(type,value,autocomplete='',hidden=false)=>({type,value,autocomplete,disabled:false,getClientRects:()=>hidden?[]:[{}],compareDocumentPosition:()=>4});
  const username=input('email','alex@example.com');
  const password=input('password','first secret'),confirmation=input('password','second secret','new-password');
  const fields=[username,password,confirmation,input('password',''),input('password','hidden','',true),input('password','otp','one-time-code')];
  const form={querySelectorAll:()=>fields};fields.forEach(field=>field.form=form);
  const previous=Object.fromEntries(['location','document','getComputedStyle','Node'].map(key=>[key,globalThis[key]]));
  Object.assign(globalThis,{location:{protocol:'https:',hostname:'mail.example.com',origin:login.website},document:{querySelectorAll:()=>fields.filter(f=>f.type==='password')},getComputedStyle:()=>({visibility:'visible'}),Node:{DOCUMENT_POSITION_FOLLOWING:4}});
  try {const result=readLoginForm();assert.equal(result.logins.length,2);assert.equal(result.logins[0].username,login.username);assert.equal(result.logins[0].password,'first secret');assert.match(result.logins[1].label,/new password/);globalThis.location.protocol='http:';assert.match(readLoginForm().error,/HTTPS/);}
  finally{for(const [key,value]of Object.entries(previous))if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
});
test('isolated bridge ignores other windows/nonces and hands off only to the ready trusted app',async()=>{
  const nonce=crypto.randomUUID(),origin='https://vault.example.com';const listeners=new Map(),sent=[];
  const window={top:null,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),postMessage:(data,target)=>sent.push({data,target})};window.top=window;
  let claims=0;
  const context={window,location:{pathname:'/app',hash:'#keykeep-save='+nonce,origin},chrome:{runtime:{sendMessage:async()=>{claims++;return {login:{...login,expires:Date.now()+120000}};}}},setTimeout:()=>{}};
  vm.runInNewContext(await readFile('extension/bridge.js','utf8'),context);
  const ready={source:window,origin,data:{type:'keykeep-ready',nonce}};
  await listeners.get('message')({...ready,source:{}});await listeners.get('message')({...ready,origin:'https://evil.example.com'});await listeners.get('message')({...ready,data:{type:'keykeep-ready',nonce:'other'}});assert.equal(claims,0);
  await listeners.get('message')(ready);assert.equal(claims,1);assert.equal(sent[0].target,origin);assert.equal(sent[0].data.login.password,login.password);assert.equal(listeners.has('message'),false);
});
test('real extension worker stores only app settings and rejects page-origin save requests',async()=>{
  let listener,registered,settings={},nextTab=20;
  const previousChrome=globalThis.chrome,previousInterval=globalThis.setInterval;
  globalThis.setInterval=()=>0;
  const popup='chrome-extension://fixture/popup.html';
  globalThis.chrome={runtime:{id:'fixture',getURL:path=>'chrome-extension://fixture/'+path,onMessage:{addListener:fn=>listener=fn}},permissions:{contains:async()=>true,remove:async()=>true,onRemoved:{addListener(){}}},storage:{local:{get:async()=>settings,set:async value=>{settings={...settings,...value};}}},scripting:{unregisterContentScripts:async()=>{},registerContentScripts:async scripts=>registered=scripts},tabs:{get:async()=>({url:login.website+'/login'}),create:async({url})=>({id:nextTab,url}),onRemoved:{addListener(){}}}};
  const send=(message,sender)=>new Promise(resolve=>listener(message,sender,resolve));
  const popupSender={id:'fixture',url:popup};
  try{
    await import('./extension/background.js');
    assert.match((await send({type:'configure',app:'https://vault.example.com/app'},{id:'fixture',url:'https://evil.example.com',tab:{id:2}})).error,/toolbar/);
    assert.deepEqual(await send({type:'configure',app:'https://vault.example.com/app'},popupSender),{ok:true});
    assert.deepEqual(registered[0].matches,['https://vault.example.com/*']);
    let createdURL;chrome.tabs.create=async({url})=>{createdURL=url;return {id:20,url};};
    assert.deepEqual(await send({type:'save-login',sourceTab:1,login},popupSender),{ok:true});
    assert.deepEqual(Object.keys(settings),['app']);assert.ok(!createdURL.includes(login.password));assert.ok(!createdURL.includes(login.username));
    const nonce=new URL(createdURL).hash.split('=')[1];
    assert.equal((await send({type:'claim-login',nonce},{id:'fixture',frameId:0,tab:{id:21},url:settings.app})).login,null);
    const reply=await send({type:'claim-login',nonce},{id:'fixture',frameId:0,tab:{id:20},url:settings.app});assert.equal(reply.login.password,login.password);
    assert.equal((await send({type:'claim-login',nonce},{id:'fixture',frameId:0,tab:{id:20},url:settings.app})).login,null);
    assert.match((await send({type:'save-login',sourceTab:1,login:{...login,website:'https://evil.example.com'}},popupSender)).error,/website changed/);
  }finally{globalThis.chrome=previousChrome;globalThis.setInterval=previousInterval;}
});

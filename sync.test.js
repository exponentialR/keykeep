import test from 'node:test';
import assert from 'node:assert/strict';
import {VaultSync,markChanged} from './sync.js';
const envelope=(byte=1)=>({version:1,salt:btoa('s'.repeat(16)),iv:btoa(String(byte).repeat(12)),data:btoa(String(byte).repeat(20))});
function setup(local,remote){
  const values=new Map(local?[['keykeep.v1',JSON.stringify(local)]]:[]);let server=structuredClone(remote),note,conflict=false;
  const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
  const request=async(path,options)=>{if(!options)return server;const body=JSON.parse(options.body);assert.deepEqual(Object.keys(body.envelope).sort(),['data','iv','salt','version']);assert.equal(body.baseVersion,server.version);server={version:server.version+1,envelope:body.envelope,writeId:body.writeId};return {version:server.version,writeId:server.writeId};};
  const engine=new VaultSync({storage,request,status:(text,value)=>{note=text;conflict=value;}});
  return {engine,storage,server:()=>server,conflict:()=>conflict,note:()=>note};
}
test('uploads ciphertext only and acknowledges a lost response safely',async()=>{
  const local=markChanged({...envelope(),index:[{name:'PRIVATE NAME'}]},null),t=setup(local,{version:0,envelope:null});
  await t.engine.run();assert.equal(t.server().version,1);assert.equal(t.engine.read().sync.dirty,false);
  t.storage.setItem('keykeep.v1',JSON.stringify(local));await t.engine.run();assert.equal(t.server().version,1);assert.equal(t.engine.read().sync.baseVersion,1);
});
test('conflict preserves local edits and explicit resolution saves encrypted recovery',async()=>{
  const local=markChanged(envelope(),{sync:{baseVersion:1}}),t=setup(local,{version:2,envelope:envelope(2)});
  await t.engine.run();assert.equal(t.conflict(),true);assert.deepEqual(t.engine.read(),local);
  await t.engine.useCloud();assert.deepEqual(JSON.parse(t.storage.getItem('keykeep.recoveries.v1'))[0].envelope,local);assert.equal(t.engine.read().sync.baseVersion,2);
});
test('new PC downloads encrypted vault; clean PC adopts a rotated key',async()=>{
  const t=setup(null,{version:1,envelope:envelope()});await t.engine.run();assert.equal(t.engine.read().sync.dirty,false);
  t.engine.request=async()=>({version:2,envelope:{...envelope(2),salt:btoa('z'.repeat(16))}});await t.engine.run();assert.equal(t.engine.read().salt,btoa('z'.repeat(16)));
});
test('network failures leave pending writes and their idempotency IDs unchanged',async()=>{
  const local=markChanged(envelope(),null),t=setup(local,{version:0,envelope:null});t.engine.request=async()=>{throw new Error('offline');};
  await assert.rejects(t.engine.run(),/offline/);assert.deepEqual(t.engine.read(),local);
});

test('cloud rollback or missing ciphertext never clears pending local state',async()=>{
  const local=markChanged(envelope(),{sync:{baseVersion:3}}),t=setup(local,{version:2,envelope:envelope()});
  await assert.rejects(t.engine.run(),/older/);assert.deepEqual(t.engine.read(),local);
  t.engine.request=async()=>({version:3,envelope:null});
  await assert.rejects(t.engine.run(),/Invalid cloud vault state/);assert.deepEqual(t.engine.read(),local);
});

test('combining saves both originals, uploads against the reviewed cloud version and rejects stale reviews',async()=>{
 const local=markChanged(envelope(),{sync:{baseVersion:1}}),t=setup(local,{version:2,envelope:envelope(2)});
 const snapshot=await t.engine.inspectConflict();await t.engine.combine(envelope(3),snapshot);
 const copies=JSON.parse(t.storage.getItem('keykeep.recoveries.v1'));assert.equal(copies.length,2);assert.deepEqual(copies[0].envelope,local);assert.deepEqual(copies[1].envelope,envelope(2));assert.equal(t.server().version,3);assert.equal(t.engine.read().sync.dirty,false);
 await assert.rejects(t.engine.combine(envelope(4),snapshot),/changed/);assert.equal(t.engine.read().sync.baseVersion,3);
});
test('recovery quota failure never replaces a vault and repeated recovery keeps earlier originals',async()=>{
 const local=markChanged(envelope(),{sync:{baseVersion:1}}),t=setup(local,{version:2,envelope:envelope(2)}),snapshot=await t.engine.inspectConflict();
 const originalSet=t.storage.setItem;t.storage.setItem=(key,value)=>{if(key==='keykeep.recoveries.v1')throw new Error('Quota exceeded');originalSet(key,value);};
 await assert.rejects(t.engine.combine(envelope(3),snapshot),/Quota/);assert.deepEqual(t.engine.read(),local);
 t.storage.setItem=originalSet;await t.engine.useCloud();t.storage.setItem('keykeep.v1',JSON.stringify(markChanged(envelope(4),null)));await t.engine.useCloud();
 const copies=JSON.parse(t.storage.getItem('keykeep.recoveries.v1'));assert.equal(copies.length,3);assert.deepEqual(copies[0].envelope,local);
});
test('failed combined upload retains the combined dirty copy and both encrypted originals',async()=>{
 const local=markChanged(envelope(),{sync:{baseVersion:1}}),t=setup(local,{version:2,envelope:envelope(2)}),snapshot=await t.engine.inspectConflict(),request=t.engine.request;
 t.engine.request=async(path,options)=>{if(options)throw new Error('offline');return request(path);};
 await assert.rejects(t.engine.combine(envelope(3),snapshot),/offline/);assert.equal(t.engine.read().sync.dirty,true);assert.equal(t.engine.read().sync.baseVersion,2);assert.equal(JSON.parse(t.storage.getItem('keykeep.recoveries.v1')).length,2);
 t.engine.request=request;await t.engine.run();assert.equal(t.engine.read().sync.dirty,false);
});

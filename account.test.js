import test from 'node:test';
import assert from 'node:assert/strict';
import {accountContext,scopedStorage} from './account.js';
test('browser accounts cannot read or change each others local vault, backup or recovery',()=>{
 const data=new Map(),base={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const owner=scopedStorage(base,'owner'),guest=scopedStorage(base,'guest');
 for(const key of ['keykeep.v1','keykeep.backup.v1','keykeep.recovery.v1']){owner.setItem(key,'owner copy');assert.equal(guest.getItem(key),null);guest.setItem(key,'guest copy');assert.equal(owner.getItem(key),'owner copy');guest.removeItem(key);assert.equal(owner.getItem(key),'owner copy');}
});
test('only owner accounts migrate legacy vaults, and migration never overwrites newer account data',async()=>{
 const data=new Map([['keykeep.v1','legacy ciphertext']]);
 globalThis.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 globalThis.location={protocol:'https:',replace(){throw new Error('unexpected redirect');}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(name,fn)=>fn()}}});
 let identity={vaultId:'a'.repeat(64),legacyOwner:false};globalThis.fetch=async()=>({ok:true,json:async()=>identity});
 const guest=await accountContext();assert.equal(guest.storage.getItem('keykeep.v1'),null);
 identity={vaultId:'b'.repeat(64),legacyOwner:true};const owner=await accountContext();assert.equal(owner.storage.getItem('keykeep.v1'),'legacy ciphertext');
 owner.storage.setItem('keykeep.v1','newer ciphertext');assert.equal((await accountContext()).storage.getItem('keykeep.v1'),'newer ciphertext');assert.equal(data.get('keykeep.v1'),'legacy ciphertext');
 // A deliberate owner reset must not import any old browser or recovery copy.
 owner.storage.setItem('keykeep.recoveries.v1','old recovery');
 identity={vaultId:'c'.repeat(64),admin:true,legacyOwner:false};const fresh=await accountContext();
 assert.equal(fresh.storage.getItem('keykeep.v1'),null);assert.equal(fresh.storage.getItem('keykeep.recoveries.v1'),null);
 assert.equal(owner.storage.getItem('keykeep.v1'),'newer ciphertext');assert.equal(owner.storage.getItem('keykeep.recoveries.v1'),'old recovery');
});

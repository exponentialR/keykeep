import test from 'node:test';
import assert from 'node:assert/strict';
import {generate,derive,encrypt,unlock,validate} from './crypto.js';
test('generator honours length and every selected group',()=>{for(let i=0;i<100;i++){const p=generate(20,{lower:true,upper:true,numbers:true,symbols:true});assert.equal(p.length,20);for(const r of [/[a-z]/,/[A-Z]/,/[0-9]/,/[^a-zA-Z0-9]/])assert.match(p,r);}});
test('generator respects exclusions and rejects unusable settings',()=>{assert.match(generate(64,{numbers:true},true),/^[2-9]{64}$/);assert.throws(()=>generate(20,{}));assert.throws(()=>generate(7,{lower:true}));});
test('vault round trip; incorrect password and tampering fail',async()=>{const salt=crypto.getRandomValues(new Uint8Array(16)),key=await derive('a test master password',salt),entries=[{id:'1',name:'Example',username:'user',password:'secret'}];const encrypted=await encrypt(entries,key,salt);assert.ok(!JSON.stringify(encrypted).includes('secret'));assert.deepEqual((await unlock(encrypted,'a test master password')).entries,entries);await assert.rejects(unlock(encrypted,'incorrect password'));const changed={...encrypted,data:(encrypted.data[0]==='A'?'B':'A')+encrypted.data.slice(1)};await assert.rejects(unlock(changed,'a test master password'));assert.notEqual((await encrypt(entries,key,salt)).iv,encrypted.iv);});
test('invalid vault envelopes are rejected',()=>{assert.throws(()=>validate({version:2}));assert.throws(()=>validate({version:1,salt:'',iv:'',data:''}));});
test('large vault encryption does not overflow the JS call stack',async()=>{
  const salt=crypto.getRandomValues(new Uint8Array(16)),key=await derive('a test master password',salt);
  const entries=[{id:'large',name:'Example',username:'user',password:'x'.repeat(180000)}];
  const encrypted=await encrypt(entries,key,salt);assert.deepEqual((await unlock(encrypted,'a test master password')).entries,entries);
});
test('malformed encrypted history is rejected on unlock',async()=>{
  const salt=crypto.getRandomValues(new Uint8Array(16)),key=await derive('a test master password',salt);
  const encrypted=await encrypt([{id:'1',name:'Example',username:'user',password:'secret',history:[{password:42}]}],key,salt);
  await assert.rejects(unlock(encrypted,'a test master password'),/Invalid vault contents/);
});

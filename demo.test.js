import test from 'node:test';
import assert from 'node:assert/strict';
import {demoContext,DEMO_PASSWORD} from './demo.js';
import {unlock} from './crypto.js';
test('demo uses fresh memory-only sample vaults and never changes real browser storage',async()=>{
 const previous=globalThis.localStorage;globalThis.localStorage={getItem(){throw new Error('Real storage must not be read');},setItem(){throw new Error('Real storage must not be written');}};
 try{const first=await demoContext(),second=await demoContext();assert.equal(first.demo,true);const data=JSON.parse(first.storage.getItem('keykeep.v1')),opened=await unlock(data,DEMO_PASSWORD);assert.equal(opened.entries.length,3);assert.ok(opened.entries.every(entry=>entry.password.startsWith('SampleOnly!')));first.storage.setItem('keykeep.v1','changed');assert.notEqual(second.storage.getItem('keykeep.v1'),'changed');}
 finally{globalThis.localStorage=previous;}
});

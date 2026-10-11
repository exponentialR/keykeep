import test from 'node:test';
import assert from 'node:assert/strict';
import {editEntry,restoreVersion} from './model.js';
test('history is bounded, excludes nested history and supports reversible restoration',()=>{
  let entry={id:'1',name:'Mail',username:'u',password:'original',createdAt:'2026-10-01T10:00:00Z'};
  assert.equal(editEntry(entry,{name:'Mail',username:'u',password:'original'}),entry);
  for(let i=0;i<25;i++) entry=editEntry(entry,{name:'Mail',username:'u',password:`password-${i}`});
  assert.equal(entry.history.length,20);assert.equal(entry.history[0].password,'password-23');
  assert.ok(entry.history.every(h=>!h.history));
  const restored=restoreVersion(entry,0);assert.equal(restored.password,'password-23');assert.equal(restored.history[0].password,'password-24');
  assert.equal(restored.createdAt,entry.createdAt);assert.throws(()=>restoreVersion(entry,50));
});
test('website edits are encrypted history changes and old revisions restore without a website',()=>{
  const original={id:'1',name:'Mail',username:'u',password:'secret'};
  const updated=editEntry(original,{name:'Mail',username:'u',password:'secret',website:'https://mail.example.com'});
  assert.equal(updated.website,'https://mail.example.com');assert.equal(updated.history[0].website,'');
  assert.equal(editEntry(updated,{name:'Mail',username:'u',password:'secret'}),updated);
  const restored=restoreVersion(updated,0);assert.equal(restored.website,'');assert.equal(restored.history[0].website,'https://mail.example.com');
});

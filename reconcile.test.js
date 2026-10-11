import test from 'node:test';
import assert from 'node:assert/strict';
import {compareVaults,combineVaults} from './reconcile.js';
const entry=(id,name='Account',password='synthetic',extra={})=>({id,name,username:'',password,createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z',...extra});
test('combining disjoint changes preserves entries, deletion tombstones and history from both vaults',()=>{
 const left=[entry('shared'),entry('local'),entry('deleted','Old','synthetic',{deletedAt:'2026-10-02T00:00:00Z'})];
 const right=[entry('shared'),entry('cloud','Cloud','other',{history:[{name:'Previous',username:'',password:'older',updatedAt:null,archivedAt:'2026-10-03T00:00:00Z'}]})];
 const result=combineVaults(compareVaults(left,right));assert.equal(result.length,4);assert.deepEqual(result.find(e=>e.id==='deleted'),left[2]);assert.deepEqual(result.find(e=>e.id==='cloud'),right[1]);
 result[0].password='changed';assert.equal(left[0].password,'synthetic');
});
test('concurrent changes to one identity require a decision; keeping both never drops a version',()=>{
 const left=entry('shared','This device'),right=entry('shared','Cloud','other',{deletedAt:'2026-10-02T00:00:00Z'}),rows=compareVaults([left],[right]);
 assert.equal(rows[0].state,'conflict');assert.throws(()=>combineVaults(rows),/Choose/);
 assert.deepEqual(combineVaults(rows,{shared:'local'}),[left]);assert.deepEqual(combineVaults(rows,{shared:'cloud'}),[right]);
 const both=combineVaults(rows,{shared:'both'},()=> 'preserved-cloud');assert.equal(both.length,2);assert.equal(both[0].id,'shared');assert.equal(both[1].id,'preserved-cloud');assert.equal(both[1].password,'other');assert.equal(both[1].deletedAt,right.deletedAt);
 assert.throws(()=>combineVaults(rows,{shared:'both'},()=> 'shared'),/Duplicate/);
});

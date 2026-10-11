import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {unlock} from './crypto.js';
class Element {
  value=''; hidden=false; checked=true; children=[]; type='password';
  append(...children){this.children.push(...children);} replaceChildren(){this.children=[];}
  click(){}
  setAttribute(){} addEventListener(){} focus(){} scrollIntoView(){} reset(){}
}
test('generate → named save → locked names → master password → plain passwords; edit and legacy migration',async()=>{
  const html=await readFile(new URL('./index.html',import.meta.url),'utf8');
  const elements=Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
  elements.length.value='20';elements.ambiguous.checked=false;
  globalThis.document={getElementById:id=>{assert.ok(elements[id],`missing element ${id}`);return elements[id];},createElement:()=>new Element(),addEventListener(){}};
  globalThis.window={addEventListener(){}};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(name,fn)=>fn()}}});
  const stored=new Map();globalThis.localStorage={getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)};
  await import('./app.js');
  const submit=id=>elements[id].onsubmit({preventDefault(){}});
  const master='synthetic test master';
  try {
    const generated=elements.generated.value;
    elements['new-name'].value='Test email';
    elements['save-master'].value=master;elements['save-confirm'].value='mismatch';
    await submit('generator-save-form');assert.equal(stored.size,0);assert.match(elements.message.textContent,/do not match/);
    elements['save-confirm'].value=master;
    await submit('generator-save-form');
    let row=elements.entries.children[0];assert.equal(row.children[0].children[0].textContent,'Test email');
    assert.equal(row.children[0].children[3].value,generated);assert.equal(row.children[0].children[3].type,'text');
    assert.ok(!row.children[0].children[2].textContent.includes('Not recorded'));
    let envelope=JSON.parse(stored.get('keykeep.v1'));
    assert.deepEqual(Object.keys(envelope.index[0]).sort(),['createdAt','id','name','updatedAt']);
    assert.ok(!stored.get('keykeep.v1').includes(generated));
    const createdAt=(await unlock(envelope,master)).entries[0].createdAt;
    elements.lock.onclick();
    row=elements.entries.children[0];assert.equal(row.children[0].children[0].textContent,'Test email');assert.equal(row.children[0].children.length,3);
    elements.master.value='wrong';await submit('unlock-form');assert.equal(elements.unlocked.hidden,true);assert.equal(elements.entries.children[0].children[0].children.length,3);
    elements.master.value=master;await submit('unlock-form');
    row=elements.entries.children[0];assert.equal(row.children[0].children[3].value,generated);assert.equal(row.children[0].children[3].type,'text');
    row.children[1].children[1].onclick();
    elements.name.value='Updated email';elements['saved-password'].value='synthetic-second';await submit('save-form');
    assert.equal(elements['save-form'].hidden,true);
    envelope=JSON.parse(stored.get('keykeep.v1'));assert.equal(envelope.index[0].name,'Updated email');
    assert.equal((await unlock(envelope,master)).entries[0].createdAt,createdAt);
    elements.lock.onclick();elements['new-name'].value='Second entry';elements['save-master'].value=master;
    await submit('generator-save-form');assert.equal(elements['entry-count'].textContent,'(2)');
    elements.lock.onclick();elements.search.value='Updated';elements.search.oninput();assert.equal(elements.entries.children.length,1);
    elements.search.value='';
    // Backups made before public names existed still open and acquire an index after authentication.
    envelope=JSON.parse(stored.get('keykeep.v1'));delete envelope.index;stored.set('keykeep.v1',JSON.stringify(envelope));
    elements.lock.onclick();assert.match(elements.entries.children[0].textContent,/Unlock once/);
    elements.master.value=master;await submit('unlock-form');
    assert.equal(JSON.parse(stored.get('keykeep.v1')).index.length,2);
    assert.equal(elements.entries.children[0].children[0].children[3].value,'synthetic-second');
    // Save an existing password exactly, including whitespace, without changing the generator.
    elements['existing-mode'].onclick();
    assert.equal(elements['generation-controls'].hidden,true);
    elements['new-name'].value='Existing account';elements['existing-password'].value='  existing-secret  ';
    await submit('generator-save-form');
    assert.equal(elements['existing-password'].value,'');
    let decrypted=await unlock(JSON.parse(stored.get('keykeep.v1')),master);
    assert.equal(decrypted.entries[2].password,'  existing-secret  ');
    assert.notEqual(elements.generated.value,generated);
    assert.match(elements['backup-status'].textContent,/No backup/);
    elements.export.onclick();
    assert.match(elements['backup-status'].textContent,/No changes since/);
    // Deletion is encrypted, removed from the public name index, and reversible after locking.
    await elements.entries.children[2].children[1].children[2].onclick();
    assert.equal(elements['entry-count'].textContent,'(2)');
    assert.equal(elements['undo-delete'].hidden,false);
    assert.match(elements['backup-status'].textContent,/changes to back up/);
    envelope=JSON.parse(stored.get('keykeep.v1'));
    assert.ok(!envelope.index.some(e=>e.name==='Existing account'));
    assert.ok(!stored.get('keykeep.v1').includes('existing-secret'));
    decrypted=await unlock(envelope,master);assert.ok(decrypted.entries[2].deletedAt);
    await elements['undo-delete'].onclick();assert.equal(elements['entry-count'].textContent,'(3)');
    await elements.entries.children[2].children[1].children[2].onclick();
    elements.lock.onclick();assert.equal(elements['deleted-entries'].children.length,0);
    elements.master.value=master;await submit('unlock-form');
    assert.equal(elements['deleted-entries'].children.length,1);
    await elements['deleted-entries'].children[0].children[1].onclick();
    assert.equal(elements['entry-count'].textContent,'(3)');
    assert.equal(elements.entries.children[2].children[0].children[3].value,'  existing-secret  ');
    // Unlocking only refreshes the index; it must not mark an exported vault as changed.
    elements.export.onclick();elements.lock.onclick();elements.master.value=master;await submit('unlock-form');
    assert.match(elements['backup-status'].textContent,/No changes since/);
    // Restore resets this browser's export receipt.
    const backup=stored.get('keykeep.v1');globalThis.confirm=()=>true;
    await elements.import.onchange({target:{files:[{size:backup.length,text:async()=>backup}],value:'backup'}});
    elements['import-master'].value='incorrect';await submit('import-form');
    assert.match(elements.message.textContent,/could not be verified/);
    assert.equal(stored.get('keykeep.v1'),backup);
    elements['import-master'].value=master;await submit('import-form');
    assert.match(elements['backup-status'].textContent,/No backup/);
    elements.master.value=master;await submit('unlock-form');
    // Presets keep manual controls and output consistent.
    elements.preset.value='strong';elements.preset.onchange();assert.equal(elements.generated.value.length,32);
    elements.preset.value='readable';elements.preset.onchange();assert.match(elements.generated.value,/^[a-zA-Z2-9]{24}$/);assert.doesNotMatch(elements.generated.value,/[il1Lo0O]/);
    // History survives reload and restoring a revision keeps the version it replaced.
    elements.entries.children[0].children[1].children[3].onclick();
    assert.equal(elements['history-section'].hidden,false);
    assert.equal(elements['history-entries'].children[0].children[0].children[1].value,generated);
    await elements['history-entries'].children[0].children[1].onclick();
    assert.equal(elements.entries.children[0].children[0].children[3].value,generated);
    assert.equal(elements['history-entries'].children[0].children[0].children[1].value,'synthetic-second');
    const oldBackup=stored.get('keykeep.v1');
    elements['current-master'].value='incorrect';elements['new-master'].value=elements['new-master-confirm'].value='replacement master password';
    await submit('change-master-form');assert.equal(stored.get('keykeep.v1'),oldBackup);
    elements['current-master'].value=master;await submit('change-master-form');
    assert.equal(elements.unlocked.hidden,true);assert.equal(elements['history-entries'].children.length,0);
    assert.equal(elements['new-master'].value,'');
    await assert.rejects(unlock(JSON.parse(stored.get('keykeep.v1')),master));
    assert.equal((await unlock(JSON.parse(oldBackup),master)).entries.length,3);
    elements.master.value='replacement master password';await submit('unlock-form');
    assert.equal(elements['entry-count'].textContent,'(3)');
    assert.equal((await unlock(JSON.parse(stored.get('keykeep.v1')),'replacement master password')).entries[0].history[0].password,'synthetic-second');
    // A stale session must not overwrite another tab, even before its storage event arrives.
    const other={...JSON.parse(stored.get('keykeep.v1')),index:[]};stored.set('keykeep.v1',JSON.stringify(other));
    elements['new-name'].value='Stale write';elements['existing-password'].value='must not save';
    await submit('generator-save-form');assert.match(elements.message.textContent,/another window/);
    assert.equal(stored.get('keykeep.v1'),JSON.stringify(other));
  }finally{elements.lock.onclick();}
});

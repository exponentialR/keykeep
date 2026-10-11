import {generate,derive,encrypt,unlock,validate,rekey} from './crypto.js';
import {presets,editEntry,restoreVersion} from './model.js';
import {markChanged,startCloudSync} from './sync.js?v=access1';
import {accountContext} from './account.js?v=access1';
import {compareVaults,combineVaults} from './reconcile.js';
import {websiteOrigin,checkedLogin,matchingLogins,captureNonce} from './login.js';
const browserNonce=captureNonce(globalThis.location?.hash);
if(browserNonce)history.replaceState(null,'',location.pathname+location.search);
const account=await accountContext();
const localStorage=account.storage;
let cloud;
const $ = id => document.getElementById(id);
const storage = 'keykeep.v1', backupStorage = 'keykeep.backup.v1';
let session = null, timer, revision = 0, busy = false, editingId = null, existingMode = false, undoId = null, historyId = null, pendingImport = null;
let mergePreview=null, browserLogin=null, browserTimer, bridgeTimer, browserChoice='';
const message = text => { $('message').textContent = text; };
const blob = () => JSON.parse(localStorage.getItem(storage) || 'null');
const indexFor = entries => entries.filter(e => !e.deletedAt).map(({id,name,createdAt,updatedAt}) => ({id,name,createdAt,updatedAt}));
function publicEntries() {
  const index = blob()?.index;
  return Array.isArray(index) ? index.filter(e => e && typeof e.id === 'string' && typeof e.name === 'string') : [];
}
function backupUI() {
  const vault = blob();
  let receipt;
  try { receipt = JSON.parse(localStorage.getItem(backupStorage) || 'null'); } catch { receipt = null; }
  $('backup-status').textContent = !vault ? 'Save a password to create your vault.'
    : !receipt ? 'No backup downloaded yet. Export a backup to keep a separate copy.'
    : `Last backup download requested: ${timestamp(receipt.exportedAt)}. ${receipt.iv === vault.iv && receipt.salt === vault.salt ? 'No changes since that export.' : 'You have changes to back up.'} Check that the downloaded file was saved.`;
}
function authUI() {
  const exists = !!localStorage.getItem(storage);
  $('unlock-form').hidden = !!session || !exists;
  $('unlocked').hidden = !session;
  $('security-settings').hidden = !session;
  $('save-auth').hidden = !!session;
  $('save-confirm-wrap').hidden = exists;
  $('save-master').required = !session;
  $('save-master').minLength = exists ? 1 : 12;
  $('save-master').autocomplete = exists ? 'current-password' : 'new-password';
  $('save-confirm').required = !exists && !session;
  $('save-auth-note').textContent = account.demo?'Demo master password: keykeep-demo-only. Use sample passwords here.':exists
    ? 'Enter your master password to save securely.'
    : 'Choose a master password (at least 12 characters) for your first save. You will use it to open your saved passwords. It cannot be recovered.';
  browserLoginChoices();
  $('vault-status').textContent = session ? 'UNLOCKED' : 'LOCKED';
  $('vault-description').textContent = account.demo?'Unlock the sample vault with keykeep-demo-only.':'Enter your master password to display the passwords below.';
}
function resetEditor() {
  editingId = null;
  $('save-form').reset();
  for (const id of ['name','username','website','saved-password']) $(id).value = '';
  $('save-form').hidden = true;
}
function lock() {
  revision++;
  session = null;
  mergePreview=null;$('merge-preview').hidden=true;$('merge-entries').replaceChildren();
  clearTimeout(timer);
  for (const id of ['master','save-master','save-confirm','existing-password','current-master','new-master','new-master-confirm','import-master','merge-master','merge-cloud-master']) $(id).value = '';
  $('existing-password').type = 'password'; $('show-existing').textContent = 'Show password';
  undoId = null; historyId = null;
  $('history-entries').replaceChildren(); $('history-section').hidden = true;
  resetEditor();
  regenerate(); // Do not leave a just-saved password visible in the generator after locking.
  authUI();
  clearBrowserLogin();
  render();
}
function touch() {
  if (session) {
    clearTimeout(timer);
    timer = setTimeout(() => { lock(); message('Vault locked after inactivity.'); }, 300000);
  }
}
for (const event of ['pointerdown','keydown']) document.addEventListener(event,touch);
window.addEventListener('pagehide',lock);
window.addEventListener('storage',e => {
  if (e.key === backupStorage) { backupUI(); return; }
  if (e.key === (localStorage.key?.(storage)||storage) || e.key === null) { lock(); message('Vault changed in another tab. Unlock again to continue.'); }
});
function regenerate() {
  try {
    const selected = Object.fromEntries(['lower','upper','numbers','symbols'].map(k => [k,$(k).checked]));
    const length = Number($('length').value);
    $('generated').value = generate(length,selected,$('ambiguous').checked);
    $('length-display').textContent = `${length} characters`;
    $('strength').textContent = length >= 20 ? 'Very strong length' : length >= 16 ? 'Strong length' : length >= 12 ? 'Moderate length' : 'Short — increase length';
    message('');
  } catch (e) { $('generated').value = ''; message(e.message); }
}
async function copy(value) {
  try { await navigator.clipboard.writeText(value); message('Copied. Your clipboard now contains the password.'); }
  catch { message('Clipboard unavailable. Select the password and copy it manually.'); }
}
async function openVault(password,confirmation) {
  const previous = localStorage.getItem(storage), existing = previous ? JSON.parse(previous) : null, token = revision;
  let opened;
  if (existing) {
    try { opened = await unlock(existing,password); }
    catch { throw new Error('Could not unlock. Check your master password or vault backup.'); }
  } else {
    if (password.length < 12) throw new Error('Use at least 12 characters for your master password.');
    if (password !== confirmation) throw new Error('Master passwords do not match.');
    const salt = crypto.getRandomValues(new Uint8Array(16)), key = await derive(password,salt);
    opened = {key,salt,entries:[]};
  }
  if (revision !== token || localStorage.getItem(storage) !== previous) throw new Error('Vault changed. Please try again.');
  // Index is display-only: always rebuild it from authenticated, decrypted entries.
  if (existing) {
    const indexed = JSON.stringify({...existing,index:indexFor(opened.entries)});
    if (indexed !== previous) localStorage.setItem(storage,indexed);
  }
  session = {...opened,stored:localStorage.getItem(storage)};
  for (const id of ['master','save-master','save-confirm']) $(id).value = '';
  authUI(); render(); touch();
}
async function persist(entries) {
  const current = session, token = revision, previous = localStorage.getItem(storage);
  if (!current) throw new Error('Unlock the vault first.');
  if (current.stored !== previous) throw new Error('Vault changed in another window. Lock and unlock before retrying.');
  const encrypted = await encrypt(entries,current.key,current.salt);
  if (session !== current || revision !== token) throw new Error('Vault locked. Unlock and try again.');
  if (localStorage.getItem(storage) !== previous) throw new Error('Vault changed. Lock and unlock before retrying.');
  localStorage.setItem(storage,JSON.stringify(markChanged({...encrypted,index:indexFor(entries)},previous?JSON.parse(previous):null)));
  cloud?.schedule();
  session.stored = localStorage.getItem(storage);
  session.entries = entries;
  authUI(); render();
}
async function action(fn) {
  if (busy) return;
  busy = true;
  try {
    if (!globalThis.navigator?.locks) throw new Error('This browser cannot safely coordinate vault changes. Use a current browser with Web Locks support.');
    await navigator.locks.request('keykeep-vault-write',fn);
  } catch (e) { message(e.message); } finally { busy = false; }
}
function view(vault) {
  $('generator-view').hidden = vault;
  $('vault-view').hidden = !vault;
  $('generator-tab').setAttribute('aria-current',vault ? 'false' : 'page');
  $('vault-tab').setAttribute('aria-current',vault ? 'page' : 'false');
}
function timestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}) : 'Not recorded';
}
function render() {
  const container = $('entries'); container.replaceChildren();
  backupUI();
  renderDeleted();
  renderHistory();
  const all = session ? session.entries.filter(e => !e.deletedAt) : publicEntries();
  $('entry-count').textContent = !session&&blob()&&!Array.isArray(blob().index)?'(unlock to view)':`(${all.length})`;
  const query = $('search').value.toLowerCase();
  const entries = all.filter(e => `${e.name} ${e.username || ''} ${e.website || ''}`.toLowerCase().includes(query));
  if (!entries.length) {
    const p = document.createElement('p'); p.className = 'note';
    p.textContent = query ? 'No matching passwords.' : !session && blob() && !Array.isArray(blob().index)
      ? 'Unlock once to make the names of your existing passwords visible here.'
      : 'No saved passwords yet. Generate and save your first password.';
    container.append(p);
  }
  for (const entry of entries) {
    const row = document.createElement('article'); row.className = 'entry';
    const detail = document.createElement('div'), name = document.createElement('strong'); name.textContent = entry.name;
    const user = document.createElement('p'); user.textContent = session ? entry.username || 'No username' : 'Password locked';
    const dates = document.createElement('p'); dates.textContent = `Created: ${timestamp(entry.createdAt)} · Updated: ${timestamp(entry.updatedAt)}`;
    detail.append(name,user,dates);
    if(session && entry.website){const website=document.createElement('p');website.textContent=entry.website;detail.append(website);}
    const actions = document.createElement('div'); actions.className = 'entry-actions';
    const button = (label,fn) => { const el = document.createElement('button'); el.textContent = label; el.onclick = fn; actions.append(el); };
    if (session) {
      const secret = document.createElement('input'); secret.type = 'text'; secret.readOnly = true; secret.value = entry.password;
      secret.setAttribute('aria-label',`Password for ${entry.name}`); detail.append(secret);
      button('Copy',() => copy(entry.password));
      button('Edit',() => {
        editingId = entry.id; $('save-form').hidden = false;
        $('name').value = entry.name; $('username').value = entry.username; $('website').value=entry.website || ''; $('saved-password').value = entry.password;
        $('name').focus(); $('save-form').scrollIntoView({behavior:'smooth',block:'start'});
      });
      button('Delete',() => action(async () => {
        await persist(session.entries.map(e => e.id === entry.id ? {...e,deletedAt:new Date().toISOString()} : e));
        if (editingId === entry.id) resetEditor();
        undoId = entry.id;
        $('undo-delete').hidden = false;
        message('Password moved to Recently deleted. You can undo or restore it later.');
      }));
      button('History',() => { historyId = entry.id; renderHistory(); $('history-section').scrollIntoView({behavior:'smooth',block:'start'}); });
    } else button('Unlock',() => { $('master').focus(); $('unlock-form').scrollIntoView({behavior:'smooth',block:'start'}); });
    row.append(detail,actions); container.append(row);
  }
}
function renderDeleted() {
  const container = $('deleted-entries'); container.replaceChildren();
  const deleted = session ? session.entries.filter(e => e.deletedAt) : [];
  $('deleted-section').hidden = !deleted.length;
  $('undo-delete').hidden = !session || !undoId || !deleted.some(e => e.id === undoId);
  for (const entry of deleted) {
    const row = document.createElement('article'); row.className = 'entry';
    const label = document.createElement('span'); label.textContent = `${entry.name} · Deleted ${timestamp(entry.deletedAt)}`;
    const restore = document.createElement('button'); restore.textContent = 'Restore';
    restore.onclick = () => action(() => restoreEntry(entry.id));
    row.append(label,restore); container.append(row);
  }
}
async function restoreEntry(id) {
  if (!session) throw new Error('Unlock the vault to restore a password.');
  if (!session.entries.some(e => e.id === id && e.deletedAt)) throw new Error('This password is no longer in Recently deleted.');
  await persist(session.entries.map(e => {
    if (e.id !== id) return e;
    const restored = {...e}; delete restored.deletedAt; return restored;
  }));
  if (undoId === id) undoId = null;
  renderDeleted(); message('Password restored.');
}
function passwordMode(existing) {
  existingMode = existing;
  $('generation-controls').hidden = existing;
  $('existing-input').hidden = !existing;
  $('generation-note').hidden = existing;
  $('generate-mode').setAttribute('aria-pressed',String(!existing));
  $('existing-mode').setAttribute('aria-pressed',String(existing));
  if (existing) $('existing-password').focus();
}
$('generate-mode').onclick = () => passwordMode(false);
$('existing-mode').onclick = () => passwordMode(true);
$('show-existing').onclick = () => {
  const show = $('existing-password').type === 'password';
  $('existing-password').type = show ? 'text' : 'password';
  $('show-existing').textContent = show ? 'Hide password' : 'Show password';
};
$('undo-delete').onclick = () => action(() => restoreEntry(undoId));
$('generator-tab').onclick = () => view(false);
$('vault-tab').onclick = () => view(true);
$('search').oninput = render;
$('generate').onclick = regenerate;
for (const id of ['length','lower','upper','numbers','symbols','ambiguous']) $(id).addEventListener('input',regenerate);
$('copy').onclick = () => { if ($('generated').value) copy($('generated').value); };
$('lock').onclick = () => { lock(); message('Vault locked.'); };
$('cancel-edit').onclick = resetEditor;
$('generator-save-form').onsubmit = e => {
  e.preventDefault();
  return action(async () => {
    const name = $('new-name').value.trim(), password = existingMode ? $('existing-password').value : $('generated').value;
    if (!name || !password) throw new Error('Enter or generate a password and give it a name.');
    if (!session) await openVault($('save-master').value,$('save-confirm').value);
    const website=websiteOrigin($('new-website').value.trim()),username=$('new-username').value.trim();
    const now = new Date().toISOString();
    if(browserLogin){
      checkedLogin({name,username,website,password});
      if(browserLogin.expires <= Date.now()){clearBrowserLogin();throw new Error('Browser login expired. Read it again with the extension.');}
      const choices=matchingLogins(session.entries,{website,username}),choice=browserChoice;
      if(choices.length && !choice)throw new Error('A login already matches this website and account. Choose whether to update it or save a new login.');
      if(choice && choice !== 'new'){
        const existing=choices.find(entry=>entry.id===choice);if(!existing)throw new Error('The matching login changed. Review it again.');
        const updated=editEntry(existing,{name,username,website,password});
        await persist(session.entries.map(entry=>entry.id===existing.id?updated:entry));
      }else await persist([...session.entries,{id:crypto.randomUUID(),name,username,website,password,createdAt:now,updatedAt:now}]);
      clearBrowserLogin();
    }else await persist([...session.entries,{id:crypto.randomUUID(),name,username,website,password,createdAt:now,updatedAt:now}]);
    $('new-username').value='';$('new-website').value='';
    $('new-name').value = '';
    $('existing-password').value = '';
    $('existing-password').type = 'password'; $('show-existing').textContent = 'Show password';
    message(cloud?'Saved on this device. Cloud status is shown above.':'Password saved. Open Saved passwords to see it.');
  });
};
$('unlock-form').onsubmit = e => {
  e.preventDefault();
  return action(async () => { await openVault($('master').value); message('Vault unlocked. Your passwords are now visible.'); });
};
$('save-form').onsubmit = e => {
  e.preventDefault();
  return action(async () => {
    if (!session) throw new Error('Unlock the vault first.');
    const name = $('name').value.trim(), password = $('saved-password').value, username = $('username').value.trim();
    if (!name || !password) throw new Error('Enter a name and password.');
    const existing = session.entries.find(e => e.id === editingId);
    if (!existing) throw new Error('This entry no longer exists.');
    const entry = editEntry(existing,{name,username,password,website:websiteOrigin($('website').value.trim())});
    await persist(session.entries.map(e => e.id === entry.id ? entry : e));
    resetEditor(); message('Password updated.');
  });
};
$('export').onclick = () => {
  try {
    const value = blob(); if (!value) return message('Save a password first.');
    const url = URL.createObjectURL(new Blob([JSON.stringify(value)],{type:'application/json'})), a = document.createElement('a');
    a.href = url; a.download = `keykeep-${new Date().toISOString().replace(/[:.]/g,'-')}.vault.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
    localStorage.setItem(backupStorage,JSON.stringify({iv:value.iv,salt:value.salt,exportedAt:new Date().toISOString()}));
    backupUI();
    message('Backup download requested. Check that the file was saved. Passwords are encrypted; names and dates are visible.');
  } catch { message('Could not export the vault.'); }
};
$('restore-backup').onclick=()=>$('import').click();
$('import').onchange = e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  return action(async () => {
    if (file.size > 2100000) throw new Error('Backup file is too large.');
    pendingImport = validate(JSON.parse(await file.text()));
    $('import-form').hidden = false; $('import-master').focus();
    message('Enter this backup’s master password to verify it before restoring.');
  });
};
$('cancel-import').onclick = () => { pendingImport = null; $('import-master').value = ''; $('import-form').hidden = true; };
$('import-form').onsubmit = e => {
  e.preventDefault();
  return action(async () => {
    if (!pendingImport) throw new Error('Choose a backup first.');
    const candidate = pendingImport, previous = localStorage.getItem(storage), token = revision;
    let opened;
    try { opened = await unlock(candidate,$('import-master').value); }
    catch { throw new Error('Backup could not be verified. Check its master password. Your current vault has not changed.'); }
    if (token !== revision || previous !== localStorage.getItem(storage)) throw new Error('Vault changed. Try restoring again.');
    if (previous && !confirm('Replace this browser’s vault with the verified backup? Export your current vault first if you need to keep it.')) return;
    localStorage.setItem(storage,JSON.stringify(markChanged({...candidate,index:indexFor(opened.entries)},previous?JSON.parse(previous):null)));
    cloud?.schedule();
    localStorage.removeItem(backupStorage); pendingImport = null; $('import-form').hidden = true;
    lock(); message('Verified backup restored. Unlock with its master password.');
  });
};
function renderHistory() {
  const entry = session?.entries.find(e => e.id === historyId && !e.deletedAt);
  $('history-section').hidden = !entry;
  const container = $('history-entries'); container.replaceChildren();
  if (!entry) return;
  $('history-title').textContent = `History · ${entry.name}`;
  if (!entry.history?.length) {
    const empty = document.createElement('p'); empty.textContent = 'No earlier versions yet. Future edits will appear here.'; container.append(empty);
  }
  for (const [index,version] of (entry.history || []).entries()) {
    const row = document.createElement('article'); row.className = 'entry';
    const detail = document.createElement('div'), label = document.createElement('p');
    label.textContent = `${version.name} · ${version.username || 'No username'}${version.website?' · '+version.website:''} · Replaced ${timestamp(version.archivedAt)}`;
    const secret = document.createElement('input'); secret.type = 'text'; secret.readOnly = true; secret.value = version.password;
    secret.setAttribute('aria-label',`Previous password ${index+1} for ${entry.name}`); detail.append(label,secret);
    const restore = document.createElement('button'); restore.textContent = 'Restore version';
    restore.onclick = () => action(async () => {
      if (!session) throw new Error('Unlock the vault first.');
      const current = session.entries.find(e => e.id === entry.id && !e.deletedAt);
      if (!current) throw new Error('Entry unavailable.');
      await persist(session.entries.map(e => e.id === current.id ? restoreVersion(current,index) : e));
      resetEditor(); message('Earlier version restored. The version it replaced is kept in history.');
    });
    row.append(detail,restore); container.append(row);
  }
}
$('close-history').onclick = () => { historyId = null; renderHistory(); };
$('preset').onchange = () => {
  const preset = presets[$('preset').value]; if (!preset) return;
  $('length').value = String(preset.length);
  for (const key of ['lower','upper','numbers','symbols','ambiguous']) $(key).checked = preset[key];
  regenerate();
};
for (const id of ['length','lower','upper','numbers','symbols','ambiguous']) $(id).addEventListener('input',() => { $('preset').value = 'custom'; });
$('change-master-form').onsubmit = e => {
  e.preventDefault();
  return action(async () => {
    const current = session, previous = localStorage.getItem(storage), token = revision;
    if (!current || current.stored !== previous) throw new Error('Unlock the current vault before changing its master password.');
    if ($('new-master').value !== $('new-master-confirm').value) throw new Error('New master passwords do not match.');
    let changed;
    try { changed = await rekey(JSON.parse(previous),$('current-master').value,$('new-master').value); }
    catch { throw new Error('Could not change the master password. Check the current password and use at least 12 characters for the new one.'); }
    if (session !== current || token !== revision || previous !== localStorage.getItem(storage)) throw new Error('Vault changed or locked. No master-password change was saved.');
    localStorage.setItem(storage,JSON.stringify(markChanged({...changed.envelope,index:indexFor(changed.entries)},JSON.parse(previous))));
    cloud?.schedule();
    lock(); message('Master password changed. Unlock with the new password and export a fresh backup. Older backups still require the old master password.');
  });
};
try { authUI(); render(); regenerate(); $('private-ui').removeAttribute?.('inert'); } catch { message('Browser storage is unavailable or invalid. Restore a backup to continue.'); }

if(account.demo){
  $('offline-status').textContent='Sample data only. Reload resets the demo.';
  $('save-auth-note').textContent='Demo master password: keykeep-demo-only. Use sample passwords here.';
  $('vault-description').textContent='Unlock the sample vault with keykeep-demo-only.';
}
if(globalThis.location?.protocol === 'https:'&&!account.demo) {
  $('cloud-section').hidden = false;
  $('manage-access').hidden=!account.admin;
  const recoveries=()=>{
    const records=JSON.parse(localStorage.getItem('keykeep.recoveries.v1')||'[]');
    if(localStorage.getItem('keykeep.recovery.v1'))records.push({id:'legacy',source:'Earlier local copy',envelope:JSON.parse(localStorage.getItem('keykeep.recovery.v1'))});
    return records;
  };
  const recoveryUI=()=>{const records=recoveries();$('recovery-choice').replaceChildren();for(const record of records){const option=document.createElement('option');option.value=record.id;option.textContent=record.source+(record.savedAt?' · '+timestamp(record.savedAt):'');$('recovery-choice').append(option);}$('recovery-controls').hidden=!records.length;};
  const update = (text,conflict) => { $('sync-status').textContent = text; $('sync-conflict').hidden = !conflict; if(conflict)$('sync-details').open=true; recoveryUI(); };
  const connection = signedIn => { if(!signedIn&&cloud){lock();location.replace('/');}  $('cloud-login').hidden=signedIn; $('cloud-logout').hidden=!signedIn; $('cloud-label').textContent=signedIn?'Cloud account signed in':'Saved on this device'; $('cloud-description').textContent=signedIn?'Your vault is encrypted before syncing':'Sign in to use your vault on other PCs'; };
  connection(true);
  cloud = startCloudSync({storage:localStorage,vaultId:account.vaultId,status:update,connection,changed:replaced=>{if(replaced)lock();else if(session)session.stored=localStorage.getItem(storage);backupUI();}});
  $('sync-now').onclick = () => cloud.run();
  $('use-cloud').onclick = () => {
    if(confirm('Load the cloud version? Both current copies and any earlier recovery copies will be preserved.'))cloud.useCloud();
  };
  $('download-recovery').onclick = () => {
    const record=recoveries().find(record=>record.id===$('recovery-choice').value);if(!record)return;const value=JSON.stringify(record.envelope);
    const url=URL.createObjectURL(new Blob([value],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='keykeep-recovery.vault.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  $('compare-copies').onclick=()=>{$('merge-form').hidden=false;$('merge-master').focus();};
  $('merge-form').onsubmit=e=>{e.preventDefault();return action(async()=>{
    const snapshot=await cloud.engine.inspectConflict();
    let left,right;
    try{left=await unlock(snapshot.local,$('merge-master').value);right=await unlock(snapshot.remote.envelope,$('merge-cloud-master').value||$('merge-master').value);}catch{throw new Error('Could not unlock both copies. Check their master passwords. Nothing has changed.');}
    if(localStorage.getItem(storage)!==snapshot.localRaw)throw new Error('Local vault changed. Compare again.');
    const rows=compareVaults(left.entries,right.entries),choices={};
    $('merge-entries').replaceChildren();
    for(const row of rows){
      const item=document.createElement('div');item.className='entry';
      const text=document.createElement('p');text.textContent=`${(row.local||row.cloud).name} · ${row.state==='conflict'?'Different versions — choose below':row.state==='same'?'Same in both copies':row.state==='local-only'?'Kept from this device':'Kept from cloud'}`;item.append(text);
      if(row.state==='conflict'){
        const select=document.createElement('select');select.setAttribute('aria-label','Keep version for '+(row.local||row.cloud).name);
        for(const [value,label]of [['','Choose a version'],['both','Keep both versions'],['local','Keep this device’s version'],['cloud','Keep the cloud version']]){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}
        select.onchange=()=>choices[row.id]=select.value;item.append(select);
        for(const [source,entry]of [['This device',row.local],['Cloud',row.cloud]]){
          const detail=document.createElement('p');detail.textContent=`${source}: ${entry.name} · ${entry.username||'No username'}${entry.website?' · '+entry.website:''} · ${entry.deletedAt?'Deleted '+timestamp(entry.deletedAt):'Active'} · Created ${timestamp(entry.createdAt)} · Updated ${timestamp(entry.updatedAt)}`;
          const value=document.createElement('input');value.type='password';value.readOnly=true;value.value=entry.password;value.setAttribute('aria-label',source+' password for '+entry.name);
          const show=document.createElement('button');show.type='button';show.textContent='Show '+source.toLowerCase()+' password';show.onclick=()=>{value.type=value.type==='password'?'text':'password';show.textContent=(value.type==='password'?'Show ':'Hide ')+source.toLowerCase()+' password';};item.append(detail,value,show);
          if(entry.history?.length){
            const history=document.createElement('details'),summary=document.createElement('summary');summary.textContent=`${source} history · ${entry.history.length} previous versions`;history.append(summary);
            entry.history.forEach((version,index)=>{
              const description=document.createElement('p');description.textContent=`${version.name} · ${version.username||'No username'}${version.website?' · '+version.website:''} · Updated ${timestamp(version.updatedAt)} · Replaced ${timestamp(version.archivedAt)}`;
              const password=document.createElement('input');password.type='password';password.readOnly=true;password.value=version.password;password.setAttribute('aria-label',`${source} previous password ${index+1} for ${entry.name}`);
              const reveal=document.createElement('button');reveal.type='button';reveal.textContent='Show previous password';reveal.onclick=()=>{password.type=password.type==='password'?'text':'password';reveal.textContent=password.type==='password'?'Show previous password':'Hide previous password';};history.append(description,password,reveal);
            });item.append(history);
          }
        }
      }
      $('merge-entries').append(item);
    }
    mergePreview={snapshot,rows,choices,key:left.key,salt:left.salt};$('merge-master').value='';$('merge-cloud-master').value='';$('merge-preview').hidden=false;
    clearTimeout(timer);timer=setTimeout(()=>{lock();message('Comparison locked after 5 minutes. Unlock both copies again.');},300000);
    message('Review differing entries. Both originals will be preserved before combining.');
  });};
  $('apply-merge').onclick=()=>action(async()=>{
    if(!mergePreview)throw new Error('Unlock both copies again before combining.');
    const preview=mergePreview,entries=combineVaults(preview.rows,preview.choices),encrypted=await encrypt(entries,preview.key,preview.salt);
    if(mergePreview!==preview)throw new Error('Comparison expired. Unlock both copies again.');
    await cloud.engine.combine({...encrypted,index:indexFor(entries)},preview.snapshot);$('merge-form').hidden=true;
  });
  $('cancel-merge').onclick=()=>{lock();$('merge-form').hidden=true;message('Comparison cancelled. Vault copies have not been replaced.');};
  $('cloud-logout').onclick = async () => {
    lock();
    try{const response=await fetch('/api/logout',{method:'POST',headers:{'X-Keykeep-Request':'1'}});if(!response.ok)throw new Error();connection(false);location.replace('/');}catch{update('Vault locked. Could not confirm cloud sign-out; reconnect and try again.',false);}
  };
}

function clearBrowserLogin() {
  if(!browserLogin)return;
  $('generator-view').classList?.remove('browser-review');$('generator-heading').textContent='Create a password';
  browserLogin=null;browserChoice='';clearTimeout(browserTimer);$('login-choice').replaceChildren();
  $('browser-login-note').hidden=true;$('login-choice-wrap').hidden=true;
  for(const id of ['new-name','new-username','new-website','existing-password'])$(id).value='';
  $('existing-password').type='password';$('show-existing').textContent='Show password';
  passwordMode(false);
}
function browserLoginChoices() {
  if(!browserLogin)return;
  const select=$('login-choice'),selected=select.value;select.replaceChildren();
  let website='';try{website=websiteOrigin($('new-website').value.trim());}catch{}
  const choices=session?matchingLogins(session.entries,{website,username:$('new-username').value.trim()}):[];
  const options=!session?[['','Unlock to check for existing logins']]:[...(choices.length?[['','Choose what to save']]:[]),['new','Save as a new login'],...choices.map(entry=>[entry.id,'Update '+entry.name])];
  for(const [value,label]of options){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}
  select.disabled=!session;select.value=options.some(([value])=>value===selected)?selected:choices.length||!session?'':'new';
  $('login-choice-wrap').hidden=false;
}
for(const id of ['new-username','new-website'])$(id).addEventListener('input',()=>{browserChoice='';$('login-choice').value='';browserLoginChoices();});
$('login-choice').onchange=()=>{browserChoice=$('login-choice').value;};
$('cancel-browser-login').onclick=()=>{clearBrowserLogin();message('Browser login discarded. Nothing was saved.');};
if(browserNonce && !account.demo){
  let received=false,attempts=0;
  const listener=event=>{
    if(received || event.source!==window || event.origin!==location.origin || event.data?.type!=='keykeep-login' || event.data.nonce!==browserNonce)return;
    try{
      const login=checkedLogin(event.data.login),expires=event.data.login.expires;
      if(!Number.isFinite(expires) || expires<=Date.now() || expires>Date.now()+120000)throw new Error('Browser login expired. Read it again with the extension.');
      received=true;browserChoice='';clearInterval(bridgeTimer);window.removeEventListener('message',listener);
      browserLogin={...login,expires};
      $('generator-view').classList?.add('browser-review');$('generator-heading').textContent='Review this login';
      view(false);passwordMode(true);
      for(const [id,key]of [['new-name','name'],['new-username','username'],['new-website','website'],['existing-password','password']])$(id).value=login[key];
      $('browser-login-note').hidden=false;$('login-details').open=true;browserLoginChoices();
      browserTimer=setTimeout(()=>{clearBrowserLogin();message('Browser login cleared after 2 minutes. Read it again to continue.');},expires-Date.now());
      message('Review this login and click Save password. Your vault master password is required if locked.');
    }catch(error){message(error.message);}
  };
  window.addEventListener('message',listener);
  const ready=()=>{
    if(++attempts>120){clearInterval(bridgeTimer);window.removeEventListener('message',listener);message('No browser login received. Sign in, then read the login again with the extension.');return;}
    window.postMessage({type:'keykeep-ready',nonce:browserNonce},location.origin);
  };
  bridgeTimer=setInterval(ready,500);ready();
  window.addEventListener('pagehide',()=>{clearInterval(bridgeTimer);window.removeEventListener('message',listener);});
}

// Scope browser storage to the server-confirmed vault, never a user-supplied email.
export function scopedStorage(storage,vaultId){
  const key=name=>`keykeep.account.${vaultId}.${name}`;
  return {key,getItem:name=>storage.getItem(key(name)),setItem:(name,value)=>storage.setItem(key(name),value),removeItem:name=>storage.removeItem(key(name))};
}
export async function accountContext(){
  if(globalThis.document?.documentElement?.dataset.mode==='demo')return (await import('./demo.js')).demoContext();
  if(globalThis.location?.protocol!=='https:')return {storage:globalThis.localStorage};
  let response;
  try{response=await fetch('/api/session',{cache:'no-store',credentials:'same-origin'});}catch(error){document.getElementById('offline-status').textContent='Reconnect and reload to verify your sign-in.';throw error;}
  if(!response.ok){location.replace('/');throw new Error('Sign-in required');}
  const account=await response.json();
  if(!/^[a-f0-9]{64}$/.test(account.vaultId))throw new Error('Invalid account');
  const storage=scopedStorage(globalThis.localStorage,account.vaultId);
  if(account.legacyOwner)await navigator.locks.request('keykeep-vault-write',()=>{
    // Copy once, preserving the original ciphertext for recovery. Never migrate it to a guest.
    if(!storage.getItem('migrated')){
      for(const name of ['keykeep.v1','keykeep.backup.v1','keykeep.recovery.v1','keykeep.recoveries.v1']){
        const value=globalThis.localStorage.getItem(name);
        if(value&&!storage.getItem(name))storage.setItem(name,value);
      }
      storage.setItem('migrated','1');
    }
  });
  return {...account,storage};
}

import {validate} from './crypto.js';
const wire=value=>({version:value.version,salt:value.salt,iv:value.iv,data:value.data});
const same=(a,b)=>a&&b&&JSON.stringify(wire(a))===JSON.stringify(wire(b));
export function markChanged(envelope,previous){
  return {...envelope,sync:{baseVersion:previous?.sync?.baseVersion||0,dirty:true,writeId:crypto.randomUUID()}};
}
export class VaultSync {
  constructor({storage,request,changed=()=>{},status=()=>{}}){Object.assign(this,{storage,request,changed,status});}
  read(){return JSON.parse(this.storage.getItem('keykeep.v1')||'null');}
  async run(){
    const before=this.storage.getItem('keykeep.v1'),local=this.read();
    const remote=await this.request('/api/vault');
    if(!Number.isSafeInteger(remote.version)||remote.version<0)throw new Error('Invalid cloud response');
    if(Boolean(remote.envelope)!==(remote.version>0))throw new Error('Invalid cloud vault state');
    if(local?.sync && remote.version<local.sync.baseVersion)throw new Error('Cloud version is older than expected. Local vault preserved.');
    if(remote.envelope)validate(remote.envelope);
    if(before!==this.storage.getItem('keykeep.v1'))throw new Error('Local vault changed. Sync will retry.');
    if(!local){
      if(remote.envelope)this.write({...wire(remote.envelope),sync:{baseVersion:remote.version,dirty:false}},true);
      this.status(remote.envelope?'Synced. Unlock with your master password.':'Signed in. Save or import your first password.',false);return;
    }
    if(same(local,remote.envelope)){
      this.write({...local,sync:{baseVersion:remote.version,dirty:false}},false);this.status('All changes synced.',false);return;
    }
    const meta=local.sync||{baseVersion:0,dirty:true,writeId:crypto.randomUUID()};
    if(!local.sync){this.write({...local,sync:meta},false);}
    if(!meta.dirty){
      if(remote.version<meta.baseVersion)throw new Error('Cloud version is older than expected. Local vault preserved.');
      if(remote.envelope && remote.version>meta.baseVersion){this.write({...wire(remote.envelope),sync:{baseVersion:remote.version,dirty:false}},true);this.status('Cloud changes downloaded. Unlock to view.',false);return;}
      throw new Error('Unexpected cloud state. Local vault preserved.');
    }
    if(remote.version!==meta.baseVersion){this.status('Both this PC and the cloud have changes. Your local copy is safe. Resolve below.',true);return;}
    const sent=this.storage.getItem('keykeep.v1');
    const result=await this.request('/api/vault',{method:'PUT',body:JSON.stringify({baseVersion:meta.baseVersion,writeId:meta.writeId,envelope:wire(local)})});
    if(result.version!==meta.baseVersion+1||result.writeId!==meta.writeId)throw new Error('Sync response uncertain. Retry is safe.');
    if(sent!==this.storage.getItem('keykeep.v1'))throw new Error('Local changes remain pending.');
    this.write({...local,sync:{baseVersion:result.version,dirty:false}},false);this.status('All changes synced.',false);
  }
  write(value,replaced){this.storage.setItem('keykeep.v1',JSON.stringify(value));this.changed(replaced);}
  preserve(copies){
    const records=JSON.parse(this.storage.getItem('keykeep.recoveries.v1')||'[]');
    if(!Array.isArray(records))throw new Error('Recovery storage is invalid. Export a backup before resolving.');
    const legacy=this.storage.getItem('keykeep.recovery.v1');
    if(legacy&&!records.some(record=>JSON.stringify(record.envelope)===legacy))records.push({id:crypto.randomUUID(),source:'Earlier local copy',savedAt:new Date().toISOString(),envelope:JSON.parse(legacy)});
    for(const copy of copies)if(copy.envelope&&!records.some(record=>record.source===copy.source&&same(record.envelope,copy.envelope)))records.push({...copy,id:crypto.randomUUID(),savedAt:new Date().toISOString()});
    // Quota failures abort resolution before replacing the local vault.
    this.storage.setItem('keykeep.recoveries.v1',JSON.stringify(records));
  }
  async inspectConflict(){
    const localRaw=this.storage.getItem('keykeep.v1'),local=JSON.parse(localRaw||'null'),remote=await this.request('/api/vault');
    if(!local||!remote.envelope||!Number.isSafeInteger(remote.version)||remote.version<1)throw new Error('Both vault copies must exist to compare them.');
    validate(local);validate(remote.envelope);
    if(localRaw!==this.storage.getItem('keykeep.v1'))throw new Error('Local vault changed. Compare again.');
    return {localRaw,local,remote};
  }
  async combine(envelope,snapshot){
    validate(envelope);
    const latest=await this.request('/api/vault');
    if(this.storage.getItem('keykeep.v1')!==snapshot.localRaw||latest.version!==snapshot.remote.version||!same(latest.envelope,snapshot.remote.envelope))throw new Error('A vault changed after comparison. Compare again; both copies are preserved.');
    this.preserve([{source:'Before combining: this device',envelope:snapshot.local},{source:'Before combining: cloud',serverVersion:snapshot.remote.version,envelope:snapshot.remote.envelope}]);
    this.write(markChanged(envelope,{sync:{baseVersion:latest.version}}),true);
    // If the network fails or a different device writes now, the combined local
    // copy stays dirty and both originals remain downloadable.
    await this.run();
  }
  async useCloud(){
    const before=this.storage.getItem('keykeep.v1');
    const remote=await this.request('/api/vault');
    if(!remote.envelope)throw new Error('There is no cloud vault to load.');validate(remote.envelope);
    if(!Number.isSafeInteger(remote.version)||remote.version<1)throw new Error('Invalid cloud version');
    if(before!==this.storage.getItem('keykeep.v1'))throw new Error('Local vault changed. Retry.');
    if(before)this.preserve([{source:'Before loading cloud: this device',envelope:JSON.parse(before)},{source:'Before loading cloud: cloud',serverVersion:remote.version,envelope:remote.envelope}]);
    this.write({...wire(remote.envelope),sync:{baseVersion:remote.version,dirty:false}},true);
    this.status('Cloud copy loaded. Download your preserved local copy below if needed.',false);
  }
}
export function startCloudSync({changed,status,connection=()=>{},storage=localStorage,vaultId}){
  let pending=false;
  const engine=new VaultSync({storage,changed,status,request:async(path,options={})=>{
    const response=await fetch(path,{...options,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Keykeep-Request':'1',...(vaultId?{'X-Keykeep-Vault':vaultId}:{})},signal:AbortSignal.timeout(15000)});
    if(response.status===401||response.status===403)connection(false);
    else if(response.ok)connection(true);
    if(response.status===401)throw new Error('Sign in to sync. Your local changes are saved.');
    if(response.status===409)throw new Error('Another PC changed the vault. Open Sync & devices and select Check for updates.');
    if(!response.ok)throw new Error(response.status===503?'Cloud sign-in is not ready yet.':'Sync unavailable. Local changes are saved; try again online.');
    return response.json();
  }});
  async function run(task=()=>engine.run()){
    if(pending)return;pending=true;
    try{await navigator.locks.request('keykeep-vault-write',task);}catch(e){status(e.message,false);}finally{pending=false;}
  }
  const schedule=()=>setTimeout(()=>run(),0);
  window.addEventListener('online',schedule);
  setInterval(()=>run(),60000);
  schedule();
  return {schedule,run:()=>run(),useCloud:()=>run(()=>engine.useCloud()),engine};
}

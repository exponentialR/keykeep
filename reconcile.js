// Compare authenticated entries only. Names in an envelope's index are untrusted.
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export function compareVaults(local,cloud){
 const left=new Map(local.map(entry=>[entry.id,entry])),right=new Map(cloud.map(entry=>[entry.id,entry]));
 return [...new Set([...left.keys(),...right.keys()])].map(id=>{
  const a=left.get(id),b=right.get(id);
  return {id,local:a,cloud:b,state:!a?'cloud-only':!b?'local-only':canonical(a)===canonical(b)?'same':'conflict'};
 });
}
export function combineVaults(comparison,choices={},newId=()=>crypto.randomUUID()){
 const entries=[];
 for(const row of comparison){
  if(row.state!=='conflict'){entries.push(structuredClone(row.local||row.cloud));continue;}
  const choice=choices[row.id];
  if(choice==='local'||choice==='cloud')entries.push(structuredClone(row[choice]));
  else if(choice==='both')entries.push(structuredClone(row.local),{...structuredClone(row.cloud),id:newId(),name:row.cloud.name+' (cloud copy)'});
  else throw new Error('Choose how to keep each differing entry before combining.');
 }
 if(new Set(entries.map(entry=>entry.id)).size!==entries.length)throw new Error('Duplicate entry identities. No combined vault saved.');
 return entries;
}

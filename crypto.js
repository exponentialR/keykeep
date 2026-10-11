import {websiteOrigin} from './login.js';
const groups = {lower:'abcdefghijklmnopqrstuvwxyz',upper:'ABCDEFGHIJKLMNOPQRSTUVWXYZ',numbers:'0123456789',symbols:'!@#$%^&*()-_=+[]{};:,.?'};
function randomIndex(n) {
  const a = new Uint32Array(1), limit = Math.floor(4294967296/n)*n;
  do {crypto.getRandomValues(a);} while(a[0]>=limit);
  return a[0]%n;
}
export function generate(length, selected, ambiguous=false) {
  const sets = Object.keys(groups).filter(k=>selected[k]).map(k=>ambiguous?groups[k].replace(/[il1Lo0O]/g,''):groups[k]);
  if (!Number.isInteger(length)||length<8||length>128||!sets.length) throw new Error('Choose at least one character type and a length from 8 to 128.');
  const pool=sets.join('');
  // Reject whole candidates until all selected groups are present; keeps distribution uniform.
  let result;
  do {result=Array.from({length},()=>pool[randomIndex(pool.length)]).join('');} while(!sets.every(s=>[...result].some(c=>s.includes(c))));
  return result;
}
const encode = bytes => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
};
const decode = value => Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export async function derive(password,salt) {
  const raw=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:600000,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function encrypt(entries,key,salt) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(entries)));
  const envelope = {version:1,salt:encode(salt),iv:encode(iv),data:encode(new Uint8Array(data))};
  validate(envelope);
  return envelope;
}
export function validate(blob) {
  if(blob?.version!==1||typeof blob.salt!=='string'||typeof blob.iv!=='string'||typeof blob.data!=='string'||blob.data.length>2000000) throw new Error('Invalid vault file.');
  if(decode(blob.salt).length!==16||decode(blob.iv).length!==12||decode(blob.data).length<16) throw new Error('Invalid vault file.');
  return blob;
}
export async function unlock(blob,password) {
  validate(blob);
  const salt=decode(blob.salt),key=await derive(password,salt);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(blob.iv)},key,decode(blob.data));
  const entries=JSON.parse(new TextDecoder().decode(plain));
  const fields = e => {
    if (!e || !['name','username','password'].every(k=>typeof e[k]==='string')) return false;
    try { return e.website === undefined || (typeof e.website === 'string' && websiteOrigin(e.website) === e.website); } catch { return false; }
  };
  const date = value => value == null || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
  if(!Array.isArray(entries)||!entries.every(e=>fields(e)&&typeof e.id==='string'&&date(e.createdAt)&&date(e.updatedAt)&&date(e.deletedAt)&&(e.history===undefined||(Array.isArray(e.history)&&e.history.length<=20&&e.history.every(h=>fields(h)&&date(h.updatedAt)&&date(h.archivedAt)))))||new Set(entries.map(e=>e.id)).size!==entries.length) throw new Error('Invalid vault contents.');
  return {key,salt,entries};
}

export async function rekey(blob, currentPassword, newPassword) {
  if (newPassword.length < 12) throw new Error('Use at least 12 characters for the new master password.');
  const opened = await unlock(blob,currentPassword);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await derive(newPassword,salt);
  return {envelope:await encrypt(opened.entries,key,salt),key,salt,entries:opened.entries};
}

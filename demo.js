import {derive,encrypt} from './crypto.js';
export const DEMO_PASSWORD='keykeep-demo-only';
export async function demoContext(){
 const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const salt=crypto.getRandomValues(new Uint8Array(16)),key=await derive(DEMO_PASSWORD,salt);
 const createdAt='2026-10-01T09:00:00.000Z';
 const entries=[
  {id:'demo-email',name:'Personal email',username:'alex@example.com',password:'SampleOnly!7nQ4mZ',createdAt,updatedAt:createdAt},
  {id:'demo-github',name:'GitHub',username:'alex-example',password:'SampleOnly!8vR2pK',createdAt,updatedAt:createdAt},
  {id:'demo-travel',name:'Travel account',username:'alex@example.com',password:'SampleOnly!9wT3jL',createdAt,updatedAt:createdAt},
 ];
 storage.setItem('keykeep.v1',JSON.stringify({...await encrypt(entries,key,salt),index:entries.map(({id,name,createdAt,updatedAt})=>({id,name,createdAt,updatedAt}))}));
 return {storage,demo:true};
}

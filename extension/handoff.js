import {appAddress,checkedLogin} from '../login.js';
// Volatile, one-use capabilities. Never persist plaintext to extension storage.
export function createHandoffs({now=Date.now,uuid=()=>crypto.randomUUID()}={}) {
  const pending = new Map();
  const prune = () => { for (const [nonce,item] of pending) if(item.expires <= now())pending.delete(nonce); };
  return {
    stage(login, app) {
      prune();
      if(pending.size >= 8) throw new Error('Too many pending saves. Close an earlier save and try again.');
      const nonce=uuid(); pending.set(nonce,{login:checkedLogin(login),app:appAddress(app),tabId:null,expires:now()+120000}); return nonce;
    },
    bind(nonce,tabId) { const item=pending.get(nonce);if(item)item.tabId=tabId; },
    claim(nonce,sender) {
      prune();const item=pending.get(nonce);
      if(!item || sender.frameId !== 0 || sender.tab?.id !== item.tabId) return null;
      let url;try{url=new URL(sender.url);}catch{return null;}
      if(url.origin+url.pathname !== item.app || url.search) return null;
      pending.delete(nonce);return {...item.login,expires:item.expires};
    },
    discard(nonce) { pending.delete(nonce); },
    close(tabId) { for(const [nonce,item]of pending)if(item.tabId===tabId)pending.delete(nonce); },
    clear() { pending.clear(); },
    prune
  };
}

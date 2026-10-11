// Runs only on the explicitly connected Keykeep host, never on login websites.
(() => {
  if(location.pathname !== '/app' || window !== window.top)return;
  const nonce=/^#keykeep-save=([a-f0-9-]{36})$/.exec(location.hash)?.[1];
  if(!nonce)return;
  let sending=false,finished=false;
  const listener=async event=>{
    if(finished || sending || event.source !== window || event.origin !== location.origin || event.data?.type !== 'keykeep-ready' || event.data.nonce !== nonce)return;
    sending=true;
    try {
      const result=await chrome.runtime.sendMessage({type:'claim-login',nonce});
      // A new tab can become ready before tabs.create resolves. Leave the first claim retryable.
      if(!result?.login){sending=false;return;}
      finished=true;window.removeEventListener('message',listener);
      window.postMessage({type:'keykeep-login',nonce,login:result.login},location.origin);
    }catch{sending=false;}
  };
  window.addEventListener('message',listener);
  setTimeout(()=>{finished=true;window.removeEventListener('message',listener);},120000);
})();

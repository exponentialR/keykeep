import {appAddress,checkedLogin,websiteOrigin} from '../login.js';
import {createHandoffs} from './handoff.js';
const handoffs=createHandoffs();
setInterval(()=>handoffs.prune(),15000);
async function handle(message,sender) {
  if(sender.id !== chrome.runtime.id) throw new Error('Untrusted request.');
  if(message?.type === 'claim-login') return {login:handoffs.claim(message.nonce,sender)};
  if(sender.url !== chrome.runtime.getURL('popup.html') || sender.tab) throw new Error('Open the Keykeep toolbar first.');
  if(message?.type === 'configure') {
    const app=appAddress(message.app),origin=new URL(app).origin;
    if(!await chrome.permissions.contains({origins:[origin+'/*']})) throw new Error('Allow access to your Keykeep host first.');
    handoffs.clear();
    await chrome.scripting.unregisterContentScripts({ids:['keykeep-handoff']}).catch(()=>{});
    await chrome.scripting.registerContentScripts([{id:'keykeep-handoff',matches:[origin+'/*'],js:['bridge.js'],runAt:'document_start',allFrames:false,persistAcrossSessions:true}]);
    const previous=(await chrome.storage.local.get('app')).app;
    await chrome.storage.local.set({app});
    if(previous && new URL(previous).origin !== origin) await chrome.permissions.remove({origins:[new URL(previous).origin+'/*']});
    return {ok:true};
  }
  if(message?.type === 'save-login') {
    const {app}=await chrome.storage.local.get('app');
    if(!app)throw new Error('Connect your Keykeep app first.');
    if(!await chrome.permissions.contains({origins:[new URL(app).origin+'/*']}))throw new Error('Reconnect your Keykeep app to allow access.');
    const login=checkedLogin(message.login),source=await chrome.tabs.get(message.sourceTab);
    if(websiteOrigin(source.url) !== login.website)throw new Error('The website changed. Read its login again.');
    const nonce=handoffs.stage(login,app);
    try {
      const target=await chrome.tabs.create({url:app+'#keykeep-save='+nonce});
      handoffs.bind(nonce,target.id);return {ok:true};
    }catch(error){handoffs.discard(nonce);throw error;}
  }
  throw new Error('Unknown request.');
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{handle(message,sender).then(reply).catch(error=>reply({error:error.message}));return true;});
chrome.tabs.onRemoved.addListener(tabId=>handoffs.close(tabId));
chrome.permissions.onRemoved.addListener(()=>handoffs.clear());

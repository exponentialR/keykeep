import {appAddress,checkedLogin} from '../login.js';
import {readLoginForm} from './capture.js';
import {configureApp} from './configure.js';
const $=id=>document.getElementById(id);
let candidates=[],sourceTab=null,timer;
const status=text=>{$('status').textContent=text;};
function clear() {candidates=[];sourceTab=null;clearTimeout(timer);$('review').reset();$('password').value='';$('password').type='password';$('show').textContent='Show password';$('field').replaceChildren();$('review').hidden=true;}
function select() {const login=candidates[Number($('field').value)];if(!login)return;for(const key of ['name','username','password','website'])$(key).value=login[key];$('password').type='password';$('show').textContent='Show password';}
async function send(message) {const result=await chrome.runtime.sendMessage(message);if(result?.error)throw new Error(result.error);return result;}
$('read').onclick=async()=>{
  clear();$('read').disabled=true;
  try{
    const {app}=await chrome.storage.local.get('app');if(!app)throw new Error('Connect your Keykeep app below first.');
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id || tab.url?.startsWith(new URL(app).origin+'/'))throw new Error('Open the website whose login you want to save.');
    const [result]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:readLoginForm});
    if(result.result?.error)throw new Error(result.result.error);
    candidates=result.result.logins.map(checkedLogin);sourceTab=tab.id;
    for(const [index,login]of result.result.logins.entries()){const option=document.createElement('option');option.value=index;option.textContent=login.label;$('field').append(option);}
    $('field').value='0';select();$('review').hidden=false;
    status('Check the website and account. Keykeep will ask you to confirm saving.');
    timer=setTimeout(()=>{clear();status('Login cleared after 2 minutes. Read it again to continue.');},120000);
  }catch(error){clear();status(error.message || 'Could not read this page.');}finally{$('read').disabled=false;}
};
$('field').onchange=select;
$('show').onclick=()=>{const show=$('password').type==='password';$('password').type=show?'text':'password';$('show').textContent=show?'Hide password':'Show password';};
$('cancel').onclick=()=>{clear();status('Login cleared.');};
$('review').onsubmit=async event=>{
  event.preventDefault();const button=$('review').querySelector('.primary');button.disabled=true;
  try{await send({type:'save-login',sourceTab,login:checkedLogin(Object.fromEntries(['name','username','password','website'].map(key=>[key,$(key).value])))});clear();status('Continue in the Keykeep tab. If asked to sign in, sign in and read this login again.');}
  catch(error){status(error.message);}finally{button.disabled=false;}
};
$('connect').onsubmit=async event=>{
  event.preventDefault();
  try{
    const app=appAddress($('app').value);
    await configureApp(app,{send,requestPermission:options=>chrome.permissions.request(options)});
    $('app').value=app;$('open').href=app;$('open').hidden=false;status('Connected. Sign in to Keykeep, then return to your login website.');
  }catch(error){status(error.message);}
};
window.addEventListener('pagehide',clear);
const {app}=await chrome.storage.local.get('app');
if(app){$('app').value=app;$('open').href=app;$('open').hidden=false;}else{$('settings').open=true;status('Connect your Keykeep app to get started.');}

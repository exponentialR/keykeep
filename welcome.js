const form=document.getElementById('request-access'),status=document.getElementById('request-status'),button=document.getElementById('request-submit');
form?.addEventListener('submit',async event=>{
  event.preventDefault();button.disabled=true;status.textContent='Sending your request…';
  try{
    const response=await fetch('/api/access-request',{method:'POST',headers:{'Content-Type':'application/json','X-Keykeep-Request':'1'},body:JSON.stringify({email:document.getElementById('request-email').value,website:document.getElementById('website').value})});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to send request.');
    status.textContent=result.message;form.reset();
  }catch(error){status.textContent=error.message||'Unable to send request. Please try again.';}finally{button.disabled=false;}
});
// Replace the legacy offline app cache with the public-only welcome shell.
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js?access=1').catch(()=>{});

const pendingStatus=status||document.getElementById('access-status');
if(pendingStatus && new URL(location.href).searchParams.get('access')==='pending'){
  pendingStatus.hidden=false;pendingStatus.textContent='Your email is verified, but access still needs approval. Request access, or try again after approval.';
}
fetch('/api/session',{cache:'no-store'}).then(async response=>{
  if(response.ok){const link=document.getElementById('welcome-sign-in');if(link)link.href='/app';}
}).catch(()=>{});

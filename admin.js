const list=document.getElementById('access-requests'),status=document.getElementById('admin-status');
async function load(){
  try{
    const response=await fetch('/api/access-requests',{cache:'no-store'});if(!response.ok)throw new Error(response.status===401?'Sign in again to manage requests.':'Owner access is required.');
    const data=await response.json();list.replaceChildren();status.textContent=data.emailConfigured?(data.requests.length?'':'No access requests yet.'):'Email sending is not connected yet. Approvals are saved, but emails remain pending.';
    const testAddress=document.getElementById('test-email');testAddress.replaceChildren();
    for(const email of data.testRecipients||[]){const option=document.createElement('option');option.value=email;option.textContent=email;testAddress.append(option);}
    for(const request of data.requests){
      const row=document.createElement('section');row.className='access-row';
      const info=document.createElement('div'),name=document.createElement('strong'),detail=document.createElement('p');
      name.textContent=request.email;detail.className='note';detail.textContent=request.owner?'Owner account · Already has access':`${request.status} · Requested ${new Date(request.requested).toLocaleString()}`;info.append(name,detail);
      if(request.owner){row.append(info);list.append(row);continue;}
      if(request.status==='approved'){const mail=document.createElement('p');mail.className='note';mail.textContent=request.notification?.detail||(request.notification?'Approval email: '+request.notification.state:'No approval email queued for this earlier approval.');info.append(mail);}
      const actions=document.createElement('div');actions.className='access-actions';
      for(const [decision,label]of [['approved','Approve'],['declined',request.status==='approved'?'Revoke access':'Decline']]){
        if(request.status===decision)continue;
        const button=document.createElement('button');button.textContent=label;
        button.onclick=async()=>{
          if(!confirm(`${label} for ${request.email}?`))return;
          button.disabled=true;
          try{const result=await fetch('/api/access-requests',{method:'POST',headers:{'Content-Type':'application/json','X-Keykeep-Request':'1'},body:JSON.stringify({email:request.email,status:decision})});if(!result.ok)throw new Error('Could not save the decision.');const saved=await result.json();await load();status.textContent=`${request.email}: ${decision}. ${saved.notification?.detail||''}`;}catch(error){status.textContent=error.message;button.disabled=false;}
        };actions.append(button);
      }
      if(request.status==='approved'&&request.notification&&request.notification.state!=='sent'){
        const retry=document.createElement('button');retry.textContent='Retry approval email';
        retry.onclick=async()=>{retry.disabled=true;try{const response=await fetch('/api/access-requests',{method:'POST',headers:{'Content-Type':'application/json','X-Keykeep-Request':'1'},body:JSON.stringify({email:request.email,status:'approved',retry:true})});if(!response.ok)throw new Error('Could not retry email.');const result=await response.json();await load();status.textContent=result.notification.detail;}catch(error){status.textContent=error.message;retry.disabled=false;}};
        actions.append(retry);
      }
      row.append(info,actions);list.append(row);
    }
  }catch(error){status.textContent=error.message;}
}
document.getElementById('send-test-email').onclick=async()=>{
 const button=document.getElementById('send-test-email');button.disabled=true;
 try{const response=await fetch('/api/access-requests',{method:'POST',headers:{'Content-Type':'application/json','X-Keykeep-Request':'1'},body:JSON.stringify({email:document.getElementById('test-email').value,test:true})});if(!response.ok)throw new Error('Could not send the test email.');const result=await response.json();status.textContent=result.notification.detail;}
 catch(error){status.textContent=error.message;}finally{button.disabled=false;}
};
load();

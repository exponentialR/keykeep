const escape=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function approvalMessage(email,env){
 const url=new URL('/auth/login',env.ORIGIN);if(url.protocol!=='https:')throw new Error('HTTPS required');
 return {from:env.EMAIL_FROM,to:[email],subject:'Your Keykeep access is approved',
 text:`Your Keykeep access is approved.\n\nSign in to Keykeep: ${url.href}\n\nUse ${email}, the email address you requested access with. On your first visit, choose a master password to protect your own private vault. Keep it safe: it cannot be recovered.\n\nYour master password and saved passwords are never included in emails.`,
 html:`<div style="font-family:Arial,sans-serif;color:#172c49;max-width:560px;margin:24px auto;line-height:1.6"><h2>Keykeep</h2><h1 style="font-size:26px">Your access is approved.</h1><p>You can now create your own private password vault.</p><p><a href="${escape(url.href)}" style="display:inline-block;background:#203757;color:#fff;padding:12px 20px;text-decoration:none">Sign in to Keykeep</a></p><p>Sign in using <strong>${escape(email)}</strong>, the email address you requested access with.</p><p>On your first visit, choose a master password. Keep it safe: it cannot be recovered.</p><p style="font-size:13px;color:#64738a">Your master password and saved passwords are never included in emails.</p></div>`};
}
export async function sendApproval(env,email,{request=fetch,now=Math.floor(Date.now()/1000)}={}){
 const db=env.DB;
 const row=await db.prepare('SELECT * FROM approval_emails WHERE email=? ORDER BY rowid DESC LIMIT 1').bind(email).first();
 if(!row)return {state:'none',detail:'No approval email is queued for this earlier approval.'};
 if(row.state==='sent')return {state:'sent',detail:'Approval email accepted by Resend.'};
 const ownerTest=row.id===`owner-test/${email}`&&(env.ALLOWED_EMAILS||env.ALLOWED_EMAIL||'').split(',').some(value=>value.trim().toLowerCase()===email);
 if(!ownerTest&&(await db.prepare('SELECT status FROM access_requests WHERE email=?').bind(email).first())?.status!=='approved')return {state:'cancelled',detail:'Access is not approved; email not sent.'};
 if(!env.RESEND_API_KEY||!env.EMAIL_FROM)return {state:'pending',detail:'Approved, but email sending is not configured yet.'};
 // Provider idempotency expires after 24h. Never automatically resend an uncertain older attempt.
 if(row.first_attempt!==null&&now-row.first_attempt>=23*3600)return {state:'review',detail:'Sending outcome needs review in Resend. Retry window has expired.'};
 const claim=crypto.randomUUID(),payload=row.payload||JSON.stringify(approvalMessage(email,env));
 const claimed=await db.prepare("UPDATE approval_emails SET state='sending',payload=COALESCE(payload,?),first_attempt=COALESCE(first_attempt,?),lease_until=?,claim=? WHERE id=? AND state!='sent' AND lease_until<=? AND (?=1 OR EXISTS(SELECT 1 FROM access_requests WHERE email=? AND status='approved'))").bind(payload,now,now+60,claim,row.id,now,ownerTest?1:0,email).run();
 if(!claimed.meta.changes)return {state:'sending',detail:'Approval email is already being sent. Refresh shortly.'};
 let state='uncertain',detail='Sending outcome uncertain. Retry safely within 23 hours.',providerId=null;
 try{
  const response=await request('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`keykeep-approval/${row.id}`},body:payload,signal:AbortSignal.timeout(15000)});
  if(response.ok){const result=await response.json();if(typeof result.id!=='string'||!result.id)throw new Error('Invalid response');state='sent';providerId=result.id;detail='Approval email accepted by Resend.';}
  else {detail=`Email not confirmed (Resend HTTP ${response.status}). Check the sending configuration and retry.`;}
 }catch{/* Never log keys, provider response bodies or recipient data. */}
 await db.prepare('UPDATE approval_emails SET state=?,detail=?,provider_id=?,lease_until=0 WHERE id=? AND claim=?').bind(state,detail,providerId,row.id,claim).run();
 return {state,detail};
}

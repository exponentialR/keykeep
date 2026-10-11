import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {sendApproval,approvalMessage} from './cloud/email.js';
function setup(){
 const raw=new DatabaseSync(':memory:');raw.exec(readFileSync(new URL('./cloud/schema.sql',import.meta.url),'utf8'));
 const DB={prepare(sql){let args=[];const q={bind(...v){args=v;return q;},async first(){return raw.prepare(sql).get(...args)||null;},async run(){return {meta:{changes:Number(raw.prepare(sql).run(...args).changes)}};}};return q;}};
 const env={DB,ORIGIN:'https://passwords.example.test',EMAIL_FROM:'Keykeep <access@notify.example.test>',RESEND_API_KEY:'synthetic'};
 const email='member@example.test';raw.prepare("INSERT INTO access_requests VALUES(?,'pending','now',NULL,NULL)").run(email);
 const approve=()=>raw.prepare("UPDATE access_requests SET status='approved',reviewed='now' WHERE email=?").run(email);
 return {raw,env,email,approve};
}
test('approval transition durably queues one message; content contains sign-in link and no vault data',async()=>{
 const {raw,env,email,approve}=setup();approve();approve();assert.equal(raw.prepare('SELECT count(*) n FROM approval_emails').get().n,1);
 let calls=0;const request=async(url,options)=>{calls++;assert.equal(url,'https://api.resend.com/emails');const body=JSON.parse(options.body);assert.deepEqual(body.to,[email]);assert.match(body.text,/https:\/\/passwords.example.test\/auth\/login/);assert.ok(options.headers['Idempotency-Key']);return Response.json({id:'provider-id'});};
 assert.equal((await sendApproval(env,email,{request,now:100})).state,'sent');assert.equal((await sendApproval(env,email,{request,now:101})).state,'sent');assert.equal(calls,1);raw.close();
});
test('concurrent workers share a durable lease and retry ambiguous responses with the exact same payload and key',async()=>{
 const {raw,env,email,approve}=setup();approve();let release,entered;const started=new Promise(r=>entered=r),hold=new Promise(r=>release=r);const observed=[];
 const request=async(url,options)=>{observed.push(options);entered();await hold;throw new Error('lost response');};
 const sending=sendApproval(env,email,{request,now:100});await started;
 assert.equal((await sendApproval(env,email,{request,now:101})).state,'sending');release();assert.equal((await sending).state,'uncertain');
 env.EMAIL_FROM='Changed <different@example.test>';
 const retry=async(url,options)=>{assert.equal(options.body,observed[0].body);assert.equal(options.headers['Idempotency-Key'],observed[0].headers['Idempotency-Key']);return Response.json({id:'accepted-original'});};
 assert.equal((await sendApproval(env,email,{request:retry,now:102})).state,'sent');assert.equal(observed.length,1);raw.close();
});
test('missing sender, expired retry window and revocation never silently send email',async()=>{
 const {raw,env,email,approve}=setup();approve();const request=async()=>{throw new Error('must not call');};
 const noKey={...env,RESEND_API_KEY:''};assert.equal((await sendApproval(noKey,email,{request})).state,'pending');assert.equal(raw.prepare('SELECT first_attempt FROM approval_emails').get().first_attempt,null);
 raw.exec("UPDATE approval_emails SET first_attempt=100,state='uncertain'");assert.equal((await sendApproval(env,email,{request,now:100+23*3600})).state,'review');
 raw.exec("UPDATE access_requests SET status='declined'");assert.equal((await sendApproval(env,email,{request,now:101})).state,'cancelled');
 approve();assert.equal(raw.prepare('SELECT count(*) n FROM approval_emails').get().n,2);raw.close();
});
test('provider rejection remains retryable and is never reported as delivery',async()=>{
 const {raw,env,email,approve}=setup();approve();const result=await sendApproval(env,email,{now:100,request:async()=>Response.json({message:'private provider detail'},{status:403})});
 assert.equal(result.state,'uncertain');assert.match(result.detail,/HTTP 403/);assert.ok(!result.detail.includes('private provider detail'));raw.close();
 const body=approvalMessage('a<&@example.test',{ORIGIN:'https://passwords.example.test',EMAIL_FROM:'x'});assert.match(body.html,/a&lt;&amp;@example.test/);
});

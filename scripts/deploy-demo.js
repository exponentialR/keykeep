import {spawnSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const root=resolve(new URL('..',import.meta.url).pathname);
const project=process.env.KEYKEEP_DEMO_PROJECT;
if(!project||!/^[a-z0-9-]+$/.test(project))throw new Error('Set KEYKEEP_DEMO_PROJECT to the separate sample-only Pages project.');
await import('./build-demo.js');
// A separate working directory prevents the private Worker/D1 configuration
// from being discovered and attached to this static demonstration.
const staging=await mkdtemp(join(tmpdir(),'keykeep-demo-deploy-'));
try{
 const result=spawnSync(join(root,'node_modules/.bin/wrangler'),['pages','deploy',join(root,'demo-dist'),'--project-name',project,'--branch','main'],{cwd:staging,stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0)process.exitCode=result.status||1;
}finally{await rm(staging,{recursive:true,force:true});}

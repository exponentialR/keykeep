import {existsSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const config='.local/wrangler.jsonc';
if(!existsSync(config))throw new Error('Create .local/wrangler.jsonc from the hosting template first.');
const project=JSON.parse(readFileSync(config,'utf8')).name;
for(const [command,args,cwd]of [['npm',['run','build:cloud'],'.'],['npx',['wrangler','pages','deploy','../dist','--project-name',project,'--branch','main','--commit-dirty=true'],'.local']]){
 const result=spawnSync(command,args,{stdio:'inherit',cwd});if(result.status!==0)process.exit(result.status||1);
}

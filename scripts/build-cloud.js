import {mkdir,copyFile,writeFile,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});
for(const name of ['welcome.html','welcome.js','admin.html','admin.js','account.js','demo.js','index.html','app.js','crypto.js','model.js','sync.js','reconcile.js','style.css','pwa.js','sw.js','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png'])await copyFile(name,'dist/'+name);
await writeFile('dist/_routes.json',JSON.stringify({version:1,include:['/*'],exclude:[]}));

for(const [folder,file] of [['public','welcome.html'],['private','index.html'],['manage','admin.html']]){await mkdir('dist/'+folder,{recursive:true});await copyFile(file,'dist/'+folder+'/index.html');}
await import('./build-demo.js');

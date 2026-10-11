import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
await mkdir('demo-dist',{recursive:true});
let html=await readFile('index.html','utf8');
html=html.replace('<html lang="en">','<html lang="en" data-mode="demo">').replace('<title>Keykeep · Password generator</title>','<title>Keykeep · Try the demo</title>').replace('<main id="private-ui" inert>','<main id="private-ui" inert><p class="demo-banner" role="note">Sample-only demo · Use <strong>keykeep-demo-only</strong> to unlock. Reload resets everything. Please use fictional passwords here.</p>').replace(/<link rel="manifest"[^>]*>/,'').replace(/<script type="module" src="\/pwa.js[^>]*><\/script>/,'');
html=html.replace(/<details class="install-help">[\s\S]*?<\/details>/,'');
await writeFile('demo-dist/index.html',html);
await writeFile('demo-dist/_headers',`/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Cache-Control: no-store
`);
for(const name of ['app.js','account.js','demo.js','crypto.js','model.js','sync.js','reconcile.js','style.css','icon.svg','icon-192.png','icon-512.png'])await copyFile(name,'demo-dist/'+name);

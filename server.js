import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const demoFiles=['app.js','account.js','demo.js','crypto.js','model.js','sync.js','reconcile.js','style.css','icon.svg','icon-192.png','icon-512.png'];
const files = new Map([
  ['/',['index.html','text/html']], ['/demo',['demo-dist/index.html','text/html']], ['/demo/',['demo-dist/index.html','text/html']], ...demoFiles.map(name=>['/demo/'+name,['demo-dist/'+name,name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'image/png']]), ...['app.js','account.js','crypto.js','model.js','sync.js','reconcile.js','pwa.js','sw.js'].map(name=>['/'+name,[name,'text/javascript']]),
  ['/style.css',['style.css','text/css']], ['/manifest.webmanifest',['manifest.webmanifest','application/manifest+json']],
  ['/icon.svg',['icon.svg','image/svg+xml']], ...[192,512].map(size=>[`/icon-${size}.png`,[`icon-${size}.png`,'image/png']]),
]);
export function createServer() {
  return http.createServer(async (req,res) => {
    const headers = {'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'", 'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
    if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host || '')) {res.writeHead(403,headers);return res.end('Use the 127.0.0.1 address.');}
    if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405,headers);return res.end('Method not allowed');}
    const file = files.get(req.url.split('?')[0]);
    if (!file) {res.writeHead(404,headers);return res.end('Not found');}
    try {let data=await readFile(new URL(file[0],import.meta.url));if(file[0]==='demo-dist/index.html')data=Buffer.from(data.toString().replace(/(src|href)="\/(app\.js[^"]*|style\.css[^"]*|icon[^"]*)"/g,'$1="/demo/$2"')); res.writeHead(200,{...headers,'Content-Type':file[1]});res.end(req.method==='HEAD'?undefined:data);}
    catch {res.writeHead(500,headers);res.end('Unable to load app');}
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.KEYKEEP_PORT || 4173);
  createServer().listen(port,'127.0.0.1',()=>console.log(`Open http://127.0.0.1:${port}`));
}

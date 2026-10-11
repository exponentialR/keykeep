import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createServer} from './server.js';
test('server serves install assets and rejects unexpected hosts, paths and writes',async()=>{
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const root=`http://127.0.0.1:${server.address().port}`;
  try {
    for(const path of ['/','/sw.js','/model.js','/pwa.js','/manifest.webmanifest','/icon-192.png','/icon-512.png']){
      const res=await fetch(root+path);assert.equal(res.status,200,path);assert.match(res.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    }
    assert.equal((await fetch(root+'/constructor')).status,404);
    assert.equal((await fetch(root+'/.git/config')).status,404);
    assert.equal((await fetch(root+'/',{method:'POST',body:'secret'})).status,405);
    const status=await new Promise((resolve,reject)=>{const request=http.get(root+'/',{headers:{Host:'attacker.invalid'}},res=>{res.resume();resolve(res.statusCode);});request.on('error',reject);});
    assert.equal(status,403);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

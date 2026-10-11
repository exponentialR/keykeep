// v7: retire cached private app shells. Opening the app requires server admission.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys())if(name.startsWith('keykeep-shell-'))await caches.delete(name);
  await self.clients.claim();
})()));
// No fetch cache: never serve a private shell after logout or account switching.

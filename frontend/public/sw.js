const CACHE_NAME='inbox9-shell-v2';
const SHELL=['/','/index.html','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png'];

self.addEventListener('install', event=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache=>cache.addAll(SHELL))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate', event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(
      keys
        .filter(key=>key.startsWith('inbox9-shell-')&&key!==CACHE_NAME)
        .map(key=>caches.delete(key))
    );
    await self.clients.claim();

    // Existing sessions may still be running the previous cached bundle.
    // Navigate controlled windows after the new worker activates so they pick
    // up the new HTML entry and hashed assets immediately.
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    await Promise.all(clients.map(client=>{
      if(typeof client.navigate!=='function') return undefined;
      try { return client.navigate(client.url); } catch { return undefined; }
    }));
  })());
});

self.addEventListener('fetch', event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin || url.pathname.startsWith('/api/')) return;

  if(request.mode==='navigate'){
    event.respondWith(
      fetch(request, {cache:'no-store'})
        .then(response=>{
          const copy=response.clone();
          void caches.open(CACHE_NAME).then(cache=>cache.put('/index.html',copy));
          return response;
        })
        .catch(()=>caches.match('/index.html'))
    );
    return;
  }

  const cacheable=['script','style','image','font'].includes(request.destination);
  if(!cacheable) return;

  // Hashed Vite assets are safe to cache, while new HTML is always fetched
  // from the network so deployments cannot remain pinned to an old bundle.
  event.respondWith(
    caches.match(request)
      .then(cached=>cached||fetch(request).then(response=>{
        if(response.ok){
          const copy=response.clone();
          void caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));
        }
        return response;
      }))
  );
});

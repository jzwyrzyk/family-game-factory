// Replace the old worker at its original scope only after the owner approves retirement.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const scope=new URL(self.registration.scope),prefix='family-arcade:'+scope.pathname+':';
 for(const name of await caches.keys())if(name.startsWith(prefix))await caches.delete(name);
 await self.clients.claim();
 const tabs=await self.clients.matchAll({type:'window'});
 await self.registration.unregister();
 for(const tab of tabs){const at=new URL(tab.url);if(at.origin===scope.origin&&at.pathname.startsWith(scope.pathname))await tab.navigate(scope.href);}
})()));

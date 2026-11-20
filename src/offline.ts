import {setIconLabel} from './brand/icons';

// Only the reviewed static shell is cached. Authenticated APIs/previews are never cached.
export function installOffline(){
 if(!window.isSecureContext)return;
 // Sandboxed game previews can throw on the serviceWorker getter itself.
 // Offline caching is optional and must never interrupt gameplay.
 let serviceWorker:ServiceWorkerContainer|undefined;
 try{serviceWorker=navigator.serviceWorker;}catch{return;}
 if(!serviceWorker)return;
 serviceWorker.register(new URL('sw.js',document.baseURI),{scope:'./'}).then(reg=>{
  const offer=()=>{if(!reg.waiting)return;const bar=document.createElement('div');bar.className='notice factory-update-notice';bar.setAttribute('role','status');bar.append('A jems update is ready. Saved games and learning progress stay on this device. ');const b=document.createElement('button');b.className='btn secondary';setIconLabel(b,'download','Update jems');b.onclick=()=>{serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});reg.waiting?.postMessage({type:'ACTIVATE_REVIEWED_UPDATE'});};bar.append(b);document.body.append(bar)};
  offer();reg.addEventListener('updatefound',()=>reg.installing?.addEventListener('statechange',()=>{if(reg.waiting)offer()}));
 }).catch(()=>{/* Cached play is optional; online play remains available. */});
}

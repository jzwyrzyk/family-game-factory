import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import type {Plugin} from 'vite';
export function offlineBuild():Plugin{
 let dir='dist';
 return {name:'reviewed-offline-shell',configResolved(config){dir=path.resolve(config.root,config.build.outDir);},closeBundle(){
 const files=(base:string):string[]=>fs.readdirSync(path.join(dir,base),{withFileTypes:true}).flatMap(f=>f.isDirectory()?files(path.join(base,f.name)):[path.join(base,f.name)]);
 const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();const dirty=!!execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim();fs.writeFileSync(path.join(dir,'build-info.json'),JSON.stringify({sha,dirty}));
 const list=files('').filter(f=>!['sw.js','factory-config.json'].includes(f)).sort();const hash=createHash('sha256');for(const f of list)hash.update(f).update(fs.readFileSync(path.join(dir,f)));const version=hash.digest('hex');
 // Ship the reusable library without downloading every unused cover and pose on
 // first visit. Current UI art remains in the offline shell; optional static art
 // is cached only when requested. The native-resolution Gem Pal WebPs are
 // also on-demand; their small manifest remains in the shell so offline image
 // selection can resolve already-viewed assets. Private APIs stay excluded.
 const coreArt=new Set(['hero_workshop','spot_first_idea','character_spark_wave','character_spark_think','character_spark_rest','character_spark_celebrate','character_spark_recover','spot_work_in_progress','spot_reconnect','spot_safe_storage'].map(id=>'jems-art/'+id+'.webp'));
 coreArt.add('jems-art/icons/jems-icons.svg');
 // A fresh offline installation can build a world with every bundled prop.
 coreArt.add('jems-art/gem_coral.webp');
 const precache=list.filter(f=>(!f.startsWith('jems-art/')||coreArt.has(f))&&(!f.startsWith('jems-pals/')||f==='jems-pals/manifest.json')&&!f.startsWith('jems-pals-extra/'));
 fs.writeFileSync(path.join(dir,'sw.js'),`const paths=${JSON.stringify(list)},precachePaths=${JSON.stringify(precache)},version=${JSON.stringify(version)};
const prefix='family-arcade:'+new URL(self.registration.scope).pathname+':',key=prefix+version;
const urls=paths.map(p=>new URL(p,self.registration.scope).href);
const precacheUrls=precachePaths.map(p=>new URL(p,self.registration.scope).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(key).then(c=>c.addAll(precacheUrls))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(prefix)&&k!==key).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',e=>{if(e.data?.type==='ACTIVATE_REVIEWED_UPDATE')self.skipWaiting()});
self.addEventListener('fetch',event=>{const r=event.request;if(r.method!=='GET')return;const u=new URL(r.url);if(u.origin!==self.location.origin)return;u.hash='';const target=r.mode==='navigate'&&u.href.startsWith(self.registration.scope)?new URL('index.html',self.registration.scope).href:u.href;if(!urls.includes(target))return;event.respondWith(caches.open(key).then(async c=>{const cached=await c.match(target);if(cached)return cached;const response=await fetch(r);if(response.ok){try{await c.put(target,response.clone());}catch{/* Optional offline storage must not hide a successful network response. */}}return response;}));});`);
}}}

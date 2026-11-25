const {exploreWelcome,navigate}=require('./studio-entry.cjs');
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {once}=require('node:events');
const fs=require('node:fs'),path=require('node:path');
const vm=require('node:vm');
// The cache/game smoke test starts after a recent question; math stays enabled.
(async()=>{
 const root=path.resolve(__dirname,'..');
 const palManifest=JSON.parse(fs.readFileSync(path.join(root,'public/jems-pals/manifest.json'),'utf8'));
 const palAssets=palManifest.characters.flatMap(character=>Object.values(character.forms).flatMap(form=>Object.values(form.expressions)));
 assert.equal(palAssets.length,168,'offline policy covers the complete approved core artwork set');
 const sw=fs.readFileSync(path.join(root,'dist/sw.js'),'utf8');
 const swLists=sw.match(/^const paths=(.*),precachePaths=(.*),version=[^\n]+;/);
 assert.ok(swLists,'built service worker exposes its exact public-path and precache allowlists');
 const allowedPaths=JSON.parse(swLists[1]),precachePaths=JSON.parse(swLists[2]);
 const historicalArt=require('../src/pals/historical-scene-art.json');
 assert.equal(historicalArt.length,4);
 for(const asset of [...palAssets,...historicalArt])assert.ok(allowedPaths.includes(asset.url),asset.url+' remains available for on-demand offline caching');
 assert.ok(!precachePaths.some(asset=>asset.startsWith('jems-pals/')&&asset.endsWith('.webp')),'service-worker installation must not download the 168-image Gem Pal library');
 assert.ok(precachePaths.includes('jems-pals/manifest.json'),'small versioned Pal metadata remains available offline');
 assert.ok(!precachePaths.some(asset=>asset.startsWith('jems-pals-extra/')),'Brio neutral artwork is also requested on demand');
 // Exercise the built worker's fetch handler with unavailable cache capacity.
 // A network response remains usable even when saving it for offline use fails.
 let fetchHandler,networkRequests=0,cacheWrites=0;
 const workerScope='https://offline-fixture.test/arcade/';
 const networkResponse=new Response('available Pal image',{headers:{'content-type':'image/webp'}});
 vm.runInNewContext(sw,{
  URL,
  self:{location:{origin:new URL(workerScope).origin},registration:{scope:workerScope},addEventListener(type,handler){if(type==='fetch')fetchHandler=handler;}},
  caches:{async open(){return {async match(){return undefined;},async put(){cacheWrites++;throw new DOMException('Offline cache is full','QuotaExceededError');}};}},
  async fetch(){networkRequests++;return networkResponse;},
 });
 assert.equal(typeof fetchHandler,'function');
 let quotaResponse;
 fetchHandler({request:{method:'GET',mode:'cors',url:new URL(palAssets[0].url,workerScope).href},respondWith(response){quotaResponse=response;}});
 assert.equal(await quotaResponse,networkResponse,'cache quota cannot discard a successful online Pal response');
 assert.equal(await(await quotaResponse).text(),'available Pal image','the response body remains intact after failed caching');
 assert.equal(cacheWrites,1,'the worker attempts one optional cache write');
 for(const request of [
  {method:'POST',mode:'cors',url:new URL(palAssets[0].url,workerScope).href},
  {method:'GET',mode:'cors',url:new URL('v1/jobs',workerScope).href},
  {method:'GET',mode:'cors',url:'https://another-origin.test/arcade/'+palAssets[0].url},
 ])fetchHandler({request,respondWith(){assert.fail('quota recovery must not intercept private, state-changing or foreign requests');}});
 assert.equal(networkRequests,1,'only the allowlisted public image reaches the worker network/cache path');
 const server=require('./browser-server.cjs').start();if(!server.listening)await once(server,'listening');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
 const base=`http://127.0.0.1:${server.address().port}/arcade/`;
 try{
  const context=await browser.newContext(),page=await context.newPage();
  await page.goto(base+'?arcade=1');await page.waitForFunction(()=>navigator.serviceWorker.controller);
  await page.evaluate(()=>{FG.store.changeProfile({rate:1});FG.store.current().mathWindow=[Date.now()];FG.store.save()});
  const cached=await page.evaluate(async()=>{const c=await caches.open((await caches.keys())[0]);return (await c.keys()).map(r=>r.url)});
  assert.ok(cached.some(x=>x.endsWith('queen.png')));
  assert.ok(!cached.some(x=>/factory-config|\/v1\/|\/preview/.test(x)));
  const activeArt=['hero_workshop','spot_first_idea','character_spark_wave','character_spark_think','character_spark_rest','character_spark_celebrate','character_spark_recover','spot_work_in_progress','spot_reconnect','spot_safe_storage'].map(id=>'jems-art/'+id+'.webp');
  const activeBrand=['jems-art/icons/jems-icons.svg',...activeArt];
  for(const asset of activeBrand)assert.ok(cached.includes(new URL(asset,base).href),asset+' is installed before a child first needs it offline');
  assert.ok(!cached.some(x=>x.endsWith('jems-art/hero_gembots.webp')),'unused cover is not downloaded during installation');
  assert.ok(cached.includes(new URL('jems-pals/manifest.json',base).href),'the plain Pal manifest URL is installed for offline selection');
  assert.ok(!cached.some(x=>/\/jems-pals\/.*\.webp$/.test(x)),'no Pal portrait is downloaded by service-worker installation');
  const selectedPal=palManifest.characters.find(character=>character.slug==='navi').forms.base.expressions.neutral;
  const viewedPal=await page.evaluate(async asset=>{
   const url=new URL(asset.url,document.baseURI).href;
   const response=await fetch(url),bytes=await response.arrayBuffer();
   const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(value=>value.toString(16).padStart(2,'0')).join('');
   const c=await caches.open((await caches.keys())[0]);
   return {ok:response.ok,bytes:bytes.byteLength,sha,cached:!!await c.match(url)};
  },selectedPal);
  assert.deepEqual(viewedPal,{ok:true,bytes:selectedPal.exportedBytes,sha:selectedPal.exportedSHA256,cached:true},'viewing one exact Pal asset caches only its approved bytes');
  const optional=await page.evaluate(async()=>{
   const response=await fetch('./jems-art/hero_gembots.webp');const c=await caches.open((await caches.keys())[0]);
   return response.ok&&!!await c.match(new URL('./jems-art/hero_gembots.webp',document.baseURI).href);
  });
  assert.ok(optional,'an explicitly requested known static cover is cached for subsequent offline use');
  const info=await page.evaluate(()=>fetch('./build-info.json').then(r=>r.json()));assert.match(info.sha,/^[a-f0-9]{40}$/);
  await context.setOffline(true);
  const offlinePalManifest=await page.evaluate(()=>fetch(new URL('jems-pals/manifest.json',document.baseURI)).then(response=>response.json()));
  assert.deepEqual(offlinePalManifest,palManifest,'offline lookup returns the complete exact manifest without a query-string exception');
  const offlinePal=await page.evaluate(async asset=>{
   const response=await fetch(new URL(asset.url,document.baseURI)),bytes=await response.arrayBuffer();
   const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(value=>value.toString(16).padStart(2,'0')).join('');
   return {ok:response.ok,bytes:bytes.byteLength,sha};
  },selectedPal);
  assert.deepEqual(offlinePal,{ok:true,bytes:selectedPal.exportedBytes,sha:selectedPal.exportedSHA256},'a previously viewed Pal remains available with exact bytes offline');
  assert.equal(await page.evaluate(()=>fetch('./jems-art/hero_gembots.webp').then(r=>r.ok)),true,'previously used optional art remains available offline');
  const offlineAssets=await page.evaluate(async paths=>Promise.all(paths.map(async path=>{
   const response=await fetch(new URL(path,document.baseURI));return {path,ok:response.ok,size:(await response.arrayBuffer()).byteLength};
  })),activeBrand);
  assert.ok(offlineAssets.every(asset=>asset.ok&&asset.size>0),'every active icon and state illustration has real offline bytes');
  await page.reload();await page.waitForFunction(()=>window.FG?.app);
  await page.evaluate(()=>FG.app.openGame('dragon'));await page.waitForFunction(()=>FG.runtime.snapshot().state.assets===22);
  await page.locator('#startBtn').click();assert.equal(await page.evaluate(()=>FG.runtime.snapshot().state.dragonHP),2);
  await page.locator('#game-mount').screenshot({path:'test-results/offline-original-dragon.png'});
  await page.goto(base);await page.waitForFunction(()=>window.FG?.studio);await exploreWelcome(page);
  await page.waitForFunction(()=>document.querySelector('#studioNavHome svg')?.getBBox().width>0);
  assert.match(await page.locator('#studioNavHome use').getAttribute('href'),/\/arcade\/jems-art\/icons\/jems-icons\.svg#jems-home$/,'offline navigation resolves the same sprite below the site base');
  await page.waitForFunction(()=>!!FG.pals?.view());
  await navigate(page,'#studioNavPals');
  await page.locator('#page-jems-pals').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.getElementById('page-jems-pals')?.getAttribute('aria-busy')==='false');
  const naviCard=page.locator('.pals-card[data-pal="navi"]');
  // A quiet collection refresh can replace cards while aria-busy stays false.
  // Re-resolve each poll and let scrolling trigger the native lazy image load.
  await page.waitForFunction(async url=>{
   const card=document.querySelector('.pals-card[data-pal="navi"]'),image=card?.querySelector('img');
   if(!(card instanceof HTMLElement)||!(image instanceof HTMLImageElement))return false;
   card.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
   const expected=new URL(url,document.baseURI).href;
   if(image.src!==expected||!image.complete||image.naturalWidth===0)return false;
   try{await image.decode();}catch{return false;}
   return card.isConnected&&image.isConnected&&document.querySelector('.pals-card[data-pal="navi"] img')===image
    &&image.currentSrc===expected&&image.complete&&image.naturalWidth>0;
  },selectedPal.url,{timeout:30_000});
  assert.match(await naviCard.locator('img').getAttribute('src'), /jems-pals\/navi\/base\/neutral-/,'the actual collection renders previously viewed approved pixels offline');
  assert.equal(await page.locator('[data-pals-focus="starter-navi"]').count(),1,'offline collection still offers the free starter');
  await page.locator('#jemsPalsBack').click();
  await navigate(page,'#studioNavCreate');
  await page.waitForFunction(()=>document.querySelector('[data-helper-pose="wave"]')?.naturalWidth>0);
  assert.equal(await page.locator('[data-helper-pose="wave"]').isVisible(),true,'the idle helper also renders after an offline navigation');
  await page.evaluate(async()=>{await Promise.all([...document.querySelectorAll('#studioCreationHero > img,.jems-helper-mark')].map(img=>img.decode()));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  await page.screenshot({path:'test-results/offline-branded-studio.png',fullPage:false});
  console.log('PASS offline: native game, base-path SVG icons, active state art, on-demand Pal pixels and manifest, cache-quota recovery, excluded private endpoints and build identity');
  await context.close();
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1});

const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {once}=require('node:events');
// The cache/game smoke test starts after a recent question; math stays enabled.
(async()=>{
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
  const optional=await page.evaluate(async()=>{
   const response=await fetch('./jems-art/hero_gembots.webp');const c=await caches.open((await caches.keys())[0]);
   return response.ok&&!!await c.match(new URL('./jems-art/hero_gembots.webp',document.baseURI).href);
  });
  assert.ok(optional,'an explicitly requested known static cover is cached for subsequent offline use');
  const info=await page.evaluate(()=>fetch('./build-info.json').then(r=>r.json()));assert.match(info.sha,/^[a-f0-9]{40}$/);
  await context.setOffline(true);
  assert.equal(await page.evaluate(()=>fetch('./jems-art/hero_gembots.webp').then(r=>r.ok)),true,'previously used optional art remains available offline');
  const offlineAssets=await page.evaluate(async paths=>Promise.all(paths.map(async path=>{
   const response=await fetch(new URL(path,document.baseURI));return {path,ok:response.ok,size:(await response.arrayBuffer()).byteLength};
  })),activeBrand);
  assert.ok(offlineAssets.every(asset=>asset.ok&&asset.size>0),'every active icon and state illustration has real offline bytes');
  await page.reload();await page.waitForFunction(()=>window.FG?.app);
  await page.evaluate(()=>FG.app.openGame('dragon'));await page.waitForFunction(()=>FG.runtime.snapshot().state.assets===22);
  await page.locator('#startBtn').click();assert.equal(await page.evaluate(()=>FG.runtime.snapshot().state.dragonHP),2);
  await page.locator('#game-mount').screenshot({path:'test-results/offline-original-dragon.png'});
  await page.goto(base);await page.waitForFunction(()=>window.FG?.studio);
  await page.waitForFunction(()=>document.querySelector('#studioNavHome svg')?.getBBox().width>0);
  assert.match(await page.locator('#studioNavHome use').getAttribute('href'),/\/arcade\/jems-art\/icons\/jems-icons\.svg#jems-home$/,'offline navigation resolves the same sprite below the site base');
  await page.locator('#studioNavCreate').click();
  await page.waitForFunction(()=>document.querySelector('[data-helper-pose="wave"]')?.naturalWidth>0);
  assert.equal(await page.locator('[data-helper-pose="wave"]').isVisible(),true,'the idle helper also renders after an offline navigation');
  await page.evaluate(async()=>{await Promise.all([...document.querySelectorAll('#studioCreationHero > img,.jems-helper-mark')].map(img=>img.decode()));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  await page.screenshot({path:'test-results/offline-branded-studio.png',fullPage:false});
  console.log('PASS offline: native game, base-path SVG icons, active state art, optional caching, excluded private endpoints and build identity');
  await context.close();
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1});

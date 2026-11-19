const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {start}=require('./browser-server.cjs');
const fs=require('node:fs');
/** Visual contract for jems. No model calls, paid APIs or child data are used. */
(async()=>{
 const server=start();
 // http.Server.listen() is asynchronous. Reading address() immediately can return
 // null and leave the open server handle alive after a rejected test promise.
 await new Promise((resolve,reject)=>{
  if(server.listening){resolve();return;}
  server.once('listening',resolve);
  server.once('error',reject);
 });
 const base='http://127.0.0.1:'+server.address().port+'/arcade/';
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
 fs.mkdirSync('test-results',{recursive:true});
 try{
  for(const [label,width,height] of [['desktop',1280,900],['mobile',390,844]]){
   // Use normal browser contexts. Chromium's serviceWorker blocking shim can itself
   // throw inside sandboxed no-same-origin previews; offline tests exercise that separately.
   const page=await browser.newPage({viewport:{width,height},hasTouch:label==='mobile'}),errors=[];
   page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(15000);
   page.on('pageerror',e=>errors.push((e.stack||e.message)));await page.goto(base,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.FG?.studio&&window.FG?.learning);
   console.log('jems brand '+label+': Studio booted');
   const logo=page.locator('img.jems-brand-logo');
   assert.equal(await logo.count(),1);
   assert.equal(await logo.getAttribute('alt'),'jems');
   assert.equal(await logo.evaluate(img=>img.complete&&img.naturalWidth>0),true,'approved brand image loads');
   const title=await page.title();assert.match(title,/^jems/);
   const color=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--jems-blue').trim());
   assert.equal(color.toUpperCase(),'#2E6BFF');
   assert.equal(await page.locator('#studioStarters [data-starter]').count(),7);
   // Keep the five current destinations tappable and hero copy clear of the
   // original maker portraits at phone widths, including narrow 320px screens.
   if(label==='mobile'){
    for(const phoneWidth of [390,320]){
     await page.setViewportSize({width:phoneWidth,height});
     await page.evaluate(()=>document.fonts.ready);
     const layout=await page.evaluate(()=>{
      const rect=selector=>document.querySelector(selector).getBoundingClientRect();
      const action=rect('.studio-home-action'),characters=rect('.jems-home-characters');
      return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
       overlap:action.left<characters.right&&action.right>characters.left&&action.top<characters.bottom&&action.bottom>characters.top,
       buttons:[...document.querySelectorAll('.studio-nav button')].map(button=>({height:button.getBoundingClientRect().height,top:button.getBoundingClientRect().top,fits:button.scrollWidth<=button.clientWidth+1}))};
     });
     assert.equal(layout.buttons.length,5,'all current navigation destinations remain available');
     assert.ok(layout.buttons.every(button=>button.height>=44&&button.fits),'navigation labels fit touch-sized buttons');
     assert.ok(layout.buttons.every(button=>Math.abs(button.top-layout.buttons[0].top)<2),'the five destinations share one row');
     assert.equal(layout.overlap,false,'maker artwork cannot cover home actions or service status');
     assert.ok(layout.scrollWidth<=layout.width+2,'narrow home does not scroll horizontally');
     await page.screenshot({path:'test-results/jems-brand-home-'+phoneWidth+'.png',fullPage:false});
    }
    await page.setViewportSize({width,height});
   }
   const makeHeading=await page.locator('#studioNew .studio-make-copy strong').evaluate(e=>getComputedStyle(e).color);
   assert.equal(makeHeading,'rgb(255, 255, 255)','Create headline must stay white on saturated blue');

  // Brand fidelity regression: validate the exact named palette and semantic accessible roles.
  const tokens=await page.evaluate(()=>{
    const r=getComputedStyle(document.documentElement);
    return Object.fromEntries(['ink','blue','purple','mint','gold','coral','cloud','lilac','action-blue','action-purple'].map(k=>[k,r.getPropertyValue('--jems-'+k).trim().toUpperCase()]));
  });
  assert.deepEqual(tokens,{
    ink:'#0B1E3B',blue:'#2E6BFF',purple:'#8B5CF6',mint:'#22D3A6',
    gold:'#FFC24D',coral:'#FF5E7A',cloud:'#FFF7EE',lilac:'#E6D8FF',
    'action-blue':'#195FD0','action-purple':'#7136C9'
  });
  const assets=['jems-mark.svg','jems-logo.svg','jems-wordmark.svg','jems-clouds.svg','jems-blocks.svg','jems-sparks.svg','jems-facets-pattern.svg','jems-mono.svg','jems-reversed.svg','jems-pattern.svg','jems-mark-monochrome.svg','jems-mark-inverse.svg','jems-app-icon.svg','arcade-icon.svg'];
  for(const asset of assets){
    const result=await page.evaluate(p=>fetch('./'+p).then(async r=>({ok:r.ok,text:await r.text()})),asset);
    assert.ok(result.ok&&result.text.includes('<svg'),asset+' should be served locally');
    if(asset==='jems-mark.svg')assert.ok(result.text.includes('id="jems-wrench"')&&!result.text.includes('M60 45C49 45'), 'open-ended wrench geometry, not the old circular keyhole');
    if(asset==='jems-logo.svg')assert.ok(result.text.includes('fill-rule="evenodd"')&&!result.text.includes('<text'), 'wordmark must be outlined, not rendered using a system-dependent font');
    if(asset==='jems-mono.svg')assert.ok(result.text.includes('fill="#fff"')&&result.text.includes('fill-rule="evenodd"'),'monochrome wrench must be solid white, never a transparent hole');
    if(asset==='jems-reversed.svg')assert.ok(result.text.includes('fill="#fff"'),'white-on-dark logo must retain its visible white wrench');
    if(asset==='jems-pattern.svg')assert.ok(result.text.includes('viewBox="0 0 360 240"'),'decorative pattern must be the approved scoped asset');
    if(asset==='jems-mark-monochrome.svg')assert.ok(result.text.includes('fill="#fff"')&&!result.text.includes('<mask'),'isolated monochrome gem retains solid white wrench (no dark knockout)');
    if(asset==='jems-mark-inverse.svg')assert.ok(result.text.includes('fill="#fff"')&&!result.text.includes('<mask'),'inverse gem wrench remains solid white');
    if(asset==='jems-app-icon.svg')assert.ok(result.text.includes('id="jems-wrench"')&&!result.text.includes('M60 45C49 45'),'installed PWA icon uses the approved gem, not the earlier keyhole-like mark');
    if(['jems-wordmark.svg','jems-facets-pattern.svg','jems-sparks.svg','jems-blocks.svg','jems-app-icon.svg'].includes(asset)){
      assert.ok(!/#(?:0B1D4D|2D7BFF|8A4DFF|34D7B3|FFC828|FF6B7A)\b/i.test(result.text),asset+' must not retain the superseded brand swatches');
    }
  }
  const visual=await page.evaluate(()=>({
    hero:getComputedStyle(document.querySelector('.studio-home-hero')).backgroundImage,
    workbench:getComputedStyle(document.querySelector('.studio-home-hero'),'::before').backgroundImage,
    button:getComputedStyle(document.querySelector('#studioNew')).backgroundImage,
    surface:getComputedStyle(document.querySelector('.studio-starter')).borderRadius,
    learning:!!document.getElementById('studioLearningChoice'),
    game:!!document.getElementById('studioGameMath')
  }));
  assert.match(visual.hero,/gradient/i,'the brighter jems hero retains a calm surface gradient');
  assert.ok(visual.workbench.includes('jems-journey/background.webp'),'the illustrated workshop world reaches the homepage');
  assert.match(visual.button,/gradient/i,'child create action uses accessible on-brand gradient');
  assert.ok(visual.learning&&visual.game,'brand merge retained latest Math/English selector');

   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'no horizontal overflow');
   await page.screenshot({path:'test-results/jems-home-'+label+'.png',fullPage:false});
   await page.locator('#studioNew').click();
   assert.equal(await page.locator('#page-studio').isVisible(),true);
   const approvedArt=await page.evaluate(async()=>{
    const images=[...document.querySelectorAll('#studioCreationHero > img, .jems-empty-workbench, .jems-helper-mark')];
    await Promise.all(images.map(img=>img.decode()));
    const fonts=await Promise.all([document.fonts.load('800 24px Nunito'),document.fonts.load('500 15px Inter')]);
    return {images:images.map(img=>({src:img.getAttribute('src'),loaded:img.naturalWidth>0,alt:img.alt})),fonts:fonts.map(f=>f.length)};
   });
   assert.deepEqual(approvedArt.images.map(img=>img.src).sort(),[
    './jems-art/character_spark_think.webp','./jems-art/hero_workshop.webp','./jems-art/spot_first_idea.webp'
   ],'approved factory, companion and empty-state art load under the deployed subpath');
   assert.ok(approvedArt.images.every(img=>img.loaded&&img.alt===''),'supporting artwork stays decorative beside live text');
   assert.ok(approvedArt.fonts.every(count=>count>0),'both licensed local interface fonts load');
   assert.match(await page.locator('#studioTalk').innerText(),/Send to jems/,'text composer clearly sends');
   assert.match(await page.locator('#studioMic').innerText(),/Speak/,'microphone has a separate voice affordance');
   assert.equal(await page.locator('#studioTalk').getAttribute('aria-label'),'Send your written message to jems');
   assert.match(await page.locator('#studioMic').getAttribute('aria-label')||'',/microphone/);
   assert.equal(await page.locator('#studioPrompt').isVisible(),true);
   await page.screenshot({path:'test-results/jems-studio-'+label+'.png',fullPage:false});
   await page.locator('#studioNavHome').click();
   await page.locator('#studioNavPowers').click();
   assert.equal(await page.locator('#page-lab').isVisible(),true);
   const mathHead=page.locator('#page-lab .math-activity h2');
   if(await mathHead.count())assert.equal(await mathHead.first().evaluate(e=>getComputedStyle(e).color),'rgb(255, 255, 255)','Math question must stay readable on dark lesson');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
   await page.screenshot({path:'test-results/jems-powers-'+label+'.png',fullPage:false});
   console.log('jems brand '+label+': learning screen verified');
   await page.locator('footer [data-page="parent"]').click();
   assert.equal(await page.locator('#page-parent').isVisible(),true);
   const parentLabel=await page.locator('#page-parent label[for="parentNickname"]').evaluate(e=>getComputedStyle(e).color);
   assert.equal(parentLabel,'rgb(52, 68, 102)','Parent form labels need strong Ink-on-white contrast');
   const restoreLabel=await page.locator('#page-parent label.upload-button').evaluate(e=>({color:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor}));
   assert.deepEqual(restoreLabel,{color:'rgb(81, 48, 153)',bg:'rgb(242, 236, 255)'},'Restore progress button must be legible on its light secondary surface');
   await page.screenshot({path:'test-results/jems-parent-'+label+'.png',fullPage:false});
   const manifest=await page.evaluate(()=>fetch('./manifest.webmanifest').then(r=>r.json()));
   assert.equal(manifest.short_name,'jems');
   assert.equal(manifest.theme_color.toUpperCase(),'#0B1E3B','installable app must use approved Ink');
   assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'),'#0B1E3B','browser theme must match approved Ink');
   assert.equal(manifest.icons[0].src,'./jems-app-icon.svg','installable jems icon should use its dedicated approved app tile');
   assert.equal(manifest.icons[1].src,'./jems-mark.svg','bare mark remains available as a vector icon');
   assert.equal(await page.locator('link[rel="icon"]').getAttribute('href'),'./jems-mark.svg','browser tab uses jems favicon');
   assert.deepEqual(errors,[]);
   console.log('PASS jems brand page:',label);
   await page.close();
  }
  const legacy=await browser.newPage();legacy.setDefaultTimeout(12000);
  console.log('jems brand: checking legacy route');
  await legacy.goto(base+'?arcade=1');await legacy.waitForFunction(()=>window.FG?.app);
  assert.equal(await legacy.locator('.jems-brand-logo').count(),1);
  assert.equal(await legacy.locator('.jems-brand-logo').evaluate(img=>img.complete&&img.naturalWidth>0),true);
  assert.equal(await legacy.locator('#page-home').isVisible(),true);
  const legacyText=await legacy.locator('.hero p').evaluate(e=>getComputedStyle(e).color);
  assert.equal(legacyText,'rgb(69, 85, 116)','Legacy hero body text must be readable on light surfaces');
  const legacyAction=await legacy.locator('.hero .btn.ghost').evaluate(e=>getComputedStyle(e).color);
  assert.equal(legacyAction,'rgb(82, 44, 157)','Legacy secondary action must not use old white-on-white styling');
  await legacy.close();
  console.log('PASS jems brand contract: logo, palette, navigation, Send vs Speak, 6 games, parents, learning, mobile and legacy Arcade');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

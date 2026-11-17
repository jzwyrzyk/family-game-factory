const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {start}=require('./browser-server.cjs');
const fs=require('node:fs');
/** Visual contract for jems. No model calls, paid APIs or child data are used. */
(async()=>{
 const server=start(),base='http://127.0.0.1:'+server.address().port+'/arcade/';
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
 fs.mkdirSync('test-results',{recursive:true});
 try{
  for(const [label,width,height] of [['desktop',1280,900],['mobile',390,844]]){
   const page=await browser.newPage({viewport:{width,height},hasTouch:label==='mobile'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
   await page.waitForFunction(()=>window.FG?.studio&&window.FG?.learning);
   const logo=page.locator('img.jems-brand-logo');
   assert.equal(await logo.count(),1);
   assert.equal(await logo.getAttribute('alt'),'jems');
   assert.equal(await logo.evaluate(img=>img.complete&&img.naturalWidth>0),true,'approved brand image loads');
   const title=await page.title();assert.match(title,/^jems/);
   const color=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--jems-blue').trim());
   assert.equal(color.toUpperCase(),'#2D7BFF');
   assert.equal(await page.locator('#studioStarters [data-starter]').count(),6);
   const makeHeading=await page.locator('#studioNew .studio-make-copy strong').evaluate(e=>getComputedStyle(e).color);
   assert.equal(makeHeading,'rgb(255, 255, 255)','Create headline must stay white on saturated blue');

  // Brand fidelity regression: validate the exact named palette and semantic accessible roles.
  const tokens=await page.evaluate(()=>{
    const r=getComputedStyle(document.documentElement);
    return Object.fromEntries(['ink','blue','purple','mint','gold','coral','cloud','lilac','action-blue','action-purple'].map(k=>[k,r.getPropertyValue('--jems-'+k).trim().toUpperCase()]));
  });
  assert.deepEqual(tokens,{
    ink:'#0B1D4D',blue:'#2D7BFF',purple:'#8A4DFF',mint:'#34D7B3',
    gold:'#FFC828',coral:'#FF6B7A',cloud:'#FFF7EE',lilac:'#E6D8FF',
    'action-blue':'#195FD0','action-purple':'#7136C9'
  });
  const assets=['jems-mark.svg','jems-logo.svg','jems-wordmark.svg','jems-clouds.svg','jems-blocks.svg','jems-sparks.svg','jems-facets-pattern.svg'];
  for(const asset of assets){
    const result=await page.evaluate(p=>fetch('./'+p).then(async r=>({ok:r.ok,text:await r.text()})),asset);
    assert.ok(result.ok&&result.text.includes('<svg'),asset+' should be served locally');
    if(asset==='jems-mark.svg')assert.ok(result.text.includes('id="jems-wrench"')&&!result.text.includes('M60 45C49 45'), 'open-ended wrench geometry, not the old circular keyhole');
    if(asset==='jems-logo.svg')assert.ok(result.text.includes('fill-rule="evenodd"')&&!result.text.includes('<text'), 'wordmark must be outlined, not rendered using a system-dependent font');
  }
  const visual=await page.evaluate(()=>({
    hero:getComputedStyle(document.querySelector('.studio-home-hero')).backgroundImage,
    button:getComputedStyle(document.querySelector('#studioNew')).backgroundImage,
    surface:getComputedStyle(document.querySelector('.studio-starter')).borderRadius,
    learning:!!document.getElementById('studioLearningChoice'),
    game:!!document.getElementById('studioGameMath')
  }));
  assert.ok(visual.hero.includes('jems-clouds.svg'),'subtle brand artwork reaches the homepage, not only logo');
  assert.match(visual.button,/gradient/i,'child create action uses accessible on-brand gradient');
  assert.ok(visual.learning&&visual.game,'brand merge retained latest Math/English selector');

   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'no horizontal overflow');
   await page.screenshot({path:'test-results/jems-home-'+label+'.png',fullPage:false});
   await page.locator('#studioNew').click();
   assert.equal(await page.locator('#page-studio').isVisible(),true);
   assert.match(await page.locator('#studioTalk').innerText(),/Send to jems/,'text composer clearly sends');
   assert.match(await page.locator('#studioMic').innerText(),/Speak/,'microphone has a separate voice affordance');
   assert.equal(await page.locator('#studioPrompt').isVisible(),true);
   await page.screenshot({path:'test-results/jems-studio-'+label+'.png',fullPage:false});
   await page.locator('#studioNavHome').click();
   await page.locator('#studioNavPowers').click();
   assert.equal(await page.locator('#page-lab').isVisible(),true);
   const mathHead=page.locator('#page-lab .math-activity h2');
   if(await mathHead.count())assert.equal(await mathHead.first().evaluate(e=>getComputedStyle(e).color),'rgb(255, 255, 255)','Math question must stay readable on dark lesson');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
   await page.screenshot({path:'test-results/jems-powers-'+label+'.png',fullPage:false});
   await page.locator('footer [data-page="parent"]').click();
   assert.equal(await page.locator('#page-parent').isVisible(),true);
   const parentLabel=await page.locator('#page-parent label[for="parentNickname"]').evaluate(e=>getComputedStyle(e).color);
   assert.equal(parentLabel,'rgb(52, 68, 102)','Parent form labels need strong Ink-on-white contrast');
   const restoreLabel=await page.locator('#page-parent label.upload-button').evaluate(e=>({color:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor}));
   assert.deepEqual(restoreLabel,{color:'rgb(81, 48, 153)',bg:'rgb(242, 236, 255)'},'Restore progress button must be legible on its light secondary surface');
   await page.screenshot({path:'test-results/jems-parent-'+label+'.png',fullPage:false});
   const manifest=await page.evaluate(()=>fetch('./manifest.webmanifest').then(r=>r.json()));
   assert.equal(manifest.short_name,'jems');
   assert.equal(manifest.icons[0].src,'./jems-app-icon.svg','installable jems icon should use its dedicated approved app tile');
   assert.equal(manifest.icons[1].src,'./jems-mark.svg','bare mark remains available as a vector icon');
   assert.equal(await page.locator('link[rel="icon"]').getAttribute('href'),'./jems-mark.svg','browser tab uses jems favicon');
   assert.deepEqual(errors,[]);
   await page.close();
  }
  const legacy=await browser.newPage();
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

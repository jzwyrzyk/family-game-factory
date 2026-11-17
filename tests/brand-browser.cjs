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
   assert.equal(color.toUpperCase(),'#2E6BFF');
   const expectedTokens={'--jems-ink':'#0B1E3B','--jems-purple':'#8B5CF6','--jems-coral':'#FF5E7A','--jems-gold':'#FFC24D','--jems-mint':'#22D3A6'};
   const tokens=await page.evaluate(()=>Object.fromEntries(Object.keys({"--jems-ink":"","--jems-purple":"","--jems-coral":"","--jems-gold":"","--jems-mint":""}).map(key=>[key,getComputedStyle(document.documentElement).getPropertyValue(key).trim().toUpperCase()])));
   assert.deepEqual(tokens,expectedTokens,'brand source-of-truth palette');
   assert.equal(await page.locator('#studioStarters [data-starter]').count(),6);
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
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
   await page.screenshot({path:'test-results/jems-powers-'+label+'.png',fullPage:false});
   await page.locator('footer [data-page="parent"]').click();
   assert.equal(await page.locator('#page-parent').isVisible(),true);
   await page.screenshot({path:'test-results/jems-parent-'+label+'.png',fullPage:false});
   const manifest=await page.evaluate(()=>fetch('./manifest.webmanifest').then(r=>r.json()));
   assert.equal(manifest.short_name,'jems');
   assert.equal(manifest.icons[0].src,'./jems-mark.svg');
   assert.deepEqual(errors,[]);
   await page.close();
  }
  const legacy=await browser.newPage();
  await legacy.goto(base+'?arcade=1');await legacy.waitForFunction(()=>window.FG?.app);
  assert.equal(await legacy.locator('.jems-brand-logo').count(),1);
  assert.equal(await legacy.locator('.jems-brand-logo').evaluate(img=>img.complete&&img.naturalWidth>0),true);
  assert.equal(await legacy.locator('#page-home').isVisible(),true);
  await legacy.close();
  console.log('PASS jems brand contract: logo, palette, navigation, Send vs Speak, 6 games, parents, learning, mobile and legacy Arcade');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

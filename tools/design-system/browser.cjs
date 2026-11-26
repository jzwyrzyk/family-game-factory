const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const {standaloneInput}=require('../ui-review/standalone-input.cjs');
const assert=require('node:assert/strict');
const {assertTextContrast}=require('../../tests/helpers/text-contrast.cjs');
(async()=>{
 const out='test-results/design-system';fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 const input=await standaloneInput(path.resolve('dist-review/jems-ui-review.html'));
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[],requests=[],results=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&r.url()!==input.url)requests.push(r.url());});
 try{
  await page.goto(input.url,{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>document.querySelector('#loading').hidden,null,{timeout:120000});
  const app=page.frames().find(f=>f.parentFrame()===page.mainFrame());
  for(const device of ['desktop','landscape','portrait','mobile']){
   await page.selectOption('#device',device);await page.selectOption('#destination','design-system');
   await app.locator('#design-system-gallery').waitFor();await app.evaluate(()=>document.fonts.ready);
   assert.equal(await app.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,device+' horizontal fit');
   const tooSmall=await app.locator('#design-system-gallery .jems-action').evaluateAll(es=>es.filter(e=>e.getClientRects().length&&e.getBoundingClientRect().height<(e.classList.contains('jems-page-back')?44:48)).map(e=>e.textContent));assert.deepEqual(tooSmall,[],device+' touch targets');
   await assertTextContrast(app,'#design-system-gallery .jems-action, #design-system-gallery .jems-page-title, #design-system-gallery .jems-page-description','shared composed text '+device);
   await app.locator('#ds-open-dialog').click();await app.locator('dialog[open]').waitFor();await app.locator('dialog[open] button').focus();await app.page().keyboard.press('Tab');
   assert.equal(await app.evaluate(()=>document.activeElement.closest('dialog')?.open),true,'focus wraps');
   await app.page().keyboard.press('Escape');await app.waitForFunction(()=>document.activeElement?.id==='ds-open-dialog');
   await app.locator('#design-system-title').focus();
   await page.keyboard.press('Shift+Tab');
   assert.equal(await app.evaluate(()=>document.activeElement?.classList.contains('jems-page-back')),true,'back receives keyboard focus '+JSON.stringify(await app.evaluate(()=>({active:document.activeElement?.outerHTML,title:document.getElementById('design-system-title')?.outerHTML}))));
   assert.notEqual(await app.locator('#design-system-gallery .jems-page-back').first().evaluate(e=>getComputedStyle(e).outlineStyle),'none','visible keyboard focus');
   await page.selectOption('#zoom','1');await page.click('#hide');
   for(const section of ['ds-foundations','ds-components','ds-template','ds-archetypes']){
    await app.locator('#'+section).scrollIntoViewIfNeeded();
    await page.locator('#appFrame').screenshot({path:out+'/'+device+'-'+section+'.png'});
   }
   const lastAction=app.locator('#ds-archetypes .jems-action').last();await lastAction.scrollIntoViewIfNeeded();
   assert.equal(await lastAction.evaluate(e=>{const r=e.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===e||e.contains(hit);}),true,'last action remains reachable above navigation');
   await page.click('#return');
   results.push({device,fit:true,touch:true,contrast:true,dialogKeyboard:true});
  }
  // A foundation edit must reach actual feature routes without individual page edits.
  await app.evaluate(()=>document.documentElement.style.setProperty('--jems-color-heading','#123456'));
  for(const route of ['journey','pals','rewards','powers','creations','notifications']){
   await app.evaluate(route=>window.__reviewNavigate(route),route);
   const title=app.locator('.page:not(.hidden) .jems-page-title').first();await title.waitFor();
   assert.equal(await title.evaluate(e=>getComputedStyle(e).color),'rgb(18, 52, 86)',route+' consumes shared heading token');
   assert.equal(await title.evaluate(e=>e.closest('[data-jems-template]')?.dataset.jemsTemplate),'collection',route+' consumes production template');
  }
  await app.evaluate(()=>document.documentElement.style.removeProperty('--jems-color-heading'));
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  fs.writeFileSync(out+'/results.json',JSON.stringify({results,propagation:['journey','pals','rewards','powers','creations','notifications'],externalRequests:requests,errors,transport:process.env.UI_REVIEW_INLINE_HARNESS==='1'?'single-file loopback':'actual file navigation'},null,2));
  console.log('PASS design gallery: four viewports, native keyboard/dialog behavior, contrast, touch targets, six live template consumers, no external requests');
 }finally{await browser.close();await input.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

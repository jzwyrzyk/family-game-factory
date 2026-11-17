const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {start}=require('./browser-server.cjs');

/** Homepage contract: Studio by default, old Arcade only when explicitly requested.
 * The same saved ideas must survive home and reload without ever claiming an AI build.
 */
(async()=>{
 const server=start();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
 const base='http://127.0.0.1:'+server.address().port+'/arcade/';
 fs.mkdirSync('test-results',{recursive:true});
 try{
  for(const device of ['desktop','mobile']){
   const mobile=device==='mobile';
   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},hasTouch:mobile});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base);
   await page.waitForFunction(()=>window.FG?.studio&&window.FG?.learning);
   assert.equal(await page.locator('#page-studio-library').isVisible(),true,'the normal URL opens Studio');
   assert.equal(await page.locator('#page-home').isVisible(),false,'the old wizard is not the homepage');
   assert.equal(await page.locator('#studioStarters [data-starter]').count(),6,'six playable favorites');
   assert.match(await page.locator('#studioLibraryTitle').textContent(),/What will you/);
   assert.equal(await page.locator('#studioLearningChoice').isVisible(),true,'homepage subject choice is discoverable');
   assert.equal(await page.locator('#studioSubjectMath').getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('#studioSubjectLanguage').isDisabled(),true,'grown-up must enable Both');
   assert.match(await page.locator('#studioNew').textContent(),/Invent a game/);
   assert.match(await page.locator('#studioCreationNote').textContent(),/not connected yet/,'do not promise offline AI builds');
   const cta=await page.locator('#studioNew').boundingBox();
   assert.ok(cta&&cta.height>=44&&cta.width>=130,'large touch target');
   const overflow=await page.evaluate(()=>({width:document.documentElement.scrollWidth,view:window.innerWidth}));
   assert.ok(overflow.width<=overflow.view+2,'no horizontal overflow: '+JSON.stringify(overflow));
   await page.screenshot({path:'test-results/homepage-'+device+'.png',fullPage:true});
   await page.getByRole('button',{name:'⚙️ Grown-ups',exact:true}).click();
   await page.selectOption('#parentSubject','both');
   await page.click('#saveParent');
   await page.click('#studioNavHome');
   assert.equal(await page.locator('#studioSubjectLanguage').isDisabled(),false);
   await page.click('#studioSubjectLanguage');
   assert.equal(await page.evaluate(()=>window.FG.learning.subject),'language','homepage switch takes effect');
   await page.click('#studioSubjectMath');
   assert.equal(await page.evaluate(()=>window.FG.learning.subject),'math','children can switch back');
   await page.click('#studioNew');
   assert.equal(await page.locator('#page-studio').isVisible(),true,'create action opens the same Studio');
   await page.fill('#studioPrompt','Make a silly cactus that dances on the moon');
   await page.click('#studioHome');
   assert.equal(await page.locator('#page-studio-library').isVisible(),true,'My Games returns to the library');
   await page.click('#studioContinuePlaying');
   assert.equal(await page.inputValue('#studioPrompt'),'Make a silly cactus that dances on the moon','draft survives navigation');
   await page.reload();
   await page.waitForFunction(()=>window.FG?.studio);
   await page.click('#studioContinuePlaying');
   assert.equal(await page.inputValue('#studioPrompt'),'Make a silly cactus that dances on the moon','draft survives reload');
   await page.click('#studioHome');
   await page.click('[data-starter="moon"]');
   await page.waitForSelector('.favorite-moon .favorite-canvas');
   await page.locator('#studioMathOptions summary').click();
   assert.equal(await page.locator('#studioGameSubject').isVisible(),true,'in-game learning options expose subject choice');
   await page.click('#studioGameLanguage');
   assert.equal(await page.evaluate(()=>window.FG.learning.subject),'language','next game checkpoint uses the chosen subject');
   await page.click('#studioGameMath');
   assert.equal(await page.evaluate(()=>window.FG.learning.subject),'math');
   await page.click('#studioNavHome');
   assert.equal(await page.locator('#studioStarters [data-starter]').count(),6,'favorites stay available after play');
   assert.deepEqual(errors,[],'no browser runtime errors');
   await context.close();
  }
  const context=await browser.newContext();
  const legacy=await context.newPage();
  await legacy.goto(base+'?arcade=1');
  await legacy.waitForFunction(()=>window.FG?.app&&window.FG?.factory);
  assert.equal(await legacy.locator('#page-home').isVisible(),true,'old Arcade remains available for rollback');
  assert.equal(await legacy.evaluate(()=>Boolean(window.FG?.studio)),false,'legacy route does not install Studio');
  const alias=await context.newPage();
  await alias.goto(base+'?studio=1');
  await alias.waitForFunction(()=>window.FG?.studio);
  assert.equal(await alias.locator('#page-studio-library').isVisible(),true,'review alias remains compatible');
  await context.close();
  console.log('PASS Studio homepage: default entry, six games, large CTA, honest builder state, saved drafts, legacy escape and responsive layout');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

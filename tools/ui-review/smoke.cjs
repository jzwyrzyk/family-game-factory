const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const artifact=path.resolve(process.env.UI_REVIEW_FILE||'dist-review/jems-ui-review.html');
const manifest=JSON.parse(fs.readFileSync('tools/ui-review/coverage.json','utf8'));
const harness=process.env.UI_REVIEW_INLINE_HARNESS==='1';
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage();const errors=[],network=[],overflows=[],visited=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&r.url()!=='http://localhost:43199/')network.push(r.url());});page.on('dialog',d=>d.accept());page.setDefaultTimeout(12000);
 fs.mkdirSync('test-results/ui-review',{recursive:true});
 try{
 if(harness){await page.route('http://localhost:43199/',r=>r.fulfill({contentType:'text/html',path:artifact}));await page.goto('http://localhost:43199/',{timeout:120000});}else await page.goto('file://'+artifact,{timeout:120000});
 await page.waitForFunction(()=>document.querySelector('#loading').hidden,{timeout:60000});
 const app=()=>page.frames().find(f=>f.parentFrame()===page.mainFrame());
 const go=async action=>{await page.selectOption('#destination',action);await page.waitForTimeout(350);};
 for(const route of (process.env.UI_REVIEW_FOCUS?[]:manifest.pages)){await go(route.action);const ids=await app().locator('.page:not(.hidden)').evaluateAll(es=>es.filter(e=>!e.hidden).map(e=>e.id));console.log('PAGE',route.action,ids.join(','));assert(ids.includes(route.id==='studioNotifications'?route.id:'page-'+route.id),'Page accessible: '+route.id);visited.push(route.id);}
 // Current responsive surfaces use the actual iframe viewport, with no app CSS overrides.
 for(const [device,width]of (process.env.UI_REVIEW_FOCUS?[]:[['desktop',1440],['landscape',1180],['portrait',820],['mobile',390]])){
  await page.selectOption('#device',device);assert.equal(await app().evaluate(()=>innerWidth),width);
  for(const action of ['home','journey','coding','coding-intro','coding-make','coding-editor','coding-challenge','art','art-draw','parent','parent:evidence','pals','rewards','math']){await go(action);const overflow=await app().evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));if(overflow.scroll>overflow.width+2)overflows.push({device,action,...overflow});await page.screenshot({path:`test-results/ui-review/${device}-${action.replace(/[^a-z0-9-]/gi,'-')}.png`});}
 }
 await page.selectOption('#device','desktop');await go('coach-confirm');await app().waitForFunction(()=>!document.getElementById('studioSend').disabled);
 assert.match(await app().locator('#studioMessages').innerText(),/simulated build/);
 await app().click('#studioSend');await app().locator('#studioBuildHandoff[open]').waitFor();await page.click('#finish');
 await app().waitForFunction(()=>FG.studio.exportNotebook().sessions.some(s=>s.job?.status==='ready'),undefined,{timeout:20000});
 console.log('PASS deterministic build reached ready');
 await app().locator('#studioBuildHandoffPlay').click();
 await app().locator('#studioRemoteHost iframe').waitFor();
 const preview=app().frameLocator('#studioRemoteHost iframe');await page.click('#hide');await preview.getByRole('button',{name:'Learning checkpoint'}).click();await page.click('#return');
 await app().waitForFunction(()=>FG.learning.active);console.log('PASS build / launch / educational interruption');
 await go('parent:settings');
 for(const scenario of ['populated','unlocked','long-content','error','loading','locked','normal']){await page.selectOption('#scenario',scenario);await page.waitForTimeout(1000);await app().waitForFunction(()=>!!window.FG?.studio);assert.equal(await page.evaluate(()=>__jemsReview.config.scenario),scenario);}
await page.selectOption('#experience','adult');await app().waitForFunction(()=>FG.store.current().id.startsWith('adult:'),{timeout:15000});
 await page.selectOption('#experience','child');await page.waitForTimeout(1000);
 await page.selectOption('#scenario','first-time');await app().locator('#studioWelcome').waitFor();await app().locator('[data-welcome-character="nova"]').click();await app().locator('#studioWelcomeMake').click();await app().locator('#page-studio').waitFor({state:'visible'});
 await page.selectOption('#scenario','empty');await page.waitForTimeout(1000);await go('parent');
 for(const grade of ['-1','0','1','2','3','4']){await page.selectOption('#grade',grade);await page.waitForTimeout(900);assert.equal(await app().evaluate(()=>FG.store.current().grade),Number(grade));}
 await page.click('#flag');await page.fill('#description','Review smoke: synthetic concern');await page.fill('#desired','Keep the chosen control visible.');await page.locator('#concernForm button[type="submit"]').click();
 await page.click('#findings');for(const [button,suffix] of [['#exportJSON','.json'],['#exportMarkdown','.md']]){const pending=page.waitForEvent('download');await page.click(button);const d=await pending;assert(d.suggestedFilename().endsWith(suffix));const file=await d.path(),text=fs.readFileSync(file,'utf8');assert(text.includes('Review smoke: synthetic concern'));if(suffix==='.json')assert.equal(JSON.parse(text).commit.length,40);}
 await page.locator('[data-close="findingsDialog"]').click();await page.click('#hide');assert(await page.locator('#toolbar').isHidden());assert(await page.locator('#return').isVisible());await page.click('#return');
 const broken=await app().locator('img').evaluateAll(es=>es.filter(e=>e.offsetWidth&&e.complete&&!e.naturalWidth).map(e=>e.src));assert.deepEqual(broken,[]);
 assert.deepEqual(network,[],'No external network requests');assert.deepEqual(errors,[],'No browser exceptions');
 const report={artifact,mode:harness?'in-memory transport harness; file:// unverified locally':'file://, no server',pages:visited,viewports:process.env.UI_REVIEW_FOCUS?0:4,overflows,errors,network};fs.writeFileSync('test-results/ui-review/results.json',JSON.stringify(report,null,2));console.log('PASS UI review',JSON.stringify(report));
 }catch(e){console.log('BROWSER ERRORS',errors);await page.screenshot({path:'test-results/ui-review/failure.png'});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

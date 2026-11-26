// Runs the same owner-visible offline HTML and subject hosts at fixed CSS viewport sizes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const file = path.resolve(process.env.UI_REVIEW_FILE || 'dist-review/jems-ui-review.html');
const out = path.resolve(process.env.UI_REVIEW_EVIDENCE || 'test-results/learning-workspace');
const reviewUrl='http://localhost:43199/';
const baseline = process.env.UI_REVIEW_BEFORE === '1';
const captures = [
  ['phone',390,844,'build-a-word'],
  ['tablet-portrait',768,1024,'pk-touch'],
  ['tablet-landscape',1024,768,'g1-make-ten'],
  ['desktop',1366,768,'select-supporting-evidence'],
  ['small-phone',320,667,'g2-hundreds'],
  ['short-landscape',844,390,'sequence-a-picture-story'],
  ['wide',1600,1000,'g4-add-fraction'],
];

async function zoomAndFullscreen() {
  const context=await chromium.launchPersistentContext('',{
    channel:'chromium',headless:true,executablePath:process.env.CHROMIUM_PATH,viewport:null,
    args:['--no-sandbox','--window-size=1366,768'],
  });
  try {
    const page=await context.newPage();
    await page.route(reviewUrl,route=>route.fulfill({contentType:'text/html',path:file}));
    await page.goto(reviewUrl,{waitUntil:'domcontentloaded',timeout:120000});
    await page.waitForFunction(()=>document.querySelector('#loading').hidden,undefined,{timeout:120000});
    await page.selectOption('#destination','learn:build-a-word');
    const frame=page.frames().find(f=>f.parentFrame()===page.mainFrame());
    const tiles=frame.locator('#lab-question [data-tile]');
    await page.locator('#hide').click();
    await tiles.first().click();
    const settings=await context.newPage();
    await settings.goto('chrome://settings/appearance');
    await settings.evaluate(()=>chrome.settingsPrivate.setDefaultZoom(1.5));
    await page.bringToFront();
    await page.waitForFunction(()=>Math.abs(devicePixelRatio-1.5)<.01);
    assert(await tiles.first().isDisabled(),'Word survives 150% browser zoom');
    await tiles.nth(1).evaluate(el=>el.addEventListener('click',()=>document.documentElement.requestFullscreen(),{once:true}));
    await tiles.nth(1).click();
    await frame.waitForFunction(()=>!!document.fullscreenElement);
    assert.equal(await frame.locator('#lab-question [data-tile]:disabled').count(),2,'Fullscreen preserves the construction');
    await frame.evaluate(()=>document.exitFullscreen());
    await settings.evaluate(()=>chrome.settingsPrivate.setDefaultZoom(1));
    await page.bringToFront();
    await page.waitForFunction(()=>Math.abs(devicePixelRatio-1)<.01);
    return {browserZoom:1.5,fullscreen:true,selectedBefore:1,selectedAfter:2};
  } finally {await context.close();}
}

async function main() {
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({
    headless:true,executablePath:process.env.CHROMIUM_PATH,
    args:['--no-sandbox'],
  });
  const page=await browser.newPage({viewport:{width:1366,height:768},reducedMotion:'reduce',hasTouch:true});
  const failures=[],network=[],checks=[],mounts=[];
  page.on('pageerror',e=>failures.push(e.message));
  page.on('request',r=>{if(/^https?:/.test(r.url())&&r.url()!==reviewUrl)network.push(r.url());});
  try {
    await page.route(reviewUrl,route=>route.fulfill({contentType:'text/html',path:file}));
    await page.goto(reviewUrl,{waitUntil:'domcontentloaded',timeout:120000});
    await page.waitForFunction(()=>document.querySelector('#loading').hidden,undefined,{timeout:120000});
    await page.selectOption('#scenario','populated');
    await page.waitForFunction(()=>document.querySelector('#appFrame').contentWindow.__reviewConfig?.scenario==='populated' && document.querySelector('#status').textContent.includes('synthetic review') && document.querySelector('#appFrame').contentWindow.FG?.learning);
    const app=()=>page.frames().find(f=>f.parentFrame()===page.mainFrame());
    const samples=await page.evaluate(()=>__jemsReview.learningSamples);
    async function open(name) {
      const sample=samples.find(x=>x.action==='learn:'+name);
      assert(sample,'Unknown sample '+name);
      await page.selectOption('#destination',sample.action);
      await page.waitForFunction(sample=>{
        const w=document.querySelector('#appFrame').contentWindow;
        const target=w.document.querySelector('#lab-question [data-attempt-id]');
        return w.FG?.store.current().grade===sample.grade &&
          target?.dataset.skillId===sample.skill && document.getElementById('status').textContent===sample.label+' · synthetic review';
      },sample,{timeout:20000}).catch(async error=>{console.error(name,await page.locator('#status').innerText(),await app().locator('#lab-question').innerText(),failures);throw error;});
      const timing=await app().evaluate(()=>performance.getEntriesByName('review-learning-mount').at(-1)?.duration);
      if(Number.isFinite(timing))mounts.push({sample:name,ms:Number(timing.toFixed(1))});
      return app().locator('#lab-question [data-attempt-id]').first();
    }

    for (const [device,width,height,name] of captures) {
      await page.setViewportSize({width,height});
      const activity=await open(name);
      await page.locator('#hide').click();
      await activity.evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));
      await app().evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('#lab-question img')].map(x=>x.decode().catch(()=>{})));});
      const geometry=await activity.evaluate(el=>{
        const rect=el.getBoundingClientRect();
        return {left:rect.left,right:rect.right,width:innerWidth,scroll:document.documentElement.scrollWidth};
      });
      if (!baseline) {
        assert(geometry.left>=-1 && geometry.right<=width+1,device+' workspace width '+JSON.stringify(geometry));
        assert(geometry.scroll<=width+1,device+' page width '+JSON.stringify(geometry));
      }
      await page.screenshot({path:path.join(out,device+'.png'),style:'#return{visibility:hidden!important}'});
      if (name==='build-a-word') {
        const tile=activity.locator('[data-tile]').first();
        await tile.tap();
        const state=await tile.evaluate(e=>e.disabled||e.getAttribute('aria-pressed')==='true'||e.hidden||e.getAttribute('aria-selected')==='true');
        assert(state,'Tile selection responds to touch');
      } else {
        const hint=activity.locator('[data-action="hint"]');
        await hint.tap();
        assert(await activity.locator('.math-hint:visible,.language-hint:visible').count(),device+' hint opens');
      }
      checks.push({device,width,height,name,...geometry});
      await page.locator('#return').click();
    }
    for (const sample of baseline?[]:samples) {
      // A fresh fixture is needed if the current sample happens to be selected.
      if (await page.locator('#destination').inputValue()===sample.action)continue;
      const activity=await open(sample.action.slice(6));
      if(sample.state==='incorrect'||sample.state==='correct')await activity.locator('[data-state="'+sample.state+'"]').waitFor();
      if(['tools','correct','worked','selected'].includes(sample.state)){
        await page.setViewportSize({width:1024,height:768});
        await page.locator('#hide').click();
        const detail=sample.state==='worked'?activity.locator('.math-hint'):activity;
        await detail.evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));
        await page.screenshot({path:path.join(out,'state-'+sample.state+'.png'),style:'#return{visibility:hidden!important}'});
        await page.locator('#return').click();
      }
      if(sample.state==='hint'||sample.state==='worked')assert(await activity.locator('.math-hint:visible,.language-hint:visible').count(),sample.action+' support panel');
      if(sample.action==='learn:select-supporting-evidence')assert(await activity.locator('[data-action="check-evidence"]').isVisible(),'Passage contains selectable evidence');
      if(sample.state==='tools'){
        assert(await activity.locator('.learning-scratchpad canvas').isVisible());
        assert(await activity.locator('.learning-keypad-keys').isVisible());
        const field=activity.locator('.math-answer-input');
        const label=activity.locator('.math-answer-form label').first();
        assert(await field.evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=20));
        assert(await label.evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=18));
      }
      if(sample.state==='save-failure'){
        assert(await app().locator('#lab-question .learning-save-warning:visible').count());
        await activity.locator('[data-action="hint"]').click();
        assert.equal(await app().locator('#lab-question .learning-save-warning:visible').count(),0,'Successful local save clears host warning');
      }
    }
    if(!baseline){
      await open('g4-add-fraction');
      assert.deepEqual(await page.locator('#grade option:enabled').evaluateAll(options => options.map(o => o.value)), ['4']);
      await open('g1-make-ten');
      await page.selectOption('#grade','3');
      await page.waitForFunction(() => {
        const w = document.querySelector('#appFrame').contentWindow;
        return w.FG?.store.current().grade === 3 && w.FG.learning.activeItem?.skillId === 'g1-make-ten';
      });
      await open('pk-touch');
      assert.equal(await page.locator('#grade option:enabled').count(),6);
      for(const theme of ['factory','mining','gum','dragon','math-lab']){
        await page.selectOption('#learningTheme',theme);
        const expected=theme==='math-lab'?'jems':theme;
        await app().locator('[data-learning-theme="'+expected+'"]').waitFor();
        const broken=await app().locator('#lab-question .early-picture').evaluateAll(async images=>{
          await Promise.all(images.filter(im=>im.tagName==='IMG').map(im=>im.decode().catch(()=>{})));
          return images.filter(im=>im.tagName==='IMG'&&!im.naturalWidth).length;
        });
        assert.equal(broken,0,theme+' counter assets decode');
        if(theme==='dragon'){
          await page.setViewportSize({width:768,height:1024});
          await page.locator('#hide').click();
          const task=app().locator('#lab-question .learning-workspace');
          await task.evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));
          await task.locator('.early-counter button').first().tap();
          await page.screenshot({path:path.join(out,'dragon-counting.png'),style:'#return{visibility:hidden!important}'});
          await page.locator('#return').click();
        }
      }
      const activity=await open('g1-make-ten');
      const sizes=await activity.locator('.model-counter').evaluateAll(tokens=>tokens.map(t=>t.getBoundingClientRect().width));
      assert(sizes.length>0 && sizes.every(w=>w>=18),'Frame counters are visibly sized: '+sizes);
    }
    assert.deepEqual(failures,[],'No uncaught application errors');
    assert.deepEqual(network,[],'Standalone artifact performs no network requests');
    const zoom=baseline?null:await zoomAndFullscreen();
    const sha=await page.evaluate(()=>window.__reviewReport().commit);
    fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({source:sha,browser:browser.version(),samples:baseline?captures.length:samples.length,checks,zoom,mounts,network,failures},null,2)+'\n');
    console.log('PASS',checks.length,'viewport captures and pointer inputs.',baseline?'Baseline comparison.':samples.length+' review samples and local save recovery.');
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

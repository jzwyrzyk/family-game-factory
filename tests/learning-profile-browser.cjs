const {authorizeLearningParent}=require('./learning-parent-fixture.cjs');
/* Real profile controls and the same host selection used by all games.
 * Synthetic local profiles only; no remote coaching or generation. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {start}=require('./browser-server.cjs');
const {navigate,openProfiles}=require('./studio-entry.cjs');
const KEY='family-game-factory-state-v1';

async function editLevel(page){await openProfiles(page);await page.locator('#learningProfileEdit').click();await page.locator('#learningProfileDialog').waitFor({state:'visible'});}
async function choose(page,index){await openProfiles(page);await page.locator('#profile-choices .profile-choice').nth(index).click();}

(async()=>{
  let server,browser;
  try{
    server=start();
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
    fs.mkdirSync('test-results',{recursive:true});
    for(const [device,viewport] of [['desktop',{width:1280,height:900}],['phone',{width:390,height:844}]]){
      const context=await browser.newContext({viewport,hasTouch:device==='phone',reducedMotion:'reduce'}),page=await context.newPage();
      const errors=[],posts=[];page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
      page.on('dialog',dialog=>void dialog.accept());
      page.on('request',request=>{if(request.method()==='POST')posts.push(request.url());});
      await page.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'unavailable'})}));
      try{
        await page.goto(`http://127.0.0.1:${server.address().port}/arcade/`);
        await page.waitForFunction(()=>window.FG?.learningProfiles&&document.getElementById('page-studio-library')?.getAttribute('aria-busy')==='false');
        assert.equal(await page.locator('#learningProfileDialog').isVisible(),false,'setup does not cover character-first onboarding');
        await editLevel(page);
        assert.match(await page.locator('#learningProfileTitle').textContent(),/Explorer 1/);
        assert.equal(await page.locator('#learningProfileGrade').inputValue(),'1');
        assert.equal(await page.locator('#learningProfileDifficulty').inputValue(),'gentle');
        const geometry=await page.locator('#learningProfileDialog').evaluate(dialog=>{
          const rect=dialog.getBoundingClientRect();
          return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,controls:[...dialog.querySelectorAll('button,select')].map(el=>({height:el.getBoundingClientRect().height,font:parseFloat(getComputedStyle(el).fontSize)}))};
        });
        assert.ok(geometry.left>=0&&geometry.right<=viewport.width&&geometry.top>=0&&geometry.bottom<=viewport.height,'setup fits the viewport');
        for(const control of geometry.controls){assert.ok(control.height>=48);assert.ok(control.font>=18);}
        await page.screenshot({path:`test-results/learning-profile-${device}.png`,fullPage:false});
        await page.selectOption('#learningProfileDifficulty','stretch');
        await page.locator('#learningProfileSave').click();
        const first=await page.evaluate(()=>({grade:FG.store.current().grade,intensity:FG.store.current().intensity,confirmed:FG.store.current().learningSetupComplete}));
        assert.deepEqual(first,{grade:1,intensity:'stretch',confirmed:true});

        await page.reload();await page.waitForFunction(()=>window.FG?.learningProfiles);
        await openProfiles(page);assert.match(await page.locator('#learningProfileSummary').textContent(),/Grade 1 · Stretch/);
        await choose(page,1);await editLevel(page);
        assert.match(await page.locator('#learningProfileTitle').textContent(),/Explorer 2/);
        assert.equal(await page.locator('#learningProfileGrade').inputValue(),'1','the second child does not inherit an older demo grade');
        await authorizeLearningParent(page);
    await page.selectOption('#learningProfileGrade','4');await page.selectOption('#learningProfileDifficulty','balanced');
        await page.locator('#learningProfileSave').click();
        await choose(page,0);
        assert.equal(await page.evaluate(()=>FG.store.current().grade),1,'the first child keeps their own grade');
        assert.equal(await page.evaluate(()=>FG.store.current().intensity),'stretch');
        const sampled=await page.evaluate(()=>{
          const p=structuredClone(FG.store.current());p.skillFocus=['g4-fractions'];p.factTargets=['mul:8x8'];p.languageFocus=['g4-theme'];
          return Array.from({length:60},()=>[FG.learning.selectItem(p).grade,FG.learning.selectLanguageItem(p).grade]);
        });
        assert.ok(sampled.flat().every(grade=>grade===1),'Math and English never pass the first-grade ceiling, even on Stretch');

        await editLevel(page);await page.selectOption('#learningProfileGrade','3');await page.keyboard.press('Escape');
        assert.equal(await page.locator('#learningProfileDialog').isVisible(),false);
        assert.equal(await page.evaluate(()=>FG.store.current().grade),1,'Escape does not apply an unsaved change');
        await editLevel(page);
        await page.evaluate(()=>{FG.store.choose('player2');FG.app.refreshProfiles();window.dispatchEvent(new Event('factory-profile'));});
        assert.equal(await page.locator('#learningProfileDialog').isVisible(),false,'profile switch discards stale setup UI');
        assert.equal(await page.evaluate(()=>FG.store.current().grade),4);
        const persisted=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).profiles.map(p=>({id:p.id,grade:p.grade,intensity:p.intensity})),KEY);
        assert.deepEqual(persisted.slice(0,2),[{id:'player1',grade:1,intensity:'stretch'},{id:'player2',grade:4,intensity:'balanced'}]);

        // Grown-ups and the compact editor share the selected child's settings.
        // The heading identifies that child before a parent changes the level.
        await navigate(page,'#studioMenuParent');
        await page.locator('[data-parent-tab="settings"]').click();
        assert.equal(await page.locator('#parentLearningProfile').textContent(),'Learning settings for Explorer 2');
        assert.equal(await page.locator('#parentGrade').inputValue(),'4');
        assert.equal(await page.locator('#parentIntensity').inputValue(),'balanced');
        await authorizeLearningParent(page);
    await page.selectOption('#parentGrade','2');await page.selectOption('#parentIntensity','gentle');
        await page.locator('#saveParent').click();
        await choose(page,0);
        assert.equal(await page.locator('#parentLearningProfile').textContent(),'Learning settings for Explorer 1');
        assert.equal(await page.locator('#parentGrade').inputValue(),'1','switching profiles refreshes the Grown-ups form');
        assert.equal(await page.locator('#parentIntensity').inputValue(),'stretch','the sibling save leaves this child unchanged');
        await page.reload();await page.waitForFunction(()=>window.FG?.learningProfiles);
        const parentSaved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).profiles.slice(0,2).map(p=>({id:p.id,grade:p.grade,intensity:p.intensity,confirmed:p.learningSetupComplete})),KEY);
        assert.deepEqual(parentSaved,[{id:'player1',grade:1,intensity:'stretch',confirmed:true},{id:'player2',grade:2,intensity:'gentle',confirmed:true}]);
        await choose(page,1);await editLevel(page);
        assert.equal(await page.locator('#learningProfileGrade').inputValue(),'2','the compact editor reloads the grade saved in Grown-ups');
        assert.equal(await page.locator('#learningProfileDifficulty').inputValue(),'gentle');
        await page.locator('#learningProfileCancel').click();
        assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);console.log(`${device}: profile setup, Grown-ups settings, save/reload, cancellation, profile isolation and both-subject grade ceilings passed`);
      }finally{await context.close();}
    }
  }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});

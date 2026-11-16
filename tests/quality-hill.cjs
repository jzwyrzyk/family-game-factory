const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');

(async()=>{
 const server=require('./browser-server.cjs').start();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
 fs.mkdirSync('test-results',{recursive:true});
 try{
  for(const mobile of [false,true]){
   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:1000},hasTouch:mobile});
   const page=await context.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
   page.on('request',r=>{if(r.method()==='POST')requests.push(r.url())});await page.clock.install();
   await page.goto(`http://127.0.0.1:${server.address().port}/arcade/`);await page.waitForFunction(()=>window.FG?.factory);
   // Isolate driving with the ordinary recent-question budget; math remains required.
   await page.evaluate(()=>{FG.store.changeProfile({rate:1});FG.store.current().mathWindow=[Date.now()];FG.store.save();FG.app.openGame('hill')});
   const root=page.locator('.quality-hill'),button=name=>root.getByRole('button',{name,exact:true});
   const snapshot=()=>page.evaluate(()=>FG.runtime.snapshot());
   const canvas=root.locator('.q-canvas');
   const canvasPixels=()=>canvas.evaluate(c=>{
    const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let hash=2166136261,painted=0;
    for(let i=0;i<data.length;i+=4){if(data[i+3])painted++;hash=Math.imul(hash^(data[i]|data[i+1]<<8|data[i+2]<<16|data[i+3]<<24),16777619)}
    return {width:c.width,height:c.height,painted,hash:hash>>>0};
   });
   const settlePaused=async time=>{
    let frames=-1;
    for(let pass=0;pass<8;pass++){
     await page.waitForTimeout(25);await page.clock.runFor(100);
     const current=(await snapshot()).state;assert.equal(current.paused,true);assert.equal(current.time,time);
     if(current.performance.frames===frames)return current;
     frames=current.performance.frames;
    }
    assert.fail('the paused ride continued repainting after settling');
   };
   const checkModifiedShortcuts=async()=>{
    const checks=await root.evaluate(root=>{
     const capture=()=>{const s=FG.runtime.snapshot().state;return {mode:s.mode,paused:s.paused,time:s.time,distance:s.distance,inputActive:s.inputActive}};
     const commands=[['.q-canvas','KeyR','r'],['.q-canvas','KeyP','p'],['.q-canvas','KeyA','a'],['.q-canvas','KeyD','d'],
      ['.q-canvas','ArrowLeft','ArrowLeft'],['.q-canvas','ArrowRight','ArrowRight'],['.q-canvas','Escape','Escape'],
      ['[data-pedal=go]','Space',' '],['[data-pedal=go]','Enter','Enter'],['[data-pedal=brake]','Space',' '],['[data-pedal=brake]','Enter','Enter']];
     const checks=[];
     for(const modifier of ['ctrlKey','metaKey','altKey'])for(const [target,code,key] of commands){
      const before=capture(),event=new KeyboardEvent('keydown',{key,code,[modifier]:true,bubbles:true,cancelable:true});
      root.querySelector(target).dispatchEvent(event);
      checks.push({label:`${modifier} + ${code} on ${target}`,before,after:capture(),prevented:event.defaultPrevented});
     }
     return checks;
    });
    for(const check of checks){assert.equal(check.prevented,false,`${check.label} preserves the browser shortcut`);assert.deepEqual(check.after,check.before,`${check.label} does not change the ride or its controls`)}
   };
   assert.equal((await snapshot()).state.engine,'quality-hill-v1');assert.equal((await snapshot()).state.mode,'ready');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   if(mobile){
    await page.setViewportSize({width:320,height:844});await page.clock.runFor(50);
    const scale=await root.locator('canvas').evaluate(c=>{const r=c.getBoundingClientRect();return {x:c.width/r.width,y:c.height/r.height}});
    assert.ok(Math.abs(scale.x-scale.y)<.025,'narrow phones preserve circular wheels and uniform canvas scale');
    await page.setViewportSize({width:390,height:844});await page.clock.runFor(50);
   }
   await root.screenshot({path:`test-results/quality-hill-${mobile?'mobile':'desktop'}.png`});
   await checkModifiedShortcuts();
   await button('Go →').focus();await page.keyboard.down('Space');await page.clock.runFor(200);await page.keyboard.up('Space');
   assert.equal((await snapshot()).state.inputActive,0,'keyboard pedal release clears its logical input after starting');
   await button('↶ Try again').click();
   await button('Let’s drive →').click();
   await page.keyboard.down('ArrowRight');await page.clock.runFor(1000);await page.keyboard.up('ArrowRight');
   const moving=await snapshot();assert.ok(moving.state.distance>1,'the wheels actually propel the chassis');assert.ok(moving.state.speed>1);
   assert.equal(moving.state.resources.bodies,3);assert.equal(moving.state.resources.joints,2);
   await checkModifiedShortcuts();
   await page.keyboard.down('ArrowRight');assert.equal((await snapshot()).state.inputActive,1);
   await root.locator('.q-canvas').dispatchEvent('keyup',{key:'ArrowRight',code:'ArrowRight',ctrlKey:true,bubbles:true,cancelable:true});
   assert.equal((await snapshot()).state.inputActive,0,'adding a modifier before key release cannot leave the motor held');
   await page.keyboard.up('ArrowRight');
   await button('Go →').focus();await page.keyboard.down('Space');assert.equal((await snapshot()).state.inputActive,1);
   const modifiedPedalRelease=await button('Go →').evaluate(pedal=>{const event=new KeyboardEvent('keyup',{key:' ',code:'Space',metaKey:true,bubbles:true,cancelable:true});pedal.dispatchEvent(event);return event.defaultPrevented});
   assert.equal(modifiedPedalRelease,false);assert.equal((await snapshot()).state.inputActive,0,'modified keyup also releases a focused keyboard pedal');await page.keyboard.up('Space');
   await button('Pause game').click();const paused=(await snapshot()).state.time,stopped=await settlePaused(paused);
   await page.clock.runFor(1500);assert.equal((await snapshot()).state.time,paused);
   assert.equal((await snapshot()).state.performance.frames,stopped.performance.frames,'pause stops recurring Rally redraws');
   const originalViewport=page.viewportSize(),beforeResize=await canvasPixels();
   await page.setViewportSize({width:mobile?350:1040,height:originalViewport.height});
   await page.waitForFunction(width=>document.querySelector('.quality-hill .q-canvas').width!==width,beforeResize.width,{polling:50,timeout:5000});
   const resized=await settlePaused(paused),resizedPixels=await canvasPixels();
   assert.ok(resized.performance.frames>stopped.performance.frames,'resizing a paused ride requests a new paint');
   assert.ok(resizedPixels.painted>resizedPixels.width*resizedPixels.height/2,'the resized backing canvas is painted, not blank');
   await page.clock.runFor(500);assert.equal((await snapshot()).state.performance.frames,resized.performance.frames,'the resized ride becomes quiescent again');
   await page.setViewportSize(originalViewport);
   await page.waitForFunction(width=>document.querySelector('.quality-hill .q-canvas').width!==width,resizedPixels.width,{polling:50,timeout:5000});
   await settlePaused(paused);
   await root.locator('summary').click();await settlePaused(paused);const beforePaint=await canvasPixels();
   await button('Lilac').click();const repainted=await settlePaused(paused);
   assert.equal(repainted.paint,'#b29bd5');assert.notEqual((await canvasPixels()).hash,beforePaint.hash,'a paint change redraws the paused car');
   assert.equal(repainted.performance.steps,stopped.performance.steps,'changing paint does not restart fixed updates');
   assert.equal(repainted.inputActive,0);await button('Apricot').click();await root.locator('summary').click();await settlePaused(paused);
   await button('Resume game').click();assert.equal((await snapshot()).state.inputActive,0);
   // Losing focus clears a held pedal and never accumulates a hidden catch-up interval.
   await page.keyboard.down('ArrowRight');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));const hiddenTime=(await snapshot()).state.time;
   await page.clock.runFor(20000);assert.equal((await snapshot()).state.time,hiddenTime);assert.equal((await snapshot()).state.inputActive,0);
   await page.keyboard.up('ArrowRight');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.clock.runFor(100);
   assert.ok((await snapshot()).state.time-hiddenTime<.15);
   await button('↶ Try again').click();assert.equal((await snapshot()).state.mode,'ready');assert.equal((await snapshot()).state.time,0);
   assert.ok((await snapshot()).state.best.meadow>=moving.state.distance,'retry retains an unfinished ride’s best distance');
   const bestBeforeSwitch=(await snapshot()).state.best.meadow;
   await root.getByRole('combobox',{name:'Choose a trail'}).selectOption('ridge');
   assert.equal((await snapshot()).state.best.meadow,bestBeforeSwitch,'changing trails attributes distance to the original trail');
   await root.getByRole('combobox',{name:'Choose a trail'}).selectOption('meadow');
   if(mobile){
    const pedal=root.locator('[data-pedal=go]');await pedal.scrollIntoViewIfNeeded();const r=await pedal.boundingBox(),client=await context.newCDPSession(page);
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width/2,y:r.y+r.height/2}]});
    await page.clock.runFor(800);assert.ok((await snapshot()).state.distance>.3);
    await client.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal((await snapshot()).state.inputActive,0,'touch cancellation releases the motor');
    await button('↶ Try again').click();
   }
   await button('Let’s drive →').click();await page.keyboard.down('ArrowRight');await page.clock.runFor(12000);await page.keyboard.up('ArrowRight');
   assert.equal((await snapshot()).state.status,'won','an actual drive reaches camp');assert.equal((await snapshot()).state.mode,'result');
   assert.equal(await page.locator('#stage-overlay').isVisible(),false,'the recent-question budget leaves this physical replay available');
   await root.screenshot({path:`test-results/quality-hill-camp-${mobile?'mobile':'desktop'}.png`});
   await button('Finish this trip').click();await page.waitForSelector('#resultNext');await page.click('#resultNext');
   assert.equal((await snapshot()).state.track,'ridge');
   await root.locator('summary').click();await button('Sea green').click();
   // A garage phrase goes straight into a real saved experiment, carrying the ride.
   await button('Make the wheels bigger').click();await page.waitForSelector('.quality-hill');
   assert.equal((await snapshot()).config.wheelSize,.57);assert.equal((await snapshot()).state.paint,'#50a89a');assert.equal((await snapshot()).state.track,'ridge');
   await page.click('#returnLive');
   for(const [prompt,key,value] of [['Make springs softer','suspension',3.5],['Make motor stronger','enginePower',1.2],['Make car lighter','chassisMass',.8],['Make wheels bigger','wheelSize',.62]]){
    await page.fill('#livePrompt',prompt);await page.click('#livePromptForm button[type=submit]');await page.waitForSelector('.quality-hill');
    assert.equal((await snapshot()).config[key],value);assert.equal((await snapshot()).state.paint,'#50a89a');assert.equal((await snapshot()).state.track,'ridge');await page.click('#returnLive');
   }
   assert.equal(await page.locator('#compareVersion option').count(),6);await page.click('#liveKeep');
   await page.locator('#versionTools').evaluate(el=>el.open=true);await page.fill('#forkName','My bouncy green car');await page.click('#liveForkForm button[type=submit]');
   await page.click('#livePlay');assert.equal((await snapshot()).state.paint,'#50a89a');assert.equal((await snapshot()).config.wheelSize,.62);
   // Switching profiles unmounts after the active profile changes. Its save must stay with the owner.
   await page.locator('.profile-choice').nth(1).click();assert.deepEqual(await page.evaluate(()=>FG.store.current().constructionStates||{}),{});
   await page.locator('.profile-choice').first().click();await page.reload();await page.waitForFunction(()=>window.FG?.factory);
   await page.getByRole('navigation').getByRole('button',{name:'🎨 My Creations',exact:true}).click();
   await page.getByRole('button',{name:'🎮 My bouncy green car',exact:true}).click();await page.click('#livePlay');
   assert.equal((await snapshot()).state.paint,'#50a89a');assert.equal((await snapshot()).state.track,'ridge');assert.equal((await snapshot()).config.wheelSize,.62);
   await page.evaluate(()=>{window.qualitySave=FG.store.save;FG.store.save=()=>false});
   await button('↶ Try again').click();await button('Let’s drive →').click();await page.clock.runFor(300);
   assert.equal(await root.locator('[data-save-notice=hill]').isVisible(),true,'save failure stays visible through ordinary HUD updates');
   await page.evaluate(()=>{FG.store.save=window.qualitySave;delete window.qualitySave});await button('↶ Try again').click();
   assert.equal(await root.locator('[data-save-notice=hill]').isVisible(),false);
   for(const track of ['constructor',['meadow']]){
    await page.evaluate(track=>{FG.app.openGame('buckets');FG.store.current().constructionStates['original-hill']={legacyMarker:'retain me',qualityConstruction:{schema:'quality-hill-v1',track,best:{},paint:'#e99b55'}};FG.store.save();FG.app.openGame('hill')},track);
    assert.equal((await snapshot()).state.storageBlocked,true,'malformed saved trails show recovery instead of accepting coerced keys');
    await page.evaluate(()=>FG.app.openGame('buckets'));
    assert.deepEqual(await page.evaluate(()=>FG.store.current().constructionStates['original-hill'].qualityConstruction.track),track,'unsupported saved ride stays intact');
   }
   assert.deepEqual(requests,[],'gameplay and local changes need no paid/server generation');assert.deepEqual(errors,[]);
   await context.close();console.log(`PASS quality hill ${mobile?'touch':'desktop'}: motor, suspension, focus, browser shortcuts, paused redraw/resize/paint, retry, physical win, five changes, fork/reload and owner-scoped saves`);
  }
 }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exitCode=1});

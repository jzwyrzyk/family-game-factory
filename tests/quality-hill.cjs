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
   await page.evaluate(()=>{FG.store.changeProfile({rate:0});FG.app.openGame('hill')});
   const root=page.locator('.quality-hill'),button=name=>root.getByRole('button',{name,exact:true});
   const snapshot=()=>page.evaluate(()=>FG.runtime.snapshot());
   assert.equal((await snapshot()).state.engine,'quality-hill-v1');assert.equal((await snapshot()).state.mode,'ready');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await root.screenshot({path:`test-results/quality-hill-${mobile?'mobile':'desktop'}.png`});
   await button('Let’s drive →').click();
   await page.keyboard.down('ArrowRight');await page.clock.runFor(1000);await page.keyboard.up('ArrowRight');
   const moving=await snapshot();assert.ok(moving.state.distance>1,'the wheels actually propel the chassis');assert.ok(moving.state.speed>1);
   assert.equal(moving.state.resources.bodies,3);assert.equal(moving.state.resources.joints,2);
   await button('Pause game').click();const paused=(await snapshot()).state.time;await page.clock.runFor(1500);assert.equal((await snapshot()).state.time,paused);
   await button('Resume game').click();assert.equal((await snapshot()).state.inputActive,0);
   // Losing focus clears a held pedal and never accumulates a hidden catch-up interval.
   await page.keyboard.down('ArrowRight');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));const hiddenTime=(await snapshot()).state.time;
   await page.clock.runFor(20000);assert.equal((await snapshot()).state.time,hiddenTime);assert.equal((await snapshot()).state.inputActive,0);
   await page.keyboard.up('ArrowRight');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.clock.runFor(100);
   assert.ok((await snapshot()).state.time-hiddenTime<.15);
   await button('↶ Try again').click();assert.equal((await snapshot()).state.mode,'ready');assert.equal((await snapshot()).state.time,0);
   if(mobile){
    const pedal=root.locator('[data-pedal=go]');await pedal.scrollIntoViewIfNeeded();const r=await pedal.boundingBox(),client=await context.newCDPSession(page);
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width/2,y:r.y+r.height/2}]});
    await page.clock.runFor(800);assert.ok((await snapshot()).state.distance>.3);
    await client.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal((await snapshot()).state.inputActive,0,'touch cancellation releases the motor');
    await button('↶ Try again').click();
   }
   await button('Let’s drive →').click();await page.keyboard.down('ArrowRight');await page.clock.runFor(12000);await page.keyboard.up('ArrowRight');
   assert.equal((await snapshot()).state.status,'won','an actual drive reaches camp');assert.equal((await snapshot()).state.mode,'result');
   assert.equal(await page.locator('#stage-overlay').isVisible(),false,'replay is not interrupted by a compulsory host question');
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
   assert.deepEqual(requests,[],'gameplay and local changes need no paid/server generation');assert.deepEqual(errors,[]);
   await context.close();console.log(`PASS quality hill ${mobile?'touch':'desktop'}: motor, suspension, focus, retry, physical win, five changes, fork/reload and owner-scoped saves`);
  }
 }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exitCode=1});

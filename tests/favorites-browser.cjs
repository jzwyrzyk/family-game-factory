const {exploreWelcome,navigate}=require('./studio-entry.cjs');
const {openSavedNative}=require('./saved-native-fixture.cjs');
/* Curated favorites run in the actual game lifecycle, not fake loading screens. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {start}=require('./browser-server.cjs');
(async()=>{
 const server=start(),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 const url='http://127.0.0.1:'+server.address().port+'/arcade/?studio=1';
 try{
  for(const [device,viewport] of [['desktop',{width:1280,height:900}],['tablet',{width:820,height:1080}]]){
   const context=await browser.newContext({viewport,hasTouch:device==='tablet',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   try{
    await page.goto(url);await page.waitForFunction(()=>window.FG?.studio&&window.FG?.runtime);await exploreWelcome(page);
    const favorites=page.locator('#studioStarters [data-starter]');
    assert.deepEqual(await favorites.evaluateAll(nodes=>nodes.map(node=>node.dataset.starter)),['factory','mining','gum','hill']);
    assert.deepEqual(await page.locator('#studioOriginals [data-starter]').evaluateAll(nodes=>nodes.map(node=>node.dataset.starter)),['dragon','buckets']);
    assert.equal(await page.locator('[data-starter="moon"],[data-starter="robot"]').count(),0,'retired games leave the default catalogue');
    assert.equal((await page.locator('#studioStarterTitle').textContent()).trim(),'Ready to Play jems','favorites shelf uses the approved child-facing heading');
    await page.click('[data-starter="mining"]');await page.locator('.native-mining[data-assets="ready"]').waitFor();
    const mineX=await page.evaluate(()=>FG.runtime.snapshot().state.playerX);
    await page.locator('.myj-stage').focus();await page.keyboard.down('ArrowLeft');await page.waitForTimeout(300);await page.keyboard.up('ArrowLeft');
    assert.ok(await page.evaluate(()=>FG.runtime.snapshot().state.playerX)<mineX-3,'mining is an actual native game, available without a build');
    const minePause=await page.evaluate(()=>({paused:FG.runtime.pause(),state:FG.runtime.snapshot().state}));
    assert.equal(minePause.paused,true);await page.waitForTimeout(150);
    assert.deepEqual(await page.evaluate(()=>FG.runtime.snapshot().state),minePause.state,'native learning pause freezes the same mining simulation');
    await page.evaluate(()=>FG.runtime.resume());
    const moonDraft='Could my cat bounce from one donut to the next?';
    const moonId=await openSavedNative(page,'moon',{playOnly:true,draft:moonDraft});await page.waitForSelector('.favorite-moon .favorite-canvas');
    assert.equal(await page.evaluate(id=>FG.studio.exportNotebook().sessions.find(s=>s.id===id).draft,moonId),moonDraft,'a retired starter with an unfinished draft stays reachable through its saved-game card');
    await page.locator('.favorite-moon .favorite-canvas').focus();
    const original=await page.evaluate(()=>FG.runtime.snapshot().state.x);
    await page.keyboard.down('ArrowRight');await page.waitForTimeout(250);await page.keyboard.up('ArrowRight');
    const moved=await page.evaluate(()=>FG.runtime.snapshot().state.x);
    assert.ok(moved>original+8,'moon game responds to the actual control');
    await openSavedNative(page,'moon');await page.waitForSelector('.favorite-moon');
    const resumed=await page.evaluate(()=>FG.runtime.snapshot().state.x);
    assert.ok(resumed>=moved-5,'moon mission position survives leaving and returning');
    const paused=await page.evaluate(()=>({ok:FG.runtime.pause(),state:FG.runtime.snapshot().state}));
    assert.equal(paused.ok,true,'moon action can reach a safe host checkpoint');
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(()=>FG.runtime.snapshot().state.x),paused.state.x,'game stops while learning is active');
    await page.evaluate(()=>FG.runtime.resume());
    assert.equal(await page.evaluate(()=>FG.runtime.isPlaying()),true);
    await navigate(page,'#studioNavHome');
    const robotIdea='I want the robot to help find my missing star.';
    const robotId=await openSavedNative(page,'robot',{playOnly:true,childMessage:robotIdea});await page.waitForSelector('.favorite-robot .favorite-canvas');
    assert.equal(await page.evaluate(id=>FG.studio.exportNotebook().sessions.find(s=>s.id===id).messages.find(m=>m.role==='child')?.text,robotId),robotIdea,'a retired starter conversation stays reachable before any experiment exists');
    const root=page.locator('.favorite-robot');
    for(let i=0;i<4;i++)await root.locator('[data-direction="right"]').click();
    for(let i=0;i<4;i++)await root.locator('[data-direction="up"]').click();
    assert.equal(await page.evaluate(()=>FG.runtime.snapshot().state.planLength),8,'the robot runs a child-authored plan');
    await openSavedNative(page,'robot');await page.waitForSelector('.favorite-robot');
    assert.equal(await page.evaluate(()=>FG.runtime.snapshot().state.planLength),8,'a saved route survives leaving to check another build');
    await page.locator('.favorite-robot').getByRole('button',{name:'Run my plan'}).click();
    await page.waitForFunction(()=>FG.runtime.snapshot().state.position.x>=1,{timeout:5000});
    const state=await page.evaluate(()=>FG.runtime.snapshot().state);
    assert.equal(state.running,true);
    assert.ok(state.position.x>0,'robot movement is physical game state, not a static picture');
    const freeze=await page.evaluate(()=>({paused:FG.runtime.pause(),state:FG.runtime.snapshot().state}));
    assert.equal(freeze.paused,true);
    await page.waitForTimeout(500);
    assert.deepEqual(await page.evaluate(()=>FG.runtime.snapshot().state.position),freeze.state.position,'robot also freezes during learning');
    await page.evaluate(()=>FG.runtime.resume());
    await page.waitForFunction(()=>FG.runtime.snapshot().state.position.y<4,{timeout:9000});
    assert.deepEqual(errors,[],device+' native favorites have no page errors');
    console.log('PASS '+device+': curated shelves, native mining, saved moon/robot compatibility and safe checkpoints');
   }finally{await context.close();}
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});

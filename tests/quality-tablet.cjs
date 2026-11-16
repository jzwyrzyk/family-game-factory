const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');

// Representative emulated tablet viewports, not evidence from actual family hardware.
(async()=>{
 const server=require('./browser-server.cjs').start();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
 fs.mkdirSync('test-results',{recursive:true});
 try{
  for(const [orientation,viewport] of [['portrait',{width:820,height:1180}],['landscape',{width:1180,height:820}]]){
   const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:2});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   const touch=async locator=>{
    await locator.scrollIntoViewIfNeeded();
    const r=await locator.boundingBox(); assert.ok(r);
    await page.touchscreen.tap(r.x+r.width/2,r.y+r.height/2);
   };
   try{
    await page.goto(`http://127.0.0.1:${server.address().port}/arcade/`);
    await page.waitForFunction(()=>window.FG?.app);
    assert.equal(await page.evaluate(()=>matchMedia('(pointer: coarse)').matches),true,'tablet emulation must have a coarse pointer');
    await page.evaluate(()=>{FG.store.changeProfile({rate:0});FG.app.openGame('gum')});
    const root=page.locator('.quality-builder'),button=name=>root.getByRole('button',{name,exact:true}),canvas=root.locator('.q-canvas');
    await root.waitFor();await touch(button('Start fresh'));await touch(button('Add Bottle'));await touch(button('Add Cardboard box'));
    let state=await page.evaluate(()=>FG.runtime.snapshot().state);
    assert.equal(state.parts.length,2); assert.equal(state.selected,state.parts[1].id);
    const previous=button('Previous piece'),next=button('Next piece');
    assert.equal(await previous.isVisible(),true,'tablet has a way to select small or overlapping parts');
    const r=await previous.boundingBox();assert.ok(r&&r.height>=44,'touch selection button is finger sized');
    await touch(previous);state=await page.evaluate(()=>FG.runtime.snapshot().state);
    assert.equal(state.selected,state.parts[0].id,'previous selects the first part');
    assert.match(await root.locator('.q-piece-picker-label').textContent(),/Selected 1 of 2/);
    await touch(next);state=await page.evaluate(()=>FG.runtime.snapshot().state);
    assert.equal(state.selected,state.parts[1].id,'next returns to the second part');
    await touch(button('Rotate selected part'));
    state=await page.evaluate(()=>FG.runtime.snapshot().state);
    assert.ok(state.parts[1].angle>.2,'tablet touch rotation changes the actual construction');
    const bounds=await canvas.boundingBox();assert.ok(bounds&&bounds.height>250);
    if(orientation==='landscape')assert.ok(bounds.height<=viewport.height*.48+2,'landscape tablet reserves room for controls');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal page overflow');
    await root.screenshot({path:`test-results/quality-tablet-builder-${orientation}.png`});
    await page.evaluate(()=>FG.app.openGame('hill'));
    const hill=page.locator('.quality-hill'),go=hill.locator('[data-pedal=go]');
    await hill.waitFor();
    const pedal=await go.boundingBox();
    const pedalDiagnostics=await go.evaluate(el=>({
      computedMinWidth:getComputedStyle(el).minWidth,computedMinHeight:getComputedStyle(el).minHeight,
      innerWidth,innerHeight,coarse:matchMedia('(pointer: coarse)').matches,anyCoarse:matchMedia('(any-pointer: coarse)').matches
    }));
    assert.ok(pedal&&pedal.width>=147&&pedal.height>=75,'tablet pedals are large: '+JSON.stringify({pedal,orientation,pedalDiagnostics}));
    const hillCanvas=await hill.locator('.q-canvas').boundingBox();assert.ok(hillCanvas&&hillCanvas.height>250);
    if(orientation==='landscape')assert.ok(hillCanvas.height<=viewport.height*.48+2,'landscape driving stage reserves room for pedals');
    const session=await context.newCDPSession(page);
    await go.scrollIntoViewIfNeeded();const p=await go.boundingBox();assert.ok(p);
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x+p.width/2,y:p.y+p.height/2}]});
    await page.waitForTimeout(300);
    state=await page.evaluate(()=>FG.runtime.snapshot().state);
    assert.equal(state.mode,'drive');assert.ok(state.distance>0,'holding the touch pedal physically moves the car');
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    state=await page.evaluate(()=>FG.runtime.snapshot().state);
    assert.equal(state.inputActive,0,'releasing touch stops the motor command');
    await hill.screenshot({path:`test-results/quality-tablet-rally-${orientation}.png`});
    assert.deepEqual(errors,[]);
    console.log(`PASS tablet ${orientation}: touch piece-picker/rotate, landscape stage, large pedal, held driving and release`);
   }finally{await context.close();}
  }
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1});

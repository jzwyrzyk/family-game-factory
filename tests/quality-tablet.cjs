const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');

// Observe one real tap without replaying input or changing event delivery.
// Playwright's tap acknowledgement covers touch events, not the button's click.
function armTabletTap(button){
 const doc=button.ownerDocument,win=doc.defaultView,started=win.performance.now();
 // Mouse/focus/scroll observations explain a native click redirected after
 // touchend. They do not prevent defaults, move focus, scroll, or replay input.
 const types=['pointerdown','pointerup','pointercancel','touchstart','touchend','touchcancel','mouseover','mousedown','mouseup','focusin','focusout','scroll','scrollend','click'];
 const viewportTypes=['scroll','resize','scrollend'];
 const receipt={ready:false,clicks:0,cancelled:0,redirectedInput:0,redirectedClicks:0,untrustedClicks:0,events:[],eventsTruncated:0};
 const describe=node=>node?.nodeType===1?{tag:node.tagName,id:(node.id||'').slice(0,64),classes:(node.getAttribute('class')||'').slice(0,80),label:(node.getAttribute('aria-label')||'').slice(0,80)}:node===doc?{tag:'#document'}:node&&node===win.visualViewport?{tag:'VisualViewport'}:null;
 const root=button.closest('.quality-builder'),picker=root?.querySelector('.q-piece-picker');
 const geometry=()=>{
  const r=button.getBoundingClientRect(),p=picker?.getBoundingClientRect(),v=win.visualViewport;
  return {
   rect:{x:r.x,y:r.y,width:r.width,height:r.height},documentY:r.y+win.scrollY,
   scroll:{x:win.scrollX,y:win.scrollY,documentHeight:doc.documentElement.scrollHeight,clientHeight:doc.documentElement.clientHeight},
   viewport:{width:win.innerWidth,height:win.innerHeight,visual:v?{offsetTop:v.offsetTop,pageTop:v.pageTop,height:v.height,scale:v.scale}:null},
   active:describe(doc.activeElement),picker:p?{hidden:picker.hidden,y:p.y,documentY:p.y+win.scrollY,height:p.height}:null,
   connected:button.isConnected
  };
 };
 const state=()=>{
  const s=win.FG?.runtime?.snapshot()?.state;
  return s?{mode:s.mode,partCount:s.parts?.length,parts:s.parts?.slice(0,3).map(p=>({id:p.id,kind:p.kind,angle:p.angle})),selected:s.selected,paused:s.paused}:null;
 };
 const before={...geometry(),scrollBehavior:win.getComputedStyle(doc.documentElement).scrollBehavior,state:state()};
 const record=event=>{
  const path=event.composedPath(),targetButton=path.find(node=>node?.nodeType===1&&node.tagName==='BUTTON');
  const onButton=targetButton===button,point=event.changedTouches?.[0]||event;
  receipt.events.push({type:event.type,source:event.currentTarget===win.visualViewport?'visualViewport':'document',ms:Math.round(win.performance.now()-started),trusted:event.isTrusted,onButton,target:describe(event.target),button:describe(targetButton),pointerType:event.pointerType||null,point:Number.isFinite(point.clientX)?{x:point.clientX,y:point.clientY}:null,targetScroll:event.type==='scroll'&&event.target?.nodeType===1?{x:event.target.scrollLeft,y:event.target.scrollTop}:null,...geometry()});
  // Keep the release/click tail even if scrolling filled the bound before input.
  if(receipt.events.length>32){receipt.events.shift();receipt.eventsTruncated++;}
  if(event.isTrusted&&(event.type==='pointercancel'||event.type==='touchcancel')){receipt.cancelled++;receipt.ready=true;}
  if(event.isTrusted&&!onButton&&['pointerdown','pointerup','touchstart','touchend'].includes(event.type)){receipt.redirectedInput++;receipt.ready=true;}
  if(event.type==='click'){
   if(!event.isTrusted)receipt.untrustedClicks++;
   else if(onButton)receipt.clicks++;
   else receipt.redirectedClicks++;
   receipt.ready=true;
  }
 };
 for(const type of types)doc.addEventListener(type,record,{capture:true,passive:true});
 for(const type of viewportTypes)win.visualViewport?.addEventListener(type,record,{passive:true});
 let finalEvidence;
 receipt.finish=()=>{
  if(!finalEvidence){
   for(const type of types)doc.removeEventListener(type,record,true);
   for(const type of viewportTypes)win.visualViewport?.removeEventListener(type,record);
   finalEvidence={button:{...describe(button),name:(button.getAttribute('aria-label')||button.textContent||'').trim().slice(0,80)},elapsedMs:Math.round(win.performance.now()-started),clicks:receipt.clicks,cancelled:receipt.cancelled,redirectedInput:receipt.redirectedInput,redirectedClicks:receipt.redirectedClicks,untrustedClicks:receipt.untrustedClicks,before,after:{...geometry(),state:state()},events:receipt.events,eventsTruncated:receipt.eventsTruncated};
  }
  return finalEvidence;
 };
 return receipt;
}

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
   let lastTouchEvidence;
   const recentButtonTaps=[];
   // Keep real touch input and wait for the control's actionability and stable
   // position, then observe its one trusted activation before reading game state.
   const touch=async locator=>{
    const receipt=await locator.evaluateHandle(armTabletTap);
    try{
     await locator.tap();
     await page.waitForFunction(r=>r.ready,receipt,{timeout:2000});
     lastTouchEvidence=await receipt.evaluate(r=>r.finish());
     const {clicks,cancelled,redirectedInput,redirectedClicks,untrustedClicks}=lastTouchEvidence;
     assert.deepEqual({clicks,cancelled,redirectedInput,redirectedClicks,untrustedClicks},{clicks:1,cancelled:0,redirectedInput:0,redirectedClicks:0,untrustedClicks:0},'one tablet tap activates exactly its requested button once');
    }finally{
     lastTouchEvidence=await receipt.evaluate(r=>r.finish()).catch(error=>({observationError:String(error.message).slice(0,200)}));
     recentButtonTaps.push(lastTouchEvidence);if(recentButtonTaps.length>3)recentButtonTaps.shift();
     await receipt.dispose().catch(()=>{});
    }
   };
   const assertTouch=async phase=>{
    const capability=await page.evaluate(()=>({maxTouchPoints:navigator.maxTouchPoints,coarse:matchMedia('(pointer: coarse)').matches,anyCoarse:matchMedia('(any-pointer: coarse)').matches,innerWidth,innerHeight}));
    assert.ok(capability.maxTouchPoints>0&&capability.coarse&&capability.anyCoarse,`${orientation} ${phase}: real tablet touch emulation remains active: ${JSON.stringify(capability)}`);
   };
   const capture=async (name,target)=>{
    await target.scrollIntoViewIfNeeded();await assertTouch(`before ${name} capture`);
    // Beyond-viewport element/full-page captures can clear Chromium touch
    // emulation in this version: microsoft/playwright#42607. Keep the actual
    // tablet viewport while this journey continues to exercise touch input.
    await page.screenshot({path:`test-results/quality-tablet-${name}-${orientation}.png`,fullPage:false});
    await assertTouch(`after ${name} capture`);
   };
   try{
    await page.goto(`http://127.0.0.1:${server.address().port}/arcade/?arcade=1`);
    await page.waitForFunction(()=>window.FG?.app);
    await assertTouch('after navigation');
    await page.evaluate(()=>{FG.store.changeProfile({rate:1});FG.app.openGame('gum',{config:{qualityVersion:1,gravity:10,thrust:1,originalRules:true,gumBudget:10,jointStrength:1,highlightMatches:false,extraDecoys:0}})});
    const root=page.locator('.quality-builder'),button=name=>root.getByRole('button',{name,exact:true}),canvas=root.locator('.q-canvas');
    await root.waitFor();
    const trayPosition=()=>root.locator('.q-parts').evaluate(node=>node.getBoundingClientRect().y+scrollY);
    const initialTrayPosition=await trayPosition();
    await touch(button('Start fresh'));
    let state=await page.evaluate(()=>FG.runtime.snapshot().state);
    assert.equal(state.parts.length,0,'Start fresh clears the actual construction');
    assert.equal(state.selected,null,'Start fresh clears the selected part');
    assert.equal(await trayPosition(),initialTrayPosition,'reset keeps the part tray in place through touch and click');
    assert.equal(await button('Next piece').isDisabled(),true,'empty picker remains visible with unavailable navigation disabled');
    await touch(button('Add Bottle'));state=await page.evaluate(()=>FG.runtime.snapshot().state);
    assert.equal(state.parts.length,1,'one Add Bottle touch adds exactly one part');
    assert.equal(state.parts[0].kind,'bottle','the first touch adds the requested bottle');
    assert.equal(state.selected,state.parts[0].id,'the added bottle becomes the selected part');
    assert.equal(await trayPosition(),initialTrayPosition,'adding the first part does not shift the tray');
    assert.equal(await button('Next piece').isDisabled(),true,'one part needs no next-piece navigation');
    await touch(button('Add Cardboard box'));state=await page.evaluate(()=>FG.runtime.snapshot().state);
    assert.equal(state.parts.length,2); assert.equal(state.selected,state.parts[1].id);
    assert.equal(await trayPosition(),initialTrayPosition,'adding the second part does not insert a row above the tray');
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
    await capture('builder',root.locator('.q-piece-picker'));
    await page.evaluate(()=>FG.app.openGame('hill'));
    const hill=page.locator('.quality-hill'),go=hill.locator('[data-pedal=go]');
    await hill.waitFor();
    const pedal=await go.boundingBox();
    const pedalDiagnostics=await go.evaluate(el=>({
      computedMinWidth:getComputedStyle(el).minWidth,computedMinHeight:getComputedStyle(el).minHeight,
      innerWidth,innerHeight,coarse:matchMedia('(pointer: coarse)').matches,anyCoarse:matchMedia('(any-pointer: coarse)').matches
    }));
    assert.ok(pedal&&pedal.width>=147&&pedal.height>=75,'tablet pedals are large: '+JSON.stringify({pedal,orientation,pedalDiagnostics}));
    // Opening a lazy game can expose the DOM before ResizeObserver/viewport layout has settled.
    // Require the final physical canvas height, not an intermediate browser frame.
    if(orientation==='landscape'){
      await page.waitForFunction(maxHeight=>{
        const canvas=document.querySelector('.quality-hill .q-canvas');
        return canvas&&canvas.style.height&&canvas.getBoundingClientRect().height<=maxHeight;
      },viewport.height*.48+2,{timeout:3000}).catch(async()=>{
        const layout=await hill.locator('.q-canvas').evaluate(c=>({
          rect:c.getBoundingClientRect().toJSON(),inlineHeight:c.style.height,computedHeight:getComputedStyle(c).height,
          stageWidth:c.parentElement.getBoundingClientRect().width,innerWidth,innerHeight,
          pointerCoarse:matchMedia('(pointer: coarse)').matches,anyPointerCoarse:matchMedia('(any-pointer: coarse)').matches,
          maxTouchPoints:navigator.maxTouchPoints
        }));
        throw Error('Landscape tablet stage failed to settle: '+JSON.stringify(layout));
      });
    }
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
    await capture('rally',go);
    assert.deepEqual(errors,[]);
    console.log(`PASS tablet ${orientation}: touch piece-picker/rotate, landscape stage, large pedal, held driving and release`);
   }catch(error){
    console.error(`Tablet ${orientation} input evidence: ${JSON.stringify({browserVersion:browser.version(),recentButtonTaps,pageErrors:errors.slice(-4).map(message=>message.slice(0,200)),pageErrorsTruncated:Math.max(0,errors.length-4)})}`);
    throw error;
   }finally{await context.close();}
  }
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1});

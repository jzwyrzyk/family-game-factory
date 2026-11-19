/* Browser contract for the default sticker-first child game.
   The old physical workshop has its own unchanged regression suite. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {start}=require('./browser-server.cjs');
(async()=>{
 const server=start(),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 try{
  for(const [device,viewport] of [['desktop',{width:1360,height:900}],['tablet',{width:820,height:1024}],['phone',{width:390,height:844}]]){
   const ctx=await browser.newContext({viewport,hasTouch:device!=='desktop',reducedMotion:'reduce'});
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   await page.goto('http://127.0.0.1:'+server.address().port+'/arcade/?arcade=1');
   await page.waitForFunction(()=>FG?.app&&FG.runtime);
   await page.evaluate(()=>{FG.store.changeProfile({rate:1});FG.store.current().mathWindow=[Date.now()];FG.store.save();FG.app.openGame('gum');});
   const root=page.locator('.gum-play');await root.waitFor();
   if(device==='phone'){
    const geometry=await page.evaluate(()=>{
     const rect=sel=>document.querySelector(sel).getBoundingClientRect();
     const stage=rect('.gum-scene'),choices=rect('.gum-stickers'),go=rect('.gum-launch'),game=rect('.gum-play');
     return {stageToGo:go.bottom-stage.top,stageToChoices:choices.bottom-stage.top,wholeGame:game.height};
    });
    assert.ok(geometry.stageToGo<=viewport.height-80,'phone sticker tray and launch must fit with the machine: '+JSON.stringify(geometry));
    assert.ok(geometry.wholeGame<=viewport.height,'the entire phone build game must fit after scrolling to it: '+JSON.stringify(geometry));
   }
   assert.equal(await page.evaluate(()=>FG.runtime.snapshot().config.qualityVersion),2,'new games use stickers rather than physics');
   const mission=root.locator('[data-gum-slot]');
   assert.equal(await mission.count(),3);assert.equal(await root.locator('.gum-sticker').count(),6);
   assert.ok(await root.getByRole('button',{name:/Put on 3 stickers/}).isDisabled(),'cannot launch unfinished invention');
   // Tap or keyboard activation; the same controls must work without drag.
   await root.getByRole('button',{name:'Select Super star'}).click();
   await root.getByRole('button',{name:'Put a sticker on Top'}).click();
   await page.waitForFunction(()=>FG.runtime.snapshot().state.stickersPlaced===1);
   assert.equal(await root.getByRole('button',{name:/Change Top sticker/}).count(),1);
   await root.getByRole('button',{name:'Select Love power'}).click();
   await root.getByRole('button',{name:'Put a sticker on Window'}).click();
   assert.equal(await page.evaluate(()=>FG.runtime.snapshot().state.stickersPlaced),2);
   // Undo restores the previous in-progress artwork without clearing the save.
   await root.getByRole('button',{name:'Undo'}).click();
   assert.equal(await page.evaluate(()=>FG.runtime.snapshot().state.stickersPlaced),1);
   await root.getByRole('button',{name:'Select Happy flower'}).click();
   await root.getByRole('button',{name:'Put a sticker on Window'}).click();
   // Pointer drag, not only click-to-place: keep sticker and target reachable together.
   await root.scrollIntoViewIfNeeded();
   const from=await root.getByRole('button',{name:'Select Googly eyes'}).boundingBox();
   const to=await root.getByRole('button',{name:'Put a sticker on Boost'}).boundingBox();
   assert.ok(from&&to,'source and target sticker controls stay reachable');
   const point=box=>({x:box.x+box.width/2,y:box.y+box.height/2}),start=point(from),end=point(to);
   if(device==='desktop'){
    await page.mouse.move(start.x,start.y);await page.mouse.down();
    await page.mouse.move(end.x,end.y,{steps:8});await page.mouse.up();
   }else{
    const cdp=await ctx.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
    for(const step of [.25,.5,.75,1])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(end.x-start.x)*step,y:start.y+(end.y-start.y)*step}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   }
   await page.waitForFunction(()=>FG.runtime.snapshot().state.stickersPlaced===3);
   assert.equal(await page.evaluate(()=>FG.runtime.snapshot().state.stickersPlaced),3);
   assert.deepEqual(await page.evaluate(()=>FG.runtime.snapshot().state.stickers),{top:'star',middle:'flower',boost:'eyes'});
   const persisted=await page.evaluate(()=>structuredClone(FG.store.current().constructionStates['original-gum'].stickerConstruction));
   assert.equal(persisted.schema,'gum-stickers-v1');
   await root.screenshot({path:'test-results/gum-stickers-'+device+'.png'});
   // Re-enter game and check separate, durable sticker save.
   await page.evaluate(()=>FG.app.openGame('buckets'));
   await page.evaluate(()=>FG.app.openGame('gum'));
   assert.equal(await page.evaluate(()=>FG.runtime.snapshot().state.stickersPlaced),3);
   // The physical-mode legacy save sits beside, not inside, sticker progress.
   await page.evaluate(()=>FG.app.openGame('gum',{config:{qualityVersion:1,gravity:10,thrust:1,originalRules:true,gumBudget:10,jointStrength:1,highlightMatches:false,extraDecoys:0}}));
   await page.locator('.quality-builder').waitFor();
   await page.getByRole('button',{name:'Start fresh',exact:true}).click();
   await page.getByRole('button',{name:'Add Bottle',exact:true}).click();
   const savedBoth=await page.evaluate(()=>FG.store.current().constructionStates['original-gum']);
   assert.deepEqual(savedBoth.stickerConstruction,persisted);
   assert.equal(savedBoth.qualityConstruction.schema,'quality-construction-v1');
   await page.evaluate(()=>FG.app.openGame('gum'));
   assert.equal(await page.evaluate(()=>FG.runtime.snapshot().state.stickersPlaced),3);
   await root.getByRole('button',{name:/BLAST OFF!/}).click();
   await page.waitForSelector('#native-result-title',{timeout:9000});
   assert.match(await page.locator('#native-result-title').textContent(),/Rocket Pop/);
   assert.equal(await page.evaluate(()=>FG.runtime.snapshot().state.stage),'done');
   await page.getByRole('button',{name:/Next level/}).click();
   assert.equal(await page.evaluate(()=>FG.runtime.snapshot().state.mission),'sub');
   assert.equal(await page.evaluate(()=>FG.runtime.snapshot().state.stickersPlaced),0);
   await page.reload();await page.waitForFunction(()=>FG?.app);
   await page.evaluate(()=>FG.app.openGame('gum'));
   assert.equal(await page.evaluate(()=>FG.runtime.snapshot().state.mission),'sub');
   assert.deepEqual(errors,[]);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'no horizontal overflow');
   console.log('PASS sticker game '+device+': select, tap, undo, launch, legacy physics isolation, save, next mission');
   await ctx.close();
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});

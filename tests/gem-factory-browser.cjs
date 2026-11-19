/* Play the actual Gem Factory through the production Studio and learning host. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {start}=require('./browser-server.cjs');

const snapshot=page=>page.evaluate(()=>FG.runtime.snapshot().state);
async function finishLearning(page){
 const activity=page.locator('.math-activity:visible');
 await activity.waitFor({state:'visible'});
 assert.equal(await page.evaluate(()=>FG.learning.active),true,'completed factory work reaches real learning');
 await activity.locator('[data-action="show-solution"]').click();
 await activity.locator('[data-action="continue-supported"]').click();
 await page.waitForFunction(()=>!FG.learning.active);
}

async function chooseProfile(page,index){
 const summary=page.locator('#studioProfileMenu summary');
 if(await summary.count())await summary.click();
 await page.locator('.profile-choice').nth(index).click();
}

async function openFactory(page){
 await page.locator('[data-starter="factory"]').click();
 await page.waitForFunction(()=>FG.runtime.snapshot()?.config.orderSize===3);
}

async function capture(page,device,stage){
 await checkRoomBounds(page,device,stage);
 fs.mkdirSync('test-results/gem-factory',{recursive:true});
 await page.locator('.gem-factory').screenshot({path:`test-results/gem-factory/${device}-${stage}.png`});
}

async function checkRoomBounds(page,device,stage){
 if(device==='desktop')return;
 const bounds=await page.evaluate(()=>{
  const room=document.querySelector('.gf-room').getBoundingClientRect();
  const world=document.querySelector('.gf-world').getBoundingClientRect();
  return {roomLeft:room.left,roomRight:room.right,worldLeft:world.left,worldRight:world.right};
 });
 assert.ok(bounds.roomRight>=bounds.worldRight-1,`${device} ${stage}: scene covers the right edge: ${JSON.stringify(bounds)}`);
 assert.ok(bounds.roomLeft<=bounds.worldLeft+1,`${device} ${stage}: scene covers the left edge: ${JSON.stringify(bounds)}`);
}

async function chooseGem(page,keyboard=false){
 const root=page.locator('.gem-factory');
 for(let drops=0;drops<16&&(await snapshot(page)).stage==='pick';drops++){
  if(await page.evaluate(()=>FG.learning.active))await finishLearning(page);
  const state=await snapshot(page);
  if(state.collected.every(Boolean))break;
  const recover=state.returns.length>0,color=recover?state.returns[0]:state.nextGem;
  const wanted=state.recipe.some((c,i)=>c===color&&!state.collected[i]);
  const route=root.locator(`[data-action="${wanted?'route-order':'route-return'}"]`);
  const drop=root.locator(`[data-action="${recover?'recover-gem':'release-gem'}"]`);
  if(keyboard){await route.focus();await page.keyboard.press(wanted?'ArrowLeft':'ArrowRight');await drop.focus();await page.keyboard.press('Enter');}
  else{await route.click();await drop.click();}
  for(let pause=0;pause<4;pause++){
   try{await page.waitForFunction(()=>FG.learning.active||FG.runtime.snapshot().state.stage!=='pick'||FG.runtime.snapshot().state.sorting.gems.every(g=>g.state!=='moving'),null,{timeout:12000});}
   catch(error){throw Error(`Physical sorting did not settle: ${JSON.stringify(await snapshot(page))}`,{cause:error});}
   if(await page.evaluate(()=>FG.learning.active)){await finishLearning(page);continue;}
   break;
  }
 }
 await root.locator('[data-action="cut"]').waitFor();
 const sorted=await snapshot(page);
 assert.ok(sorted.collected.every(Boolean),'every recipe gem must physically reach the order tray');
 assert.ok(sorted.sorting.contacts>=2,'sorting has real body and tray contacts');
}

async function cutGem(page){
 await page.waitForFunction(()=>{
  const needle=document.querySelector('.gf-cutter-needle');
  const position=parseFloat(needle?.style.left||'0');
  return position>42&&position<58;
 });
 await page.locator('.gem-factory [data-action="cut"]').click();
 await page.waitForFunction(()=>FG.runtime.snapshot().state.stage==='polish');
}

async function polishByTapping(page,keyboard=false){
 for(let taps=0;taps<10&&(await snapshot(page)).stage==='polish';taps++){
  const button=page.locator('.gem-factory [data-action="polish"]');
  if(keyboard){await button.focus();await page.keyboard.press('Enter');}else await button.click();
 }
 assert.equal((await snapshot(page)).stage,'pack','tap and keyboard actions can fully polish without dragging');
}

async function packAndWait(page,last,device){
 await page.locator('.gem-factory [data-action="pack"]').click();
 await checkRoomBounds(page,device,'ship');
 await page.waitForFunction(()=>FG.learning.active||FG.runtime.snapshot().state.stage!=='ship');
 let learned=false;
 // Both mid-play and round-end learning use the real host. Do not bypass it.
 for(let pass=0;pass<3;pass++){
  if(await page.evaluate(()=>FG.learning.active)){learned=true;await finishLearning(page);}
  if(last&&await page.locator('#resultNext').isVisible())break;
  if(!last&&(await snapshot(page)).stage==='pick')break;
  await page.waitForFunction(()=>FG.learning.active||FG.runtime.snapshot().state.stage==='pick'||!!document.querySelector('#resultNext'));
 }
 await page.waitForFunction(last=>last?!!document.querySelector('#resultNext'):FG.runtime.snapshot().state.stage==='pick',last);
 await checkRoomBounds(page,device,last?'done':'pick');
 return learned;
}

(async()=>{
 const server=start();
 let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
  for(const [device,viewport] of [['desktop',{width:1440,height:1000}],['tablet',{width:820,height:1180}],['phone',{width:390,height:844}]]){
   const context=await browser.newContext({viewport,hasTouch:device!=='desktop',reducedMotion:'no-preference'});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>void dialog.accept());
   try{
    await page.goto(`http://127.0.0.1:${server.address().port}/arcade/`);
    await page.waitForFunction(()=>window.FG?.studio&&window.FG?.runtime);
    assert.equal(await page.locator('[data-starter="factory"]').count(),1,'Factory is available from Ready to Play');
    await openFactory(page);
    const root=page.locator('.gem-factory');await root.waitFor();
    await page.waitForFunction(()=>[...document.querySelectorAll('.gem-factory img')].every(img=>img.complete&&img.naturalWidth>0));
    assert.equal((await snapshot(page)).stage,'pick');
    assert.equal((await snapshot(page)).recipe.length,1,'day one introduces one-gem recipes');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'the game fits the viewport');
    await capture(page,device,'pick');
    const wanted=(await snapshot(page)).nextGem;
    await root.locator('[data-action="route-return"]').click();
    await root.locator('[data-action="release-gem"]').click();
    await page.waitForFunction(()=>FG.runtime.snapshot().state.sorting.gems.some(g=>g.y>1.55&&g.y<4&&g.state==='moving'));
    await capture(page,device,'sorting');
    await root.locator('[data-action="pause"]').click();
    const frozenSorter=(await snapshot(page)).sorting;
    await page.waitForTimeout(150);
    assert.deepEqual((await snapshot(page)).sorting,frozenSorter,'manual pause freezes all physical bodies and the ramp');
    await root.locator('[data-action="resume"]').click();
    await page.waitForFunction(()=>FG.runtime.snapshot().state.returns.length===1);
    assert.equal((await snapshot(page)).returns[0],wanted,'a recipe gem routed right is recoverable');
    assert.equal((await snapshot(page)).stage,'pick','a wrong route cannot satisfy the recipe');
    assert.equal((await snapshot(page)).coins,0,'a wrong route cannot award coins');
    await capture(page,device,'recovery');
    await chooseGem(page,device==='desktop');
    assert.equal((await snapshot(page)).sortingRecoveries,1,'the same returned gem can be released and routed correctly');
    assert.equal((await snapshot(page)).sortingBonus,1,'a wrong route has a bounded consequence: less sorting bonus, with the gift still recoverable');
    await checkRoomBounds(page,device,'cut');
    await root.locator('[data-action="pause"]').click();
    const frozenNeedle=await root.locator('.gf-cutter-needle').getAttribute('style');
    await page.waitForTimeout(150);
    assert.equal(await root.locator('.gf-cutter-needle').getAttribute('style'),frozenNeedle,'manual pause freezes the cutter');
    assert.equal(await page.evaluate(()=>FG.runtime.isPlaying()),false);
    await root.locator('[data-action="resume"]').click();
    await cutGem(page);
    assert.ok((await snapshot(page)).rating>=1,'the cut produces a real quality score');
    await root.locator('[data-action="polish"]').click();
    assert.ok((await snapshot(page)).polish>0,'a polish tap changes progress');
    await capture(page,device,'polish');
    const holdButton=root.locator('[data-action="polish"]');
    await holdButton.scrollIntoViewIfNeeded();
    const box=await holdButton.boundingBox(),point={x:box.x+box.width/2,y:box.y+box.height/2};
    if(device==='phone'){
     const cdp=await context.newCDPSession(page);
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
     await page.waitForTimeout(220);
     assert.equal((await snapshot(page)).holding,true,'a real touch can hold Polish');
     await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
     const cancelled=await snapshot(page);assert.equal(cancelled.holding,false,'cancelled touch releases polishing');
     await page.waitForTimeout(150);assert.equal((await snapshot(page)).polish,cancelled.polish,'touch cancel cannot keep polishing invisibly');
    }else{
     await page.mouse.move(point.x,point.y);await page.mouse.down();await page.waitForTimeout(220);
     assert.equal((await snapshot(page)).holding,true);
     assert.equal(await page.evaluate(()=>FG.runtime.pause()),true,'host can pause the game safely during a hold');
     const paused=await snapshot(page);assert.equal(paused.holding,false,'learning pause releases held inputs');
     await page.waitForTimeout(150);assert.equal((await snapshot(page)).polish,paused.polish,'polishing stops while learning owns input');
     await page.mouse.up();await page.evaluate(()=>FG.runtime.resume());
    }
    await polishByTapping(page,device==='desktop');
    await capture(page,device,'pack');
    let learned=await packAndWait(page,false,device);
    assert.equal((await snapshot(page)).completed,1);
    for(let completed=1;completed<3;completed++){
     await chooseGem(page);await checkRoomBounds(page,device,'cut');await cutGem(page);await polishByTapping(page);
     learned=(await packAndWait(page,completed===2,device))||learned;
    }
    assert.equal(learned,true,'normal factory play includes required learning');
    const finished=await snapshot(page);
    assert.equal(finished.stage,'done');assert.equal(finished.completed,3);
    assert.ok(finished.coins>=60&&finished.coins<=99,'only shipped gifts and their bounded sorting bonus award coins');
    assert.equal(await page.evaluate(()=>FG.store.current().learning.attempts.some(a=>a.context.gameId==='factory')),true,'learning is attributed to Factory');
    await page.locator('#resultNext').click();
    assert.equal((await snapshot(page)).level,2);
    assert.equal((await snapshot(page)).completed,0);
    assert.equal((await snapshot(page)).recipe.length,2,'next day introduces a mixed two-gem recipe');
    assert.equal(new Set((await snapshot(page)).recipe).size,2,'later play requires more than a changed color label');
    await capture(page,device,'day-two');
    await chooseGem(page,device==='desktop');
    assert.equal((await snapshot(page)).collected.filter(Boolean).length,2,'both colors must arrive before processing');
    assert.ok((await snapshot(page)).sortingReturns>=1,'the mixed supply requires switching to the return tray between recipe gems');
    await page.locator('#studioNavHome').click();
    assert.equal(await page.locator('.gem-factory').count(),0,'leaving disposes the game scene');
    await chooseProfile(page,1);await openFactory(page);
    assert.equal((await snapshot(page)).coins,0,'another child has a separate factory');
    assert.equal((await snapshot(page)).level,1);
    await page.locator('#studioNavHome').click();await chooseProfile(page,0);await openFactory(page);
    assert.equal((await snapshot(page)).coins,finished.coins,'returning restores the original child’s earned coins');
    assert.equal((await snapshot(page)).level,2,'returning restores the original child’s unlocked day');
    assert.deepEqual(errors,[],device+' has no browser errors');
    console.log(`PASS Gem Factory ${device}: physical routing/recovery, mixed recipes, timing, polish, pause/cancel, shipping, required learning and profile separation`);
   }finally{await context.close();}
  }
  const reduced=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
  try{
   const page=await reduced.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/arcade/`);
   await page.waitForFunction(()=>window.FG?.studio&&window.FG?.runtime);await openFactory(page);
   await chooseGem(page);await cutGem(page);await polishByTapping(page);
   await capture(page,'phone-reduced','pack');
   assert.equal((await snapshot(page)).stage,'pack','reduced motion preserves physical play and the complete interaction');
   console.log('PASS Gem Factory reduced motion: physical sorting, cut and polish remain playable');
  }finally{await reduced.close();}
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});

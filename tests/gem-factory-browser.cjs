const {exploreWelcome,navigate}=require('./studio-entry.cjs');
/* Play the actual Jem Factory through the production Studio and learning host. */
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
 await exploreWelcome(page);
}

async function openFactory(page){
 await page.locator('[data-starter="factory"]').click();
 await page.waitForFunction(()=>FG.runtime.snapshot()?.config.orderSize===2);
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

async function activate(page,button,device,keyboard=false){
 const bounds=await button.boundingBox();
 assert.ok(bounds&&bounds.width>=44&&bounds.height>=44,'the visible factory object is a child-sized input target');
 if(keyboard){await button.focus();await page.keyboard.press('Enter');}
 else if(device==='desktop')await button.click();
 else await button.tap();
}

async function waitForSorting(page){
 for(let pause=0;pause<4;pause++){
  try{await page.waitForFunction(()=>FG.learning.active||FG.runtime.snapshot().state.stage!=='pick'||!FG.runtime.snapshot().state.sortingBusy,null,{timeout:12000});}
  catch(error){throw Error(`Physical sorting did not settle: ${JSON.stringify(await snapshot(page))}`,{cause:error});}
  if(await page.evaluate(()=>FG.learning.active)){await finishLearning(page);continue;}
  return;
 }
 throw Error('Physical sorting did not resume after the learning handoff');
}

async function checkPattern(page){
 const state=await snapshot(page),pattern=state.pattern;
 assert.ok(pattern.cycle.length>=2&&pattern.sequence.length>=6&&pattern.sequence.length<=7,'the enlarged clue shows at least two repeating cycles');
 assert.ok(new Set(pattern.cycle).size>=2,'the task needs a pattern, not repeated one-color matching');
 assert.deepEqual(pattern.sequence,Array.from({length:pattern.sequence.length},(_,i)=>pattern.cycle[i%pattern.cycle.length]));
 assert.equal(pattern.next,pattern.cycle[pattern.sequence.length%pattern.cycle.length],'the answer is the next position, not any color in the sequence');
 assert.deepEqual(state.recipe,[pattern.next]);
 assert.equal(await page.locator('.gf-order .gf-pattern-missing').count(),1,'the order card shows one missing pattern position');
 assert.match(await page.locator('.gf-order .gf-pattern-missing').textContent(),/\?/,'the answer remains a question before sorting');
 assert.equal(await page.locator('.gf-order .gf-pattern-gem:not(.gf-pattern-missing)').count(),pattern.sequence.length,'the visible clue contains every pattern example');
 assert.deepEqual(await page.locator('.gf-order .gf-pattern-gem').evaluateAll(gems=>gems.map(gem=>gem.dataset.color)),pattern.sequence,'the actual pictured clue matches the rule being checked');
}

async function checkSortingLayout(page){
 const layout=await page.evaluate(()=>{
  const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
  return {
   room:rect('.gf-room'),world:rect('.gf-world'),order:rect('.gf-order'),candidate:rect('.gf-candidate'),ramp:rect('.gf-sorting-ramp'),controls:rect('.gf-sort-controls'),day:rect('.gf-day'),
   pieces:[...document.querySelectorAll('.gf-pattern-gem,.gf-pattern-missing')].map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width};}),
   buttons:[...document.querySelectorAll('.gf-sort-controls button')].map(el=>({label:el.textContent,hidden:!!el.closest('[aria-hidden="true"]'),font:parseFloat(getComputedStyle(el).fontSize),height:el.getBoundingClientRect().height,overflow:el.scrollWidth>el.clientWidth+1})),
   titleSize:parseFloat(getComputedStyle(document.querySelector('.gf-order h3')).fontSize),
   detachedButtons:document.querySelectorAll('.gf-sorting-board button').length
  };
 });
 assert.equal(layout.buttons.length,2,'Keep and Return live on the machine control mount');
 assert.ok(layout.buttons.some(b=>/Keep/.test(b.label))&&layout.buttons.some(b=>/Return/.test(b.label)),'both actions say what happens to the candidate');
 assert.equal(layout.detachedButtons,0,'the sorter has no detached control-card buttons');
 assert.ok(layout.buttons.every(b=>!b.hidden&&b.font>=18&&b.height>=48),'machine controls stay accessible and readable at child sizes');
 assert.ok(layout.buttons.every(b=>!b.overflow),'machine button labels fit their controls');
 assert.ok(layout.titleSize>=22,'the pattern question is visually prominent');
 assert.ok(layout.ramp.bottom<layout.room.top+layout.room.height*.33,'the ramp sits above the illustrated hopper mouth');
 assert.ok(layout.controls.top>layout.ramp.bottom,'the machine-mounted controls sit below the physical sorter');
 for(const piece of layout.pieces){
  assert.ok(piece.left>=layout.order.left-1&&piece.right<=layout.order.right+1&&piece.top>=layout.order.top-1&&piece.bottom<=layout.order.bottom+1,'the entire longer clue fits its panel');
  assert.ok(piece.left>=layout.world.left-1&&piece.right<=layout.world.right+1,'the longer clue never needs horizontal scrolling');
 }
 const a=layout.order,b=layout.candidate;
 assert.ok(a.bottom<=b.top||a.top>=b.bottom||a.right<=b.left||a.left>=b.right,'the pattern never covers the current candidate');
 const hud=layout.day;
 assert.ok(hud.bottom<=b.top||hud.top>=b.bottom||hud.right<=b.left||hud.left>=b.right,'the level badge never covers the current candidate');
}

async function chooseGem(page,device='desktop',keyboard=false){
 const root=page.locator('.gem-factory');
 for(let drops=0;drops<16&&(await snapshot(page)).stage==='pick';drops++){
  if(await page.evaluate(()=>FG.learning.active))await finishLearning(page);
  const state=await snapshot(page);
  if(state.collected.every(Boolean))break;
  if(state.sortingBusy){await waitForSorting(page);continue;}
  const wanted=state.nextGem===state.pattern.next;
  const bucket=root.locator(`.gf-sort-basket[data-action="${wanted?'route-order':'route-return'}"]`);
  await activate(page,bucket,device,keyboard);
  await waitForSorting(page);
 }
 await root.locator('.gf-cut-action[data-action="cut"]').waitFor();
 const sorted=await snapshot(page);
 assert.ok(sorted.collected.every(Boolean),'the exact next gem must physically reach the order tray');
 assert.ok(sorted.sorting.contacts>=2,'sorting has real body and tray contacts');
}

async function cutGem(page,device='desktop'){
 for(let checkpoint=0;checkpoint<4;checkpoint++){
  await page.waitForFunction(()=>{
   const needle=document.querySelector('.gf-cutter-needle');
   const position=parseFloat(needle?.style.left||'0');
   return FG.learning.active||(position>42&&position<58);
  });
  if(await page.evaluate(()=>FG.learning.active)){await finishLearning(page);continue;}
  await activate(page,page.locator('.gem-factory .gf-cut-action[data-action="cut"]'),device);
  await page.waitForFunction(()=>FG.runtime.snapshot().state.stage==='polish');return;
 }
 throw Error('The cutter did not resume after learning');
}

// Activate the visible cutter on the same frame as the observed needle position.
// Ordinary mouse, touch and keyboard activation remain covered in the full journey.
async function cutInWindow(page,min,max){
 for(let checkpoint=0;checkpoint<4;checkpoint++){
  const result=await page.waitForFunction(({min,max})=>{
   if(FG.learning.active)return 'learning';
   const state=FG.runtime.snapshot().state;
   if(state.stage!=='cut'||state.cutterPosition<min||state.cutterPosition>max)return false;
   document.querySelector('.gf-cut-action').click();
   return 'cut';
  },{min,max});
  if(await result.jsonValue()==='cut')return;
  await finishLearning(page);
 }
 throw Error('The timed cutter did not resume after learning');
}

async function missCut(page,device,checkPause=false){
 const before=await snapshot(page);
 await cutInWindow(page,0,.08);
 const missed=await snapshot(page);
 assert.equal(missed.stage,'recycle','missing the green zone sends this jem back');
 assert.equal(missed.cutMisses,before.cutMisses+1,'one missed tap counts once');
 assert.equal(missed.rating,0,'a miss has no cut-quality reward');
 assert.equal(missed.coins,before.coins,'a miss awards no coins');
 assert.equal(missed.completed,before.completed,'a miss cannot pack or erase a gift');
 assert.deepEqual(missed.wrappedPapers,before.wrappedPapers,'already wrapped gifts keep their designs');
 if(checkPause){
  await page.locator('.gem-factory [data-action="pause"]').click();
  await page.waitForTimeout(1000);
  assert.equal((await snapshot(page)).stage,'recycle','pause freezes the recovery rather than completing it behind an overlay');
  await capture(page,device,'miss-paused');
  await page.locator('.gem-factory [data-action="resume"]').click();
 }
 await page.waitForFunction(()=>FG.learning.active||FG.runtime.snapshot().state.stage==='pick');
 if(await page.evaluate(()=>FG.learning.active))await finishLearning(page);
 await page.waitForFunction(()=>FG.runtime.snapshot().state.stage==='pick');
 const recovered=await snapshot(page);
 assert.deepEqual(recovered.pattern,before.pattern,'the retry keeps the same puzzle');
 assert.equal(recovered.patternLevel,before.patternLevel,'a missed cut does not raise pattern difficulty');
 assert.equal(recovered.patternIndex,before.patternIndex,'retrying does not consume a pattern');
 assert.equal(recovered.patternsCompleted,before.patternsCompleted,'repeated failed attempts cannot farm progression');
 assert.equal(recovered.coins,before.coins,'completed-gift coins survive the recovery');
 assert.equal(recovered.completed,before.completed,'only the current unshipped jem is lost');
 assert.deepEqual(recovered.wrappedPapers,before.wrappedPapers);
 assert.ok(recovered.collected.every(value=>!value),'the fresh jem must be sorted again before cutting');
 assert.equal(await page.locator('.gf-polish-action,.gf-gift-action').count(),0,'a missed cut cannot skip straight to polish or wrapping');
 await checkPattern(page);await checkSortingLayout(page);await capture(page,device,'new-jem');
}

async function polishByTapping(page,device='desktop',keyboard=false){
 for(let taps=0;taps<10&&(await snapshot(page)).stage==='polish';taps++){
  if(await page.evaluate(()=>FG.learning.active))await finishLearning(page);
  const button=page.locator('.gem-factory .gf-polish-action[data-action="polish"]');
  await activate(page,button,device,keyboard);
 }
 assert.equal((await snapshot(page)).stage,'pack','tap and keyboard actions can fully polish without dragging');
}

async function choosePaper(page,paper,device){
 const root=page.locator('.gem-factory'),gift=root.locator('.gf-gift-action[data-action="pack"]');
 const appearance=()=>gift.locator('svg').first().evaluate(svg=>({
  fills:[...svg.querySelectorAll('rect')].map(rect=>rect.getAttribute('fill')).filter(fill=>fill&&!fill.startsWith('url(')),
  motif:svg.querySelector('pattern')?.innerHTML
 }));
 const previous=(await snapshot(page)).paper,previousArt=await appearance();
 const roll=root.locator(`.gf-paper-roll[data-action="paper"][data-paper="${paper}"]`);
 await activate(page,roll,device);
 assert.equal((await snapshot(page)).paper,paper,'the wrapping choice changes the current paper');
 assert.equal(await roll.getAttribute('aria-pressed'),'true','the chosen paper is exposed accessibly');
 assert.equal(await gift.getAttribute('data-paper'),paper,'the gift preview uses the chosen paper');
 if(previous!==paper)assert.notDeepEqual(await appearance(),previousArt,'the actual gift colors and pattern change, not just an identifier or selected swatch');
}

async function packAndWait(page,last,device,paper){
 await choosePaper(page,paper,device);
 await activate(page,page.locator('.gem-factory .gf-gift-action[data-action="pack"]'),device);
 const shipped=await snapshot(page);
 assert.equal(shipped.wrappedPapers.at(-1),paper,'the shipped gift retains its selected paper');
 assert.equal(await page.locator('.gf-packed-present').getAttribute('data-paper'),paper,'shipping displays the chosen paper');
 assert.equal(await page.locator('.gf-progress i.gf-gift-filled').last().getAttribute('data-paper'),paper,'the finished-gift collection retains each design');
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

async function checkCustomCadence(browser,url){
 const context=await browser.newContext({viewport:{width:1280,height:1000},reducedMotion:'reduce'});
 try{
  const page=await context.newPage();await page.goto(url);
  await page.waitForFunction(()=>window.FG?.games?.factory&&window.FG?.runtime);await exploreWelcome(page);
  // This native lifecycle fixture isolates the supported five-gift remix and
  // persistence contract. The full Studio/learning journey is exercised above.
  await page.evaluate(()=>{
   const mount=document.createElement('div');mount.id='factoryContractMount';document.body.prepend(mount);
   window.factoryOutcomes=[];
   window.mountFactoryContract=()=>{window.factoryContract=new FG.games.factory.build(mount,{difficulty:'classic',config:{orderSize:5,cutterSpeed:1,sparkleBoost:false},stateKey:'factory-overhaul-contract',finish:result=>window.factoryOutcomes.push(result)});};
   window.mountFactoryContract();
  });
  for(let count=0;count<5;count++){
   const before=await snapshot(page);
   assert.equal(before.patternsCompleted,count);
   assert.equal(before.patternLevel,1+Math.floor(count/2),'long orders increase difficulty every two patterns, not only at day end');
   await chooseGem(page);await cutGem(page);await polishByTapping(page,'desktop',true);
   await choosePaper(page,['hearts','stripes','stars'][count%3],'desktop');
   await activate(page,page.locator('.gf-gift-action'),'desktop');
   await page.waitForFunction(()=>FG.runtime.snapshot().state.stage!=='ship');
  }
  const dayOne=await snapshot(page);
  assert.equal(dayOne.stage,'done');assert.equal(dayOne.completed,5);assert.equal(dayOne.patternsCompleted,5);
  assert.equal(await page.evaluate(()=>window.factoryOutcomes.length),1,'one completed order produces one result');
  await page.evaluate(()=>window.factoryContract.next());
  assert.equal((await snapshot(page)).patternLevel,3,'an odd-sized order carries its half-finished tier into the next day');
  assert.equal((await snapshot(page)).patternIndex,5);
  await chooseGem(page);await cutGem(page);await polishByTapping(page,'desktop',true);
  await activate(page,page.locator('.gf-gift-action'),'desktop');
  await page.waitForFunction(()=>FG.runtime.snapshot().state.stage==='pick');
  assert.equal((await snapshot(page)).patternLevel,4,'the sixth completed pattern opens tier four');
  assert.equal((await snapshot(page)).patternsCompleted,6);
  await page.evaluate(()=>window.factoryContract.restart());
  assert.equal((await snapshot(page)).patternsCompleted,5,'an explicit round restart rolls back only that round’s progression');
  assert.equal((await snapshot(page)).coins,dayOne.coins,'round restart retains earlier completed-day coins');
  assert.equal((await snapshot(page)).patternIndex,5);
  assert.equal((await snapshot(page)).completed,0);
  await page.evaluate(()=>window.factoryContract.next());
  assert.equal((await snapshot(page)).level,2,'calling Next during an unfinished round cannot skip progression');
  await page.evaluate(()=>{window.factoryContract.unmount();window.mountFactoryContract();});
  assert.equal((await snapshot(page)).patternsCompleted,5,'remount restores odd pattern progress exactly');
  assert.equal((await snapshot(page)).patternLevel,3);
  assert.equal((await snapshot(page)).coins,dayOne.coins);
  for(const progress of [null,2.5,-1]){
   await page.evaluate(progress=>{
    window.factoryContract.unmount();
    const saved={schema:'gem-factory-v1',level:4,coins:123};if(progress!==null)saved.patternsCompleted=progress;
    FG.store.current().constructionStates['factory-overhaul-contract']=saved;
    window.mountFactoryContract();
   },progress);
   const restored=await snapshot(page);
   assert.equal(restored.level,4);assert.equal(restored.coins,123);
   assert.equal(restored.patternsCompleted,6,'old saves and invalid additive counters preserve the old unlocked difficulty');
   assert.equal(restored.patternLevel,4);
  }
  await page.evaluate(()=>window.factoryContract.unmount());
  console.log('PASS Jem Factory native lifecycle: five-gift cadence, odd carry, restart, saved progress and v1 compatibility');
 }finally{await context.close();}
}

(async()=>{
 const server=start();
 let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
  for(const [device,viewport] of [['desktop',{width:1440,height:1000}],['tablet',{width:820,height:1180}],['phone',{width:390,height:844}],['narrow-phone',{width:320,height:820}]]){
   const context=await browser.newContext({viewport,hasTouch:device!=='desktop',reducedMotion:'no-preference'});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>void dialog.accept());
   try{
    await page.goto(`http://127.0.0.1:${server.address().port}/arcade/`);
    await page.waitForFunction(()=>window.FG?.studio&&window.FG?.runtime);await exploreWelcome(page);
    assert.equal(await page.locator('[data-starter="factory"]').count(),1,'Factory is available from Ready to Play');
    await openFactory(page);
    const root=page.locator('.gem-factory');await root.waitFor();
    await page.waitForFunction(()=>[...document.querySelectorAll('.gem-factory img')].every(img=>img.complete&&img.naturalWidth>0));
    assert.equal((await snapshot(page)).stage,'pick');
    assert.equal((await snapshot(page)).pattern.cycle.length,2,'day one introduces an alternating pattern');
    assert.equal((await snapshot(page)).patternLevel,1);
    assert.equal((await snapshot(page)).patternsCompleted,0);
    await checkPattern(page);
    await checkSortingLayout(page);
    assert.equal(await root.locator('.gf-console,.gf-steps,.gf-station-signs,.gf-sort-instructions,[data-action="release-gem"],[data-action="recover-gem"]').count(),0,'the factory line replaces the old text/control console');
    assert.equal(await root.locator('.gf-line').evaluate(line=>!!line.closest('[aria-hidden="true"]')),false,'the interactive line is accessible rather than hidden as decoration');
    assert.equal(await root.locator('.gf-sort-controls .gf-sort-basket[data-action]').count(),2,'the two machine buttons control sorting');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'the game fits the viewport');
    await capture(page,device,'pick');
    if(device==='desktop'){
     await page.setViewportSize({width:640,height:1000});
     await checkSortingLayout(page);await capture(page,'medium','pick');
     await page.setViewportSize(viewport);
    }
    const initial=await snapshot(page),candidate=initial.nextGem;
    const wrongRoute=candidate===initial.pattern.next?'route-return':'route-order';
    await activate(page,root.locator(`.gf-sort-basket[data-action="${wrongRoute}"]`),device);
    assert.equal((await snapshot(page)).sortingBusy,true,'a bucket tap releases the gem in one action');
    assert.equal(await root.locator('.gf-sort-basket[data-action="route-order"]').isDisabled(),true,'a moving gem locks the order bucket');
    assert.equal(await root.locator('.gf-sort-basket[data-action="route-return"]').isDisabled(),true,'a moving gem locks the return bucket');
    const aimed=(await snapshot(page)).sorting.target;
    await page.keyboard.press(aimed===-1?'ArrowRight':'ArrowLeft');
    assert.equal((await snapshot(page)).sorting.target,aimed,'another input cannot redirect an already released gem');
    await page.waitForFunction(()=>FG.runtime.snapshot().state.sorting.gems.some(g=>g.y>1.55&&g.y<4&&g.state==='moving'));
    await capture(page,device,'sorting');
    await root.locator('[data-action="pause"]').click();
    const frozenSorter=(await snapshot(page)).sorting;
    await page.waitForTimeout(150);
    assert.deepEqual((await snapshot(page)).sorting,frozenSorter,'manual pause freezes all physical bodies and the ramp');
    await root.locator('[data-action="resume"]').click();
    await waitForSorting(page);
    assert.equal((await snapshot(page)).nextGem,candidate,'a wrong choice automatically returns the same candidate for another try');
    assert.equal((await snapshot(page)).sortingMistakes,1,'the wrong route has an actual gameplay consequence');
    assert.equal((await snapshot(page)).stage,'pick','a wrong route cannot fill the missing pattern position');
    assert.deepEqual((await snapshot(page)).pattern,initial.pattern,'a wrong choice does not replace or solve the pattern');
    assert.equal((await snapshot(page)).coins,0,'a wrong route cannot award coins');
    await capture(page,device,'recovery');
    await chooseGem(page,device,device==='desktop');
    assert.equal((await snapshot(page)).sortingRecoveries,1,'the same gem can be routed correctly with a normal bucket tap');
    assert.equal((await snapshot(page)).sortingBonus,4,'a wrong route reduces the six-coin sorting bonus, with the gift still recoverable');
    await checkRoomBounds(page,device,'cut');
    await root.locator('[data-action="pause"]').click();
    const frozenNeedle=await root.locator('.gf-cutter-needle').getAttribute('style');
    await page.waitForTimeout(150);
    assert.equal(await root.locator('.gf-cutter-needle').getAttribute('style'),frozenNeedle,'manual pause freezes the cutter');
    assert.equal(await page.evaluate(()=>FG.runtime.isPlaying()),false);
    await root.locator('[data-action="resume"]').click();
    await missCut(page,device,device==='desktop');
    await chooseGem(page,device,device==='desktop');
    await cutInWindow(page,.28,.32);
    assert.equal((await snapshot(page)).stage,'polish','the broad green zone succeeds without requiring a perfect cut');
    assert.equal((await snapshot(page)).rating,2,'an off-center green hit produces the good-cut score');
    await root.locator('[data-action="polish"]').click();
    assert.ok((await snapshot(page)).polish>0,'a polish tap changes progress');
    await capture(page,device,'polish');
    const holdButton=root.locator('[data-action="polish"]');
    await holdButton.scrollIntoViewIfNeeded();
    const box=await holdButton.boundingBox(),point={x:box.x+box.width/2,y:box.y+box.height/2};
    if(device==='phone'||device==='narrow-phone'){
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
    await polishByTapping(page,device,device==='desktop');
    await capture(page,device,'pack');
    // Check all three expressive designs even though the normal round now has two gifts.
    await choosePaper(page,'stripes',device);await choosePaper(page,'hearts',device);
    const papers=['stars','stripes'];
    let learned=await packAndWait(page,false,device,papers[0]);
    assert.equal((await snapshot(page)).completed,1);
    assert.equal((await snapshot(page)).patternLevel,1,'one completed pattern does not increase difficulty');
    assert.equal((await snapshot(page)).patternsCompleted,1);
    await checkPattern(page);await checkSortingLayout(page);await capture(page,device,'long-pattern');
    await chooseGem(page,device);await missCut(page,device);
    await chooseGem(page,device);await checkRoomBounds(page,device,'cut');await cutGem(page,device);await polishByTapping(page,device);
    learned=(await packAndWait(page,true,device,papers[1]))||learned;
    assert.equal(learned,true,'normal factory play includes required learning');
    const finished=await snapshot(page);
    assert.equal(finished.stage,'done');assert.equal(finished.completed,2);
    assert.equal(finished.patternsCompleted,2,'exactly two completed patterns unlock the next tier');
    assert.deepEqual(finished.wrappedPapers,papers,'each finished gift preserves its own expressive wrapping choice');
    assert.ok(finished.coins>=50&&finished.coins<=72,'only shipped gifts and their bounded sorting bonus award coins');
    assert.equal(await page.evaluate(()=>FG.store.current().learning.attempts.some(a=>a.context.gameId==='factory')),true,'learning is attributed to Factory');
    await page.locator('#resultNext').click();
    assert.equal((await snapshot(page)).level,2);
    assert.equal((await snapshot(page)).completed,0);
    assert.equal((await snapshot(page)).patternLevel,2,'the next puzzle becomes harder after two successful patterns');
    assert.equal((await snapshot(page)).patternsCompleted,2);
    assert.equal((await snapshot(page)).pattern.cycle.length,3,'the next day introduces a longer pattern unit');
    assert.equal((await snapshot(page)).pattern.cycle[0],(await snapshot(page)).pattern.cycle[1],'day two introduces the repeated pair in an AAB pattern');
    assert.notEqual((await snapshot(page)).pattern.cycle[1],(await snapshot(page)).pattern.cycle[2]);
    await checkPattern(page);
    await capture(page,device,'day-two');
    await chooseGem(page,device,device==='desktop');
    assert.equal((await snapshot(page)).collected.filter(Boolean).length,1,'only the exact next gem fills the pattern gap');
    assert.ok((await snapshot(page)).sortingReturns>=1,'the supply includes a distractor that belongs in the return bucket');
    await navigate(page,'studioNavHome');
    assert.equal(await page.locator('.gem-factory').count(),0,'leaving disposes the game scene');
    await chooseProfile(page,1);await openFactory(page);
    assert.equal((await snapshot(page)).coins,0,'another child has a separate factory');
    assert.equal((await snapshot(page)).level,1);
    await navigate(page,'studioNavHome');await chooseProfile(page,0);await openFactory(page);
    assert.equal((await snapshot(page)).coins,finished.coins,'returning restores the original child’s earned coins');
    assert.equal((await snapshot(page)).level,2,'returning restores the original child’s unlocked day');
    assert.deepEqual(errors,[],device+' has no browser errors');
    assert.equal((await snapshot(page)).patternsCompleted,2,'returning restores the exact pattern cadence');
    console.log(`PASS Jem Factory ${device}: longer readable patterns, machine controls, miss recovery, two-pattern progression, wrapping, pause/cancel, learning and profile separation`);
   }catch(error){
    fs.mkdirSync('test-results/gem-factory',{recursive:true});
    await page.locator('.gem-factory').screenshot({path:`test-results/gem-factory/${device}-failure.png`,timeout:10000}).catch(()=>{});
    const diagnostic=await page.evaluate(()=>{
     const state=window.FG?.runtime?.snapshot()?.state;
     const bounds={};for(const name of ['world','room','order','candidate','sorting-ramp','sort-controls']){
      const el=document.querySelector('.gf-'+name);if(!el)continue;const r=el.getBoundingClientRect();bounds[name]={x:r.x,y:r.y,w:r.width,h:r.height};
     }
     return {stage:state?.stage,patternLevel:state?.patternLevel,patternsCompleted:state?.patternsCompleted,completed:state?.completed,cutMisses:state?.cutMisses,hostPaused:state?.hostPaused,userPaused:state?.userPaused,learning:!!window.FG?.learning?.active,bounds};
    }).catch(()=>({unavailable:true}));
    console.error(`${device} failure: ${JSON.stringify(diagnostic)}`);throw error;
   }finally{await context.close();}
  }
  const reduced=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
  try{
   const page=await reduced.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/arcade/`);
   await page.waitForFunction(()=>window.FG?.studio&&window.FG?.runtime);await exploreWelcome(page);await openFactory(page);
   await checkPattern(page);await checkSortingLayout(page);await chooseGem(page,'phone');await missCut(page,'phone-reduced');await chooseGem(page,'phone');await cutGem(page,'phone');await polishByTapping(page,'phone');await choosePaper(page,'stars','phone');
   await capture(page,'phone-reduced','pack');
   assert.equal((await snapshot(page)).stage,'pack','reduced motion preserves physical play and the complete interaction');
   console.log('PASS Gem Factory reduced motion: pattern sorting, on-line stations and wrapping choices remain playable');
  }finally{await reduced.close();}
  await checkCustomCadence(browser,`http://127.0.0.1:${server.address().port}/arcade/`);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});

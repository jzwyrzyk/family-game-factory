/* Real Studio integration, illustrated-art coverage and reviewed regressions.
 * API responses are fixtures. The game code, assets, input and rendering are real. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const {start}=require('./browser-server.cjs');
const {createJourney}=require('./mind-your-jems-fixture.cjs');
const {createReview}=require('./mind-your-jems-review.cjs');

const devices=[
 {name:'desktop',viewport:{width:1280,height:900},touch:false,mobile:false,motion:'reduce'},
 {name:'tablet-portrait',viewport:{width:768,height:1024},touch:true,mobile:false,motion:'reduce'},
 {name:'tablet-landscape',viewport:{width:1024,height:768},touch:true,mobile:false,motion:'reduce'},
 {name:'mobile',viewport:{width:390,height:844},touch:true,mobile:true,motion:'reduce'},
 {name:'mobile-small',viewport:{width:360,height:640},touch:true,mobile:true,motion:'reduce'},
 {name:'mobile-landscape',viewport:{width:844,height:390},touch:true,mobile:true,motion:'reduce'},
 {name:'mobile-landscape-small',viewport:{width:667,height:375},touch:true,mobile:true,motion:'reduce'},
 {name:'desktop-motion',viewport:{width:1280,height:900},touch:false,mobile:false,motion:'no-preference'},
 {name:'mobile-motion',viewport:{width:390,height:844},touch:true,mobile:true,motion:'no-preference'},
 {name:'remote-handoff',viewport:{width:1280,height:900},touch:false,mobile:false,motion:'reduce',existingRemote:true},
 {name:'recovery-desktop',viewport:{width:1280,height:900},touch:false,mobile:false,motion:'reduce',recoveryTerminal:'failed',artFailure:true},
 {name:'recovery-mobile',viewport:{width:667,height:375},portraitViewport:{width:360,height:640},touch:true,mobile:true,motion:'reduce',recoveryTerminal:'cancelled'},
 {name:'profile-reset',viewport:{width:390,height:844},touch:true,mobile:true,motion:'reduce',profileReset:true}
];

async function geometry(journey,device,review){
 const details=await journey.arcade.evaluate(dialog=>{
  const rect=element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  const visible=element=>element.getClientRects().length&&getComputedStyle(element).visibility==='visible'&&!element.closest('[inert]');
  const stage=dialog.querySelector('.myj-stage'),targets=[...dialog.querySelectorAll('button')].filter(visible),rock=rect(dialog.querySelector('.myj-rock'));
  const overlays=[...dialog.querySelectorAll('.myj-ready,.myj-build-problem,.myj-notice-visible')].filter(visible).map(element=>({name:element.className,...rect(element)}));
  return {phase:dialog.dataset.phase,ready:!dialog.querySelector('[data-myj="ready"]').hidden,
   viewport:{width:innerWidth,height:innerHeight},dialog:rect(dialog),stage:rect(stage),
   player:rect(dialog.querySelector('.myj-miner-anchor')),overlays,
   eyes:{x:rock.x+rock.width*.25,y:rock.y+rock.height*.42,right:rock.x+rock.width*.8,bottom:rock.y+rock.height*.65},
   gems:[...dialog.querySelectorAll('[data-crystal]')].filter(visible).map(gem=>({id:gem.dataset.crystal,...rect(gem)})),
   overflow:{horizontal:dialog.scrollWidth-dialog.clientWidth,vertical:dialog.scrollHeight-dialog.clientHeight},
   targets:targets.map(element=>{const box=rect(element),hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);return {
    label:element.getAttribute('aria-label')||element.textContent.trim(),...box,enabled:!element.disabled,
    primary:['left','right','grab'].includes(element.dataset.myj),reachable:hit===element||element.contains(hit)};})};
 });
 review.check(device.name,'layout-and-hit-targets',details);
 assert.ok(details.dialog.x>=-1&&details.dialog.y>=-1&&details.dialog.right<=details.viewport.width+1&&details.dialog.bottom<=details.viewport.height+1,device.name+' game fits viewport');
 assert.ok(details.overflow.horizontal<=2,device.name+' has no horizontal clipping');
 assert.ok(details.overflow.vertical<=2,device.name+' main game fits without scrolling');
 assert.ok(details.stage.height>=Math.min(300,device.viewport.height*.46),device.name+' gives the illustrated play area useful space');
 for(const target of details.targets){
  const minimum=target.primary?47.5:43.5;
  assert.ok(target.width>=minimum&&target.height>=minimum,device.name+' usable target: '+target.label);
  if(target.enabled){
   assert.ok(target.reachable,device.name+' available control is not covered: '+target.label);
   const visibleWidth=Math.min(target.right,details.viewport.width)-Math.max(target.x,0),visibleHeight=Math.min(target.bottom,details.viewport.height)-Math.max(target.y,0);
   assert.ok(visibleWidth>=minimum&&visibleHeight>=minimum,device.name+' control remains visibly reachable: '+target.label);
  }
 }
 for(const gem of details.gems)assert.ok(gem.x>=details.stage.x-1&&gem.y>=details.stage.y-1&&gem.right<=details.stage.right+1&&gem.bottom<=details.stage.bottom+1,device.name+' spawned jem stays in visible scene: '+gem.id);
 for(const overlay of details.overlays){
  const intersects=box=>Math.min(overlay.right,box.right)-Math.max(overlay.x,box.x)>1&&Math.min(overlay.bottom,box.bottom)-Math.max(overlay.y,box.y)>1;
  for(const gem of details.gems)assert.ok(!intersects(gem),device.name+' build/status notice leaves jem art visible: '+gem.id);
  assert.ok(!intersects(details.eyes),device.name+' build/status notice leaves the giant’s eyes visible');
  if(!['falling','retry'].includes(details.phase))assert.ok(!intersects(details.player),device.name+' build/status notice leaves the miner visible');
 }
 if(!['falling','retry'].includes(details.phase)){
  const p=details.player,s=details.stage;
  assert.ok(p.x>=s.x-1&&p.y>=s.y-1&&p.right<=s.right+1&&p.bottom<=s.bottom+1,device.name+' moving miner remains visible on the playable route');
 }
}

async function assertScrollRestored(journey){
 assert.equal(await journey.page.evaluate(()=>document.body.style.overflow),journey.bodyOverflow,'closing restores the previous document scroll style');
}

async function helpPause(journey,device,review){
 const {arcade}=journey;
 // Freeze a real warning. The new loop preserves the exact remaining time;
 // opening Help cannot erase the danger and grant another calm interval.
 await journey.walkTo(96);await journey.freshCalm();await journey.collect();await journey.phase('warning');
 await journey.activate(arcade.locator('.myj-help-toggle'));
 assert.equal(await arcade.locator('.myj-stage').evaluate(stage=>stage.inert),true,'help makes scene controls inert');
 assert.equal(await arcade.locator('.myj-help-toggle').getAttribute('aria-expanded'),'true');
 const saved=await journey.snapshot();await journey.advance(15000);
 assert.deepEqual(await journey.snapshot(),saved,'help freezes movement, spawn, hazard and both scores');
 await geometry(journey,device,review);await review.capture(journey.page,arcade,device.name,'help');
 await journey.activate(arcade.locator('[data-myj="help-done"]'));
 assert.equal(await arcade.locator('.myj-stage').evaluate(stage=>stage.inert),false);
 assert.equal(await arcade.locator('.myj-help-toggle').getAttribute('aria-expanded'),'false');
 await journey.input('grab',true);await journey.phase('shaking');await journey.phase('mining');await journey.input('grab',false);
 assert.equal(await journey.score('banked'),saved.banked,'help does not manufacture another deposit');
 review.check(device.name,'help-pause',{preserved:saved});
}

async function heldShake(journey,device,review,capture){
 await journey.walkTo(96);await journey.freshCalm();
 assert.ok(await journey.collect()>0,'held-shake test has real carried cargo');
 await journey.phase('warning');
 const before=await journey.snapshot();
 assert.equal(await journey.arcade.locator('.myj-rock').getAttribute('data-expression'),'warning');
 await geometry(journey,device,review);await capture('warning');
 await journey.input('grab',true);await journey.advance(32);
 assert.equal((await journey.snapshot()).holding,true,'hold requires a sustained physical input');
 assert.equal(await journey.arcade.locator('.myj-miner').getAttribute('data-pose'),'holding');await capture('holding');
 await journey.phase('shaking');
 const shaken=await journey.snapshot();
 assert.equal(shaken.banked,before.banked,'banked jems survive shaking');
 assert.equal(shaken.loose,0,'holding saves the miner but spills unbanked cargo');
 assert.equal(shaken.gems.length,0,'a shake removes every active jem from the head');
 assert.equal(await journey.arcade.locator('.myj-miner').getAttribute('data-pose'),'holding');await capture('shaking');
 await journey.phase('mining');await journey.input('grab',false);await journey.advance(32);
 assert.equal((await journey.snapshot()).holding,false,'releasing hold releases the miner');
 review.check(device.name,'held-shake',{before,after:await journey.snapshot(),input:device.touch?'native touch':'keyboard'});
}

async function fallAndRetry(journey,device,review,capture){
 await journey.walkTo(96);await journey.freshCalm();await journey.collect();
 const banked=await journey.score('banked');await journey.phase('warning');
 // Begin safely, then release during the shake. Survival cannot be latched
 // forever by a tap during the warning.
 await journey.input('grab',true);await journey.phase('shaking');await journey.advance(250);
 await journey.input('grab',false);await journey.phase('falling');
 assert.equal(await journey.arcade.locator('.myj-miner').getAttribute('data-pose'),'slipping');await capture('slipping');
 await journey.phase('retry');
 assert.equal(await journey.arcade.locator('[data-myj="continue"]').evaluate(button=>button===document.activeElement),true,'fall focuses its now-visible retry action');
 await capture('retry');
 const retry=await journey.snapshot();assert.equal(retry.banked,banked);assert.equal(retry.loose,0);
 await journey.advance(3000);assert.deepEqual(await journey.snapshot(),retry,'losing waits for an explicit retry');
 await journey.activate(journey.arcade.locator('[data-myj="continue"]'));await journey.advance(32);
 const restarted=await journey.snapshot();assert.equal(restarted.phase,'mining');assert.equal(restarted.banked,banked);
 assert.ok(restarted.safe,'retry starts on the bucket platform');
 assert.equal(restarted.level,retry.level,'retry preserves the current level');
 review.check(device.name,'release-fall-and-retry',{banked,level:restarted.level,input:device.touch?'native touch':'keyboard'});
}

async function levelUp(journey,device,review,capture){
 for(let trip=0;trip<12&&(await journey.snapshot()).phase!=='level-complete';trip++)await journey.collectAndBank();
 assert.equal((await journey.snapshot()).phase,'level-complete','physical deposits fill the first bucket');
 assert.equal(Number(await journey.arcade.locator('.myj-goal-track').getAttribute('aria-valuemax')),12,'first bucket goal is clear');
 assert.equal(await journey.arcade.locator('[data-myj="continue"]').evaluate(button=>button===document.activeElement),true,'win focuses its now-visible next-level action');
 await capture('milestone');
 const complete=await journey.snapshot();await journey.advance(5000);
 assert.deepEqual(await journey.snapshot(),complete,'winning waits for explicit next level');
 await journey.activate(journey.arcade.locator('[data-myj="continue"]'));await journey.advance(32);
 const advanced=await journey.snapshot();assert.equal(advanced.level,complete.level+1);assert.equal(advanced.banked,complete.banked);
 assert.equal(advanced.phase,'mining');assert.ok(advanced.safe);assert.equal(advanced.loose,0);
 assert.ok(Number(await journey.arcade.locator('.myj-goal-track').getAttribute('aria-valuemax'))>12,'next level increases the actual bucket objective');
 await geometry(journey,device,review);await capture('level-two');
 review.check(device.name,'bucket-win-and-progression',{complete,advanced});
}

async function pauseLifecycle(journey,device,review){
 const {page,arcade}=journey;
 await journey.walkTo(96);await journey.freshCalm();await journey.collect();
 await journey.activate(arcade.locator('.myj-pause'));const paused=await journey.snapshot();
 await journey.advance(20000);assert.deepEqual(await journey.snapshot(),paused,'Pause freezes every gameplay clock');
 await journey.activate(arcade.locator('[data-myj="resume"]'));await journey.advance(1000);
 assert.equal((await journey.snapshot()).x,paused.x,'resume does not restore a stale movement key');
 await journey.phase('warning');
 await page.evaluate(()=>{
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
  Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});
  document.dispatchEvent(new Event('visibilitychange'));
 });
 const hidden=await journey.snapshot();await journey.advance(30000);
 assert.deepEqual(await journey.snapshot(),hidden,'hidden tabs do not advance movement, spawn or danger');
 await page.evaluate(()=>{delete document.hidden;delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));});
 assert.equal(await arcade.locator('[data-myj="resume"]').isVisible(),true,'returning asks for an explicit resume');
 await journey.advance(2000);assert.deepEqual(await journey.snapshot(),hidden,'visibility alone cannot restart gameplay');
 await journey.activate(arcade.locator('[data-myj="resume"]'));await journey.advance(200);
 assert.deepEqual(await journey.snapshot(),hidden,'resume grace preserves the saved warning before holding');
 await journey.input('grab',true);await journey.advance(800);
 await journey.phase('shaking');await journey.phase('mining');await journey.input('grab',false);
 assert.equal(await journey.score('banked'),hidden.banked);
 review.check(device.name,'pause-and-background',{paused,hidden,banked:await journey.score('banked')});
}

async function inputLifecycle(journey,device,review){
 const {page,arcade}=journey;
 const scroll=await page.evaluate(()=>({x:scrollX,y:scrollY}));
 await journey.walkTo(65);
 const x=(await journey.snapshot()).x;
 if(device.touch){
  await journey.input('left',true);await journey.input('grab',true);await journey.advance(300);
  assert.equal((await journey.snapshot()).holding,true,'second touch can hold while movement touch stays down');
  assert.equal((await journey.snapshot()).x,x,'holding arrests movement');
  await journey.input('grab',false);await journey.advance(250);
  assert.ok((await journey.snapshot()).x<x-1,'remaining movement touch resumes after releasing hold');
  await journey.releaseInputs();const cancelled=await journey.snapshot();await journey.advance(300);
  assert.equal((await journey.snapshot()).x,cancelled.x,'native touchcancel cannot leave movement latched');
 }else{
  await page.keyboard.down('a');await journey.advance(250);await page.keyboard.up('a');
  assert.ok((await journey.snapshot()).x<x-1,'A moves left');
  const left=(await journey.snapshot()).x;
  await page.keyboard.down('d');await journey.advance(250);await page.keyboard.up('d');
  assert.ok((await journey.snapshot()).x>left+1,'D moves right');
  await journey.input('grab',true);await journey.advance(250);await journey.input('grab',false);
  await arcade.locator('[data-myj="left"]').focus();
  await page.keyboard.down('Enter');await journey.advance(150);await page.keyboard.press('Tab');await page.keyboard.up('Enter');
  const tabbed=await journey.snapshot();await journey.advance(250);
  assert.equal((await journey.snapshot()).x,tabbed.x,'releasing Enter after focus changes cannot leave a movement control held');
  await arcade.locator('[data-myj="left"]').focus();
  assert.equal(await arcade.locator('[data-myj="left"]').evaluate(element=>element.matches(':focus-visible')),true,'keyboard controls keep visible focus');
 }
 assert.deepEqual(await page.evaluate(()=>({x:scrollX,y:scrollY})),scroll,'movement and Space do not scroll the page');
 await journey.walkTo(96);
 review.check(device.name,'sustained-input-lifecycle',{input:device.touch?'native multi-touch and touchcancel':'arrows, A/D and Space',scroll});
}

async function exercise(journey,device,review){
 const {page,arcade}=journey,capture=state=>review.capture(page,arcade,device.name,state);
 assert.match(await arcade.locator('.myj-build-status').innerText(),/building/i);
 assert.equal(await arcade.locator('[data-myj="ready"]').isVisible(),false,'build does not invent readiness');
 await geometry(journey,device,review);
 if(device.motion==='reduce'){
  const moving=await arcade.evaluate(element=>element.getAnimations({subtree:true}).filter(animation=>animation.playState==='running'&&animation.effect?.getKeyframes().some(frame=>'transform' in frame||'translate' in frame||'rotate' in frame)).length);
  assert.equal(moving,0,'reduced motion suppresses decorative character and scenery animations');
 }
 await capture('idle');
 assert.equal(await arcade.locator('.myj-sound').getAttribute('aria-pressed'),'false','sound starts muted');
 if(device.name==='desktop'){
  await journey.activate(arcade.locator('.myj-sound'));assert.equal(await arcade.locator('.myj-sound').getAttribute('aria-pressed'),'true');
  await journey.activate(arcade.locator('.myj-sound'));assert.equal(await arcade.locator('.myj-sound').getAttribute('aria-pressed'),'false');
 }
 const first=arcade.locator('[data-crystal]').first(),beforeClick=await journey.snapshot();
 const crystalBox=await first.boundingBox();assert.ok(crystalBox,'spawned jem is visible');
 const clickPoint={x:crystalBox.x+crystalBox.width/2,y:crystalBox.y+crystalBox.height/2};
 if(device.touch)await page.touchscreen.tap(clickPoint.x,clickPoint.y);else await page.mouse.click(clickPoint.x,clickPoint.y);
 await journey.advance(32);
 assert.equal(await journey.score('loose'),0,'distant jems cannot be collected with a click or tap');
 assert.equal((await journey.snapshot()).x,beforeClick.x,'a crystal click cannot teleport the miner');
 assert.ok(await journey.collect()>0,'walking into a jem collects it');
 assert.ok((await journey.snapshot()).x<beforeClick.x-10,'visible miner traverses the head');await capture('mining');
 await journey.walkTo(96);assert.ok(await journey.score('banked')>0);assert.equal(await journey.score('loose'),0);await capture('banked');
 await heldShake(journey,device,review,capture);
 await fallAndRetry(journey,device,review,capture);
 if(device.name==='desktop'||device.name==='mobile')await levelUp(journey,device,review,capture);
 await helpPause(journey,device,review);
 if(device.name==='desktop'||device.name==='mobile')await pauseLifecycle(journey,device,review);
 // Fresh session keeps the native input checks independent of increased
 // difficulty. The close/reopen is the real user action being verified.
 await journey.activate(arcade.locator('.myj-close'));assert.equal(await arcade.isVisible(),false);await assertScrollRestored(journey);
 await journey.launch.click();await journey.advance(50);
 assert.equal(await journey.score('banked'),0);assert.equal(await journey.score('loose'),0);
 await inputLifecycle(journey,device,review);await capture('keyboard');
 if(device.name==='desktop'||device.name==='mobile-landscape-small'){
  await page.keyboard.press('Escape');assert.equal(await arcade.isVisible(),false,'Escape exits the native dialog');await assertScrollRestored(journey);
  await journey.launch.click();await journey.advance(50);assert.equal(await journey.score('banked'),0);assert.equal(await journey.score('loose'),0);
  review.check(device.name,'escape-and-scroll-restore',{restoredOverflow:journey.bodyOverflow});
 }
 await page.evaluate(()=>{
  document.querySelector('dialog.myj-arcade .myj-close').click();
  document.querySelector('#studioBuildProgress .studio-wait-arcade-button').click();
 });
 await journey.advance(50);assert.equal(await arcade.isVisible(),true,'an old close event cannot erase an immediate reopen');
 await journey.collectAndBank();const readyScore=await journey.score('banked');
 journey.state.status='ready';
 await journey.until(()=>arcade.locator('[data-myj="play-ready"]').isVisible(),'verified ready state is surfaced',{step:250,limit:16000});
 assert.equal(journey.counters.previewRequests,0,'readiness never auto-opens the preview');
 assert.match(await arcade.locator('.myj-build-status').innerText(),/ready/i);
 // Freeze a deterministic safe state for the approved ready composition.
 // A pending shake is still permitted, but capture always uses a fresh calm.
 await journey.freshCalm();await geometry(journey,device,review);await capture('ready');
 assert.equal(await journey.score('banked'),readyScore,'ready status preserves earned progress');
 await journey.collectAndBank();assert.ok(await journey.score('banked')>readyScore,'ready notice leaves movement, collection and physical deposit playable');
 await geometry(journey,device,review);await capture('ready-playing');
 await journey.activate(arcade.locator('[data-myj="play-ready"]'));await page.clock.resume();
 await page.locator('#studioRemoteHost iframe').waitFor({state:'attached'});
 const preview=page.frameLocator('#studioRemoteHost iframe');await preview.locator('#play').click();
 assert.equal(await preview.locator('#result').innerText(),'Game started','handoff reaches the interactive preview fixture');
 assert.equal(await arcade.isVisible(),false);assert.equal(journey.counters.previewRequests,1);await assertScrollRestored(journey);
 assert.equal(await page.evaluate(()=>JSON.stringify(FG.studio.exportNotebook()).includes('TEST_ONLY')),false,'preview capability stays out of saved projects');
 review.check(device.name,'complete-journey',{motion:device.motion,loadedArt:journey.assets.length,buildRequests:journey.counters.submitted,previewRequests:journey.counters.previewRequests});
}

async function existingRemoteHandoff(journey,review){
 const {page,arcade}=journey;
 assert.equal(journey.counters.previewRequests,1,'mini-game does not reload an existing generated game');
 journey.state.status='ready';
 await journey.until(()=>arcade.locator('[data-myj="play-ready"]').isVisible(),'ready generated revision',{step:250,limit:16000});
 assert.equal(journey.counters.previewRequests,1,'readiness itself does not load either preview');
 await journey.activate(arcade.locator('[data-myj="play-ready"]'));await page.clock.resume();
 const preview=page.frameLocator('#studioRemoteHost iframe');await preview.locator('#play').click();
 assert.equal(await preview.locator('#result').innerText(),'Game started');
 assert.equal(journey.counters.previewRequests,2,'handoff loads only the chosen new revision, not the old game followed by the new game');
 assert.ok(journey.counters.previewPaths[0].includes('myj-existing-revision'));
 assert.ok(journey.counters.previewPaths[1].includes('myj-ready-revision'));
 review.check('remote-handoff','existing-generated-project',{previewPaths:journey.counters.previewPaths});
}

async function recovery(journey,device,review){
 const {page,arcade,state,counters}=journey;
 if(device.artFailure){
  assert.equal(await arcade.getAttribute('data-assets'),'failed');
  for(const control of ['left','right','grab'])assert.equal(await arcade.locator('[data-myj="'+control+'"]').isEnabled(),false,'missing artwork disables '+control);
  assert.match(await arcade.locator('[data-myj="loading-copy"]').innerText(),/another try/i);
  await geometry(journey,device,review);await review.capture(page,arcade,device.name,'art-failure');
  const failed=await journey.snapshot();await journey.advance(25000);assert.deepEqual(await journey.snapshot(),failed,'missing artwork cannot advance invisible gameplay');
  state.artBlocked=false;await journey.activate(arcade.locator('[data-myj="retry-art"]'));
  await journey.until(async()=>await arcade.getAttribute('data-assets')==='ready','artwork retry recovers');await journey.inspectArtwork();
  assert.equal(await arcade.locator('[data-myj="retry-art"]').isVisible(),false);await review.capture(page,arcade,device.name,'art-recovered');
 }
 await journey.activate(arcade.locator('.myj-close'));await assertScrollRestored(journey);
 await journey.activate(page.locator('#studioNavHome'));assert.equal(await page.locator('#page-studio-library').isVisible(),true);
 const shelfLaunch=page.locator('#studioBuildShelf .studio-wait-arcade-button');await shelfLaunch.waitFor({state:'visible'});await journey.activate(shelfLaunch);await journey.advance(50);
 assert.equal(await arcade.isVisible(),true,'global background shelf enters the same game');assert.equal(await journey.score('banked'),0);
 await journey.collectAndBank();
 if(device.artFailure){
  state.networkOffline=true;
  await journey.until(async()=>await arcade.getAttribute('data-build')==='reconnecting','interrupted polling is shown as reconnecting',{step:500,limit:20000});
  assert.ok(counters.interruptedPolls>0);assert.match(await arcade.locator('.myj-build-status').innerText(),/reconnecting/i);
  assert.equal(await arcade.locator('[data-myj="play-ready"]').isVisible(),false);
  await geometry(journey,device,review);await review.capture(page,arcade,device.name,'reconnecting');
  const before=await journey.score('banked');await journey.collectAndBank();
  assert.ok(await journey.score('banked')>before,'local mining remains playable without a build connection');
  state.networkOffline=false;
  await journey.until(async()=>await arcade.getAttribute('data-build')==='building','same acknowledged job reconnects',{step:500,limit:20000});
  assert.equal(counters.submitted,1,'reconnection cannot resubmit a build');
 }
 state.status=device.recoveryTerminal;
 await journey.until(async()=>await arcade.getAttribute('data-build')===device.recoveryTerminal,'terminal build status reaches the game',{step:250,limit:16000});
 assert.equal(await arcade.locator('[data-myj="ready"]').isVisible(),false);
 assert.match(await arcade.locator('.myj-build-status').innerText(),device.recoveryTerminal==='failed'?/needs a hand/i:/cancelled/i);
 if((await journey.snapshot()).phase==='level-complete')await journey.activate(arcade.locator('[data-myj="continue"]'));
 await geometry(journey,device,review);await review.capture(page,arcade,device.name,device.recoveryTerminal);
 const banked=await journey.score('banked');await journey.collectAndBank();assert.ok(await journey.score('banked')>banked,'a failed or cancelled build leaves real mining playable');
 await review.capture(page,arcade,device.name,device.recoveryTerminal+'-playing');
 if(device.portraitViewport){
  const saved=await journey.score('banked');await page.setViewportSize(device.portraitViewport);await journey.advance(50);
  assert.equal(await journey.score('banked'),saved,'orientation preserves deposited jems');
  if((await journey.snapshot()).phase==='level-complete')await journey.activate(arcade.locator('[data-myj="continue"]'));
  await geometry(journey,{...device,viewport:device.portraitViewport},review);await review.capture(page,arcade,device.name,device.recoveryTerminal+'-small-portrait');
  await journey.collectAndBank();assert.ok(await journey.score('banked')>saved,'rotated terminal state keeps movement and the bucket usable');
  await review.capture(page,arcade,device.name,device.recoveryTerminal+'-small-portrait-playing');
  review.check(device.name,'terminal-viewport-change',{viewport:device.portraitViewport,banked:await journey.score('banked')});
 }
 await journey.activate(arcade.locator('.myj-exit'));assert.equal(await arcade.isVisible(),false);await assertScrollRestored(journey);
 assert.equal(await page.locator('#page-studio').isVisible(),true,'terminal exit opens the build-owning project');
 assert.equal(await page.locator('#page-studio-library').isVisible(),false);assert.equal(await page.locator('#studioConversation').isVisible(),true);
 assert.equal(await page.locator('#studioPrompt').isVisible(),true,'the child can revise a failed idea');
 assert.equal(await page.evaluate(()=>FG.studio.exportNotebook().active[FG.store.current().id]),journey.project.id);
 assert.equal(counters.previewRequests,0,'terminal builds cannot open a preview');
 review.check(device.name,'build-and-art-recovery',{terminal:device.recoveryTerminal,entry:'global-build-shelf',returnedToProject:journey.project.id,artRetries:device.artFailure?1:0,interruptedPolls:counters.interruptedPolls,buildRequests:counters.submitted,previewRequests:counters.previewRequests});
}

async function profileReset(journey,device,review){
 const {page,arcade,project}=journey;
 // Model an application-driven profile event using the same guarded store and
 // notification path as the profile chooser. Native modal inertness correctly
 // prevents clicking the background chooser while the mini-game is open.
 const choose=async owner=>{
  const changed=await page.evaluate(owner=>{
   if(!FG.store.choose(owner))return false;
   FG.app.refreshProfiles();window.dispatchEvent(new Event('factory-profile'));return true;
  },owner);
  assert.equal(changed,true,'profile selection passes the application guards');
 };
 await journey.collectAndBank();await journey.collect();
 assert.ok(await journey.score('banked')>0);assert.ok(await journey.score('loose')>0);
 await choose(project.otherOwner);
 assert.equal(await arcade.isVisible(),false,'profile changes close active mini-game');await assertScrollRestored(journey);
 assert.equal(await page.locator('#studioBuildShelf').isVisible(),false,'other profiles cannot see the previous child’s build');
 await journey.advance(20000);
 assert.equal(journey.counters.previewRequests,0);
 // The background-build shelf is a real supported entry point after changing
 // profiles and does not auto-open the project's separate generated preview.
 await choose(project.owner);
 const reopen=page.locator('#studioBuildShelf .studio-wait-arcade-button');
 await reopen.waitFor({state:'visible'});await journey.activate(reopen);await journey.advance(50);
 assert.equal(await journey.score('banked'),0);assert.equal(await journey.score('loose'),0,'profile re-entry starts a fresh mining session');
 assert.equal(await arcade.getAttribute('data-phase'),'mining');
 assert.ok(await journey.collect()>0,'profile re-entry still responds to real movement');
 await journey.walkTo(96);
 journey.state.status='ready';
 await journey.until(()=>arcade.locator('[data-myj="play-ready"]').isVisible(),'ready callback exists before profile teardown',{step:250,limit:16000});
 const oldReady=await arcade.locator('[data-myj="play-ready"]').elementHandle();
 assert.ok(oldReady,'ready action exists before teardown');
 const before=await page.evaluate(id=>{
  const session=FG.studio.exportNotebook().sessions.find(item=>item.id===id);
  return {projectId:session.projectId,remoteId:session.remoteId,selectedTest:session.selectedTest};
 },project.id);
 await choose(project.otherOwner);
 assert.equal(await arcade.isVisible(),false);await assertScrollRestored(journey);
 // A delayed/programmatic activation of the old ready element must be inert.
 await oldReady.evaluate(button=>button.click());await oldReady.dispose();await journey.advance(1000);
 assert.equal(journey.counters.previewRequests,0,'a stale ready callback cannot open another child’s preview');
 const after=await page.evaluate(id=>{
  const session=FG.studio.exportNotebook().sessions.find(item=>item.id===id);
  return {projectId:session.projectId,remoteId:session.remoteId,selectedTest:session.selectedTest};
 },project.id);
 assert.deepEqual(after,before,'profile teardown cannot select or Keep an old ready test');
 assert.equal(await page.locator('#studioRemoteHost iframe').count(),0);
 review.check(device.name,'profile-teardown',{scoresReset:true,staleReadyBlocked:true,mainGamePreserved:true,previewRequests:journey.counters.previewRequests});
}

async function recordGameplay(browser,base,review){
 const device={...devices.find(device=>device.name==='desktop-motion'),name:'gameplay-video'},journey=await createJourney(browser,base,device,true);
 try{
  const {arcade,page}=journey;await page.waitForTimeout(800);
  await journey.collectAndBank();await journey.collect();await journey.phase('warning');
  await journey.input('grab',true);await journey.phase('shaking');await journey.phase('mining');await journey.input('grab',false);
  await journey.walkTo(96);await journey.freshCalm();await journey.collect();await journey.phase('warning');await journey.phase('falling');await journey.phase('retry');
  await page.waitForTimeout(700);await journey.activate(arcade.locator('[data-myj="continue"]'));
  journey.state.status='ready';await arcade.locator('[data-myj="play-ready"]').waitFor({state:'visible',timeout:16000});await page.waitForTimeout(1000);
  const video=page.video();await journey.finish();const filename='mind-your-jems-gameplay.webm';await video.saveAs(path.join(review.directory,filename));
  review.manifest.video={file:filename,viewport:device.viewport,motion:'normal',source:'real browser movement, collection, bank, held spill, unheld fall and retry; mocked build statuses'};
 }catch(error){await journey.context.close();throw error;}
}

(async()=>{
 const server=start(),options={headless:true,args:['--no-sandbox']};
 await new Promise(resolve=>server.once('listening',resolve));
 // Pin renderer to the same Playwright Chromium in local acceptance and CI.
 if(process.env.CHROMIUM_PATH)options.executablePath=process.env.CHROMIUM_PATH;
 const base='http://127.0.0.1:'+server.address().port+'/arcade/';
 let browser,review;
 try{
  browser=await chromium.launch(options);review=await createReview(browser);
  const requested=process.env.MYJ_DEVICES?.split(','),selected=devices.filter(device=>
   (!requested||requested.includes(device.name))&&
   // Recovery fixtures intentionally start outside a fully loaded layout.
   (process.env.MYJ_LAYOUT_ONLY!=='1'||!device.recoveryTerminal&&!device.profileReset));
  assert.ok(selected.length,'MYJ_DEVICES must name a supported viewport');
  const failures=[];
  for(const device of selected){
   review.manifest.viewports.push(device);const previousContexts=new Set(browser.contexts());let journey;
   try{
    journey=await createJourney(browser,base,device);
    if(process.env.MYJ_LAYOUT_ONLY==='1'){await geometry(journey,device,review);await review.capture(journey.page,journey.arcade,device.name,'idle');}
    else if(device.existingRemote)await existingRemoteHandoff(journey,review);
    else if(device.recoveryTerminal)await recovery(journey,device,review);
    else if(device.profileReset)await profileReset(journey,device,review);
    else await exercise(journey,device,review);
    await journey.finish();
   }catch(error){
    const detail=device.name+': '+(error.stack||String(error));
    failures.push(new Error(detail));review.manifest.errors.push(detail);console.error('FAIL '+detail);
    if(journey&&await journey.arcade.isVisible())await journey.arcade.screenshot({path:path.join(review.directory,device.name+'-failure.png'),animations:'disabled'}).catch(()=>{});
    for(const context of browser.contexts())if(!previousContexts.has(context))await context.close();
    continue;
   }
   console.log('PASS '+device.name+': '+(process.env.MYJ_LAYOUT_ONLY==='1'?'layout and loaded artwork':device.existingRemote?'existing generated-project handoff':device.recoveryTerminal?'failure, recovery, continued play and exit':device.profileReset?'profile teardown, reset and stale callback isolation':'art, layout, native input, bank, warning, hold, shake, reset, ready and playable handoff'));
  }
  if(process.env.MYJ_CAPTURE_VIDEO==='1')await recordGameplay(browser,base,review);
  if(failures.length)throw new AggregateError(failures,'Mind Your Jems failed in '+failures.length+' independent configuration(s); all available evidence is retained.');
 }catch(error){if(review)review.manifest.errors.push(error.stack||String(error));throw error;}
 finally{
  try{if(review)await review.finish();}
  finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});

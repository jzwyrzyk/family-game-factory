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
  // Inert scene buttons are intentionally unavailable while help is open.
  // Disabled targets still need usable dimensions, but an error/ready overlay
  // need not expose an unavailable cart through itself.
  const stage=dialog.querySelector('.myj-stage'),targets=[...dialog.querySelectorAll('button')].filter(element=>
   element.getClientRects().length&&getComputedStyle(element).visibility==='visible'&&!element.closest('[inert]'));
  const notice=dialog.querySelector('.myj-notice-visible'),rock=rect(dialog.querySelector('.myj-rock'));
  const speech=dialog.querySelector('.myj-speech'),speechStyle=getComputedStyle(speech);
  const eyes={x:rock.x+rock.width*.25,y:rock.y+rock.height*.42,right:rock.x+rock.width*.8,bottom:rock.y+rock.height*.65};
  const compactScene=(innerWidth<=600&&innerHeight<=720&&innerHeight>=innerWidth)||(innerHeight<=600&&innerWidth>innerHeight);
  // The illustrated eye region has stable coordinates in every atlas frame.
  // Check visible overlap explicitly: pointer-events:none feedback can still
  // hide a crystal while the native hit-target test reports it reachable.
  const feedback=compactScene&&notice&&notice.textContent.trim()?{text:notice.textContent.trim(),...rect(notice),
   fontSize:parseFloat(getComputedStyle(notice).fontSize),textFits:notice.scrollWidth<=notice.clientWidth+1,
   eyes}:null;
  const contrast=element=>{
   const style=getComputedStyle(element),rgb=value=>value.match(/[\d.]+/g)?.map(Number);
   const front=rgb(style.color),back=rgb(style.backgroundColor),filter=style.filter;
   const brightness=filter==='none'?1:Number(filter.match(/^brightness\(([\d.]+)\)$/)?.[1]);
   if(style.backgroundImage!=='none'||!front||!back||(front[3]??1)!==1||(back[3]??1)!==1||!Number.isFinite(brightness))
    return {ratio:null,color:style.color,background:style.backgroundColor,image:style.backgroundImage,filter};
   const light=channels=>channels.slice(0,3).map(value=>Math.min(255,value*brightness)/255)
    .map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4)
    .reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
   const a=light(front),b=light(back);
   return {ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),color:style.color,background:style.backgroundColor,filter};
  };
  return {phase:dialog.dataset.phase,viewport:{width:innerWidth,height:innerHeight},dialog:rect(dialog),stage:rect(stage),
   feedback,speech:speechStyle.display!=='none'&&Number(speechStyle.opacity)>0?{...rect(speech),eyes}:null,
   overflow:{horizontal:dialog.scrollWidth-dialog.clientWidth,vertical:dialog.scrollHeight-dialog.clientHeight},
   targets:targets.map(element=>{const box=rect(element),hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);return {
    label:element.getAttribute('aria-label')||element.textContent.trim(),...box,enabled:!element.disabled,
    reachable:hit===element||element.contains(hit),crystal:element.hasAttribute('data-crystal'),
    contrast:!element.disabled&&element.matches('.myj-action,.myj-native-tools button,[data-myj="help-done"]')?contrast(element):null};})};
 });
 review.check(device.name,'layout-and-hit-targets',details);
 assert.ok(details.dialog.x>=-1&&details.dialog.y>=-1&&details.dialog.right<=details.viewport.width+1&&details.dialog.bottom<=details.viewport.height+1,device.name+' shared native game fits viewport');
 assert.ok(details.overflow.horizontal<=2,device.name+' has no horizontal clipping');
 assert.ok(details.overflow.vertical<=2,device.name+' main game fits without scrolling');
 assert.ok(details.stage.height>=Math.min(300,device.viewport.height*.46),device.name+' gives the illustrated play area useful space');
 for(const target of details.targets){
  assert.ok(target.width>=43.5&&target.height>=43.5,device.name+' target is at least 44px: '+target.label);
  if(target.enabled){
   assert.ok(target.reachable,device.name+' available control is not covered: '+target.label);
   const visibleWidth=Math.min(target.right,details.viewport.width)-Math.max(target.x,0),visibleHeight=Math.min(target.bottom,details.viewport.height)-Math.max(target.y,0);
   assert.ok(visibleWidth>=43.5&&visibleHeight>=43.5,device.name+' available control has a visible 44px target: '+target.label);
  }
  if(target.contrast)assert.ok(target.contrast.ratio!==null&&target.contrast.ratio>=4.5,
   device.name+' active '+target.label+' has readable contrast: '+JSON.stringify(target.contrast));
  if(target.crystal)assert.ok(target.x>=details.stage.x-1&&target.y>=details.stage.y-1&&target.right<=details.stage.right+1&&target.bottom<=details.stage.bottom+1,device.name+' crystal remains inside the visible scene');
 }
 if(details.feedback){
  const toast=details.feedback,intersects=box=>Math.min(toast.right,box.right)-Math.max(toast.x,box.x)>1&&Math.min(toast.bottom,box.bottom)-Math.max(toast.y,box.y)>1;
  assert.ok(toast.fontSize>=18&&toast.textFits&&toast.x>=details.stage.x&&toast.right<=details.stage.right&&toast.y>=details.stage.y&&toast.bottom<=details.stage.bottom,
   device.name+' keeps meaningful feedback readable inside the scene: '+JSON.stringify(toast));
  for(const target of details.targets.filter(target=>target.crystal&&target.enabled))assert.ok(!intersects(target),device.name+' feedback leaves active crystal art visible: '+target.label);
  assert.ok(!intersects(toast.eyes),device.name+' feedback leaves the rock eyes visible');
  review.check(device.name,'feedback-clearance',{text:toast.text,crystals:details.targets.filter(target=>target.crystal&&target.enabled).length,eyesClear:true});
 }
 if(details.speech){
  const bubble=details.speech,intersects=box=>Math.min(bubble.right,box.right)-Math.max(bubble.x,box.x)>1&&Math.min(bubble.bottom,box.bottom)-Math.max(bubble.y,box.y)>1;
  for(const target of details.targets.filter(target=>target.crystal&&target.enabled))assert.ok(!intersects(target),device.name+' decorative warning leaves crystal art visible: '+target.label);
  assert.ok(!intersects(bubble.eyes),device.name+' decorative warning leaves the rock eyes visible');
 }
}

async function assertScrollRestored(journey){
 assert.equal(await journey.page.evaluate(()=>document.body.style.overflow),journey.bodyOverflow,'closing restores the previous document scroll style');
}

async function assertPlayHandoffScroll(journey){
 const {page}=journey;
 assert.equal(await page.locator('#page-studio').evaluate(node=>node.classList.contains('studio-play-mode')),true,'the explicitly chosen preview owns the same play view after Mining unmounts');
 assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden','active play keeps the outer page still');
 const frame=await page.locator('#studioRemoteHost iframe').boundingBox(),size=page.viewportSize();
 assert.ok(frame&&frame.y>=0&&frame.y+frame.height<=size.height+1,'the generated game fits its new scroll owner');
 await page.locator('#studioHome').click();
 assert.equal(await page.locator('#page-studio').evaluate(node=>node.classList.contains('studio-play-mode')),false,'leaving releases the play view');
 await assertScrollRestored(journey);
}

async function helpPause(journey,device,review){
 const {arcade}=journey;
 await journey.phase('mining');
 await journey.activate(arcade.locator('[data-crystal="3"]'));await journey.advance(450);await journey.phase('warning');
 const saved={banked:await journey.score('banked'),loose:await journey.score('loose')};
 await journey.activate(arcade.locator('.myj-help-toggle'));
 assert.equal(await arcade.locator('.myj-stage').evaluate(stage=>stage.inert),true,'help makes scene controls inert');
 assert.equal(await arcade.locator('.myj-help-toggle').getAttribute('aria-expanded'),'true');
 await journey.advance(15000);
 assert.equal(await journey.score('banked'),saved.banked);assert.equal(await journey.score('loose'),saved.loose);
 assert.equal(await arcade.getAttribute('data-phase'),'mining','help pauses the warning without penalizing the child');
 await geometry(journey,device,review);await review.capture(journey.page,arcade,device.name,'help');
 await journey.activate(arcade.locator('[data-myj="help-done"]'));
 assert.equal(await arcade.locator('.myj-stage').evaluate(stage=>stage.inert),false);
 assert.equal(await arcade.locator('.myj-help-toggle').getAttribute('aria-expanded'),'false');
 await journey.advance(2000);assert.equal(await arcade.getAttribute('data-phase'),'mining','closing help gives a fresh warning interval');
 review.check(device.name,'help-pause',{preserved:saved});
}

async function exercise(journey,device,review){
 const {page,arcade}=journey;
 const mine=index=>journey.activate(arcade.locator('[data-crystal="'+index+'"]'));
 const bank=()=>journey.activate(arcade.locator('[data-myj="bank"]'));
 const capture=state=>review.capture(page,arcade,device.name,state);
 assert.equal((await journey.original()).job.status,'building');
 assert.equal(await page.locator('#studioPlayNotifications').getAttribute('data-pending'),'1','the acknowledged original build remains in progress');
 assert.equal(await page.locator('#studioPlayNotifications').getAttribute('data-unread'),'0','building does not invent a ready update');
 await geometry(journey,device,review);
 if(device.motion==='reduce'){
  const moving=await arcade.evaluate(element=>element.getAnimations({subtree:true}).filter(animation=>animation.playState==='running'&&animation.effect?.getKeyframes().some(frame=>'transform' in frame||'translate' in frame||'rotate' in frame)).length);
  assert.equal(moving,0,'reduced-motion preference suppresses character and scenery movement');
 }
 await capture('idle');
 assert.equal(await arcade.locator('.myj-sound').getAttribute('aria-pressed'),'false','sound starts muted');
 if(device.name==='desktop'){
  await arcade.locator('.myj-sound').click();assert.equal(await arcade.locator('.myj-sound').getAttribute('aria-pressed'),'true');
  await arcade.locator('.myj-sound').click();assert.equal(await arcade.locator('.myj-sound').getAttribute('aria-pressed'),'false');
 }
 await mine(0);await journey.advance(450);await mine(3);
 assert.equal(await journey.score('loose'),4,'one-Jem and rare three-Jem crystals');
 assert.equal(await arcade.locator('.myj-miner').getAttribute('data-pose'),'mining','mining has a visible character action');
 await capture('mining');await journey.advance(450);
 await arcade.locator('[data-crystal="1"]').focus();await page.keyboard.press('Enter');
 assert.equal(await journey.score('loose'),5,'keyboard reaches and activates the same crystals');
 await capture('keyboard');await journey.advance(450);
 await journey.activate(arcade.locator('[data-myj="bank-cart"]'));
 assert.equal(await journey.score('banked'),5);assert.equal(await journey.score('loose'),0);
 await capture('banked');await journey.advance(700);
 for(let i=0;i<3;i++){await mine(3);await journey.advance(450);}
 assert.equal(await journey.score('loose'),8,'rare gems stop at the bag capacity');
 assert.equal(await arcade.locator('[data-crystal]:enabled').count(),0,'full bag blocks further mining');
 await capture('full-bag');await bank();assert.equal(await journey.score('banked'),13);await journey.advance(700);
 await mine(0);await journey.advance(450);await mine(3);await journey.advance(450);
 await journey.phase('warning');
 assert.equal(await arcade.locator('[data-myj="grab"]').isEnabled(),true);
 assert.equal(await arcade.locator('.myj-rock').getAttribute('data-expression'),'warning');
 await geometry(journey,device,review);
 await capture('warning');await journey.activate(arcade.locator('[data-myj="grab"]'));
 assert.equal(await arcade.getAttribute('data-holding'),'true');
 assert.equal(await arcade.locator('.myj-miner').getAttribute('data-pose'),'holding');
 await capture('holding');await journey.phase('shaking');
 assert.equal(await journey.score('banked'),13,'banked Jems survive shaking');
 assert.equal(await journey.score('loose'),0,'holding protects the miner, not loose cargo');
 assert.equal(await arcade.locator('.myj-miner').getAttribute('data-pose'),'holding');
 await capture('shaking');await journey.phase('mining');
 if(device.name==='desktop'||device.name==='mobile-motion'){
  await mine(3);await journey.advance(450);await journey.phase('warning');await journey.phase('shaking');
  assert.equal(await arcade.locator('.myj-miner').getAttribute('data-pose'),'slipping','unheld miner visibly slips');
  await capture('slipping');await journey.phase('mining');
  for(let i=0;i<4;i++){await mine(3);await journey.advance(450);await bank();await journey.advance(700);}
  assert.equal(await journey.score('banked'),25,'repeated deposits reach the actual milestone');await capture('milestone');
 }
 // The shared host preserves the exact phase and remaining timer while its
 // menu or another browser surface has the child's attention.
 if(device.name==='desktop'){
  await mine(3);await journey.advance(450);await journey.phase('warning');
  const saved=await page.evaluate(()=>FG.runtime.snapshot().state);
  await page.locator('#studioMore > summary').click();
  assert.equal(await arcade.getAttribute('data-paused'),'true');
  await journey.advance(30000);
  assert.deepEqual(await page.evaluate(()=>FG.runtime.snapshot().state),saved,'More pauses the original hazard and scores exactly');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#studioMore').evaluate(node=>node.open),false,'Escape closes the shared tools');
  assert.equal(await arcade.getAttribute('data-paused'),'true','closing tools leaves an explicit resume choice');
  await journey.activate(arcade.locator('.myj-pause-cover button'));
  await page.evaluate(()=>{
   Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
   Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});
   document.dispatchEvent(new Event('visibilitychange'));
  });
  await journey.advance(30000);
  assert.deepEqual(await page.evaluate(()=>FG.runtime.snapshot().state),saved,'background time cannot spend the warning interval');
  await page.evaluate(()=>{delete document.hidden;delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));});
  await journey.advance(2000);assert.deepEqual(await page.evaluate(()=>FG.runtime.snapshot().state),saved,'returning does not resume without the child');
  await journey.activate(arcade.locator('.myj-pause-cover button'));
  await journey.advance(2000);assert.equal(await arcade.getAttribute('data-phase'),'warning','resuming preserves the remaining warning time');
  await journey.phase('mining');
  review.check(device.name,'shared-menu-and-visibility-pause',{preserved:saved});
 }
 await helpPause(journey,device,review);
 assert.equal(journey.counters.previewRequests,0,'playing the mini-game never opens the generated preview');
 await journey.activate(page.locator('#studioHome'));assert.equal(await arcade.isVisible(),false);
 await assertScrollRestored(journey);
 await journey.launch.click();await journey.advance(50);
 assert.equal(await journey.score('banked'),0);assert.equal(await journey.score('loose'),0);
 // An old detached control cannot mutate a disposed game or a new mount.
 const oldCrystal=await arcade.locator('[data-crystal="0"]').elementHandle();
 await journey.activate(page.locator('#studioHome'));await assertScrollRestored(journey);
 await journey.launch.click();await journey.advance(50);
 await oldCrystal.evaluate(button=>button.click());
 assert.equal(await journey.score('loose'),0,'detached previous-game callbacks cannot alter the new round');
 assert.equal(await arcade.isVisible(),true);
 await mine(0);assert.equal(await journey.score('loose'),1,'immediate reopen remains interactive');
 await journey.advance(450);await bank();assert.equal(await journey.score('banked'),1);await journey.advance(700);
 journey.state.status='ready';
 await journey.ready();
 assert.equal(journey.counters.previewRequests,0,'ready notification never auto-opens a preview');
 assert.match(await page.locator('#studioMore > summary').innerText(),/ready/i);await geometry(journey,device,review);await capture('ready');
 const readyScore=await journey.score('banked');await journey.advance(1500);
 assert.equal(await journey.score('banked'),readyScore,'ready status leaves earned progress intact');
 await journey.phase('mining');await mine(0);await journey.advance(450);
 await geometry(journey,device,review);
 await journey.activate(arcade.locator('[data-myj="bank-cart"]'));
 assert.equal(await journey.score('banked'),readyScore+1,'ready notification leaves the mining and cart controls playable');
 assert.equal(await journey.score('loose'),0);
 await geometry(journey,device,review);
 await capture('ready-playing');
 await journey.openOriginal();
 // The newly attached sandbox frame has its own animation frames and preview
 // handshake timers. Resume real time after the deterministic game assertions.
 await page.clock.resume();
 await page.locator('#studioRemoteHost iframe').waitFor({state:'attached'});
 const preview=page.frameLocator('#studioRemoteHost iframe');await preview.locator('#play').click();
 assert.equal(await preview.locator('#result').innerText(),'Game started','handoff reaches an interactive preview fixture');
 assert.equal(await arcade.isVisible(),false);assert.equal(journey.counters.previewRequests,1);
 await assertPlayHandoffScroll(journey);
 if(device.name==='desktop')await learningCheckpoint(journey,review);
 assert.equal(await page.evaluate(()=>JSON.stringify(FG.studio.exportNotebook()).includes('TEST_ONLY')),false,'preview capability does not enter saved projects');
 review.check(device.name,'complete-journey',{motion:device.motion,loadedArt:journey.assets.length,buildRequests:journey.counters.submitted,previewRequests:journey.counters.previewRequests});
}

async function existingRemoteHandoff(journey,review){
 const {page,arcade}=journey;
 assert.equal(journey.counters.previewRequests,1,'mini-game does not reload an existing generated game');
 journey.state.status='ready';
 await journey.ready();
 assert.equal(journey.counters.previewRequests,1,'readiness itself does not load either preview');
 await journey.openOriginal();await page.clock.resume();
 const preview=page.frameLocator('#studioRemoteHost iframe');await preview.locator('#play').click();
 assert.equal(await preview.locator('#result').innerText(),'Game started');
 assert.equal(journey.counters.previewRequests,2,'handoff loads only the chosen new revision, not the old game followed by the new game');
 assert.ok(journey.counters.previewPaths[0].includes('myj-existing-revision'));
 assert.ok(journey.counters.previewPaths[1].includes('myj-ready-revision'));
 await assertPlayHandoffScroll(journey);
 review.check('remote-handoff','existing-generated-project',{previewPaths:journey.counters.previewPaths});
}

async function learningCheckpoint(journey,review){
 const {page,arcade}=journey;
 await journey.launch.click();
 await journey.activate(arcade.locator('[data-crystal="3"]'));
 const before=await page.evaluate(()=>FG.runtime.snapshot().state);
 await page.evaluate(()=>{
  FG.store.current().mathWindow=[];
  window.dispatchEvent(new CustomEvent('factory-game-event',{detail:{type:'checkpoint',game:'mining'}}));
 });
 await page.waitForFunction(()=>FG.learning.active);
 const attempt=await page.evaluate(()=>FG.learning.activeAttemptId);
 assert.equal(await page.locator('#game-mount').evaluate(node=>node.inert),true,'the host owns the required learning pause');
 assert.equal(await arcade.getAttribute('data-paused'),'true');
 await page.waitForTimeout(1000);
 assert.deepEqual(await page.evaluate(()=>FG.runtime.snapshot().state),before,'required learning cannot spend Mining time or scores');
 await page.locator('#studioMore > summary').click();
 assert.equal(await page.locator('#studioMore').evaluate(node=>node.open),false,'Notifications and other tools cannot bypass required learning');
 assert.equal(await page.evaluate(()=>FG.learning.activeAttemptId),attempt);
 await page.locator('#studioFullScreen').click();
 assert.equal(await page.evaluate(()=>FG.learning.activeAttemptId),attempt,'expanded native play retains the same checkpoint');
 assert.equal(await page.locator('#game-mount').evaluate(node=>node.inert),true);
 await page.locator('#studioHome').click();
 assert.equal(await page.evaluate(()=>FG.learning.active),false,'the visible exit can interrupt without inventing an answer');
 assert.equal(await arcade.isVisible(),false);await assertScrollRestored(journey);
 review.check('desktop','native-host-learning',{attempt,pausedState:before,explicitExit:true});
}

async function recovery(journey,device,review){
 const {page,arcade,state,counters}=journey;
 if(device.artFailure){
  assert.equal(await arcade.getAttribute('data-assets'),'failed');
  assert.equal(await arcade.locator('[data-crystal]:enabled').count(),0,'missing art cannot start invisible mining');
  assert.equal(await arcade.locator('[data-myj="bank"]').isEnabled(),false);
  assert.match(await arcade.locator('[data-myj="loading-copy"]').innerText(),/another try/i);
  await geometry(journey,device,review);await review.capture(page,arcade,device.name,'art-failure');
  await journey.advance(25000);
  assert.equal(await arcade.getAttribute('data-phase'),'mining','no hazard starts while artwork is missing');
  assert.equal(await journey.score('loose'),0);
  state.artBlocked=false;
  await journey.activate(arcade.locator('[data-myj="retry-art"]'));
  await journey.until(async()=>await arcade.getAttribute('data-assets')==='ready','artwork retry recovers');
  await journey.inspectArtwork();
  assert.equal(await arcade.locator('[data-myj="retry-art"]').isVisible(),false);
  await review.capture(page,arcade,device.name,'art-recovered');
 }
 // Re-entry uses the ordinary catalog; the original build keeps its own
 // notification identity even while a different native project is selected.
 await journey.activate(page.locator('#studioHome'));await assertScrollRestored(journey);
 assert.equal(await page.locator('#page-studio-library').isVisible(),true,'recovery fixture starts from My Games');
 await journey.launch.click();await journey.advance(50);
 assert.equal(await arcade.isVisible(),true,'Mining opens through the shared Ready to Play card');
 assert.equal(await journey.score('banked'),0,'a reopened native round starts cleanly');
 await journey.activate(arcade.locator('[data-crystal="3"]'));await journey.advance(450);
 await journey.activate(arcade.locator('[data-myj="bank"]'));
 assert.equal(await journey.score('banked'),3);
 if(device.artFailure){
  state.networkOffline=true;
  await journey.until(async()=>counters.interruptedPolls>0&&Number(await page.locator('#studioPlayNotifications').getAttribute('data-unread'))>0,'interrupted polling creates a visible notification count',{step:500,limit:20000});
  assert.ok(counters.interruptedPolls>0,'reconnection is triggered by a real failed fixture request');
  assert.equal(await page.locator('#studioPlayNotifications').getAttribute('data-pending'),'1','unknown build state remains in progress');
  assert.equal(counters.previewRequests,0,'a connection error cannot claim readiness');
  await geometry(journey,device,review);await review.capture(page,arcade,device.name,'reconnecting');
  await journey.phase('mining');
  await journey.activate(arcade.locator('[data-crystal="0"]'));await journey.advance(450);
  await journey.activate(arcade.locator('[data-myj="bank"]'));
  assert.equal(await journey.score('banked'),4,'local mining stays playable while the build connection recovers');
  state.networkOffline=false;
  const polls=counters.jobPolls;
  await journey.until(async()=>counters.jobPolls>polls&&await page.locator('#studioPlayNotifications').getAttribute('data-unread')==='0','the same acknowledged job reconnects and clears its unknown update',{step:500,limit:20000});
  assert.equal(counters.submitted,1,'reconnecting never resubmits a build');
  assert.equal(await journey.score('banked'),4,'reconnection preserves local earned progress');
 }
 state.status=device.recoveryTerminal;
 await journey.until(async()=>(await journey.original()).job?.status===device.recoveryTerminal,'terminal status is saved on the original build',{step:250,limit:16000});
 assert.equal(counters.previewRequests,0,'a failed or cancelled job never requests a preview');
 assert.equal(await page.locator('#studioPlayNotifications').getAttribute('data-pending'),'0');
 await geometry(journey,device,review);await review.capture(page,arcade,device.name,device.recoveryTerminal);
 await journey.phase('mining');
 const banked=await journey.score('banked');
 await journey.activate(arcade.locator('[data-crystal="3"]'));await journey.advance(450);
 await geometry(journey,device,review);
 await journey.activate(arcade.locator('[data-myj="bank-cart"]'));
 assert.equal(await journey.score('banked'),banked+3,'a terminal build leaves mining and the cart playable');
 await review.capture(page,arcade,device.name,device.recoveryTerminal+'-playing');
 if(device.portraitViewport){
  // Keep the same terminal session alive through a smaller portrait layout.
  // Its cart becomes enabled again, so a banner cannot silently cover it.
  await page.setViewportSize(device.portraitViewport);await journey.advance(50);await journey.phase('mining');
  await journey.activate(arcade.locator('[data-crystal="0"]'));await journey.advance(450);
  await geometry(journey,{...device,viewport:device.portraitViewport},review);
  await review.capture(page,arcade,device.name,device.recoveryTerminal+'-small-portrait');
  await journey.activate(arcade.locator('[data-myj="bank-cart"]'));
  assert.equal(await journey.score('banked'),banked+4,'resizing preserves progress and keeps the terminal-state cart reachable');
  await review.capture(page,arcade,device.name,device.recoveryTerminal+'-small-portrait-playing');
  review.check(device.name,'terminal-viewport-change',{viewport:device.portraitViewport,banked:banked+4});
 }
 const row=await journey.notification();
 assert.equal(await row.getAttribute('data-notification-kind'),device.recoveryTerminal==='failed'?'failed':'draft','cancelled authored work becomes a draft rather than a permanent job row');
 await journey.activate(row.locator('[data-notification-open]'));
 assert.equal(await arcade.isVisible(),false,'opening the original notification unmounts Mining');await assertScrollRestored(journey);
 assert.equal(await page.locator('#page-studio').isVisible(),true,'the notification opens the affected project');
 assert.equal(await page.locator('#page-studio-library').isVisible(),false,'recovery leaves My Games');
 assert.equal(await page.locator('#studioConversation').isVisible(),true,'recovery exposes the idea composer on small screens');
 assert.equal(await page.locator('#studioPrompt').isVisible(),true,'the child can revise an idea after a failed or cancelled build');
 assert.equal(await page.evaluate(()=>FG.studio.exportNotebook().active[FG.store.current().id]),journey.project.id,'terminal recovery opens the project that owns this background build');
 assert.equal(counters.previewRequests,0,'failed and cancelled builds never open a preview');
 review.check(device.name,'build-and-art-recovery',{terminal:device.recoveryTerminal,entry:'catalogue-and-original-project-notification',returnedToProject:journey.project.id,artRetries:device.artFailure?1:0,interruptedPolls:counters.interruptedPolls,buildRequests:counters.submitted,previewRequests:counters.previewRequests});
}

async function profileReset(journey,device,review){
 const {page,arcade,project}=journey;
 await journey.activate(arcade.locator('[data-crystal="3"]'));await journey.advance(450);
 await journey.activate(arcade.locator('[data-myj="bank"]'));
 await journey.activate(arcade.locator('[data-crystal="0"]'));
 assert.equal(await journey.score('banked'),3);assert.equal(await journey.score('loose'),1);
 await journey.choose(project.otherOwner);
 assert.equal(await arcade.isVisible(),false,'profile changes close active mini-game');await assertScrollRestored(journey);
 assert.equal(await page.locator('[data-notification-session="'+project.id+'"]').count(),0,'other profiles cannot see the previous child’s build');
 await journey.advance(20000);
 assert.equal(journey.counters.previewRequests,0);
 await journey.choose(project.owner);
 await journey.launch.click();await journey.advance(50);
 assert.equal(await journey.score('banked'),0);assert.equal(await journey.score('loose'),0,'profile re-entry starts a fresh mining session');
 assert.equal(await arcade.getAttribute('data-phase'),'mining');
 await journey.activate(arcade.locator('[data-crystal="0"]'));assert.equal(await journey.score('loose'),1,'profile re-entry is still interactive');
 journey.state.status='ready';
 await journey.ready();
 const notification=await journey.notification();
 const staleAction=await notification.locator('[data-notification-open]').elementHandle();
 const before=await page.evaluate(id=>{
  const session=FG.studio.exportNotebook().sessions.find(item=>item.id===id);
  return {projectId:session.projectId,remoteId:session.remoteId,selectedTest:session.selectedTest};
 },project.id);
 await journey.choose(project.otherOwner);
 assert.equal(await arcade.isVisible(),false);await assertScrollRestored(journey);
 // A delayed/programmatic activation of the old ready element must be inert.
 await staleAction.evaluate(button=>button.click());await journey.advance(1000);
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
  for(const index of [0,3,1,2]){await journey.activate(arcade.locator('[data-crystal="'+index+'"]'));await page.waitForTimeout(650);}
  await journey.activate(arcade.locator('[data-myj="bank"]'));await page.waitForTimeout(1000);
  await journey.activate(arcade.locator('[data-crystal="3"]'));
  await journey.phase('warning');await page.waitForTimeout(500);await journey.activate(arcade.locator('[data-myj="grab"]'));
  await journey.phase('shaking');await journey.phase('mining');journey.state.status='ready';
  await journey.ready();await page.waitForTimeout(1800);
  const video=page.video();await journey.finish();const filename='mind-your-jems-gameplay.webm';
  await video.saveAs(path.join(review.directory,filename));
  review.manifest.video={file:filename,viewport:device.viewport,motion:'normal',source:'real browser with mocked build statuses'};
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
  for(const device of selected){
   review.manifest.viewports.push(device);let journey;
   try{
    journey=await createJourney(browser,base,device);
    if(process.env.MYJ_LAYOUT_ONLY==='1'){await geometry(journey,device,review);await review.capture(journey.page,journey.arcade,device.name,'idle');}
    else if(device.existingRemote)await existingRemoteHandoff(journey,review);
    else if(device.recoveryTerminal)await recovery(journey,device,review);
    else if(device.profileReset)await profileReset(journey,device,review);
    else await exercise(journey,device,review);
    await journey.finish();
   }catch(error){
    review.manifest.errors.push(device.name+': '+(error.stack||String(error)));
    console.error('FAIL '+device.name+': '+(error.stack||error));
    if(journey){
     await journey.page.screenshot({path:path.join(review.directory,device.name+'-failure.png'),animations:'disabled'}).catch(()=>{});
     await journey.context.close();
    }
    continue;
   }
   console.log('PASS '+device.name+': '+(process.env.MYJ_LAYOUT_ONLY==='1'?'layout and loaded artwork':device.existingRemote?'existing generated-project handoff':device.recoveryTerminal?'failure, recovery, continued play and exit':device.profileReset?'profile teardown, reset and stale callback isolation':'art, layout, native input, bank, warning, hold, shake, reset, ready and playable handoff'));
  }
  if(process.env.MYJ_CAPTURE_VIDEO==='1')await recordGameplay(browser,base,review);
 }catch(error){if(review)review.manifest.errors.push(error.stack||String(error));throw error;}
 finally{
  try{if(review)await review.finish();}
  finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});

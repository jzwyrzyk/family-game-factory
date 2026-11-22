/* Production-dist Notifications journeys. Saved records and every remote
 * response below are explicit fixtures. No live provider, recording or build.
 */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {once}=require('node:events');
const {start}=require('./browser-server.cjs');
const {exploreWelcome,navigate,openProfiles}=require('./studio-entry.cjs');
const {assertTextContrast}=require('./helpers/text-contrast.cjs');

const KEY='family-game-factory-studio-v1';
const API='https://notifications-api.test';
const PREVIEW='https://notifications-preview.test';
const SAVED_REPLY='Your moon picnic idea is saved. What should the penguin do next?';
const AT='2026-11-21T12:00:00.000Z';
function session(id,name,extra={}){
 return {id,owner:'player1',name,game:'new',projectId:null,remoteId:null,candidate:null,
  draft:'',messages:[],job:null,updated:AT,hypothesis:'',reflection:false,experiments:[],selectedTest:null,...extra};
}
function experiment(id,revision){
 const candidate={id,baseId:null,remoteId:revision,prompt:'A penguin delivers a picnic.',summary:'Fixture saved preview'};
 return {id,label:'Test A',title:'Penguin picnic',baseId:null,parents:[],candidate,depth:'redesign',origin:'child',prediction:'',notes:'',createdAt:AT};
}
function fixtureNotebook(){
 return {version:1,active:{player1:'notice-draft',player2:'sibling-draft'},avatars:{player1:'spark',player2:'nova'},sessions:[
  session('notice-ready','Ready penguin picnic',{
   job:{id:'notice-ready-job',api:API,status:'ready',revisionId:'notice-ready-revision'},
   experiments:[experiment('notice-ready-test','notice-ready-revision')],
   // An old Home dismissal must not hide a genuinely ready result.
   resumeDismissed:true,
  }),
  session('notice-failed','Moon lantern idea',{
   draft:'My lantern floats over the moon.',job:{id:'notice-failed-job',api:API,status:'failed'},
  }),
  session('notice-unknown','Unconfirmed kite game',{
   draft:'The kite collects little stars.',job:{id:'notice-unknown-job',api:API,status:'building'},
  }),
  session('notice-building','Building a garden game',{
   draft:'A seed grows when I water it.',job:{id:'notice-building-job',api:API,status:'building'},
  }),
  session('notice-experiment','A separate saved experiment',{
   candidate:experiment('notice-experiment-test','notice-experiment-revision').candidate,
   experiments:[experiment('notice-experiment-test','notice-experiment-revision')],selectedTest:'notice-experiment-test',
  }),
  session('notice-draft','Moon picnic conversation',{
   draft:'The penguin carries a picnic basket.',messages:[
    {id:'notice-child-message',role:'child',text:'I want to make a penguin picnic game.',at:AT},
    {id:'notice-helper-message',role:'helper',text:SAVED_REPLY,at:AT},
   ],
  }),
  session('sibling-draft','Sibling private garden',{owner:'player2',draft:'Only the other player sees this garden.'}),
 ]};
}
const current=page=>page.evaluate(()=>{
 const notebook=FG.studio.exportNotebook(),owner=FG.store.current().id;
 return notebook.sessions.find(item=>item.owner===owner&&item.id===notebook.active[owner]);
});
const item=(page,id)=>page.locator(`#studioNotificationsList [data-notification-session="${id}"]`);
async function waitBadge(page,count){
 await page.waitForFunction(expected=>{
  const badges=[...document.querySelectorAll('[data-notification-badge]')];
  return badges.length>0&&badges.every(node=>Number(node.textContent.trim()||0)===expected);
 },count);
}
async function openCenter(page,entry='menu'){
 if(entry==='home')await page.locator('#studioNotificationsHome').click();
 else if(entry==='play'){
  if(!await page.locator('#studioMore').evaluate(node=>node.open))await page.locator('#studioMore > summary').click();
  await page.locator('#studioPlayNotifications').click();
 }else await navigate(page,'#studioNavNotifications');
 await page.locator('#studioNotifications').waitFor({state:'visible'});
}
async function fits(page,locator,label){
 await locator.scrollIntoViewIfNeeded();
 const box=await locator.evaluate(node=>{
  const rect=node.getBoundingClientRect(),style=getComputedStyle(node);
  const target=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);
  return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,height:rect.height,
   font:parseFloat(style.fontSize),width:innerWidth,viewportHeight:innerHeight,
   hit:target===node||node.contains(target),clipped:node.scrollWidth>node.clientWidth+1};
 });
 assert.ok(box.left>=0&&box.right<=box.width+1&&box.top>=0&&box.bottom<=box.viewportHeight+1,
  `${label} stays inside the screen: ${JSON.stringify(box)}`);
 assert.ok(box.height>=48&&box.font>=18,`${label} retains child text and touch size: ${JSON.stringify(box)}`);
 assert.equal(box.clipped,false,`${label} has no horizontal text clipping`);
 assert.equal(box.hit,true,`${label} is not covered by another control`);
}
async function capture(page,device,name){
 // Keep touch emulation intact throughout the active phone journey; terminal
 // failure captures may include the full document after assertions stop.
 const touch=()=>page.evaluate(()=>navigator.maxTouchPoints>0&&matchMedia('(pointer:coarse)').matches);
 if(device==='small-phone')assert.equal(await touch(),true,'phone input emulation remains active');
 await page.screenshot({path:`test-results/notifications-${name}-${device}.png`,fullPage:false});
 if(device==='small-phone')assert.equal(await touch(),true,'capture preserves phone input emulation');
}

async function recoveryGuards(browser,url){
 const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
 const page=await context.newPage(),errors=[],mutations=[],foreignRequests=[];
 const foreignAPI='https://older-notifications-workshop.test';
 const notebook={version:1,active:{player1:'notice-stop-target'},avatars:{player1:'spark'},sessions:[
  session('notice-foreign','An idea from the other workshop',{
   draft:'Keep my saved comet idea.',job:{id:'notice-foreign-job',api:foreignAPI,status:'building'},
  }),
  session('notice-stop','A garden build I can stop',{
   draft:'My garden has a purple gate.',job:{id:'notice-stop-job',api:API,status:'building'},
  }),
  session('notice-stop-target','My next picnic idea',{draft:'The picnic is under a willow tree.'}),
 ]};
 let releaseCancel;
 const cancelGate=new Promise(resolve=>{releaseCancel=resolve;});
 const headers={'Access-Control-Allow-Origin':new URL(url).origin,'Access-Control-Allow-Credentials':'true',
  'Access-Control-Allow-Headers':'Content-Type, X-Factory-Request','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
 page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(({key,notebook})=>localStorage.setItem(key,JSON.stringify(notebook)),{key:KEY,notebook});
 await page.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',
  body:JSON.stringify({version:1,mode:'remote',apiBaseUrl:API,previewOrigin:PREVIEW})}));
 await page.route(foreignAPI+'/**',route=>{
  foreignRequests.push(route.request().url());
  return route.fulfill({status:503,headers,contentType:'application/json',body:JSON.stringify({errorCode:'WRONG_WORKSHOP'})});
 });
 await page.route(API+'/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  const reply=(body,status=200)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(body)});
  if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(request.method()!=='GET')mutations.push(path);
  if(path==='/v1/sessions/status')return reply({connected:true,trusted:true,expiresAt:Date.now()+3600000});
  if(path==='/v1/jobs/notice-stop-job/cancel'&&request.method()==='POST'){
   await cancelGate;return reply({jobId:'notice-stop-job',status:'cancelled',adapter:'mock'});
  }
  if(request.method()!=='GET')return reply({errorCode:'UNEXPECTED_NOTIFICATION_MUTATION'},503);
  if(path==='/v1/jobs/notice-stop-job')return reply({jobId:'notice-stop-job',status:'building',adapter:'mock'});
  return reply({available:false,mode:'unavailable'});
 });
 try{
  await page.goto(url);await page.waitForFunction(()=>FG.studio?.mode()==='remote');await exploreWelcome(page);
  await openCenter(page);
  assert.equal(await item(page,'notice-foreign').getAttribute('data-notification-kind'),'unknown');
  const foreignBefore=(await page.evaluate(()=>FG.studio.exportNotebook())).sessions.find(s=>s.id==='notice-foreign');
  await item(page,'notice-foreign').locator('.studio-stop-build').click();
  await page.waitForFunction(()=>document.getElementById('studioGlobalStatus')?.textContent.includes('Reconnect this game’s workshop before stopping its build'));
  assert.deepEqual(mutations,[],'a different saved workshop cannot authorize cancel against the current workshop');
  assert.deepEqual(foreignRequests,[],'the disconnected saved workshop is not contacted automatically');
  assert.deepEqual((await page.evaluate(()=>FG.studio.exportNotebook())).sessions.find(s=>s.id==='notice-foreign'),foreignBefore,
   'a refused stop leaves the foreign job and the child’s saved words intact');
  assert.equal(await item(page,'notice-foreign').getAttribute('data-notification-kind'),'unknown');

  // A real Stop click authorizes one cancel, but its delayed result belongs to
  // this notification view. A later project must never receive the old status.
  const request=page.waitForRequest(req=>req.method()==='POST'&&req.url()===API+'/v1/jobs/notice-stop-job/cancel');
  await item(page,'notice-stop').locator('.studio-stop-build').click();await request;
  await item(page,'notice-stop-target').locator('[data-notification-open]').click();
  await page.locator('#studioPrompt').waitFor({state:'visible'});
  assert.equal((await current(page)).id,'notice-stop-target');
  const targetBefore=await current(page);
  await page.evaluate(()=>{
   const target=document.getElementById('studioStatus');window.__notificationLateStatuses=[];
   const observer=new MutationObserver(()=>window.__notificationLateStatuses.push(target.textContent));
   observer.observe(target,{childList:true,characterData:true,subtree:true});
  });
  releaseCancel();
  await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.find(s=>s.id==='notice-stop')?.job?.status==='cancelled');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.deepEqual(await current(page),targetBefore,'late cancellation leaves the newly opened project unchanged');
  assert.equal(await page.locator('#studioNotifications').isVisible(),false,'late cancellation does not navigate back');
  assert.doesNotMatch(await page.locator('#studioStatus').textContent(),/Build stopped|Stop requested|Could not confirm stop|Build cancelled/);
  assert.equal(await page.evaluate(()=>window.__notificationLateStatuses.some(text=>/Build stopped|Stop requested|Could not confirm stop|Build cancelled/.test(text))),false,
   'even a temporary status overwrite from the old job is forbidden');
  await openCenter(page);
  assert.equal(await item(page,'notice-foreign').getAttribute('data-notification-kind'),'unknown');
  assert.equal(await item(page,'notice-stop').getAttribute('data-notification-kind'),'draft','the confirmed stop keeps the saved idea recoverable');
  assert.deepEqual(mutations,['/v1/jobs/notice-stop-job/cancel'],'only the explicit same-workshop Stop sends one cancel');
  assert.deepEqual(foreignRequests,[]);assert.deepEqual(errors,[]);
  console.log('PASS Notifications recovery guards: foreign-workshop Stop makes no request; a delayed authorized cancel preserves the later project and its status');
 }catch(error){await page.screenshot({path:'test-results/notifications-recovery-guards-failure.png',fullPage:true}).catch(()=>{});throw error;}
 finally{releaseCancel();await context.close();}
}

async function journey(browser,url,device,viewport){
 const context=await browser.newContext({viewport,hasTouch:device==='small-phone',isMobile:device==='small-phone',reducedMotion:'reduce'});
 const page=await context.newPage(),errors=[],mutations=[],reads=[],narration=[];
 page.setDefaultTimeout(12000);
 page.on('pageerror',error=>errors.push(error.message));
 let buildPhase='building',natural=true,previewRequests=0;
 const headers={'Access-Control-Allow-Origin':new URL(url).origin,'Access-Control-Allow-Credentials':'true',
  'Access-Control-Allow-Headers':'Content-Type, X-Factory-Request','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
 await page.addInitScript(({key,notebook})=>{
  if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(notebook));
  window.__noticeAudio=[];window.__noticeRevoked=[];window.__noticeSpoken=[];window.__noticeSpeaking=false;
  const revoke=URL.revokeObjectURL.bind(URL);
  URL.revokeObjectURL=url=>{window.__noticeRevoked.push(url);revoke(url);};
  window.Audio=class {
   preload='';src='';onplaying=null;onended=null;onerror=null;plays=0;paused=false;
   constructor(){window.__noticeAudio.push(this);}
   async play(){this.plays++;if(this.plays===1)throw new DOMException('Fixture requires another tap','NotAllowedError');}
   pause(){this.paused=true;}
   removeAttribute(){this.src='';}
  };
  window.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
  class Speech extends EventTarget {
   getVoices(){return [{name:'Samantha (Enhanced)',voiceURI:'Samantha',lang:'en-US',localService:true,default:false}];}
   speak(utterance){window.__noticeSpoken.push(utterance.text);window.__noticeSpeaking=true;utterance.onstart?.();}
   cancel(){window.__noticeSpeaking=false;}
  }
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:new Speech()});
 },{key:KEY,notebook:fixtureNotebook()});
 await page.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',
  body:JSON.stringify({version:1,mode:'remote',apiBaseUrl:API,previewOrigin:PREVIEW})}));
 await page.route(API+'/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  const reply=(body,status=200)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(body)});
  if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(request.method()==='GET')reads.push(path);
  if(path==='/v1/sessions/status')return reply({connected:true,trusted:true,expiresAt:Date.now()+3600000});
  if(path==='/v1/coach/narration/status')return reply({available:natural,mode:natural?'natural':'unavailable'});
  if(path==='/v1/coach/narration'&&request.method()==='POST'){
   narration.push(request.postDataJSON());const audio=Buffer.alloc(128);audio.write('ID3');
   return route.fulfill({headers,contentType:'audio/mpeg',body:audio});
  }
  if(request.method()!=='GET'){
   mutations.push(path);return reply({errorCode:'UNEXPECTED_NOTIFICATION_MUTATION'},503);
  }
  if(path==='/v1/jobs/notice-unknown-job')return reply({errorCode:'STATUS_UNAVAILABLE'},503);
  if(path==='/v1/jobs/notice-building-job')return reply({jobId:'notice-building-job',status:buildPhase,phase:buildPhase,adapter:'mock',
   ...(buildPhase==='ready'?{revisionId:'notice-building-revision'}:{})});
  if(path==='/v1/jobs/notice-failed-job')return reply({jobId:'notice-failed-job',status:'failed',adapter:'mock'});
  if(path.endsWith('/preview')){previewRequests++;return reply({errorCode:'NOTIFICATION_PREVIEW_FIXTURE_UNAVAILABLE'},503);}
  return reply({available:false,mode:'unavailable'});
 });
 try{
  await page.goto(url);await page.waitForFunction(()=>FG.studio?.mode()==='remote');await exploreWelcome(page);
  await waitBadge(page,3);
  assert.equal(await page.locator('#studioBuildShelf').count(),0,'the blue build shelf is not duplicated anywhere');
  assert.equal(await page.locator('#studioContinue .studio-continue').count(),1,'Home has one continuation card');
  assert.equal(await page.locator('#studioNotifications').isVisible(),false,'saved work does not open a notification page automatically');
  assert.equal(previewRequests,0);assert.equal(narration.length,0);assert.deepEqual(mutations,[]);
  await fits(page,page.locator('#studioNotificationsHome'),'Home Notifications action');
  await assertTextContrast(page,'#studioContinue .studio-continue-copy > *, #studioContinue .studio-continue-actions button',`${device} Home continuation copy and actions`);
  await assertTextContrast(page,'[data-notification-badge]',`${device} unread badge`);
  await capture(page,device,'home');
  const readyBeforeDismiss=(await page.evaluate(()=>FG.studio.exportNotebook())).sessions.find(s=>s.id==='notice-ready');
  await page.locator('#studioDismissResume').click();await waitBadge(page,2);
  assert.deepEqual((await page.evaluate(()=>FG.studio.exportNotebook())).sessions.find(s=>s.id==='notice-ready'),readyBeforeDismiss,
   'dismissing Home changes its presentation preference, not the saved job, words or result');
  assert.doesNotMatch(await page.locator('#studioContinue').textContent(),/Ready penguin picnic/,
   'the dismissed recommendation leaves the sole Home card');
  await openCenter(page,'home');await waitBadge(page,0);
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'studioNotificationsTitle','opening Notifications focuses its heading');
  const kinds=await page.locator('#studioNotificationsList [data-notification-session]').evaluateAll(nodes=>
   Object.fromEntries(nodes.map(node=>[node.dataset.notificationSession,node.dataset.notificationKind])));
  assert.deepEqual(kinds,{'notice-ready':'ready','notice-failed':'failed','notice-unknown':'unknown',
   'notice-building':'building','notice-experiment':'experiment','notice-draft':'draft'},'all six pending projects remain reachable, including entries beyond the old four-item shelf');
  assert.doesNotMatch(await page.locator('#studioNotificationsList').textContent(),/Sibling private garden|Only the other player/);
  assert.equal((await page.evaluate(()=>FG.studio.exportNotebook())).sessions.find(s=>s.id==='notice-ready').selectedTest,null,
   'acknowledging a notification never selects or keeps a result');
  for(const id of Object.keys(kinds))await fits(page,item(page,id).locator('[data-notification-open]'),id+' action');
  await assertTextContrast(page,'#studioNotifications :is(h1,h2,p,button)',`${device} Notifications copy and actions`);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Notifications has no horizontal page overflow');
  await page.locator('#studioNotificationsTitle').scrollIntoViewIfNeeded();
  await capture(page,device,'list');

  // A shared reader must retain mobile Play state and reuse the downloaded
  // audio. Notifications are not a route that silently synthesizes all cards.
  const readReady=item(page,'notice-ready').locator('[data-action="read-aloud"]');
  await fits(page,readReady,'Notification reading action');await readReady.click();
  await readReady.filter({hasText:'Play reading'}).waitFor({state:'visible'});
  await assertTextContrast(page,'#studioNotifications .jems-reading-notice',`${device} pending playback guidance`);
  assert.equal(narration.length,1);assert.ok(narration[0].text.includes('Ready penguin picnic'));
  await readReady.click();assert.equal(narration.length,1,'Play reuses the same transient audio');
  await page.evaluate(()=>window.__noticeAudio[0].onplaying());
  assert.match(await readReady.textContent(),/Stop reading/);
  await page.locator('#studioNotificationsBack').click();
  await page.locator('#page-studio-library').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>window.__noticeAudio[0].paused&&window.__noticeAudio[0].src===''),true,
   'Back cancels and releases notification narration');
  await waitBadge(page,0);

  // The Menu action supports ordinary keyboard activation and acknowledgement
  // retains unresolved work instead of making it disappear.
  await page.locator('#studioNavMenu').focus();await page.keyboard.press('Enter');
  await page.locator('#studioNavNotifications').focus();await page.keyboard.press('Enter');
  await page.locator('#studioNotifications').waitFor({state:'visible'});
  assert.equal(await page.locator('#studioNotificationsList [data-notification-session]').count(),6);
  const readDraft=item(page,'notice-draft').locator('[data-action="read-aloud"]');
  await readDraft.click();await readDraft.filter({hasText:'Play reading'}).waitFor({state:'visible'});
  assert.equal(narration.length,2);
  await page.evaluate(()=>{window.__staleNotificationStart=window.__noticeAudio[1].onplaying;});
  await openProfiles(page);await page.locator('.profile-choice').nth(1).click();
  await page.waitForFunction(()=>FG.store.current().id==='player2');
  await page.evaluate(()=>window.__staleNotificationStart());
  assert.equal(await page.evaluate(()=>window.__noticeAudio[1].paused&&window.__noticeAudio[1].src===''),true,
   'pending audio cannot continue into the sibling profile');
  await openCenter(page);await waitBadge(page,0);
  assert.deepEqual(await page.locator('#studioNotificationsList [data-notification-session]').evaluateAll(nodes=>nodes.map(node=>node.dataset.notificationSession)),['sibling-draft']);
  assert.doesNotMatch(await page.locator('#studioNotificationsList').textContent(),/penguin picnic|Moon lantern|Unconfirmed kite|A separate saved experiment/i);
  await openProfiles(page);await page.locator('.profile-choice').nth(0).click();
  await page.waitForFunction(()=>FG.store.current().id==='player1');await waitBadge(page,0);

  // Recovery actions open the exact saved project. Neither a failed status nor
  // an uncertain GET authorizes an automatic retry or another paid build.
  for(const id of ['notice-failed','notice-unknown']){
   await openCenter(page);await item(page,id).locator('[data-notification-open]').click();
   await page.locator('#studioPrompt').waitFor({state:'visible'});
   assert.equal((await current(page)).id,id);assert.deepEqual(mutations,[]);
   assert.equal((await current(page)).job.id,id==='notice-failed'?'notice-failed-job':'notice-unknown-job');
   await navigate(page,'#studioNavHome');
  }
  assert.ok(reads.includes('/v1/jobs/notice-unknown-job'),'unknown status comes from a real failed fixture status read');
  await openCenter(page);await item(page,'notice-ready').locator('[data-notification-open]').click();
  await page.waitForFunction(()=>document.getElementById('studioStatus')?.textContent.includes('NOTIFICATION_PREVIEW_FIXTURE_UNAVAILABLE'));
  assert.equal((await current(page)).id,'notice-ready');assert.equal(previewRequests,1,'only explicit ready activation asks for its preview');
  assert.equal(await page.locator('#studioRemoteHost iframe').count(),0,'a failed preview is not represented as playable');
  assert.equal((await current(page)).selectedTest,null);assert.equal((await current(page)).remoteId,null);
  await navigate(page,'#studioNavHome');

  // Reopening saved chat retains both reading entries and actual words.
  await openCenter(page);await item(page,'notice-draft').locator('[data-notification-open]').click();
  await page.locator('#studioPrompt').waitFor({state:'visible'});
  assert.equal(await page.locator('#studioPrompt').inputValue(),'The penguin carries a picnic basket.');
  assert.equal(await page.locator('#studioHear').isVisible(),true);
  natural=false;
  await page.locator('[data-message="notice-helper-message"] [data-action="read-aloud"]').click();
  await page.waitForFunction(()=>window.__noticeSpoken.at(-1)==='Your moon picnic idea is saved. What should the penguin do next?');
  assert.equal(await page.evaluate(()=>window.__noticeSpeaking),true);
  assert.equal(narration.length,2,'device fallback does not synthesize another paid reading');
  // A failed departure keeps the unsaved thought visible at its source.
  await page.evaluate(key=>{
   const original=Storage.prototype.setItem;window.__notificationRestoreStorage=()=>{Storage.prototype.setItem=original;};
   Storage.prototype.setItem=function(name,value){if(name===key)throw new DOMException('Fixture quota','QuotaExceededError');return original.call(this,name,value);};
  },KEY);
  const changed='The penguin carries my new unsaved picnic basket.';
  await page.locator('#studioPrompt').fill(changed);
  await navigate(page,'#studioNavNotifications');
  assert.equal(await page.locator('#studioNotifications').isVisible(),false,'save failure prevents leaving the conversation');
  assert.equal(await page.locator('#studioPrompt').inputValue(),changed);
  assert.match(await page.locator('#studioDraftStatus').textContent(),/Could not save/);
  assert.equal(await page.locator('#studioDraftStatus').isVisible(),true,'save recovery stays beside the child interaction');
  await page.evaluate(()=>window.__notificationRestoreStorage());
  await openCenter(page);
  assert.equal(await page.evaluate(()=>window.__noticeSpeaking),false,'navigation stops the saved-message device reading');
  assert.equal((await page.evaluate(()=>FG.studio.exportNotebook())).sessions.find(s=>s.id==='notice-draft').draft,changed);
  await page.locator('#studioNotificationsBack').click();

  // Read-only background completion produces a new badge while another game
  // stays in its fitted player. The ready action remains an explicit choice.
  await page.evaluate(()=>{FG.store.changeProfile({rate:1});FG.store.current().mathWindow=[Date.now()];if(!FG.store.save())throw Error('Could not save fixture pacing');});
  await page.locator('[data-starter="factory"]').click();
  await page.locator('#page-studio.studio-play-mode').waitFor({state:'visible'});
  const playing=(await current(page)).id;
  buildPhase='ready';
  await page.waitForFunction(()=>FG.studio.exportNotebook().sessions.find(s=>s.id==='notice-building')?.job?.status==='ready');
  await waitBadge(page,1);
  assert.equal((await current(page)).id,playing,'readiness does not replace the current game');
  assert.equal(await page.locator('#page-studio.studio-play-mode').isVisible(),true);
  assert.equal(await page.locator('#studioNotifications').isVisible(),false);
  assert.equal(previewRequests,1);assert.equal(narration.length,2);assert.deepEqual(mutations,[]);
  if(!await page.locator('#studioMore').evaluate(node=>node.open))await page.locator('#studioMore > summary').click();
  await fits(page,page.locator('#studioPlayNotifications'),'Playing Notifications action');
  await capture(page,device,'playing');
  await openCenter(page,'play');await waitBadge(page,0);
  assert.equal(await item(page,'notice-building').getAttribute('data-notification-kind'),'ready');
  assert.equal(previewRequests,1,'opening the center never opens a background preview');
  await page.locator('#studioNotificationsBack').click();
  await page.reload();await page.waitForFunction(()=>FG.studio?.mode()==='remote');await waitBadge(page,0);
  assert.equal(await page.locator('#studioBuildShelf').count(),0);
  assert.equal(await page.locator('#studioContinue .studio-continue').count(),1);
  await openCenter(page);
  assert.equal(await item(page,'notice-building').count(),1,'acknowledged ready work survives reload');
  assert.equal((await page.evaluate(()=>FG.studio.exportNotebook())).sessions.find(s=>s.id==='notice-draft').draft,changed);
  assert.equal(previewRequests,1);assert.equal(narration.length,2);assert.deepEqual(mutations,[]);assert.deepEqual(errors,[]);
  console.log(`PASS Notifications ${device}: single Home card, complete owner-scoped list, actionable badge/ack transitions, explicit recovery, saved-chat reading, mobile Play reuse, save guard and play/reload continuity`);
 }catch(error){await page.screenshot({path:`test-results/notifications-${device}-failure.png`,fullPage:true}).catch(()=>{});throw error;}
 finally{await context.close();}
}

(async()=>{
 const server=start();if(!server.listening)await once(server,'listening');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']})
  .catch(async error=>{await new Promise(resolve=>server.close(resolve));throw error;});
 fs.mkdirSync('test-results',{recursive:true});
 try{
  const url=`http://127.0.0.1:${server.address().port}/arcade/`;
  await recoveryGuards(browser,url);
  for(const [device,viewport]of[['desktop',{width:1280,height:900}],['small-phone',{width:320,height:667}]])
   await journey(browser,url,device,viewport);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});

const {exploreWelcome}=require('./studio-entry.cjs');
/* Production frontend integration, explicit API fixtures; no paid provider.
 * The server's real cookie/passphrase/permit tests are separate. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const {start}=require('./browser-server.cjs');
const PROFILE='adult:12345678-1234-4123-8123-123456789abc',TOKEN='a'.repeat(43),PASSPHRASE='a long adult passphrase';
const until=async(predicate)=>{const end=Date.now()+10000;while(!predicate()){if(Date.now()>end)throw Error('Timed out waiting for fixture request');await new Promise(resolve=>setTimeout(resolve,10));}};
const reply={move:'listen',text:'Your adult test idea is ready to explore.',question:'What should happen next?',suggestions:[],proposedChange:null,planSuggestions:[],childDecisions:[],evidenceIds:[],creationReadiness:{ready:false,evidence:{action:'',consequence:'',experience:'',world:'',goal:'',visualStyle:'',mood:''},unresolved:['The player action and its consequence need clarification.']}};
(async()=>{
 const server=start(),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 try{
  for(const [device,viewport] of [['desktop',{width:1400,height:1000}],['mobile',{width:390,height:844}]]){
   const ctx=await browser.newContext({viewport,hasTouch:device==='mobile',reducedMotion:'reduce'}),errors=[],calls=[];
   let page=await ctx.newPage();
   page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push('Primary tab: '+(error.stack||error.message)));
   let configured=true,connected=true,enabled=true,eligible=true,statusUnavailable=false,builderReady=true,dictationReady=true,coachUnavailable=false;
   let grant=false,holdReply=false,releaseReply,holdUnlock=false,releaseUnlock,holdStatus=false,releaseStatus,ttl=3_600_000;
   await ctx.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(configured?{version:1,mode:'remote',apiBaseUrl:'https://adult-api.test',previewOrigin:'https://adult-preview.test'}:{version:1,mode:'unavailable'})}));
   await ctx.route('https://adult-api.test/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname,proof=req.headers()['x-factory-adult-session'];
    const headers={'access-control-allow-origin':req.headers().origin||'*','access-control-allow-credentials':'true','access-control-allow-headers':'Content-Type,X-Factory-Request,X-Factory-Adult-Session,X-Factory-Audio-Id','access-control-allow-methods':'GET,POST,OPTIONS'};
    const send=(data,status=200)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(data)}).catch(()=>{});
    if(req.method()==='OPTIONS')return send({});
    const active=connected&&enabled&&eligible&&grant&&proof===TOKEN;
    calls.push({path,method:req.method(),proof,body:req.postData()});
    if(path==='/v1/sessions/status'){
     if(statusUnavailable)return send({errorCode:'SERVICE_UNAVAILABLE'},503);
     if(!connected)return send({errorCode:'UNAUTHENTICATED'},401);
     const snapshot={connected:true,trusted:true,deviceName:'Development browser',adultPilot:{enabled,eligible:enabled&&eligible,active,profileId:active?PROFILE:null,expiresAt:active?Date.now()+3_600_000:null}};
     if(holdStatus){holdStatus=false;await new Promise(resolve=>{releaseStatus=resolve;});}
     return send(snapshot);
    }
    if(path==='/v1/sessions/renew')return connected?send({connected:true,trusted:true}):send({errorCode:'UNAUTHENTICATED'},401);
    if(path==='/v1/sessions/adult/unlock'){
     if(holdUnlock)await new Promise(resolve=>{releaseUnlock=resolve;});
     if(JSON.parse(req.postData()).parentPassphrase!==PASSPHRASE)return send({errorCode:'FORBIDDEN'},403);
     grant=true;return send({active:true,profileId:PROFILE,sessionToken:TOKEN,expiresAt:Date.now()+ttl});
    }
    if(path==='/v1/sessions/adult/lock'){if(proof===TOKEN)grant=false;return send({active:false});}
    if(path==='/v1/coach/status')return send({available:active,mode:active?'model':'unavailable'});
    if(path==='/v1/builder/status')return send({available:active&&builderReady});
    if(path==='/v1/coach/audio/status')return send({available:active&&dictationReady,mode:active&&dictationReady?'private':'unavailable'});
    if(path==='/v1/creations')return send([]);
    if(path==='/v1/coach'){
     if(!active)return send({errorCode:'ADULT_PILOT_ACCESS_REQUIRED'},403);
     if(coachUnavailable)return send({errorCode:'COACH_UNAVAILABLE'},503);
     if(holdReply)await new Promise(resolve=>{releaseReply=resolve;});
     return send({mode:'model',reply});
    }
    return send({errorCode:'UNAVAILABLE'},404);
   });
   const url='http://127.0.0.1:'+server.address().port+'/arcade/';
   const capture=async name=>{
    const directory=process.env.JEMS_ADULT_SCREENSHOTS;if(!directory)return;
    fs.mkdirSync(directory,{recursive:true});await page.screenshot({path:directory+'/'+device+'-'+name+'.png'});
   };
   const choose=async locator=>{try{if(!await page.locator('#studioProfileMenu').evaluate(n=>n.open))await page.locator('#studioProfileMenu summary').click();await page.locator(locator).first().click();}catch(error){await capture('profile-blocked');throw error;}};
   const unlock=async()=>{await choose('#adultProfileChoice');await page.fill('#adultProfilePassphrase',PASSPHRASE);await page.click('#adultProfileSubmit');await page.waitForFunction(id=>FG.store.current().id===id,PROFILE);await exploreWelcome(page);};
   await page.goto(url);await page.waitForFunction(()=>window.FG?.studio&&window.FG?.builder);await exploreWelcome(page);await page.waitForSelector('#adultProfileChoice',{state:'attached'});
   await page.click('#studioNavCreate');await page.fill('#studioPrompt','CHILD NOTEBOOK SENTINEL: my private draft');
   await page.waitForFunction(()=>JSON.parse(localStorage.getItem('family-game-factory-studio-v1')).sessions.some(s=>s.draft.includes('CHILD NOTEBOOK SENTINEL')));
   const familyBefore=await page.evaluate(()=>localStorage.getItem('family-game-factory-studio-v1'));
   await choose('#adultProfileChoice');await page.fill('#adultProfilePassphrase','incorrect parent passphrase');await page.click('#adultProfileSubmit');
   await page.waitForFunction(()=>document.getElementById('adultProfileStatus').textContent.includes('Could not switch'));
   assert.equal(await page.evaluate(()=>FG.store.current().id),'player1');assert.equal(await page.locator('#adultProfileBanner').isVisible(),false);
   await page.fill('#adultProfilePassphrase',PASSPHRASE);await page.click('#adultProfileSubmit');await page.waitForFunction(id=>FG.store.current().id===id,PROFILE);
   await page.waitForFunction(()=>document.getElementById('adultProfileTools').textContent.includes('AI conversation: available'));await exploreWelcome(page);
   assert.equal(await page.locator('#adultProfileDialog').isVisible(),false,'profile switch itself unlocks tools');
   assert.equal(await page.locator('#adultProfileBanner').isVisible(),true);
   assert.equal(await page.evaluate(()=>FG.studio.exportNotebook().sessions.length),0,'adult starts with a separate notebook');
   assert.equal(await page.evaluate(()=>localStorage.getItem('family-game-factory-studio-v1')),familyBefore);
   builderReady=false;dictationReady=false;
   await page.evaluate(()=>window.dispatchEvent(new Event('factory-open-parent-session')));
   await page.waitForFunction(()=>document.getElementById('adultBuildingState').textContent==='unavailable');
   assert.equal(await page.textContent('#adultConversationState'),'available','a healthy status endpoint establishes availability, not a successful conversation');
   assert.equal(await page.textContent('#adultDictationState'),'unavailable');
   await capture('active');
   await page.click('#adultProfileCancel');builderReady=true;dictationReady=true;
   const second=await ctx.newPage();second.setDefaultTimeout(10000);second.on('pageerror',error=>errors.push('Second tab: '+(error.stack||error.message)));
   await second.goto(url);await second.locator('#jemsWriterNotice').waitFor({state:'visible'});
   assert.equal(await second.evaluate(()=>Boolean(window.FG?.studio||window.FG?.builder)),false,'a second tab pauses before installing writable workspaces');
   assert.equal(await second.locator('main').evaluate(element=>Boolean(element.closest('[inert]'))),true);
   assert.equal(await second.evaluate(()=>FG.store.current().id),'player1','another tab does not inherit an adult profile');
   assert.equal(await second.locator('#adultProfileBanner').isVisible(),false);
   coachUnavailable=true;
   await page.click('#studioNavCreate');await page.fill('#studioPrompt','An adult test game with floating islands');await page.click('#studioTalk');
   await page.waitForFunction(()=>document.getElementById('adultConversationState').textContent==='needs reconnect');
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('factory-coach-connection',{detail:{ownerId:'player1',state:'connected'}})));
   assert.equal(await page.textContent('#adultConversationState'),'needs reconnect','another owner cannot overwrite the active conversation result');
   await page.evaluate(()=>window.dispatchEvent(new Event('factory-open-parent-session')));
   await page.waitForFunction(()=>document.getElementById('adultBuildingState').textContent==='ready');
   assert.equal(await page.textContent('#adultConversationState'),'needs reconnect','a healthy service recheck must not hide an actual conversation failure');
   await page.click('#adultProfileCancel');coachUnavailable=false;
   await page.click('#studioCheckIdea');
   await page.waitForFunction(()=>document.getElementById('coachModeStatus').textContent.includes('Connected AI coach'));
   assert.equal(await page.textContent('#adultConversationState'),'connected','only an actual validated model response establishes a connection');
   const sent=calls.filter(c=>c.path==='/v1/coach'&&c.method==='POST').at(-1);
   assert.equal(sent.proof,TOKEN);assert.doesNotMatch(sent.body,/CHILD NOTEBOOK SENTINEL/);
   assert.equal(await page.evaluate(token=>Object.values(localStorage).some(value=>value.includes(token)),TOKEN),false,'proof is never persisted');
   const locksBefore=calls.filter(c=>c.path==='/v1/sessions/adult/lock').length;
   await page.evaluate(()=>{window.__cancelProfileSwitch=event=>event.preventDefault();window.addEventListener('factory-profile-before-change',window.__cancelProfileSwitch);});
   await choose('.profile-choice:not(#adultProfileChoice)');
   assert.equal(await page.evaluate(()=>FG.store.current().id),PROFILE,'a cancelled profile switch keeps the adult workspace');
   assert.equal(calls.filter(c=>c.path==='/v1/sessions/adult/lock').length,locksBefore,'cancelled switching must not revoke current access');
   await page.evaluate(()=>window.removeEventListener('factory-profile-before-change',window.__cancelProfileSwitch));
   holdReply=true;await page.fill('#studioPrompt','A delayed adult test idea');await page.click('#studioTalk');
   await page.waitForFunction(()=>document.getElementById('coachModeStatus').textContent.includes('thinking'));
   await until(()=>releaseReply);
   await choose('.profile-choice:not(#adultProfileChoice)');
   releaseReply();holdReply=false;
   assert.equal(await page.evaluate(()=>FG.store.current().id),'player1');assert.equal(await page.locator('#adultProfileBanner').isVisible(),false);
   assert.equal(await page.locator('#generatedPreview').getAttribute('src'),null,'generated previews are removed on profile change');
   assert.equal(await page.evaluate(()=>localStorage.getItem('family-game-factory-studio-v1')),familyBefore);
   assert.doesNotMatch(await page.textContent('#studioMessages'),/adult test idea/);
   await page.locator('#studioLibrary .studio-saved-open').first().click();assert.match(await page.inputValue('#studioPrompt'),/CHILD NOTEBOOK SENTINEL/);
   await unlock();assert.equal(await page.evaluate(()=>FG.studio.exportNotebook().sessions.length),1,'adult work persists only in its separate workspace');
   await page.waitForFunction(()=>document.getElementById('adultConversationState').textContent==='available');
   assert.equal(await page.textContent('#adultConversationState'),'available','a new unlock does not inherit the previous session’s connection claim');
   // Keep the same browser context and its saved family/adult workspaces. A tab
   // taking over from an authorized adult still needs its own explicit unlock.
   await page.close();
   await Promise.all([second.waitForNavigation({waitUntil:'load'}),second.click('#jemsWriterRetry')]);
   page=second;await page.waitForFunction(()=>window.FG?.studio&&window.FG?.builder);
   await page.waitForSelector('#adultProfileChoice',{state:'attached'});
   assert.equal(await page.evaluate(()=>FG.store.current().id),'player1','resuming the other tab does not inherit adult authorization');
   assert.equal(await page.locator('#adultProfileBanner').isVisible(),false);
   assert.equal(await page.evaluate(()=>localStorage.getItem('family-game-factory-studio-v1')),familyBefore);
   await unlock();assert.equal(await page.evaluate(()=>FG.studio.exportNotebook().sessions.length),1,'explicit authorization reopens only the adult notebook');
   await page.reload();await page.waitForFunction(()=>window.FG?.studio&&window.FG?.builder);
   assert.equal(await page.evaluate(()=>FG.store.current().id),'player1','reload never restores adult authorization');
   assert.equal(await page.locator('#adultProfileBanner').isVisible(),false);
   holdUnlock=true;await choose('#adultProfileChoice');await page.fill('#adultProfilePassphrase',PASSPHRASE);await page.click('#adultProfileSubmit');
   await until(()=>releaseUnlock);
   await page.click('#adultProfileCancel');releaseUnlock();holdUnlock=false;
   await page.waitForFunction(()=>document.getElementById('adultProfileSubmit').disabled===false);
   assert.equal(await page.evaluate(()=>FG.store.current().id),'player1','a cancelled slow unlock cannot activate later');
   ttl=1000;await unlock();
   await page.waitForFunction(()=>FG.store.current().id==='player1');
   assert.equal(await page.locator('#adultProfileBanner').isVisible(),false,'absolute expiry locks the profile without renewal');
   ttl=3_600_000;
   enabled=false;await page.reload();await page.waitForFunction(()=>window.FG?.studio&&window.FG?.builder);
   assert.equal(await page.locator('#adultProfileChoice').count(),0,'disabling the server pilot removes the temporary entry');
   const openSettings=async()=>{
    await page.locator('footer [data-page="parent"]').click();
    await page.click('#parentTab-settings');
    await page.locator('#adultParentSessionOpen').click();
   };
   await openSettings();
   await page.waitForFunction(()=>document.getElementById('adultProfileDialog').dataset.accessState==='disabled');
   assert.match(await page.textContent('#adultProfileStatus'),/connected.*not enabled/);
   assert.equal(await page.locator('#adultProfileSubmit').isVisible(),false,'disabled testing offers no unlock');
   const unlocksBefore=calls.filter(c=>c.path==='/v1/sessions/adult/unlock').length;
   await page.keyboard.press('Escape');
   assert.equal(await page.evaluate(()=>document.activeElement.id),'adultParentSessionOpen','closing returns focus to the persistent entry');
   connected=false;enabled=true;
   await page.locator('#adultParentSessionOpen').click();
   await page.waitForFunction(()=>document.getElementById('adultProfileDialog').dataset.accessState==='disconnected');
   assert.match(await page.textContent('#adultProfileStatus'),/no active family workshop connection/);
   assert.equal(await page.locator('#adultProfileChoice').count(),0);
   await capture('disconnected');
   await page.click('#adultParentConnect');
   await page.waitForFunction(()=>!document.getElementById('adultProfileDialog').open&&document.activeElement.id==='builderConnection');
   assert.equal(await page.locator('#parentPanel-settings').isVisible(),true,'connection action lands in the existing parent settings');
   await page.locator('#adultParentSessionOpen').click();
   await page.waitForFunction(()=>document.getElementById('adultProfileDialog').dataset.accessState==='disconnected');
   connected=true;eligible=false;await page.click('#adultParentRecheck');
   await page.waitForFunction(()=>document.getElementById('adultProfileDialog').dataset.accessState==='approval');
   assert.match(await page.textContent('#adultProfileStatus'),/review or renew/);
   assert.equal(await page.locator('#adultProfilePassphrase').isVisible(),false,'passphrase cannot replace a missing permit');
   statusUnavailable=true;await page.click('#adultParentRecheck');
   await page.waitForFunction(()=>document.getElementById('adultProfileDialog').dataset.accessState==='unavailable');
   assert.match(await page.textContent('#adultProfileStatus'),/access cannot be verified/);
   assert.equal(await page.locator('#adultParentRecheck').isEnabled(),true,'a failed check can be retried');
   statusUnavailable=false;eligible=true;enabled=false;holdStatus=true;await page.click('#adultParentRecheck');
   await until(()=>releaseStatus);
   enabled=true;await page.evaluate(()=>window.dispatchEvent(new Event('factory-session-restored')));
   await page.waitForFunction(()=>document.getElementById('adultProfileDialog').dataset.accessState==='ready');
   await Promise.all([page.waitForResponse(response=>response.url().endsWith('/v1/sessions/status')),Promise.resolve().then(()=>releaseStatus())]);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   assert.equal(await page.locator('#adultProfileDialog').getAttribute('data-access-state'),'ready','a late old status cannot replace newer access information');
   assert.equal(calls.filter(c=>c.path==='/v1/sessions/adult/unlock').length,unlocksBefore,'opening/rechecking unavailable access never submits an unlock');
   assert.equal(calls.some(c=>c.path==='/v1/jobs'),false,'entry and readiness checks never create a game');
   await page.click('#adultProfileCancel');
   configured=false;await page.reload();await page.waitForFunction(()=>window.FG?.studio&&window.FG?.builder);
   await openSettings();
   assert.equal(await page.locator('#adultProfileDialog').getAttribute('data-access-state'),'unconfigured');
   assert.match(await page.textContent('#adultProfileStatus'),/has not been configured/);
   await capture('unconfigured');
   assert.equal(await page.locator('#adultProfileSubmit').isVisible(),false);
   assert.equal(await page.locator('#adultParentCapabilities').isVisible(),false);
   assert.equal(await page.evaluate(()=>FG.store.current().id),'player1');
   assert.equal(await page.evaluate(()=>localStorage.getItem('family-game-factory-studio-v1')),familyBefore,'recovery guidance preserves saved family work');
   assert.equal(errors.length,0,errors.join('\n'));await ctx.close();
  }
  console.log('PASS persistent parent testing entry, connection/configuration/permit guidance, separate tool readiness, stale-status protection, adult unlock and workspace/tab isolation (desktop/mobile; mocked services)');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});

const {exploreWelcome}=require('./studio-entry.cjs');
/* Production frontend integration, explicit API fixtures; no paid provider.
 * The server's real cookie/passphrase/permit tests are separate. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const {start}=require('./browser-server.cjs');
const PROFILE='adult:12345678-1234-4123-8123-123456789abc',TOKEN='a'.repeat(43),PASSPHRASE='a long adult passphrase';
const until=async(predicate)=>{const end=Date.now()+10000;while(!predicate()){if(Date.now()>end)throw Error('Timed out waiting for fixture request');await new Promise(resolve=>setTimeout(resolve,10));}};
const reply={move:'listen',text:'Your adult test idea is ready to explore.',question:'What should happen next?',suggestions:[],proposedChange:null,planSuggestions:[],childDecisions:[],evidenceIds:[]};
(async()=>{
 const server=start(),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(!process.env.CI&&fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 try{
  for(const [device,viewport] of [['desktop',{width:1400,height:1000}],['mobile',{width:390,height:844}]]){
   const ctx=await browser.newContext({viewport,hasTouch:device==='mobile',reducedMotion:'reduce'}),errors=[],calls=[];
   let page=await ctx.newPage();
   page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push('Primary tab: '+(error.stack||error.message)));
   let enabled=true,grant=false,holdReply=false,releaseReply,holdUnlock=false,releaseUnlock,ttl=3_600_000;
   await ctx.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'remote',apiBaseUrl:'https://adult-api.test',previewOrigin:'https://adult-preview.test'})}));
   await ctx.route('https://adult-api.test/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname,proof=req.headers()['x-factory-adult-session'];
    const headers={'access-control-allow-origin':req.headers().origin||'*','access-control-allow-credentials':'true','access-control-allow-headers':'Content-Type,X-Factory-Request,X-Factory-Adult-Session,X-Factory-Audio-Id','access-control-allow-methods':'GET,POST,OPTIONS'};
    const send=(data,status=200)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(data)}).catch(()=>{});
    if(req.method()==='OPTIONS')return send({});
    const active=enabled&&grant&&proof===TOKEN;
    calls.push({path,method:req.method(),proof,body:req.postData()});
    if(path==='/v1/sessions/status')return send({connected:true,trusted:true,deviceName:'Development browser',adultPilot:{enabled,eligible:enabled,active,profileId:active?PROFILE:null,expiresAt:active?Date.now()+3_600_000:null}});
    if(path==='/v1/sessions/adult/unlock'){
     if(holdUnlock)await new Promise(resolve=>{releaseUnlock=resolve;});
     if(JSON.parse(req.postData()).parentPassphrase!==PASSPHRASE)return send({errorCode:'FORBIDDEN'},403);
     grant=true;return send({active:true,profileId:PROFILE,sessionToken:TOKEN,expiresAt:Date.now()+ttl});
    }
    if(path==='/v1/sessions/adult/lock'){if(proof===TOKEN)grant=false;return send({active:false});}
    if(path==='/v1/coach/status')return send({available:active,mode:active?'model':'unavailable'});
    if(path==='/v1/builder/status')return send({available:active});
    if(path==='/v1/coach/audio/status')return send({available:active,mode:active?'private':'unavailable'});
    if(path==='/v1/creations')return send([]);
    if(path==='/v1/coach'){
     if(!active)return send({errorCode:'ADULT_PILOT_ACCESS_REQUIRED'},403);
     if(holdReply)await new Promise(resolve=>{releaseReply=resolve;});
     return send({mode:'model',reply});
    }
    return send({errorCode:'UNAVAILABLE'},404);
   });
   const url='http://127.0.0.1:'+server.address().port+'/arcade/';
   const choose=async locator=>{if(!await page.locator('#studioProfileMenu').evaluate(n=>n.open))await page.locator('#studioProfileMenu summary').click();await page.locator(locator).first().click();};
   const unlock=async()=>{await choose('#adultProfileChoice');await page.fill('#adultProfilePassphrase',PASSPHRASE);await page.click('#adultProfileSubmit');await page.waitForFunction(id=>FG.store.current().id===id,PROFILE);await exploreWelcome(page);};
   await page.goto(url);await page.waitForFunction(()=>window.FG?.studio&&window.FG?.builder);await exploreWelcome(page);await page.waitForSelector('#adultProfileChoice',{state:'attached'});
   await page.click('#studioNavCreate');await page.fill('#studioPrompt','CHILD NOTEBOOK SENTINEL: my private draft');
   await page.waitForFunction(()=>JSON.parse(localStorage.getItem('family-game-factory-studio-v1')).sessions.some(s=>s.draft.includes('CHILD NOTEBOOK SENTINEL')));
   const familyBefore=await page.evaluate(()=>localStorage.getItem('family-game-factory-studio-v1'));
   await choose('#adultProfileChoice');await page.fill('#adultProfilePassphrase','incorrect parent passphrase');await page.click('#adultProfileSubmit');
   await page.waitForFunction(()=>document.getElementById('adultProfileStatus').textContent.includes('Could not switch'));
   assert.equal(await page.evaluate(()=>FG.store.current().id),'player1');assert.equal(await page.locator('#adultProfileBanner').isVisible(),false);
   await page.fill('#adultProfilePassphrase',PASSPHRASE);await page.click('#adultProfileSubmit');await page.waitForFunction(id=>FG.store.current().id===id,PROFILE);
   await page.waitForFunction(()=>document.getElementById('adultProfileTools').textContent.includes('AI conversation: ready'));await exploreWelcome(page);
   assert.equal(await page.locator('#adultProfileDialog').isVisible(),false,'profile switch itself unlocks tools');
   assert.equal(await page.locator('#adultProfileBanner').isVisible(),true);
   assert.equal(await page.evaluate(()=>FG.studio.exportNotebook().sessions.length),0,'adult starts with a separate notebook');
   assert.equal(await page.evaluate(()=>localStorage.getItem('family-game-factory-studio-v1')),familyBefore);
   const second=await ctx.newPage();second.setDefaultTimeout(10000);second.on('pageerror',error=>errors.push('Second tab: '+(error.stack||error.message)));
   await second.goto(url);await second.locator('#jemsWriterNotice').waitFor({state:'visible'});
   assert.equal(await second.evaluate(()=>Boolean(window.FG?.studio||window.FG?.builder)),false,'a second tab pauses before installing writable workspaces');
   assert.equal(await second.locator('main').evaluate(element=>Boolean(element.closest('[inert]'))),true);
   assert.equal(await second.evaluate(()=>FG.store.current().id),'player1','another tab does not inherit an adult profile');
   assert.equal(await second.locator('#adultProfileBanner').isVisible(),false);
   await page.click('#studioNavCreate');await page.fill('#studioPrompt','An adult test game with floating islands');await page.click('#studioTalk');
   await page.waitForFunction(()=>document.getElementById('coachModeStatus').textContent.includes('Connected AI coach'));
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
   assert.equal(errors.length,0,errors.join('\n'));await ctx.close();
  }
  console.log('PASS same-site adult profile unlock, ready AI, separate data, child switch, tab/reload isolation and cancelled unlock (desktop/mobile; mocked services)');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});

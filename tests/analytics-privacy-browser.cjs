/* Real production UI and analytics client, synthetic authenticated API only.
 * Server-side proof/guardian verification is tested separately. No PostHog call. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const {start}=require('./browser-server.cjs');
const PROFILE='adult:12345678-1234-4123-8123-123456789abc',TOKEN='a'.repeat(43);
const CHOICE='12345678-1234-4123-8123-123456789abd',FAMILY_CHOICE='12345678-1234-4123-8123-123456789abe';
const NOTICE='jems-product-analytics-2026-11-v1',API='https://analytics-api.test';

(async()=>{
 const server=start(),browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  for(const [device,viewport] of [['desktop',{width:1400,height:1000}],['mobile',{width:390,height:844}]]){
   const context=await browser.newContext({viewport,hasTouch:device==='mobile',reducedMotion:'reduce'});
   const page=await context.newPage(),calls=[],events=[],errors=[];
   page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
   let configured=false,adult=false,adultChoice=false,familyChoice=false,failStatus=false,failRevoke=false,releaseFamily;
   const status=isAdult=>({enabled:true,permitted:isAdult&&adultChoice,audience:isAdult?'adult':'child',noticeVersion:NOTICE,
    status:isAdult?(adultChoice?'enabled':'not-requested'):(familyChoice?'pending':'not-requested'),
    choiceId:isAdult?(adultChoice?CHOICE:null):(familyChoice?FAMILY_CHOICE:null),expiresAt:Date.now()+3_000_000});
   await context.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({
    version:1,mode:'remote',apiBaseUrl:API,previewOrigin:'https://analytics-preview.test',
    ...(configured?{analytics:{version:1,enabled:true}}:{})})}));
   await context.route(API+'/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname,proof=req.headers()['x-factory-adult-session'];
    const active=adult&&proof===TOKEN;
    const headers={'access-control-allow-origin':req.headers().origin||'*','access-control-allow-credentials':'true',
     'access-control-allow-headers':'Content-Type,X-Factory-Request,X-Factory-Adult-Session',
     'access-control-allow-methods':'GET,POST,OPTIONS'};
    const send=(data,code=200)=>route.fulfill({status:code,headers,contentType:'application/json',body:JSON.stringify(data)}).catch(()=>{});
    if(req.method()==='OPTIONS')return send({});
    const body=req.postData()?JSON.parse(req.postData()):undefined;
    calls.push({path,method:req.method(),body,proof});
    if(path==='/v1/sessions/status')return send({connected:true,trusted:true,deviceName:'Synthetic test device',
     adultPilot:{enabled:true,eligible:true,active,profileId:active?PROFILE:null,expiresAt:active?Date.now()+3_600_000:null}});
    if(path==='/v1/sessions/adult/unlock'){adult=true;adultChoice=false;return send({active:true,profileId:PROFILE,sessionToken:TOKEN,expiresAt:Date.now()+3_600_000});}
    if(path==='/v1/sessions/adult/lock'){adult=false;adultChoice=false;return send({active:false});}
    if(path==='/v1/analytics/status')return send(status(active));
    if(path==='/v1/devices/analytics'&&req.method()==='GET')return failStatus?send({errorCode:'ANALYTICS_UNAVAILABLE'},503):send(status(false));
    if(path==='/v1/devices/analytics'&&req.method()==='POST'){
     assert.deepEqual(body,{noticeVersion:NOTICE,guardianAffirmed:true,providerAcknowledged:true});familyChoice=true;
     await new Promise(resolve=>{releaseFamily=resolve;});return send(status(false));
    }
    if(path==='/v1/analytics/adult-choice'){
     assert.equal(active,true);assert.equal(body.noticeVersion,NOTICE);
     if(!body.enabled&&failRevoke)return send({errorCode:'ANALYTICS_UNAVAILABLE'},503);
     adultChoice=body.enabled;return send({...status(true),status:adultChoice?'enabled':'revoked'});
    }
    if(path==='/v1/analytics/events'){events.push(...body.events);return send({accepted:body.events.length},202);}
    if(path==='/v1/devices/unlock')return send({unlocked:true});
    if(path==='/v1/devices')return send({devices:[]});
    if(path==='/v1/devices/privacy')return send({status:'not-requested',scopes:{generation:false,conversation:false,remoteSpeech:false}});
    if(path==='/v1/coach/status')return send({available:active,mode:active?'model':'unavailable'});
    if(path==='/v1/builder/status')return send({available:active});
    if(path==='/v1/coach/audio/status')return send({available:false,mode:'unavailable'});
    if(path==='/v1/creations')return send([]);
    return send({errorCode:'UNAVAILABLE'},404);
   });
   const url='http://127.0.0.1:'+server.address().port+'/arcade/';
   const settled=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const parent=async()=>{await page.evaluate(()=>FG.app.page('parent'));await page.click('#parentTab-settings');await page.locator('#builderParentUnlockPassphrase').waitFor({state:'visible'});};
   const unlockParent=async()=>{await page.fill('#builderParentUnlockPassphrase','synthetic parent passphrase');await page.locator('#builderParentUnlock button').click();};
   const exploreFirstWelcome=async()=>{const visibleEscape=page.locator('#studioWelcomeExplore');if(await visibleEscape.isVisible())await visibleEscape.click();};
   // A new Adult profile can receive its own first-time invitation even when
   // the family profile previously dismissed theirs. Use the visible journey
   // action, not the intentionally hidden navigation, to begin that idea.
   const startNewIdea=async()=>{
    await page.waitForFunction(()=>['studioWelcomeMake','studioNavCreate'].some(id=>{
     const node=document.getElementById(id);
     return node instanceof HTMLElement&&node.getClientRects().length>0;
    }));
    if(await page.locator('#studioWelcomeMake').isVisible())await page.locator('#studioWelcomeMake').click();
    else await page.click('#studioNavCreate');
   };
   await page.goto(url);await page.waitForFunction(()=>window.FG?.studio&&window.FG?.builder);
   await exploreFirstWelcome();
   await page.click('#studioNavCreate');await settled();
   assert.equal(calls.some(call=>call.path.includes('/analytics')),false,'default-off build makes no analytics requests');
   await parent();assert.equal(await page.locator('#jemsAnalyticsPrivacy').isVisible(),false);

   configured=true;await page.reload();await page.waitForFunction(()=>window.FG?.studio&&window.FG?.builder);
   await exploreFirstWelcome();
   await page.click('#studioNavCreate');await settled();assert.equal(events.length,0,'no implicit permission');
   await parent();failStatus=true;await unlockParent();
   await page.waitForFunction(()=>document.getElementById('connectionStatus').textContent.includes('You can now manage'));
   assert.match(await page.locator('#jemsAnalyticsStatus').textContent(),/status is unavailable/,'optional endpoint failure does not invalidate parent unlock');
   failStatus=false;await unlockParent();await page.locator('#jemsAnalyticsGuardian').check();await page.locator('#jemsAnalyticsNotice').check();
   await page.click('#jemsAnalyticsEnable');
   for(let i=0;i<40&&!releaseFamily;i++)await page.waitForTimeout(25);
   assert.equal(typeof releaseFamily,'function');assert.equal(await page.locator('#jemsAnalyticsEnable').isDisabled(),true);
   await page.click('#homeBtn');releaseFamily();await parent();await unlockParent();
   await page.waitForFunction(()=>document.getElementById('jemsAnalyticsStatus').textContent.includes('verification is pending'));
   assert.equal(await page.locator('#jemsAnalyticsEnable').isDisabled(),false,'navigation during pending choice cannot disable the next scope');
   assert.equal(events.length,0,'family request remains pending');
   assert.equal(calls.some(call=>call.path==='/v1/devices/privacy'&&call.method==='POST'),false,'analytics cannot change AI/speech choices');

   await page.click('#homeBtn');
   if(!await page.locator('#studioProfileMenu').evaluate(node=>node.open))await page.locator('#studioProfileMenu summary').click();
   await page.click('#adultProfileChoice');await page.fill('#adultProfilePassphrase','synthetic adult passphrase');await page.click('#adultProfileSubmit');
   await page.waitForFunction(id=>FG.store.current().id===id,PROFILE);
   await parent();await page.locator('#jemsAnalyticsPrivacy').waitFor({state:'visible'});
   assert.equal(await page.locator('#jemsAnalyticsGuardianLabel').isVisible(),false,'adult panel remains visible after parent navigation without another parent unlock');
   await page.locator('#jemsAnalyticsNotice').check();await page.click('#jemsAnalyticsEnable');
   await page.waitForFunction(()=>document.getElementById('jemsAnalyticsStatus').textContent.includes('is enabled'));
   await page.waitForFunction(()=>!document.getElementById('jemsAnalyticsEnable').disabled);
   fs.mkdirSync('test-results',{recursive:true});
   await page.locator('#jemsAnalyticsPrivacy').screenshot({path:'test-results/analytics-privacy-'+device+'.png'});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'permission controls fit '+device);
   await page.click('#homeBtn');await startNewIdea();
   await page.waitForFunction(()=>document.getElementById('studioPrompt')!==null);await settled();
   for(let i=0;i<40&&events.length===0;i++)await page.waitForTimeout(25);
   assert.equal(events.length,1,'one explicit new-idea observation after opt-in');
   assert.equal(events[0].event,'jems_journey_started');assert.equal(events[0].ownerId,PROFILE);assert.equal(events[0].choiceId,CHOICE);
   assert.equal(await page.evaluate(choice=>Object.values(localStorage).some(value=>value.includes(choice)),CHOICE),false,'analytics choice is not persisted in browser storage');
   await page.fill('#studioPrompt','PRIVATE IDEA SENTINEL: a story about a purple dragon');await settled();
   assert.equal(JSON.stringify(events).includes('SENTINEL'),false,'draft content stays out of analytics');
   assert.equal(events.length,1,'typing is not autocaptured');

   await parent();await page.locator('#jemsAnalyticsRevoke').waitFor({state:'visible'});
   failRevoke=true;await page.click('#jemsAnalyticsRevoke');await page.waitForFunction(()=>document.getElementById('jemsAnalyticsStatus').textContent.includes('could not be confirmed'));
   assert.equal(await page.locator('#jemsAnalyticsRevoke').isVisible(),true,'failed withdrawal remains retryable');
   await page.click('#homeBtn');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await startNewIdea();await settled();
   assert.equal(events.length,1,'failed withdrawal pauses this tab even when focus refreshes');
   failRevoke=false;await parent();await page.locator('#jemsAnalyticsRevoke').waitFor({state:'visible'});await page.click('#jemsAnalyticsRevoke');
   await page.waitForFunction(()=>document.getElementById('jemsAnalyticsStatus').textContent.includes('stopped'));
   assert.equal(adultChoice,false);
   assert.equal(calls.some(call=>call.path==='/v1/sessions/renew'),false,'analytics never renews auth');
   assert.deepEqual(errors,[],'no browser runtime errors');
   await context.close();
  }
  console.log('PASS analytics production UI desktop/mobile: default off, independent pending family choice, adult navigation, coded observations, retryable withdrawal, no persistence or auth renewal');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});

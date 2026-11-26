import {exploreWelcome} from './studio-entry.cjs';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createServer,type ServerOptions} from 'node:https';
import type {AddressInfo} from 'node:net';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {chromium,webkit} from 'playwright';
import {betaFixture,fixtureKey,parent} from './beta-fixture';
import {familyOrigin,betaNotice,defaultCapabilities} from '../server/beta/model';
import {requirePlay} from '../server/beta/access';
import {submitParentPrivacyChoice,recordExternalGuardianVerification} from '../server/privacy/parent-consent';
import {betaRouter} from '../server/beta/router';
import {betaHosting} from '../server/beta/hosting';
import {trustedDeviceHandler} from '../server/trusted-devices';
import {syntheticHttpsTunnel} from './beta-https';

/** Early grades are exercised only in a named synthetic build; ordinary beta stays held. */
export async function earlyBetaBrowser(tls:ServerOptions,engine:'chromium'|'webkit'){
 const {d,enroll,mutate}=await betaFixture(),family=await enroll('six-grade-family');
 d.config.earlyLearningPreview=true;
 const profiles=Array.from({length:6},()=>randomUUID()),origin=familyOrigin(d.config,family.id);
 await d.withFamily(family.id,async(tx,f)=>{f.profiles=profiles;tx.set(d.path(f.id),f);});
 const fixture=(await build({stdin:{contents:"export {familyFetch} from './src/builder/session'; export {selectItem} from './src/learning/engine'; export {selectLanguageItem} from './src/language/engine';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',write:false})).outputFiles[0].text;
 const surface=betaHosting('test-results/early-family-build',d.config,'https://preview.example');
 let pendingConfig:Promise<void>|undefined,heldConfigRequests=0,fixtureRequests=0,releaseConfig=()=>{};
 let pendingStatus:Promise<void>|undefined,releaseStatus=()=>{},statusPairSeen=()=>{};
 const heldStatusPaths=new Set<string>(),statusPaths=['/v1/builder/status','/v1/coach/status'];
 const handler=betaRouter(d,fixtureKey,{runtime:async id=>trustedDeviceHandler(d.repository(id),{familyId:id,sessionKey:fixtureKey,appOrigin:origin,firstParty:true}),
  // Keep the actual router's protected-play admission and HTTPS transport.
  // Playwright WebKit interception is page-wide even for a narrow route; changing
  // it during navigation would also affect unrelated availability requests.
  surface:async(req,res,context)=>{
   if(context.capabilities&&context.path==='/play/synthetic-fixture.js'){
    fixtureRequests++;res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});res.end(fixture);return true;
   }
   const gate=context.path==='/play/factory-config.json'?pendingConfig:undefined;
   if(gate){heldConfigRequests++;await gate;if(res.destroyed)return true;}
   return surface(req,res,context);
  }});
 const server=createServer(tls,(req,res)=>{void (async()=>{
  const path=new URL(req.url||'/',origin).pathname,gate=statusPaths.includes(path)?pendingStatus:undefined;
  if(gate){heldStatusPaths.add(path);if(heldStatusPaths.size===2)statusPairSeen();await gate;if(res.destroyed)return;}
  await handler(req,res);
 })();});
 await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));
 const tunnel=await syntheticHttpsTunnel((server.address() as AddressInfo).port,[new URL(origin).host]);
 try{
  const browser=await (engine==='webkit'?webkit:chromium).launch({proxy:tunnel.proxy,...(engine==='chromium'&&process.env.BETA_CHROMIUM_PATH?{executablePath:process.env.BETA_CHROMIUM_PATH}:{})});
  try{
   const ctx=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:768,height:1024}}),page=await ctx.newPage();
   const browserErrors:string[]=[],networkEvents:unknown[]=[];
   const readinessProbeKey='jems-test-native-readiness';
   // Raw browser script avoids transpiler helpers in serialized callbacks.
   // Only the explicitly armed outgoing document wraps fetch, and it returns
   // every native promise unchanged without adding rejection handlers.
   await page.addInitScript({content:`(() => {
    const key=${JSON.stringify(readinessProbeKey)},documentId=crypto.randomUUID();
    window.__nativeReadinessDocument=documentId;window.__nativeReadinessArmed=false;
    const record=event=>{const entries=JSON.parse(sessionStorage.getItem(key)||'[]');entries.push({document:documentId,...event});sessionStorage.setItem(key,JSON.stringify(entries.slice(-40)));};
    addEventListener('pagehide',event=>{if(window.__nativeReadinessArmed)record({event:'pagehide',trusted:event.isTrusted});});
    window.__armNativeReadiness=()=>{
     if(window.__nativeReadinessArmed)throw Error('Readiness probe already armed');
     window.__nativeReadinessArmed=true;const nativeFetch=window.fetch;let sequence=0;
     window.fetch=function(input,init){
      const path=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href).pathname;
      if(path==='/v1/coach/status'||path==='/v1/builder/status'){
       const id=++sequence,signal=init?.signal;
       record({event:'start',id,path,hasSignal:!!signal,aborted:signal?.aborted});
       signal?.addEventListener('abort',()=>record({event:'abort',id,path}),{once:true});
      }
      return nativeFetch.call(this,input,init);
     };
    };
   })();`});
   page.on('pageerror',error=>{browserErrors.push(error.message);networkEvents.push({event:'pageerror',url:page.url(),message:error.message});});
   page.on('framenavigated',frame=>{if(frame===page.mainFrame())networkEvents.push({event:'navigation',url:frame.url()});});
   const readinessRequest=(url:string)=>/\/v1\/(?:coach|builder)\/status$/.test(url);
   page.on('request',request=>{if(readinessRequest(request.url()))networkEvents.push({event:'request',url:request.url(),page:page.url()});});
   page.on('requestfailed',request=>{if(readinessRequest(request.url()))networkEvents.push({event:'requestfailed',url:request.url(),page:page.url(),failure:request.failure()});});
   page.on('response',response=>{if(readinessRequest(response.url()))networkEvents.push({event:'response',url:response.url(),status:response.status()});});
   const holdReadiness=async()=>{
    heldStatusPaths.clear();pendingStatus=new Promise<void>(resolve=>{releaseStatus=resolve;});
    const reachedServer=new Promise<void>(resolve=>{statusPairSeen=resolve;});
    const nativeRequests=Promise.all(statusPaths.map(path=>page.waitForRequest(request=>request.url()===origin+path)));
    await page.evaluate(()=>{(window as any).__armNativeReadiness();window.dispatchEvent(new Event('factory-session-restored'));});
    let timeout:ReturnType<typeof setTimeout>|undefined;
    try{await Promise.race([Promise.all([reachedServer,nativeRequests]),new Promise<never>((_resolve,reject)=>{timeout=setTimeout(()=>reject(Error('Both real HTTPS readiness requests must reach the held server.')),10000);})]);}
    finally{clearTimeout(timeout);}
    const outgoing=await page.evaluate(key=>{const document=(window as any).__nativeReadinessDocument,events=JSON.parse(sessionStorage.getItem(key)||'[]').filter((event:any)=>event.document===document);return {document,requests:events.filter((event:any)=>event.event==='start')};},readinessProbeKey);
    assert.deepEqual(outgoing.requests.map((request:any)=>request.path).sort(),statusPaths,'Both availability reads are genuinely pending over HTTPS before navigation.');
    assert.ok(outgoing.requests.every((request:any)=>request.hasSignal&&!request.aborted),'Both pending reads carry a live native abort signal.');
    return {...outgoing,nativeRequests:await nativeRequests};
   };
   const readinessEvents=(document:string)=>page.evaluate(({key,document})=>JSON.parse(sessionStorage.getItem(key)||'[]').filter((event:any)=>event.document===document),{key:readinessProbeKey,document});
   const releaseReadiness=()=>{releaseStatus();pendingStatus=undefined;};
   try{
   assert.equal((await ctx.request.get(origin+'/play/synthetic-fixture.js',{maxRedirects:0})).status(),401,'The actual router protects the synthetic module before enrollment.');
   for(const pair of family.cookies.split('; ')){const at=pair.indexOf('=');await ctx.addCookies([{name:pair.slice(0,at),value:pair.slice(at+1),url:origin,secure:true,httpOnly:true,sameSite:'Strict'}]);}
   await page.goto(origin+'/grown-ups');await page.getByLabel('Parent passphrase').fill(parent);await page.getByRole('button',{name:'Unlock family controls'}).click();
   await page.getByRole('button',{name:'Add an explorer'}).waitFor();
   await page.goto(origin+'/acknowledge');await page.getByLabel('Parent passphrase').fill(parent);for(const checkbox of await page.getByRole('checkbox').all())await checkbox.check();
   await page.getByRole('button',{name:'Enter Jems'}).click();await page.waitForFunction(()=>Boolean((window as any).FG?.studio));
   assert.deepEqual(await page.evaluate(()=>(window as any).FG.store.familyProfiles().map((p:any)=>p.id)),profiles);
   let creativeRequests=0;page.on('request',request=>{if(/\/v1\/(?:jobs|revisions|coach)(?:\/|$)/.test(new URL(request.url()).pathname)&&request.method()==='POST')creativeRequests++;});
   for(const [index,grade] of [-1,0,1,2,3,4].entries()){
    const result=await page.evaluate(async({owner,grade})=>{
     const FG=(window as any).FG;FG.store.choose(owner);window.dispatchEvent(new Event('factory-profile'));await FG.store.changeLearningProfile({grade});
     const modulePath='/play/synthetic-fixture.js',fixture=await import(modulePath),profile=FG.store.current();
     const math=fixture.selectItem(profile),language=fixture.selectLanguageItem(profile),before=JSON.stringify(profile);
     const denied=grade<=0?await fixture.familyFetch(location.origin,'/v1/jobs',{method:'POST',headers:{'Content-Type':'application/json','X-Factory-Request':'1'},body:'{}'}):undefined;
     return {grade:profile.grade,math:math.grade,language:language.grade,unchanged:before===JSON.stringify(profile),denied:denied?.status};
    },{owner:profiles[index],grade});
    assert.equal(result.grade,grade);assert.ok(result.math<=grade);assert.ok(result.language<=grade);assert.equal(result.unchanged,true);
    if(grade<=0){assert.equal(result.denied,403);
     await page.waitForFunction(()=>document.getElementById('page-studio-library')?.getAttribute('aria-busy')==='false');
     if(await page.locator('#studioWelcome').isVisible()){await page.locator('[data-welcome-character="spark"]').click();await page.waitForFunction(()=>(document.getElementById('studioWelcomeMake') as HTMLButtonElement)?.disabled===false);await page.locator('#homeBtn').click();}
     await page.locator('#studioNew').click();await page.locator('#earlyCreationHandoff[open]').waitFor();
     await page.screenshot({path:'test-results/family-beta/'+engine+'-beta-grade-'+grade+'.png',fullPage:true});
     await page.locator('#earlyCreationHandoff').getByRole('button',{name:'Play games'}).click();}
   }
   assert.equal(fixtureRequests,1,'The authenticated module was loaded through the actual HTTPS server and reused in this document.');
   assert.equal(creativeRequests,0,'Grade settings and parent unlock never send remote creative content.');
   const state=await d.repository(family.id).snapshot();assert.equal(state.jobs.length,0);assert.equal(state.revisions.length,0);assert.equal(state.parentPrivacyChoices?.length??0,0);
   await page.waitForFunction(()=>document.getElementById('page-studio-library')?.getAttribute('aria-busy')==='false');
   const outgoing=await holdReadiness();
   // WebKit may reject fetch before pagehide. Verify real network cancellation
   // without assuming that the document's abort controller runs first.
   const cancelled=outgoing.nativeRequests.map(held=>page.waitForEvent('requestfailed',{predicate:request=>request===held}));
   const [cancelledRequests]=await Promise.all([Promise.all(cancelled),page.reload()]);
   assert.ok(cancelledRequests.every(request=>request.failure()),'Both held requests are cancelled by the real navigation.');
   await page.waitForURL('**/acknowledge');
   const outgoingEvents=await readinessEvents(outgoing.document);
   assert.ok(outgoingEvents.some((event:any)=>event.event==='pagehide'&&event.trusted),'The actual navigation dispatched a trusted pagehide.');
   releaseReadiness();
   await page.getByLabel('Parent passphrase').fill(parent);for(const checkbox of await page.getByRole('checkbox').all())await checkbox.check();
   await Promise.all([...statusPaths.map(path=>page.waitForResponse(response=>response.url()===origin+path&&response.status()===404)),page.getByRole('button',{name:'Enter Jems'}).click()]);
   await page.waitForFunction(()=>Boolean((window as any).FG?.studio));
   assert.equal(await page.evaluate(()=>(window as any).__nativeReadinessArmed),false,'The replacement document uses untouched native fetch for fresh status responses.');
   assert.notEqual(await page.evaluate(()=>(window as any).__nativeReadinessDocument),outgoing.document,'Fresh readiness belongs to the replacement document.');
   console.log(JSON.stringify({engine,nativeReadinessNavigation:{heldNativeRequests:outgoing.requests.length,cancelledNetworkRequests:2,explicitAbortsObserved:outgoingEvents.filter((event:any)=>event.event==='abort').length,freshDocumentResponses:2}}));
   assert.deepEqual(await page.evaluate(()=>(window as any).FG.store.familyProfiles().map((p:any)=>p.grade)),[-1,0,1,2,3,4]);
   // Supervised creation is a distinct, default-off source contract. Only synthetic
   // owner evidence enables it here; no provider/worker is installed in this server.
   const session=(await requirePlay(d,family.id,(await ctx.cookies(origin)).map(cookie=>cookie.name+'='+cookie.value).join('; '),fixtureKey,'check')).session;
   d.config.parentGuidedCreation=true;
   d.config.providerEvidence=[{scope:'generation',provider:'openai',notice:betaNotice,expiresAt:Date.now()+600000,privacyDigest:'a'.repeat(64),safetyDigest:'b'.repeat(64),zdrApproved:true}];
   await mutate('policy',family.id,{capabilities:{...defaultCapabilities(),generation:true},paused:false,generationPaused:false,monthlyCents:100});
   const choice=await submitParentPrivacyChoice(d.repository(family.id),{...session,role:'parent'},{noticeVersion:betaNotice,guardianAffirmed:true,providerAcknowledged:true,scopes:{generation:true,conversation:false,remoteSpeech:false}});
   await recordExternalGuardianVerification(d.repository(family.id),{familyId:family.id,choiceId:choice.choiceId,receipt:'synthetic-browser-guidance',verifiedByOwner:true});
   // Separately exercise the actual cancellation handler before a browser can
   // preempt it. This is explicitly a simulated lifecycle notification, followed
   // by the existing real reload; it is not a claim about native event ordering.
   const controlled=await holdReadiness();
   await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false})));
   const controlledEvents=await readinessEvents(controlled.document),hiddenAt=controlledEvents.findIndex((event:any)=>event.event==='pagehide'&&!event.trusted);
   assert.ok(hiddenAt>=0,'The handler probe is explicitly an untrusted simulated pagehide.');
   assert.deepEqual(controlledEvents.slice(hiddenAt+1).filter((event:any)=>event.event==='abort').map((event:any)=>event.id).sort(),controlled.requests.map((request:any)=>request.id).sort(),'The pagehide handler explicitly aborts both live native signals.');
   releaseReadiness();
   console.log(JSON.stringify({engine,simulatedPagehideHandler:{heldNativeRequests:2,explicitNativeSignalAborts:2,simulatedNotification:true}}));
   // Configuration is deliberately unresolved while the local Parent controls
   // mount and supervise this learner. Neither guidance nor its navigation may
   // depend on the asynchronous builder connection panel being installed.
   pendingConfig=new Promise<void>(resolve=>{releaseConfig=resolve;});
   await page.reload();await page.waitForURL('**/acknowledge');await page.getByLabel('Parent passphrase').fill(parent);for(const checkbox of await page.getByRole('checkbox').all())await checkbox.check();await page.getByRole('button',{name:'Enter Jems'}).click();await page.waitForFunction(()=>Boolean((window as any).FG?.studio));
   assert.ok(heldConfigRequests>0,'The builder configuration request is deliberately pending.');
   assert.equal(await page.locator('#builderConnection').count(),0,'Remote connection controls must still be waiting for configuration.');
   assert.equal(await page.locator('#parentPanel-settings #parentGuidanceStart').count(),1,'Guidance must mount with local Parent settings.');
   // Open Parent in the same task as profile switching: the notebook's async
   // rebind must not later override the adult's explicit navigation with Home.
   await page.evaluate(profileId=>{const w=window as any,FG=w.FG;w.parentNavigation=[];window.addEventListener('factory-page',event=>w.parentNavigation.push((event as CustomEvent).detail));FG.store.choose(profileId);window.dispatchEvent(new Event('factory-profile'));window.dispatchEvent(new Event('factory-open-parent-connection'));},profiles[0]);
   await page.locator('#parentGuidanceStart').click();await page.waitForFunction(()=>document.getElementById('parentGuidanceStatus')?.textContent?.includes('Stay together'));
   const navigation=await page.evaluate(()=>(window as any).parentNavigation as string[]);assert.ok(navigation.includes('parent'));assert.ok(!navigation.slice(navigation.indexOf('parent')+1).includes('home'));assert.equal(await page.locator('#page-parent').isVisible(),true);
   await page.screenshot({path:'test-results/family-beta/'+engine+'-beta-parent-guidance-pending-config.png',fullPage:true});
   releaseConfig();pendingConfig=undefined;
   await page.locator('#builderConnection').waitFor();
   assert.equal(await page.locator('#parentGuidanceStart').count(),1,'Completing remote setup must not duplicate or replace guidance.');
   await page.locator('#homeBtn').click();await exploreWelcome(page);await page.locator('#studioNew').click();await page.locator('#studioPrompt').waitFor({state:'visible'});
   assert.equal(await page.locator('#earlyCreationHandoff[open]').count(),0);assert.equal(await page.locator('#guidedCreationTogether').isVisible(),true);
   await page.screenshot({path:'test-results/family-beta/'+engine+'-beta-parent-guided-creation.png',fullPage:true});
   await page.evaluate(profileId=>{const FG=(window as any).FG;FG.store.choose(profileId);window.dispatchEvent(new Event('factory-profile'));},profiles[1]);
   await exploreWelcome(page);
   await page.locator('#studioNew').click();await page.locator('#earlyCreationHandoff[open]').waitFor();await page.locator('#earlyCreationHandoff').getByRole('button',{name:'Play games'}).click();
   assert.equal((await d.repository(family.id).snapshot()).jobs.length,0,'Opening supervised tools does not start a paid build.');
   await d.withFamily(family.id,async(tx,f)=>{f.guardian.participationVersion='old-participation';f.guardian.noticeVersion='old-privacy';tx.set(d.path(f.id),f);});
   await page.goto(origin+'/login');await page.waitForURL('**/renew-participation');
   await page.getByLabel('Parent passphrase').fill(parent);await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Accept updated notices'}).click();await page.waitForURL('**/grown-ups');
   const renewed=await d.repository(family.id).snapshot();assert.equal(renewed.parentPrivacyChoices?.filter(choice=>choice.revokedAt===undefined).length??0,0);
   assert.equal((await d.withFamily(family.id,async(_tx,f)=>f)).plays.length,0);
   assert.deepEqual(browserErrors,[]);
   console.log(engine+' private early-preview preserved all six profile grades across reload and blocked unapproved early creation, served its protected module and held configuration over real HTTPS without browser interception, opened the separately supervised composer and renewed notices without retaining prior scopes');
   }catch(error){
    const state=await page.evaluate(()=>{const w=window as any,profile=w.FG?.store?.current?.();return {url:location.href,readyState:document.readyState,privateBeta:document.documentElement.dataset.privateBeta,parentGuidance:document.documentElement.dataset.parentGuidance,studioReady:Boolean(w.FG?.studio),profile:profile?{id:profile.id,grade:profile.grade}:null,parentNavigation:w.parentNavigation,visiblePages:[...document.querySelectorAll('main > .page:not(.hidden)')].map(node=>node.id),parentSettings:Boolean(document.getElementById('parentPanel-settings')),builderConnection:Boolean(document.getElementById('builderConnection')),guidance:document.getElementById('parentGuidance')?.outerHTML,startupRecovery:document.getElementById('jemsStartupRecovery')?.textContent,globalStatus:document.getElementById('studioGlobalStatus')?.textContent};}).catch(()=>({url:page.url()}));
    const diagnostics={engine,error:String(error),browserErrors,networkEvents,state};
    console.error('Private early-preview failure '+JSON.stringify(diagnostics));
    await writeFile('test-results/family-beta/'+engine+'-beta-early-failure.json',JSON.stringify(diagnostics,null,2));
    await page.screenshot({path:'test-results/family-beta/'+engine+'-beta-early-failure.png',fullPage:true}).catch(()=>{});
    throw error;
   }finally{releaseConfig();releaseStatus();}
  }finally{await browser.close();}
 }finally{await tunnel.close();server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));}
}

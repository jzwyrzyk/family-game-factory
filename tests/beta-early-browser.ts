import assert from 'node:assert/strict';
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
 const handler=betaRouter(d,fixtureKey,{runtime:async id=>trustedDeviceHandler(d.repository(id),{familyId:id,sessionKey:fixtureKey,appOrigin:origin,firstParty:true}),
  surface:betaHosting('test-results/early-family-build',d.config,'https://preview.example')});
 const server=createServer(tls,(req,res)=>{void handler(req,res);});
 await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));
 const tunnel=await syntheticHttpsTunnel((server.address() as AddressInfo).port,[new URL(origin).host]);
 try{
  const browser=await (engine==='webkit'?webkit:chromium).launch({proxy:tunnel.proxy,...(engine==='chromium'&&process.env.BETA_CHROMIUM_PATH?{executablePath:process.env.BETA_CHROMIUM_PATH}:{})});
  try{
   const ctx=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:768,height:1024}}),page=await ctx.newPage();
   const fixture=(await build({stdin:{contents:"export {familyFetch} from './src/builder/session'; export {selectItem} from './src/learning/engine'; export {selectLanguageItem} from './src/language/engine';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',write:false})).outputFiles[0].text;
   await ctx.route(origin+'/play/synthetic-fixture.js',route=>route.fulfill({contentType:'text/javascript',body:fixture}));
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
   assert.equal(creativeRequests,0,'Grade settings and parent unlock never send remote creative content.');
   const state=await d.repository(family.id).snapshot();assert.equal(state.jobs.length,0);assert.equal(state.revisions.length,0);assert.equal(state.parentPrivacyChoices?.length??0,0);
   await page.reload();await page.waitForURL('**/acknowledge');
   await page.getByLabel('Parent passphrase').fill(parent);for(const checkbox of await page.getByRole('checkbox').all())await checkbox.check();await page.getByRole('button',{name:'Enter Jems'}).click();
   await page.waitForFunction(()=>Boolean((window as any).FG?.studio));
   assert.deepEqual(await page.evaluate(()=>(window as any).FG.store.familyProfiles().map((p:any)=>p.grade)),[-1,0,1,2,3,4]);
   // Supervised creation is a distinct, default-off source contract. Only synthetic
   // owner evidence enables it here; no provider/worker is installed in this server.
   const session=(await requirePlay(d,family.id,(await ctx.cookies(origin)).map(cookie=>cookie.name+'='+cookie.value).join('; '),fixtureKey,'check')).session;
   d.config.parentGuidedCreation=true;
   d.config.providerEvidence=[{scope:'generation',provider:'openai',notice:betaNotice,expiresAt:Date.now()+600000,privacyDigest:'a'.repeat(64),safetyDigest:'b'.repeat(64),zdrApproved:true}];
   await mutate('policy',family.id,{capabilities:{...defaultCapabilities(),generation:true},paused:false,generationPaused:false,monthlyCents:100});
   const choice=await submitParentPrivacyChoice(d.repository(family.id),{...session,role:'parent'},{noticeVersion:betaNotice,guardianAffirmed:true,providerAcknowledged:true,scopes:{generation:true,conversation:false,remoteSpeech:false}});
   await recordExternalGuardianVerification(d.repository(family.id),{familyId:family.id,choiceId:choice.choiceId,receipt:'synthetic-browser-guidance',verifiedByOwner:true});
   await page.reload();await page.waitForURL('**/acknowledge');await page.getByLabel('Parent passphrase').fill(parent);for(const checkbox of await page.getByRole('checkbox').all())await checkbox.check();await page.getByRole('button',{name:'Enter Jems'}).click();await page.waitForFunction(()=>Boolean((window as any).FG?.studio));
   await page.evaluate(profileId=>{const FG=(window as any).FG;FG.store.choose(profileId);window.dispatchEvent(new Event('factory-profile'));window.dispatchEvent(new Event('factory-open-parent-connection'));},profiles[0]);
   await page.locator('#parentGuidanceStart').click();await page.waitForFunction(()=>document.getElementById('parentGuidanceStatus')?.textContent?.includes('Stay together'));
   await page.locator('#homeBtn').click();await page.locator('#studioNew').click();await page.locator('#studioPrompt').waitFor({state:'visible'});
   assert.equal(await page.locator('#earlyCreationHandoff[open]').count(),0);assert.equal(await page.locator('#guidedCreationTogether').isVisible(),true);
   await page.screenshot({path:'test-results/family-beta/'+engine+'-beta-parent-guided-creation.png',fullPage:true});
   await page.evaluate(profileId=>{const FG=(window as any).FG;FG.store.choose(profileId);window.dispatchEvent(new Event('factory-profile'));},profiles[1]);
   await page.waitForFunction(()=>document.getElementById('page-studio-library')?.getAttribute('aria-busy')==='false');
   if(await page.locator('#studioWelcome').isVisible()){await page.locator('[data-welcome-character="spark"]').click();await page.waitForFunction(()=>(document.getElementById('studioWelcomeMake') as HTMLButtonElement)?.disabled===false);await page.locator('#homeBtn').click();}
   await page.locator('#studioNew').click();await page.locator('#earlyCreationHandoff[open]').waitFor();await page.locator('#earlyCreationHandoff').getByRole('button',{name:'Play games'}).click();
   assert.equal((await d.repository(family.id).snapshot()).jobs.length,0,'Opening supervised tools does not start a paid build.');
   await d.withFamily(family.id,async(tx,f)=>{f.guardian.participationVersion='old-participation';f.guardian.noticeVersion='old-privacy';tx.set(d.path(f.id),f);});
   await page.goto(origin+'/login');await page.waitForURL('**/renew-participation');
   await page.getByLabel('Parent passphrase').fill(parent);await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Accept updated notices'}).click();await page.waitForURL('**/grown-ups');
   const renewed=await d.repository(family.id).snapshot();assert.equal(renewed.parentPrivacyChoices?.filter(choice=>choice.revokedAt===undefined).length??0,0);
   assert.equal((await d.withFamily(family.id,async(_tx,f)=>f)).plays.length,0);
   console.log(engine+' private early-preview preserved all six profile grades across reload and blocked unapproved early creation, opened the separately supervised composer and renewed notices without retaining prior scopes');
  }finally{await browser.close();}
 }finally{await tunnel.close();server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));}
}

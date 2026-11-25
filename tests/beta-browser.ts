import {operatorBrowser} from './beta-operator-browser';
import {earlyBetaBrowser} from './beta-early-browser';
import {browserIsolation} from './beta-browser-isolation';
import {previewBrowser} from './beta-preview-browser';
import {migrationBrowser,applicationMigrationBrowser} from './beta-migration-browser';
import assert from 'node:assert/strict';
import {createServer,type ServerOptions} from 'node:https';
import type {AddressInfo} from 'node:net';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium,webkit,type Browser,type BrowserContext} from 'playwright';
import {betaFixture,fixtureKey,parent} from './beta-fixture';
import {betaRouter} from '../server/beta/router';
import {betaHosting} from '../server/beta/hosting';
import {trustedDeviceHandler} from '../server/trusted-devices';
import {familyOrigin,defaultCapabilities} from '../server/beta/model';
import {backToEndedPlayEntry,assertEndedPlayEntry} from './beta-back';

async function entryBrowser(browser:Browser,engine:string,tls:ServerOptions,out:string){
 const {d,invite,mutate}=await betaFixture(),family=await invite('browser-adult'),origin=familyOrigin(d.config,family.id);
 const handler=betaRouter(d,fixtureKey,{runtime:async id=>trustedDeviceHandler(d.repository(id),{familyId:id,sessionKey:fixtureKey,appOrigin:origin,firstParty:true}),
  surface:betaHosting('dist-family-beta',d.config,'https://preview.example')});
 const server=createServer(tls,(req,res)=>{
  // The test-only TLS listener maps localhost to this one synthetic host.
  if(req.headers.origin===local)req.headers.origin=origin;req.headers.host=new URL(origin).host;void handler(req,res);
 });
 let local='';await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));local='https://127.0.0.1:'+(server.address() as AddressInfo).port;
 const contexts:BrowserContext[]=[];
 try{
    const noScript=await browser.newContext({ignoreHTTPSErrors:true,javaScriptEnabled:false}),native=await noScript.newPage();
    contexts.push(noScript);const nativeRequests:string[]=[];native.on('request',request=>nativeRequests.push(request.url()));
    await native.goto(local+'/invitation');
    const marker='synthetic-native-form-credential-marker-value';
    await native.locator('[name=invitation]').fill(marker);await native.locator('[name=passphrase]').fill('synthetic native parent passphrase');await native.getByRole('checkbox').check();
    await native.getByRole('button',{name:'Pair this device'}).click({noWaitAfter:true});
    await native.waitForTimeout(100); // Let the blocked native navigation report to the browser request observer.
    assert.equal(native.url(),local+'/invitation');assert.ok(nativeRequests.every(url=>!url.includes(marker)&&!url.includes('passphrase')));
    await noScript.close();
    const ctx=await browser.newContext({ignoreHTTPSErrors:true}),p=await ctx.newPage();
    contexts.push(ctx);const assets=new Set<string>();p.on('request',r=>assets.add(r.url()));const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
    for(const [w,h] of [[1440,900],[768,1024],[390,844]]){
     await p.setViewportSize({width:w,height:h});await p.goto(local);await p.getByRole('heading',{name:'Little creators. Limitless imagination.'}).waitFor();
     await p.evaluate(()=>document.fonts.ready);assert.ok(await p.locator('.mine img').evaluateAll(imgs=>imgs.every(i=>(i as HTMLImageElement).naturalWidth>0)));
     assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:out+'/'+engine+'-'+w+'.png',fullPage:true});
    }
    assert.ok([...assets].every(url=>url.startsWith(local+'/')));assert.ok(![...assets].some(url=>url.includes('/play/')));
    for(const route of ['/play/','/play/assets/index-private.js','/sw.js','/?arcade=1','/index.html','/manage','/v1/creations'])assert.ok((await ctx.request.get(local+route)).status()>=400);
    // Each engine proves both enrollment and recovery using its own family.
    for(const phase of ['invitation','recovery']){
     const issued=phase==='invitation'?family:await mutate('recover',family.id);
     await p.goto(local+'/'+phase);await p.locator('[name=invitation]').fill(String(issued.invitation));
     await p.locator('[name=passphrase]').fill(parent);await p.getByRole('checkbox').check();await p.getByRole('button',{name:'Pair this device'}).click();await p.locator('#paired output').waitFor();
     const pair=await p.locator('#paired output').innerText();await mutate('verify',family.id,{pairingCode:pair,receipt:'synthetic-browser-'+engine+'-'+phase});
    }
    await mutate('policy',family.id,{capabilities:defaultCapabilities(),monthlyCents:0,paused:true,generationPaused:true});
    await p.goto(local+'/grown-ups');await p.getByLabel('Parent passphrase').fill(parent);await p.getByRole('button',{name:'Unlock family controls'}).click();
    await p.getByRole('button',{name:'Add an explorer'}).click();await p.getByText(/explorer profiles\./).waitFor();
    const publicBeforePlay=p.url();assert.equal(publicBeforePlay,local+'/grown-ups');
    await p.goto(local+'/acknowledge');await p.screenshot({path:out+'/'+engine+'-acknowledgment.png',fullPage:true});
    await p.getByLabel('Parent passphrase').fill(parent);for(const box of await p.getByRole('checkbox').all())await box.check();
    await p.getByRole('button',{name:'Enter Jems'}).click();await p.waitForURL('**/play/');
    await p.waitForFunction(()=>Boolean((window as any).FG?.store?.current()?.id));await p.locator('#studioLibraryTitle, #studioWelcomeTitle').first().waitFor({state:'attached'});
    assert.equal(await p.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).length),0);
    await p.getByRole('button',{name:'End play'}).click();await p.waitForURL(/\/(?:login|acknowledge)$/);
    const denied=await ctx.request.get(local+'/play/',{maxRedirects:0});assert.ok([303,401].includes(denied.status()));if(denied.status()===303)assert.equal(denied.headers().location,'/acknowledge');
    await backToEndedPlayEntry(p,ctx,engine,publicBeforePlay);assert.equal(await p.locator('#studioLibraryTitle').count(),0);assert.deepEqual(errors,[]);
    // Simulate only the BFCache pageshow notification, exercising the actual
    // entry.js handler. Observe a fresh same-origin document and recheck every
    // ended-session condition; this is not evidence of native WebKit BFCache.
    const reload=p.waitForRequest(request=>request.isNavigationRequest()&&request.frame()===p.mainFrame()&&request.url()===publicBeforePlay);
    await p.evaluate(()=>{(window as any).__beforePersistedShow=true;setTimeout(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})),0);});
    await reload;await p.waitForFunction(()=>!('__beforePersistedShow' in window));
    await assertEndedPlayEntry(p,ctx,publicBeforePlay);assert.deepEqual(errors,[]);
    console.log(JSON.stringify({engine,endedPlayBack:true,simulatedPersistedPageShowReload:true,privateDocumentAbsent:true,playAuthorizationDenied:true}));
    await mutate('policy',family.id,{capabilities:{...defaultCapabilities(),games:false,coding:false,learning:false,problemSolving:false,conversation:true},monthlyCents:0,paused:true,generationPaused:true});
    await p.goto(local+'/acknowledge');await p.getByLabel('Parent passphrase').fill(parent);for(const box of await p.getByRole('checkbox').all())await box.check();
    await p.getByRole('button',{name:'Enter Jems'}).click();await p.getByRole('button',{name:'My creative workshop'}).click();
    await p.getByRole('button',{name:'Talk about this idea'}).waitFor();assert.equal(await p.getByRole('button',{name:'Build or revise my game'}).count(),0);
    assert.equal((await ctx.request.get(local+'/play/features/games.js')).status(),403);assert.equal((await ctx.request.get(local+'/play/features/remote.js')).status(),200);
    await ctx.close();
 }finally{await Promise.allSettled(contexts.map(context=>context.close()));server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));}
}

async function main(){
 const dir=mkdtempSync(join(tmpdir(),'jems-beta-browser-')),out='test-results/family-beta';mkdirSync(out,{recursive:true});
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',dir+'/key','-out',dir+'/cert','-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
 const tls={key:readFileSync(dir+'/key'),cert:readFileSync(dir+'/cert')};
 const results:{engine:string;stage:string;status:'passed'|'failed';error?:string}[]=[],failures:unknown[]=[];
 const run=async(engine:string,stage:string,work:()=>Promise<void>)=>{try{await work();results.push({engine,stage,status:'passed'});console.log('PASS beta '+engine+' '+stage);}catch(error){failures.push(error);results.push({engine,stage,status:'failed',error:String(error)});console.error('FAIL beta '+engine+' '+stage,error);}};
 try{
  const engines=(process.env.BETA_BROWSERS??'chromium,webkit').split(',');
  if(process.env.CI&&(!engines.includes('chromium')||!engines.includes('webkit')))throw Error('Hosted beta acceptance requires Chromium and WebKit.');
  for(const engine of engines){
   if(engine!=='chromium'&&engine!=='webkit')throw Error('Unknown browser');
   let browser:Browser|undefined;
   await run(engine,'browser-startup',async()=>{browser=await (engine==='webkit'?webkit:chromium).launch(engine==='chromium'&&process.env.BETA_CHROMIUM_PATH?{executablePath:process.env.BETA_CHROMIUM_PATH}:{});});
   if(!browser)continue; // No browser-dependent assertion can run without its engine.
   try{
    // Each fixture owns isolated family/session/browser state. A failed journey
    // remains failed while unrelated acceptance continues collecting evidence.
    await run(engine,'entry',()=>entryBrowser(browser!,engine,tls,out));
    await run(engine,'origin-isolation',()=>browserIsolation(tls,engine));
    await run(engine,'early-guidance',()=>earlyBetaBrowser(tls,engine));
    await run(engine,'operator',()=>operatorBrowser(tls,engine));
    await run(engine,'generic-migration',async()=>{
     const context=await (engine==='webkit'?webkit:chromium).launchPersistentContext(dir+'/migration-'+engine,engine==='chromium'&&process.env.BETA_CHROMIUM_PATH?{executablePath:process.env.BETA_CHROMIUM_PATH}:{});
     try{await migrationBrowser(context);}finally{await context.close();}
    });
    await run(engine,'application-migration',async()=>{const context=await browser!.newContext();try{await applicationMigrationBrowser(context,engine);}finally{await context.close();}});
    await run(engine,'preview',()=>previewBrowser(browser!));
   }finally{await browser.close();}
  }
  if(failures.length)throw new AggregateError(failures,failures.length+' independent beta browser stages failed.');
 }finally{writeFileSync(out+'/browser-results.json',JSON.stringify({schema:'jems.beta-browser-acceptance.v1',source:process.env.GITHUB_SHA??null,results},null,2));rmSync(dir,{recursive:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

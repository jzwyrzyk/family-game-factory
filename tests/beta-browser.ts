import assert from 'node:assert/strict';
import {createServer} from 'node:https';
import type {AddressInfo} from 'node:net';
import {mkdtempSync,readFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';
import {betaFixture,fixtureKey,parent} from './beta-fixture';
import {betaRouter} from '../server/beta/router';
import {betaHosting} from '../server/beta/hosting';
import {trustedDeviceHandler} from '../server/trusted-devices';
import {familyOrigin} from '../server/beta/model';

async function main(){
 const {d,invite,mutate}=await betaFixture(),family=await invite('browser-adult'),origin=familyOrigin(d.config,family.id);
 const handler=betaRouter(d,fixtureKey,{runtime:async id=>trustedDeviceHandler(d.repository(id),{familyId:id,sessionKey:fixtureKey,appOrigin:origin,firstParty:true}),
  surface:betaHosting('dist-family-beta',d.config,'https://preview.example')});
 const dir=mkdtempSync(join(tmpdir(),'jems-beta-browser-'));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',dir+'/key','-out',dir+'/cert','-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
 const server=createServer({key:readFileSync(dir+'/key'),cert:readFileSync(dir+'/cert')},(req,res)=>{
  // The test-only TLS listener maps localhost to this one synthetic host.
  if(req.headers.origin===local)req.headers.origin=origin;req.headers.host=new URL(origin).host;void handler(req,res);
 });
 let local='';await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));local='https://127.0.0.1:'+(server.address() as AddressInfo).port;
 const out='test-results/family-beta';mkdirSync(out,{recursive:true});
 try{
  let completed=0;
  for(const engine of (process.env.BETA_BROWSERS??'chromium,webkit').split(',')){
   if(!['chromium','webkit'].includes(engine))throw Error('Unknown browser');
   const browser=await (engine==='webkit'?webkit:chromium).launch(engine==='chromium'&&process.env.BETA_CHROMIUM_PATH?{executablePath:process.env.BETA_CHROMIUM_PATH}:{});
   try{
    const ctx=await browser.newContext({ignoreHTTPSErrors:true}),p=await ctx.newPage();
    const assets=new Set<string>();p.on('request',r=>assets.add(r.url()));const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
    for(const [w,h] of [[1440,900],[768,1024],[390,844]]){
     await p.setViewportSize({width:w,height:h});await p.goto(local);await p.getByRole('heading',{name:'Little creators. Limitless imagination.'}).waitFor();
     await p.evaluate(()=>document.fonts.ready);assert.ok(await p.locator('.mine img').evaluateAll(imgs=>imgs.every(i=>(i as HTMLImageElement).naturalWidth>0)));
     assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:out+'/'+engine+'-'+w+'.png',fullPage:true});
    }
    assert.ok([...assets].every(url=>url.startsWith(local+'/')));assert.ok(![...assets].some(url=>url.includes('/play/')));
    for(const route of ['/play/','/play/assets/index-private.js','/sw.js','/?arcade=1','/index.html','/manage','/v1/creations'])assert.ok((await ctx.request.get(local+route)).status()>=400);
    const first=completed++===0;
    // Each engine redeems into this fixed host. Revoke old devices before the second run.
    const issued=first?{invitation:family.invitation}:await mutate('recover',family.id);
    await p.goto(local+(first?'/invitation':'/recovery'));await p.locator('[name=invitation]').fill(String(issued.invitation));
    await p.locator('[name=passphrase]').fill(parent);await p.getByRole('checkbox').check();await p.getByRole('button',{name:'Pair this device'}).click();await p.locator('#paired output').waitFor();
    const pair=await p.locator('#paired output').innerText();await mutate('verify',family.id,{pairingCode:pair,receipt:'synthetic-browser-'+engine});
    await p.goto(local+'/grown-ups');await p.getByLabel('Parent passphrase').fill(parent);await p.getByRole('button',{name:'Unlock family controls'}).click();
    await p.getByRole('button',{name:'Add an explorer'}).click();await p.getByText(/explorer profiles\./).waitFor();
    await p.goto(local+'/acknowledge');await p.screenshot({path:out+'/'+engine+'-acknowledgment.png',fullPage:true});
    await p.getByLabel('Parent passphrase').fill(parent);for(const box of await p.getByRole('checkbox').all())await box.check();
    await p.getByRole('button',{name:'Enter Jems'}).click();await p.waitForURL('**/play/');
    await p.waitForFunction(()=>Boolean((window as any).FG?.store?.current()?.id));await p.locator('#studioLibraryTitle, #studioWelcomeTitle').first().waitFor({state:'attached'});
    assert.equal(await p.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).length),0);
    await p.getByRole('button',{name:'End play'}).click();await p.waitForURL(/\/(?:login|acknowledge)$/);
    assert.equal((await ctx.request.get(local+'/play/')).status(),401);
    await p.goBack();assert.equal(await p.locator('#studioLibraryTitle').count(),0);assert.deepEqual(errors,[]);
    await ctx.close();console.log(engine+' passed three layouts, invitation, verification, family profile, play gate and logout');
   }finally{await browser.close();}
  }
 }finally{server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));rmSync(dir,{recursive:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

import assert from 'node:assert/strict';
import {createServer,type ServerOptions} from 'node:https';
import type {AddressInfo} from 'node:net';
import {chromium,webkit} from 'playwright';
import {betaFixture,fixtureKey} from './beta-fixture';
import {familyOrigin} from '../server/beta/model';
import {betaRouter} from '../server/beta/router';
import {betaHosting} from '../server/beta/hosting';
import {syntheticHttpsTunnel} from './beta-https';

/** Two actual HTTPS family origins, native cookies/storage and one browser partition. */
export async function browserIsolation(tls:ServerOptions,engine:'chromium'|'webkit'){
 const {d,enroll,mutate}=await betaFixture();
 const a=await enroll('browser-isolation-a'),b=await enroll('browser-isolation-b');
 const originA=familyOrigin(d.config,a.id),originB=familyOrigin(d.config,b.id);
 const handler=betaRouter(d,fixtureKey,{runtime:async()=>async(_req,res)=>{res.writeHead(503,{'Content-Type':'application/json'});res.end('{"errorCode":"FIXTURE_OFFLINE"}');},
  surface:betaHosting('dist-family-beta',d.config,'https://preview.example')});
 const server=createServer(tls,(req,res)=>{void handler(req,res);});
 await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));
 const tunnel=await syntheticHttpsTunnel((server.address() as AddressInfo).port,[new URL(originA).host,new URL(originB).host]);
 try{
  const browser=await (engine==='webkit'?webkit:chromium).launch({proxy:tunnel.proxy,
   ...(engine==='chromium'&&process.env.BETA_CHROMIUM_PATH?{executablePath:process.env.BETA_CHROMIUM_PATH}:{})});
  try{
   const ctx=await browser.newContext({ignoreHTTPSErrors:true});
   async function enrollBrowser(origin:string,credentials:string){
    for(const pair of credentials.split('; ')){
     const at=pair.indexOf('=');
     await ctx.addCookies([{name:pair.slice(0,at),value:pair.slice(at+1),url:origin,secure:true,httpOnly:true,sameSite:'Strict'}]);
    }
   }
   const page=await ctx.newPage(),other=await ctx.newPage();
   const check=(p=page)=>p.evaluate(async()=>(await fetch('/entry/check')).status);
   const saved=(p=page)=>p.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>((ok,no)=>{const q=indexedDB.open('synthetic-isolation',1);q.onupgradeneeded=()=>q.result.createObjectStore('items');q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});
    try{return await new Promise<string|undefined>((ok,no)=>{const q=db.transaction('items').objectStore('items').get('creation');q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});}finally{db.close();}
   });
   await enrollBrowser(originA,a.cookies);await page.goto(originA);assert.equal(await check(),200);
   const cookiesA=await ctx.cookies(originA);assert.ok(cookiesA.every(cookie=>cookie.secure&&cookie.httpOnly&&!cookie.domain.startsWith('.')));
   await saved();
   await page.evaluate(async()=>{
    localStorage.setItem('synthetic-progress','family-a');
    await new Promise<void>((ok,no)=>{const q=indexedDB.open('synthetic-isolation');q.onsuccess=()=>{
     const tx=q.result.transaction('items','readwrite');tx.objectStore('items').put('family-a','creation');
     tx.oncomplete=()=>{q.result.close();ok();};tx.onerror=()=>no(tx.error);
    };q.onerror=()=>no(q.error);});
   });
   await page.goto(originB);assert.equal(await check(),401);
   await enrollBrowser(originB,b.cookies);assert.equal(await check(),200);
   assert.equal(await page.evaluate(()=>localStorage.getItem('synthetic-progress')),null);assert.equal(await saved(),undefined);
   await other.goto(originA);assert.equal(await saved(other),'family-a');assert.equal(await check(other),200);
   // Copying a valid family A credential to B still fails authoritative family/device checks.
   await enrollBrowser(originB,a.cookies);assert.equal(await check(),401);
   await enrollBrowser(originB,b.cookies);assert.equal(await check(),200);
   assert.equal(await other.evaluate(async()=>(await fetch('/entry/end',{method:'POST',headers:{'Content-Type':'application/json','X-Factory-Request':'1'},body:'{}'})).status),200);
   assert.equal(await check(other),401);assert.equal(await check(),200);
   await other.reload();assert.equal(await check(other),401);assert.equal(await saved(other),'family-a');
   // Ending A never authorizes replay of its stale token or ends B's parallel session.
   await enrollBrowser(originA,a.cookies);assert.equal(await check(other),401);assert.equal(await check(),200);
   // Server expiry is authoritative even if an old tab retains its cookies.
   await d.withFamily(b.id,async(tx,f)=>{f.plays.forEach(play=>{play.expires=Date.now()-1;});tx.set(d.path(b.id),f);});
   assert.equal(await check(),401);
   await mutate('revoke',b.id);assert.equal(await check(),403);
   await page.goto(originA);assert.equal(await saved(),'family-a');assert.equal(await page.evaluate(()=>localStorage.getItem('synthetic-progress')),'family-a');
   console.log(engine+' passed two real HTTPS family origins, parallel tabs, forged cross-family cookies, expiry and permanent revocation');
  }finally{await browser.close();}
 }finally{await tunnel.close();server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));}
}

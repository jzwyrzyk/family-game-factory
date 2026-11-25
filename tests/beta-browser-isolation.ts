import assert from 'node:assert/strict';
import {createServer,type ServerOptions} from 'node:https';
import type {AddressInfo} from 'node:net';
import {chromium} from 'playwright';
import {betaFixture,fixtureKey} from './beta-fixture';
import {familyOrigin} from '../server/beta/model';
import {betaRouter} from '../server/beta/router';
import {betaHosting} from '../server/beta/hosting';

/** Use two real HTTPS hostnames and one browser partition, with local-only DNS. */
export async function browserIsolation(tls:ServerOptions){
 const {d,enroll}=await betaFixture();
 const a=await enroll('browser-isolation-a'),b=await enroll('browser-isolation-b');
 const originA=familyOrigin(d.config,a.id),originB=familyOrigin(d.config,b.id);
 const handler=betaRouter(d,fixtureKey,{runtime:async()=>{throw Error('Unexpected runtime request');},
  surface:betaHosting('dist-family-beta',d.config,'https://preview.example')});
 const server=createServer(tls,(req,res)=>{void handler(req,res);});
 await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));
 try{
  const browser=await chromium.launch({executablePath:process.env.BETA_CHROMIUM_PATH,
   args:['--no-proxy-server','--host-resolver-rules=MAP *.workshop.example 127.0.0.1:'+(server.address() as AddressInfo).port]});
  try{
   const ctx=await browser.newContext({ignoreHTTPSErrors:true});
   async function enrollBrowser(origin:string,credentials:string){
    for(const pair of credentials.split('; ')){
     const at=pair.indexOf('=');
     await ctx.addCookies([{name:pair.slice(0,at),value:pair.slice(at+1),url:origin,secure:true,httpOnly:true,sameSite:'Strict'}]);
    }
   }
   const page=await ctx.newPage();
   const check=()=>page.evaluate(async()=>(await fetch('/entry/check')).status);
   const saved=()=>page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>((ok,no)=>{const q=indexedDB.open('synthetic-isolation',1);q.onupgradeneeded=()=>q.result.createObjectStore('items');q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});
    try{return await new Promise<string|undefined>((ok,no)=>{const q=db.transaction('items').objectStore('items').get('creation');q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});}finally{db.close();}
   });
   await enrollBrowser(originA,a.cookies);await page.goto(originA);assert.equal(await check(),200);
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
   assert.equal(await page.evaluate(()=>localStorage.getItem('synthetic-progress')),null);
   assert.equal(await saved(),undefined);
   await page.goto(originA);assert.equal(await saved(),'family-a');
   assert.equal(await page.evaluate(async()=>(await fetch('/entry/end',{method:'POST',headers:{'Content-Type':'application/json','X-Factory-Request':'1'},body:'{}'})).status),200);
   assert.equal(await check(),401);
   await page.goto(originB);assert.equal(await check(),200);
  }finally{await browser.close();}
 }finally{server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));}
}

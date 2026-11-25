import assert from 'node:assert/strict';
import {createServer,type ServerOptions} from 'node:https';
import type {AddressInfo} from 'node:net';
import {chromium,webkit} from 'playwright';
import {betaFixture,fixtureKey,operator} from './beta-fixture';
import {betaRouter} from '../server/beta/router';
import {betaHosting} from '../server/beta/hosting';
import {syntheticHttpsTunnel} from './beta-https';

export async function operatorBrowser(tls:ServerOptions,engine:'chromium'|'webkit'){
 const {d,enroll}=await betaFixture(),existing=await enroll('operator-existing');
 const origin=d.config.hubOrigin;
 const handler=betaRouter(d,fixtureKey,{runtime:async()=>{throw Error('Unexpected runtime request');},
  adminIdentity:async assertion=>{if(assertion!=='synthetic-iap-identity')throw Error('ADMIN_REQUIRED');return d.config.administrator.subject;},
  surface:betaHosting('dist-family-beta',d.config,'https://preview.example')});
 const server=createServer(tls,(req,res)=>{void handler(req,res);});await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));
 const tunnel=await syntheticHttpsTunnel((server.address() as AddressInfo).port,[new URL(origin).host]);
 try{
  const browser=await (engine==='webkit'?webkit:chromium).launch({proxy:tunnel.proxy,...(engine==='chromium'&&process.env.BETA_CHROMIUM_PATH?{executablePath:process.env.BETA_CHROMIUM_PATH}:{})});
  try{
   const ctx=await browser.newContext({ignoreHTTPSErrors:true,extraHTTPHeaders:{'X-Goog-IAP-JWT-Assertion':'synthetic-iap-identity'}}),page=await ctx.newPage();
   const confirm=async()=>{await page.getByLabel('Operator passphrase').fill(operator);await page.getByRole('button',{name:'Confirm change',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});};
   await page.goto(origin+'/manage');await page.getByLabel('New family’s private contact reference').fill('operator-new');await page.getByRole('button',{name:'Create family',exact:true}).click();await confirm();
   await page.getByRole('button',{name:'Issue or replace invitation',exact:true}).click();await confirm();await page.locator('output').waitFor();
   assert.equal((await page.locator('output').textContent())!.length,43);
   await page.getByRole('button',{name:'Revoke current invitation',exact:true}).click();await confirm();
   await page.getByLabel('Family monthly limit (USD)').fill('0.21');await page.getByRole('button',{name:'Save family policy',exact:true}).click();await confirm();
   const created=await d.db.run(async tx=>{const directory=await tx.get<{ids:string[]}>(d.root+'/metadata/directory');return Promise.all(directory!.ids.map(id=>d.family(tx,id)));});
   const newly=created.find(f=>f.guardian.contactRef==='operator-new')!;assert.equal(newly.allowance,210000);assert.equal(newly.paused,true);assert.equal(newly.capabilities.adultPrivate,false);assert.ok(newly.invitation?.revokedAt);
   for(const [width,height] of [[1440,900],[768,1024]]){await page.setViewportSize({width,height});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-results/family-beta/'+engine+'-operator-'+width+'.png',fullPage:true});}
   await page.getByLabel('Choose a family').selectOption(existing.id);await page.getByRole('button',{name:'Request family deletion',exact:true}).click();await confirm();
   await page.getByRole('heading',{name:'Deletion in progress',exact:true}).waitFor();
   for(const action of ['Resume verified family','Start credential recovery','Save family policy','Withdraw processing consent','Request family export'])assert.equal(await page.getByRole('button',{name:action,exact:true}).count(),0);
   await page.getByLabel('Independent privacy-request verification reference').fill('synthetic-owner-erasure-receipt');await page.getByRole('button',{name:'Confirm irreversible deletion',exact:true}).click();
   assert.equal(await page.locator('dialog form').getAttribute('method'),'post');await page.getByRole('button',{name:'Cancel',exact:true}).click();
   const f=await d.withFamily(existing.id,async(_tx,f)=>f);assert.equal(f.request?.state,'requested');assert.equal(f.status,'suspended');
   console.log(engine+' operator UI created/revoked synthetic invitation, retained zero remote capability, and isolated pending deletion controls');
  }finally{await browser.close();}
 }finally{await tunnel.close();server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));}
}

/* Actual async Studio; synthetic memory guidance and IndexedDB only. */
const assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const {start}=require('./browser-server.cjs'),{exploreWelcome}=require('./studio-entry.cjs');
(async()=>{
 const server=start(process.env.STUDIO_BUILD_DIR||'test-results/storage-preview'),engine=process.env.STORAGE_BROWSER==='webkit'?webkit:chromium;
 const browser=await engine.launch({...(engine===chromium?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}:{}),headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1000,height:900}}),page=await context.newPage(),errors=[];let paid=0;
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());page.on('request',request=>{if(/\/v1\/(jobs|coach)(\/|$)/.test(new URL(request.url()).pathname)&&request.method()==='POST')paid++;});
  await page.route(url=>url.pathname==='/arcade/',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('<html','<html data-private-beta="true" data-parent-guidance="true"')});});
  await page.route('**/entry/parent-guidance',route=>{const body=route.request().postDataJSON();return route.fulfill({contentType:'application/json',body:JSON.stringify(body.supervise?{token:'synthetic-proof',profileId:body.profileId,expiresAt:Date.now()+60000}:{ended:true})});});
  await page.goto(`http://127.0.0.1:${server.address().port}/arcade/?studio=1`);await page.waitForFunction(()=>FG.studio);await exploreWelcome(page);await page.click('#studioNew');await page.locator('#studioPrompt').waitFor({state:'visible'});await page.click('#homeBtn');
  const original=await page.evaluate(()=>FG.studio.captureNotebook());
  await Promise.all([page.waitForNavigation(),page.evaluate(()=>FG.studio.prepareIndexedNotebook())]);await page.waitForFunction(()=>FG.studio);
  for(const action of ['create','open']){
   await page.evaluate(()=>{FG.store.current().grade=0;document.getElementById('parentGuidanceStart').click();});
   await page.waitForFunction(()=>document.getElementById('parentGuidanceStatus')?.textContent?.includes('Stay together'));
   await page.click('#homeBtn');await page.locator('#studioNew').waitFor({state:'visible'});
   await page.evaluate(()=>{const digest=crypto.subtle.digest.bind(crypto.subtle);window.studioBlocked=false;let armed=true;crypto.subtle.digest=async(...args)=>{const result=await digest(...args);if(armed){armed=false;window.studioBlocked=true;await new Promise(resolve=>{window.releaseStudio=resolve;});}return result;};});
   if(action==='create')await page.click('#studioNew');else await page.evaluate(id=>{window.staleOpen=FG.studio.open(id,false).catch(()=>{});},original.sessions[0].id);
   await page.waitForFunction(()=>window.studioBlocked===true);
   await page.evaluate(()=>{document.getElementById('parentGuidanceEnd').click();window.releaseStudio();});
   if(action==='create')await page.waitForFunction(()=>document.getElementById('studioGlobalStatus')?.textContent?.includes('guided creation session ended'));
   else await page.evaluate(()=>window.staleOpen);
   assert.equal(await page.locator('#studioPrompt').isVisible(),false,'A revoked action must not reopen the composer');
   await page.reload();await page.waitForFunction(()=>FG.studio);const after=await page.evaluate(()=>FG.studio.captureNotebook());assert.equal(after.sessions.length,original.sessions.length,'A pending new idea cannot commit after guidance ends');
  }
  assert.equal(paid,0);assert.deepEqual(errors,[]);console.log(JSON.stringify({browser:process.env.STORAGE_BROWSER??'chromium',checks:['revocation while new idea waits','revocation while saved idea opens','no paid request or stale composer']}));await context.close();
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});

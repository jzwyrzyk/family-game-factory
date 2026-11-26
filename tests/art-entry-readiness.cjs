/* Production-bundle journeys with synthetic pixels and controlled transport.
 * Local art must remain usable when the remote workshop is slow or unavailable.
 * No provider, private family data, or production upload is involved.
 */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {start}=require('./browser-server.cjs');
const {exploreWelcome,completeWelcome,waitForWelcome}=require('./studio-entry.cjs');

const output=path.resolve('test-results/art-entry-readiness');
fs.mkdirSync(output,{recursive:true});
const ready=page=>page.waitForFunction(()=>window.FG?.artStudio&&window.FG?.creation&&window.FG?.studio,undefined,{timeout:5000});
const inView=(page,selector)=>page.locator(selector).evaluate(node=>{
 const box=node.getBoundingClientRect();
 return box.width>0&&box.height>0&&box.top>=0&&box.bottom<=innerHeight&&box.left>=0&&box.right<=innerWidth;
});
async function artRecords(page){
 return page.evaluate(async()=>{
  const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('family-private-drawings-v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  try{return await new Promise((resolve,reject)=>{const request=db.transaction('drawings').objectStore('drawings').getAll();request.onsuccess=()=>resolve(request.result.map(({id,owner,name,sha256})=>({id,owner,name,sha256})));request.onerror=()=>reject(request.error);});}
  finally{db.close();}
 });
}
async function upload(page,name){
 const buffer=Buffer.from(await page.evaluate(()=>{
  const canvas=document.createElement('canvas');canvas.width=180;canvas.height=120;
  const pen=canvas.getContext('2d');pen.fillStyle='#fff';pen.fillRect(0,0,180,120);
  pen.fillStyle='#9f85d9';pen.beginPath();pen.ellipse(90,65,44,38,0,0,Math.PI*2);pen.fill();
  pen.fillStyle='#23334e';pen.fillRect(72,53,8,8);pen.fillRect(101,53,8,8);
  return canvas.toDataURL('image/png').split(',')[1];
 }),'base64');
 const choosing=page.waitForEvent('filechooser');
 await page.locator('#artUploadButton').click();
 await (await choosing).setFiles({name,mimeType:'image/png',buffer});
 await page.waitForFunction(()=>document.getElementById('artStatus')?.textContent.includes('picture is saved'));
 await selectedArtOnscreen(page);
}
async function selectedArtOnscreen(page){
 await page.waitForFunction(()=>{
  const heading=document.getElementById('artDetailTitle');
  if(!heading||document.activeElement!==heading)return false;
  const box=heading.getBoundingClientRect();return box.top>=0&&box.bottom<=innerHeight;
 });
 assert.equal(await inView(page,'#artDetailTitle'),true,'phone save brings the selected artwork and its heading into view');
}
async function choosePlayer(page,index){
 const menu=page.locator('#studioProfileMenu');
 if(!await menu.evaluate(node=>node.open))await menu.locator('summary').click();
 await page.locator('#profile-choices .profile-choice').nth(index).click();
 await page.waitForFunction(value=>FG.store.current().id==='player'+(value+1),index);
 await waitForWelcome(page);
}
async function prepare(browser){
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();page.setDefaultTimeout(10000);
 const errors=[],posts=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(request.method()==='POST')posts.push(request.url());});
 return {context,page,errors,posts};
}

async function delayedConfig(browser,base){
 const {context,page,errors,posts}=await prepare(browser);
 const api='https://art-entry-api.test',preview='https://art-entry-preview.test';
 const cors={'Access-Control-Allow-Origin':new URL(base).origin,'Access-Control-Allow-Credentials':'true'};
 let releaseConfig,requests=0,released=false;
 const held=new Promise(resolve=>{releaseConfig=()=>{released=true;resolve();};});
 try{
  await page.route('**/factory-config.json',async route=>{
   requests++;await held;
   await route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'remote',apiBaseUrl:api,previewOrigin:preview})});
  });
  await page.route(api+'/**',route=>{
   const endpoint=new URL(route.request().url()).pathname;
   const body=endpoint==='/v1/creations'?[]:endpoint==='/v1/sessions/status'?{connected:false,trusted:false}:{available:false};
   return route.fulfill({headers:cors,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(base+'?art=1',{waitUntil:'domcontentloaded'});await ready(page);
  await page.locator('#page-art-studio').waitFor({state:'visible'});
  assert.ok(requests>0,'the remote configuration is actually in flight');
  assert.equal(released,false,'the Art Studio opens before any workshop configuration reply');
  await upload(page,'My first creature.png');
  const original=(await artRecords(page))[0];
  assert.equal(original.owner,'player1');assert.equal(original.name,'My first creature');
  assert.equal(released,false,'a real file-picker upload is saved while configuration remains pending');

  // Change owners and start writing before the delayed configuration arrives.
  // Its eventual readiness callback must not restore the old owner or entrance.
  await choosePlayer(page,1);
  if(await page.locator('#studioWelcome').isVisible())await completeWelcome(page,'nova');
  else await page.locator('#studioNavCreate').click();
  await page.locator('#page-studio').waitFor({state:'visible'});
  assert.equal(await page.locator('#studioUseDrawing').isVisible(),false,'extra tools do not crowd the new-game conversation');
  assert.equal(await page.locator('#studioMoreChoices').evaluate(node=>node.open),false,'new-game tools start collapsed');
  await page.locator('#studioMoreChoices > summary').click();
  assert.equal(await page.locator('#studioUseDrawing').isVisible(),true,'the same guarded picture entrance is available in More choices');
  assert.equal(await page.locator('#studioUseDrawing').textContent().then(value=>value.trim()),'Use my picture');
  const draft='A kite catches purple bubbles for this player.';
  await page.locator('#studioPrompt').fill(draft);
  releaseConfig();
  await page.waitForFunction(()=>FG.studio.mode()==='remote');
  await page.waitForFunction(()=>document.getElementById('studioAvailability')?.textContent.includes('not connected'));
  assert.equal(await page.evaluate(()=>FG.store.current().id),'player2','late remote readiness preserves the selected player');
  assert.equal(await page.locator('#page-studio').isVisible(),true,'late configuration does not replay the original art deep link');
  assert.equal(await page.locator('#studioPrompt').inputValue(),draft,'late configuration preserves the current idea text');
  assert.equal(await page.locator('#studioPrompt').evaluate(node=>document.activeElement===node),true,'late readiness does not move focus away from the child’s idea');
  await page.locator('#studioUseDrawing').click();
  const picker=page.getByRole('dialog',{name:'Choose game artwork'});
  await picker.waitFor();
  assert.equal(await picker.locator('[data-private-art]').count(),0,'the new player cannot see the previous player’s uploaded picture');
  await picker.getByRole('button',{name:'Draw or add a picture'}).click();
  await page.getByRole('dialog',{name:'Add my art'}).getByText('Draw here').click();
  const paper=page.locator('dialog.drawing-paint');
  await paper.locator('[data-paper]').press('Enter');
  await paper.locator('[data-title]').fill('My hunt picture');
  await paper.locator('[data-save]').click();
  await picker.getByRole('button',{name:'Start my picture hunt'}).waitFor();
  assert.equal(await page.locator('#studioPrompt').inputValue(),draft,'new art returns to the same pending idea');
  await picker.getByRole('button',{name:'Start my picture hunt'}).click();
  await page.locator('#creationWorkspace').waitFor();
  const hunt=await page.evaluate(()=>FG.creation.scene());
  assert.equal(hunt.actors[0].role,'collectible');
  assert.ok(hunt.actors[0].assetId.startsWith('art:image:'));
  await page.locator('#creationMore > summary').click();
  await page.locator('#creationSource').getByRole('button',{name:'Back to my game'}).click();
  await page.locator('#page-studio').waitFor({state:'visible'});
  assert.equal(await page.locator('#studioPrompt').inputValue(),draft,'return from the new picture hunt reopens the original draft');

  await choosePlayer(page,0);await exploreWelcome(page);
  assert.equal(await inView(page,'#studioArt'),true,'the home Art Studio entrance is visible above the game catalogue on a phone');
  await page.locator('#studioArt').click();
  await page.locator('[data-art-id="'+original.id+'"]').click();
  await page.getByLabel('Artwork name',{exact:true}).fill('My private creature');
  await page.getByRole('button',{name:'Save details',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('artStatus')?.textContent==='Artwork details saved.');
  const renamed=(await artRecords(page)).find(item=>item.id===original.id);
  assert.equal(renamed.name,'My private creature');assert.equal(renamed.sha256,original.sha256,'metadata saving retains the original pixels');
  await page.locator('#artEditMovement').click();
  await page.locator('dialog.drawing-lab').waitFor({state:'visible'});
  await page.locator('.drawing-lab [data-close]').click();
  await page.locator('dialog.drawing-lab').waitFor({state:'detached'});
  await page.locator('#artUseScene').click();
  await page.locator('#creationWorkspace').waitFor({state:'visible'});
  assert.ok(await page.evaluate(()=>FG.creation.scene().actors[0].assetId.startsWith('art:')),'the selected picture becomes an editable scene character');
  const sibling=await page.evaluate(()=>FG.studio.exportNotebook().sessions.find(session=>session.owner==='player2'));
  assert.equal(sibling.draft,draft,'using the first player’s art keeps the sibling’s saved idea intact');
  assert.deepEqual(posts,[],'local uploads, scene use and configuration readiness make no POST or provider request');
  assert.deepEqual(errors,[],'no browser exception during delayed initialization');
  console.log('PASS Art entry with delayed configuration: phone upload/focus, profile switch, late readiness, home/expanded-chat entrances, private library, movement and editable scene');
 }catch(error){await page.screenshot({path:path.join(output,'delayed-config-failure.png'),fullPage:true}).catch(()=>{});throw error;}
 finally{releaseConfig();await context.close();}
}

async function rejectedConfig(browser,base){
 const {context,page,errors,posts}=await prepare(browser);
 try{
  await page.route('**/factory-config.json',route=>route.abort('failed'));
  await page.goto(base+'?art=1',{waitUntil:'domcontentloaded'});await ready(page);
  await page.locator('#page-art-studio').waitFor({state:'visible'});
  await upload(page,'Offline creature.png');
  await page.locator('#artDrawButton').click();
  const drawing=page.locator('dialog.drawing-paint');
  await drawing.waitFor({state:'visible'});
  await drawing.locator('[data-paper]').press('Enter');
  await drawing.locator('[data-title]').fill('My offline dot');
  await drawing.getByRole('button',{name:'Keep my drawing',exact:true}).click();
  await drawing.waitFor({state:'detached'});await selectedArtOnscreen(page);
  assert.equal(await page.locator('#artDetailTitle').textContent(),'My offline dot','a saved canvas drawing reveals its own details after the modal closes');
  const originals=await artRecords(page);assert.equal(originals.length,2);
  await page.reload({waitUntil:'domcontentloaded'});await ready(page);
  await page.locator('#page-art-studio').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelectorAll('.art-card').length===2);
  assert.deepEqual(await artRecords(page),originals,'both originals survive a reload with remote configuration unavailable');
  assert.deepEqual(posts,[],'offline drawing and upload never post private images');
  assert.deepEqual(errors,[],'failed remote configuration does not cause a local-art exception');
  console.log('PASS Art entry with rejected configuration: phone upload, keyboard drawing, post-dialog focus and durable private library');
 }catch(error){await page.screenshot({path:path.join(output,'rejected-config-failure.png'),fullPage:true}).catch(()=>{});throw error;}
 finally{await context.close();}
}

async function savedPreviewAfterConfig(browser,base){
 const {context,page,errors,posts}=await prepare(browser);
 const api='https://saved-art-entry-api.test',preview='https://saved-art-entry-preview.test';
 const cors={'Access-Control-Allow-Origin':new URL(base).origin,'Access-Control-Allow-Credentials':'true'};
 let releaseConfig,released=false,previewGets=0;
 const held=new Promise(resolve=>{releaseConfig=()=>{released=true;resolve();};});
 // A previous, already-kept remote game is an explicit persistence fixture.
 // Its existence does not claim this test generated or paid for a real game.
 const session={id:'saved-remote-fixture',owner:'player1',name:'My saved fixture game',game:'new',projectId:null,
  remoteId:'saved-fixture-revision',remoteKind:'generated-module-v2',candidate:null,draft:'Keep my next idea safe.',
  messages:[],job:null,updated:'2026-11-19T12:00:00.000Z',hypothesis:'',reflection:false};
 try{
  await page.addInitScript(session=>{
   if(window.top!==window)return;
   localStorage.setItem('family-game-factory-studio-v1',JSON.stringify({version:1,sessions:[session],active:{player1:session.id}}));
  },session);
  await page.route('**/factory-config.json',async route=>{
   await held;
   await route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'remote',apiBaseUrl:api,previewOrigin:preview})});
  });
  await page.route(api+'/**',route=>{
   const endpoint=new URL(route.request().url()).pathname;
   let body;
   if(endpoint==='/v1/revisions/saved-fixture-revision/preview'){
    assert.equal(route.request().method(),'GET','explicit preview retry is read-only');previewGets++;
    body={url:preview+'/saved-game',projectId:'saved-fixture-project',artifactId:'saved-fixture-artifact',expiresAt:Date.now()+60000,kind:'generated-module-v2',adapter:'mock'};
   }else body=endpoint==='/v1/creations'?[]:endpoint==='/v1/sessions/status'?{connected:false,trusted:false}:{available:false};
   return route.fulfill({headers:cors,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.route(preview+'/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><title>Saved game transport fixture</title><h1>Previously saved fixture</h1><script>
   const channel=new URLSearchParams(location.search).get('channel'),artifactId='saved-fixture-artifact';
   addEventListener('message',event=>{if(event.source===parent&&event.data.type==='factory-learning'&&event.data.channel===channel&&event.data.artifactId===artifactId&&event.data.action==='connect')parent.postMessage({type:'factory-preview',channel,artifactId,event:'ready',height:400,learningProtocol:1},'*')});
  <\/script>`}));
  await page.goto(base,{waitUntil:'domcontentloaded'});await ready(page);await waitForWelcome(page);
  await page.locator('[data-session="saved-remote-fixture"] .studio-saved-open').click();
  await page.waitForFunction(()=>/unavailable|not connected|not ready/i.test(document.getElementById('studioStatus')?.textContent||''));
  assert.equal(released,false,'the first preview is attempted before remote configuration arrives');
  assert.equal(previewGets,0,'an unconfigured preview cannot contact a remote service');
  assert.equal(await page.locator('#studioRemoteHost iframe').count(),0);
  const before=await page.evaluate(()=>FG.studio.exportNotebook().sessions.find(session=>session.id==='saved-remote-fixture'));
  releaseConfig();await page.waitForFunction(()=>FG.studio.mode()==='remote');
  await page.waitForFunction(()=>document.getElementById('studioAvailability')?.textContent.includes('not connected'));
  assert.equal(previewGets,0,'configuration readiness does not automatically replay the preview request');
  assert.deepEqual(await page.evaluate(()=>FG.studio.exportNotebook().sessions.find(session=>session.id==='saved-remote-fixture')),before,'readiness alone does not rewrite the saved game or its next idea');
  const previewRequest=page.waitForRequest(request=>request.url()===api+'/v1/revisions/saved-fixture-revision/preview');
  await page.locator('#studioPlay').click();await previewRequest;
  await page.locator('#studioRemoteHost iframe').waitFor({state:'visible'});
  assert.equal(previewGets,1,'one explicit Play retry uses the newly available remote configuration');
  const after=await page.evaluate(()=>FG.studio.exportNotebook().sessions.find(session=>session.id==='saved-remote-fixture'));
  for(const key of ['id','owner','name','remoteId','draft','candidate','job'])assert.deepEqual(after[key],session[key],'retry preserves saved '+key);
  assert.deepEqual(posts,[],'configuration recovery and saved-game preview make no POST or generation request');
  assert.deepEqual(errors,[],'no browser exception while replacing an unconfigured client');
  console.log('PASS saved remote game after delayed configuration: initial unavailable preview, explicit read-only retry, unchanged saved work and no paid replay');
 }catch(error){await page.screenshot({path:path.join(output,'saved-preview-failure.png'),fullPage:true}).catch(()=>{});throw error;}
 finally{releaseConfig();await context.close();}
}

async function readinessPageLifecycle(browser,base){
 const {context,page,errors,posts}=await prepare(browser),api='https://page-readiness-api.test';
 const cors={'Access-Control-Allow-Origin':new URL(base).origin,'Access-Control-Allow-Credentials':'true'};
 let release;const held=new Promise(resolve=>{release=resolve;});const handlers=[];
 try{
  await page.addInitScript(()=>{
   const fetch=window.fetch;window.readinessProbes=[];window.readinessDocumentId=crypto.randomUUID();
   window.fetch=function(input,init){
    const path=new URL(typeof input==='string'?input:input.url,location.href).pathname;
    if(!/^\/v1\/(coach|builder)\/status$/.test(path))return fetch.call(this,input,init);
    const probe={path,signal:init.signal,settled:false};window.readinessProbes.push(probe);
    return fetch.call(this,input,init).finally(()=>{probe.settled=true;});
   };
  });
  await page.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'remote',apiBaseUrl:api,previewOrigin:'https://page-readiness-preview.test'})}));
  await page.route(api+'/**',route=>{
   const endpoint=new URL(route.request().url()).pathname;
   const run=(async()=>{if(/^\/v1\/(coach|builder)\/status$/.test(endpoint))await held;await route.fulfill({headers:cors,contentType:'application/json',body:JSON.stringify(endpoint==='/v1/creations'?[]:{available:true})});})();handlers.push(run);return run;
  });
  await page.goto(base);await ready(page);await page.waitForFunction(()=>window.readinessProbes?.length===2);
  const firstDocument=await page.evaluate(()=>window.readinessDocumentId);
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
  assert.equal(await page.evaluate(()=>window.readinessProbes.every(probe=>probe.signal.aborted)),true,'Page hide cancels both native read-only status requests.');
  await page.evaluate(()=>window.dispatchEvent(new Event('factory-session-restored')));
  assert.equal(await page.evaluate(()=>window.readinessProbes.length),2,'A hidden page cannot restart readiness requests.');
  release();await Promise.all(handlers);
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  // The existing save-authority guard reloads a restored history document.
  // Verify fresh ready checks in that replacement, not a permanently stopped UI.
  await page.waitForFunction(id=>window.readinessDocumentId!==id&&window.readinessProbes?.length===2&&window.readinessProbes.every(probe=>probe.settled),firstDocument);
  assert.equal(await page.evaluate(()=>window.readinessProbes.every(probe=>!probe.signal.aborted)),true,'A restored page starts fresh readiness requests after the safe reload.');
  assert.deepEqual(posts,[],'Readiness cancellation and restoration never send paid requests.');assert.deepEqual(errors,[]);
  console.log('PASS native readiness cancellation on pagehide, no hidden restart, fresh pageshow checks and no paid request');
 }catch(error){console.error('Readiness lifecycle failure',await page.evaluate(()=>({probes:window.readinessProbes?.map(probe=>({path:probe.path,aborted:probe.signal.aborted,settled:probe.settled})),hidden:document.documentElement.hidden})),errors);throw error;}finally{release();await context.close();}
}

(async()=>{
 const server=start();await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}/arcade/`;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
 try{await delayedConfig(browser,base);await rejectedConfig(browser,base);await savedPreviewAfterConfig(browser,base);await readinessPageLifecycle(browser,base);}
 finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

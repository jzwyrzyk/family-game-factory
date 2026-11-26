/* Real production UI with synthetic art. No cloud service or child image. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {start}=require('./browser-server.cjs');
const {exploreWelcome,waitForWelcome,navigate}=require('./studio-entry.cjs');
const output=path.resolve('test-results/art-studio');
fs.mkdirSync(output,{recursive:true});
const ready=page=>page.waitForFunction(()=>window.FG?.artStudio&&window.FG?.creation);
async function fixture(page,kind='car'){
 return Buffer.from(await page.evaluate(kind=>{
  const c=document.createElement('canvas');c.width=600;c.height=420;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,600,420);g.lineJoin='round';g.lineWidth=8;g.strokeStyle='#22304d';
  if(kind==='car'){
   g.fillStyle='#53bfab';g.beginPath();g.roundRect(65,150,470,135,35);g.fill();g.stroke();g.fillStyle='#4db7a6';g.beginPath();g.moveTo(155,153);g.lineTo(205,80);g.lineTo(360,80);g.lineTo(435,155);g.closePath();g.fill();g.stroke();
   g.fillStyle='#cff0ff';g.fillRect(220,95,57,50);g.fillRect(290,95,58,50);g.fillStyle='#ffd45e';g.beginPath();g.arc(490,185,18,0,Math.PI*2);g.fill();
   for(const x of [175,425]){g.fillStyle='#293958';g.beginPath();g.arc(x,290,55,0,Math.PI*2);g.fill();g.fillStyle='#f9b6c6';g.beginPath();g.arc(x,290,32,0,Math.PI*2);g.fill();g.fillStyle='#fff2ce';g.beginPath();g.arc(x,290,12,0,Math.PI*2);g.fill();}
  }else if(kind==='character'){
   g.fillStyle='#b397e7';g.beginPath();g.roundRect(155,90,290,255,100);g.fill();g.stroke();g.fillStyle='#b397e7';for(const x of [190,400]){g.beginPath();g.moveTo(x,115);g.lineTo(x+25,40);g.lineTo(x+55,125);g.fill();g.stroke();}
   for(const x of [245,355]){g.fillStyle='white';g.beginPath();g.arc(x,190,31,0,Math.PI*2);g.fill();g.fillStyle='#20314e';g.beginPath();g.arc(x+5,190,13,0,Math.PI*2);g.fill();}
   g.strokeStyle='#4c3764';g.beginPath();g.arc(300,230,38,.1*Math.PI,.9*Math.PI);g.stroke();g.fillStyle='#ffbfd1';g.beginPath();g.arc(202,233,22,0,Math.PI*2);g.arc(398,233,22,0,Math.PI*2);g.fill();
  }else{g.fillStyle='#8db977';g.fillRect(289,170,18,200);for(const [x,y]of [[235,120],[300,70],[365,120],[345,190],[255,190]]){g.fillStyle='#ed9bb9';g.beginPath();g.arc(x,y,50,0,Math.PI*2);g.fill();}g.fillStyle='#ffd36d';g.beginPath();g.arc(300,140,43,0,Math.PI*2);g.fill();}
  return c.toDataURL('image/png').split(',')[1];
 },kind),'base64');
}
async function upload(page,name,kind){await page.setInputFiles('#artUpload',{name,mimeType:'image/png',buffer:await fixture(page,kind)});await page.waitForFunction(()=>document.getElementById('artStatus').textContent.includes('picture is saved'));}
async function count(page){return page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('family-private-drawings-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise((resolve,reject)=>{const r=db.transaction('drawings').objectStore('drawings').getAll();r.onsuccess=()=>resolve(r.result.filter(x=>x.owner===window.FG.store.current().id));r.onerror=()=>reject(r.error);});}finally{db.close();}});}
async function noOverflow(page,label){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' has no horizontal overflow');}
(async()=>{
 const server=start();await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}/arcade/`,browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
 let page;
 try{
  const context=await browser.newContext({viewport:{width:1360,height:950}});page=await context.newPage();page.setDefaultTimeout(20000);
  const errors=[],posts=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.method()==='POST')posts.push(request.url());});page.on('dialog',dialog=>void dialog.accept());
  await page.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'unavailable'})}));
  await page.goto(base+'?art=1');await ready(page);await page.locator('#page-art-studio').waitFor({state:'visible'});await page.locator('#artEmpty').waitFor({state:'visible'});
  await noOverflow(page,'empty desktop studio');
  await upload(page,'Jellybean racer.png','car');const before=(await count(page))[0];assert.equal(before.name,'Jellybean racer');
  await page.getByLabel('Artwork collection',{exact:true}).selectOption('vehicle');
  await page.evaluate(()=>{const original=IDBIndex.prototype.openCursor;window.__restoreArtRead=()=>{IDBIndex.prototype.openCursor=original;};IDBIndex.prototype.openCursor=function(...args){if(this.objectStore.name==='drawingMetadata'&&this.objectStore.transaction.mode==='readonly'){window.__restoreArtRead();throw Error('Art shelf could not refresh. Try opening it again.');}return original.apply(this,args);};});
  await page.getByRole('button',{name:'Save details',exact:true}).click();await page.waitForFunction(()=>document.getElementById('artStatus').textContent==='Art shelf could not refresh. Try opening it again.');
  assert.equal((await count(page))[0].category,'vehicle','metadata remains saved when shelf refresh fails');
  assert.equal(await page.locator('#artStatus').getAttribute('role'),'alert','refresh error stays visible instead of false success');
  await page.evaluate(()=>window.FG.artStudio.refresh());
  // A saved drawing establishes a returning creator before any game or scene
  // exists. The presence check must not manufacture work or a dismissed tip.
  const artOnlyNotebook=await page.evaluate(()=>FG.studio.exportNotebook());
  assert.equal(artOnlyNotebook.sessions.length,0);
  assert.equal(await page.evaluate(()=>FG.creation.export().projects.length),0);
  await page.locator('#artHome').click();await waitForWelcome(page);
  assert.equal(await page.locator('#studioWelcome').isVisible(),false,'an art-only creator returns Home without the first-creation welcome');
  assert.equal(await page.locator('#studioArt').isVisible(),true,'the creator can return to saved artwork without Explore');
  await page.goto(base);await ready(page);await waitForWelcome(page);
  assert.equal(await page.locator('#studioWelcome').isVisible(),false,'default entry recognizes existing private artwork');
  await page.reload();await ready(page);await waitForWelcome(page);
  assert.equal(await page.locator('#studioWelcome').isVisible(),false,'an art-only creator remains recognized after default reload');
  assert.equal((await count(page)).length,1,'the original artwork remains available');
  assert.deepEqual(await page.evaluate(()=>FG.studio.exportNotebook()),artOnlyNotebook,'art presence changes no projects, making evidence or guidance preferences');
  assert.equal(await page.evaluate(()=>FG.creation.export().projects.length),0);
  await page.locator('#studioArt').click();await page.locator('[data-art-id="'+before.id+'"]').click();
  await page.locator('#artEditMovement').click();await page.locator('dialog.drawing-lab').waitFor({state:'visible'});
  // Suggestions are editable guesses. Prepare this known synthetic drawing
  // through the same visible outline controls available to the maker.
  await page.locator('.dl-advanced summary').click();
  for(const [wheel,left]of [['Back wheel',20],['Front wheel',370/6]]){
   await page.locator('[data-piece-list]').getByRole('button',{name:wheel+' · wheel',exact:true}).click();
   for(const [field,value]of Object.entries({x:left,y:235/4.2,w:110/6,h:110/4.2})){
    const input=page.locator('[data-region="'+field+'"]');await input.fill(String(value));await input.press('Tab');
   }
  }
  await page.locator('[data-piece-list]').getByRole('button',{name:'Car body · body',exact:true}).click();await page.locator('.dl-advanced summary').click();
  await page.locator('dialog.drawing-lab').screenshot({path:path.join(output,'movement-editor.png')});
  await page.locator('[data-save]').click();await page.waitForFunction(()=>document.querySelector('[data-use]')?.disabled===false);
  await page.locator('[data-close]').click();await page.locator('dialog.drawing-lab').waitFor({state:'detached'});
  await page.locator('#artEditMovement').click();await page.locator('dialog.drawing-lab').waitFor({state:'visible'});
  await page.locator('[data-piece-name]').fill('My unfinished car body');await page.locator('[data-piece-name]').dispatchEvent('change');
  await page.locator('[data-close]').click();await page.locator('dialog.drawing-lab').waitFor({state:'detached'});
  await page.locator('#artResumeDraft').waitFor({state:'visible'});await page.locator('#artResumeDraft').click();await page.locator('dialog.drawing-lab').waitFor({state:'visible'});
  assert.equal(await page.locator('[data-piece-name]').inputValue(),'My unfinished car body','dedicated shelf resumes an unfinished edit even with saved versions');
  await page.locator('[data-save]').click();await page.waitForFunction(()=>document.querySelector('[data-use]')?.disabled===false);
  await page.locator('[data-close]').click();await page.locator('dialog.drawing-lab').waitFor({state:'detached'});
  await page.locator('#artUseRally').waitFor({state:'visible'});
  const beforeRally=await page.evaluate(()=>({workspace:localStorage.getItem('family-game-factory-workspace-v2'),notebook:localStorage.getItem('family-game-factory-studio-v1')}));
  await page.evaluate(()=>{const original=Storage.prototype.setItem,before=JSON.parse(localStorage.getItem('family-game-factory-studio-v1')||'{"sessions":[]}').sessions.length;window.__restoreArtNotebook=()=>{Storage.prototype.setItem=original;};Storage.prototype.setItem=function(key,value){if(key==='family-game-factory-studio-v1'&&JSON.parse(value).sessions.length>before)throw new DOMException('Notebook quota fixture','QuotaExceededError');return original.call(this,key,value);};});
  await page.locator('#artUseRally').click();await page.waitForFunction(()=>document.getElementById('artStatus').textContent.includes('Could not save the new game. Your earlier work is unchanged.'));
  assert.deepEqual(await page.evaluate(()=>({workspace:localStorage.getItem('family-game-factory-workspace-v2'),notebook:localStorage.getItem('family-game-factory-studio-v1')})),beforeRally,'failed notebook save restores both source stores exactly without an orphan Rally game');
  await page.evaluate(()=>{window.__restoreArtNotebook();const original=IDBObjectStore.prototype.put;window.__restoreArtUsage=()=>{IDBObjectStore.prototype.put=original;};IDBObjectStore.prototype.put=function(...args){if(this.name==='usage')throw new DOMException('Usage index quota fixture','QuotaExceededError');return original.apply(this,args);};});
  await page.locator('#artUseRally').click();
  await page.waitForFunction(()=>window.FG.runtime.snapshot()?.state.drawingRigId);
  await page.evaluate(()=>window.__restoreArtUsage());
  const recovered=await page.evaluate(()=>({projects:JSON.parse(localStorage.getItem('family-game-factory-workspace-v2')).projects,sessions:JSON.parse(localStorage.getItem('family-game-factory-studio-v1')).sessions}));
  assert.equal(recovered.projects.length,1,'retry creates exactly one Rally game after the compensated save');assert.equal(recovered.sessions.filter(s=>s.projectId===recovered.projects[0].id).length,1,'failed supplementary index cannot hide or duplicate the saved game');
  const ride=await page.evaluate(()=>window.FG.runtime.snapshot().state);assert.ok(ride.drawingRigId,'Rally uses immutable selected art');
  const originalBinding=await page.evaluate(()=>JSON.parse(localStorage.getItem('family-game-factory-workspace-v2')).revisions.find(r=>r.drawingRigId)?.drawingRigId);assert.equal(originalBinding,ride.drawingRigId);
  await page.screenshot({path:path.join(output,'rally-with-my-art.png'),fullPage:true});
  await navigate(page,'#studioNavHome');await page.locator('#studioArt').click();
  await page.locator('[data-art-id]').first().click();await page.locator('.art-detail-tools summary').click();await page.getByRole('button',{name:'Trim, turn & clean up',exact:true}).click();
  await page.locator('.art-picture').waitFor({state:'visible'});await page.locator('[data-edge="left"]').fill('10');await page.locator('[data-edge="left"]').dispatchEvent('change');
  await page.locator('[data-turn]').click();await page.locator('.art-picture [data-name]').fill('Jellybean close-up');
  await page.locator('.art-picture [data-save]').click();await page.locator('.art-picture').waitFor({state:'detached'});
  await page.waitForFunction(()=>document.activeElement?.id==='artDetailTitle');
  assert.equal(await page.locator('#artDetailTitle').textContent(),'Jellybean close-up','saving a picture returns focus to its new artwork, after the editor closes');
  const after=await count(page);assert.equal(after.length,2);const original=after.find(item=>item.id===before.id),copy=after.find(item=>item.sourceId===before.id);assert.equal(original.sha256,before.sha256,'picture editing preserves original hash');assert.ok(copy&&copy.sha256!==before.sha256,'picture tools save actual transformed bytes as derivative');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('family-game-factory-workspace-v2')).revisions.find(r=>r.drawingRigId)?.drawingRigId),originalBinding,'picture edits leave saved ride binding unchanged');
  await upload(page,'Mochi monster.png','character');await page.getByLabel('Artwork collection',{exact:true}).selectOption('character');await page.getByRole('button',{name:'Save details',exact:true}).click();await page.waitForFunction(()=>document.getElementById('artStatus').textContent==='Artwork details saved.');
  await upload(page,'Moonflower.png','flower');await page.getByLabel('Artwork collection',{exact:true}).selectOption('prop');await page.getByRole('button',{name:'Save details',exact:true}).click();await page.waitForFunction(()=>document.getElementById('artStatus').textContent==='Artwork details saved.');
  await page.getByRole('button',{name:'Close artwork details'}).click();await noOverflow(page,'library desktop');await page.screenshot({path:path.join(output,'art-library-desktop.png'),fullPage:true});
  await page.locator('[data-category="character"]').click();await page.waitForFunction(()=>document.getElementById('artGrid').getAttribute('aria-busy')!=='true');assert.equal(await page.locator('.art-card').count(),1);await page.locator('.art-card').click();
  await page.locator('#artEditMovement').click();await page.locator('dialog.drawing-lab').waitFor({state:'visible'});assert.equal(await page.locator('[data-kind]').inputValue(),'character','the selected collection starts the appropriate editor');
  await page.locator('.drawing-lab [data-save]').click();await page.waitForFunction(()=>document.querySelector('.drawing-lab [data-history]')?.options.length>1&&!document.querySelector('.drawing-lab [data-history]')?.disabled);
  await page.locator('.drawing-lab [data-close]').click();await page.locator('dialog.drawing-lab').waitFor({state:'detached'});
  await page.locator('#artUseScene').click();await page.locator('#creationWorkspace').waitFor({state:'visible'});assert.ok((await page.locator('#creationTitle').inputValue()).includes('Mochi'),'drawing starts its own editable scene');
  assert.ok(await page.evaluate(()=>window.FG.creation.scene().actors[0].assetId.startsWith('art:rig:')),'the scene uses the selected saved character cutout');
  await page.waitForFunction(()=>document.querySelector('#creationActors canvas'));await page.screenshot({path:path.join(output,'my-art-in-create-and-code.png'),fullPage:true});
  await navigate(page,'#studioNavHome');await page.locator('#studioArt').click();await page.locator('[data-category="all"]').click();
  await page.locator('.art-library-more summary').click();const download=page.waitForEvent('download');await page.locator('#artExport').click();const artifact=await download;assert.equal(artifact.suggestedFilename(),'my-jems-art.json');const artBundle=JSON.parse(fs.readFileSync(await artifact.path(),'utf8'));assert.equal(artBundle.drawings.length,4);assert.ok(artBundle.rigs.length>=1);
  await page.locator('.art-library-more summary').click();
  await page.setViewportSize({width:390,height:844});await noOverflow(page,'390px library');const closeIcon=await page.getByRole('button',{name:'Close artwork details'}).locator('svg').boundingBox();assert.ok(closeIcon.width>=16&&closeIcon.height>=16,'icon-only close remains visible');await page.screenshot({path:path.join(output,'art-library-phone.png'),fullPage:true});
  await page.setViewportSize({width:320,height:740});await noOverflow(page,'320px library');
  await page.locator('#artUpload').setInputFiles({name:'fake.png',mimeType:'image/png',buffer:Buffer.from('<svg onload="alert(1)"></svg>')});await page.waitForFunction(()=>document.getElementById('artStatus').classList.contains('is-error'));assert.equal((await count(page)).length,4);
  await page.setViewportSize({width:1360,height:950});await page.locator('#artHome').click();const menu=page.locator('#studioProfileMenu');if(!await menu.evaluate(e=>e.open))await menu.locator('summary').click();await page.locator('#profile-choices .profile-choice').nth(1).click();await waitForWelcome(page);
  assert.equal(await page.locator('#studioWelcome').isVisible(),true,'another player’s saved artwork does not dismiss this fresh sibling’s welcome');
  await exploreWelcome(page);await page.locator('#studioArt').click();await page.locator('#artEmpty').waitFor({state:'visible'});assert.equal(await page.locator('.art-card').count(),0,'another player cannot see prior art');
  await page.locator('#artDrawButton').click();
  const painter=page.locator('.drawing-paint');
  const paper=painter.locator('[data-paper]');
  await painter.getByLabel('Paper',{exact:true}).selectOption('transparent');
  await paper.press('Enter');
  const centerAlpha=()=>paper.evaluate(canvas=>canvas.getContext('2d').getImageData(450,280,1,1).data[3]);
  assert.equal(await centerAlpha(),255,'crayon dot uses real opaque pixels');
  await painter.getByRole('button',{name:'Eraser',exact:true}).click();
  await paper.press('Enter');
  assert.equal(await centerAlpha(),0,'eraser restores actual transparency');
  await painter.locator('[data-undo]').click();
  assert.equal(await centerAlpha(),255,'undo restores erased ink');
  await painter.locator('[data-save]').click();
  await painter.waitFor({state:'detached'});
  await page.locator('#artContinueDrawing').click();
  assert.equal(await painter.getByLabel('Paper',{exact:true}).inputValue(),'transparent');
  assert.equal(await centerAlpha(),255,'reopened crayon marks keep the saved paper and ink');
  await painter.locator('[data-exit]').click();
  assert.deepEqual(posts,[],'private artwork makes no POST or model request');assert.deepEqual(errors,[],'no browser exceptions');
  console.log('PASS Art Studio: default navigation, upload, private shelf, truthful refresh failure, metadata/filter, recovered movement draft, notebook quota retry, optional usage-index failure, saved physical ride, picture transform/original preservation, cross-scene use, art export, mobile reflow, invalid image and profile isolation');
 }catch(error){if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
 finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

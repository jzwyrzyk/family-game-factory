/* Production-browser private-art journey. Every image below is synthetic. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {once}=require('node:events');
const {start}=require('./browser-server.cjs');
const {exploreWelcome,navigate,openProfiles,openRetainedGame}=require('./studio-entry.cjs');

async function records(page,store,owner){
  return page.evaluate(async({store,owner})=>{
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('family-private-drawings-v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    try{return await new Promise((resolve,reject)=>{const request=db.transaction(store).objectStore(store).getAll();request.onsuccess=()=>resolve(request.result.filter(record=>record.owner===owner).map(record=>({...record,bytes:undefined,preview:undefined})));request.onerror=()=>reject(request.error);});}
    finally{db.close();}
  },{store,owner});
}
async function profile(page,index){
  if(await page.locator('#page-creation.has-scene').isVisible())await page.locator('#creationHome').click();
  await openProfiles(page);
  await page.locator('#profile-choices .profile-choice').nth(index).click();
  await page.waitForFunction(id=>FG.store.current().id===id,'player'+(index+1));
  await exploreWelcome(page);
}
async function pacing(page){await page.evaluate(()=>{FG.store.changeProfile({rate:1});FG.store.current().mathWindow=[Date.now()];FG.store.save();});}
async function ready(page){await page.waitForFunction(()=>window.FG?.creation?.openArt&&window.FG?.studio&&window.FG?.drawings);}

(async()=>{
 const server=start();if(!server.listening)await once(server,'listening');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
 fs.mkdirSync('test-results',{recursive:true});
 try{
  for(const [device,viewport] of [['desktop',{width:1440,height:1000}],['tablet',{width:820,height:1180}]]){
   if(process.env.ART_TEST_DEVICE&&process.env.ART_TEST_DEVICE!==device)continue;
   const context=await browser.newContext({viewport,hasTouch:device==='tablet',acceptDownloads:true,reducedMotion:'reduce'}),page=await context.newPage();
   page.setDefaultTimeout(20000);
   const errors=[],posts=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.method()==='POST')posts.push(request.url());});
   page.on('dialog',dialog=>dialog.accept());
   await page.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'unavailable'})}));
   try{
    await page.goto('http://127.0.0.1:'+server.address().port+'/arcade/');await ready(page);await exploreWelcome(page);await pacing(page);
    await page.locator('#studioSavedIdeas').click();
    const png=await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=180;canvas.height=160;
      const c=canvas.getContext('2d');c.strokeStyle='#49374e';c.lineWidth=4;c.lineJoin='round';c.lineCap='round';
      for(const [outline,color] of [
        ['M38 102 Q17 70 45 45 Q52 32 72 40 Q102 37 112 68 Q119 106 90 121 Q56 132 38 102Z','#b58ad2'],
        ['M106 72 Q122 47 160 26 Q174 27 163 44 L141 72 Q157 61 159 67 Q152 90 110 96Z','#f3a4b8'],
        ['M39 74 L14 82 L39 88Z','#f3ba5c']
      ]){
        const shape=new Path2D(outline);c.fillStyle=color;c.fill(shape);c.stroke(shape);
      }
      for(const line of ['M50 59 L49 66','M64 59 L63 66','M58 116 L54 132 L45 132','M82 120 L84 134 L96 135','M127 70 L151 48'])c.stroke(new Path2D(line));
      return canvas.toDataURL().split(',')[1];
    });
    await page.setInputFiles('#drawingUpload',{name:'Plum bird.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await page.waitForFunction(()=>document.querySelectorAll('#drawingList article').length===1);
    const source=(await records(page,'drawings','player1'))[0];assert.ok(source.sha256);
    await page.locator('#drawingList article').first().getByRole('button',{name:/Bring to life/}).click();
    await page.locator('.drawing-lab [data-kind]').selectOption('character');
    const lab=page.locator('.drawing-lab');
    await lab.locator('.dl-advanced summary').click();
    const region=async(x,y,w,h)=>{
      for(const [key,value] of Object.entries({w,h,x,y})){
        const input=lab.locator('[data-region="'+key+'"]');await input.fill(String(value));await input.press('Tab');
      }
    };
    await region(6,20,54,67);
    await page.locator('.drawing-lab [data-add]').click();
    await page.locator('.dl-canvas').press('Enter');
    await page.locator('.drawing-lab [data-piece-name]').fill('Pink wing');
    await page.locator('.drawing-lab [data-piece-name]').press('Tab');
    await page.locator('.drawing-lab [data-role]').selectOption('wing');
    await region(60,14,36,47);
    await page.locator('.drawing-lab [data-save]').click();
    await page.waitForFunction(()=>document.querySelectorAll('.drawing-lab [data-history] option').length>1);
    const rig=(await records(page,'rigs','player1'))[0];assert.ok(rig);
    await page.locator('.drawing-lab [data-close]').click();
    await page.waitForSelector('.drawing-lab',{state:'detached'});
    const firstId=await page.evaluate(selection=>FG.creation.openArt(selection),{drawingId:source.id,rigId:rig.id});
    await page.locator('#creationWorkspace').waitFor({state:'visible'});
    await page.waitForFunction(()=>document.querySelector('#creationActors canvas'));
    const first=await page.evaluate(()=>FG.creation.scene());assert.ok(first.actors[0].assetId.startsWith('art:rig:'+rig.id+':'));
    assert.equal(first.provenance.sourceRevisionId,rig.id);
    await page.locator('#creationRun').click();
    await page.waitForFunction(()=>FG.creation.snapshot()?.actors[0].jumpOffset < -15);
    await page.waitForFunction(()=>FG.creation.snapshot()?.status==='completed');
    await page.locator('#creationKeep').click();
    assert.equal((await page.evaluate(()=>FG.creation.export())).attempts.length,0,'drawing playback never manufactures a learning check');
    await page.screenshot({path:'test-results/art-in-scene-'+device+'.png',fullPage:true});
    await page.locator('#creationMore summary').click();await page.locator('#creationVideo').click();
    await page.waitForFunction(()=>document.getElementById('creationVideo').textContent.includes('Stop & save')&&FG.creation.snapshot()?.timeMs>1200);
    const videoDownload=page.waitForEvent('download');await page.locator('#creationVideo').click();const video=await videoDownload;
    await video.saveAs('test-results/art-scene-'+device+'.webm');
    assert.ok(fs.statSync(await video.path()).size>1000,'the private-art canvas records a real video');

    // A second scene reuses the same immutable version through the visible picker.
    await page.locator('#creationBack').click();await page.locator('#creationFreeMode').click();await page.locator('[data-creation-starter="blank"]').click();
    await page.locator('#creationAddActor').click();
    await page.locator('#creationPrivateActorChoices [data-private-art]').filter({hasText:'Latest saved cutout design'}).click();
    await page.waitForFunction(()=>FG.creation.scene()?.actors.length===2);
    const second=await page.evaluate(()=>FG.creation.scene());
    assert.equal(second.actors[1].assetId,first.actors[0].assetId);assert.notEqual(second.id,firstId);
    await page.locator('[data-add-block="say"]').click();await page.locator('#creationKeep').click();
    // The actor inspector opens the exact selected joints without replacing the scene.
    const options=page.locator('#creationSceneOptions');
    if(!await options.evaluate(el=>el.open))await options.locator(':scope > summary').click();
    const sceneState=()=>page.evaluate(()=>({scene:FG.creation.scene(),saved:FG.creation.export(),
      actor:document.querySelector('#creationActors [aria-pressed="true"]').dataset.actor,
      script:document.getElementById('creationScript').value}));
    const kept=await sceneState(),tryParts=page.locator('#creationTryParts');
    const preview=page.getByRole('dialog',{name:'Try the saved parts'}),partField=preview.locator('.dl-canvas');
    await tryParts.click();await preview.waitFor();
    const play=preview.locator('[data-pause]');
    assert.equal(await play.textContent(),'Play','reduced-motion preferences start the explicit preview paused');
    await play.click();await page.waitForTimeout(120);await play.click();
    const pausedFrame=await partField.evaluate(canvas=>canvas.toDataURL());
    await page.waitForTimeout(120);assert.equal(await partField.evaluate(canvas=>canvas.toDataURL()),pausedFrame);
    await play.click();await page.waitForFunction(old=>document.querySelector('.dl-rig-preview .dl-canvas').toDataURL()!==old,pausedFrame);
    await preview.screenshot({path:'test-results/scene-saved-joints-'+device+'.png'});
    if(device==='tablet'){
      const video=await partField.evaluate(async canvas=>{
        const stream=canvas.captureStream(24),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:400000});
        const chunks=[];recorder.ondataavailable=event=>chunks.push(event.data);
        const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.start();
        await new Promise(resolve=>setTimeout(resolve,1500));recorder.stop();await stopped;
        stream.getTracks().forEach(track=>track.stop());
        return new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(chunks));});
      });
      fs.writeFileSync('test-results/scene-saved-joints.webm',Buffer.from(video,'base64'));
    }
    await preview.getByRole('button',{name:'Back to scene'}).click();await preview.waitFor({state:'detached'});
    assert.deepEqual(await sceneState(),kept,'preview never edits scene revisions, cast selection, script or art');
    await tryParts.click();await preview.waitFor();await preview.getByRole('button',{name:'Back to scene'}).click();
    await preview.waitFor({state:'detached'});
    const setRigNotes=notes=>page.evaluate(async ({id,notes})=>{
      const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('family-private-drawings-v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
      try{await new Promise((resolve,reject)=>{const tx=db.transaction('rigs','readwrite');const store=tx.objectStore('rigs'),read=store.get(id);read.onsuccess=()=>store.put({...read.result,assembly:{...read.result.assembly,notes}});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}
      finally{db.close();}
    },{id:rig.id,notes});
    await setRigNotes('Synthetic mismatched revision');
    await tryParts.click();await page.waitForFunction(()=>document.getElementById('creationStatus').textContent.includes('exact version'));
    assert.equal(await preview.count(),0,'a cached sprite cannot authorize a modified rig');
    await setRigNotes(rig.assembly.notes);assert.deepEqual(await sceneState(),kept);
    if(await options.evaluate(el=>el.open))await options.locator(':scope > summary').click();
    const retained=await page.evaluate(id=>FG.creation.export().revisions.filter(revision=>revision.projectId===id),firstId);
    assert.equal(retained[0].scene.actors.length,1);assert.equal(retained[0].scene.actors[0].assetId,first.actors[0].assetId);
    if(!await page.locator('#creationMore').evaluate(element=>element.open))await page.locator('#creationMore summary').click();
    const downloaded=page.waitForEvent('download');await page.locator('#creationDownload').click();
    const file=await downloaded,path=await file.path(),bundle=JSON.parse(fs.readFileSync(path,'utf8'));
    assert.equal(bundle.schema,'jems.scene-art.v1');assert.equal(bundle.art.drawings[0].sha256,source.sha256);
    assert.equal(bundle.art.rigs[0].id,rig.id);assert.equal(Object.hasOwn(bundle.art.drawings[0],'owner'),false);
    assert.equal(bundle.scene.actors[1].assetId,first.actors[0].assetId);

    // Private artwork added to a game-derived scene must preserve the route
    // back to that game as well as the separate route into Art Studio.
    await page.locator('#creationHome').click();await openRetainedGame(page,'dragon');
    const gameSession=await page.evaluate(()=>{const n=FG.studio.exportNotebook();return n.sessions.find(s=>s.id===n.active[FG.store.current().id]);});
    const gameBefore=await page.evaluate(()=>JSON.parse(localStorage.getItem('family-game-factory-workspace-v2')));
    if(!await page.locator('#studioMakeScene').isVisible())await page.locator('#studioChange').click();
    await page.locator('#studioMakeScene').click();await page.locator('#creationWorkspace').waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>FG.creation.scene().provenance.sourceSessionId),gameSession.id);
    await page.locator('#creationAddActor').click();
    await page.locator('#creationPrivateActorChoices [data-private-art]').filter({hasText:'Latest saved cutout design'}).click();
    await page.waitForFunction(assetId=>FG.creation.scene().actors.some(actor=>actor.assetId===assetId),first.actors[0].assetId);
    const sourceActions=page.locator('#creationSource');
    if(!await page.locator('#creationMore').evaluate(element=>element.open))await page.locator('#creationMore summary').click();
    assert.equal(await sourceActions.getByRole('button',{name:'My Art',exact:true}).isVisible(),true,'a game-derived scene keeps its private-art action');
    const backToGame=sourceActions.getByRole('button',{name:'Back to my game',exact:true});
    assert.equal(await backToGame.isVisible(),true,'adding private art keeps the source-game return action');
    await backToGame.click();await page.locator('#studioGameHost #game-mount').waitFor({state:'visible'});
    assert.equal(await page.locator('#page-creation').isVisible(),false);
    assert.equal(await page.evaluate(()=>FG.studio.exportNotebook().active[FG.store.current().id]),gameSession.id,'the return action opens the exact source game');
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('family-game-factory-workspace-v2'))),gameBefore,'private-art scene edits preserve the saved source game');

    // Another profile cannot see old pixels; a deliberate portable import creates copies.
    await profile(page,1);await pacing(page);
    await navigate(page,'#studioNavScenes');await page.locator('#creationFreeMode').click();await page.locator('[data-creation-starter="blank"]').click();
    await page.locator('#creationAddActor').click();
    await page.waitForFunction(()=>document.getElementById('creationActorArtStatus').textContent.includes('Add one'));
    assert.equal(await page.locator('#creationPrivateActorChoices button').count(),0);await page.locator('#creationCloseActor').click();
    await page.locator('#creationBack').click();
    const broken=structuredClone(bundle);broken.scene.actors[1].assetId=broken.scene.actors[1].assetId.slice(0,-1)+(broken.scene.actors[1].assetId.endsWith('0')?'1':'0');
    await page.setInputFiles('#creationImport',{name:'broken-scene.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(broken))});
    await page.waitForFunction(()=>document.getElementById('creationStatus').textContent.includes('Nothing was imported'));
    assert.equal((await records(page,'drawings','player2')).length,0);
    await page.setInputFiles('#creationImport',{name:'scene-with-art.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bundle))});
    await page.waitForFunction(()=>document.getElementById('creationStatus').textContent.includes('scene and its artwork'));
    const imported=await page.evaluate(()=>FG.creation.scene()),copiedArt=await records(page,'drawings','player2'),copiedRigs=await records(page,'rigs','player2');
    assert.equal(copiedArt.length,1);assert.equal(copiedArt[0].sha256,source.sha256);assert.notEqual(copiedArt[0].id,source.id);
    assert.equal(copiedRigs.length,1);assert.notEqual(copiedRigs[0].id,rig.id);
    assert.ok(imported.actors[1].assetId.startsWith('art:rig:'+copiedRigs[0].id+':'));
    assert.notEqual(imported.actors[1].assetId,first.actors[0].assetId,'source remap changes the immutable assembly hash');
    assert.equal(imported.provenance.createdBy,'assisted');
    await page.locator('#creationActors [data-actor]').nth(1).click();
    await page.locator('#creationRun').click();await page.locator('#creationTapActor').click();
    await page.waitForFunction(()=>FG.creation.snapshot()?.actors[1].speech==='Hello!');
    await page.reload();await ready(page);await navigate(page,'#studioNavScenes');
    await page.locator('[data-scene="'+imported.id+'"]').click();await page.waitForFunction(()=>document.querySelectorAll('#creationActors canvas').length===1);
    assert.equal((await records(page,'drawings','player1'))[0].sha256,source.sha256);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await page.locator('#creationActors [data-actor]').nth(1).click();
    const settings=page.locator('#creationSceneOptions');
    if(!await settings.evaluate(el=>el.open))await settings.locator(':scope > summary').click();
    await page.locator('#creationTryParts').click();await preview.waitFor();
    // A host profile change can arrive from elsewhere while the modal is paused.
    await page.evaluate(()=>{FG.store.choose('player1');window.dispatchEvent(new Event('factory-profile'));});
    await preview.waitFor({state:'detached'});
    // A failed scene save must not reserve artwork for a nonexistent project.
    const beforeFailedSave=await page.evaluate(()=>FG.creation.export().projects.length);
    await page.evaluate(async selection=>{
      const setItem=Storage.prototype.setItem;
      Storage.prototype.setItem=function(key,value){if(key.endsWith('family-game-factory-creation-v1'))throw new DOMException('Fixture quota','QuotaExceededError');return setItem.call(this,key,value);};
      try{await FG.creation.openArt(selection);}finally{Storage.prototype.setItem=setItem;}
    },{drawingId:source.id,rigId:rig.id});
    assert.equal(await page.evaluate(()=>FG.creation.export().projects.length),beforeFailedSave);
    assert.ok((await page.locator('#creationStatus').innerText()).includes('Could not save'));
    const retainedIds=await page.evaluate(()=>FG.creation.export().projects.map(project=>project.id));
    const usage=await records(page,'usage','player1');
    assert.ok(usage.filter(record=>record.targetKind==='scene').every(record=>retainedIds.includes(record.targetId)),'no orphan dependency follows a failed scene save');
    // A late decode from the old profile cannot create a scene or paint its art.
    await page.evaluate(selection=>{
      const original=window.createImageBitmap;
      window.__artSettled=false;window.__artDecodeStarted=false;
      let released=false;const waiting=[];
      window.__releaseArt=()=>{released=true;waiting.splice(0).forEach(resolve=>resolve());};
      window.createImageBitmap=async(...args)=>{const image=await original(...args);if(!released){window.__artDecodeStarted=true;await new Promise(resolve=>waiting.push(resolve));}return image;};
      void FG.creation.openArt(selection).finally(()=>{window.createImageBitmap=original;window.__artSettled=true;});
    },{drawingId:source.id});
    await page.waitForFunction(()=>window.__artDecodeStarted);
    await profile(page,1);
    const beforeLate=await page.evaluate(()=>FG.creation.export().projects.length);
    await page.evaluate(()=>window.__releaseArt());await page.waitForFunction(()=>window.__artSettled);
    assert.equal(await page.evaluate(()=>FG.creation.export().projects.length),beforeLate);
    assert.equal(await page.locator('#page-studio-library').isVisible(),true);
    assert.equal(await page.locator('#creationActors canvas').count(),0,'old private thumbnail DOM is scrubbed');
    assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);
    console.log('PASS '+device+': original/rig fidelity, code/video playback, immutable reuse, portable scene+art, rejected corrupt import, owner isolation/late-decode cancellation and no uploads');
   }finally{await context.close();}
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});

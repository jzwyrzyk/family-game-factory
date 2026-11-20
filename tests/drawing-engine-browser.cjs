const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const fs=require('node:fs');
const {build}=require('esbuild');
const {exploreWelcome}=require('./studio-entry.cjs');
const readArt=(page,store)=>page.evaluate(name=>new Promise((resolve,reject)=>{const request=indexedDB.open('family-private-drawings-v1');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction(name),r=tx.objectStore(name).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();};}),store);
(async()=>{
 const contract=await build({stdin:{contents:"export {createCarArtwork,drawCarBody,drawCarWheel} from './src/drawing/rally';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'drawingContracts',platform:'browser'});
 const server=require('./browser-server.cjs').start();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
 fs.mkdirSync('test-results',{recursive:true});
 try{
  for(const touch of [false,true]){
   const context=await browser.newContext({viewport:touch?{width:820,height:1180}:{width:1280,height:1000},hasTouch:touch});
   const page=await context.newPage(),errors=[],sent=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')sent.push(r.url());});
   const shelf=async()=>{await page.locator('#studioNavHome').click();await page.locator('#studioSavedIdeas').click();await page.waitForSelector('#drawingUpload',{state:'visible'});};
   const openCar=async()=>{await page.locator('#drawingList article').filter({has:page.getByRole('heading',{name:'My custom car',exact:true})}).getByRole('button',{name:/Bring to life/}).click();await page.locator('dialog.drawing-lab').waitFor({state:'visible'});};
   const drag=async(locator,start,end)=>{await locator.scrollIntoViewIfNeeded();const box=await locator.boundingBox();assert.ok(box);const a={x:box.x+box.width*start.x,y:box.y+box.height*start.y},b={x:box.x+box.width*end.x,y:box.y+box.height*end.y};if(touch){const session=await context.newCDPSession(page);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[b]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();}else{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:4});await page.mouse.up();}};
   await page.goto('http://127.0.0.1:'+server.address().port+'/arcade/');await page.waitForFunction(()=>window.FG?.drawings&&window.FG?.studio);await exploreWelcome(page);await shelf();
   if(!touch){
    await page.addScriptTag({content:contract.outputFiles[0].text});
    const pixels=await page.evaluate(()=>{
     const source=document.createElement('canvas');source.width=source.height=200;const c=source.getContext('2d');
     c.fillStyle='rgba(118,54,198,.5)';c.fillRect(40,80,120,60);c.clearRect(90,20,20,80);
     c.fillStyle='rgba(20,190,90,.5)';c.fillRect(90,20,20,80);
     const original=source.toDataURL(),assembly={schemaVersion:1,sourceId:'pixel-contract',sourceSha256:'a'.repeat(64),kind:'car',revision:1,notes:'',pieces:[
      {id:'body',name:'Body',role:'body',parentId:null,physical:true,region:{x:.2,y:.4,w:.6,h:.3,shape:'rect'}},
      {id:'left',name:'Left',role:'wheel',parentId:'body',physical:true,region:{x:.2,y:.65,w:.15,h:.2,shape:'ellipse'}},
      {id:'right',name:'Right',role:'wheel',parentId:'body',physical:true,region:{x:.65,y:.65,w:.15,h:.2,shape:'ellipse'}},
      {id:'flag',name:'Flag',role:'decoration',parentId:'body',physical:false,region:{x:.45,y:.1,w:.1,h:.4,shape:'rect'}}
     ]};
     const art=drawingContracts.createCarArtwork(assembly,source),rendered=document.createElement('canvas');rendered.width=rendered.height=220;
     const out=rendered.getContext('2d');out.translate(100,100);out.rotate(Math.PI/2);drawingContracts.drawCarBody(out,art,120,60);
     const rgba=(ctx,x,y)=>Array.from(ctx.getImageData(x,y,1,1).data);
     const square=structuredClone(assembly);square.pieces[1].region.shape='rect';const squareArt=drawingContracts.createCarArtwork(square,source);
     return {sourceUnchanged:original===source.toDataURL(),sourceFlag:rgba(c,100,40),rotatedFlag:rgba(out,170,100),
      sourceOverlap:rgba(c,100,90),rotatedOverlap:rgba(out,120,100),aboveBody:art.chassis.region.y<art.pieces.body.region.y,
      tireEdgeBody:rgba(art.layers.get('body').getContext('2d'),19,51)[3],tireEdgeWheel:rgba(art.layers.get('left').getContext('2d'),19,1)[3],
      squareCornerBody:rgba(squareArt.layers.get('body').getContext('2d'),0,50)[3],squareCornerWheel:rgba(squareArt.layers.get('left').getContext('2d'),0,0)[3]};
    });
    assert.ok(pixels.sourceUnchanged&&pixels.aboveBody,'body attachment keeps original pixels outside the chassis region');
    assert.deepEqual(pixels.rotatedFlag,pixels.sourceFlag,'attached decoration follows the true chassis rotation');
    assert.deepEqual(pixels.rotatedOverlap,pixels.sourceOverlap,'overlapping translucent source pixels never double their opacity');
    assert.equal(pixels.tireEdgeBody,0,'the full tire outline is removed from the body, without a duplicated outer ring');
    assert.ok(pixels.tireEdgeWheel>0,'the wheel still owns its outer tire pixels');
    assert.equal(pixels.squareCornerBody,0,'rectangular wheel outlines remove the same complete selected region from the body');
    assert.ok(pixels.squareCornerWheel>0,'the rectangular wheel retains its selected corner pixels');
    const aspect=await page.evaluate(()=>{
     const source=document.createElement('canvas');source.width=600;source.height=420;const c=source.getContext('2d');
     c.fillStyle='#53bfab';c.fillRect(60,63,480,168);c.fillStyle='#293958';
     for(const x of [170,430]){c.beginPath();c.ellipse(x,291,50,60,0,0,Math.PI*2);c.fill();}
     const assembly={schemaVersion:1,sourceId:'wide-pixel-contract',sourceSha256:'a'.repeat(64),kind:'car',revision:1,notes:'',pieces:[
      {id:'body',name:'Body',role:'body',parentId:null,physical:true,region:{x:.1,y:.15,w:.8,h:.4,shape:'rect'}},
      {id:'left',name:'Left',role:'wheel',parentId:'body',physical:true,region:{x:120/600,y:231/420,w:100/600,h:120/420,shape:'ellipse'}},
      {id:'right',name:'Right',role:'wheel',parentId:'body',physical:true,region:{x:380/600,y:231/420,w:100/600,h:120/420,shape:'ellipse'}}
     ]};
     const art=drawingContracts.createCarArtwork(assembly,source),wheel=document.createElement('canvas');wheel.width=wheel.height=200;
     const out=wheel.getContext('2d');out.translate(100,100);drawingContracts.drawCarWheel(out,art,0,70);
     const alpha=(x,y)=>out.getImageData(x,y,1,1).data[3];
     return {bodyAspect:art.geometry.chassisWidth/art.geometry.chassisHeight,top:alpha(100,59),bottom:alpha(100,140),outside:alpha(100,143)};
    });
    assert.ok(Math.abs(aspect.bodyAspect-480/168)<1e-9,'physical chassis retains the original non-square image proportions');
    assert.ok(aspect.top>0&&aspect.bottom>0&&aspect.outside===0,'an oval wheel cutout retains its 100 by 120 source proportions instead of stretching into a square');
   }
   const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=360;c.height=200;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,360,200);x.fillStyle='#7636c6';x.fillRect(55,55,255,80);x.fillStyle='#182c37';for(const cx of [105,270]){x.beginPath();x.arc(cx,143,32,0,2*Math.PI);x.fill();x.fillStyle='#e9dd67';x.beginPath();x.arc(cx,143,16,0,2*Math.PI);x.fill();x.fillStyle='#182c37';}return c.toDataURL().split(',')[1];});
   await page.setInputFiles('#drawingUpload',{name:'My custom car.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.waitForSelector('#drawingList article');
   const originals=await readArt(page,'drawings'),source=originals[0],owner=source.owner;assert.equal(originals.length,1);
   await openCar();const lab=page.locator('dialog.drawing-lab');
   // Regression: a new part is absent from the previous snapshot but must still resize.
   await lab.locator('[data-add]').click();await drag(lab.locator('.dl-canvas'),{x:.35,y:.35},{x:.65,y:.58});
   assert.equal(await lab.locator('[data-piece-list] button').count(),4);
   await lab.locator('details.dl-advanced summary').click();
   assert.ok(Number(await lab.locator('[data-region="w"]').inputValue())>20,'newly outlined piece gains real width');
   assert.ok(Number(await lab.locator('[data-region="h"]').inputValue())>15,'newly outlined piece gains real height');
   await lab.locator('[data-undo]').click();assert.equal(await lab.locator('[data-piece-list] button').count(),3);
   await lab.locator('[data-redo]').click();assert.equal(await lab.locator('[data-piece-list] button').count(),4);
   await lab.locator('[data-close]').click();await lab.waitFor({state:'detached'});
   const drafts=await readArt(page,'drafts');assert.equal(drafts[0].assembly.pieces.length,4,'closing preserves the editable draft');
   await openCar();assert.equal(await lab.locator('[data-piece-list] button').count(),4);assert.match(await lab.locator('[data-draft-status]').textContent(),/Recovered draft/);
   await lab.locator('[data-piece-list] button').last().click();await lab.locator('[data-delete]').click();assert.equal(await lab.locator('[data-piece-list] button').count(),3);
   await lab.locator('[data-cutouts]').click();await page.waitForFunction(()=>document.querySelectorAll('dialog.drawing-lab [data-cutout-preview] canvas').length===3);
   const cutout=await lab.locator('[data-cutout-preview] canvas').first().evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let solid=0,transparent=0;for(let i=3;i<d.length;i+=4){if(d[i]>80)solid++;else transparent++;}return {solid,transparent};});
   assert.ok(cutout.solid>10&&cutout.transparent>10,'cutout retains child pixels and transparent background');
   const alphaCount=()=>lab.locator('[data-cutout-preview] canvas').first().evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let solid=0;for(let i=3;i<d.length;i+=4)if(d[i]>120)solid++;return solid;});
   await lab.locator('details.dl-advanced summary').click();const beforeMask=await alphaCount();
   await lab.locator('[data-mask-exclude]').click();await drag(lab.locator('.dl-canvas'),{x:.5,y:.5},{x:.52,y:.5});const afterErase=await alphaCount();assert.ok(afterErase<beforeMask,'erase changes real alpha');
   await lab.locator('[data-mask-include]').click();await drag(lab.locator('.dl-canvas'),{x:.5,y:.5},{x:.52,y:.5});assert.ok(await alphaCount()>afterErase,'restore recovers original pixels');
   await lab.locator('[data-mask-include]').click();await lab.locator('[data-cutouts]').click();
   await lab.locator('[data-piece-list] button').nth(1).click();assert.equal(await lab.locator('[data-pivot]').isDisabled(),true,'wheel hinges remain their physical centers');
   // Keyboard resize changes reviewed geometry and is recoverable.
   const widthBefore=Number(await lab.locator('[data-region="w"]').inputValue());await lab.locator('.dl-canvas').focus();await page.keyboard.press('Shift+ArrowRight');assert.ok(Number(await lab.locator('[data-region="w"]').inputValue())>widthBefore);await lab.locator('[data-undo]').click();
   await lab.locator('[data-mode="play"]').click();await lab.locator('[data-go]').waitFor({state:'visible'});
   if(touch){await lab.locator('[data-go]').scrollIntoViewIfNeeded();const rect=await lab.locator('[data-go]').boundingBox(),session=await context.newCDPSession(page);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+rect.width/2,y:rect.y+rect.height/2}]});await page.waitForTimeout(240);await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();}else{await lab.locator('.dl-canvas').focus();await page.keyboard.down('Space');await page.waitForTimeout(240);await page.keyboard.up('Space');}
   await lab.locator('[data-mode="edit"]').click();await lab.locator('details.dl-advanced summary').click();await lab.screenshot({path:'test-results/drawing-editor-'+(touch?'tablet':'desktop')+'.png'});
   await lab.locator('[data-save]').click();await page.waitForFunction(()=>!document.querySelector('dialog.drawing-lab [data-use]')?.disabled);
   assert.equal((await readArt(page,'rigs')).length,1);assert.equal((await readArt(page,'drafts')).length,0,'explicit save clears matching recovery draft');
   await lab.locator('[data-use]').click();await page.waitForFunction(()=>window.FG?.runtime?.snapshot()?.state?.drawingRigId);
   const first=await page.evaluate(()=>FG.runtime.snapshot().state);assert.ok(first.drawingRigId);assert.equal(first.bodies.length,3);assert.ok(first.bodies[1].width>0);
   await shelf();await openCar();assert.equal(await lab.locator('[data-history]').inputValue(),first.drawingRigId);
   await lab.locator('[data-piece-list] button').nth(1).click();await lab.locator('.dl-canvas').focus();await page.keyboard.press('Shift+ArrowRight');await lab.locator('[data-save]').click();await page.waitForFunction(()=>!document.querySelector('dialog.drawing-lab [data-use]')?.disabled);
   const revisions=await readArt(page,'rigs');assert.equal(revisions.length,2);const second=revisions.find(r=>r.id!==first.drawingRigId);assert.notEqual(second.assembly.pieces[1].region.w,revisions.find(r=>r.id===first.drawingRigId).assembly.pieces[1].region.w);
   await lab.locator('[data-close]').click();await lab.waitFor({state:'detached'});
   await page.evaluate(id=>FG.app.openGame('hill',{drawingRigId:id,stateKey:'art-rally-'+id}),first.drawingRigId);await page.waitForFunction(id=>FG.runtime.snapshot().state.drawingRigId===id,first.drawingRigId);
   assert.equal((await page.evaluate(()=>FG.runtime.snapshot().state)).bodies[1].width,first.bodies[1].width,'new art versions cannot alter an earlier game binding');
   // Missing pinned art must not quietly fall back to the currently selected or stock car.
   const missing='00000000-0000-4000-8000-000000000000';await page.evaluate(id=>FG.app.openGame('hill',{drawingRigId:id,stateKey:'missing-rig-test'}),missing);await page.waitForFunction(()=>FG.runtime.snapshot().state.drawingUnavailable);
   const unavailable=await page.evaluate(()=>FG.runtime.snapshot().state);assert.equal(unavailable.requestedDrawingRigId,missing);assert.equal(unavailable.drawingRigId,null);assert.equal(unavailable.time,0);assert.equal(await page.locator('.quality-hill').getByRole('button',{name:'Let’s drive',exact:true}).isDisabled(),true);
   await shelf();await page.getByRole('button',{name:/Draw here/,exact:false}).click();const painter=page.locator('dialog.drawing-paint');await painter.waitFor({state:'visible'});
   await drag(painter.locator('[data-paper]'),{x:.3,y:.3},{x:.55,y:.6});await painter.locator('[data-undo]').click();assert.equal(await painter.locator('[data-save]').isDisabled(),true);await painter.locator('[data-redo]').click();await painter.locator('[data-title]').fill('A silly paper robot');await painter.locator('[data-save]').click();await painter.waitFor({state:'detached'});
   await page.waitForFunction(()=>document.querySelectorAll('#drawingList article').length===2);assert.equal(await page.getByText('A silly paper robot',{exact:true}).count(),1);
   const finalSource=(await readArt(page,'drawings')).find(d=>d.id===source.id);assert.equal(finalSource.sha256,source.sha256,'original artwork hash never changes');
   await openCar();await lab.locator('[data-piece-name]').fill('My route-safe body');await lab.locator('[data-piece-name]').press('Tab');
   await page.evaluate(()=>FG.app.page('lab'));await lab.waitFor({state:'detached'});
   assert.equal((await readArt(page,'drafts')).find(d=>d.sourceId===source.id).assembly.pieces[0].name,'My route-safe body','same-owner navigation flushes the edited draft before closing');
   await shelf();
   await openCar();await page.evaluate(()=>{if(!FG.store.choose('player2'))throw Error('Missing fixture player');window.dispatchEvent(new Event('factory-profile'));});await lab.waitFor({state:'detached'});await page.waitForFunction(()=>document.querySelectorAll('#drawingList article').length===0);
   await page.locator('#studioProfileSummary').click();await page.locator('.profile-choice').first().click();await page.waitForFunction(()=>document.querySelectorAll('#drawingList article').length===2);
   assert.deepEqual(sent,[],'drawing flow uses no image uploads or paid requests');assert.deepEqual(errors,[]);
   console.log('PASS drawing '+(touch?'tablet':'desktop')+': draft, drag-to-add, Undo/Redo, pixel masks, actual physics, immutable game binding, unavailable art, painting and profile isolation');await context.close();
  }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

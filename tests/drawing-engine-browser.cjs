const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const fs=require('node:fs');
(async()=>{
 const server=require('./browser-server.cjs').start();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
 fs.mkdirSync('test-results',{recursive:true});
 try{
  for(const touch of [false,true]){
   const context=await browser.newContext({viewport:touch?{width:820,height:1180}:{width:1280,height:1000},hasTouch:touch});
   const page=await context.newPage(),errors=[],sent=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')sent.push(r.url());});
   await page.goto('http://127.0.0.1:'+server.address().port+'/arcade/');
   await page.waitForFunction(()=>window.FG?.drawings);
   await page.getByRole('navigation').getByRole('button',{name:'🎨 My Creations',exact:true}).click();
   const png=await page.evaluate(()=>{
     const c=document.createElement('canvas');c.width=360;c.height=200;
     const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,360,200);
     x.fillStyle='#7636c6';x.fillRect(55,55,255,80);
     x.fillStyle='#182c37';
     for(const cx of [105,270]){x.beginPath();x.arc(cx,143,32,0,2*Math.PI);x.fill();
       x.fillStyle='#e9dd67';x.beginPath();x.arc(cx,143,16,0,2*Math.PI);x.fill();x.fillStyle='#182c37';}
     return c.toDataURL().split(',')[1];
   });
   await page.setInputFiles('#drawingUpload',{name:'My custom car.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
   await page.waitForSelector('#drawingList article');
   const originalCount=await page.locator('#drawingList article').count();
   await page.getByRole('button',{name:'✨ Bring to life',exact:true}).click();
   const lab=page.locator('dialog.drawing-lab');await lab.waitFor({state:'visible'});
   await lab.locator('[data-cutouts]').click();
   await page.waitForFunction(()=>document.querySelectorAll('dialog.drawing-lab [data-cutout-preview] canvas').length===3);
   const cutout=await lab.locator('[data-cutout-preview] canvas').first().evaluate(c=>{
     const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
     let solid=0,transparent=0;for(let i=3;i<d.length;i+=4){if(d[i]>80)solid++;else transparent++;}
     return {solid,transparent};
   });
   assert.ok(cutout.solid>10&&cutout.transparent>10,'a separate part retains colored child art and transparent pixels');
   const alphaCount=()=>lab.locator('[data-cutout-preview] canvas').first().evaluate(c=>{
     const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
     let solid=0;for(let i=3;i<d.length;i+=4)if(d[i]>120)solid++;
     return solid;
   });
   const beforeMask=await alphaCount();
   await lab.locator('[data-mask-exclude]').click();
   await lab.locator('.dl-canvas').scrollIntoViewIfNeeded();
   let brushBox=await lab.locator('.dl-canvas').boundingBox();assert.ok(brushBox);
   const cx=brushBox.x+brushBox.width/2,cy=brushBox.y+brushBox.height/2;
   if(touch)await page.touchscreen.tap(cx,cy);
   else await lab.locator('.dl-canvas').click({position:{x:brushBox.width/2,y:brushBox.height/2}});
   await page.waitForFunction(()=>document.querySelector('dialog.drawing-lab [data-status]')?.textContent?.includes('Piece outline updated'));
   const afterErase=await alphaCount();
   assert.ok(afterErase<beforeMask,"real pixels were removed from the child's component, not just a label changed");
   await lab.locator('[data-mask-include]').click();
   brushBox=await lab.locator('.dl-canvas').boundingBox();assert.ok(brushBox);
   if(touch)await page.touchscreen.tap(brushBox.x+brushBox.width/2,brushBox.y+brushBox.height/2);
   else await lab.locator('.dl-canvas').click({position:{x:brushBox.width/2,y:brushBox.height/2}});
   await page.waitForFunction(()=>document.querySelector('dialog.drawing-lab [data-status]')?.textContent?.includes('Piece outline updated'));
   assert.ok(await alphaCount()>afterErase,'restore brush recovers original source pixels');
   await lab.locator('[data-mask-include]').click();
   await lab.locator('[data-cutouts]').click();
   await lab.locator('[data-piece-list] button').nth(1).click();
   assert.equal(await lab.locator('[data-pivot]').isDisabled(),true,'car wheels use their real physical centers, not a pretend child hinge');
   await lab.locator('[data-mode="play"]').click();
   await page.waitForFunction(()=>document.querySelector('dialog.drawing-lab [data-retry]')&&!document.querySelector('dialog.drawing-lab [data-retry]').hidden);
   await lab.locator('[data-go]').scrollIntoViewIfNeeded();
   const rect=await lab.locator('[data-go]').boundingBox();assert.ok(rect);
   if(touch){
     const session=await context.newCDPSession(page);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+rect.width/2,y:rect.y+rect.height/2}]});
     await page.waitForTimeout(240);
     await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   }else{await lab.locator('.dl-canvas').focus();await page.keyboard.down('Space');await page.waitForTimeout(240);await page.keyboard.up('Space');}
   await lab.locator('[data-mode="edit"]').click();
   await lab.locator('[data-save]').click();
   await page.waitForFunction(()=>!document.querySelector('dialog.drawing-lab [data-use]').disabled);
   await lab.locator('[data-use]').click();
   await page.waitForFunction(()=>window.FG?.runtime?.snapshot()?.state?.drawingRigId,{timeout:5000});
   const first=await page.evaluate(()=>FG.runtime.snapshot().state);
   assert.ok(first.drawingRigId,'actual native Rally uses selected private rig');
   assert.equal(first.bodies.length,3,'car has chassis and two independently simulated wheels');
   assert.notEqual(first.bodies[1].width,0,'wheel collider exists');
   await page.getByRole('navigation').getByRole('button',{name:'🎨 My Creations',exact:true}).click();
   await page.getByRole('button',{name:'✨ Bring to life',exact:true}).click();
   await lab.waitFor({state:'visible'});
   // The saved design can be reopened without overwriting the source.
   await lab.locator('[data-history]').selectOption({index:1});
   await page.waitForFunction(()=>document.querySelector('dialog.drawing-lab [data-status]')?.textContent?.includes('This earlier test'));
   assert.match(await lab.locator('[data-status]').textContent(),/earlier test/i);
   await lab.locator('[data-close]').click();
   assert.equal(await page.locator('#drawingList article').count(),originalCount);
   // A brand-new drawing must be creatable directly on a tablet or with a mouse.
   await page.getByRole('button',{name:'✏️ Draw here',exact:true}).click();
   const painter=page.locator('dialog.drawing-paint'),paper=painter.locator('[data-paper]');
   await painter.waitFor({state:'visible'});const box=await paper.boundingBox();assert.ok(box);
   if(touch){const session=await context.newCDPSession(page);
     await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width*.3,y:box.y+box.height*.3}]});
     await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width*.55,y:box.y+box.height*.6}]});
     await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   }else{
     await page.mouse.move(box.x+box.width*.3,box.y+box.height*.3);
     await page.mouse.down();await page.mouse.move(box.x+box.width*.55,box.y+box.height*.6);await page.mouse.up();
   }
   await painter.locator('[data-title]').fill('A silly paper robot');
   await painter.locator('[data-save]').click();
   await page.waitForFunction(count=>document.querySelectorAll('#drawingList article').length===count,originalCount+1);
   assert.equal(await page.getByText('A silly paper robot', {exact:true}).count(),1,'draw-here painting saves as an actual private drawing');
   await page.getByRole('button',{name:'✨ Bring to life',exact:true}).first().click();
   await lab.waitFor({state:'visible'});
   // A modal correctly prevents clicking the profile switcher behind it.
   // Simulate a store-driven profile change while the editor is open to verify
   // its defensive cancellation, then use the normal buttons after it closes.
   await page.evaluate(()=>{
     if(!FG.store.choose('player2'))throw Error('Missing test player');
     window.dispatchEvent(new Event('factory-profile'));
   });
   await page.waitForFunction(()=>!document.querySelector('dialog.drawing-lab')?.open);
   await page.waitForFunction(()=>document.querySelectorAll('#drawingList article').length===0);
   await page.locator('.profile-choice').first().click();
   await page.waitForFunction(count=>document.querySelectorAll('#drawingList article').length===count,originalCount+1);
   await page.goto('http://127.0.0.1:'+server.address().port+'/arcade/?studio=1');
   await page.waitForSelector('#studioNavDrawings');
   await page.locator('#studioNavDrawings').click();
   await page.waitForFunction(count=>!document.getElementById('page-creations')?.classList.contains('hidden')&&document.querySelectorAll('#drawingList article').length===count,originalCount+1);
   assert.deepEqual(sent,[],'drawing analysis, painting and Studio navigation do not upload child images or make paid requests');
   assert.deepEqual(errors,[]);console.log('PASS drawing '+(touch?'tablet':'desktop')+': source preserved, physical preview, private save, active component car in Rally, history and zero uploads');
   await context.close();
  }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

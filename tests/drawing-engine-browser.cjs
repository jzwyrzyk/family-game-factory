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
   assert.match(await lab.locator('[data-status]').textContent(),/earlier test/i);
   await lab.locator('[data-close]').click();
   assert.equal(await page.locator('#drawingList article').count(),originalCount);
   assert.deepEqual(sent,[],'drawing analysis does not upload child images or make paid requests');
   assert.deepEqual(errors,[]);console.log('PASS drawing '+(touch?'tablet':'desktop')+': source preserved, physical preview, private save, active component car in Rally, history and zero uploads');
   await context.close();
  }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

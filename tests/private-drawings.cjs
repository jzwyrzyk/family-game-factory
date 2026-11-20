const {chromium}=require('playwright'),assert=require('node:assert/strict');

const LOW_ID='11111111-1111-4111-8111-111111111111';
const HIGH_ID='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

// Force only the next allocation, then restore normal UUID generation. These
// isolated cases cover both IndexedDB key orders without retrying random IDs.
async function nextDrawingId(page,id){
 await page.evaluate(id=>{
  const original=crypto.randomUUID;
  crypto.randomUUID=function(){crypto.randomUUID=original;return id};
 },id);
}

async function drawingRecords(page){
 return page.evaluate(()=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('family-private-drawings-v1');
  request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{
   const db=request.result,get=db.transaction('drawings').objectStore('drawings').getAll();
   get.onerror=()=>{db.close();reject(get.error)};
   get.onsuccess=()=>{db.close();resolve(get.result.map(({id,name,sourceId})=>({id,name,sourceId})))};
  };
 }));
}

(async()=>{
 const server=require('./browser-server.cjs').start();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
 try{
  for(const [order,originalId,cutoutId] of [
   ['original-first',LOW_ID,HIGH_ID],
   ['original-last',HIGH_ID,LOW_ID]
  ]){
   const context=await browser.newContext(),page=await context.newPage(),sent=[],pageErrors=[];
   try{
    // A drawing's title identifies this fixture; DOM position follows its UUID
    // primary key and must not decide which drawing is used, exported or erased.
    const originalCard=page.locator('#drawingList article').filter({has:page.getByRole('heading',{name:'My robot',exact:true})});
    const cutoutCard=page.locator('#drawingList article').filter({has:page.getByRole('heading',{name:'My robot cutout',exact:true})});
    page.on('request',r=>{if(r.method()==='POST')sent.push(r.url())});
    page.on('pageerror',error=>pageErrors.push(String(error)));
    page.on('dialog',d=>d.accept());
    await page.goto(`http://127.0.0.1:${server.address().port}/arcade/?arcade=1`);
    await page.waitForFunction(()=>window.FG?.drawings);
    await page.getByRole('navigation').getByRole('button',{name:'My Creations',exact:true}).click();
    const png=await page.evaluate(()=>{
     const c=document.createElement('canvas');c.width=40;c.height=60;
     const g=c.getContext('2d');g.fillStyle='purple';g.fillRect(0,0,40,60);g.fillStyle='yellow';g.fillRect(10,10,20,20);
     return c.toDataURL().split(',')[1];
    });
    await nextDrawingId(page,originalId);
    await page.setInputFiles('#drawingUpload',{name:'My robot.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await page.waitForSelector('#drawingList img');
    assert.equal(await page.locator('#drawingList article').count(),1);
    await nextDrawingId(page,cutoutId);
    await page.getByRole('button',{name:'Make centre cutout',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('#drawingList article').length===2);
    const records=await drawingRecords(page);
    assert.equal(records.find(item=>item.name==='My robot').id,originalId);
    assert.equal(records.find(item=>item.name==='My robot cutout').id,cutoutId);
    assert.equal(records.find(item=>item.id===cutoutId).sourceId,originalId);
    assert.deepEqual(records.map(item=>item.id),[LOW_ID,HIGH_ID]);
    await originalCard.getByRole('button',{name:'Use on build body',exact:true}).click();
    await page.evaluate(()=>FG.app.openGame('gum',{config:{qualityVersion:0,originalRules:true,highlightMatches:false,extraDecoys:0}}));
    await page.getByRole('button',{name:'Add Bottle',exact:true}).click();
    await page.waitForSelector('[data-part=body] img');
    await page.waitForFunction(()=>document.querySelector('[data-part=body] img')?.naturalWidth>0);
    assert.equal(await page.locator('[data-part=body] img').evaluate(e=>e.naturalWidth),40);
    assert.equal(await page.locator('[data-part=body] img').evaluate(e=>e.naturalHeight),60);
    await page.reload();
    await page.waitForFunction(()=>window.FG?.drawings);
    await page.getByRole('navigation').getByRole('button',{name:'My Creations',exact:true}).click();
    await page.waitForSelector('#drawingList img');
    assert.equal(await page.locator('#drawingList article').count(),2);
    await page.locator('.profile-choice').nth(1).click();
    await page.waitForFunction(()=>document.querySelectorAll('#drawingList article').length===0);
    await page.locator('.profile-choice').first().click();
    await page.waitForFunction(()=>document.querySelectorAll('#drawingList article').length===2);
    const download=page.waitForEvent('download');
    await originalCard.getByRole('button',{name:'Export original',exact:true}).click();
    assert.equal((await download).suggestedFilename(),'my-drawing.png');
    await originalCard.getByRole('button',{name:'Delete drawing',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('drawingStatus').textContent.includes('still uses this artwork'));
    assert.equal(await originalCard.count(),1);
    assert.equal(await cutoutCard.count(),1);
    assert.equal(await page.locator('#drawingList article').count(),2);
    await cutoutCard.getByRole('button',{name:'Delete drawing',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('#drawingList article').length===1);
    assert.equal(await originalCard.count(),1);
    assert.equal(await cutoutCard.count(),0);
    assert.deepEqual((await drawingRecords(page)).map(item=>item.id),[originalId]);
    await page.setInputFiles('#drawingUpload',{name:'bad.png',mimeType:'image/png',buffer:Buffer.from('<svg onload="alert(1)"></svg>')});
    await page.waitForFunction(()=>document.getElementById('drawingStatus').textContent.includes('not a supported'));
    assert.equal(await page.locator('#drawingList article').count(),1);
    assert.deepEqual(sent,[]);
    assert.deepEqual(pageErrors,[]);
    console.log(`PASS private drawings ${order}: upload, separate cutout, original build decoration, scoped reload, export, protected source, cutout deletion, bad bytes rejected, no network uploads`);
   }finally{await context.close()}
  }
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

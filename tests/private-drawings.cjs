const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {start}=require('./browser-server.cjs');

const lowerId='10000000-0000-4000-8000-000000000001';
const higherId='f0000000-0000-4000-8000-000000000002';
const cases=[
  {name:'original sorts first',originalId:lowerId,cutoutId:higherId,headings:['My robot','My robot cutout']},
  {name:'cutout sorts first',originalId:higherId,cutoutId:lowerId,headings:['My robot cutout','My robot']},
];

async function journey(browser,base,fixture){
  const context=await browser.newContext(),page=await context.newPage(),sent=[];
  try{
    // IndexedDB getAll() orders by UUID key, not creation time. Only these two
    // synthetic fixture writes receive fixed IDs; product UUID generation and
    // the actual save/delete implementations remain unchanged.
    await page.addInitScript(({originalId,cutoutId})=>{
      const add=IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add=function(value,...args){
        if(this.name==='drawings'&&value?.owner==='player1'){
          if(value.name==='My robot')value.id=originalId;
          else if(value.name==='My robot cutout')value.id=cutoutId;
        }
        return add.call(this,value,...args);
      };
    },fixture);
    page.on('request',request=>{if(request.method()==='POST')sent.push(request.url());});
    page.on('dialog',dialog=>dialog.accept());
    await page.goto(base+'/arcade/?arcade=1');
    await page.waitForFunction(()=>window.FG?.drawings);
    await page.getByRole('navigation').getByRole('button',{name:'My Creations',exact:true}).click();
    const original=page.locator('#drawingList article').filter({has:page.getByRole('heading',{name:'My robot',exact:true})});
    const cutout=page.locator('#drawingList article').filter({has:page.getByRole('heading',{name:'My robot cutout',exact:true})});
    const png=await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=40;canvas.height=60;
      const paint=canvas.getContext('2d');paint.fillStyle='purple';paint.fillRect(0,0,40,60);
      paint.fillStyle='yellow';paint.fillRect(10,10,20,20);return canvas.toDataURL().split(',')[1];
    });
    await page.setInputFiles('#drawingUpload',{name:'My robot.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await original.locator('img').waitFor();
    assert.equal(await page.locator('#drawingList article').count(),1);
    await original.getByRole('button',{name:'Make centre cutout',exact:true}).click();
    await cutout.locator('img').waitFor();
    assert.equal(await page.locator('#drawingList article').count(),2);
    assert.deepEqual(await page.locator('#drawingList article h3').allTextContents(),fixture.headings,'fixture exercises its intended UUID key order');

    await original.getByRole('button',{name:'Use on build body',exact:true}).click();
    await page.evaluate(()=>FG.app.openGame('gum',{config:{qualityVersion:0,originalRules:true,highlightMatches:false,extraDecoys:0}}));
    await page.getByRole('button',{name:'Add Bottle',exact:true}).click();
    await page.waitForSelector('[data-part=body] img');
    await page.waitForFunction(()=>document.querySelector('[data-part=body] img')?.naturalWidth>0);
    assert.equal(await page.locator('[data-part=body] img').evaluate(image=>image.naturalWidth),40);

    await page.reload();await page.waitForFunction(()=>window.FG?.drawings);
    await page.getByRole('navigation').getByRole('button',{name:'My Creations',exact:true}).click();
    await original.locator('img').waitFor();await cutout.locator('img').waitFor();
    assert.equal(await page.locator('#drawingList article').count(),2);
    await page.locator('.profile-choice').nth(1).click();
    await page.waitForFunction(()=>document.querySelectorAll('#drawingList article').length===0);
    await page.locator('.profile-choice').first().click();
    await original.locator('img').waitFor();await cutout.locator('img').waitFor();
    assert.equal(await page.locator('#drawingList article').count(),2);

    const download=page.waitForEvent('download');
    await original.getByRole('button',{name:'Export original',exact:true}).click();
    assert.equal((await download).suggestedFilename(),'my-drawing.png');
    await original.getByRole('button',{name:'Delete drawing',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('drawingStatus').textContent.includes('still uses this artwork'));
    assert.equal(await page.locator('#drawingList article').count(),2,'dependent cutout protects its original');
    await cutout.getByRole('button',{name:'Delete drawing',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('#drawingList article').length===1);
    assert.equal(await original.count(),1,'deleting the cutout retains the exact original');
    assert.equal(await cutout.count(),0);
    const retained=await page.evaluate(async()=>{
      const database=await new Promise((resolve,reject)=>{
        const request=indexedDB.open('family-private-drawings-v1',2);
        request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
      });
      try{return await new Promise((resolve,reject)=>{
        const request=database.transaction('drawings').objectStore('drawings').getAll();
        request.onsuccess=()=>resolve(request.result.filter(drawing=>drawing.owner==='player1').map(drawing=>({id:drawing.id,name:drawing.name,sourceId:drawing.sourceId||null})));
        request.onerror=()=>reject(request.error);
      });}finally{database.close();}
    });
    assert.deepEqual(retained,[{id:fixture.originalId,name:'My robot',sourceId:null}]);

    await page.setInputFiles('#drawingUpload',{name:'bad.png',mimeType:'image/png',buffer:Buffer.from('<svg onload="alert(1)"></svg>')});
    await page.waitForFunction(()=>document.getElementById('drawingStatus').textContent.includes('not a supported'));
    assert.equal(await original.count(),1);assert.equal(await page.locator('#drawingList article').count(),1);
    assert.deepEqual(sent,[]);
    console.log('PASS private drawings ('+fixture.name+'): upload, cutout, decoration, scoped reload, export, original protection, exact cutout deletion, invalid bytes, no uploads');
  }finally{await context.close();}
}

(async()=>{
  const server=start();await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));
  let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
    for(const fixture of cases)await journey(browser,'http://127.0.0.1:'+server.address().port,fixture);
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

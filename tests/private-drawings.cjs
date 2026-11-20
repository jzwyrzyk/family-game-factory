const {chromium}=require('playwright');
const assert=require('node:assert/strict');

async function checkDrawings(browser,url,originalFirst){
 const page=await browser.newPage(),sent=[],errors=[];
 const order=originalFirst?'original-first':'cutout-first';
 page.on('request',request=>{if(request.method()==='POST')sent.push(request.url());});
 page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',dialog=>dialog.accept());
 try{
  await page.goto(url);await page.waitForFunction(()=>window.FG?.drawings);
  await page.getByRole('navigation').getByRole('button',{name:'My Creations',exact:true}).click();
  const cards=page.locator('#drawingList article');
  const card=name=>cards.filter({has:page.getByRole('heading',{name,exact:true})});
  const original=card('My robot'),cutout=card('My robot cutout');
  // IndexedDB returns primary-key order, not upload order. Bound only the two
  // image IDs so both legitimate orders exercise the same visible controls.
  const low='10000000-0000-4000-8000-000000000001',high='f0000000-0000-4000-8000-000000000002';
  await page.evaluate(ids=>{
   const randomUUID=crypto.randomUUID.bind(crypto);
   crypto.randomUUID=()=>{const id=ids.shift();if(!ids.length)crypto.randomUUID=randomUUID;return id;};
  },originalFirst?[low,high]:[high,low]);
  const png=await page.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.width=40;canvas.height=60;
   const context=canvas.getContext('2d');context.fillStyle='purple';context.fillRect(0,0,40,60);
   context.fillStyle='yellow';context.fillRect(10,10,20,20);return canvas.toDataURL().split(',')[1];
  });
  await page.setInputFiles('#drawingUpload',{name:'My robot.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await original.locator('img').waitFor();assert.equal(await cards.count(),1);
  await original.getByRole('button',{name:'Make centre cutout',exact:true}).click();
  await cutout.waitFor();assert.equal(await cards.count(),2);
  assert.equal(await cards.first().getByRole('heading').textContent(),originalFirst?'My robot':'My robot cutout',order+' exercises the intended IndexedDB order');
  await original.getByRole('button',{name:'Use on build body',exact:true}).click();
  await page.evaluate(()=>FG.app.openGame('gum',{config:{qualityVersion:0,originalRules:true,highlightMatches:false,extraDecoys:0}}));
  await page.getByRole('button',{name:'Add Bottle',exact:true}).click();
  await page.waitForSelector('[data-part=body] img');
  await page.waitForFunction(()=>document.querySelector('[data-part=body] img')?.naturalWidth>0);
  assert.deepEqual(await page.locator('[data-part=body] img').evaluate(image=>[image.naturalWidth,image.naturalHeight]),[40,60],'the construction uses the original, not the square cutout');
  await page.reload();await page.waitForFunction(()=>window.FG?.drawings);
  await page.getByRole('navigation').getByRole('button',{name:'My Creations',exact:true}).click();
  await original.locator('img').waitFor();assert.equal(await cards.count(),2);
  await page.locator('.profile-choice').nth(1).click();
  await page.waitForFunction(()=>document.querySelectorAll('#drawingList article').length===0);
  await page.locator('.profile-choice').first().click();
  await cutout.waitFor();assert.equal(await cards.count(),2);
  const download=page.waitForEvent('download');
  await original.getByRole('button',{name:'Export original',exact:true}).click();
  const exported=await download;assert.equal(exported.suggestedFilename(),'my-drawing.png');
  const stream=await exported.createReadStream(),chunks=[];
  for await(const chunk of stream)chunks.push(chunk);
  assert.deepEqual(Buffer.concat(chunks),Buffer.from(png,'base64'),'export retains the exact original pixels');
  // A derivative retains its source. The normal delete control must explain
  // this dependency and leave both drawings intact, regardless of list order.
  await original.getByRole('button',{name:'Delete drawing',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('drawingStatus').textContent.includes('still uses this artwork'));
  assert.equal(await cards.count(),2,'deleting a referenced original is refused');
  assert.equal(await original.count(),1);assert.equal(await cutout.count(),1);
  await cutout.getByRole('button',{name:'Delete drawing',exact:true}).click();
  await cutout.waitFor({state:'detached'});assert.equal(await cards.count(),1);
  assert.equal(await original.count(),1,'deleting the unused cutout preserves its original');
  await page.setInputFiles('#drawingUpload',{name:'bad.png',mimeType:'image/png',buffer:Buffer.from('<svg onload="alert(1)"></svg>')});
  await page.waitForFunction(()=>document.getElementById('drawingStatus').textContent.includes('not a supported'));
  assert.equal(await cards.count(),1);assert.deepEqual(sent,[]);assert.deepEqual(errors,[]);
  console.log('PASS private drawings '+order+': named original/cutout, exact original export, build decoration, scoped reload, dependency refusal, unused-cutout deletion, bad bytes rejected, no network uploads');
 }finally{await page.close();}
}

(async()=>{
 const server=require('./browser-server.cjs').start();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
 try{
  const url=`http://127.0.0.1:${server.address().port}/arcade/?arcade=1`;
  for(const originalFirst of [true,false])await checkDrawings(browser,url,originalFirst);
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

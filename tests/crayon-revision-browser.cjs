// The synthetic Pebble PNG (including its erase stroke) came from PR #199's
// own browser journey on dc1dba8a6c4d139ca887aaf3f8bc1eb622d7ecfb.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {createHash} = require('node:crypto');
const {once} = require('node:events');
const {chromium} = require('playwright');
const {start} = require('./browser-server.cjs');

const fixture=fs.readFileSync(require('node:path').join(__dirname,'fixtures/my-art/pebble-binary-v1.png'));
async function records(page){
  return page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{
      const open=indexedDB.open('family-private-drawings-v1');
      open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);
    });
    try{
      return await new Promise((resolve,reject)=>{
        const request=db.transaction('drawings').objectStore('drawings').getAll();
        request.onsuccess=()=>resolve(request.result.map(({id,name,sha256,sourceId,sourceSha256,bytes})=>({
          id,name,sha256,sourceId,sourceSha256,bytes:[...new Uint8Array(bytes)],
        })));
        request.onerror=()=>reject(request.error);
      });
    }finally{db.close();}
  });
}
async function mismatch(page,complete,format){
  const bytes=Buffer.from(complete), start=bytes.indexOf('jeMS','ascii')-4;
  assert.ok(start>=8);
  const chunk=bytes.subarray(start,start+bytes.readUInt32BE(start)+12);
  const foreign=Buffer.from(await page.evaluate(({width,height})=>{
    const paper=document.createElement('canvas');paper.width=width;paper.height=height;
    return paper.toDataURL().split(',')[1];
  },{width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)}),'base64');
  const index=format==='Binary'?foreign.length-12:33;
  const altered=Buffer.concat([foreign.subarray(0,index),chunk,foreign.subarray(index)]);
  await page.locator('#artUpload').setInputFiles({name:format+' mismatch.png',mimeType:'image/png',buffer:altered});
  await page.waitForFunction(name=>document.querySelector('#artDetailTitle')?.textContent===name,format+' mismatch');
  await page.getByRole('button',{name:'Keep drawing',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#artStatus')?.textContent.includes('could not reopen exactly'));
  assert.equal(await page.locator('dialog.drawing-paint[open]').count(),0);
  assert.ok(await page.locator('#artUseScene').isEnabled());
  const saved=(await records(page)).find(row=>row.name===format+' mismatch');
  assert.deepEqual(Buffer.from(saved.bytes),altered,'fallback retains the uploaded original bytes');
}

(async()=>{
  const server=start(process.env.ART_TEST_DIST || 'dist');
  if(!server.listening)await once(server,'listening');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
  try{
    const page=await browser.newPage({viewport:{width:1240,height:900}});
    const errors=[],posts=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{if(request.method()==='POST')posts.push(request.url());});
    await page.route('**/factory-config.json',route=>route.abort());
    await page.goto('http://127.0.0.1:'+server.address().port+'/arcade/?art=1');
    await page.locator('#artUpload').setInputFiles({name:'Original Pebble.png',mimeType:'image/png',buffer:fixture});
    await page.getByRole('button',{name:'Keep drawing',exact:true}).click();
    const legacy=page.locator('dialog.legacy-crayons'), canvas=legacy.locator('[data-paper]');
    await legacy.waitFor();
    const raster=()=>canvas.evaluate(el=>el.toDataURL());
    const originalCanvas=await page.evaluate(async bytes=>{
      const bitmap=await createImageBitmap(new Blob([Uint8Array.from(bytes)],{type:'image/png'}));
      try{
        const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
        canvas.getContext('2d').drawImage(bitmap,0,0);
        return canvas.toDataURL();
      }finally{bitmap.close();}
    },[...fixture]);
    assert.equal(await raster(),originalCanvas);
    await legacy.locator('[data-undo]').click();
    assert.notEqual(await raster(),originalCanvas,'undo removes the final erase stroke');
    await legacy.locator('[data-redo]').click();
    assert.equal(await raster(),originalCanvas,'redo reproduces the erased PNG exactly');
    const sampleCorner=()=>canvas.evaluate(el=>el.getContext('2d').getImageData(0,0,1,1).data[3]);
    assert.equal(await sampleCorner(),0);
    if(process.env.ART_EVIDENCE_DIR){
      fs.mkdirSync(process.env.ART_EVIDENCE_DIR,{recursive:true});
      await page.screenshot({path:require('node:path').join(process.env.ART_EVIDENCE_DIR,'legacy-crayon-reopened.png')});
    }
    await legacy.getByLabel('Clear background').uncheck();
    assert.equal(await sampleCorner(),255,'the original renderer places white under the erased pixels');
    await canvas.press('Enter');
    await legacy.locator('[data-title]').fill('Pebble revision');
    await legacy.locator('[data-save]').click();
    await legacy.waitFor({state:'detached'});
    const saved=await records(page);
    const old=saved.find(row=>row.name==='Original Pebble'), updated=saved.find(row=>row.name==='Pebble revision');
    assert.deepEqual(Buffer.from(old.bytes),fixture);
    assert.equal(old.sha256,createHash('sha256').update(fixture).digest('hex'));
    assert.equal(updated.sourceId,old.id);assert.equal(updated.sourceSha256,old.sha256);
    await page.reload();
    await page.getByRole('button',{name:/Pebble revision/}).click();
    await page.getByRole('button',{name:'Keep drawing',exact:true}).click();
    await legacy.waitFor();
    assert.equal(await sampleCorner(),255);
    await legacy.locator('[data-exit]').click();
    await mismatch(page,fixture,'Binary');

    await page.locator('#artDrawButton').click();
    const modern=page.locator('dialog.drawing-paint:not(.legacy-crayons)');
    await modern.locator('[data-paper]').press('Enter');
    await modern.locator('[data-title]').fill('Current paper');
    await modern.locator('[data-save]').click();
    await modern.waitFor({state:'detached'});
    await page.getByRole('button',{name:'Keep drawing',exact:true}).click();
    await modern.waitFor();
    await modern.locator('[data-exit]').click();
    const current=(await records(page)).find(row=>row.name==='Current paper');
    await mismatch(page,current.bytes,'Current');
    assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);
    console.log('PR199 exact raster, undo/redo of erase, immutable revision, current paper replay and both mismatch fallbacks passed.');
  } finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

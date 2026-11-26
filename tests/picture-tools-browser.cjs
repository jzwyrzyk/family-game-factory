/* Focused recovery regressions with real image codecs and IndexedDB. */
const assert=require('node:assert/strict'),http=require('node:http');
const {build}=require('esbuild'),{chromium}=require('playwright');
(async()=>{
 const built=await build({stdin:{contents:`export {editPicture} from './src/drawing/picture';export {saveDrawing,drawings,drawing,drawingBlob} from './src/assets/private-drawings';`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'pictureTests',platform:'browser'});
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/test.js'?'text/javascript':'text/html');res.end(req.url==='/test.js'?built.outputFiles[0].text:'<!doctype html><html><body><button id="opener">Picture tools</button><script src="/test.js"></script></body></html>');}).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});const page=await browser.newPage(),errors=[],posts=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.method()==='POST')posts.push(request.url());});
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(async()=>{
   window.testOwner='player1';window.testView=true;window.FG={store:{current:()=>({id:window.testOwner})}};
   const c=document.createElement('canvas');c.width=1;c.height=4096;c.getContext('2d').fillRect(0,0,1,4096);
   const file=await new Promise(resolve=>c.toBlob(resolve,'image/png'));window.testSource=await pictureTests.saveDrawing('player1','Synthetic narrow art',file);
   await pictureTests.editPicture('player1',window.testSource,async saved=>{window.testSaved=saved;},()=>window.testView);
  });
  await page.locator('.art-picture').waitFor({state:'visible'});
  assert.deepEqual(await page.locator('[data-preview]').evaluate(canvas=>[canvas.width,canvas.height]),[1,1600],'valid narrow source retains a nonzero bounded working canvas');
  await page.locator('[data-turn]').click();assert.deepEqual(await page.locator('[data-preview]').evaluate(canvas=>[canvas.width,canvas.height]),[1600,1]);
  await page.locator('[data-save]').click();await page.locator('.art-picture').waitFor({state:'detached'});
  assert.equal(await page.evaluate(async()=>{const d=await pictureTests.drawing('player1',window.testSource.id);return d.sha256===window.testSource.sha256&&window.testSaved.sourceId===d.id;}),true,'turning saves a derivative and preserves original identity');
  console.log('PASS picture tools: 1×4096 input, 1600×1 turn, exact original preserved');
  await page.evaluate(async()=>{
    const c=document.createElement('canvas');c.width=c.height=12;
    const pen=c.getContext('2d');pen.fillStyle='#6a337a';pen.fillRect(3,3,6,6);
    const file=await new Promise(ok=>c.toBlob(ok));window.cornerSource=await pictureTests.saveDrawing('player1','Cutout',file);
    await pictureTests.editPicture('player1',window.cornerSource,async saved=>{window.cornerSaved=saved;},()=>true);
  });
  const pixels=()=>page.locator('[data-preview]').evaluate(c=>Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data));
  assert.equal(await page.locator('[data-smooth]').isChecked(),false);
  const untouched=await pixels();
  await page.locator('[data-smooth]').check();
  const softened=await pixels();let softenedCount=0;
  for(let i=3;i<softened.length;i+=4){
    const diff=untouched[i]-softened[i];
    assert.ok(diff===0||diff===8);
    if(diff)softenedCount++;
  }
  assert.equal(softenedCount,4);
  await page.locator('[data-undo]').click();assert.deepEqual(await pixels(),untouched);
  await page.locator('[data-redo]').click();assert.deepEqual(await pixels(),softened);
  await page.locator('[data-save]').click();await page.locator('.art-picture').waitFor({state:'detached'});
  assert.equal(await page.evaluate(async()=>{
    const original=await pictureTests.drawing('player1',window.cornerSource.id);
    return original.sha256===window.cornerSource.sha256 && window.cornerSaved.sourceSha256===original.sha256
      && window.cornerSaved.sha256!==original.sha256;
  }),true);
  console.log('PASS picture tools: opt-in corner smoothing, bounded alpha, undo/redo and immutable source');


  await page.evaluate(async()=>{window.beforeFailure=(await pictureTests.drawings('player1')).length;await pictureTests.editPicture('player1',window.testSource,async()=>{throw Error('Synthetic shelf refresh failed');},()=>window.testView);});
  await page.locator('[data-turn]').click();await page.locator('[data-save]').click();
  await page.waitForFunction(()=>document.querySelector('[data-status]')?.textContent.includes('Your new picture is saved'));
  assert.equal(await page.locator('[data-save]').isDisabled(),true,'a committed save cannot be repeated after a callback error');
  await page.evaluate(async()=>{await document.querySelector('[data-save]').onclick();});
  assert.equal(await page.evaluate(async()=>(await pictureTests.drawings('player1')).length-window.beforeFailure),1,'callback failure creates only one derivative');
  await page.locator('[data-close]').click();await page.locator('.art-picture').waitFor({state:'detached'});
  console.log('PASS picture tools: committed save survives shelf error without duplicate-save affordance');

  await page.evaluate(async()=>{await pictureTests.editPicture('player1',window.testSource,async()=>{},()=>window.testView);window.oldPreview=document.querySelector('[data-preview]');window.testView=false;window.dispatchEvent(new CustomEvent('factory-page',{detail:'home'}));});
  await page.locator('.art-picture').waitFor({state:'detached'});
  assert.deepEqual(await page.evaluate(()=>[window.oldPreview.width,window.oldPreview.height]),[1,1],'leaving the art view releases decoded canvas pixels');
  await page.evaluate(async()=>{window.testView=true;const opening=pictureTests.editPicture('player1',window.testSource,async()=>{},()=>window.testView);window.testView=false;await opening;});
  assert.equal(await page.locator('.art-picture').count(),0,'late image decode does not reopen tools in a stale view');
  console.log('PASS picture tools: view changes close and scrub preview; stale decoding cannot reopen');

  await page.evaluate(async()=>{
   window.testView=true;window.beforeSwitch=(await pictureTests.drawings('player1')).length;
   await pictureTests.editPicture('player1',window.testSource,async()=>{window.unexpectedCallback=true;},()=>window.testView);
   const canvas=document.querySelector('[data-preview]'),native=canvas.toBlob.bind(canvas);canvas.toBlob=(callback,...args)=>{native(blob=>{window.finishPictureEncode=()=>callback(blob);},...args);};
  });
  await page.locator('[data-save]').click();await page.waitForFunction(()=>typeof window.finishPictureEncode==='function');
  await page.evaluate(()=>{window.testOwner='player2';window.dispatchEvent(new CustomEvent('factory-profile'));window.finishPictureEncode();});
  await page.locator('.art-picture').waitFor({state:'detached'});
  assert.equal(await page.evaluate(async()=>(await pictureTests.drawings('player1')).length===window.beforeSwitch&&(await pictureTests.drawings('player2')).length===0&&!window.unexpectedCallback),true,'profile change cancels delayed picture encoding without saving to either profile');
  assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);
  console.log('PASS picture tools: delayed save canceled after profile change; zero errors or image POSTs');
 }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const {standaloneInput}=require('./standalone-input.cjs');
const {holdGameKey}=require('../../tests/game-art/hold-key.cjs');

(async()=>{
  const input=await standaloneInput(path.resolve('dist-review/jems-ui-review.html'));
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH, args:['--no-sandbox']});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[], network=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(/^https?:/.test(r.url()) && r.url()!==input.url)network.push(r.url());});
    await page.goto(input.url,{waitUntil:'domcontentloaded',timeout:120000});
    await page.waitForFunction(()=>document.querySelector('#loading').hidden);
    await page.selectOption('#destination','creative:notebook-flight');
    const app=page.frameLocator('iframe').first();
    const tryGame=app.getByRole('button',{name:'Try art in a sample game'});
    await tryGame.waitFor({timeout:15000}).catch(async error=>{
      console.log('Notebook entry',await page.locator('#status').textContent(),errors);
      console.log(await app.locator('body').evaluate(()=>({page:document.querySelector('.page:not(.hidden)')?.id,plan:document.querySelector('#studioArtPlan')?.textContent, sessions:window.FG?.studio?.exportNotebook().sessions.map(s=>({game:s.game,art:s.gameArt?.pins.length}))})));
      throw error;
    });
    await tryGame.click();
    const flight=app.frameLocator('.game-art-review iframe');
    const field=flight.locator('#game[data-assets-ready=true]');
    await field.waitFor();
    await page.selectOption('#zoom','1');
    await page.click('#hide');
    await flight.locator('#start').scrollIntoViewIfNeeded();
    await flight.locator('#start').click();
    await flight.locator('#game[data-frames]').waitFor();
    assert.equal(await field.evaluate(c=>{try{return !!parent.document.body;}catch{return false;}}),false);
    assert.deepEqual(await field.evaluate(c=>Array.from(c.getContext('2d').getImageData(100,12,1,1).data)),[198,226,237,255]);
    fs.mkdirSync('test-results/ui-review',{recursive:true});
    await field.screenshot({path:'test-results/ui-review/notebook-flight.png'});
    const hold=(key,steps)=>holdGameKey(page,field,key,steps);
    await hold('ArrowRight',141);
    await flight.getByText('Score: 1',{exact:true}).waitFor();
    assert.equal(await flight.locator('#status').getAttribute('data-state'),'playing');
    await hold('ArrowUp',39);await hold('ArrowRight',96);
    await flight.getByText('You did it!',{exact:true}).waitFor();
    await app.getByRole('button',{name:'Keep this art test'}).click();
    await app.getByText('This art test is kept.',{exact:true}).waitFor();
    const state=await app.locator('#studioArtPlan').evaluate(()=>FG.studio.exportNotebook().sessions.find(s=>s.gameArt).gameArt);
    assert.equal(state.kept,state.tests[0].id);
    const collectible=state.pins.find(p=>p.role==='collectible'), obstacle=state.pins.find(p=>p.role==='obstacle');
    assert.equal(collectible.drawingId,obstacle.drawingId);
    assert.equal(collectible.sha256,obstacle.sha256);
    assert.equal(collectible.intent,'Give me one point');
    assert.deepEqual(network,[]);assert.deepEqual(errors,[]);
    console.log('PASS standalone notebook flight: four approved drawings, five exact pins, opaque renderer, scored round, collision and kept game.');
  } finally {await browser.close();await input.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {once} = require('node:events');
const {chromium} = require('playwright');
const {start} = require('./browser-server.cjs');

(async()=>{
  const output=process.env.MOTION_EVIDENCE_DIR||'test-results/creation-motion';
  fs.mkdirSync(output,{recursive:true});
  const server=start(process.env.MOTION_BUILD_DIR||'dist');if(!server.listening)await once(server,'listening');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});
    const errors=[],posts=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{if(request.method()==='POST')posts.push(request.url());});
    await page.route('**/factory-config.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({version:1,mode:'unavailable'})}));
    const base='http://127.0.0.1:'+server.address().port+'/arcade/';
    await page.goto(base+'?art=1');await page.locator('#artEmpty').waitFor({state:'visible'});
    // A synthetic drawing made entirely by the test, on a transparent canvas.
    const png=await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=140;canvas.height=120;
      const c=canvas.getContext('2d');c.fillStyle='#9374cb';c.strokeStyle='#382356';c.lineWidth=5;
      c.beginPath();c.moveTo(18,70);c.lineTo(48,40);c.lineTo(68,28);c.lineTo(104,35);c.lineTo(126,70);c.lineTo(111,92);c.lineTo(53,100);c.closePath();c.fill();c.stroke();
      c.fillStyle='#352142';c.fillRect(56,57,5,8);c.fillRect(89,54,5,8);c.beginPath();c.arc(75,67,12,.1,2.8);c.stroke();
      return canvas.toDataURL().split(',')[1];
    });
    await page.locator('#artUpload').setInputFiles({name:'Moon rock.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await page.locator('#artUseScene').click();await page.locator('#creationDrawPath').click();
    const editor=page.locator('.creation-path-editor');
    const pad=await editor.locator('canvas').boundingBox();
    const x=pad.x+pad.width*.5,y=pad.y+pad.height*.62;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+60,y-24,{steps:8});await page.mouse.up();
    assert.ok(await editor.locator('[data-use]').isEnabled());
    while(await editor.locator('[data-undo]').isEnabled())await editor.locator('[data-undo]').click();
    const arrow=(word)=>editor.getByRole('button',{name:'Move '+word,exact:true});
    await arrow('right').focus();await page.keyboard.press('Space');
    for(const direction of ['up','up','up','right','right','right','down','down','down','left'])await arrow(direction).click();
    await editor.getByRole('button',{name:'Undo step'}).click();
    await editor.getByLabel('Path name').fill('Moon walk');
    await page.screenshot({path:path.join(output,'draw-a-path.png')});
    await page.setViewportSize({width:390,height:844});
    assert.ok(await editor.evaluate(el=>el.clientWidth>=el.scrollWidth && el.getBoundingClientRect().width<=innerWidth));
    await page.screenshot({path:path.join(output,'draw-a-path-phone.png')});
    await page.setViewportSize({width:1280,height:900});
    await editor.getByRole('button',{name:'Add path to my blocks'}).click();
    await editor.waitFor({state:'detached'});
    const first=await page.evaluate(()=>FG.creation.scene());
    const group=first.programs[0].actions.at(-1);assert.equal(group.pathName,'Moon walk');assert.equal(group.actions.length,10);
    assert.ok(first.actors[0].assetId.startsWith('art:image:'));
    await page.locator('#creationKeep').click();
    await page.waitForFunction(()=>document.getElementById('creationSaveState').textContent==='Your kept version');
    // Prevent an unrelated timed learning checkpoint during this local fixture.
    await page.evaluate(()=>{FG.store.changeProfile({rate:1});FG.store.current().mathWindow=[Date.now()];FG.store.save();});
    await page.locator('#creationStep').click();
    await page.waitForFunction(()=>FG.creation.snapshot().status==='paused' && FG.creation.snapshot().timeMs===100);
    await page.locator('#creationRun').click();
    await page.waitForFunction(()=>FG.creation.snapshot()?.status==='completed');
    const actor=await page.evaluate(()=>FG.creation.snapshot().actors[0]);
    assert.equal(actor.x,first.actors[0].x+160);assert.equal(actor.y,first.actors[0].y);
    assert.equal(actor.assetId,first.actors[0].assetId);
    await page.screenshot({path:path.join(output,'path-playback.png')});
    await page.goto(base+'?art=1');await page.locator('.art-card').first().click();
    await page.locator('#artUseScene').click();await page.locator('#creationDrawPath').click();
    await editor.locator('summary').click();await editor.getByLabel('Choose a scene').selectOption(first.id);
    await editor.getByRole('button',{name:'Use Moon walk'}).click();await editor.waitFor({state:'detached'});
    const second=await page.evaluate(()=>FG.creation.scene());
    const copied=second.programs[0].actions.at(-1);
    assert.notEqual(copied.id,group.id);assert.equal(copied.pathName,'Moon walk');
    assert.deepEqual(copied.actions.map(({id,...step})=>step),group.actions.map(({id,...step})=>step));
    assert.equal(second.actors[0].assetId,first.actors[0].assetId);
    await page.locator('#creationUndo').click();await page.waitForFunction(()=>!FG.creation.scene().programs[0].actions.some(block=>block.pathName));
    assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);
    console.log('PASS drawn path, accessible controls, kept reuse, original pins, deterministic stage position and undo');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});

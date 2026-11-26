/* Synthetic original, local trusted host. No account or remote workshop. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { once } = require('node:events');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const { start } = require('./browser-server.cjs');

async function fixture(page) {
  return Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 150; canvas.height = 125;
    const pen = canvas.getContext('2d'); pen.lineJoin = pen.lineCap = 'round';
    pen.lineWidth = 7; pen.strokeStyle = '#4b2d52'; pen.fillStyle = '#eea3be';
    pen.beginPath(); pen.moveTo(24, 74); pen.quadraticCurveTo(15, 17, 66, 14);
    pen.quadraticCurveTo(118, 4, 133, 69); pen.quadraticCurveTo(77, 87, 24, 74); pen.fill(); pen.stroke();
    for (const x of [39, 66, 96, 118]) {
      pen.beginPath(); pen.moveTo(x, 80); pen.bezierCurveTo(x - 17, 104, x + 13, 98, x - 2, 116); pen.stroke();
    }
    pen.fillStyle = pen.strokeStyle;
    for (const x of [58, 94]) { pen.beginPath(); pen.arc(x, 47, 4, 0, 2 * Math.PI); pen.fill(); }
    pen.lineWidth = 4; pen.beginPath(); pen.arc(78, 55, 9, .1, Math.PI - .1); pen.stroke();
    return canvas.toDataURL('image/png').split(',')[1];
  }), 'base64');
}

async function run() {
  const server = start(process.env.MOTION_BUILD || 'dist');
  if (!server.listening) await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port + '/arcade/?art=1';
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1160, height: 840 } });
    const errors = [], posts = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', req => {if (req.method() === 'POST') posts.push(req.url());});
    page.on('dialog', dialog => dialog.accept());
    await page.route('**/factory-config.json', route => route.fulfill({json:{version:1,mode:'unavailable'}}));
    await page.goto(base);
    const bytes = await fixture(page);
    await page.setInputFiles('#artUpload', {name:'Wiggly jelly.png',mimeType:'image/png',buffer:bytes});
    await page.locator('#artAnimate').click();
    const motion = page.getByRole('region',{name:'Picture animation'});
    await motion.getByRole('button',{name:'Step left'}).click();
    await motion.getByRole('button',{name:'Step up'}).press('Enter');
    await motion.locator('canvas').click({position:{x:400,y:80}});
    await motion.getByRole('button',{name:'Step right'}).click();
    await motion.getByRole('button',{name:'Take back a step'}).click();
    assert.equal(await motion.locator('[data-count]').innerText(),'3 steps');
    await motion.getByRole('combobox').selectOption('350');
    await page.locator('.drawing-lab [data-close]').click();
    await page.reload();
    await page.locator('.art-card').first().click();
    await page.locator('#artResumeDraft').click();
    assert.equal(await motion.locator('[data-count]').innerText(),'3 steps');
    assert.equal(await motion.getByRole('combobox').inputValue(),'350');
    fs.mkdirSync('test-results/drawing-motion',{recursive:true});
    await page.locator('.drawing-lab').screenshot({path:'test-results/drawing-motion/path-desktop.png'});
    await page.setViewportSize({width:390,height:844});
    await page.locator('.drawing-lab').screenshot({path:'test-results/drawing-motion/path-phone.png'});
    assert.ok(await motion.evaluate(panel=>panel.scrollWidth<=panel.clientWidth+1));
    await page.setViewportSize({width:1160,height:840});
    const frame = () => motion.locator('canvas').evaluate(canvas=>canvas.toDataURL());
    const still = await frame();
    await motion.getByRole('button',{name:'Play my path'}).click();
    await page.waitForFunction(still => document.querySelector('.dl-motion canvas').toDataURL() !== still, still);
    await motion.getByRole('button',{name:'Stop playing'}).click();
    await motion.getByRole('button',{name:'Save animation'}).click();
    await page.waitForFunction(()=>document.querySelector('[data-draft-status]').textContent.includes('Version 1 saved'));
    await page.locator('.drawing-lab [data-close]').click();
    const chosen = await page.locator('#artVersion').inputValue();
    assert.ok(chosen);
    await page.locator('#artUseScene').click();
    await page.locator('#creationWorkspace').waitFor({state:'visible'});
    const scene = await page.evaluate(()=>FG.creation.scene());
    assert.equal(scene.provenance.sourceRevisionId, chosen);
    assert.equal(scene.programs[0].actions.length,3);
    assert.ok(scene.programs[0].actions.every(b=>b.type==='move'&&b.origin==='child'&&b.durationMs===350));
    await page.evaluate(()=>{FG.store.changeProfile({rate:1});FG.store.current().mathWindow=[Date.now()];FG.store.save();});
    await page.locator('#creationRun').click();
    await page.waitForFunction(()=>FG.creation.snapshot()?.status==='completed');
    const finished = await page.evaluate(()=>FG.creation.snapshot().actors[0]);
    await page.locator('#creationCanvas').screenshot({path:'test-results/drawing-motion/path-in-scene.png'});
    for (const axis of ['x','y']) assert.equal(finished[axis], scene.programs[0].actions.reduce((v,b)=>v+b['d'+axis],scene.actors[0][axis]));
    await page.goto(base);
    await page.locator('.art-card').first().click(); await page.locator('#artAnimate').click();
    await motion.getByRole('button',{name:'Step down'}).click(); await motion.getByRole('button',{name:'Save animation'}).click();
    await page.waitForFunction(()=>document.querySelector('[data-draft-status]').textContent.includes('Version 2 saved'));
    await page.locator('.drawing-lab [data-close]').click();
    assert.notEqual(await page.locator('#artVersion').inputValue(), chosen);
    const data = await page.evaluate(()=>FG.creation.captureWorkspace());
    assert.deepEqual(data.revisions.find(r=>r.scene.id===scene.id).scene,scene);
    await page.locator('.art-library-more summary').click();
    const backupDownload = page.waitForEvent('download');
    await page.locator('#artExport').click();
    const backup = JSON.parse(fs.readFileSync(await (await backupDownload).path(),'utf8'));
    const design = backup.rigs.find(r=>r.id===chosen);
    assert.equal(design.assembly.kind,'picture');
    assert.deepEqual(design.assembly.pieces.map(p=>p.physical),[false]);
    const second = backup.rigs.find(r=>r.parentId===chosen);
    assert.equal(second.assembly.motion.stops.length,4);
    assert.equal(design.assembly.motion.stops.length,3);
    assert.equal(design.assembly.sourceSha256,createHash('sha256').update(bytes).digest('hex'));
    const download = page.waitForEvent('download');
    await page.locator('.art-detail-tools summary').click();
    await page.getByRole('button',{name:'Download original picture'}).click();
    const original = fs.readFileSync(await (await download).path());
    assert.equal(createHash('sha256').update(original).digest('hex'),createHash('sha256').update(bytes).digest('hex'));
    // Reuse the older path in another scene through the shared picker.
    await page.locator('#artUseScene').click();
    await page.locator('#creationWorkspace').waitFor({state:'visible'});
    await page.locator('#creationAddActor').click();
    await page.locator('#creationPrivateActorChoices [data-private-art^="art:rig:'+chosen+':"]').click();
    await page.locator('#creationActorDialog').waitFor({state:'hidden'});
    const reused = await page.evaluate(()=>FG.creation.scene());
    assert.equal(reused.actors[1].assetId,scene.actors[0].assetId);
    assert.equal(reused.programs[1].trigger.type,'start');
    assert.equal(reused.programs[1].actions.length,3);
    assert.equal(reused.programs[0].actions.length,4);
    assert.deepEqual(errors,[]); assert.deepEqual(posts,[]);
    console.log('PASS path authoring, keyboard and pointer controls, preview, draft recovery, immutable versions, original bytes and trusted scene playback.');
  } finally { await browser?.close(); server.close(); }
}
run().catch(error => { console.error(error); process.exitCode=1; });

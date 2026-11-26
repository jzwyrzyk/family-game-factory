// Exercise retained and new worlds with synthetic personal art in the standalone product UI.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const output = 'test-results/ui-review/world-compatibility';
const artifact = path.resolve(process.env.UI_REVIEW_FILE || 'dist-review/jems-ui-review.html');
const inline = process.env.UI_REVIEW_INLINE_HARNESS === '1';
const reviewURL = inline ? 'http://localhost:43199/' : pathToFileURL(artifact).href;

async function verifyRock(frame, assetId) {
  await frame.waitForFunction(id => {
    const actor = FG.creation.scene()?.actors.find(a => a.assetId === id);
    if (!actor) return false;
    const stage = document.getElementById('creationCanvas').getContext('2d');
    return Array.from(stage.getImageData(actor.x, actor.y, 1, 1).data).join() === '94,76,123,255';
  }, assetId);
}

async function chooseBackground(frame, world) {
  const settings = frame.locator('#creationSceneOptions');
  const tools = frame.locator('#creationCharacterTools');
  if (!await settings.isVisible() && await tools.isVisible()) await tools.click();
  if (!await settings.evaluate(el => el.open)) await settings.locator(':scope > summary').click();
  await frame.locator('#creationBackground').selectOption(world);
  await frame.waitForFunction(id => FG.creation.scene()?.background === id, world);
  await frame.locator('#creationCloseSettings').click();
}

async function capture(frame, name) {
  await frame.locator('#creationCanvas').screenshot({path: path.join(output, name + '.png')});
}

async function verifyLandscape(page, frame) {
  await page.selectOption('#device','desktop');
  await page.selectOption('#destination','art');
  await frame.locator('#artUploadButton').waitFor({state:'visible'});
  const data = await frame.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 300;
    const brush = c.getContext('2d');
    brush.fillStyle = '#ffddae'; brush.fillRect(0,0,c.width,c.height);
    brush.fillStyle = '#efa196';
    brush.beginPath(); brush.moveTo(0,230); brush.lineTo(340,80); brush.lineTo(590,211);
    brush.lineTo(850,97); brush.lineTo(1200,230); brush.lineTo(1200,300); brush.lineTo(0,300); brush.fill();
    brush.fillStyle = '#487d70'; brush.fillRect(0,230,c.width,70);
    brush.fillStyle = '#694c7b';
    for (let x=400; x<800; x+=7) brush.fillRect(x,235,2,45);
    return c.toDataURL().split(',')[1];
  });
  const bytes = Buffer.from(data,'base64');
  const pin = createHash('sha256').update(bytes).digest('hex');
  await frame.setInputFiles('#artUpload',{name:'Fixture landscape.png',mimeType:'image/png',buffer:bytes});
  await frame.waitForFunction(() => document.getElementById('artStatus').textContent.includes('picture is saved'));
  await page.selectOption('#destination','world-builder');
  await frame.waitForFunction(() => FG.creation.scene()?.background === 'world-forest-v1');
  const settings = frame.locator('#creationSceneOptions');
  const tools = frame.locator('#creationCharacterTools');
  if (!await settings.isVisible() && await tools.isVisible()) await tools.click();
  await settings.locator(':scope > summary').click();
  await frame.locator('#creationMyBackdrop').click();
  await frame.locator('dialog[open] [data-private-art]').filter({hasText:'Fixture landscape'}).click();
  await frame.waitForFunction(hash => FG.creation.scene()?.actors.some(a => a.layer === 'backdrop' && a.assetId.endsWith(hash)),pin);
  if (!await settings.evaluate(el => el.open)) await settings.locator(':scope > summary').click();
  await frame.getByLabel('Fit drawing').selectOption('cover');
  await frame.waitForFunction(() => FG.creation.scene().actors.some(a => a.backdropFit === 'cover'));
  await frame.locator('#creationCloseSettings').click();
  await frame.evaluate(() => { FG.store.current().mathWindow=[Date.now()]; });
  await frame.locator('#creationRun').click();
  await frame.waitForFunction(() => FG.creation.snapshot()?.status === 'completed');
  const matches = await frame.evaluate(async base64 => {
    const canvas = document.getElementById('creationCanvas'), {width:w,height:h} = canvas;
    const img = new Image(); img.src = 'data:image/png;base64,'+base64; await img.decode();
    const expected = document.createElement('canvas'); expected.width = w; expected.height = h;
    const ctx = expected.getContext('2d'), scale = Math.max(w/img.width,h/img.height);
    ctx.drawImage(img,(w-img.width*scale)/2,(h-img.height*scale)/2,img.width*scale,img.height*scale);
    const actual = canvas.getContext('2d').getImageData(0,0,w,h).data;
    const reference = ctx.getImageData(0,0,w,h).data;
    let count=0, exact=0;
    // The lower band contains two-source-pixel marks and no starter actor.
    for(let y=Math.ceil(h*.80);y<h*.91;y+=3) for(let x=2;x<w-2;x+=3) {
      const i=4*(y*w+x); count++;
      if (Math.max(...[0,1,2].map(k=>Math.abs(actual[i+k]-reference[i+k]))) <= 2) exact++;
    }
    return exact/count;
  },data);
  assert.ok(matches>.995, 'cropped landscape preserves narrow marks at stage resolution: '+matches);
  await capture(frame,'private-landscape-cover');
  await frame.locator('#creationKeep').click();
  const more = frame.locator('#creationMore');
  if (!await more.evaluate(el=>el.open)) await more.locator(':scope > summary').click();
  await frame.locator('#creationVideo').click();
  await frame.waitForFunction(() => document.getElementById('creationVideo').textContent.includes('Stop & save'));
  // Allow MediaRecorder to encode multiple frames of the static composition.
  await new Promise(resolve => setTimeout(resolve, 750));
  const recording = page.waitForEvent('download');
  await frame.locator('#creationVideo').click();
  const video = await recording;
  const videoBytes = await fs.readFile(await video.path());
  await fs.writeFile(path.join(output,'private-landscape.webm'),videoBytes);
  const quality = await frame.evaluate(async encoded => {
    const video = document.createElement('video');
    const blob = new Blob([Uint8Array.from(atob(encoded), ch => ch.charCodeAt(0))], {type:'video/webm'});
    const url = URL.createObjectURL(blob);
    try {
      video.muted = true;
      await new Promise((resolve, reject) => {
        video.onloadeddata = resolve;
        video.onerror = () => reject(Error('Recorded landscape did not decode'));
        video.src = url;
      });
      const presented = new Promise(resolve => video.requestVideoFrameCallback(resolve));
      await video.play();
      await presented;
      video.pause();
      const stage = document.getElementById('creationCanvas');
      const sample = document.createElement('canvas');
      sample.width = video.videoWidth; sample.height = video.videoHeight;
      const ctx = sample.getContext('2d');
      ctx.drawImage(video,0,0);
      const framePixels = ctx.getImageData(0,0,sample.width,sample.height).data;
      const original = stage.getContext('2d').getImageData(0,0,stage.width,stage.height).data;
      let checked = 0, matched = 0;
      for (let y=4; y<sample.height; y+=9) for (let x=4; x<sample.width; x+=9) {
        const index = (y*sample.width+x)*4;
        if ([0,1,2].every(k => Math.abs(framePixels[index+k]-original[index+k]) < 25)) matched++;
        checked++;
      }
      return {size:[sample.width,sample.height], stage:[stage.width,stage.height], match:matched/checked, first:[...framePixels.slice(0,4)], reference:[...original.slice(0,4)]};
    } finally {
      video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url);
    }
  }, videoBytes.toString('base64'));
  assert.deepEqual(quality.size,quality.stage);
  assert.ok(quality.match>.98, 'encoded video reproduces landscape colors and crop: '+JSON.stringify(quality));
  const pending = page.waitForEvent('download');
  await frame.locator('#creationDownload').click();
  const file = await pending, bundle = JSON.parse(await fs.readFile(await file.path(),'utf8'));
  const backdrop = bundle.scene.actors.find(a=>a.layer==='backdrop');
  assert.ok(backdrop.assetId.endsWith(pin));
  assert.equal(backdrop.backdropFit,'cover');
  assert.deepEqual(Buffer.from(bundle.art.drawings.find(d=>d.sha256===pin).data,'base64'),bytes);
}

async function run() {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH, headless: true});
  try {
    await fs.mkdir(output, {recursive: true});
    const page = await browser.newPage({viewport: {width: 1500, height: 1080}, acceptDownloads: true});
    const requests = [], errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', req => {
      if (/^https?:/.test(req.url()) && req.url() !== reviewURL) requests.push(req.url());
    });
    if (inline) await page.route(reviewURL, route => route.fulfill({path: artifact, contentType: 'text/html'}));
    await page.goto(reviewURL, {timeout: 120000});
    await page.waitForFunction(() => document.querySelector('#loading').hidden);
    await page.selectOption('#device', 'desktop');
    await page.selectOption('#destination', 'art');
    const frame = page.frames().find(f => f.parentFrame() === page.mainFrame());
    const original = await frame.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 80;
      const c = canvas.getContext('2d');
      c.fillStyle = '#5e4c7b';
      c.beginPath();
      c.moveTo(7, 55); c.lineTo(22, 23); c.lineTo(48, 14); c.lineTo(77, 28);
      c.lineTo(93, 53); c.lineTo(76, 66); c.lineTo(28, 68); c.closePath(); c.fill();
      c.strokeStyle = '#dfc9bb';
      c.beginPath(); c.moveTo(29, 34); c.lineTo(47, 23); c.lineTo(61, 29); c.stroke();
      return canvas.toDataURL('image/png').split(',')[1];
    });
    const bytes = Buffer.from(original, 'base64');
    const hash = createHash('sha256').update(bytes).digest('hex');
    await frame.setInputFiles('#artUpload', {name: 'Fixture rock.png', mimeType: 'image/png', buffer: bytes});
    await frame.locator('#artUseScene').click();
    await frame.locator('#creationWorkspace').waitFor({state: 'visible'});
    const first = await frame.evaluate(() => FG.creation.scene());
    const pin = first.actors[0].assetId;
    assert.ok(pin.startsWith('art:image:') && pin.endsWith(':' + hash));
    await verifyRock(frame, pin);
    await frame.locator('#creationKeep').click();
    await capture(frame, 'first-scene');
    await frame.locator('#creationBack').click();
    await frame.locator('#creationFreeMode').click();
    await frame.locator('[data-creation-starter="blank"]').click();
    const tools = frame.locator('#creationCharacterTools');
    if (!await frame.locator('#creationAddActor').isVisible() && await tools.isVisible()) await tools.click();
    await frame.locator('#creationAddActor').click();
    await frame.locator('#creationPrivateActorChoices [data-private-art]').filter({hasText: 'Fixture rock'}).click();
    await verifyRock(frame, pin);
    const before = await frame.evaluate(() => FG.creation.scene());
    const worlds = ['sky', 'workshop', 'meadow', 'night'];
    const renderDigests = new Set();
    for (const world of worlds) {
      await chooseBackground(frame, world);
      await verifyRock(frame, pin);
      const png = await frame.locator('#creationCanvas').evaluate(canvas => canvas.toDataURL());
      renderDigests.add(createHash('sha256').update(png).digest('hex'));
      await capture(frame, world);
    }
    assert.equal(renderDigests.size, worlds.length, 'each retained background renders distinctly');
    await frame.locator('#creationUndo').click();
    await frame.waitForFunction(() => FG.creation.scene().background === 'meadow');
    const more = frame.locator('#creationMore');
    if (!await more.evaluate(el => el.open)) await more.locator('summary').click();
    await frame.locator('#creationRedo').click();
    await frame.waitForFunction(() => FG.creation.scene().background === 'night');
    await frame.locator('#creationKeep').click();
    const kept = await frame.evaluate(() => FG.creation.scene());
    assert.notEqual(kept.id, first.id);
    assert.deepEqual(kept.actors, before.actors);
    assert.deepEqual(kept.programs, before.programs);
    if (!await more.evaluate(el => el.open)) await more.locator('summary').click();
    const download = page.waitForEvent('download');
    await frame.locator('#creationDownload').click();
    const file = await download;
    const bundle = JSON.parse(await fs.readFile(await file.path(), 'utf8'));
    assert.deepEqual(bundle.scene, kept);
    assert.equal(bundle.art.drawings.length, 1);
    assert.deepEqual(Buffer.from(bundle.art.drawings[0].data, 'base64'), bytes);
    await frame.locator('#creationBack').click();
    await frame.locator('[data-scene="' + first.id + '"]').click();
    await verifyRock(frame, pin);
    assert.deepEqual(await frame.evaluate(() => FG.creation.scene()), first);
    for (const [device, width] of [['desktop', 1440], ['portrait', 820], ['mobile', 390]]) {
      await page.selectOption('#device', device);
      await frame.waitForFunction(w => innerWidth === w, width);
      const play = frame.locator('#creationPlayView');
      if (await play.isVisible()) await play.click();
      await verifyRock(frame, pin);
      const bounds = await frame.locator('#creationCanvas').evaluate(canvas => {
        const box = canvas.getBoundingClientRect();
        return {left: box.left, right: box.right, width: box.width};
      });
      assert.ok(bounds.width > 200 && bounds.left >= 0 && bounds.right <= width + 1, device);
      await page.locator('iframe').first().screenshot({path: path.join(output, device + '-workspace.png')});
    }
    await verifyLandscape(page,frame);
    assert.deepEqual(requests, []);
    assert.deepEqual(errors, []);
    console.log('PASS retained scene worlds, Canvas artwork color, immutable pin, undo/redo, byte-exact export, reopening, stage-resolution landscape crop and decoded video fidelity');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });

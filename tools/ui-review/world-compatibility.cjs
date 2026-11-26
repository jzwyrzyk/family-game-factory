// Replay a synthetic original in retained v1 scenes using the standalone review UI.
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
  if (!await settings.evaluate(el => el.open)) await settings.locator(':scope > summary').click();
  await frame.locator('#creationBackground').selectOption(world);
  await frame.waitForFunction(id => FG.creation.scene()?.background === id, world);
  await settings.locator(':scope > summary').click();
}

async function capture(frame, name) {
  await frame.locator('#creationCanvas').screenshot({path: path.join(output, name + '.png')});
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
    assert.deepEqual(requests, []);
    assert.deepEqual(errors, []);
    console.log('PASS retained scene worlds, Canvas artwork color, immutable pin, undo/redo, byte-exact export and reopening the first scene');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });

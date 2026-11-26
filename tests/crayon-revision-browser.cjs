// Synthetic art only. Exercise the ordinary My Art route and a reload.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const {start} = require('./browser-server.cjs');

async function records(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const open = indexedDB.open('family-private-drawings-v1');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const read = db.transaction('drawings').objectStore('drawings').getAll();
        read.onsuccess = () => resolve(read.result.map(({id, sha256, bytes, sourceId, sourceSha256}) => ({
          id, sha256, bytes: Array.from(new Uint8Array(bytes)), sourceId, sourceSha256
        })));
        read.onerror = () => reject(read.error);
      });
    } finally { db.close(); }
  });
}

async function main() {
  const server = start(process.env.ART_TEST_DIST || 'dist');
  await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
  let browser;
  try {
    browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox']});
    const page = await browser.newPage({viewport: {width: 1280, height: 960}});
    const posts = [], errors = [];
    page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/factory-config.json', route => route.abort());
    await page.goto('http://127.0.0.1:' + server.address().port + '/arcade/?art=1');
    await page.locator('#artDrawButton').click();
    const dialog = page.locator('dialog.drawing-paint');
    const canvas = dialog.locator('[data-paper]');
    const stroke = async (points) => {
      const rect = await canvas.boundingBox();
      const move = ([x, y]) => page.mouse.move(rect.x + rect.width * x / 900, rect.y + rect.height * y / 560);
      await move(points[0]);
      await page.mouse.down();
      for (const point of points.slice(1)) await move(point);
      await page.mouse.up();
    };
    const pixel = (x, y) => canvas.evaluate((paper, [x, y]) =>
      Array.from(paper.getContext('2d').getImageData(x, y, 1, 1).data), [x, y]);
    const pick = (name) => dialog.getByRole('button', {name: 'Use ' + name + ' crayon'}).click();
    await dialog.getByLabel('Paper',{exact:true}).selectOption('transparent');
    await dialog.locator('[data-title]').fill('Pebble with boots');
    await pick('Lilac');
    await stroke([[260,330],[240,310],[260,260],[300,215],[345,195],[420,180],[480,200],[545,245],[570,290],[550,330],[495,350],[395,365],[330,353],[260,330]]);
    await pick('Charcoal');
    await stroke([[360,265],[360,270]]);
    await stroke([[485,258],[485,266]]);
    await stroke([[390,300],[408,311],[432,312],[451,299]]);
    await pick('Teal');
    await stroke([[340,360],[345,394],[312,400],[305,416],[370,410],[365,360]]);
    await stroke([[470,356],[480,389],[530,393],[532,407],[457,410],[445,360]]);
    assert.equal((await pixel(0, 0))[3], 0);
    const picture = () => canvas.evaluate(paper => paper.toDataURL());
    const originalRaster = await picture();
    const output = process.env.ART_EVIDENCE_DIR;
    if (output) {
      fs.mkdirSync(output, {recursive: true});
      await page.screenshot({path: path.join(output, 'editable-sketch.png')});
    }
    await dialog.getByRole('button', {name: 'Keep my drawing'}).click();
    await dialog.waitFor({state: 'detached'});
    const [original] = await records(page);
    await page.reload();
    await page.getByRole('button', {name: /Pebble with boots/}).click();
    await page.getByRole('button', {name:'Continue drawing', exact: true}).click();
    await dialog.waitFor();
    assert.equal(await picture(), originalRaster, 'kept strokes reproduce the saved raster');
    await dialog.locator('[data-undo]').click();
    assert.notEqual(await picture(), originalRaster);
    await dialog.locator('[data-redo]').click();
    assert.equal(await picture(), originalRaster);
    await dialog.getByRole('button', {name:'Eraser',exact:true}).click();
    await stroke([[298,215],[310,213]]);
    assert.notEqual(await picture(), originalRaster);
    await dialog.locator('[data-title]').fill('Pebble, second version');
    await dialog.getByRole('button', {name: 'Keep my drawing'}).click();
    await dialog.waitFor({state: 'detached'});
    const all = await records(page);
    assert.equal(all.length, 2);
    assert.deepEqual(all.find(item => item.id === original.id), original);
    const revision = all.find(item => item.sourceId === original.id);
    assert.equal(revision.sourceSha256, original.sha256);
    assert.notEqual(revision.sha256, original.sha256);

    // Transfer both images through the real downloadable library. Restore into
    // a clean browser profile to prove recovery independently of the first DB.
    await page.locator('.art-library-more summary').click();
    const download = page.waitForEvent('download');
    await page.locator('#artExport').click();
    const downloaded = await download;
    const restored = await browser.newPage({viewport: {width: 390, height: 844}});
    await restored.route('**/factory-config.json', route => route.abort());
    await restored.goto(page.url());
    await restored.locator('#artRestore').setInputFiles(await downloaded.path());
    await restored.waitForFunction(() => document.querySelector('#artStatus')?.textContent.includes('Original art versions restored'));
    assert.deepEqual(await records(restored), all);
    await restored.getByRole('button', {name: /Pebble with boots/}).click();
    await restored.getByRole('button', {name: 'Continue drawing', exact: true}).click();
    const recovered = restored.locator('dialog.drawing-paint [data-paper]');
    assert.equal(await recovered.evaluate(paper => paper.toDataURL()), originalRaster);
    assert.equal(await restored.locator('dialog.drawing-paint').evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
    if (output) await restored.screenshot({path: path.join(output, 'restored-sketch-phone.png')});
    await restored.close();

    // Preserve a genuine source chunk but pair it with unrelated pixels.
    const foreign = Buffer.from(await page.evaluate(() => {
      const raster = document.createElement('canvas');
      raster.width = 900;
      raster.height = 560;
      return raster.toDataURL().split(',')[1];
    }), 'base64');
    const bytes = Buffer.from(original.bytes);
    const offset = bytes.indexOf('jeMS') - 4;
    assert.ok(offset > 0);
    const sourceChunk = bytes.subarray(offset, offset + 12 + bytes.readUInt32BE(offset));
    const mismatched = Buffer.concat([foreign.subarray(0, -12), sourceChunk, foreign.subarray(-12)]);
    await page.locator('#artUpload').setInputFiles({name:'Other picture.png',mimeType:'image/png',buffer:mismatched});
    await page.waitForFunction(() => document.querySelector('#artDetailTitle')?.textContent === 'Other picture');
    await page.getByRole('button',{name:'Continue drawing',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('#artStatus')?.textContent.includes('could not reopen exactly'));
    assert.equal(await dialog.count(), 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(posts, []);
    console.log('PASS My Art strokes, transparent PNG, erase, undo/redo after reload, immutable lineage, byte-exact backup recovery, foreign-raster rejection and zero POSTs');
  } finally { await browser?.close(); server.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
const {existsSync} = require('node:fs');
const {resolve} = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');

async function main() {
  const file = resolve(process.argv[2] || 'dist-review/jems-drawing-review.html');
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH ||
    (!process.env.CI && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined)});
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 900}});
    const departures = [];
    const url = process.env.UI_REVIEW_INLINE_HARNESS === '1' ? 'http://localhost:43199/' : pathToFileURL(file).href;
    if (url.startsWith('http:')) await page.route(url, route => route.fulfill({contentType: 'text/html', path: file}));
    page.on('request', request => {
      if (request.url() !== url && /^https?:/.test(request.url())) departures.push(request.url());
    });
    await page.goto(url);
    const app = page.frameLocator('#appFrame');
    const sketch = 'Offline stamp fixture';
    assert.ok(await app.locator('#artDrawButton strong').evaluate(label => parseFloat(getComputedStyle(label).fontSize) >= 18));
    await app.locator('#artDrawButton').click();
    const editor = app.getByRole('dialog', {name: 'Draw something new'});
    await editor.locator('[data-stamp=blue]').click();
    await editor.locator('[data-paper]').click({position: {x: 100, y: 140}});
    await editor.locator('[data-title]').fill(sketch);
    await editor.locator('[data-save]').click();
    await app.locator('#artDetailTitle').filter({hasText: sketch}).waitFor();
    await page.reload();
    await app.locator('#artGrid .art-card').filter({hasText: sketch}).click();
    await app.getByRole('button', {name: 'Keep drawing'}).click();
    const reopened = app.getByRole('dialog', {name: 'Keep drawing'});
    await reopened.locator('[data-stamp=blue]:enabled').waitFor();
    await reopened.locator('[data-paper]').press('Enter');
    await reopened.locator('[data-save]').click();
    await reopened.waitFor({state: 'detached'});
    assert.equal(await app.locator('#artGrid .art-card').count(), 2);
    const assets = await app.locator('#page-art-studio img:visible').evaluateAll(images =>
      images.every(image => image.complete && image.naturalWidth > 0));
    assert.ok(assets, 'visible My Art images load');
    const mappedFile = await app.locator('#page-art-studio').evaluate(async () => {
      const image = new Image();
      image.src = 'file:///review-folder/jems-art/gem_blue.webp';
      await image.decode();
      return image.src.startsWith('blob:') && image.naturalWidth > 0;
    });
    assert.ok(mappedFile, 'file-host asset names resolve to embedded stamp bytes');
    assert.deepEqual(departures, []);
    const source = await page.locator('#baseline').textContent();
    console.log('PASS drawing review, approved stamp, keep, reload, edit, two versions, zero external requests.', url.startsWith('http:') ? 'In-memory transport.' : 'Direct file navigation.', source);
  } finally {await browser.close();}
}
main().catch(error => {console.error(error); process.exitCode = 1;});

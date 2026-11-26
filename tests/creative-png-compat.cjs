// Run against a built PR199 checkout and the integrated build on separate origins.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const {once} = require('node:events');
const {chromium} = require('playwright');
const {start} = require('./browser-server.cjs');

async function harvest(page) {
  const tools = page.locator('.art-library-more');
  if (!await tools.evaluate(element => element.open)) await tools.locator('summary').click();
  const download = page.waitForEvent('download');
  await page.locator('#artExport').click();
  return JSON.parse(await fs.readFile(await (await download).path(), 'utf8'));
}

async function restore(page, bundle) {
  await page.locator('#artRestore').setInputFiles({
    name:'synthetic-art.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(bundle)),
  });
  await page.waitForFunction(() => document.getElementById('artStatus').textContent.includes('Original art versions restored'));
}

async function run() {
  const [peerDist, currentDist] = process.argv.slice(2);
  assert.ok(peerDist && currentDist, 'Pass the PR199 dist directory and the integrated dist directory.');
  const servers = [start(peerDist), start(currentDist)];
  let browser;
  try {
    await Promise.all(servers.map(server => server.listening || once(server, 'listening')));
    browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH, args:['--no-sandbox']});
    const context = await browser.newContext();
    const [peer, current] = await Promise.all([context.newPage(),context.newPage()]);
    const posts = [], errors = [];
    for (const [index,page] of [peer,current].entries()) {
      page.on('pageerror', error => errors.push(String(error)));
      page.on('request', request => { if(request.method()==='POST') posts.push(request.url()); });
      await page.route('**/factory-config.json', route => route.abort());
      await page.goto('http://127.0.0.1:' + servers[index].address().port + '/arcade/?art=1');
      await page.locator('#artDrawButton').waitFor();
    }
    await peer.locator('#artDrawButton').click();
    const peerEditor = peer.locator('dialog.drawing-paint');
    await peerEditor.locator('[data-title]').fill('Shared pebble');
    await peerEditor.getByLabel('Clear background').check();
    await peerEditor.getByRole('button',{name:'Use Lilac crayon'}).click();
    const peerPaper = peerEditor.locator('[data-paper]');
    await peerPaper.press('Space+ArrowRight');
    await peerPaper.press('Enter');
    await peerEditor.locator('[data-save]').click();
    await peerEditor.waitFor({state:'detached'});
    const before = await harvest(peer);
    assert.equal(before.drawings.length, 1);
    await restore(current, before);
    await current.locator('#artContinueDrawing').click();
    const editor = current.locator('dialog.drawing-paint');
    await editor.getByRole('button',{name:'Use Teal crayon'}).click();
    const paper = editor.locator('[data-paper]');
    await paper.press('ArrowDown');
    await paper.press('Enter');
    await editor.locator('[data-title]').fill('Shared pebble two');
    const raster = await paper.evaluate(canvas => canvas.toDataURL());
    await editor.locator('[data-save]').click();
    await editor.waitFor({state:'detached'});
    const after = await harvest(current);
    const parent = after.drawings.find(item => item.id === before.drawings[0].id);
    assert.deepEqual(parent, before.drawings[0]);
    const revision = after.drawings.find(item => item.sourceId === parent.id);
    assert.equal(revision.sourceSha256, parent.sha256);
    await restore(peer, after);
    await peer.getByRole('button',{name:/Shared pebble two/}).click();
    await peer.getByRole('button',{name:'Keep drawing',exact:true}).click();
    assert.equal(await peerPaper.evaluate(canvas => canvas.toDataURL()), raster);
    assert.deepEqual(posts, []);
    assert.deepEqual(errors, []);
    console.log('PASS PR199-authored library restores byte-exactly, integrated edition reopens pixel-exactly in PR199, zero POSTs.');
  } finally {
    await browser?.close();
    for (const server of servers) server.close();
  }
}
run().catch(error => { console.error(error); process.exitCode=1; });

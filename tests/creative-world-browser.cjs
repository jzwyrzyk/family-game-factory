const assert = require('node:assert/strict');
const fs = require('node:fs');
const { once } = require('node:events');
const { chromium } = require('playwright');
const { start } = require('./browser-server.cjs');

(async () => {
  const server = start(process.env.WORLD_TEST_DIST || 'dist');
  if (!server.listening) await once(server, 'listening');
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ||
      (!process.env.CI && fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
      args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/factory-config.json', route => route.fulfill({ json: { version:1, mode:'unavailable' } }));
    await page.goto('http://127.0.0.1:' + server.address().port + '/arcade/?creation=1');
    const click = selector => page.locator(selector).click();
    const settings = async () => {
      if (await page.locator('#creationSceneOptions').evaluate(el => el.open)) await click('#creationSettingsDone');
      else await click('#creationSceneOptions > summary');
    };
    const saved = () => page.evaluate(() => FG.creation.scene());
    await click('#creationIntroSkip');
    if (!await page.locator('[data-creation-starter="dragon"]').isVisible()) await click('#creationFreeMode');
    await click('[data-creation-starter="dragon"]');
    await settings();
    // Compare an unobstructed stage pixel to the same pixel on the decoded,
    // aspect-filled plate. A CSS-only editor backdrop cannot pass this check.
    fs.mkdirSync('test-results', { recursive:true });
    for (const [key, art] of Object.entries({
      'world-cloud-v1':'cloud', 'world-workshop-v1':'workshop',
      'world-forest-v1':'forest', 'world-moon-v1':'moon',
    })) {
      await page.locator('#creationBackground').selectOption(key);
      await page.waitForFunction(async ({key,art}) => {
        if (FG.creation.scene().background !== key) return false;
        const stage = document.getElementById('creationCanvas');
        const canvas = document.createElement('canvas');
        canvas.width = stage.width; canvas.height = stage.height;
        const expected = canvas.getContext('2d'), actual = stage.getContext('2d');
        for (const layer of ['background','middle','foreground']) {
          const image = new Image(); image.src = new URL('art/creative-worlds/v1/' + art + '-' + layer + '.webp', document.baseURI);
          await image.decode();
          const zoom = Math.max(canvas.width/image.width, canvas.height/image.height);
          const w = image.width*zoom, h = image.height*zoom;
          expected.drawImage(image, (canvas.width-w)/2, (canvas.height-h)/2, w, h);
        }
        const reference = expected.getImageData(15,65,12,12).data;
        return actual.getImageData(15,65,12,12).data.every((v,i) => v === reference[i]);
      }, {key,art});
      await page.locator('#creationCanvas').screenshot({path:'test-results/creative-world-' + key + '.png'});
    }
    await page.getByText('Decorate the world',{exact:true}).click();
    await page.locator('#creationSceneryType').selectOption('world-prop-rocket-v1');
    await click('#creationAddScenery');
    const initial = await saved();
    const prop = page.locator('details[data-scenery-id]').first();
    await prop.locator(':scope > summary').click();
    for (let i = 0; i < 5; i++) await prop.getByRole('button', { name:'Right', exact:true }).click();
    await prop.getByRole('button', { name:'Bigger', exact:true }).click();
    await prop.getByRole('button', { name:'In front', exact:true }).click();
    const customized = await saved();
    assert.equal(customized.world.scenery[0].x, initial.world.scenery[0].x + 150);
    assert.equal(customized.world.scenery[0].size, initial.world.scenery[0].size + 20);
    assert.equal(customized.world.scenery[0].layer, 'in-front');
    await settings();
    await click('#creationKeep');
    await page.waitForFunction(() => !document.querySelector('#page-creation').hasAttribute('aria-busy'));
    fs.mkdirSync('test-results', { recursive:true });
    await page.locator('#creationCanvas').screenshot({ path:'test-results/creative-world-moon-stage.png' });
    await click('#creationBack');
    await click('#creationFreeMode');
    await click('[data-creation-starter="robot"]');
    const destination = await saved();
    await settings();
    await click('#creationUseSavedWorld summary');
    await page.locator('#creationKeptWorlds').getByRole('button', {name:customized.title}).click();
    await page.waitForFunction(() => FG.creation.scene().background === 'world-moon-v1');
    const copied = await saved();
    assert.deepEqual(copied.world, customized.world);
    assert.deepEqual(copied.actors, destination.actors);
    assert.deepEqual(copied.programs, destination.programs);
    await settings();
    await click('#creationUndo');
    await page.waitForFunction(() => FG.creation.scene().background === 'world-workshop-v1');
    assert.deepEqual((await saved()).world, destination.world);
    assert.deepEqual(errors, []);
    console.log('Kept illustrated world, depth, placement, scale, reuse across scenes and Undo passed.');
  } finally {
    await browser?.close();
    await new Promise(done => server.close(done));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

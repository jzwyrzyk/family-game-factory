/* Real decoded production artwork and disposable UI under the deployed base
 * path. Profiles/events here are explicit fixtures, never earned activity. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { build } = require('esbuild');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const fixture = `
import {loadApprovedPalArtwork} from './src/pals/approved-artwork';
import {createPalExpressionPanel} from './src/pals/expression-panel';
import './src/brand/art-library.css';
async function start(){
  const resolver=await loadApprovedPalArtwork();
  const character=document.querySelector('#character'), form=document.querySelector('#form');
  for(const item of resolver.manifest.characters){const option=document.createElement('option');option.value=item.characterKey;option.textContent=item.name;character.append(option);}
  character.value='first-round-2026-11-19/R';
  const panel=createPalExpressionPanel({resolver,scope:'fixture-player1',characterKey:character.value,form:'base'});
  document.querySelector('#expressions').append(panel.element);
  const select=()=>panel.setSelection({scope:'fixture-player1',characterKey:character.value,form:form.value});
  character.onchange=select;form.onchange=select;
  window.palsExpressionFixture={resolver,panel,select,view:()=>panel.portrait.controller.state};
}
start().catch(error=>{document.querySelector('#status').textContent=error.message;window.fixtureError=error.message;});
`;

(async () => {
  const output = await build({ absWorkingDir: root,
    stdin: { contents: fixture, resolveDir: root, sourcefile: 'pal-expression-fixture.ts' },
    bundle: true, format: 'iife', outdir: 'pal-expression-fixture', write: false,
    external: ['/fonts/*', '/jems-art/*'],
  });
  const js = output.outputFiles.find(file => file.path.endsWith('.js')).text;
  const css = output.outputFiles.find(file => file.path.endsWith('.css')).text;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="/arcade/"><title>Gem Pal expression review</title><link rel="stylesheet" href="./bundle.css"><style>body{margin:0;background:#fff;color:#0B1E3B;font:18px/1.4 Inter,system-ui}main{max-width:620px;margin:24px auto;padding:0 20px}h1{font:800 32px/1.2 Nunito,system-ui;margin:0 0 20px}.choices{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}label{display:grid;gap:6px;flex:1;min-width:120px}select,button{font:700 18px/1.3 Inter,system-ui;min-height:48px;padding:10px;border:1px solid #A58EBE;border-radius:12px;background:#fff;color:#422063}#outside{margin-top:24px}*{box-sizing:border-box}</style></head><body><main><h1>Meet the Pals</h1><div class="choices"><label>Pal<select id="character"></select></label><label>Form<select id="form"><option value="base">Base</option><option value="mature">Grown</option></select></label></div><div id="expressions"></div><p id="status" role="status"></p><button id="outside">Keep playing</button></main><script src="./bundle.js"></script></body></html>`;
  const mime = { '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.json': 'application/json' };
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/arcade/' || pathname === '/') { response.setHeader('content-type', 'text/html'); response.end(html); return; }
    if (pathname === '/arcade/bundle.js') { response.setHeader('content-type', 'application/javascript'); response.end(js); return; }
    if (pathname === '/arcade/bundle.css') { response.setHeader('content-type', 'text/css'); response.end(css); return; }
    const file = path.resolve(root, 'public', pathname.replace(/^\/arcade\//, '').replace(/^\//, ''));
    if (!file.startsWith(path.join(root, 'public') + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream'); response.end(fs.readFileSync(file));
  });
  let browser;
  const results = [];
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1040, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [], requests = [], posts = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { requests.push(request.url()); if (request.method() === 'POST') posts.push(request.url()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/arcade/`);
    await page.waitForFunction(() => !!window.palsExpressionFixture || !!window.fixtureError);
    assert.equal(await page.evaluate(() => window.fixtureError), undefined);
    const portrait = page.locator('#expressions .pal-artwork-view');
    const ready = async expression => page.waitForFunction(expression => {
      const view = document.querySelector('#expressions .pal-artwork-view');
      return view?.dataset.state === 'ready' && view.dataset.expression === expression;
    }, expression);
    await ready('neutral');
    assert.equal(await page.evaluate(() => document.activeElement.tagName), 'BODY', 'The first image load does not choose a focused control');
    assert.equal(await page.locator('#character option').count(), 23);
    assert.equal(await page.evaluate(() => window.palsExpressionFixture.resolver.manifest.scope.assetCount), 184);
    assert.equal(requests.filter(url => /\/jems-pals\/.*\.webp/.test(url)).length, 1, 'Opening a portrait loads one image, not the complete roster');
    assert.match(await portrait.locator('img').getAttribute('src'), /\/arcade\/jems-pals\/wink\/base\/neutral-/);
    assert.ok(await portrait.locator('img').evaluate(image => image.complete && image.naturalWidth > 0));
    results.push('real184-asset manifest, exact character/form selection, base-path loading and one initial image');

    for (const expression of ['celebrate', 'thinking', 'encouraging_retry', 'neutral']) {
      await page.locator(`button[data-expression="${expression}"]`).click(); await ready(expression);
      assert.equal(await page.locator(`button[data-expression="${expression}"]`).getAttribute('aria-pressed'), 'true');
      assert.equal(await portrait.evaluate(element => element.getAnimations({ subtree: true }).length), 0, 'Reduced motion swaps the image without animation');
    }
    await page.selectOption('#form', 'mature'); await ready('neutral');
    assert.match(await portrait.locator('img').getAttribute('src'), /\/wink\/mature\/neutral-/);
    await page.locator('button[data-expression="celebrate"]').click(); await ready('celebrate');
    assert.match(await portrait.locator('img').getAttribute('src'), /\/wink\/mature\/celebrate-/);
    results.push('all three expressions, own-form Grown resolution and reduced-motion behavior');

    await page.selectOption('#form', 'base'); await ready('neutral');
    let releaseThinking;
    const delayedThinking = new Promise(resolve => { releaseThinking = resolve; });
    await page.route('**/jems-pals/wink/base/thinking-*.webp', async route => { await delayedThinking; await route.continue().catch(() => {}); });
    await page.locator('button[data-expression="thinking"]').click();
    await page.waitForFunction(() => window.palsExpressionFixture.view().status === 'loading');
    await page.selectOption('#form', 'mature'); await ready('neutral');
    releaseThinking();
    await page.waitForTimeout(80);
    assert.equal(await portrait.getAttribute('data-form'), 'mature');
    assert.equal(await portrait.getAttribute('data-expression'), 'neutral', 'Late Base image cannot overwrite Grown');
    await page.unroute('**/jems-pals/wink/base/thinking-*.webp');
    results.push('cancelled late decode cannot cross the selected form');

    await page.selectOption('#form', 'base'); await ready('neutral');
    await page.route('**/jems-pals/wink/base/celebrate-*.webp', route => route.abort());
    await page.locator('button[data-expression="celebrate"]').click(); await ready('neutral');
    assert.equal(await page.evaluate(() => window.palsExpressionFixture.view().failure), 'load-failed');
    assert.match(await portrait.locator('img').getAttribute('src'), /\/wink\/base\/neutral-/);
    await page.unroute('**/jems-pals/wink/base/celebrate-*.webp');
    await page.route('**/jems-pals/navi/base/neutral-*.webp', route => route.abort());
    await page.selectOption('#character', 'first-round-2026-11-19/F1');
    const imageRetry = page.getByRole('button', { name: 'Try loading again', exact: true });
    const imageFailed = () => page.waitForFunction(() => window.palsExpressionFixture.view().status === 'unavailable'
      && document.querySelector('.pal-expression-panel__retry')?.getAttribute('aria-disabled') !== 'true');
    await imageRetry.waitFor();
    assert.equal(await portrait.locator('img').count(), 0, 'Missing neutral never shows the previous character');
    await imageRetry.focus(); await page.keyboard.press('Enter'); await imageFailed();
    assert.equal(await imageRetry.evaluate(button => document.activeElement === button), true, 'Repeated image failure keeps keyboard retry focus');

    await page.unroute('**/jems-pals/navi/base/neutral-*.webp');
    let releaseRetry;
    const delayedRetry = new Promise(resolve => { releaseRetry = resolve; });
    await page.route('**/jems-pals/navi/base/neutral-*.webp', async route => { await delayedRetry; await route.abort().catch(() => {}); });
    await imageRetry.press('Enter');
    await page.waitForFunction(() => window.palsExpressionFixture.view().status === 'loading');
    await page.locator('#outside').focus(); releaseRetry(); await imageFailed();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'outside', 'Image retry completion respects a newer focus choice');

    await page.unroute('**/jems-pals/navi/base/neutral-*.webp');
    let releaseHiddenRetry, hiddenRetryDone;
    const heldRetry = new Promise(resolve => { releaseHiddenRetry = resolve; });
    const endedRetry = new Promise(resolve => { hiddenRetryDone = resolve; });
    await page.route('**/jems-pals/navi/base/neutral-*.webp', async route => {
      await heldRetry; await route.abort().catch(() => {}); hiddenRetryDone();
    });
    await imageRetry.focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.palsExpressionFixture.view().status === 'loading');
    await page.evaluate(() => window.palsExpressionFixture.panel.setVisible(false));
    await page.locator('#outside').focus(); releaseHiddenRetry(); await endedRetry;
    assert.equal(await page.evaluate(() => document.activeElement.id), 'outside', 'A hidden image retry never restores focus into its old panel');
    await page.evaluate(() => window.palsExpressionFixture.panel.setVisible(true)); await imageFailed();
    await page.unroute('**/jems-pals/navi/base/neutral-*.webp');
    await imageRetry.focus(); await page.keyboard.press('Enter'); await ready('neutral');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.expression), 'neutral', 'A successful current image retry continues at Ready');
    assert.equal(await portrait.getAttribute('data-source-hash'), 'f0d1f53e54dd47da4a658ea2252e9c8ab8c54eceb3ba9fff6c978eb9d1bb4e62');
    results.push('same-form neutral fallback, visible retry and exact corrected Navi Base');
    results.push('image retry keyboard recovery after repeated failure, without first-load autofocus or focus theft after moving or hiding');

    await page.locator('#outside').focus();
    await page.evaluate(() => window.palsExpressionFixture.panel.portrait.react('saved-success', 250));
    await ready('celebrate');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'outside', 'A reaction does not take focus');
    await ready('neutral');
    await page.evaluate(async () => { const panel=window.palsExpressionFixture.panel; await panel.portrait.preview('thinking'); await panel.setVisible(false); });
    assert.equal(await portrait.locator('img').count(), 0, 'Hidden presentation clears the old frame');
    await page.evaluate(() => window.palsExpressionFixture.panel.setVisible(true)); await ready('neutral');
    results.push('bounded saved-success reaction, focus preservation and hide/show neutral reset');

    await page.selectOption('#character', 'first-round-2026-11-19/R'); await ready('neutral');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => !window.palsExpressionFixture.view().reducedMotion);
    await page.evaluate(() => window.palsExpressionFixture.panel.portrait.preview('celebrate'));
    assert.equal(await portrait.getAttribute('data-motion'), 'expression-fade');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // emulateMedia updates the query before Chromium delivers its asynchronous
    // change event. Wait for the actual controller notification, then verify
    // that the active Web Animation was canceled rather than leaking a layer.
    await page.waitForFunction(() => window.palsExpressionFixture.view().reducedMotion
      && document.querySelector('#expressions .pal-artwork-view')?.dataset.motion === 'none',
    null, { timeout: 3000 });
    assert.equal(await portrait.evaluate(element => element.getAnimations({ subtree: true }).length), 0, 'Reduced-motion notification cancels the pilot animation');
    await page.locator('button[data-expression="thinking"]').click(); await ready('thinking');
    assert.equal(await portrait.locator('img').count(), 1, 'Interrupted transitions leave one selected image');
    await page.locator('button[data-expression="celebrate"]').click(); await ready('celebrate');
    results.push('finite Wink Base fade, live reduced-motion change and clean interrupted layers');

    fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'test-results/pals-expressions-desktop.png'), fullPage: true });
    for (const width of [768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px viewport has no horizontal overflow`);
      const controls = await page.locator('.pal-expression-panel button:visible').evaluateAll(buttons => buttons.map(button => ({ height: button.getBoundingClientRect().height, font: parseFloat(getComputedStyle(button).fontSize) })));
      assert.ok(controls.every(button => button.height >= 48 && button.font >= 18), 'Expression controls retain readable text and touch targets');
      assert.equal(await portrait.locator('img').evaluate(image => getComputedStyle(image).objectFit), 'contain');
      if (width === 390) await page.screenshot({ path: path.join(root, 'test-results/pals-expressions-mobile.png'), fullPage: true });
    }
    const postsBeforeDispose = posts.length;
    await page.evaluate(() => window.palsExpressionFixture.panel.dispose());
    assert.equal(await page.locator('#expressions img').count(), 0);
    assert.equal(postsBeforeDispose, 0, 'Expression presentation makes no provider or state-changing POST');
    assert.deepEqual(errors, []);
    results.push('desktop/tablet/phone layout, 18px labels, complete framing and disposal');
    fs.writeFileSync(path.join(root, 'test-results/pals-expressions-results.json'), JSON.stringify({ scope: 'Real static assets with synthetic selection and host triggers; no live deployment, earned reward or articulated rig acceptance.', results, passed: results.length }, null, 2));
    console.log(`PASS: ${results.length} Gem Pal expression browser groups`);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });

/* Production-dist companion journeys. Starter choice, editing, keeping, learning,
 * profiles and preferences use actual UI controls. Later collection/stage checks
 * are explicitly labeled synthetic trusted-source receipt fixtures. No game or
 * public FG.pals interface can award those receipts. No paid provider is invoked. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const { build } = require('esbuild');
const { chromium } = require('playwright');
const playwrightVersion = require('playwright/package.json').version;
const { start } = require('./browser-server.cjs');
const { exploreWelcome, navigate, openRetainedGame } = require('./studio-entry.cjs');

const root = path.resolve(__dirname, '..');
const outputs = path.join(root, 'test-results');
const approvedArtwork = JSON.parse(fs.readFileSync(path.join(root, 'public/jems-pals/manifest.json'), 'utf8'));
const approvedReferences = JSON.parse(fs.readFileSync(path.join(root, 'docs/pals/art/character-references.json'), 'utf8'));
const palArtworkPaths = new Set([
  ...approvedArtwork.characters.flatMap(character => Object.values(character.forms).flatMap(form => Object.values(form.expressions).map(expression => expression.url))),
  ...approvedReferences.roster_entries.flatMap(entry => entry.members.flatMap(member => Object.values(member.application_mapping?.forms || {}).map(form => form.neutral_url))),
]);
const ready = page => page.waitForFunction(() => window.FG?.pals?.view()?.owner === FG.store.current().id && !!FG.creation && !!FG.studio);
const view = page => page.evaluate(() => FG.pals.view());
const scene = page => page.evaluate(() => FG.creation.scene());
const workspace = page => page.evaluate(() => FG.creation.export());
const snapshot = page => page.evaluate(() => FG.creation.snapshot());
const gems = page => page.evaluate(async () => (await FG.rewards.summary()).lifetimeGems);
const idle = page => page.waitForFunction(() => document.getElementById('page-jems-pals')?.getAttribute('aria-busy') === 'false');
const activeMath = page => page.locator('.math-activity:visible');
const set = async (locator, value) => { await locator.fill(String(value)); await locator.press('Tab'); };

async function openPals(page) {
  await navigate(page,'#studioNavPals');
  await page.locator('#page-jems-pals').waitFor({ state: 'visible' });
  await idle(page);
}
async function chooseFamily(page, index) {
  if (!await page.locator('#studioProfileMenu').evaluate(element => element.open)) await page.click('#studioProfileMenu summary');
  await page.locator('.profile-choice:not(#adultProfileChoice)').nth(index).click();
  await page.waitForFunction(index => FG.store.current().id === `player${index + 1}` && FG.pals.view()?.owner === `player${index + 1}`, index); await exploreWelcome(page);
}
async function pacingFixture(page) {
  await page.evaluate(() => {
    // Editor pacing only. This supplies no attempt, completion receipt or gems.
    FG.store.changeProfile({ rate: 1 }); FG.store.current().mathWindow = [Date.now()];
    if (!FG.store.save()) throw Error('Could not save the editor pacing fixture');
  });
}
async function noOverflow(page, name) {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    outside: [...document.querySelectorAll('body *')].filter(element => element.getClientRects().length && element.getBoundingClientRect().right > innerWidth + 2)
      .slice(0, 8).map(element => ({ tag: element.tagName, id: element.id, className: element.className })) }));
  assert.ok(dimensions.scrollWidth <= dimensions.width + 2, `${name} fits the viewport: ${JSON.stringify(dimensions)}`);
}
async function selectedNav(page, id) {
  const selected = await page.locator('.studio-nav button.active,.studio-nav button[aria-current="page"]').evaluateAll(buttons => [...new Set(buttons.map(button => button.id))]);
  assert.deepEqual(selected, [id], 'Only the current destination is marked active in navigation');
}
async function readablePalText(page, selector) {
  const readings = await page.locator(selector).evaluateAll(elements => elements.map(element => {
    const color = getComputedStyle(element).color;
    const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
      const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    return { text: element.textContent, color, contrastAgainstWhite: 1.05 / (luminance + 0.05) };
  }));
  assert.ok(readings.length && readings.every(reading => reading.contrastAgainstWhite >= 4.5), `Pal text stays readable inside the production shell: ${JSON.stringify(readings)}`);
}
function installPalImageHistory({ urls }) {
  // Passive, current-document evidence only. No image/source/style mutation,
  // layout reads, retries, fetches, or per-event browser-protocol round trips.
  const allowed = new Set(urls), ids = new WeakMap(), pendingByImage = new WeakMap(), history = [];
  const limit = 2000, states = new Set(['loading', 'ready', 'unavailable']);
  const errorNames = new Set(['EncodingError', 'AbortError', 'InvalidStateError', 'TypeError', 'NotSupportedError']);
  let nextImageId = 0, nextDecodeId = 0, dropped = 0, diagnosticErrors = 0;
  let pendingDecodes = 0, peakPendingDecodes = 0;
  const decodeTotals = { started: 0, resolved: 0, rejected: 0, threw: 0 };
  const approvedUrl = value => allowed.has(value) ? value : null;
  const tracked = image => image instanceof HTMLImageElement && (allowed.has(image.src) || allowed.has(image.currentSrc) || ids.has(image));
  const picture = image => {
    if (!tracked(image)) return null;
    if (!ids.has(image)) ids.set(image, ++nextImageId);
    const portrait = image.closest('.pals-portrait');
    return { imageId: ids.get(image), src: approvedUrl(image.src), currentSrc: approvedUrl(image.currentSrc),
      connected: image.isConnected, complete: image.complete, hidden: image.hidden,
      naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
      portraitState: states.has(portrait?.dataset.state) ? portrait.dataset.state : null,
      hero: !!portrait?.classList.contains('pals-hero-portrait') };
  };
  const record = (type, image, detail = {}) => {
    try {
      const state = picture(image);
      if (!state) return;
      history.push({ type, atMs: Math.round(performance.now() * 1000) / 1000, ...state,
        pendingDecodes, peakPendingDecodes, imagePendingDecodes: pendingByImage.get(image) || 0, ...detail });
      if (history.length > limit) { history.shift(); dropped += 1; }
    } catch { diagnosticErrors += 1; }
  };
  const errorName = error => errorNames.has(error?.name) ? error.name : 'Other';
  const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode');
  const nativeDecode = descriptor?.value, nativeThen = Promise.prototype.then;
  if (typeof nativeDecode === 'function') {
    Object.defineProperty(HTMLImageElement.prototype, 'decode', { ...descriptor, value: function decode(...args) {
      if (!tracked(this)) return Reflect.apply(nativeDecode, this, args);
      const image = this, decodeId = ++nextDecodeId, startSrc = approvedUrl(image.src);
      decodeTotals.started += 1; pendingDecodes += 1;
      peakPendingDecodes = Math.max(peakPendingDecodes, pendingDecodes);
      pendingByImage.set(image, (pendingByImage.get(image) || 0) + 1);
      const settled = outcome => {
        decodeTotals[outcome] += 1; pendingDecodes -= 1;
        pendingByImage.set(image, pendingByImage.get(image) - 1);
      };
      record('decode-start', image, { decodeId, startSrc });
      let promise;
      try { promise = Reflect.apply(nativeDecode, image, args); }
      catch (error) { settled('threw'); record('decode-throw', image, { decodeId, startSrc, errorName: errorName(error) }); throw error; }
      // Observe the native result; never return this observation's Promise.
      // Rejections remain rejections for every original application/test caller.
      Reflect.apply(nativeThen, promise, [
        () => { settled('resolved'); record('decode-resolve', image, { decodeId, startSrc }); },
        error => { settled('rejected'); record('decode-reject', image, { decodeId, startSrc, errorName: errorName(error) }); },
      ]);
      return promise;
    } });
  }
  document.addEventListener('load', event => record('load', event.target), { capture: true, passive: true });
  document.addEventListener('error', event => record('error', event.target), { capture: true, passive: true });
  document.addEventListener('pal-picture-state', event => {
    if (event.target instanceof Element && event.target.matches('.pals-portrait')) record('portrait-state', event.target.querySelector('img'));
  }, { capture: true, passive: true });
  const recordTree = (type, node) => {
    if (!(node instanceof Element)) return;
    if (node instanceof HTMLImageElement) record(type, node);
    else for (const image of node.querySelectorAll('img')) record(type, image);
  };
  new MutationObserver(records => {
    try {
      for (const mutation of records) {
        if (mutation.type === 'childList') {
          for (const node of mutation.removedNodes) recordTree('dom-removed', node);
          for (const node of mutation.addedNodes) recordTree('dom-added', node);
        } else if (mutation.attributeName === 'data-state' && mutation.target.matches('.pals-portrait')) {
          record('portrait-state-mutation', mutation.target.querySelector('img'), {
            previousState: states.has(mutation.oldValue) ? mutation.oldValue : null,
          });
        } else if (mutation.target instanceof HTMLImageElement) {
          record(mutation.attributeName === 'src' ? 'src-mutation' : 'hidden-mutation', mutation.target);
        }
      }
    } catch { diagnosticErrors += 1; }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeOldValue: true,
    attributeFilter: ['src', 'hidden', 'data-state'] });
  Object.defineProperty(window, '__readPalImageHistory', { value: () => ({
    scope: 'Current document only; reload starts a new history. Approved Pal image metadata, no text or payloads.',
    timeOrigin: performance.timeOrigin, limit, dropped, diagnosticErrors,
    pendingDecodes, peakPendingDecodes, decodeTotals: { ...decodeTotals },
    nativeDecodeObserved: typeof nativeDecode === 'function', events: history.slice(),
  }) });
}
async function palImageDiagnostics(page, base) {
  // Failure evidence only: inspect attached pictures and existing public cache
  // entries. Never refetch, retry, alter the page, or accept unavailable art.
  let deadline;
  const inspection = page.evaluate(async ({ base, paths }) => {
    const allowed = new Set(paths.map(value => new URL(value, base).href));
    const pictures = [...document.querySelectorAll('#page-jems-pals .pals-portrait')].slice(0, 30).map(portrait => {
      const image = portrait.querySelector('img'), rect = image?.getBoundingClientRect();
      return { pal: portrait.dataset.pal, form: portrait.dataset.form, expression: portrait.dataset.expression, state: portrait.dataset.state,
        hero: portrait.classList.contains('pals-hero-portrait'), connected: !!image?.isConnected,
        src: allowed.has(image?.src) ? image.src : null, currentSrc: allowed.has(image?.currentSrc) ? image.currentSrc : null,
        complete: image?.complete, hidden: image?.hidden, naturalWidth: image?.naturalWidth, naturalHeight: image?.naturalHeight,
        visible: !!image?.getClientRects().length && getComputedStyle(image).visibility !== 'hidden',
        rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null };
    });
    const failed = pictures.filter(picture => picture.src && (picture.state !== 'ready' || !picture.complete || !picture.naturalWidth));
    const sampled = [...new Set(failed.map(picture => picture.src))].slice(0, 4);
    const comparison = pictures.find(picture => picture.src && picture.state === 'ready' && picture.naturalWidth > 0 && !sampled.includes(picture.src));
    if (comparison) sampled.push(comparison.src);
    const cacheEntries = [], prefix = 'family-arcade:' + new URL(base).pathname + ':';
    const cacheNames = await caches.keys().then(names => names.filter(name => name.startsWith(prefix)).slice(0, 2)).catch(error => {
      cacheEntries.push({ error: String(error) }); return [];
    });
    let totalBytes = 0;
    for (const name of cacheNames) {
      const cache = await caches.open(name).catch(error => { cacheEntries.push({ name, error: String(error) }); return null; });
      if (!cache) continue;
      for (const url of sampled) {
        const record = { name, url };
        cacheEntries.push(record);
        const response = await cache.match(url).catch(error => { record.error = String(error); return null; });
        record.found = !!response;
        if (!response) continue;
        Object.assign(record, { status: response.status, type: response.type, contentType: response.headers.get('content-type'), contentLength: response.headers.get('content-length') });
        const reader = response.body?.getReader(), chunks = [];
        let bytes = 0;
        try {
          if (!reader) throw Error('Cached response has no body');
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.byteLength; totalBytes += part.value.byteLength;
            if (bytes > 4 * 1024 * 1024 || totalBytes > 16 * 1024 * 1024) {
              await reader.cancel(); record.truncated = true; break;
            }
            chunks.push(part.value);
          }
          record.bytes = bytes;
          if (!record.truncated) {
            const body = new Uint8Array(bytes); let offset = 0;
            for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
            record.sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', body))].map(value => value.toString(16).padStart(2, '0')).join('');
          }
        } catch (error) { record.error = String(error); }
        if (totalBytes > 16 * 1024 * 1024) break;
      }
      if (totalBytes > 16 * 1024 * 1024) break;
    }
    return { pictures, sampled, cacheNames, cacheEntries };
  }, { base, paths: [...palArtworkPaths] });
  const result = await Promise.race([inspection, new Promise((_, reject) => {
    deadline = setTimeout(() => reject(Error('Pal image diagnostics exceeded five seconds')), 5000);
  })]).finally(() => clearTimeout(deadline));
  let bundledBytes = 0;
  result.bundled = result.sampled.map(url => {
    const relative = new URL(url).pathname.slice(new URL(base).pathname.length);
    assert.ok(palArtworkPaths.has(relative), 'Diagnostics read only approved public Pal files');
    const file = path.join(root, 'dist', relative), size = fs.statSync(file).size;
    if (size > 4 * 1024 * 1024 || bundledBytes + size > 16 * 1024 * 1024) return { url, bytes: size, truncated: true };
    bundledBytes += size;
    const bytes = fs.readFileSync(file);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    return { url, bytes: bytes.length, sha256 };
  });
  for (const entry of result.cacheEntries) {
    const expected = result.bundled.find(item => item.url === entry.url);
    if (entry.sha256 && expected?.sha256) entry.matchesBundled = entry.sha256 === expected.sha256 && entry.bytes === expected.bytes;
  }
  return result;
}
async function answerMath(page, { palHint = false } = {}) {
  const item = await page.evaluate(() => FG.learning.activeItem);
  assert.ok(item, 'The trusted learning host supplies the active item');
  if (palHint) {
    await activeMath(page).locator('[data-pal-hint="glim"]').click();
    const back = activeMath(page).getByRole('button', { name: 'Back to my answer', exact: true });
    if (await back.isVisible()) await back.click();
  }
  if (item.answerKind === 'choice') {
    const choice = item.choices.find(choice => choice.value === String(item.answer));
    assert.ok(choice); await activeMath(page).getByRole('button', { name: choice.label, exact: true }).click();
  } else {
    const write = activeMath(page).getByRole('button', { name: 'Write an answer', exact: true });
    if (await write.isVisible()) await write.click();
    await activeMath(page).locator('.math-answer-input').fill(String(item.answer));
    await activeMath(page).getByRole('button', { name: 'Check answer', exact: true }).click();
  }
  await page.waitForFunction(() => !FG.learning.active);
}
async function installReceiptFixture(page) {
  // This separate, test-only source adapter uses the real validated receipt
  // writer. Its facts are synthetic and are never presented as UI-earned work.
  const bundle = await build({ absWorkingDir: root, stdin: { contents: `
    import { RewardsStore, REWARDS_DB_NAME } from './src/rewards/store';
    import { createRewardFact } from './src/rewards/model';
    window.__seedPalsReceiptFixture = async (input) => {
      const store = new RewardsStore(REWARDS_DB_NAME);
      const facts = Array.from({length:input.count}, (_,index) => createRewardFact({
        owner: input.owner, kind: input.kind,
        sourceId: 'pals-browser-fixture-' + input.label + '-' + index,
        occurredAt: new Date().toISOString(),
      }));
      await store.project(input.owner, facts);
      await window.FG.rewards.refresh();
    };
  `, sourcefile: 'pals-receipt-fixture.ts', resolveDir: root }, bundle: true, write: false, format: 'iife', platform: 'browser' });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
}

(async () => {
  process.chdir(root); fs.mkdirSync(outputs, { recursive: true });
  const server = start(); if (!server.listening) await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/arcade/`;
  const allowedPalUrls = new Set([...palArtworkPaths].map(value => new URL(value, base).href));
  let browser, page, phase = 'opening the integrated app';
  let responsiveImageDecodeSummary = null;
  const checks = [], errors = [], consoleErrors = [], paidRequests = [], fixtures = [], expressionRequests = [];
  const imageNetwork = [];
  const recordImageNetwork = entry => { imageNetwork.push(entry); if (imageNetwork.length > 160) imageNetwork.shift(); };
  const mark = name => { checks.push(name); console.log(`PASS: ${name}`); };
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, reducedMotion: 'reduce', acceptDownloads: true });
    await context.addInitScript(installPalImageHistory, { urls: [...allowedPalUrls] });
    await context.route('**/factory-config.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 1, mode: 'unavailable' }) }));
    page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('dialog', dialog => void dialog.accept());
    page.on('request', request => { if (request.method() === 'POST' && /\/v1\/(jobs|coach)(\/|$)|api\.openai\.com/.test(request.url())) paidRequests.push(request.url()); });
    page.on('request', request => { if (/\/jems-pals(?:-extra)?\//.test(request.url())) expressionRequests.push(request.url()); });
    page.on('requestfailed', request => {
      if (allowedPalUrls.has(request.url())) recordImageNetwork({ type: 'failed', url: request.url(), failure: request.failure()?.errorText });
    });
    page.on('response', response => {
      if (allowedPalUrls.has(response.url())) recordImageNetwork({ type: 'response', url: response.url(), status: response.status(),
        fromServiceWorker: response.fromServiceWorker(), contentType: response.headers()['content-type'], contentLength: response.headers()['content-length'] });
    });
    await page.goto(base); await ready(page); await exploreWelcome(page);

    phase = 'choosing a starter and reloading';
    assert.equal(await page.locator('#studioNavPals').count(), 1);
    await navigate(page,'#studioNavJourney');
    assert.equal(await page.locator('#studioPalsEntry').isVisible(), true);
    await readablePalText(page, '.pals-widget-copy strong');
    assert.equal(await gems(page), 0);
    await page.locator('#studioPalsEntry .pals-widget-open').click(); await idle(page);
    assert.equal(await page.locator('#page-jems-pals').isVisible(), true);
    assert.equal(await page.locator('[data-pals-focus="starter-glim"]').count(), 1);
    assert.equal(await page.locator('[data-pals-focus="starter-kip"]').count(), 1);
    await page.click('[data-pals-focus="starter-glim"]');
    await page.waitForFunction(() => FG.pals.view()?.activeId === 'glim'); await idle(page);
    assert.equal((await view(page)).owned.length, 1);
    assert.equal((await view(page)).owned[0].stage, 1);
    assert.equal(await gems(page), 0, 'The free starter spends and awards no gems');
    assert.deepEqual(await page.evaluate(() => Object.keys(FG.pals).sort()), ['open', 'version', 'view'], 'No public collection or grant mutation API');
    const joinedAt = (await view(page)).owned[0].joinedAt;
    await page.reload(); await ready(page); await openPals(page);
    await selectedNav(page, 'studioNavPals');
    await readablePalText(page, '.pals-growth > strong');
    assert.equal((await view(page)).owned[0].joinedAt, joinedAt);
    assert.equal(await page.locator('#jemsPalDetailTitle').innerText(), 'Luma');
    assert.match(await page.locator('.pals-hero-portrait img').getAttribute('src'), /jems-pals\/luma\/base\/neutral-/);
    assert.match(await page.locator('.pals-card[data-pal="kip"]').innerText(), /50 more gems/);
    mark('free starter, My Pals navigation, home entry and persisted collection');

    phase = 'trying the selected approved character expressions without changing the collection';
    assert.equal(await page.locator('.pal-expression-explorer').count(), 0, 'The primary page no longer exposes a disconnected roster preview');
    assert.equal(await page.locator('.pals-card').count(), 24, 'The complete approved character roster is in the actual collection');
    assert.ok(expressionRequests.filter(url => /\.(webp|png)$/.test(url)).every(url => /\/neutral-/.test(url)), 'Collection browsing loads neutral pictures, not every expression');
    const collectionBeforeExpressions = await view(page), gemsBeforeExpressions = await gems(page);
    const playground = page.locator('.pals-expression-options');
    const portrait = page.locator('.pals-hero-portrait');
    await playground.locator('summary').click();
    const luma = approvedArtwork.characters.find(character => character.name === 'Luma');
    assert.ok(luma, 'The actual equipped character has an exact approved manifest identity');
    for (const expression of ['neutral', 'celebrate', 'thinking', 'encouraging_retry']) {
      await playground.locator(`button[data-expression="${expression}"]`).click();
      await page.waitForFunction(({ expression, url, key }) => {
        const current = document.querySelector('.pals-hero-portrait');
        const image = current?.querySelector('img');
        return current?.dataset.state === 'ready' && current.dataset.form === 'base'
          && current.dataset.expression === expression && current.dataset.characterKey === key
          && image?.src.endsWith(url) && image.naturalWidth > 0;
      }, { expression, url: luma.forms.base.expressions[expression].url, key: luma.characterKey });
    }
    assert.deepEqual(await view(page), collectionBeforeExpressions, 'Expression play grants or equips nothing');
    assert.equal(await gems(page), gemsBeforeExpressions);
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await noOverflow(page, `${width}px selected Pal expressions`);
      const controls = await playground.locator('button,summary').evaluateAll(elements => elements.map(element => ({
        visible: !!element.getClientRects().length, size: parseFloat(getComputedStyle(element).fontSize), height: element.getBoundingClientRect().height,
      })).filter(item => item.visible));
      assert.ok(controls.every(control => control.size >= 18 && control.height >= 48), 'Expression controls retain readable text and touch targets');
      if (width === 1440 || width === 390) await page.locator('.pals-detail').screenshot({ path: path.join(outputs, `pals-expressions-app-${width === 390 ? 'mobile' : 'desktop'}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 1080 });
    await chooseFamily(page, 1); await openPals(page);
    assert.equal(await page.locator('.pals-expression-options').count(), 0, 'Another profile cannot preview the former player’s equipped Pal');
    assert.equal(await page.locator('.pals-starter-grid .pals-card').count(), 2);
    await chooseFamily(page, 0); await openPals(page);
    assert.equal(await playground.evaluate(element => element.open), false);
    assert.equal(await portrait.getAttribute('data-expression'), 'neutral');
    assert.deepEqual(await view(page), collectionBeforeExpressions, 'Returning preserves the exact original saved collection');
    assert.equal(await gems(page), gemsBeforeExpressions);
    assert.ok(new Set(expressionRequests.filter(url => url.endsWith('.webp'))).size < 40, 'Browsing loads displayed portraits rather than all 184 original images');
    mark('approved collection art and bound expressions: exact Luma identity, four moods, lazy loading, profile isolation and phone layout without reward changes');

    phase = 'creating, tapping, editing and keeping a Pal playground';
    await pacingFixture(page);
    await page.click('[data-pals-focus="create-glim"]');
    await page.locator('#page-creation').waitFor({ state: 'visible' });
    await selectedNav(page, 'studioNavScenes');
    const original = await scene(page), projectId = original.id;
    assert.equal(original.title, "Luma's playground");
    assert.equal(original.actors[0].assetId, 'pal-luma-base-core-2026-11-20');
    const tapProgram = original.programs.find(program => program.trigger.type === 'tap');
    assert.deepEqual(tapProgram.actions.map(action => action.type), ['jump', 'dance', 'say']);
    assert.ok(original.programs.every(program => program.actions.every(action => action.origin === 'starter')));
    // Exact trigger fields belong to the optional full editor. Starter playback
    // and its simple controls are covered separately by the learner journey.
    await page.click('#creationFullMode');
    assert.equal(await page.getByRole('combobox', { name: 'When', exact: true }).inputValue(), 'tap');
    await page.click('#creationRun');
    await page.waitForFunction(() => FG.creation.snapshot()?.status === 'completed');
    await page.click('#creationTapActor');
    await page.waitForFunction(() => FG.creation.snapshot()?.trace.some(entry => entry.type === 'complete' && entry.actionType === 'jump'));
    await page.waitForFunction(() => FG.creation.snapshot()?.actors.some(actor => actor.speech === 'A discovery! My dance has corners.'));
    await page.waitForFunction(() => FG.creation.snapshot()?.status === 'completed');
    const jumps = (await snapshot(page)).trace.filter(entry => entry.type === 'complete' && entry.actionType === 'jump').length;
    await page.click('#creationTapActor');
    await page.waitForFunction(count => FG.creation.snapshot()?.trace.filter(entry => entry.type === 'complete' && entry.actionType === 'jump').length > count, jumps);
    await page.click('#creationReset');
    const childLine = 'My discovery: moon potatoes need tiny helmets.';
    await set(page.locator(`[data-block-id="${tapProgram.actions[2].id}"]`).getByRole('textbox', { name: 'Words', exact: true }), childLine);
    await set(page.locator('#creationTitle'), 'Luma and the moon potatoes');
    await page.click('#creationKeep');
    let saved = (await workspace(page)).projects.find(project => project.id === projectId);
    assert.equal(saved.keptId, saved.headId, 'Only the explicit Keep selects the saved version');
    assert.equal((await view(page)).owned[0].adventures, 0, 'Taps and free-scene play do not create adventures');
    assert.equal(await gems(page), 0);
    await noOverflow(page, 'Desktop Pal editor');
    await page.screenshot({ path: path.join(outputs, 'pals-app-playground-desktop.png'), fullPage: true });
    await page.reload(); await ready(page); await navigate(page,'#studioNavScenes');
    await page.click(`[data-scene="${projectId}"]`);
    const reopened = await scene(page);
    assert.equal(reopened.title, 'Luma and the moon potatoes');
    assert.equal(reopened.actors[0].assetId, 'pal-luma-base-core-2026-11-20');
    assert.equal(reopened.programs.find(program => program.trigger.type === 'tap').actions[2].text, childLine);
    assert.equal(reopened.programs.find(program => program.trigger.type === 'tap').actions[2].origin, 'child');
    mark('one-click editable playground, repeated real tap events, authored edit, explicit Keep and reload');

    phase = 'adding a Pal to another scene';
    await page.click('#creationBack'); await page.click('#creationFreeMode'); await page.click('[data-creation-starter="blank"]');
    const beforeAdd = await scene(page);
    await page.click('#creationAddActor');await page.click('#creationAddPal');
    const afterAdd = await scene(page);
    assert.equal(afterAdd.actors.length, beforeAdd.actors.length + 1);
    assert.deepEqual(afterAdd.actors.slice(0, beforeAdd.actors.length), beforeAdd.actors);
    assert.deepEqual(afterAdd.programs.slice(0, beforeAdd.programs.length), beforeAdd.programs);
    assert.equal(afterAdd.actors.at(-1).assetId, 'pal-luma-base-core-2026-11-20');
    assert.equal(afterAdd.programs.at(-1).trigger.type, 'tap');
    await page.click('#creationKeep');
    const addedProjectId = afterAdd.id;
    await noOverflow(page, 'Pal added to a free scene');
    await page.click('#creationAddActor');
    await page.locator('#creationActorDialog').waitFor({ state: 'visible' });
    await page.locator('#creationOpenArtStudio').focus();
    await page.evaluate(async () => {
      window.__palsPickerRefreshObserved = false;
      const observer = new MutationObserver(() => { observer.disconnect(); window.__palsPickerRefreshObserved = true; });
      observer.observe(document.getElementById('page-jems-pals'), { attributes: true, attributeFilter: ['aria-busy'] });
      await FG.rewards.refresh();
    });
    await page.waitForFunction(() => window.__palsPickerRefreshObserved);
    assert.equal(await page.locator('#creationActorDialog').isVisible(), true, 'background collection refresh preserves the open art/character picker');
    assert.equal(await page.locator('#creationOpenArtStudio').evaluate(element => element === document.activeElement), true, 'background collection refresh does not steal art-picker focus');
    await page.click('#creationCloseActor');
    mark('Add your Pal preserves existing scene actors/scripts and background refresh preserves the art picker');

    phase = 'real learning, delegated Pal hint and collection navigation guard';
    await pacingFixture(page); await page.click('#creationRun'); await page.click('#creationTapActor');
    await page.waitForFunction(() => FG.creation.snapshot()?.status === 'running');
    await navigate(page,'#studioNavPowers');
    if (!await page.evaluate(() => FG.learning.active)) await page.click('#lab-next');
    await activeMath(page).waitFor({ state: 'visible' });
    const paused = await snapshot(page);
    assert.equal(paused.status, 'paused', 'Leaving the running scene for learning pauses its engine');
    await page.waitForTimeout(150); assert.equal((await snapshot(page)).timeMs, paused.timeMs);
    await navigate(page,'#studioNavPals');
    assert.equal(await page.locator('#page-jems-pals').isVisible(), false, 'The open learning activity cannot be escaped through the collection');
    assert.equal(await activeMath(page).isVisible(), true);
    assert.equal(await page.locator('#studioPalCameo').isVisible(), false);
    const helpedId = await page.evaluate(() => FG.learning.activeAttemptId);
    assert.equal(await activeMath(page).locator('[data-pal-hint="glim"]').count(), 1);
    await answerMath(page, { palHint: true });
    const helped = await page.evaluate(id => FG.store.current().learning.attempts.find(attempt => attempt.id === id), helpedId);
    assert.equal(helped.outcome, 'completed');
    assert.equal(helped.independent, false, 'Pal hints use the host assistance evidence');
    for (let completed = 2; completed <= 5; completed++) {
      await page.click('#lab-next'); await activeMath(page).waitFor({ state: 'visible' }); await answerMath(page);
    }
    await page.waitForFunction(() => FG.pals.view()?.owned.find(pal => pal.id === 'glim')?.adventures === 1);
    assert.equal(await gems(page), 10);
    assert.equal((await view(page)).owned[0].practiceActivities, 5);
    await openPals(page);
    await page.locator('.pals-hero-portrait img').evaluate(image => image.decode());
    await page.locator('.jems-rewards-toast').waitFor({ state: 'hidden' });
    await page.locator('#jemsPalsTitle').click();
    await page.screenshot({ path: path.join(outputs, 'pals-app-earned-desktop.png'), fullPage: true });
    mark('five UI-earned learning receipts grow one adventure; Pal hint remains assisted and learning pauses play');

    phase = 'parent preferences and profile isolation';
    await page.locator('footer [data-page="parent"]').click();
    for (const preference of ['showCompanion', 'encouragement']) {
      assert.equal(await page.locator(`#parentPals [data-pal-preference="${preference}"]`).isChecked(), true);
      await page.locator(`#parentPals [data-pal-preference="${preference}"]`).click();
      await page.waitForFunction(key => FG.pals.view()?.preferences[key] === false, preference); await idle(page);
      assert.equal(await page.locator(`#parentPals [data-pal-preference="${preference}"]`).isChecked(), false);
    }
    await page.reload(); await ready(page);
    assert.deepEqual((await view(page)).preferences, { showCompanion: false, encouragement: false });
    await openRetainedGame(page,'dragon');
    assert.equal(await page.locator('#studioPalCameo').isVisible(), false);
    await openPals(page);
    assert.equal((await view(page)).owned.length, 1, 'Turning off the cameo keeps the collection');
    await chooseFamily(page, 1); await openPals(page);
    assert.equal((await view(page)).owned.length, 0);
    assert.deepEqual((await view(page)).preferences, { showCompanion: true, encouragement: true });
    await page.click('[data-pals-focus="starter-kip"]');
    await page.waitForFunction(() => FG.pals.view()?.activeId === 'kip'); await idle(page);
    await navigate(page,'#studioNavScenes');
    assert.equal(await page.locator(`[data-scene="${projectId}"]`).count(), 0);
    assert.equal(await page.locator(`[data-scene="${addedProjectId}"]`).count(), 0);
    await chooseFamily(page, 0); await openPals(page);
    assert.equal((await view(page)).activeId, 'glim');
    assert.deepEqual((await view(page)).preferences, { showCompanion: false, encouragement: false });
    assert.equal((await view(page)).owned[0].adventures, 1);
    await page.locator('.pals-options summary').click();
    await readablePalText(page, '.pals-preference strong');
    for (const preference of ['showCompanion', 'encouragement']) {
      assert.equal(await page.locator(`#jemsPalPreference-${preference}`).isChecked(), false);
      await page.locator(`#jemsPalPreference-${preference}`).click();
      await page.waitForFunction(key => FG.pals.view()?.preferences[key] === true, preference); await idle(page);
      assert.equal(await page.locator(`#jemsPalPreference-${preference}`).isChecked(), true);
    }
    await page.click('#jemsPalsBack'); await openRetainedGame(page,'dragon');
    await page.locator('#studioPalCameo').waitFor({ state: 'visible' });
    await openPals(page);
    mark('parent and child preferences persist; collection, growth, starters and scenes stay profile-scoped');

    phase = 'synthetic trusted-source receipts for exact unlock and stage thresholds';
    await installReceiptFixture(page);
    async function seed(count, kind, label, expectedGems) {
      const fixture = { owner: 'player1', count, kind, label, expectedGems };
      fixtures.push(fixture);
      await page.evaluate(input => window.__seedPalsReceiptFixture(input), fixture);
      await page.waitForFunction(async expected => (await FG.rewards.summary()).lifetimeGems === expected, expectedGems);
      await openPals(page); await idle(page);
    }
    await seed(5, 'scene.challenge', 'bright-and-50-gems', 50);
    await page.waitForFunction(() => FG.pals.view()?.owned.find(pal => pal.id === 'glim')?.stage === 2);
    assert.equal((await view(page)).owned.find(pal => pal.id === 'glim').adventures, 6);
    assert.match(await page.locator('.pals-hero-portrait img').getAttribute('src'), /jems-pals\/luma\/mature\/neutral-/, 'Earned growth changes the actual approved picture');
    assert.deepEqual((await view(page)).availableIds, ['kip']);
    assert.match(await page.locator('.pals-card[data-pal="riff"]').innerText(), /100 more gems/);
    await page.click('[data-pals-focus="collect-kip"]');
    await page.waitForFunction(() => FG.pals.view()?.owned.some(pal => pal.id === 'kip')); await idle(page);
    assert.equal(await gems(page), 50, 'Collecting an eligible Pal never spends gems');
    await seed(4, 'game.developed', 'riff-at-150-gems', 150);
    await page.waitForFunction(() => FG.pals.view()?.availableIds.includes('riff'));
    assert.deepEqual((await view(page)).availableIds, ['riff']);
    await page.click('[data-pals-focus="collect-riff"]');
    await page.waitForFunction(() => FG.pals.view()?.owned.some(pal => pal.id === 'riff')); await idle(page);
    assert.equal(await gems(page), 150);
    await seed(5, 'scene.challenge', 'radiant-at-15-adventures', 190);
    await page.waitForFunction(() => FG.pals.view()?.owned.find(pal => pal.id === 'glim')?.adventures === 15);
    const grown = (await view(page)).owned.find(pal => pal.id === 'glim');
    assert.equal(grown.adventures, 15); assert.equal(grown.stageName, 'Grown');
    assert.equal(grown.form, 'mature'); assert.equal(grown.stage, 2); assert.equal(grown.nextStageAt, null);
    assert.equal(await page.locator('.pals-growth-stages > li').count(), 2);
    await page.click('[data-pals-focus="equip-kip"]');
    await page.waitForFunction(() => FG.pals.view()?.activeId === 'kip'); await idle(page);
    assert.equal((await view(page)).owned.find(pal => pal.id === 'kip').adventures, 0, 'Changing the active Pal cannot reassign old receipts');
    await page.click('[data-pals-focus="equip-glim"]');
    await page.waitForFunction(() => FG.pals.view()?.activeId === 'glim'); await idle(page);
    mark('explicit receipt fixtures verify 50/150 gem collection, Base/Grown growth with no third form, no spending and no replay on equip');

    phase = 'responsive integrated collection and owned-Pal picker';
    const decodedHero = await page.locator('.pals-hero-portrait img').evaluate(async image => {
      const expected = document.querySelector('.pals-hero-portrait img'), source = image.src;
      await image.decode();
      return { sameImage: image === expected && image === document.querySelector('.pals-hero-portrait img'),
        connected: image.isConnected, sameSource: image.src === source && image.currentSrc === source,
        visible: !image.hidden && image.getClientRects().length > 0 && getComputedStyle(image).visibility !== 'hidden' };
    });
    assert.deepEqual(decodedHero, { sameImage: true, connected: true, sameSource: true, visible: true }, 'Native decode must succeed for the same current, connected, visible hero and source');
    responsiveImageDecodeSummary = await page.evaluate(phase => {
      const history = window.__readPalImageHistory?.();
      return history ? { phase, pendingDecodes: history.pendingDecodes, peakPendingDecodes: history.peakPendingDecodes,
        decodeTotals: history.decodeTotals, dropped: history.dropped, diagnosticErrors: history.diagnosticErrors,
        scope: history.scope } : { phase, unavailable: true };
    }, phase).catch(() => ({ phase, unavailable: true }));
    await page.screenshot({ path: path.join(outputs, 'pals-app-fixture-desktop.png'), fullPage: true });
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 }); await noOverflow(page, `${width}px My Pals`);
      if (width === 390) await page.screenshot({ path: path.join(outputs, 'pals-app-fixture-mobile.png'), fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1080 });
    await navigate(page,'#studioNavScenes');
    await selectedNav(page, 'studioNavScenes');
    assert.equal(await page.locator('[data-creation-pal]').count(), 3);
    if(!await page.locator('[data-creation-pal="glim"]').isVisible())await page.click('#creationFreeMode');
    await page.click('[data-creation-pal="glim"]');
    assert.equal((await scene(page)).actors[0].assetId, 'pal-luma-mature-core-2026-11-20', 'A new playground uses the currently earned Grown artwork');
    await page.click('#creationBack');
    await page.click(`[data-scene="${addedProjectId}"]`);
    const beforeKip = await scene(page);
    assert.equal(beforeKip.actors.at(-1).assetId, 'pal-luma-base-core-2026-11-20', 'Growing the companion never rewrites an existing scene’s pinned Base picture');
    await page.click('#creationAddActor');await page.click('#creationChoosePal');
    assert.equal(await page.locator('#creationActorDialog').isVisible(), true);
    assert.equal(await page.locator('#creationActorDialog [data-creation-asset]').count(), 3);
    await page.waitForFunction(() => [...document.querySelectorAll('#creationActorDialog .pals-portrait')].every(p => p.dataset.state === 'ready'));
    const pickerPictures = await page.locator('#creationActorDialog .pals-portrait').evaluateAll(portraits => portraits.map(p => ({
      mask: getComputedStyle(p.querySelector('img')).maskImage,
      width: p.getBoundingClientRect().width, parentWidth: p.parentElement.getBoundingClientRect().width,
      unavailable: !p.querySelector('.pals-picture-unavailable').hidden,
    })));
    assert.equal(pickerPictures.length, 3);
    for (const picture of pickerPictures) { assert.notEqual(picture.mask, 'none'); assert.ok(picture.width <= picture.parentWidth); assert.equal(picture.unavailable, false); }
    await page.locator('#creationActorDialog').screenshot({ path: path.join(outputs, 'pals-creative-picker-mobile.png') });

    assert.deepEqual(await page.locator('#creationActorDialog [data-creation-asset]').evaluateAll(choices => choices.map(choice => choice.dataset.creationAsset).sort()), [
      'pal-luma-mature-core-2026-11-20', 'pal-nook-base-core-2026-11-20', 'pal-wink-base-core-2026-11-20',
    ], 'The picker offers only owned characters in their earned form, with no legacy or unearned form choices');
    await page.click('[data-creation-asset="pal-nook-base-core-2026-11-20"]');
    const withKip = await scene(page);
    assert.equal(withKip.actors.at(-1).assetId, 'pal-nook-base-core-2026-11-20');
    assert.deepEqual(withKip.actors.slice(0, beforeKip.actors.length), beforeKip.actors);
    await page.click('#creationAddActor');await page.click('#creationAddPal');
    const withGrown = await scene(page);
    assert.equal(withGrown.actors.at(-1).assetId, 'pal-luma-mature-core-2026-11-20');
    assert.deepEqual(withGrown.actors.slice(0, withKip.actors.length), withKip.actors, 'Adding a Grown Pal preserves all prior character/form versions');
    await page.click('#creationKeep');
    await page.setViewportSize({ width: 390, height: 844 }); await noOverflow(page, '390px companion editor');
    await page.screenshot({ path: path.join(outputs, 'pals-app-playground-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.reload(); await ready(page); await openPals(page);
    assert.equal((await view(page)).owned.length, 3);
    assert.equal((await view(page)).owned.find(pal => pal.id === 'glim').adventures, 15);
    assert.equal(await gems(page), 190);
    mark('integrated desktop/mobile layout, owned-Pal picker and persisted unlocked collection');

    assert.deepEqual(errors, [], 'No uncaught application errors');
    assert.deepEqual(consoleErrors, [], 'No browser console errors');
    assert.deepEqual(paidRequests, [], 'No provider generation or coach request');
    fs.writeFileSync(path.join(outputs, 'pals-app-results.json'), JSON.stringify({
      scope: 'Production application UI; higher unlock/stage states are explicitly synthetic trusted-source receipt fixtures.',
      browserVersion: browser.version(), playwrightVersion,
      responsiveImageDecodeSummary,
      imageDecodeSummary: await page.evaluate(() => {
        const history = window.__readPalImageHistory?.();
        return history ? { pendingDecodes: history.pendingDecodes, peakPendingDecodes: history.peakPendingDecodes,
          decodeTotals: history.decodeTotals, dropped: history.dropped, diagnosticErrors: history.diagnosticErrors,
          scope: history.scope } : { unavailable: true };
      }).catch(() => ({ unavailable: true })),
      checks, errors, consoleErrors, paidRequests, fixtures, expressionRequests,
      observedUiLearning: { completions: 5, assistedCompletions: 1, earnedGems: 10, adventures: 1 },
      finalView: await view(page),
    }, null, 2) + '\n');
    console.log(`PASS: ${checks.length} integrated Pal browser groups.`);
  } catch (error) {
    if (page) {
      const imageHistory = await page.evaluate(() => window.__readPalImageHistory?.() || { unavailable: true }).catch(() => ({ unavailable: true }));
      const imageDiagnostics = await palImageDiagnostics(page, base).catch(diagnosticError => ({ error: String(diagnosticError) }));
      await page.screenshot({ path: path.join(outputs, 'pals-app-failure.png'), fullPage: true }).catch(() => {});
      fs.writeFileSync(path.join(outputs, 'pals-app-failure.json'), JSON.stringify({ phase, error: String(error), checks, errors, consoleErrors, paidRequests,
        browserVersion: browser.version(), playwrightVersion, imageHistory, imageNetwork, imageDiagnostics,
        state: await page.evaluate(() => ({ pals: window.FG?.pals?.view(), activeLearning: window.FG?.learning?.active, scene: window.FG?.creation?.scene(), visiblePages: [...document.querySelectorAll('main > .page')].filter(element => element.getClientRects().length).map(element => element.id) })).catch(() => null),
      }, null, 2) + '\n');
    }
    throw new Error(`Integrated Pals failed while ${phase}: ${error.stack || error}`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

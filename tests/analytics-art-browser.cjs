/* Real image/IndexedDB/scene boundaries; synthetic artwork and an isolated
 * observation sink. The actual consent/network gates are tested separately. */
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium } = require('playwright');

(async () => {
  const root = process.cwd();
  const bundled = await build({
    stdin: { contents: `export * from './src/assets/private-drawings'; export * from './src/drawing/library'; export * from './src/drawing/transfer'; export * from './src/creation/ui'; export * from './src/creation/storage'; export * from './src/creation/projects';`, resolveDir: root },
    bundle: true, write: false, format: 'iife', globalName: 'pilotArt', platform: 'browser', loader: { '.css': 'empty' },
    plugins: [{ name: 'isolated-observation-sink', setup(builder) {
      builder.onResolve({ filter: /analytics\/client$/ }, () => ({ path: 'analytics-test-sink', namespace: 'analytics-test' }));
      builder.onLoad({ filter: /.*/, namespace: 'analytics-test' }, () => ({ resolveDir: root, contents: `
        import {validateClientAnalyticsEvent} from ${JSON.stringify(path.join(root, 'src/analytics/contract.ts'))};
        export function analyticsBuildContext(ownerId,creationId) {
          return window.analyticsDisabled?undefined:{schemaVersion:1,choiceId:'00000000-0000-4000-8000-000000000001',ownerId,creationId};
        }
        export function trackAnalytics(event, properties) {
          if (window.analyticsDisabled) return;
          if (window.analyticsFailure) throw Error('Synthetic telemetry failure');
          const observed=validateClientAnalyticsEvent({schemaVersion:1,eventId:crypto.randomUUID(),choiceId:'00000000-0000-4000-8000-000000000001',event,...properties});
          window.observed.push(observed);
        }
      ` }));
    } }],
  });
  const server = http.createServer((request, response) => {
    if (request.url === '/test.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundled.outputFiles[0].text); }
    else if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><main></main><script>window.observed=[]</script><script src="/test.js"></script>'); }
    else { response.writeHead(404); response.end(); }
  }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage(), errors = [], posts = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const storage = await page.evaluate(async () => {
      const results = [], check = (condition, label) => { if (!condition) throw Error(label); results.push(label); };
      const rejects = async (action, label) => { let failed = false; try { await action(); } catch { failed = true; } check(failed, label); };
      window.activeOwner = 'player1';
      window.FG = { store: { current: () => ({ id: window.activeOwner }) }, learning: { active: false, checkpoint: () => false } };
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#7452cf'; ctx.fillRect(10, 10, 44, 44);
      window.imageFixture = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      window.original = await pilotArt.saveDrawing('player1', 'PRIVATE ART NAME MUST NEVER LEAVE', window.imageFixture);
      check(observed.length === 1 && observed[0].event === 'jems_art_saved' && observed[0].assetId === original.id && observed[0].creationId === original.id, 'committed original produces one identity-only art origin');
      check((await pilotArt.drawing('player1', original.id)).sha256 === original.sha256, 'art event follows a durable readable image');
      check(!JSON.stringify(observed).includes('PRIVATE ART NAME') && !JSON.stringify(observed).includes(original.sha256), 'names and image hashes are absent from observations');
      const add = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (...args) { const request = add.apply(this, args); if (this.name === 'drawings') this.transaction.abort(); return request; };
      try { await rejects(() => pilotArt.saveDrawing('player1', 'Aborted save', imageFixture), 'aborted image transaction rejects its write'); }
      finally { IDBObjectStore.prototype.add = add; }
      check(observed.length === 1 && (await pilotArt.drawings('player1')).length === 1, 'aborted transaction emits no art event or stored artwork');
      window.derivative = await pilotArt.saveDrawing('player1', 'Private crop', imageFixture, original.id);
      window.secondCrop = await pilotArt.saveDrawing('player1', 'Private second crop', imageFixture, derivative.id);
      check(observed.length === 1 && await pilotArt.originalDrawingId('player1', secondCrop.id) === original.id, 'cutout chains share the original and never mint another art origin');
      await rejects(() => pilotArt.originalDrawingId('player2', original.id), 'canonical art lookup cannot cross profile ownership');
      let current = true; const lookup = pilotArt.originalDrawingId('player1', secondCrop.id, () => current); current = false;
      await rejects(() => lookup, 'profile/view guard is rechecked after lineage lookup');
      await pilotArt.withArtTransaction(['drawings'], 'readwrite', tx => tx.objectStore('drawings').put({ ...secondCrop, sourceSha256: '0'.repeat(64) }));
      await rejects(() => pilotArt.originalDrawingId('player1', secondCrop.id), 'invalid lineage fingerprint cannot be attributed to an original');
      await pilotArt.withArtTransaction(['drawings'], 'readwrite', tx => tx.objectStore('drawings').put(secondCrop));
      const bundle = await pilotArt.exportArtBundle('player1');
      await pilotArt.restoreArtBundle('player1', bundle);
      check(observed.length === 1, 'restoring an existing art bundle never backfills art events');
      window.analyticsFailure = true;
      const savedDuringFailure = await pilotArt.saveDrawing('player1', 'Transport unavailable', imageFixture);
      check((await pilotArt.drawing('player1', savedDuringFailure.id)).id === savedDuringFailure.id, 'telemetry failure cannot fail a committed art save');
      window.analyticsFailure = false;
      const decode = window.createImageBitmap;
      let resumeDecode, enteredDecode;
      const blocked = new Promise(resolve => { enteredDecode = resolve; });
      window.createImageBitmap = async (...args) => { enteredDecode(); await new Promise(resolve => { resumeDecode = resolve; }); return decode(...args); };
      const delayedSave = pilotArt.saveDrawing('player1', 'Old profile operation', imageFixture);
      await blocked;
      activeOwner = 'player2'; window.dispatchEvent(new Event('factory-profile'));
      activeOwner = 'player1'; window.dispatchEvent(new Event('factory-profile'));
      window.createImageBitmap = decode; resumeDecode();
      const returnedSave = await delayedSave;
      check((await pilotArt.drawing('player1', returnedSave.id)).id === returnedSave.id && observed.length === 1, 'A-to-B-to-A profile switch cannot enqueue a late art observation');
      pilotArt.installCreationStudio({ enter: () => true, home: () => {}, openGame: () => {} });
      observed.length = 0;
      return results;
    });
    for (const label of storage) console.log('ok - ' + label);

    const opened = await page.evaluate(async () => {
      const id = await FG.creation.openArt({ drawingId: secondCrop.id });
      return { id, observations: observed, entry: FG.creation.export().projects.find(project => project.id === id) };
    });
    assert.ok(opened.id, 'art opens a real saved scene');
    assert.equal(opened.observations.length, 1);
    assert.equal(opened.observations[0].event, 'jems_asset_added_to_game');
    assert.equal(opened.observations[0].gameId, opened.id);
    assert.equal(opened.observations[0].revisionId, opened.entry.headId);
    assert.equal(opened.observations[0].assetId, await page.evaluate(() => original.id));
    await page.evaluate(() => document.getElementById('creationRun').click());
    await page.waitForFunction(() => observed.some(event => event.event === 'jems_game_play_started'));
    const firstPlay = await page.evaluate(() => observed.filter(event => event.event === 'jems_game_play_started'));
    assert.equal(firstPlay.length, 1, 'one successful Run produces one launch, independent of asset count');
    assert.equal(firstPlay[0].revisionId, opened.entry.headId);
    assert.equal(firstPlay[0].gameId, opened.id);
    assert.equal(firstPlay[0].assetId, undefined, 'art bindings do not multiply play events');
    await page.evaluate(id => { FG.creation.open(id); document.getElementById('creationStep').click(); }, opened.id);
    assert.equal(await page.evaluate(() => observed.length), 2, 'reopening and stepping add no new binding or launch');
    console.log('ok - saved cutout identity joins the exact saved scene and one actual Run');

    await page.evaluate(() => { FG.creation.open(); document.querySelector('[data-creation-starter="blank"]').click(); observed.length = 0; document.getElementById('creationAddActor').click(); });
    await page.waitForFunction(() => document.querySelectorAll('[data-private-art]').length > 0);
    await page.evaluate(() => document.querySelector(`[data-private-art="art:image:${original.id}:${original.sha256}"]`).click());
    await page.waitForFunction(() => !document.getElementById('creationActorDialog').open);
    assert.equal(await page.evaluate(() => observed.length), 0, 'recovery autosave does not pretend to be a committed scene binding');
    await page.evaluate(() => {
      window.actualSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) { if (key === pilotArt.CREATION_KEY) throw Error('Synthetic quota failure'); return actualSetItem.call(this, key, value); };
      document.getElementById('creationRun').click();
    });
    await page.waitForFunction(() => document.getElementById('creationStatus').textContent.includes('Could not save'));
    assert.equal(await page.evaluate(() => observed.length), 0, 'failed revision write emits neither binding nor play');
    await page.evaluate(() => { Storage.prototype.setItem = actualSetItem; document.getElementById('creationRun').click(); });
    await page.waitForFunction(() => observed.some(event => event.event === 'jems_game_play_started'));
    const saved = await page.evaluate(() => ({ events: observed, id: FG.creation.scene().id, workspace: FG.creation.export() }));
    assert.deepEqual(saved.events.map(event => event.event), ['jems_asset_added_to_game', 'jems_game_play_started']);
    assert.equal(saved.events[0].gameId, saved.id);
    assert.equal(saved.events[0].revisionId, saved.events[1].revisionId);
    assert.equal(saved.events[0].revisionId, saved.workspace.projects.find(project => project.id === saved.id).headId);
    console.log('ok - explicit art binding waits for the durable revision and survives a failed-save retry');

    await page.evaluate(() => { observed.length = 0; document.getElementById('creationCopy').click(); });
    await page.waitForFunction(id => FG.creation.scene().id !== id, saved.id);
    const copied = await page.evaluate(() => ({ events: observed, id: FG.creation.scene().id }));
    assert.equal(copied.events.length, 1);
    assert.equal(copied.events[0].event, 'jems_asset_added_to_game');
    assert.equal(copied.events[0].gameId, copied.id);
    assert.equal(copied.events[0].assetId, saved.events[0].assetId);
    const importedScene = await page.evaluate(() => { observed.length = 0; return JSON.stringify(FG.creation.scene()); });
    await page.locator('#creationImport').setInputFiles({ name: 'synthetic-scene.json', mimeType: 'application/json', buffer: Buffer.from(importedScene) });
    await page.waitForFunction(id => FG.creation.scene().id !== id, copied.id);
    assert.equal(await page.evaluate(() => observed.length), 0, 'scene import and supplementary art indexing do not fabricate binding events');
    await page.evaluate(() => FG.creation.restore(FG.creation.export()));
    assert.equal(await page.evaluate(() => observed.length), 0, 'restoring a scene workspace does not backfill events');
    console.log('ok - deliberate copies create another game binding while imports/restores do not');

    const disabled = await page.evaluate(async () => {
      window.analyticsDisabled = true; observed.length = 0;
      const getAll = IDBObjectStore.prototype.getAll; let lineageReads = 0;
      IDBObjectStore.prototype.getAll = function (...args) { if (this.name === 'drawings') lineageReads++; return getAll.apply(this, args); };
      try {
        const id = await FG.creation.openArt({ drawingId: secondCrop.id });
        return { id, lineageReads, observed: observed.length };
      } finally { IDBObjectStore.prototype.getAll = getAll; window.analyticsDisabled = false; }
    });
    assert.ok(disabled.id, 'disabled analytics preserves creation from artwork');
    assert.equal(disabled.lineageReads, 0, 'disabled analytics performs no additional artwork lineage scans');
    assert.equal(disabled.observed, 0);
    console.log('ok - disabled measurement preserves art creation without extra lineage reads');

    const resilient = await page.evaluate(async () => {
      analyticsFailure = true;
      const id = await FG.creation.openArt({ drawingId: original.id });
      return { id, saved: FG.creation.export().projects.some(project => project.id === id) };
    });
    assert.ok(resilient.id && resilient.saved, 'telemetry throw does not fail scene creation');
    await page.evaluate(() => document.getElementById('creationRun').click());
    await page.waitForFunction(() => FG.creation.snapshot().status === 'running');
    await page.evaluate(() => { analyticsFailure = false; observed.length = 0; });
    console.log('ok - optional observation failure preserves the saved scene and running engine');

    await page.evaluate(() => {
      window.actualBitmap = window.createImageBitmap;
      window.createImageBitmap = async (...args) => { window.bitmapWaiting = true; await new Promise(resolve => { window.resumeBitmap = resolve; }); return actualBitmap(...args); };
      window.staleOpen = FG.creation.openArt({ drawingId: derivative.id });
    });
    await page.waitForFunction(() => window.bitmapWaiting);
    const stale = await page.evaluate(async () => {
      const before = FG.creation.export().projects.length;
      activeOwner = 'player2'; window.dispatchEvent(new Event('factory-profile'));
      createImageBitmap = actualBitmap; resumeBitmap();
      const result = await staleOpen;
      return { result, before, after: FG.creation.export().projects.length, observations: observed };
    });
    assert.equal(stale.result, undefined);
    assert.equal(stale.before, stale.after);
    assert.equal(stale.observations.length, 0, 'profile switch cancels delayed art-to-scene observation and write');
    assert.deepEqual(errors, []);
    assert.deepEqual(posts, [], 'hook tests never contact a telemetry provider');
    console.log('ok - profile switch cancels delayed image resolution without leaking an observation');
  } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

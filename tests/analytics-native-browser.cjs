/* Current application source, real IndexedDB and Rally lifecycle, synthetic art.
 * Only the optional analytics edge is replaced. Consent/transport are covered by
 * analytics-client/server and analytics-privacy-browser; no provider is used. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium } = require('playwright');

(async () => {
  const root = process.cwd();
  const bundled = await build({
    stdin: { contents: `
      import './src/style.css'; import './src/main';
      export * from './src/assets/private-drawings';
      export * from './src/drawing/library'; export * from './src/drawing/model'; export * from './src/drawing/store';
      export {StudioGames} from './src/studio/adapter'; export {StudioNotebook,STUDIO_KEY} from './src/studio/notebook';
      export {defaults} from './src/runtime/manifests';
    `, resolveDir: root },
    bundle: true, write: false, outfile: '/virtual/analytics-native.js', format: 'iife', globalName: 'pilotNative',
    platform: 'browser', define: { 'import.meta.env.BASE_URL': '"/"' },
    external: ['/jems-*', '/fonts/*'],
    plugins: [{ name: 'isolated-native-observation-sink', setup(builder) {
      builder.onResolve({ filter: /analytics\/client$|^\.\/client$/ }, args => {
        if (args.path === './client' && !args.importer.endsWith('/analytics/privacy.ts')) return;
        return { path: 'analytics-native-sink', namespace: 'analytics-native' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'analytics-native' }, () => ({ resolveDir: root, contents: `
        import {validateClientAnalyticsEvent} from './src/analytics/contract';
        const choiceId='00000000-0000-4000-8000-000000000001';
        export const configureAnalytics=()=>{};
        export const refreshAnalyticsPermission=async()=>null;
        export const resetAnalyticsPermission=()=>{};
        export const analyticsConfigured=()=>false;
        export const analyticsPermission=()=>null;
        export const analyticsBuildContext=(ownerId,creationId)=>({schemaVersion:1,choiceId,ownerId,creationId});
        export function trackAnalytics(event,details) {
          const observed=validateClientAnalyticsEvent({schemaVersion:1,choiceId,eventId:crypto.randomUUID(),event,...details});
          window.observed.push(observed);
          if(event==='jems_asset_added_to_game') {
            const workspace=JSON.parse(localStorage.getItem('family-game-factory-workspace-v2')||'{"projects":[],"revisions":[]}');
            const notebook=JSON.parse(localStorage.getItem('family-game-factory-studio-v1')||'{"sessions":[]}');
            window.bindingEvidence.push({eventId:observed.eventId,
              project:workspace.projects.some(p=>p.id===details.gameId&&p.owner===details.ownerId),
              revision:workspace.revisions.some(r=>r.id===details.revisionId&&r.projectId===details.gameId),
              session:notebook.sessions.some(s=>s.id===details.creationId&&s.owner===details.ownerId&&s.projectId===details.gameId)});
          }
        }
      ` }));
    } }],
  });
  const javascript = bundled.outputFiles.find(file => file.path.endsWith('.js')).text;
  const css = bundled.outputFiles.find(file => file.path.endsWith('.css')).text;
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace('href="/src/style.css"', 'href="/test.css"')
    .replace('<script type="module" src="/src/main.ts"></script>', '<script>window.observed=[];window.bindingEvidence=[];</script><script src="/test.js"></script>');
  const publicRoot = path.join(root, 'public');
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const send = (type, body) => { response.setHeader('Content-Type', type); response.end(body); };
    if (pathname === '/') return send('text/html', html);
    if (pathname === '/test.js') return send('text/javascript', javascript);
    if (pathname === '/test.css') return send('text/css', css);
    if (pathname === '/factory-config.json') return send('application/json', JSON.stringify({ version: 1, mode: 'unavailable' }));
    // No cache worker for this ephemeral source bundle. Playwright's global
    // worker-block shim itself throws in the app's sandboxed child frames.
    if (pathname === '/sw.js') { response.writeHead(404); return response.end(); }
    const file = path.resolve(publicRoot, '.' + pathname);
    if (!file.startsWith(publicRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404); return response.end();
    }
    const types = { '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.woff': 'font/woff', '.json': 'application/json' };
    return send(types[path.extname(file)] || 'application/octet-stream', fs.readFileSync(file));
  }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1360, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [], posts = [];
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.FG?.studio && window.FG?.artStudio);
    const fixture = await page.evaluate(async () => {
      const owner = FG.store.current().id;
      // Existing suites use this saved pacing fixture to isolate game lifecycle
      // assertions from a separate, already-covered learning checkpoint flow.
      FG.store.current().mathWindow = [Date.now()];
      if (!FG.store.save() || FG.math.canAsk(FG.store.current())) throw Error('Could not save pacing fixture');
      const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 420;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#7452cf'; ctx.fillRect(60, 63, 480, 168);
      ctx.fillStyle = '#293958'; for (const x of [170, 430]) { ctx.beginPath(); ctx.ellipse(x, 291, 50, 60, 0, 0, 2 * Math.PI); ctx.fill(); }
      const image = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const original = await pilotNative.saveDrawing(owner, 'PRIVATE SYNTHETIC ART', image);
      const derivative = await pilotNative.saveDrawing(owner, 'PRIVATE SYNTHETIC CUTOUT', image, original.id);
      const assembly = pilotNative.defaultAssembly(derivative, 'car', [
        { id: 'body', name: 'Body', role: 'body', parentId: null, physical: true, region: { x: .1, y: .15, w: .8, h: .4, shape: 'rect' } },
        { id: 'left', name: 'Left wheel', role: 'wheel', parentId: 'body', physical: true, region: { x: .2, y: .55, w: 1 / 6, h: 2 / 7, shape: 'ellipse' } },
        { id: 'right', name: 'Right wheel', role: 'wheel', parentId: 'body', physical: true, region: { x: 19 / 30, y: .55, w: 1 / 6, h: 2 / 7, shape: 'ellipse' } },
      ]);
      pilotNative.vehicleGeometry(assembly, canvas.width / canvas.height);
      const rig = await pilotNative.saveRig(owner, assembly);
      const games = new pilotNative.StudioGames(localStorage, FG), notebook = new pilotNative.StudioNotebook(localStorage);
      // A restored game can retain a drawing reference whose source is absent.
      // Use real validated game/notebook writes, leaving the rig intentionally missing.
      const missing = games.create(owner, 'hill', 'Missing art fixture', pilotNative.defaults('hill'), 'missing-rig');
      const missingSession = notebook.create(owner, 'hill', missing.name, missing.id);
      observed.length = 0; bindingEvidence.length = 0;
      return { owner, original: original.id, derivative: derivative.id, rig: rig.id, missingSession: missingSession.id };
    });
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const plays = () => page.evaluate(() => observed.filter(event => event.event === 'jems_game_play_started'));
    const drive = () => page.locator('.quality-hill').getByRole('button', { name: 'Let’s drive', exact: true });
    const clear = () => page.evaluate(() => { observed.length = 0; bindingEvidence.length = 0; });

    await page.evaluate(id => FG.studio.open(id), fixture.missingSession);
    await page.waitForFunction(() => FG.runtime.snapshot()?.state.drawingUnavailable === true);
    assert.equal(await drive().isDisabled(), true);
    await page.locator('.quality-hill .q-canvas').focus(); await page.keyboard.press('Space'); await settle();
    assert.equal(await page.evaluate(() => FG.runtime.snapshot().state.mode), 'ready');
    assert.deepEqual(await plays(), [], 'missing drawing and blocked Drive never count a play');
    console.log('ok - mounting a missing-art Rally shell cannot count as play');

    await page.evaluate(id => FG.artStudio.open(id), fixture.derivative);
    await page.click('#artUseRally');
    await page.waitForFunction(rig => FG.runtime.snapshot()?.state.drawingRigId === rig, fixture.rig);
    const opened = await page.evaluate(() => ({ events: observed, evidence: bindingEvidence,
      session: FG.studio.exportNotebook().sessions.at(-1), workspace: JSON.parse(localStorage.getItem('family-game-factory-workspace-v2')) }));
    assert.deepEqual(opened.events.map(event => event.event), ['jems_journey_started', 'jems_asset_added_to_game']);
    const binding = opened.events[1];
    assert.equal(binding.assetId, fixture.original, 'the cutout resolves to the canonical original asset');
    assert.notEqual(binding.assetId, fixture.derivative);
    assert.equal(binding.gameId, opened.session.projectId);
    assert.equal(binding.revisionId, opened.workspace.projects.find(project => project.id === binding.gameId).headId);
    assert.deepEqual(opened.evidence, [{ eventId: binding.eventId, project: true, revision: true, session: true }]);
    await settle(); assert.deepEqual(await plays(), [], 'a ready, correctly loaded Rally shell is not yet a play');
    await drive().click(); await page.waitForFunction(() => FG.runtime.snapshot().state.mode === 'drive');
    assert.equal((await plays()).length, 1);
    assert.equal((await plays())[0].revisionId, binding.revisionId);
    assert.equal((await plays())[0].gameId, binding.gameId);
    await page.evaluate(() => { FG.runtime.pause(); FG.runtime.resume(); });
    await page.locator('.quality-hill').getByRole('button', { name: 'Try again', exact: true }).click();
    await drive().click(); await settle();
    assert.equal((await plays()).length, 1, 'resume/retry within the same mount cannot duplicate its launch');
    console.log('ok - durable native art binding precedes one real Drive launch');

    await clear();
    await page.locator('.quality-hill summary').click();
    await page.getByRole('button', { name: 'Make the wheels bigger', exact: true }).click();
    await page.waitForFunction(id => FG.studio.exportNotebook().sessions.find(session => session.id === id)?.candidate &&
      FG.runtime.snapshot()?.state.drawingRigId, opened.session.id);
    const candidate = await page.evaluate(id => FG.studio.exportNotebook().sessions.find(session => session.id === id).candidate, opened.session.id);
    assert.equal(candidate.baseId, binding.revisionId);
    assert.notEqual(candidate.id, binding.revisionId);
    assert.deepEqual(await plays(), [], 'a candidate preview shell also waits for Drive');
    await drive().click(); await settle();
    const tested = await page.evaluate(() => observed);
    assert.deepEqual(tested.map(event => event.event), ['jems_game_play_started', 'jems_game_revision_played']);
    for (const event of tested) {
      assert.equal(event.gameId, binding.gameId);
      assert.equal(event.revisionId, candidate.id, 'the played test is the candidate, not the saved base revision');
    }
    console.log('ok - candidate Drive reports the exact unkept candidate revision');

    await clear();
    await page.locator('#studioMore summary').click(); await page.click('#studioCopy');
    await page.fill('#studioCopyName', 'Separate synthetic ride');
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      const count = FG.studio.exportNotebook().sessions.length;
      window.restoreNotebookSave = () => { Storage.prototype.setItem = original; };
      Storage.prototype.setItem = function (key, value) {
        if (key === pilotNative.STUDIO_KEY && JSON.parse(value).sessions.length > count) throw new DOMException('Synthetic notebook quota', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    await page.locator('#studioCopyForm').getByRole('button', { name: 'Save new game', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('studioStatus').textContent.includes('Could not save this notebook'));
    assert.equal(await page.evaluate(() => observed.length), 0, 'a game fork without a durable notebook entry emits no binding');
    await page.evaluate(() => restoreNotebookSave());
    await page.locator('#studioCopyForm').getByRole('button', { name: 'Save new game', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('studioCopyDialog').open);
    const copied = await page.evaluate(() => ({ events: observed, evidence: bindingEvidence,
      notebook: FG.studio.exportNotebook(), workspace: JSON.parse(localStorage.getItem('family-game-factory-workspace-v2')) }));
    assert.deepEqual(copied.events.map(event => event.event), ['jems_asset_added_to_game'], 'saving a copy is not a launch');
    const copyBinding = copied.events[0];
    assert.equal(copyBinding.assetId, fixture.original);
    assert.notEqual(copyBinding.gameId, binding.gameId, 'explicit Save a copy creates a different stable game');
    assert.notEqual(copyBinding.creationId, opened.session.id);
    assert.equal(copied.workspace.projects.find(project => project.id === copyBinding.gameId).headId, copyBinding.revisionId);
    assert.ok(copied.notebook.sessions.some(session => session.id === copyBinding.creationId && session.projectId === copyBinding.gameId));
    assert.deepEqual(copied.evidence, [{ eventId: copyBinding.eventId, project: true, revision: true, session: true }]);
    assert.equal(copied.workspace.projects.find(project => project.id === binding.gameId).headId, binding.revisionId, 'copying an unkept test leaves the original main revision unchanged');
    assert.equal(JSON.stringify([...opened.events, ...tested, ...copied.events]).includes('PRIVATE SYNTHETIC'), false);
    assert.deepEqual(errors, [], 'no browser exceptions');
    assert.deepEqual(posts, [], 'native hook tests never contact a telemetry or generation provider');
    console.log('ok - Save a copy reports the same original asset and new durable game only after both saves');
  } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

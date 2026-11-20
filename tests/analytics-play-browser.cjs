/* Actual reviewed preview renderers + sandboxed workers. No model/provider
 * calls. Loading a preview is deliberately distinct from starting its game. */
require('tsx/cjs');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { build, transformSync } = require('esbuild');
const { chromium } = require('playwright');
const { renderGenerated } = require('../server/sandbox/preview.cjs');
const { runtimeBundle } = require('../server/sandbox/bundle-v2.cjs');
const { renderPreview } = require('../server/pipeline/artifacts.ts');

const channel = 'analytics-play-channel', artifactId = 'analytics-play-fixture';
const hash = value => createHash('sha256').update(value).digest('hex');
function fixture(kind, failure = false, version) {
  const source = `export function createGame(){return {
    init:()=>({x:120}),step:s=>s,
    draw:s=>[{type:'circle',x:s.x,y:160,radius:30,color:'#7452cf'}],
    outcome:()=>({status:${failure ? "'lost'" : "'playing'"},score:0})
  }};`;
  const code = transformSync(source, { loader: 'ts', format: 'iife', globalName: 'GameModule' }).code;
  const runtime = kind === 'generated-module-v2' ? runtimeBundle(version) : null;
  return { kind, title: 'Synthetic launch fixture', instructions: 'Press Play to start the synthetic fixture.', controls: [], source,
    compiled: { code, sourceHash: hash(source), codeHash: hash(code), ...(runtime ? { runtimeVersion: runtime.version, runtimeHash: runtime.hash } : {}), tests: { desktop: true, mobile: true, replay: true, isolation: true, input: true, resources: true, pause: true } } };
}
async function mount(page, html) {
  await page.evaluate(({ html, channel, artifactId }) => {
    window.bridge?.dispose(); document.querySelector('main').replaceChildren();
    window.activeOwner = 'player1'; window.launches = 0; window.rounds = 0; window.failObserver = false;
    window.FG = { store: { current: () => ({ id: activeOwner }) }, learning: { active: false, checkpoint: () => false, dispose: () => {} } };
    const host = document.createElement('section'), frame = document.createElement('iframe');
    frame.id = 'preview'; frame.sandbox.add('allow-scripts'); frame.style.cssText = 'width:760px;height:650px'; host.append(frame); document.querySelector('main').append(host);
    window.bridge = PilotPreview.attachPreviewLearning(frame, { channel, artifactId, ownerId: 'player1', gameId: 'fixture',
      onPlayStarted() { if (failObserver) throw Error('Synthetic observation failure'); launches++; }, onRound() { rounds++; } });
    frame.srcdoc = html;
  }, { html, channel, artifactId });
  await page.waitForFunction(() => bridge.ready);
  return page.frameLocator('#preview');
}
async function packet(page, values, wrongSource = false) {
  const data = { type: 'factory-preview', channel, artifactId, event: 'play-started', learningProtocol: 1, roundId: 1, ...values };
  if (wrongSource) await page.evaluate(data => window.postMessage(data, '*'), data);
  else await page.frameLocator('#preview').locator('body').evaluate((_body, data) => parent.postMessage(data, '*'), data);
}
async function settled(page) {
  // postMessage delivery crosses a task boundary. Round-trip through the real
  // frame so negative assertions do not race an earlier message.
  await page.evaluate(async () => {
    const frame = document.getElementById('preview');
    await new Promise(resolve => {
      const token = crypto.randomUUID();
      const done = event => { if (event.source === frame.contentWindow && event.data?.fixtureBarrier === token) { removeEventListener('message', done); resolve(); } };
      addEventListener('message', done);
      frame.contentWindow.postMessage({ fixtureBarrier: token }, '*');
    });
  });
}

(async () => {
  const bridge = await build({ entryPoints: ['src/learning/remote.ts'], bundle: true, write: false, format: 'iife', globalName: 'PilotPreview', platform: 'browser' });
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/bridge.js' ? 'text/javascript' : 'text/html');
    response.end(request.url === '/bridge.js' ? bridge.outputFiles[0].text : '<!doctype html><main></main><script src="/bridge.js"></script>');
  }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage(), errors = [], posts = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    for (const kind of ['generated-module-v1', 'generated-module-v2']) {
      const frame = await mount(page, renderGenerated(fixture(kind), artifactId, channel).html);
      // Test-only barrier listener executes through Playwright, outside the
      // page's CSP. Production renderer bytes and their digest stay intact.
      await frame.locator('body').evaluate(() => addEventListener('message', event => { if (event.source === parent && event.data?.fixtureBarrier) parent.postMessage({ fixtureBarrier: event.data.fixtureBarrier }, '*'); }));
      assert.equal(await frame.locator('#status').getAttribute('data-state'), 'idle');
      assert.equal(await page.evaluate(() => launches), 0, `${kind}: ready with no Start is not played`);
      await packet(page, {}, true);
      for (const invalid of [{ channel: 'wrong-channel' }, { artifactId: 'wrong-artifact' }, { roundId: 0 }, { roundId: 1000001 }, { roundId: '1' }, { learningProtocol: 2 }]) await packet(page, invalid);
      await settled(page);
      assert.equal(await page.evaluate(() => launches), 0, `${kind}: wrong source/channel/artifact and malformed starts cannot count`);
      await frame.locator('#start').click();
      await page.waitForFunction(() => launches === 1);
      assert.ok(Number(await frame.locator('#game').getAttribute('data-frames')) >= 1, `${kind}: a real validated worker frame precedes the callback`);
      assert.equal(await frame.locator('#status').getAttribute('data-state'), 'playing');
      await packet(page, {}); await packet(page, { event: 'ready' });
      await page.evaluate(({ channel, artifactId }) => document.getElementById('preview').contentWindow.postMessage({ type: 'factory-learning', channel, artifactId, action: 'connect' }, '*'), { channel, artifactId });
      await settled(page);
      assert.equal(await page.evaluate(() => launches), 1, `${kind}: duplicate packets/handshakes do not count the round twice`);
      await frame.locator('#replay').click(); await page.waitForFunction(() => launches === 2);
      await packet(page, { roundId: 1 }); await settled(page);
      assert.equal(await page.evaluate(() => launches), 2, `${kind}: stale earlier-round packets do not count again`);
      await page.evaluate(() => { activeOwner = 'player2'; });
      await packet(page, { roundId: 3 }); await settled(page);
      assert.equal(await page.evaluate(() => launches), 2, `${kind}: profile mismatch suppresses starts`);
      await page.evaluate(() => { activeOwner = 'player1'; failObserver = true; });
      await frame.locator('#replay').click();
      await frame.locator('#game[data-frames]').waitFor(); await settled(page);
      assert.equal(await frame.locator('#status').getAttribute('data-state'), 'playing', `${kind}: throwing observer preserves real play`);
      await page.evaluate(() => { failObserver = false; bridge.dispose(); });
      await packet(page, { roundId: 4 }); await settled(page);
      assert.equal(await page.evaluate(() => launches), 2, `${kind}: disposed previews cannot publish starts`);
      console.log(`ok - ${kind}: ready versus actual start, validated first frame, replay dedupe, owner/source guards and observer isolation`);

      const rejected = await mount(page, renderGenerated(fixture(kind, true), artifactId, channel).html);
      await rejected.locator('#start').click(); await rejected.locator('#status[data-state="error"]').waitFor();
      assert.equal(await page.evaluate(() => launches), 0, `${kind}: rejected initial frame is never a successful launch`);
      console.log(`ok - ${kind}: failed initial worker frame emits no play observation`);
    }
    const auto = await mount(page, renderPreview({ kind: 'star-catcher-v1', target: 2, seconds: 60 }, artifactId, channel).html);
    await page.waitForFunction(() => launches === 1);
    assert.equal(await auto.locator('#field button').count(), 3, 'declarative autoplay has actually initialized its playable controls');
    await auto.locator('#restart').click(); await page.waitForFunction(() => launches === 2);
    console.log('ok - declarative autoplay/replay reports successful initialization without a readiness shortcut');

    const old = runtimeBundle('quality-runtime-v2.1.0');
    assert.equal(old.hash, '6a214bbed95e8ec138f78bad2f86a26dee9fc271587a223c97b738b36c289fc0');
    const archived = await mount(page, renderGenerated(fixture('generated-module-v2', false, old.version), artifactId, channel).html);
    await archived.locator('#start').click(); await archived.locator('#game[data-frames]').waitFor();
    assert.equal(await archived.locator('#status').getAttribute('data-state'), 'playing');
    assert.equal(await page.evaluate(() => launches), 0, 'older immutable archive stays playable without a fabricated start event');
    assert.deepEqual(errors, []); assert.deepEqual(posts, []);
    console.log('ok - prior v2.1.0 bytes remain unchanged and playable, with no inferred launch event');
  } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

/* Isolated browser-transport diagnostic, not product acceptance. Fresh contexts
 * keep the DOM unchanged: one captured touch drag, then exactly one tap. The
 * independent controls vary touch ID, session lifetime and tap transport; the
 * baseline only taps. A missing click is evidence, never called a product pass.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const output = path.resolve('test-results/bubble-gum-touch-probe');
fs.mkdirSync(output, { recursive: true });
const evidence = { schema: 'bubble-gum-touch-transport-probe-v1', startedAt: new Date().toISOString(), cases: [] };
const save = () => fs.writeFileSync(path.join(output, 'review.json'), JSON.stringify(evidence, null, 2) + '\n');

async function probe(browser, options) {
  const { name, detach = false, dragId = 'explicit-1', tap = 'locator', drag = true } = options;
  const context = await browser.newContext({ viewport: { width: 820, height: 1024 }, hasTouch: true });
  const page = await context.newPage();
  let session;
  const result = { name, parameters: { detach, dragId, tap, drag, tapId: 'implicit-0' }, protocol: [] };
  evidence.cases.push(result);
  try {
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>body{margin:0;font:20px sans-serif}button{position:absolute;min-width:80px;min-height:80px}
      #source{left:560px;top:240px;touch-action:none}#next{left:210px;top:540px;touch-action:manipulation}
      #drop{position:absolute;left:120px;top:540px;width:60px;height:60px;border:2px dashed purple}</style>
      </head><body><button id="source" type="button">Piece</button><div id="drop">Drop</div>
      <button id="next" type="button">Join</button></body></html>`);
    await page.evaluate(() => {
      window.probe = { events: [], drops: 0, clicks: 0 };
      for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'gotpointercapture',
        'lostpointercapture', 'touchstart', 'touchmove', 'touchend', 'touchcancel', 'mousedown', 'mouseup', 'click']) {
        document.addEventListener(type, event => {
          const point = event.changedTouches?.[0] || event;
          const receipt = { type, time: performance.now(), target: event.target.id || event.target.nodeName,
            trusted: event.isTrusted, pointerId: event.pointerId ?? null, pointerType: event.pointerType || null,
            primary: event.isPrimary ?? null, touches: event.touches?.length ?? null,
            x: point.clientX ?? null, y: point.clientY ?? null, defaultPrevented: event.defaultPrevented };
          window.probe.events.push(receipt);
          queueMicrotask(() => { receipt.defaultPrevented = event.defaultPrevented; });
        }, true);
      }
      const source = document.getElementById('source');
      source.onpointerdown = event => source.setPointerCapture(event.pointerId);
      source.onpointerup = () => { window.probe.drops++; };
      document.getElementById('next').onclick = () => { window.probe.clicks++; };
      // These exact nodes remain alive for the entire probe.
      window.probe.source = source;
      window.probe.next = document.getElementById('next');
    });
    const signals = () => page.evaluate(() => ({ maxTouchPoints: navigator.maxTouchPoints,
      touchEventSupport: 'ontouchstart' in window, coarsePointer: matchMedia('(pointer: coarse)').matches,
      finePointer: matchMedia('(pointer: fine)').matches, anyCoarse: matchMedia('(any-pointer: coarse)').matches,
      hover: matchMedia('(hover: hover)').matches }));
    result.beforeSession = await signals();
    const dispatch = (type, touchPoints) => {
      const parameters = { type, touchPoints };
      result.protocol.push({ time: Date.now(), method: 'Input.dispatchTouchEvent', parameters });
      return session.send('Input.dispatchTouchEvent', parameters);
    };
    if (drag) {
      session = await context.newCDPSession(page);
      const source = await page.locator('#source').boundingBox();
      const drop = await page.locator('#drop').boundingBox();
      assert.ok(source && drop, 'the isolated source and target are visible');
      const start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
      const end = { x: drop.x + drop.width / 2, y: drop.y + drop.height / 2 };
      const point = value => dragId === 'implicit-0' ? value : { ...value, id: 1 };
      await dispatch('touchStart', [point(start)]);
      for (const fraction of [.15, .35, .55, .75, 1]) {
        await dispatch('touchMove', [point({
          x: start.x + (end.x - start.x) * fraction, y: start.y + (end.y - start.y) * fraction,
        })]);
      }
      await dispatch('touchEnd', []);
    }
    result.afterDrag = await signals();
    if (detach) { await session.detach(); session = null; }
    result.beforeTap = await signals();
    // Exactly one tap: no retry, forced click, synthetic DOM event,
    // compatibility-mouse injection, or game/controller method invocation.
    result.tapStartedAt = Date.now();
    if (tap === 'locator') {
      result.protocol.push({ time: Date.now(), method: 'Locator.tap', parameters: { selector: '#next' } });
      await page.locator('#next').tap();
    } else {
      assert.ok(session, 'the raw tap uses the same retained drag session');
      const next = await page.locator('#next').boundingBox();
      const point = { x: next.x + next.width / 2, y: next.y + next.height / 2 };
      if (tap === 'same-session-parallel') {
        // Matches Playwright 1.56 crInput.js's normal tap dispatch ordering.
        await Promise.all([dispatch('touchStart', [point]), dispatch('touchEnd', [])]);
      } else {
        await dispatch('touchStart', [point]);
        await dispatch('touchEnd', []);
      }
    }
    result.tapAcknowledgedAt = Date.now();
    await page.waitForFunction(() => window.probe.clicks > 0, undefined, { timeout: 500 }).catch(error => {
      if (!String(error).includes('Timeout')) throw error;
    });
    result.afterTap = await signals();
    Object.assign(result, await page.evaluate(() => ({ events: window.probe.events, drops: window.probe.drops,
      clicks: window.probe.clicks, sourceUnchanged: window.probe.source === document.getElementById('source'),
      nextUnchanged: window.probe.next === document.getElementById('next') })));
    assert.equal(result.drops, drag ? 1 : 0, 'only the requested real captured drag reached pointerup');
    assert.ok(result.sourceUnchanged && result.nextUnchanged, 'no DOM lifecycle change can explain this diagnostic');
    assert.equal(result.events.filter(event => event.type === 'pointerdown' && event.target === 'next' && event.trusted).length, 1,
      'the one normal follow-up tap reached the next button');
    assert.equal(result.events.filter(event => event.type === 'touchend' && event.target === 'next' && event.trusted).length, 1,
      'the one normal follow-up tap completed on the next button');
    result.observed = result.clicks === 1 ? 'one-click' : result.clicks === 0 ? 'no-click' : 'multiple-clicks';
    console.log(`TRANSPORT PROBE ${result.name}: ${result.observed}; maxTouchPoints ${result.beforeSession.maxTouchPoints} -> ${result.beforeTap.maxTouchPoints}`);
  } catch (error) {
    result.error = String(error.stack || error);
    throw error;
  } finally {
    if (session) await session.detach().catch(() => {});
    await context.close();
    save();
  }
}

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ||
      (!process.env.CI && fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    headless: true, args: ['--no-sandbox'] });
    evidence.browser = browser.version();
    const cases = [
      { name: 'locator-only-baseline', drag: false },
      { name: 'explicit-1-retain-locator' },
      { name: 'explicit-1-detach-locator', detach: true },
      { name: 'implicit-0-retain-locator', dragId: 'implicit-0' },
      { name: 'implicit-0-detach-locator', dragId: 'implicit-0', detach: true },
      { name: 'explicit-1-same-session-parallel', tap: 'same-session-parallel' },
      { name: 'implicit-0-same-session-parallel', dragId: 'implicit-0', tap: 'same-session-parallel' },
      { name: 'explicit-1-same-session-sequential', tap: 'same-session-sequential' },
      { name: 'implicit-0-same-session-sequential', dragId: 'implicit-0', tap: 'same-session-sequential' },
    ];
    for (const options of cases) await probe(browser, options);
    assert.equal(evidence.cases.length, cases.length, 'every independent diagnostic context ran');
  } catch (error) {
    evidence.error = String(error.stack || error);
    throw error;
  } finally {
    if (browser) await browser.close();
    evidence.completedAt = new Date().toISOString(); save();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

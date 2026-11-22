/* Isolated browser-transport diagnostic, not product acceptance. Both contexts
 * keep the DOM unchanged: one captured touch drag, then one normal Locator.tap.
 * The only difference is whether its auxiliary CDP session is detached between
 * those gestures. A missing click is recorded as evidence, never called a pass.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const output = path.resolve('test-results/bubble-gum-touch-probe');
fs.mkdirSync(output, { recursive: true });
const evidence = { schema: 'bubble-gum-touch-transport-probe-v1', startedAt: new Date().toISOString(), cases: [] };
const save = () => fs.writeFileSync(path.join(output, 'review.json'), JSON.stringify(evidence, null, 2) + '\n');

async function probe(browser, detach) {
  const context = await browser.newContext({ viewport: { width: 820, height: 1024 }, hasTouch: true });
  const page = await context.newPage();
  let session;
  const result = { name: detach ? 'detach-after-drag' : 'retain-through-tap' };
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
    session = await context.newCDPSession(page);
    const source = await page.locator('#source').boundingBox();
    const drop = await page.locator('#drop').boundingBox();
    assert.ok(source && drop, 'the isolated source and target are visible');
    const start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
    const end = { x: drop.x + drop.width / 2, y: drop.y + drop.height / 2 };
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
    for (const fraction of [.15, .35, .55, .75, 1]) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
        x: start.x + (end.x - start.x) * fraction, y: start.y + (end.y - start.y) * fraction, id: 1,
      }] });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    result.afterDrag = await signals();
    if (detach) { await session.detach(); session = null; }
    result.beforeTap = await signals();
    // Exactly one normal tap: no retry, forced click, synthetic DOM event,
    // compatibility-mouse injection, or game/controller method invocation.
    await page.locator('#next').tap();
    await page.waitForFunction(() => window.probe.clicks > 0, undefined, { timeout: 500 }).catch(error => {
      if (!String(error).includes('Timeout')) throw error;
    });
    result.afterTap = await signals();
    Object.assign(result, await page.evaluate(() => ({ events: window.probe.events, drops: window.probe.drops,
      clicks: window.probe.clicks, sourceUnchanged: window.probe.source === document.getElementById('source'),
      nextUnchanged: window.probe.next === document.getElementById('next') })));
    assert.equal(result.drops, 1, 'one real captured drag reached pointerup');
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
    await probe(browser, false);
    await probe(browser, true);
    assert.equal(evidence.cases.length, 2, 'both independent diagnostic contexts ran');
  } catch (error) {
    evidence.error = String(error.stack || error);
    throw error;
  } finally {
    if (browser) await browser.close();
    evidence.completedAt = new Date().toISOString(); save();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

/* Real production game hosts; synthetic profiles/remote transport only.
 * Never calls a model or starts a generation. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { start } = require('./browser-server.cjs');
const { exploreWelcome } = require('./studio-entry.cjs');

async function checkFrame(page, label) {
  // Await a mount and the controller's resize frame, never eventual correctness.
  // Invalid geometry should fail with its actual bounds instead of timing out.
  await page.waitForFunction(() => {
    const page = document.getElementById('page-studio'), host = document.getElementById('studioGameHost');
    return page?.classList.contains('studio-play-mode') && host?.getBoundingClientRect().height > 0;
  }, null, { timeout: 5000 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const bounds = await page.evaluate(() => {
    const host = document.getElementById('studioGameHost').getBoundingClientRect();
    const home = document.getElementById('studioHome').getBoundingClientRect();
    const full = document.getElementById('studioFullScreen').getBoundingClientRect();
    return { host: { top: host.top, bottom: host.bottom, left: host.left, right: host.right },
      home: { top: home.top, bottom: home.bottom, height: home.height },
      full: { left: full.left, right: full.right, top: full.top, bottom: full.bottom, height: full.height },
      actions: ['studioChange', 'studioHelp', 'studioMore'].map(id => {
        const element = id === 'studioMore' ? document.querySelector('#studioMore > summary') : document.getElementById(id);
        const r = element.getBoundingClientRect();
        return { id, left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height,
          clipped: element.scrollWidth > element.clientWidth + 1, fontSize: parseFloat(getComputedStyle(element).fontSize) };
      }),
      height: innerHeight, width: innerWidth, y: scrollY, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  assert.ok(bounds.host.bottom - bounds.host.top > 100 && bounds.host.top >= 0 && bounds.host.bottom <= bounds.height + 1,
    `${label}: game keeps useful height inside the viewport: ${JSON.stringify(bounds)}`);
  assert.ok(bounds.host.left >= 0 && bounds.host.right <= bounds.width + 1, label + ': game stays in viewport');
  assert.ok(bounds.home.top >= 0 && bounds.home.bottom <= bounds.height && bounds.home.height >= 44, label + ': exit remains visible');
  assert.ok(bounds.full.left >= 0 && bounds.full.right <= bounds.width + 1 && bounds.full.top >= 0 && bounds.full.bottom <= bounds.height,
    label + ': fullscreen control remains visible');
  assert.ok(bounds.full.height >= 48, label + ': fullscreen has a child-sized touch target');
  for (const action of bounds.actions) assert.ok(action.left >= 0 && action.right <= bounds.width + 1 && action.top >= 0 &&
    action.bottom <= bounds.height && action.height >= 48 && action.fontSize >= 18 && !action.clipped,
  `${label}: each primary action is readable without scrolling: ${JSON.stringify(action)}`);
  assert.equal(bounds.overflow, false, label + ': no sideways page scroll');
  const before = bounds.host.top;
  await page.mouse.move(bounds.host.left + 10, bounds.host.top + 10);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => scrollY), bounds.y, label + ': an accidental wheel cannot scroll away from the game');
  assert.equal(await page.locator('#studioGameHost').evaluate(node => node.getBoundingClientRect().top), before);
}

async function insideHost(page, selector, label, minHeight = 1) {
  const nodes = page.locator(selector);
  assert.ok(await nodes.count(), label + ': expected content exists');
  for (const node of await nodes.all()) {
    const result = await node.evaluate(element => {
      const r = element.getBoundingClientRect(), host = document.getElementById('studioGameHost').getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height,
        host: { top: host.top, bottom: host.bottom, left: host.left, right: host.right } };
    });
    assert.ok(result.height >= minHeight && result.top >= result.host.top - 1 && result.bottom <= result.host.bottom + 1 &&
      result.left >= result.host.left - 1 && result.right <= result.host.right + 1,
    `${label}: actual content fits the game frame: ${JSON.stringify(result)}`);
  }
}

async function checkGameContent(page, game, label) {
  if (game === 'factory') {
    await insideHost(page, '.gf-world', label + ' factory scene', 140);
    await insideHost(page, '.gf-sort-basket', label + ' sorting buttons', 48);
  } else if (game === 'gum') {
    await insideHost(page, '.gum-scene', label + ' sticker scene', 150);
    await insideHost(page, '.gum-slot', label + ' sticker destinations', 48);
    await insideHost(page, '.gum-tray', label + ' bounded sticker tray', 100);
    const sceneTop = await page.locator('.gum-scene').evaluate(node => node.getBoundingClientRect().top);
    // Optional tools use their own tray. Reading/scrolling that tray must not
    // move the invention or the outer page. Disabled GO is still discoverable.
    for (const button of await page.locator('.gum-tray button').all()) {
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox(), tray = await page.locator('.gum-tray').boundingBox();
      assert.ok(box && tray && box.y >= tray.y - 1 && box.y + box.height <= tray.y + tray.height + 1,
        label + ': each sticker and GO is reachable inside its tray');
      assert.equal(await page.locator('.gum-scene').evaluate(node => node.getBoundingClientRect().top), sceneTop,
        label + ': tray scrolling keeps the invention still');
    }
    await page.locator('.gum-tray').evaluate(node => { node.scrollTop = 0; });
  } else if (game === 'hill') {
    await insideHost(page, '.quality-hill canvas.q-canvas', label + ' rendered driving canvas', 140);
    await insideHost(page, '.quality-hill .q-pedal', label + ' driving pedals', 48);
  } else if (game === 'dragon' || game === 'buckets') {
    // Playwright selectors pierce the recovered game's real shadow root.
    await insideHost(page, '#game-mount canvas#game', label + ' native canvas', 100);
    await insideHost(page, game === 'dragon' ? '#game-mount #touch button' : '#game-mount .touch button:not([hidden])', label + ' native touch controls', 48);
  } else {
    await insideHost(page, '.favorite-canvas', label + ' canvas', 80);
    await insideHost(page, '.favorite-controls button', label + ' essential controls', 48);
  }
}

async function checkMore(page, label) {
  const summary = page.locator('#studioMore > summary'), action = page.locator('#studioCompare');
  await summary.click(); await action.waitFor({ state: 'visible' });
  const result = await action.evaluate(node => {
    const r = node.getBoundingClientRect(), target = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { onScreen: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
      reachable: !!target && node.contains(target) };
  });
  assert.equal(result.onScreen, true, label + ': More tools fit the viewport');
  assert.equal(result.reachable, true, label + ': the toolbar does not clip or cover More tools');
  await summary.focus();
  for (let index = 0; index < 8 && !await action.evaluate(node => document.activeElement === node); index++) await page.keyboard.press('Tab');
  assert.equal(await action.evaluate(node => document.activeElement === node), true, label + ': More supports keyboard navigation');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#studioMore').evaluate(node => node.open), false, label + ': Escape closes More');
  assert.equal(await summary.evaluate(node => document.activeElement === node), true, label + ': closing More returns focus');
}

async function checkPlayerMenu(page, label) {
  await page.locator('#studioMore > summary').click();
  await page.locator('#studioProfileMenu > summary').click();
  const choice = page.locator('#studioProfileMenu .profile-choice').first();
  await choice.scrollIntoViewIfNeeded();
  assert.equal(await choice.evaluate(node => {
    const r = node.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && r.height >= 48 &&
      parseFloat(getComputedStyle(node).fontSize) >= 18 && (hit === node || node.contains(hit));
  }), true, label + ': the existing player choices remain readable and reachable inside More');
  await page.locator('#studioProfileMenu > summary').click();
  await page.locator('#studioMore > summary').click();
}

(async () => {
  const server = start();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ||
    (!process.env.CI && fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    headless: true, args: ['--no-sandbox'] });
  fs.mkdirSync('test-results/play-view', { recursive: true });
  const failures = [];
  async function recordFailure(page, label, error) {
    const detail = `${label}: ${error.stack || error}`;
    failures.push(detail); console.error('FAIL ' + detail);
    await page.screenshot({ path: `test-results/play-view/failure-${label.replace(/[^a-z0-9-]/gi, '-')}.png` }).catch(captureError => {
      failures.push(`${label}: failure capture unavailable: ${captureError.message}`);
    });
  }
  async function leavePlay(page) {
    const home = page.locator('#studioHome');
    if (await home.isVisible()) await home.click();
    else if (!await page.locator('[data-starter="gum"]').isVisible()) await page.locator('#studioNavHome').click();
    assert.equal(await page.evaluate(() => document.body.classList.contains('studio-playing')), false, 'leaving unlocks the page');
    assert.equal(await page.evaluate(() => document.documentElement.style.overflow), '', 'prior scrolling style is restored');
  }
  try {
    // 640×450 is the CSS layout space of a 1280×900 window at 200% browser
    // zoom; deviceScaleFactor preserves its pixel density. This checks reflow,
    // not the browser chrome's zoom control or a physical device.
    for (const [device, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }],
      ['small-phone', { width: 320, height: 667 }], ['landscape', { width: 844, height: 390 }], ['zoom-layout-200', { width: 640, height: 450 }]]) {
      const context = await browser.newContext({ viewport, hasTouch: ['phone', 'small-phone', 'landscape'].includes(device),
        deviceScaleFactor: device === 'zoom-layout-200' ? 2 : 1, reducedMotion: 'reduce' });
      const page = await context.newPage(), errors = [], posts = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
      await page.route('**/factory-config.json', route => route.fulfill({ contentType: 'application/json', body: '{"version":1,"mode":"unavailable"}' }));
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}/arcade/?studio=1`);
        await page.waitForFunction(() => window.FG?.studio); await exploreWelcome(page);
        // A satisfied pacing window isolates layout here. The separate checkpoint
        // case below resets it and uses the actual learning host.
        await page.evaluate(() => { FG.store.current().mathWindow = [Date.now()]; FG.store.current().rate = 1; FG.store.save(); });
        let canContinue = true;
        for (const game of ['factory', 'gum', 'hill', 'buckets', 'dragon', 'moon', 'robot']) {
          try {
            await page.locator(`[data-starter="${game}"]`).scrollIntoViewIfNeeded();
            await page.locator(`[data-starter="${game}"]`).click();
            await checkFrame(page, `${device} ${game}`);
            await checkGameContent(page, game, `${device} ${game}`);
            await checkMore(page, `${device} ${game}`);
            if (game === 'factory') await checkPlayerMenu(page, `${device} ${game}`);
            await page.screenshot({ path: `test-results/play-view/${device}-${game}.png` });
            console.log(`PASS ${device} ${game}: scene, controls, scroll and More`);
          } catch (error) { await recordFailure(page, `${device}-${game}`, error); }
          try { await leavePlay(page); }
          catch (error) {
            await recordFailure(page, `${device}-${game}-exit`, error); canContinue = false; break;
          }
        }
        // Fullscreen/editing/learning form one dependent journey. Run it only
        // when the real visible exit restored a clean library; never mask a
        // failed exit with a hidden API reset or retry a failed game assertion.
        if (!canContinue) continue;
        await page.locator('[data-starter="gum"]').click();
        await page.evaluate(() => {
          Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
          document.getElementById('page-studio').requestFullscreen = () => Promise.reject(new Error('Fixture: fullscreen denied'));
        });
        await page.locator('#studioFullScreen').click();
        await page.locator('#studioPlayDisplayStatus').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#studioFullScreen').getAttribute('aria-pressed'), 'true');
        await checkFrame(page, `${device} fullscreen fallback`);
        await checkMore(page, `${device} fullscreen fallback`);
        assert.equal(await page.locator('#studioFullScreen').getAttribute('aria-pressed'), 'true', 'closing More keeps the expanded game');
        assert.match(await page.locator('#studioPlayDisplayStatus').textContent(), /Expanded view/);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#studioFullScreen').getAttribute('aria-pressed'), 'false', 'Escape exits fallback expansion');
        await page.locator('#studioChange').click();
        assert.equal(await page.evaluate(() => document.body.classList.contains('studio-playing')), false, 'ideas restore ordinary page navigation');
        await page.locator('#studioPlay').click();
        await checkFrame(page, `${device} returning to play`);
        if (device === 'phone') {
          await page.setViewportSize({ width: 844, height: 390 });
          await checkFrame(page, 'rotated phone');
          await page.screenshot({ path: 'test-results/play-view/phone-landscape.png' });
          await page.setViewportSize(viewport);
        }
        await page.evaluate(() => {
          FG.store.current().mathWindow = [];
          window.dispatchEvent(new CustomEvent('factory-game-event', { detail: { type: 'checkpoint', game: 'gum' } }));
        });
        await page.waitForFunction(() => FG.learning.active);
        const attempt = await page.evaluate(() => FG.learning.activeAttemptId);
        await checkFrame(page, `${device} host learning`);
        await page.locator('#studioFullScreen').click();
        assert.equal(await page.evaluate(() => FG.learning.activeAttemptId), attempt, 'expansion preserves the same checkpoint');
        assert.equal(await page.locator('#game-mount').evaluate(node => node.inert), true, 'expansion cannot release the paused game');
        await page.locator('#studioHome').click();
        assert.equal(await page.evaluate(() => FG.learning.active), false, 'visible exit can interrupt the activity without an answer');
        assert.equal(await page.evaluate(() => document.body.classList.contains('studio-playing')), false);
        assert.equal(await page.evaluate(() => document.documentElement.style.overflow), '');
        assert.deepEqual(posts, [], 'layout checks start no paid or remote operation');
        assert.deepEqual(errors, [], device + ': no page errors');
        console.log(`PASS ${device}: fullscreen denial/Escape, editor return, orientation and learning exit`);
      } catch (error) {
        await recordFailure(page, `${device}-setup-or-lifecycle`, error);
      } finally {
        if (posts.length) failures.push(`${device}: unexpected POSTs ${JSON.stringify(posts)}`);
        if (errors.length) failures.push(`${device}: page errors ${JSON.stringify(errors)}`);
        await context.close();
      }
    }
    assert.deepEqual(failures, [], 'every independent fitted-game case and dependent lifecycle must pass');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });

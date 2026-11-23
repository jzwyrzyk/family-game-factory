/* Real production game hosts; synthetic profiles, remote transport and cosmetic events.
 * Never calls a model or starts a generation. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { start } = require('./browser-server.cjs');
const { exploreWelcome } = require('./studio-entry.cjs');
require('tsx/cjs');
const { RevisionStore, WORKSPACE_KEY } = require('../src/factory/workspace.ts');
const { StudioNotebook, STUDIO_KEY } = require('../src/studio/notebook.ts');

function savedLegacyGames() {
  const data = new Map(), storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const workspace = new RevisionStore(storage), notebook = new StudioNotebook(storage), sessions = {};
  for (const [game, name] of [['moon', 'Saved Moon experiment'], ['robot', 'Saved Robot experiment']]) {
    const project = workspace.create('player1', game, name), session = notebook.create('player1', game, name, project.id);
    notebook.message(session.id, 'player1', 'child', game === 'moon' ? 'I want to collect more moon donuts.' : 'I want to plan a route to the star.');
    sessions[game] = session.id;
  }
  return { workspace: workspace.snapshot(), notebook: notebook.read(), sessions };
}

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
    const cosmeticToasts = [...document.querySelectorAll('.jems-rewards-toast,.jems-delight-toast')].filter(element => {
      const r = element.getBoundingClientRect();
      if (!r.width || !r.height || r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return false;
      for (let node = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0) return false;
      }
      return true;
    }).map(element => ({ kind: element.className, text: element.textContent.trim() }));
    return { host: { top: host.top, bottom: host.bottom, left: host.left, right: host.right },
      home: { top: home.top, bottom: home.bottom, height: home.height },
      full: { left: full.left, right: full.right, top: full.top, bottom: full.bottom, height: full.height },
      actions: ['studioChange', 'studioHelp', 'studioMore'].map(id => {
        const element = id === 'studioMore' ? document.querySelector('#studioMore > summary') : document.getElementById(id);
        const r = element.getBoundingClientRect();
        return { id, left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height,
          clipped: element.scrollWidth > element.clientWidth + 1, fontSize: parseFloat(getComputedStyle(element).fontSize) };
      }),
      cosmeticToasts, height: innerHeight, width: innerWidth, y: scrollY, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  assert.deepEqual(bounds.cosmeticToasts, [], label + ': cosmetic popups cannot cover play controls or labels');
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
    await insideHost(page, '.gum-build-scene', label + ' assembly scene', 140);
    await insideHost(page, '.gum-build-slot', label + ' object target', 48);
    await insideHost(page, '.gum-build-footer button', label + ' assembly controls', 48);
    await insideHost(page, '.gum-build-tray', label + ' bounded object tray', 100);
    const sceneTop = await page.locator('.gum-build-scene').evaluate(node => node.getBoundingClientRect().top);
    for (const button of await page.locator('[data-gum-part]').all()) {
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox(), tray = await page.locator('.gum-build-tray').boundingBox();
      assert.ok(box && tray && box.width >= 48 && box.height >= 48 && box.x >= tray.x - 1 && box.x + box.width <= tray.x + tray.width + 1 &&
        box.y >= tray.y - 1 && box.y + box.height <= tray.y + tray.height + 1,
        label + ': each object choice is reachable inside its tray');
      assert.equal(await button.evaluate(node => {
        const text = node.querySelector('.gum-build-piece-name');
        return parseFloat(getComputedStyle(text).fontSize) >= 18 && node.scrollWidth <= node.clientWidth + 1;
      }), true, label + ': object names remain readable without overlapping choices');
      assert.equal(await page.locator('.gum-build-scene').evaluate(node => node.getBoundingClientRect().top), sceneTop,
        label + ': tray scrolling keeps the invention still');
    }
    await page.locator('.gum-build-choices').evaluate(node => { node.scrollTop = 0; });
    await page.locator('.gum-build-tray').evaluate(node => { node.scrollTop = 0; });
  } else if (game === 'hill') {
    await insideHost(page, '.quality-hill canvas.q-canvas', label + ' rendered driving canvas', 140);
    await insideHost(page, '.quality-hill .q-pedal', label + ' driving pedals', 48);
  } else if (game === 'mining') {
    const mining = page.locator('.native-mining');
    await page.locator('.native-mining[data-assets="ready"]').waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(await page.locator('dialog.myj-arcade[open]').count(), 0, label + ': Mining uses the same native game host');
    await insideHost(page, '.native-mining', label + ' original Mining root', 200);
    await insideHost(page, '.native-mining .myj-stage', label + ' illustrated Mining scene', Math.min(300, page.viewportSize().height * .46));
    await insideHost(page, '.native-mining [data-crystal],.native-mining [data-myj="bank"],.native-mining .myj-native-tools button', label + ' native controls', 48);
    assert.equal(await mining.evaluate(node => node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1), true,
      label + ': Mining fits without an inner game scrollbar');
    for (const button of await mining.locator('[data-crystal],.myj-native-tools button').all()) {
      const bounds = await button.evaluate(node => {
        const r = node.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { label: node.getAttribute('aria-label'), width: r.width, height: r.height, enabled: !node.disabled,
          reachable: hit === node || node.contains(hit), hit: hit?.className || hit?.tagName };
      });
      assert.ok(bounds.width >= 48 && bounds.height >= 48 && bounds.enabled && bounds.reachable,
        label + ': the original crystal and tool controls are initially visible and usable: ' + JSON.stringify(bounds));
    }
    assert.equal(await page.evaluate(() => FG.runtime.isPlaying()), true, label + ': native entry focus starts a playable round');
    await page.screenshot({ path: `test-results/play-view/${label.replace(/ /g, '-')}-initial.png` });
  } else if (game === 'dragon' || game === 'buckets') {
    // Playwright selectors pierce the recovered game's real shadow root.
    await insideHost(page, '#game-mount canvas#game', label + ' native canvas', 100);
    await insideHost(page, game === 'dragon' ? '#game-mount #touch button' : '#game-mount .touch button:not([hidden])', label + ' native touch controls', 48);
  } else if (game === 'robot') {
    const board = page.locator('.favorite-robot .favorite-canvas'), tools = page.locator('.robot-plan-tools');
    const boardBounds = await board.boundingBox(), pageY = await page.evaluate(() => scrollY);
    const directions = page.locator('.robot-directions button'), actions = page.locator('.robot-plan-actions button');
    assert.equal(await directions.count(), 4, label + ': all four directions are present');
    assert.equal(await actions.count(), 3, label + ': Run, Undo and Clear are present');
    async function checkRobotState(state) {
      await insideHost(page, '.favorite-robot .favorite-canvas', label + ' ' + state + ' robot canvas', 200);
      const imageHeight = await board.evaluate(node => {
        const css = getComputedStyle(node), width = node.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
        const height = node.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
        return Math.min(width / node.width, height / node.height) * node.height;
      });
      assert.ok(imageHeight >= 200, label + ': ' + state + ' keeps a useful contained robot image: ' + imageHeight);
      await insideHost(page, '.robot-plan-tools', label + ' ' + state + ' bounded instructions', 32);
      await insideHost(page, '.robot-directions button,.robot-plan-actions button', label + ' ' + state + ' persistent controls', 48);
      // Never scroll a primary control into view to make this assertion pass.
      // All directions and actions must be present together from initial play.
      for (const button of await page.locator('.robot-directions button,.robot-plan-actions button').all()) {
        const control = await button.evaluate(node => {
          const r = node.getBoundingClientRect(), panel = node.closest('.robot-controls-panel').getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { text: node.textContent, rect: {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height},
            panel: {left:panel.left,right:panel.right,top:panel.top,bottom:panel.bottom}, hit:hit?.id||hit?.className||hit?.tagName,
            font:parseFloat(getComputedStyle(node).fontSize),scrollWidth:node.scrollWidth,clientWidth:node.clientWidth,
            usable: r.width >= 48 && r.height >= 48 && r.left >= panel.left - 1 && r.right <= panel.right + 1 &&
            r.top >= panel.top - 1 && r.bottom <= panel.bottom + 1 && parseFloat(getComputedStyle(node).fontSize) >= 18 &&
            node.scrollWidth <= node.clientWidth + 1 && (hit === node || node.contains(hit)) };
        });
        assert.equal(control.usable, true, label + ': ' + state + ' shows every direction and action without scrolling: '+JSON.stringify(control));
      }
      assert.deepEqual(await board.boundingBox(), boardBounds, label + ': ' + state + ' keeps the board position and size fixed');
      assert.equal(await page.evaluate(() => scrollY), pageY, label + ': ' + state + ' keeps the outer page still');
    }
    await checkRobotState('initial');
    await page.screenshot({ path: `test-results/play-view/${label.replace(/ /g, '-')}-initial.png` });
    assert.equal(await page.evaluate(() => FG.runtime.snapshot().state.planLength), 0, label + ': this fresh route starts empty');
    for (let index = 0; index < 24; index++) await page.locator('.robot-directions [data-direction="left"]').click();
    assert.equal(await page.evaluate(() => FG.runtime.snapshot().state.planLength), 24, label + ': real arrow controls fill a complete plan');
    assert.match(await tools.textContent(), /long route/i);
    await checkRobotState('24-arrow plan');
    await page.screenshot({ path: `test-results/play-view/${label.replace(/ /g, '-')}-plan.png` });
    await page.locator('.favorite-robot').getByRole('button', { name: 'Run my plan', exact: true }).click();
    await page.waitForFunction(() => { const state = FG.runtime.snapshot().state; return !state.running && state.index > 0; }, null, { timeout: 3000 });
    assert.match(await tools.textContent(), /Bonk!/);
    await checkRobotState('route feedback');
    await tools.evaluate(node => { node.scrollTop = node.scrollHeight; });
    await checkRobotState('reading feedback');
    await tools.evaluate(node => { node.scrollTop = 0; });
    await page.screenshot({ path: `test-results/play-view/${label.replace(/ /g, '-')}-feedback.png` });
  } else {
    await insideHost(page, '.favorite-canvas', label + ' canvas', 80);
    await insideHost(page, '.favorite-controls button', label + ' essential controls', 48);
  }
}

async function checkDragonIntro(page, label) {
  const start = page.locator('#game-mount #startBtn'), choices = page.locator('#game-mount .heroCard');
  await start.waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForFunction(() => FG.runtime.snapshot()?.state.mode === 'menu', null, { timeout: 10000 });
  assert.equal(await start.isEnabled(), true, label + ': Start becomes available after native artwork is ready');
  await insideHost(page, '#game-mount #startBtn', label + ' visible Start action', 48);
  assert.equal(await start.evaluate(node => {
    const r = node.getBoundingClientRect(), hit = node.getRootNode().elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return parseFloat(getComputedStyle(node).fontSize) >= 18 && (hit === node || node.contains(hit));
  }), true, label + ': Start is readable and usable before scrolling the hero choices');
  assert.equal(await choices.count(), 4, label + ': all four hero choices remain available');
  const pageY = await page.evaluate(() => scrollY), startY = await start.evaluate(node => node.getBoundingClientRect().top);
  for (const choice of await choices.all()) {
    await choice.scrollIntoViewIfNeeded();
    assert.equal(await choice.evaluate(node => {
      const r = node.getBoundingClientRect(), tray = node.parentElement.getBoundingClientRect();
      const hit = node.getRootNode().elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return node.tagName === 'BUTTON' && r.height >= 48 && r.width >= 48 &&
        r.top >= tray.top - 1 && r.bottom <= tray.bottom + 1 &&
        parseFloat(getComputedStyle(node.querySelector('strong')).fontSize) >= 18 && (hit === node || node.contains(hit));
    }), true, label + ': each hero is a readable, reachable choice inside its own panel');
    assert.equal(await start.evaluate(node => node.getBoundingClientRect().top), startY, label + ': hero scrolling keeps Start still');
    assert.equal(await page.evaluate(() => scrollY), pageY, label + ': hero scrolling cannot move the page');
  }
  assert.equal(await choices.nth(1).getAttribute('aria-pressed'), 'false', label + ': the second hero starts unselected');
  await choices.nth(1).scrollIntoViewIfNeeded();
  await choices.nth(1).focus(); await page.keyboard.press('Space');
  assert.equal(await choices.nth(1).getAttribute('aria-pressed'), 'true', label + ': Space selects a different hero');
  assert.equal(await choices.first().getAttribute('aria-pressed'), 'false', label + ': selection moved from the first hero');
  await choices.first().scrollIntoViewIfNeeded();
  await choices.first().focus(); await page.keyboard.press('Enter');
  assert.equal(await choices.first().getAttribute('aria-pressed'), 'true', label + ': keyboard selection uses the real hero control');
  await page.screenshot({ path: `test-results/play-view/${label.replace(/ /g, '-')}-intro.png` });
  await start.click();
  await page.locator('#game-mount #menu').waitFor({ state: 'hidden' });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  if (label.startsWith('desktop ')) {
    const sound = page.locator('#game-mount #soundBtn'), pause = page.locator('#game-mount #pauseBtn');
    const soundBefore = await sound.getAttribute('aria-pressed');
    await sound.focus(); await page.keyboard.press('Space');
    assert.notEqual(await sound.getAttribute('aria-pressed'), soundBefore, 'native Sound keeps Space activation during gameplay');
    async function moveFromToolbar() {
      const before = await page.evaluate(() => FG.runtime.snapshot().state.player.x);
      await page.keyboard.down('ArrowRight');
      try { await page.waitForFunction(x => FG.runtime.snapshot().state.player.x > x + 2, before, { timeout: 2000 }); }
      finally { await page.keyboard.up('ArrowRight'); }
    }
    await moveFromToolbar();
    await pause.click();
    assert.equal(await page.evaluate(() => FG.runtime.snapshot().state.mode), 'pause');
    await pause.click();
    assert.equal(await page.evaluate(() => FG.runtime.snapshot().state.mode), 'playing');
    await moveFromToolbar(); await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => FG.runtime.snapshot().state.mode), 'pause', 'Escape works after the native pause toolbar resumes play');
    await page.locator('#game-mount #resumeBtn').click();
    assert.equal(await page.evaluate(() => FG.runtime.snapshot().state.mode), 'playing');
    const beforeY = await page.evaluate(() => FG.runtime.snapshot().state.player.y);
    await page.locator('#game-mount #touch [data-key="ArrowUp"]').focus(); await page.keyboard.down('Space');
    try { await page.waitForFunction(y => FG.runtime.snapshot().state.player.y < y - 2, beforeY, { timeout: 2000 }); }
    finally { await page.keyboard.up('Space'); }
  }
}

async function checkMore(page, label) {
  const summary = page.locator('#studioMore > summary'), action = page.locator('#studioCompare');
  await summary.click(); await action.waitFor({ state: 'visible' });
  const result = await action.evaluate(node => {
    const r = node.getBoundingClientRect(), target = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { onScreen: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
      reachable: !!target && node.contains(target), action: { top: r.top, bottom: r.bottom },
      hit: target?.id || target?.className || target?.tagName,
      menuScroll: node.closest('.studio-more-actions').scrollTop };
  });
  assert.equal(result.onScreen, true, label + ': More tools fit the viewport');
  assert.equal(result.reachable, true, label + ': the toolbar does not clip or cover More tools: ' + JSON.stringify(result));
  if (label.endsWith('factory')) await page.screenshot({ path: `test-results/play-view/${label.replace(/ /g, '-')}-tools-menu.png` });
  await summary.focus();
  for (let index = 0; index < 8 && !await action.evaluate(node => document.activeElement === node); index++) await page.keyboard.press('Tab');
  assert.equal(await action.evaluate(node => document.activeElement === node), true, label + ': More supports keyboard navigation');
  const menu = page.locator('#studioMore .studio-more-actions');
  if (label.endsWith('factory') && await menu.evaluate(node => node.scrollHeight > node.clientHeight + 1)) {
    for (const activation of ['pointer', 'Enter', 'Space']) {
      await page.locator('#studioProfileMenu > summary').scrollIntoViewIfNeeded();
      assert.ok(await menu.evaluate(node => node.scrollTop > 0), label + ': the menu was genuinely scrolled before reopening');
      await summary.click();
      if (activation === 'pointer') await summary.click();
      else { await summary.focus(); await page.keyboard.press(activation); }
      const reopened = await action.evaluate(node => {
        const r = node.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { scroll: node.closest('.studio-more-actions').scrollTop, reachable: hit === node || node.contains(hit) };
      });
      assert.equal(reopened.scroll, 0, label + ': ' + activation + ' reopens More at its first tools');
      assert.equal(reopened.reachable, true, label + ': ' + activation + ' makes the first tools immediately reachable');
    }
  }
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#studioMore').evaluate(node => node.open), false, label + ': Escape closes More');
  assert.equal(await summary.evaluate(node => document.activeElement === node), true, label + ': closing More returns focus');
}

async function checkPlayerMenu(page, label) {
  await page.locator('#studioMore > summary').click();
  await page.locator('#studioProfileMenu > summary').click();
  const menu = page.locator('#studioMore .studio-more-actions');
  async function checkHorizontalContainment() {
    const bounds = await menu.evaluate(node => ({ left: node.scrollLeft, width: node.clientWidth, contentWidth: node.scrollWidth }));
    assert.equal(bounds.left, 0, label + ': choosing players cannot scroll More sideways: '+JSON.stringify(bounds));
    assert.ok(bounds.contentWidth <= bounds.width + 1, label + ': all player tools fit the menu width: '+JSON.stringify(bounds));
  }
  await checkHorizontalContainment();
  const choices = page.locator('#studioProfileMenu .profile-choice');
  assert.ok(await choices.count() > 0, label + ': the existing player choices are present');
  for (const [index, choice] of (await choices.all()).entries()) {
    await choice.scrollIntoViewIfNeeded();
    await checkHorizontalContainment();
    assert.equal(await choice.evaluate(node => {
      const r = node.getBoundingClientRect(), menu = node.closest('.studio-more-actions').getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && r.height >= 48 &&
        r.left >= menu.left && r.right <= menu.right && r.top >= menu.top && r.bottom <= menu.bottom &&
        parseFloat(getComputedStyle(node).fontSize) >= 18 && (hit === node || node.contains(hit));
    }), true, label + ': player choice ' + (index + 1) + ' remains readable and reachable inside More');
  }
  await page.screenshot({ path: `test-results/play-view/${label.replace(/ /g, '-')}-player-menu.png` });
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
        const legacy = savedLegacyGames();
        await context.addInitScript(({ legacy, workspaceKey, notebookKey }) => {
          if (window.top !== window) return;
          if (!localStorage.getItem(workspaceKey)) localStorage.setItem(workspaceKey, JSON.stringify(legacy.workspace));
          if (!localStorage.getItem(notebookKey)) localStorage.setItem(notebookKey, JSON.stringify(legacy.notebook));
        }, { legacy, workspaceKey: WORKSPACE_KEY, notebookKey: STUDIO_KEY });
        await page.goto(`http://127.0.0.1:${server.address().port}/arcade/?studio=1`);
        await page.waitForFunction(() => window.FG?.studio); await exploreWelcome(page);
        // A satisfied pacing window isolates layout here. The separate checkpoint
        // case below resets it and uses the actual learning host.
        await page.evaluate(() => { FG.store.current().mathWindow = [Date.now()]; FG.store.current().rate = 1; FG.store.save(); });
        let canContinue = true;
        for (const game of ['factory', 'mining', 'gum', 'hill', 'buckets', 'dragon', 'moon', 'robot']) {
          try {
            const entry = ['moon', 'robot'].includes(game) ?
              page.locator(`#studioLibrary [data-session="${legacy.sessions[game]}"] .studio-saved-open`) : page.locator(`[data-starter="${game}"]`);
            await entry.scrollIntoViewIfNeeded();
            if (game === 'factory') {
              // Exercise the real presentation event, without inventing a grant
              // or altering saved achievements. Entry must remove an old toast.
              await page.evaluate(() => window.dispatchEvent(new CustomEvent('jems:milestone', { detail: { kind: 'practice' } })));
              await page.locator('#jems-delight-host .jems-delight-toast[data-kind="practice"]').waitFor({ state: 'visible' });
            }
            await entry.click();
            await checkFrame(page, `${device} ${game}`);
            if (game === 'factory') {
              assert.equal(await page.locator('#jems-delight-host').evaluate(host => host.childElementCount), 0,
                device + ': entering play clears a previously visible celebration');
              // A different valid kind avoids the existing per-kind debounce.
              await page.evaluate(() => window.dispatchEvent(new CustomEvent('jems:milestone', { detail: { kind: 'copied' } })));
              assert.equal(await page.locator('#jems-delight-host').evaluate(host => host.childElementCount), 0,
                device + ': a later cosmetic event cannot insert a popup during play');
            }
            if (game === 'dragon') await checkDragonIntro(page, `${device} ${game}`);
            await checkGameContent(page, game, `${device} ${game}`);
            await checkMore(page, `${device} ${game}`);
            if (game === 'factory') await checkPlayerMenu(page, `${device} ${game}`);
            if (game === 'mining') {
              assert.equal(await page.locator('.native-mining').getAttribute('data-paused'), 'true', 'shared tools pause Mining');
              await page.locator('.native-mining .myj-pause-cover button').click();
              assert.equal(await page.evaluate(() => FG.runtime.isPlaying()), true, 'Keep playing explicitly resumes Mining after tools');
            }
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

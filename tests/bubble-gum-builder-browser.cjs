/* Production-browser acceptance for the assembly workshop. All constructions
 * use real controls. Synthetic profile pacing isolates gameplay from the
 * independently tested learning host; no generation or model calls occur.
 * The normal-motion journey uses real time. Later repeated journeys use the
 * browser clock, never a shortened product adventure duration.
 */
require('tsx/cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { once } = require('node:events');
const { chromium } = require('playwright');
const { start } = require('./browser-server.cjs');
const { exploreWelcome } = require('./studio-entry.cjs');
const { assertTextContrast } = require('./helpers/text-contrast.cjs');
const { BLUEPRINTS, TOUR_DURATION_MS, GUM_BUDGET, createBuild, getBlueprint } = require('../src/games/bubble-gum-rules.ts');
const { defaults } = require('../src/runtime/manifests.ts');

const output = path.resolve('test-results/bubble-gum-builders');
fs.mkdirSync(output, { recursive: true });
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const git = (...args) => { try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); } catch { return null; } };
const manifest = { schema: 'bubble-gum-browser-review-v1', startedAt: new Date().toISOString(),
  source: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'),
  dirty: !!git('status', '--porcelain'), realAdventureMs: TOUR_DURATION_MS,
  touchTransport: 'One retained CDP session per journey; implicit touch id matching Playwright; subsequent tap uses Locator.tap',
  sources: Object.fromEntries(['src/games/bubble-gum-builder.ts', 'src/games/bubble-gum-builder.css',
    'src/games/bubble-gum-rules.ts', 'src/games/bubble-gum-art.ts', 'tests/bubble-gum-builder-browser.cjs']
    .map(file => [file, fs.existsSync(file) ? hash(fs.readFileSync(file)) : null])),
  cases: [], captures: [], videos: [], contrast: [], touchReceipts: [], failures: [] };
const saveManifest = () => fs.writeFileSync(path.join(output, 'review.json'), JSON.stringify(manifest, null, 2) + '\n');
saveManifest();

const root = page => page.locator('.gum-builder');
const snapshot = page => page.evaluate(() => FG.runtime.snapshot().state);
const stateForRules = state => ({ ...createBuild(state.completedCount, state.blueprint), placed: state.placed,
  bonds: state.bonds, tourCompleted: state.tourCompleted, reported: state.reported });
const build = state => getBlueprint(stateForRules(state));
const recordCount = page => page.evaluate(() => FG.store.current().stats.gum?.played || 0);
const exactBuild = state => ({ blueprint: state.blueprint, placed: state.placed, bonds: state.bonds,
  gumLeft: state.gumLeft, completedCount: state.completedCount, tourCompleted: state.tourCompleted, reported: state.reported });

async function capture(page, label) {
  const name = label.replace(/[^a-zA-Z0-9_-]/g, '-') + '.png';
  const destination = path.join(output, name);
  await page.screenshot({ path: destination, fullPage: false });
  manifest.captures.push({ label, file: name, sha256: hash(fs.readFileSync(destination)), viewport: page.viewportSize(),
    snapshot: await snapshot(page).catch(() => null) });
  saveManifest();
}

async function activate(journey, target, input = journey.touch ? 'touch' : 'pointer') {
  if (input === 'keyboard') { await target.focus(); await journey.page.keyboard.press('Enter'); }
  else if (input === 'touch') await target.tap();
  else await target.click();
}

async function showPart(journey, object, input) {
  const choice = root(journey.page).locator(`[data-gum-part="${object}"]`);
  const total = await root(journey.page).locator('[data-gum-part]').count();
  for (let page = 0; page <= Math.ceil(total / 3); page++) {
    if (await choice.isVisible()) return choice;
    const more = root(journey.page).locator('.gum-build-more-pieces');
    assert.ok(await more.isVisible(), 'later pieces have an explicit child-usable paging control');
    await activate(journey, more, input === 'drag' ? undefined : input);
  }
  throw Error(`The object tray never exposed ${object}`);
}

async function waitPlaced(page, slot, object) {
  await page.waitForFunction(({ slot, object }) => FG.runtime.snapshot().state.placed[slot] === object,
    { slot, object }, { timeout: 2500 });
}

async function dragPart(journey, object, slot) {
  const from = await showPart(journey, object);
  const to = root(journey.page).locator(`[data-gum-slot="${slot}"]`);
  await from.scrollIntoViewIfNeeded();
  const a = await from.boundingBox(), b = await to.boundingBox();
  assert.ok(a && b, 'both the part and its target exist');
  const start = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const end = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  if (journey.touch) {
    // Retain the transport until this journey closes so detaching a second
    // emulation session cannot change how the following ordinary tap behaves.
    const session = journey.touchSession ||= await journey.context.newCDPSession(journey.page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    for (const fraction of [.15, .35, .55, .75, 1]) await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: start.x + (end.x - start.x) * fraction,
        y: start.y + (end.y - start.y) * fraction }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    // The touch controller commits on the next frame after touchend, keeping
    // the captured source alive until the browser completes that gesture.
    // Flush one frame when this journey owns the clock; never repeat input.
    if (journey.clock) await journey.page.clock.runFor(32);
  } else {
    await journey.page.mouse.move(start.x, start.y); await journey.page.mouse.down();
    await journey.page.mouse.move(end.x, end.y, { steps: 10 }); await journey.page.mouse.up();
  }
  await waitPlaced(journey.page, slot, object);
  if (journey.touch) journey.pendingTouchDrag = { part: object, slot };
}

async function nextConstructionAction(journey, input) {
  const before = await snapshot(journey.page);
  if (before.activeJoint) {
    const target = root(journey.page).locator(`[data-gum-joint="${before.activeJoint}"]`);
    journey.lastJointAttempt = { joint: before.activeJoint, input: input || (journey.touch ? 'touch' : 'pointer'),
      before: exactBuild(before), target: await target.evaluate(node => {
        const rect = node.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
        const hit = document.elementFromPoint(x, y), style = getComputedStyle(node);
        return { time: performance.now(), x, y, width: rect.width, height: rect.height, connected: node.isConnected,
          inert: !!node.closest('[inert]'), disabled: node.disabled, pointerEvents: style.pointerEvents,
          hitTag: hit?.tagName, hitClass: hit?.getAttribute('class'), targetOwnsHit: node === hit || node.contains(hit) };
      }) };
    await activate(journey, target, input);
    await journey.page.waitForFunction(slot => !!FG.runtime.snapshot().state.bonds[slot], before.activeJoint, { timeout: 2500 });
    const after = await snapshot(journey.page);
    assert.equal(after.gumLeft, before.gumLeft - 1, 'a real seam consumes one gum connector');
    assert.deepEqual(after.placed, before.placed, 'joining leaves the chosen objects intact');
    if (journey.pendingTouchDrag) {
      manifest.touchReceipts.push({ case: journey.name, drag: journey.pendingTouchDrag,
        joint: before.activeJoint, gumBefore: before.gumLeft, gumAfter: after.gumLeft,
        events: await journey.page.evaluate(() => (window.__gumInputReceipts || []).slice(-12)) });
      journey.pendingTouchDrag = null;
    }
    return 'bond';
  }
  assert.ok(before.activeSlot, 'an unfinished blueprint provides the next object target');
  const slot = build(before).slots.find(item => item.id === before.activeSlot);
  assert.ok(slot, 'the active target belongs to this blueprint');
  const object = before.availableChoices.find(id => slot.accepts.includes(id));
  assert.ok(object, 'at least one fitting object is reachable in the real tray');
  if (input === 'drag') await dragPart(journey, object, slot.id);
  else {
    await activate(journey, await showPart(journey, object, input), input);
    await activate(journey, root(journey.page).locator(`[data-gum-slot="${slot.id}"]`), input);
    await waitPlaced(journey.page, slot.id, object);
  }
  const after = await snapshot(journey.page);
  assert.equal(after.gumLeft, before.gumLeft, 'positioning a part alone never consumes gum');
  assert.equal(Object.keys(after.placed).length, Object.keys(before.placed).length + 1, 'one input places exactly one object');
  assert.equal(await root(journey.page).locator(`[data-built-part="${slot.id}"]`).count(), 1, 'the object is present in the assembled drawing');
  return 'part';
}

async function assemble(journey, { keyboard = false, drag = false } = {}) {
  let dragged = !drag;
  for (let step = 0; step < 24; step++) {
    const state = await snapshot(journey.page);
    if (!state.activeSlot && !state.activeJoint) {
      const blueprint = build(state);
      assert.equal(Object.keys(state.placed).length, blueprint.slots.length, 'every real blueprint part was assembled');
      assert.equal(Object.keys(state.bonds).length, blueprint.slots.filter(slot => slot.parent).length, 'every required seam has gum');
      assert.equal(state.gumLeft, GUM_BUDGET - Object.keys(state.bonds).length);
      assert.ok(await root(journey.page).locator('.gum-build-launch').isEnabled(), 'only a connected assembly can launch');
      return state;
    }
    assert.ok(await root(journey.page).locator('.gum-build-launch').isDisabled(), 'unfinished assemblies cannot launch');
    const input = !dragged && state.activeSlot ? 'drag' : keyboard ? 'keyboard' : undefined;
    await nextConstructionAction(journey, input);
    if (input === 'drag') dragged = true;
  }
  throw Error('Assembly did not complete within its bounded number of child actions');
}

async function assertFrame(page, label) {
  await page.waitForFunction(() => document.getElementById('page-studio')?.classList.contains('studio-play-mode'));
  const geometry = await page.evaluate(() => {
    const bounds = element => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    const host = document.getElementById('studioGameHost');
    const game = document.querySelector('.gum-builder');
    const stage = game.querySelector('.gum-build-scene');
    const tray = game.querySelector('.gum-build-tray');
    const controls = [...game.querySelectorAll('button')].filter(node => node.getClientRects().length && !node.closest('[hidden]'));
    return { viewport: { width: innerWidth, height: innerHeight }, host: bounds(host), game: bounds(game),
      stage: bounds(stage), tray: bounds(tray), home: bounds(document.getElementById('studioHome')),
      full: bounds(document.getElementById('studioFullScreen')), pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      pageY: scrollY, controls: controls.map(node => ({ label: node.getAttribute('aria-label') || node.textContent.trim(),
        disabled: node.disabled, ...bounds(node), fontSize: parseFloat(getComputedStyle(node).fontSize),
        clipped: node.scrollWidth > node.clientWidth + 1 })) };
  });
  assert.ok(geometry.host.y >= 0 && geometry.host.bottom <= geometry.viewport.height + 1, label + ': host fits the viewport');
  assert.ok(geometry.game.x >= geometry.host.x - 1 && geometry.game.right <= geometry.host.right + 1 &&
    geometry.game.y >= geometry.host.y - 1 && geometry.game.bottom <= geometry.host.bottom + 1,
  label + ': workshop fits its shared frame: ' + JSON.stringify(geometry));
  assert.ok(geometry.stage.height >= 140, label + ': actual creation remains a useful size');
  assert.ok(geometry.home.height >= 44 && geometry.home.y >= 0 && geometry.home.bottom <= geometry.viewport.height,
    label + ': My Games exit remains reachable');
  assert.ok(geometry.full.height >= 48 && geometry.full.right <= geometry.viewport.width + 1 &&
    geometry.full.y >= 0 && geometry.full.bottom <= geometry.viewport.height, label + ': Full screen remains reachable');
  assert.equal(geometry.pageOverflow, false, label + ': no horizontal page scrolling');
  for (const control of geometry.controls) {
    assert.ok(control.width >= 44 && control.height >= 44, label + ': child-sized control ' + JSON.stringify(control));
    assert.equal(control.clipped, false, label + ': controls never clip their labels: ' + JSON.stringify(control));
    // Diagram-only target buttons have meaningful accessible labels and need
    // no painted words. Visible child button words must stay at least 18px.
    if (control.label && !/^(Place |Stick )/.test(control.label)) assert.ok(control.fontSize >= 18,
      label + ': visible button labels remain readable: ' + JSON.stringify(control));
  }
  const sceneTop = geometry.stage.y;
  await page.mouse.move(geometry.stage.x + 10, geometry.stage.y + 10);
  await page.mouse.wheel(0, 700);
  assert.equal(await page.evaluate(() => scrollY), geometry.pageY, label + ': an accidental scroll cannot lose the game');
  assert.equal(await page.locator('.gum-build-scene').evaluate(node => node.getBoundingClientRect().top), sceneTop,
    label + ': scrolling does not displace the creation');
}

async function assertInventionVisible(page, expected, label) {
  assert.deepEqual((await snapshot(page)).placed, expected.placed, label + ': exact selected objects remain attached');
  assert.deepEqual((await snapshot(page)).bonds, expected.bonds, label + ': exact gum choices remain attached');
  assert.equal(await root(page).locator('[data-built-part]').count(), Object.keys(expected.placed).length);
  assert.equal(await root(page).locator('[data-gum-bond]').count(), Object.keys(expected.bonds).length);
  const bounds = await page.locator('.gum-build-machine').evaluate(node => {
    const r = node.getBoundingClientRect(), scene = node.closest('.gum-build-scene').getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height,
      scene: { left: scene.left, right: scene.right, top: scene.top, bottom: scene.bottom } };
  });
  const visibleWidth = Math.min(bounds.right, bounds.scene.right) - Math.max(bounds.left, bounds.scene.left);
  const visibleHeight = Math.min(bounds.bottom, bounds.scene.bottom) - Math.max(bounds.top, bounds.scene.top);
  assert.ok(visibleWidth > bounds.width * .75 && visibleHeight > bounds.height * .75,
    label + ': the creation stays onscreen instead of immediately flying away: ' + JSON.stringify(bounds));
}

async function adventure(journey, { realTime = false, captureWorld = false, pause = false } = {}) {
  const before = await snapshot(journey.page), initialRecords = await recordCount(journey.page);
  await activate(journey, root(journey.page).locator('.gum-build-launch'));
  await journey.page.waitForFunction(() => FG.runtime.snapshot().state.stage === 'adventure');
  if (!realTime) await journey.page.clock.pauseAt(await journey.page.evaluate(() => Date.now() + 500));
  const advance = async milliseconds => realTime ? journey.page.waitForTimeout(milliseconds) : journey.page.clock.runFor(milliseconds);
  await advance(2300);
  assert.equal((await snapshot(journey.page)).stage, 'adventure', 'the old 1.85-second cutoff is gone');
  await assertInventionVisible(journey.page, before, journey.name + ' early adventure');
  const action = root(journey.page).locator('.gum-build-action');
  assert.ok(await action.isEnabled(), 'the ride has a usable context-specific play action');
  if (!journey.touch) {
    await action.hover();
    await action.evaluate(async button => { await Promise.all(button.getAnimations().map(animation => animation.finished.catch(() => {}))); });
    assert.equal(await action.evaluate(button => button.matches(':hover')), true, 'the action is inspected in its actual hovered state');
    manifest.contrast.push({ case: journey.name, blueprint: before.blueprint, state: 'adventure-action-hover',
      samples: await assertTextContrast(journey.page, '.gum-build-action', journey.name + ' hovered adventure action') });
  }
  const actionBefore = (await snapshot(journey.page)).actionCount;
  await activate(journey, action);
  await journey.page.waitForFunction(value => FG.runtime.snapshot().state.actionCount === value + 1, actionBefore);
  assert.ok((await root(journey.page).locator('.gum-build-effects').textContent()).trim(),
    'the adventure action creates a real visible effect, not just a counter');
  if (pause) {
    await activate(journey, journey.page.locator('#studioMore > summary'));
    await journey.page.waitForFunction(() => FG.runtime.snapshot().state.paused);
    const menuPaused = await snapshot(journey.page);
    assert.equal(await journey.page.locator('#studioMore').evaluate(node => node.open), true, 'ordinary More opens while the adventure pauses');
    await advance(5000);
    assert.equal((await snapshot(journey.page)).tourElapsedMs, menuPaused.tourElapsedMs, 'reading shared tools cannot consume the adventure');
    await journey.page.keyboard.press('Escape');
    assert.equal(await journey.page.locator('#studioMore').evaluate(node => node.open), false);
    assert.equal((await snapshot(journey.page)).paused, true, 'closing shared tools does not silently resume the ride');
    await activate(journey, root(journey.page).locator('.gum-build-pause').getByRole('button', { name: 'Keep playing', exact: true }));
    assert.equal((await snapshot(journey.page)).paused, false, 'the child explicitly resumes the same adventure');
    assert.equal(await journey.page.evaluate(() => FG.runtime.pause()), true, 'host can pause the adventure');
    const paused = await snapshot(journey.page);
    await advance(5000);
    assert.equal((await snapshot(journey.page)).tourElapsedMs, paused.tourElapsedMs, 'paused time does not consume the adventure');
    assert.equal(await journey.page.locator('#game-mount').evaluate(node => node.inert), true, 'host pause excludes child input');
    await journey.page.evaluate(() => FG.runtime.resume());
    assert.equal((await snapshot(journey.page)).paused, false);
  }
  await advance(5000);
  await assertInventionVisible(journey.page, before, journey.name + ' middle adventure');
  if (captureWorld) await capture(journey.page, journey.name + '-' + before.blueprint + '-adventure');
  assert.equal(await recordCount(journey.page), initialRecords, 'the showcase does not submit a premature host result');
  if (realTime) await journey.page.waitForFunction(() => FG.runtime.snapshot().state.stage === 'showcase', null, { timeout: 25000 });
  else await journey.page.clock.runFor(TOUR_DURATION_MS);
  await journey.page.waitForFunction(() => FG.runtime.snapshot().state.stage === 'showcase');
  const after = await snapshot(journey.page);
  assert.ok(after.tourElapsedMs >= TOUR_DURATION_MS, 'all motion preferences receive the full adventure duration');
  assert.equal(after.tourCompleted, true);
  assert.equal(after.reported, false, 'the child controls when to finish');
  assert.equal(await recordCount(journey.page), initialRecords, 'finishing animation alone produces no host result');
  assert.equal(await journey.page.locator('#native-result-title').count(), 0, 'the result does not cover the creation');
  await assertInventionVisible(journey.page, before, journey.name + ' finished showcase');
  await advance(3000);
  assert.equal((await snapshot(journey.page)).stage, 'showcase', 'the creation remains available until an explicit choice');
  return before;
}

async function nextBuild(journey) {
  const before = await snapshot(journey.page), records = await recordCount(journey.page);
  await activate(journey, root(journey.page).locator('.gum-build-next'));
  await journey.page.locator('#native-result-title').waitFor();
  assert.equal(await recordCount(journey.page), records + 1, 'one explicit completion creates exactly one host result');
  assert.equal((await snapshot(journey.page)).reported, true);
  await activate(journey, journey.page.locator('#resultNext'));
  await journey.page.waitForFunction(id => FG.runtime.snapshot().state.blueprint !== id, before.blueprint);
  const after = await snapshot(journey.page);
  assert.equal(after.completedCount, before.completedCount + 1, 'difficulty progresses after a completed build');
  assert.equal(Object.keys(after.placed).length, 0, 'the next project starts with loose objects');
  assert.equal(after.gumLeft, GUM_BUDGET);
  return after;
}

async function createJourney(browser, base, name, viewport, { touch = false, motion = 'reduce', clock = true, video = false, difficulty = 'classic', legacyStarter = false } = {}) {
  const context = await browser.newContext({ viewport, hasTouch: touch, reducedMotion: motion, locale: 'en-US', colorScheme: 'light',
    ...(video ? { recordVideo: { dir: path.join(output, 'video'), size: viewport } } : {}) });
  const page = await context.newPage(), errors = [], posts = [];
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
  page.on('dialog', dialog => dialog.accept());
  const journey = { name, context, page, errors, posts, touch, clock, video, closed: false };
  try {
    if (clock) await page.clock.install();
    await page.addInitScript(() => {
      window.__gumInputReceipts = [];
      for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'click']) {
        document.addEventListener(type, event => {
          const target = event.target instanceof Element ? event.target.closest('button') : null;
          if (!target || !target.closest('.gum-builder') && !target.matches('[data-gum-part]')) return;
          let state;
          try { state = window.FG?.runtime?.snapshot()?.state; } catch { /* pre-mount event */ }
          const point = event.changedTouches?.[0] || event;
          const receipt = { time: performance.now(), type, trusted: event.isTrusted, target: target.className,
            part: target.dataset.gumPart || null, slot: target.dataset.gumSlot || null,
            joint: target.dataset.gumJoint || null, gum: target.dataset.gumColor || null,
            pointerId: event.pointerId ?? null, pointerType: event.pointerType || null,
            x: point.clientX ?? null, y: point.clientY ?? null, defaultPrevented: event.defaultPrevented,
            stage: state?.stage || null, activeJoint: state?.activeJoint || null };
          window.__gumInputReceipts.push(receipt);
          if (window.__gumInputReceipts.length > 100) window.__gumInputReceipts.shift();
          queueMicrotask(() => { receipt.defaultPrevented = event.defaultPrevented; });
        }, true);
      }
    });
    await page.route('**/factory-config.json', route => route.fulfill({ contentType: 'application/json', body: '{"version":1,"mode":"unavailable"}' }));
    await page.goto(base + '?studio=1');
    await page.waitForFunction(() => window.FG?.studio && window.FG?.runtime);
    await exploreWelcome(page);
    await page.evaluate(difficulty => {
      FG.store.changeProfile({ rate: 1 }); FG.store.current().mathWindow = [Date.now()];
      FG.store.current().remixes = { ...FG.store.current().remixes, gum: difficulty }; FG.store.save();
    }, difficulty);
    if (legacyStarter) journey.legacyStarter = await page.evaluate(config => {
      // A named pre-existing save exercises routing; it is never a migration
      // or fabricated child result. Subsequent entry uses the real shelf cards.
      const owner = FG.store.current().id, notebook = FG.studio.exportNotebook();
      const workspace = JSON.parse(localStorage.getItem('family-game-factory-workspace-v2') || '{"version":2,"projects":[],"revisions":[],"plays":[]}');
      const projectId = crypto.randomUUID(), revisionId = crypto.randomUUID(), id = crypto.randomUUID(), at = new Date().toISOString();
      workspace.projects.push({ id: projectId, owner, game: 'gum', name: 'Earlier sticker creation', headId: revisionId });
      workspace.revisions.push({ id: revisionId, projectId, parentId: null, config, label: 'Earlier saved workshop', hypothesis: '', createdAt: at, state: 'private' });
      FG.factory.validateWorkspace(workspace);
      notebook.sessions.push({ id, owner, game: 'gum', name: 'Earlier sticker creation', projectId, remoteId: null,
        candidate: null, draft: '', messages: [], job: null, updated: at, hypothesis: '', reflection: false, playOnly: true });
      localStorage.setItem('family-game-factory-workspace-v2', JSON.stringify(workspace));
      localStorage.setItem('family-game-factory-studio-v1', JSON.stringify(notebook));
      const stickerConstruction = { schema: 'gum-stickers-v1', mission: 'rocket', placed: { top: 'star' } };
      FG.store.current().constructionStates = { ...FG.store.current().constructionStates, [revisionId]: { stickerConstruction } };
      if (!FG.store.save()) throw Error('Could not seed the named legacy-starter fixture');
      return { id, projectId, revisionId, config, stickerConstruction };
    }, { ...defaults('gum'), qualityVersion: 2 });
    await page.locator('[data-starter="gum"]').click();
    await root(page).waitFor();
    assert.equal(await page.evaluate(() => FG.runtime.snapshot().config.qualityVersion), 3, 'new workshop uses the construction engine');
    assert.equal((await snapshot(page)).mode, 'assembly');
    return journey;
  } catch (error) { error.journey = journey; throw error; }
}

async function closeJourney(journey) {
  if (journey.closed) return;
  if (journey.touchSession) {
    await journey.touchSession.detach();
    journey.touchSession = null;
  }
  if (journey.video) {
    const recording = journey.page.video();
    await journey.context.close();
    const file = await recording.path();
    manifest.videos.push({ case: journey.name, file: path.relative(output, file), sha256: hash(fs.readFileSync(file)), timing: 'real-time, normal motion' });
  } else await journey.context.close();
  journey.closed = true;
  assert.deepEqual(journey.errors, [], journey.name + ': no browser errors');
  assert.deepEqual(journey.posts, [], journey.name + ': native assembly needs no remote or paid request');
}

async function testWrongAndUndo(journey) {
  const state = await snapshot(journey.page), slot = build(state).slots.find(item => item.id === state.activeSlot);
  const decoy = state.availableChoices.find(id => !slot.accepts.includes(id));
  assert.ok(decoy, 'the classic fixture includes a nonmatching piece for the real error-recovery journey');
  if (decoy) {
    await activate(journey, await showPart(journey, decoy));
    await activate(journey, root(journey.page).locator(`[data-gum-slot="${slot.id}"]`));
    assert.deepEqual(exactBuild(await snapshot(journey.page)), exactBuild(state), 'a misplaced piece neither damages the build nor spends gum');
  }
  await nextConstructionAction(journey, 'keyboard');
  await nextConstructionAction(journey);
  const loose = await snapshot(journey.page);
  assert.ok(loose.activeJoint, 'placing a neighboring object does not silently glue it');
  assert.ok(await root(journey.page).locator('.gum-build-launch').isDisabled());
  await activate(journey, root(journey.page).getByRole('button', { name: 'Wiggle test', exact: true }));
  assert.equal((await snapshot(journey.page)).stage, 'test', 'a wiggle tests the actual current assembly');
  assert.equal(await root(journey.page).locator('.gum-built-object.loose').count(), 1, 'the unglued object is visibly identified as loose');
  assert.ok(await root(journey.page).locator('.gum-built-object.connected').count(), 'the connected body retains its separate motion');
  if (journey.clock) await journey.page.clock.runFor(1300);
  await journey.page.waitForFunction(() => FG.runtime.snapshot().state.stage === 'build', null, { timeout: 3000 });
  assert.deepEqual(exactBuild(await snapshot(journey.page)), exactBuild(loose), 'testing a wobble cannot damage or silently repair the construction');
  await nextConstructionAction(journey);
  const bonded = await snapshot(journey.page);
  await activate(journey, root(journey.page).getByRole('button', { name: 'Undo', exact: true }));
  assert.deepEqual(exactBuild(await snapshot(journey.page)), exactBuild(loose), 'undo restores the exact loose joint and returns its gum');
  await nextConstructionAction(journey);
  assert.deepEqual(exactBuild(await snapshot(journey.page)), exactBuild(bonded), 'the child can reconnect after undo');
}

async function saveAndReenter(journey) {
  const before = exactBuild(await snapshot(journey.page));
  await activate(journey, journey.page.locator('#studioHome'));
  assert.equal(await root(journey.page).count(), 0, 'leaving tears down the live workshop');
  assert.equal(await journey.page.locator('.gum-build-ghost').count(), 0, 'leaving removes any transient drag helper');
  await activate(journey, journey.page.locator('[data-starter="gum"]'));
  if (journey.clock) await journey.page.clock.runFor(100);
  await root(journey.page).waitFor();
  assert.deepEqual(exactBuild(await snapshot(journey.page)), before, 'returning restores exact objects, seams, variation and gum');
}

async function normalMotion(journey) {
  await assertFrame(journey.page, journey.name);
  await capture(journey.page, journey.name + '-start');
  await testWrongAndUndo(journey);
  await assemble(journey, { drag: true });
  await capture(journey.page, journey.name + '-assembled');
  await adventure(journey, { realTime: true, captureWorld: true });
  await capture(journey.page, journey.name + '-showcase');
  await nextBuild(journey);
}

async function allBlueprints(journey) {
  const seen = [], worlds = new Set(), expectedStart = (await snapshot(journey.page)).completedCount;
  for (let index = 0; index < BLUEPRINTS.length; index++) {
    const complete = await assemble(journey, { keyboard: index === 0, drag: index === 1 });
    const blueprint = build(complete);
    assert.equal(seen.includes(complete.blueprint), false, 'no blueprint repeats before the whole catalog is played');
    seen.push(complete.blueprint);
    assert.ok(blueprint.slots.length >= 5 && blueprint.slots.length <= 8);
    if (index >= 9) assert.equal(blueprint.slots.length, 8, 'later builds add meaningful construction decisions');
    await capture(journey.page, 'catalog-' + String(index + 1).padStart(2, '0') + '-' + complete.blueprint);
    await adventure(journey, { captureWorld: !worlds.has(blueprint.world), pause: index === 0 });
    worlds.add(blueprint.world);
    if (index === 0) {
      const records = await recordCount(journey.page);
      await activate(journey, root(journey.page).locator('.gum-build-replay'));
      await journey.page.clock.runFor(TOUR_DURATION_MS + 1000);
      await journey.page.waitForFunction(() => FG.runtime.snapshot().state.stage === 'showcase');
      assert.equal(await recordCount(journey.page), records, 'watching again cannot duplicate a result');
      assert.deepEqual((await snapshot(journey.page)).placed, complete.placed, 'replay uses the child’s same construction');
      await saveAndReenter(journey);
      assert.equal((await snapshot(journey.page)).tourCompleted, true, 'a completed showcase survives return');
      // The child can revise a real object and keep all its unrelated work.
      const leaf = blueprint.slots.at(-1);
      const beforeTinker = await snapshot(journey.page);
      await activate(journey, root(journey.page).locator('.gum-build-tinker'));
      await activate(journey, root(journey.page).locator(`[data-change-part="${leaf.id}"]`));
      const removed = await snapshot(journey.page);
      assert.equal(removed.gumLeft, beforeTinker.gumLeft + 1, 'changing a leaf returns its connector');
      assert.equal(removed.tourCompleted, false, 'a changed invention earns its own new adventure');
      for (const [slot, object] of Object.entries(beforeTinker.placed)) if (slot !== leaf.id) assert.equal(removed.placed[slot], object,
        'changing one piece keeps every unrelated choice');
      const alternative = removed.availableChoices.find(id => leaf.accepts.includes(id) && id !== beforeTinker.placed[leaf.id]);
      assert.ok(alternative, 'an alternate recognizable object is available for this role');
      await activate(journey, await showPart(journey, alternative));
      await activate(journey, root(journey.page).locator(`[data-gum-slot="${leaf.id}"]`));
      await waitPlaced(journey.page, leaf.id, alternative);
      await assemble(journey);
      await adventure(journey);
      assert.equal(await recordCount(journey.page), records, 'tinkering and enjoying another ride do not duplicate a completion');
    }
    const after = await nextBuild(journey);
    assert.equal(after.completedCount, expectedStart + index + 1);
  }
  assert.equal(worlds.size, 4, 'flying, swimming, rolling and dancing receive browser journeys');
  assert.equal(await recordCount(journey.page), BLUEPRINTS.length, 'all completed constructions are counted exactly once');
  // Disposal must retire an unfinished adventure, not merely hide its picture.
  await assemble(journey);
  await activate(journey, root(journey.page).locator('.gum-build-launch'));
  await journey.page.clock.runFor(1000);
  await activate(journey, journey.page.locator('#studioHome'));
  await journey.page.clock.runFor(TOUR_DURATION_MS * 2);
  assert.equal(await recordCount(journey.page), BLUEPRINTS.length, 'a disposed adventure cannot submit a late result');
  assert.equal(await journey.page.locator('#native-result-title').count(), 0, 'leaving cannot bring a stale result back');
  assert.equal(await root(journey.page).count(), 0);
}

async function persistenceCompatibility(journey) {
  await nextConstructionAction(journey);
  await nextConstructionAction(journey);
  await nextConstructionAction(journey);
  const built = exactBuild(await snapshot(journey.page));
  const binding = await journey.page.evaluate(() => {
    const entries = Object.entries(FG.store.current().constructionStates || {});
    const found = entries.find(([, value]) => value.assemblyConstruction?.schema === 'gum-assembly-v1');
    if (!found) throw Error('Assembly must have a distinct durable save slot');
    return { key: found[0], saved: structuredClone(found[1].assemblyConstruction) };
  });
  const config = defaults('gum');
  // The compatibility API belongs to the retained Arcade route. Studio moves
  // the native mount inside its own page, so opening that API in a live Studio
  // page would hide its ancestor. Use the supported route with the same stored
  // profile and state key; all engine controls and save checks remain real.
  const legacyRoute = new URL(journey.page.url());
  legacyRoute.searchParams.delete('studio'); legacyRoute.searchParams.set('arcade', '1');
  await journey.page.goto(legacyRoute.href);
  await journey.page.waitForFunction(() => window.FG?.runtime && window.FG?.app);
  await journey.page.evaluate(({ key, config }) => FG.app.openGame('gum', { stateKey: key, config: { ...config, qualityVersion: 2 } }),
    { key: binding.key, config });
  await journey.page.locator('.gum-play').waitFor();
  await journey.page.getByRole('button', { name: 'Select Super star', exact: true }).click();
  await journey.page.getByRole('button', { name: 'Put a sticker on Top', exact: true }).click();
  await journey.page.waitForFunction(() => FG.runtime.snapshot().state.stickersPlaced === 1);
  const stickerSaved = await journey.page.evaluate(key => structuredClone(FG.store.current().constructionStates[key].stickerConstruction), binding.key);
  assert.equal(stickerSaved.schema, 'gum-stickers-v1');
  assert.deepEqual(await journey.page.evaluate(key => FG.store.current().constructionStates[key].assemblyConstruction, binding.key), binding.saved,
    'the preserved sticker engine cannot rewrite the new construction');
  await journey.page.evaluate(({ key, config }) => FG.app.openGame('gum', { stateKey: key, config: { ...config, qualityVersion: 1 } }),
    { key: binding.key, config });
  await journey.page.locator('.quality-builder').waitFor();
  await journey.page.getByRole('button', { name: 'Start fresh', exact: true }).click();
  await journey.page.getByRole('button', { name: 'Add Bottle', exact: true }).click();
  await journey.page.waitForFunction(() => FG.runtime.snapshot().state.parts.length === 1);
  const physicalSaved = await journey.page.evaluate(key => structuredClone(FG.store.current().constructionStates[key].qualityConstruction), binding.key);
  assert.equal(physicalSaved.schema, 'quality-construction-v1');
  await journey.page.evaluate(({ key, config }) => FG.app.openGame('gum', { stateKey: key, config }), { key: binding.key, config });
  await root(journey.page).waitFor();
  assert.deepEqual(exactBuild(await snapshot(journey.page)), built, 'reopening assembly preserves the exact construction');
  const allSaves = await journey.page.evaluate(key => FG.store.current().constructionStates[key], binding.key);
  assert.deepEqual(allSaves.stickerConstruction, stickerSaved, 'new assembly preserves old stickers alongside it');
  assert.deepEqual(allSaves.qualityConstruction, physicalSaved, 'new assembly preserves old physical play alongside it');

  // A failing write is injected only into this test profile's storage port.
  // The attempted new piece remains visible, while the last durable blueprint
  // and both legacy records must remain recoverable.
  const durableBefore = await journey.page.evaluate(key => structuredClone(FG.store.current().constructionStates[key]), binding.key);
  await journey.page.evaluate(() => { window.__gumOriginalSave = FG.store.save; FG.store.save = () => false; });
  try {
    await nextConstructionAction(journey);
    assert.equal((await snapshot(journey.page)).saveFailed, true, 'the child is told that saving failed');
    assert.match(await root(journey.page).textContent(), /could not save|couldn't save|not saved/i);
    assert.deepEqual(await journey.page.evaluate(key => FG.store.current().constructionStates[key], binding.key), durableBefore,
      'a failed save retains the last successful state and both previous engines');
    await capture(journey.page, 'persistence-save-warning');
  } finally {
    await journey.page.evaluate(() => { FG.store.save = window.__gumOriginalSave; delete window.__gumOriginalSave; });
  }

  await journey.page.evaluate(({ key, config }) => FG.app.openGame('gum', { stateKey: key, config }), { key: binding.key, config });
  await root(journey.page).waitFor();
  await assemble(journey);
  await adventure(journey);
  const recordsBeforeFinish = await recordCount(journey.page);
  await journey.page.evaluate(() => { window.__gumOriginalSave = FG.store.save; FG.store.save = () => false; });
  try {
    await activate(journey, root(journey.page).locator('.gum-build-next'));
    assert.equal((await snapshot(journey.page)).reported, false, 'a failed final receipt stays pending');
    assert.equal((await snapshot(journey.page)).stage, 'showcase', 'the creation stays available while final saving fails');
    assert.equal(await recordCount(journey.page), recordsBeforeFinish, 'an unsaved completion cannot become replayable host credit');
    assert.equal(await journey.page.locator('#native-result-title').count(), 0);
  } finally {
    await journey.page.evaluate(() => { FG.store.save = window.__gumOriginalSave; delete window.__gumOriginalSave; });
  }
  await activate(journey, root(journey.page).locator('.gum-build-next'));
  await journey.page.locator('#native-result-title').waitFor();
  assert.equal(await recordCount(journey.page), recordsBeforeFinish + 1, 'explicit retry records the recovered completion exactly once');

  const unknown = { schema: 'gum-assembly-from-a-future-version', childCreation: { kept: 'do not replace' } };
  await journey.page.evaluate(({ key, unknown, config }) => {
    FG.store.current().constructionStates[key].assemblyConstruction = unknown;
    if (!FG.store.save()) throw Error('Could not seed the isolated future-save fixture');
    FG.app.openGame('gum', { stateKey: key, config });
  }, { key: binding.key, unknown, config });
  await root(journey.page).waitFor();
  assert.deepEqual(await journey.page.evaluate(key => FG.store.current().constructionStates[key].assemblyConstruction, binding.key), unknown,
    'an unknown saved schema is not silently replaced on entry');
  assert.ok(await root(journey.page).locator('.gum-build-launch').isDisabled(), 'unknown-save recovery cannot launch a fabricated construction');
  await capture(journey.page, 'persistence-unknown-save');
}

async function legacyStarterRouting(journey) {
  const legacy = journey.legacyStarter;
  assert.ok(legacy, 'the route starts with an earlier play-only sticker project');
  const readProjects = () => journey.page.evaluate(() => ({
    sessions: FG.studio.exportNotebook().sessions.filter(session => session.owner === FG.store.current().id && session.game === 'gum'),
    workspace: JSON.parse(localStorage.getItem('family-game-factory-workspace-v2')),
    saves: structuredClone(FG.store.current().constructionStates),
  }));
  const first = await readProjects();
  const current = first.sessions.find(session => session.projectId !== legacy.projectId);
  assert.equal(first.sessions.length, 2, 'Ready to Play creates one current workshop alongside the earlier save');
  assert.ok(current?.playOnly, 'the current starter owns its separate play-only project');
  const project = first.workspace.projects.find(project => project.id === current.projectId);
  const currentConfig = first.workspace.revisions.find(revision => revision.id === project.headId).config;
  assert.equal(currentConfig.qualityVersion, 3);
  await nextConstructionAction(journey);
  await nextConstructionAction(journey);
  await nextConstructionAction(journey);
  const built = exactBuild(await snapshot(journey.page));
  await activate(journey, journey.page.locator('#studioHome'));
  const oldCard = journey.page.locator(`[data-session="${legacy.id}"]`);
  assert.equal(await oldCard.locator('.jems-project-badge').textContent(), 'Sticker workshop', 'earlier artwork remains clearly reachable in My jems');
  await capture(journey.page, 'saved-starter-both-workshops');
  await activate(journey, oldCard.locator('.studio-saved-open'));
  await journey.page.locator('.gum-play').waitFor();
  assert.equal(await journey.page.evaluate(() => FG.runtime.snapshot().config.qualityVersion), 2, 'the saved card keeps its chosen earlier engine');
  const earlier = await snapshot(journey.page);
  assert.equal(earlier.mode, 'stickers');
  assert.deepEqual(earlier.stickers, legacy.stickerConstruction.placed, 'the old sticker drawing is restored exactly');
  await capture(journey.page, 'saved-starter-earlier-stickers');
  await activate(journey, journey.page.locator('#studioHelp'));
  assert.match(await journey.page.locator('#studioHelpGoal').textContent(), /three stickers/i,
    'the earlier saved engine keeps its own actual instructions');
  await activate(journey, journey.page.locator('#studioHome'));
  await activate(journey, journey.page.locator('[data-starter="gum"]'));
  await root(journey.page).waitFor();
  assert.deepEqual(exactBuild(await snapshot(journey.page)), built, 'Ready to Play returns to the same current construction');
  const returned = await readProjects();
  assert.equal(returned.sessions.length, 2, 'switching between workshops does not create repeated starter sessions');
  assert.ok(returned.sessions.some(session => session.id === current.id && session.projectId === current.projectId));
  assert.deepEqual(returned.workspace.revisions.find(revision => revision.id === legacy.revisionId).config, legacy.config,
    'opening the new starter never rewrites the earlier revision config');
  assert.deepEqual(returned.workspace.revisions.find(revision => revision.id === project.headId).config, currentConfig,
    'reopening the earlier game never rewrites the current config');
  assert.deepEqual(returned.saves[legacy.revisionId].stickerConstruction, legacy.stickerConstruction,
    'both shelf routes preserve the earlier sticker payload');
  await capture(journey.page, 'saved-starter-current-assembly');
  await activate(journey, journey.page.locator('#studioHelp'));
  assert.match(await journey.page.locator('#studioHelpGoal').textContent(), /real objects/i,
    'the current workshop explains assembly rather than the saved sticker engine');
  assert.match(await journey.page.locator('#studioHelpControls').textContent(), /Next build/);
}

async function learningCompletion(journey) {
  const built = await assemble(journey);
  await adventure(journey);
  const records = await recordCount(journey.page);
  const attemptsBefore = await journey.page.evaluate(() => {
    // This test makes the next ordinary round boundary eligible. The actual
    // trusted host still chooses, mounts, completes and records the activity.
    FG.store.current().mathWindow = [];
    if (!FG.store.save() || !FG.math.canAsk(FG.store.current())) throw Error('The learning-boundary pacing fixture must be eligible');
    return FG.store.current().learning?.attempts.length || 0;
  });
  await activate(journey, root(journey.page).locator('.gum-build-next'));
  await journey.page.locator('#native-learning-activity .math-activity').waitFor();
  const attemptId = await journey.page.evaluate(() => FG.learning.activeAttemptId);
  assert.ok(attemptId, 'explicit Next build reaches the trusted learning host');
  assert.equal((await snapshot(journey.page)).reported, true, 'the creation receipt is durable while its learning activity is open');
  assert.equal(await recordCount(journey.page), records, 'the result waits for the host activity');
  assert.equal(await journey.page.locator('#native-result-title').count(), 0);
  assert.equal(await journey.page.locator('#game-mount').evaluate(node => node.inert), true, 'the host owns input during learning');
  await capture(journey.page, 'assembly-completion-host-learning');
  const activity = journey.page.locator('#native-learning-activity .math-activity');
  await activate(journey, activity.locator('[data-action="show-solution"]'));
  await activate(journey, activity.locator('[data-action="continue-supported"]'));
  await journey.page.clock.runFor(1000);
  await journey.page.locator('#native-result-title').waitFor();
  assert.equal(await recordCount(journey.page), records + 1, 'completing the host activity releases exactly one game result');
  const learning = await journey.page.evaluate(id => ({
    active: FG.learning.active,
    count: FG.store.current().learning.attempts.length,
    attempt: FG.store.current().learning.attempts.find(attempt => attempt.id === id),
  }), attemptId);
  assert.equal(learning.active, false);
  assert.equal(learning.count, attemptsBefore + 1, 'one completed build produces one eligible learning attempt');
  assert.equal(learning.attempt.context.gameId, 'gum');
  assert.equal(learning.attempt.outcome, 'shown', 'supported participation keeps its actual evidence category');
  assert.equal(learning.attempt.independent, false);
  await capture(journey.page, 'assembly-completion-host-result');
  await activate(journey, journey.page.locator('#resultNext'));
  await journey.page.waitForFunction(id => FG.runtime.snapshot().state.blueprint !== id, built.blueprint);
  assert.equal((await snapshot(journey.page)).completedCount, built.completedCount + 1);
  assert.equal(await recordCount(journey.page), records + 1, 'host continuation cannot duplicate the result');
}

async function responsive(journey) {
  await assertFrame(journey.page, journey.name + ' initial');
  if (journey.name === 'phone') {
    const before = await snapshot(journey.page), slot = build(before).slots.find(item => item.id === before.activeSlot);
    const later = before.availableChoices.slice(3).find(id => slot.accepts.includes(id));
    assert.ok(later, 'the phone fixture includes a fitting alternate object beyond the first tray page');
    assert.equal(await root(journey.page).locator('[data-gum-part]').count(), before.availableChoices.length,
      'pagination retains all configured object choices');
    assert.equal(await root(journey.page).locator(`[data-gum-part="${later}"]`).isVisible(), false,
      'the later-page object really starts hidden');
    await activate(journey, await showPart(journey, later));
    await activate(journey, root(journey.page).locator(`[data-gum-slot="${slot.id}"]`));
    await waitPlaced(journey.page, slot.id, later);
    await activate(journey, root(journey.page).getByRole('button', { name: 'Undo', exact: true }));
    assert.deepEqual(exactBuild(await snapshot(journey.page)), exactBuild(before), 'a real paged touch choice can be undone safely');
  }
  await testWrongAndUndo(journey);
  await saveAndReenter(journey);
  await assemble(journey, { drag: true });
  await assertFrame(journey.page, journey.name + ' complete');
  await capture(journey.page, journey.name + '-assembled');
  await adventure(journey, { pause: true, captureWorld: true });
  await capture(journey.page, journey.name + '-showcase');
  await nextBuild(journey);
  await activate(journey, journey.page.locator('#studioHome'));
  assert.equal(await root(journey.page).count(), 0, 'shared exit works without answering or launching another build');
  assert.equal(await journey.page.evaluate(() => document.body.classList.contains('studio-playing')), false);
}

(async () => {
  const server = start(); let browser;
  try {
    await once(server, 'listening');
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (!process.env.CI && fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
      headless: true, args: ['--no-sandbox'] });
    const base = `http://127.0.0.1:${server.address().port}/arcade/`;
    const cases = [
      { name: 'desktop-normal-motion', viewport: { width: 1360, height: 900 }, motion: 'no-preference', clock: false,
        video: process.env.GUM_CAPTURE_VIDEO === '1', run: normalMotion },
      { name: 'desktop-all-blueprints', viewport: { width: 1360, height: 900 }, run: allBlueprints },
      { name: 'saved-engine-compatibility', viewport: { width: 1360, height: 900 }, run: persistenceCompatibility },
      { name: 'saved-starter-routing', viewport: { width: 1360, height: 900 }, legacyStarter: true, run: legacyStarterRouting },
      { name: 'host-learning-completion', viewport: { width: 820, height: 1024 }, touch: true, run: learningCompletion },
      { name: 'tablet', viewport: { width: 820, height: 1024 }, touch: true, run: responsive },
      { name: 'phone', viewport: { width: 390, height: 844 }, touch: true, difficulty: 'stretch', run: responsive },
      { name: 'small-phone', viewport: { width: 320, height: 667 }, touch: true, run: responsive },
      { name: 'landscape', viewport: { width: 844, height: 390 }, touch: true, run: responsive },
      { name: 'zoom-layout-200', viewport: { width: 640, height: 450 }, run: responsive },
    ];
    for (const item of cases) {
      let journey; const startedAt = new Date().toISOString();
      try {
        journey = await createJourney(browser, base, item.name, item.viewport, item);
        await item.run(journey);
        await closeJourney(journey); journey = null;
        manifest.cases.push({ name: item.name, status: 'passed', startedAt, completedAt: new Date().toISOString() });
        console.log('PASS Bubble Gum Builders ' + item.name);
      } catch (error) {
        journey ||= error.journey;
        const failure = { name: item.name, message: String(error.stack || error), startedAt };
        manifest.failures.push(failure); manifest.cases.push({ ...failure, status: 'failed' });
        if (journey) {
          failure.jointAttempt = journey.lastJointAttempt || null;
          failure.inputReceipts = await journey.page.evaluate(() => window.__gumInputReceipts || []).catch(() => []);
          await capture(journey.page, item.name + '-failure').catch(captureError => { failure.captureError = String(captureError); });
          await closeJourney(journey).catch(closeError => { failure.closeError = String(closeError); });
        }
        console.error('FAIL Bubble Gum Builders ' + item.name + ': ' + error.message);
      }
      saveManifest();
    }
    assert.deepEqual(manifest.failures, [], 'every independent assembly, adventure and responsive journey must pass');
  } catch (error) {
    if (!manifest.failures.length) manifest.failures.push({ name: 'browser-start-or-suite', message: String(error.stack || error) });
    throw error;
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
    manifest.completedAt = new Date().toISOString(); saveManifest();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

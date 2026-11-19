/* Production-dist companion journeys. Starter choice, editing, keeping, learning,
 * profiles and preferences use actual UI controls. Later collection/stage checks
 * are explicitly labeled synthetic trusted-source receipt fixtures. No game or
 * public FG.pals interface can award those receipts. No paid provider is invoked. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { build } = require('esbuild');
const { chromium } = require('playwright');
const { start } = require('./browser-server.cjs');

const root = path.resolve(__dirname, '..');
const outputs = path.join(root, 'test-results');
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
  await page.click('#studioNavPals');
  await page.locator('#page-jems-pals').waitFor({ state: 'visible' });
  await idle(page);
}
async function chooseFamily(page, index) {
  if (!await page.locator('#studioProfileMenu').evaluate(element => element.open)) await page.click('#studioProfileMenu summary');
  await page.locator('.profile-choice:not(#adultProfileChoice)').nth(index).click();
  await page.waitForFunction(index => FG.store.current().id === `player${index + 1}` && FG.pals.view()?.owner === `player${index + 1}`, index);
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
  let browser, page, phase = 'opening the integrated app';
  const checks = [], errors = [], consoleErrors = [], paidRequests = [], fixtures = [];
  const mark = name => { checks.push(name); console.log(`PASS: ${name}`); };
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, reducedMotion: 'reduce', acceptDownloads: true });
    await context.route('**/factory-config.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 1, mode: 'unavailable' }) }));
    page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('dialog', dialog => void dialog.accept());
    page.on('request', request => { if (request.method() === 'POST' && /\/v1\/(jobs|coach)(\/|$)|api\.openai\.com/.test(request.url())) paidRequests.push(request.url()); });
    const base = `http://127.0.0.1:${server.address().port}/arcade/`;
    await page.goto(base); await ready(page);

    phase = 'choosing a starter and reloading';
    assert.equal(await page.locator('#studioNavPals').count(), 1);
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
    assert.match(await page.locator('#jemsPalDetailTitle').innerText(), /Glim/);
    assert.match(await page.locator('.pals-card[data-pal="kip"]').innerText(), /50 more gems/);
    mark('free starter, My Pals navigation, home entry and persisted collection');

    phase = 'creating, tapping, editing and keeping a Pal playground';
    await pacingFixture(page);
    await page.click('[data-pals-focus="create-glim"]');
    await page.locator('#page-creation').waitFor({ state: 'visible' });
    await selectedNav(page, 'studioNavScenes');
    const original = await scene(page), projectId = original.id;
    assert.equal(original.title, "Glim's playground");
    assert.equal(original.actors[0].assetId, 'pal-glim');
    const tapProgram = original.programs.find(program => program.trigger.type === 'tap');
    assert.deepEqual(tapProgram.actions.map(action => action.type), ['jump', 'dance', 'say']);
    assert.ok(original.programs.every(program => program.actions.every(action => action.origin === 'starter')));
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
    await set(page.locator('#creationTitle'), 'Glim and the moon potatoes');
    await page.click('#creationKeep');
    let saved = (await workspace(page)).projects.find(project => project.id === projectId);
    assert.equal(saved.keptId, saved.headId, 'Only the explicit Keep selects the saved version');
    assert.equal((await view(page)).owned[0].adventures, 0, 'Taps and free-scene play do not create adventures');
    assert.equal(await gems(page), 0);
    await noOverflow(page, 'Desktop Pal editor');
    await page.screenshot({ path: path.join(outputs, 'pals-app-playground-desktop.png'), fullPage: true });
    await page.reload(); await ready(page); await page.click('#studioNavScenes');
    await page.click(`[data-scene="${projectId}"]`);
    const reopened = await scene(page);
    assert.equal(reopened.title, 'Glim and the moon potatoes');
    assert.equal(reopened.programs.find(program => program.trigger.type === 'tap').actions[2].text, childLine);
    assert.equal(reopened.programs.find(program => program.trigger.type === 'tap').actions[2].origin, 'child');
    mark('one-click editable playground, repeated real tap events, authored edit, explicit Keep and reload');

    phase = 'adding a Pal to another scene';
    await page.click('#creationBack'); await page.click('[data-creation-starter="blank"]');
    const beforeAdd = await scene(page);
    await page.click('#creationAddPal');
    const afterAdd = await scene(page);
    assert.equal(afterAdd.actors.length, beforeAdd.actors.length + 1);
    assert.deepEqual(afterAdd.actors.slice(0, beforeAdd.actors.length), beforeAdd.actors);
    assert.deepEqual(afterAdd.programs.slice(0, beforeAdd.programs.length), beforeAdd.programs);
    assert.equal(afterAdd.actors.at(-1).assetId, 'pal-glim');
    assert.equal(afterAdd.programs.at(-1).trigger.type, 'tap');
    await page.click('#creationKeep');
    const addedProjectId = afterAdd.id;
    await noOverflow(page, 'Pal added to a free scene');
    mark('Add your Pal preserves existing scene actors and scripts');

    phase = 'real learning, delegated Pal hint and collection navigation guard';
    await pacingFixture(page); await page.click('#creationRun'); await page.click('#creationTapActor');
    await page.waitForFunction(() => FG.creation.snapshot()?.status === 'running');
    await page.click('#studioNavPowers');
    if (!await page.evaluate(() => FG.learning.active)) await page.click('#lab-next');
    await activeMath(page).waitFor({ state: 'visible' });
    const paused = await snapshot(page);
    assert.equal(paused.status, 'paused', 'Leaving the running scene for learning pauses its engine');
    await page.waitForTimeout(150); assert.equal((await snapshot(page)).timeMs, paused.timeMs);
    await page.click('#studioNavPals');
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
    await page.locator('.pals-portrait img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await page.locator('.jems-rewards-toast').waitFor({ state: 'hidden' });
    await page.locator('.pals-lead').click();
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
    await page.click('[data-starter="dragon"]');
    assert.equal(await page.locator('#studioPalCameo').isVisible(), false);
    await openPals(page);
    assert.equal((await view(page)).owned.length, 1, 'Turning off the cameo keeps the collection');
    await chooseFamily(page, 1); await openPals(page);
    assert.equal((await view(page)).owned.length, 0);
    assert.deepEqual((await view(page)).preferences, { showCompanion: true, encouragement: true });
    await page.click('[data-pals-focus="starter-kip"]');
    await page.waitForFunction(() => FG.pals.view()?.activeId === 'kip'); await idle(page);
    await page.click('#studioNavScenes');
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
    await page.click('#jemsPalsBack'); await page.click('[data-starter="dragon"]');
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
    await page.waitForFunction(() => FG.pals.view()?.owned.find(pal => pal.id === 'glim')?.stage === 3);
    const radiant = (await view(page)).owned.find(pal => pal.id === 'glim');
    assert.equal(radiant.adventures, 15); assert.equal(radiant.stageName, 'Radiant Pal');
    await page.click('[data-pals-focus="equip-kip"]');
    await page.waitForFunction(() => FG.pals.view()?.activeId === 'kip'); await idle(page);
    assert.equal((await view(page)).owned.find(pal => pal.id === 'kip').adventures, 0, 'Changing the active Pal cannot reassign old receipts');
    await page.click('[data-pals-focus="equip-glim"]');
    await page.waitForFunction(() => FG.pals.view()?.activeId === 'glim'); await idle(page);
    mark('explicit receipt fixtures verify 50/150 gem collection, Bright/Radiant growth, no spending and no replay on equip');

    phase = 'responsive integrated collection and owned-Pal picker';
    await page.locator('.pals-portrait img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await page.screenshot({ path: path.join(outputs, 'pals-app-fixture-desktop.png'), fullPage: true });
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 }); await noOverflow(page, `${width}px My Pals`);
      if (width === 390) await page.screenshot({ path: path.join(outputs, 'pals-app-fixture-mobile.png'), fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.click('#studioNavScenes');
    await selectedNav(page, 'studioNavScenes');
    assert.equal(await page.locator('[data-creation-pal]').count(), 3);
    await page.click(`[data-scene="${addedProjectId}"]`);
    const beforeKip = await scene(page);
    await page.click('#creationChoosePal');
    assert.equal(await page.locator('#creationActorDialog').isVisible(), true);
    assert.equal(await page.locator('#creationActorDialog [data-creation-asset]').count(), 3);
    await page.click('[data-creation-asset="pal-kip"]');
    const withKip = await scene(page);
    assert.equal(withKip.actors.at(-1).assetId, 'pal-kip');
    assert.deepEqual(withKip.actors.slice(0, beforeKip.actors.length), beforeKip.actors);
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
      checks, errors, consoleErrors, paidRequests, fixtures,
      observedUiLearning: { completions: 5, assistedCompletions: 1, earnedGems: 10, adventures: 1 },
      finalView: await view(page),
    }, null, 2) + '\n');
    console.log(`PASS: ${checks.length} integrated Pal browser groups.`);
  } catch (error) {
    if (page) {
      await page.screenshot({ path: path.join(outputs, 'pals-app-failure.png'), fullPage: true }).catch(() => {});
      fs.writeFileSync(path.join(outputs, 'pals-app-failure.json'), JSON.stringify({ phase, error: String(error), checks, errors, consoleErrors, paidRequests,
        state: await page.evaluate(() => ({ pals: window.FG?.pals?.view(), activeLearning: window.FG?.learning?.active, scene: window.FG?.creation?.scene(), visiblePages: [...document.querySelectorAll('main > .page')].filter(element => element.getClientRects().length).map(element => element.id) })).catch(() => null),
      }, null, 2) + '\n');
    }
    throw new Error(`Integrated Pals failed while ${phase}: ${error.stack || error}`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

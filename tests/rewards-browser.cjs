const {exploreWelcome,navigate}=require('./studio-entry.cjs');
/* Production app reward journey. Grants come only from ordinary host UI actions.
 * FG.rewards is inspected/refreshed, never given invented grants. Adult endpoints
 * are explicit local auth fixtures; this test invokes no paid provider. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { chromium } = require('playwright');
const { start } = require('./browser-server.cjs');

const FAMILY_KEY = 'family-game-factory-state-v1';
const ADULT = 'adult:12345678-1234-4123-8123-123456789abc';
const TOKEN = 'a'.repeat(43);
const PASSPHRASE = 'rewards adult fixture passphrase';
const activeMath = page => page.locator('.math-activity:visible');
const summary = page => page.evaluate(() => FG.rewards.summary());
const total = async page => (await summary(page)).lifetimeGems;
const expectTotal = (page, expected) => page.waitForFunction(async expected => (await FG.rewards.summary()).lifetimeGems === expected, expected, { polling: 100, timeout: 12000 });
const ready = page => page.waitForFunction(() => window.FG?.rewards && window.FG?.studio && window.FG?.creation);
const noOverflow = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'Application header and Rewards fit the viewport');

async function startMath(page) {
  await navigate(page,'#studioNavPowers');
  if (!await page.evaluate(() => FG.learning.active)) await page.click('#lab-next');
  await activeMath(page).waitFor({ state: 'visible' });
}
async function answerMath(page, { hint = false, wrong = false } = {}) {
  const item = await page.evaluate(() => FG.learning.activeItem);
  assert.ok(item, 'The trusted learning host supplies the actual item');
  if (hint) {
    await activeMath(page).locator('[data-action="hint"]').click();
    const back = activeMath(page).getByRole('button', { name: 'Back to my answer', exact: true });
    if (await back.isVisible()) await back.click();
  }
  if (item.answerKind === 'choice') {
    const choice = item.choices.find(choice => wrong ? choice.value !== String(item.answer) : choice.value === String(item.answer));
    assert.ok(choice, 'The reviewed item supplies an exact answer choice');
    await activeMath(page).getByRole('button', { name: choice.label, exact: true }).click();
  } else {
    const write = activeMath(page).getByRole('button', { name: 'Write an answer', exact: true });
    if (await write.isVisible()) await write.click();
    const value = wrong ? String(Number(item.answer) + 7) : String(item.answer);
    await activeMath(page).locator('.math-answer-input').fill(value);
    await activeMath(page).getByRole('button', { name: 'Check answer', exact: true }).click();
  }
  if (!wrong) await page.waitForFunction(() => !FG.learning.active);
}
async function chooseFamily(page, index) {
  if (!await page.locator('#studioProfileMenu').evaluate(element => element.open)) await page.click('#studioProfileMenu summary');
  await page.locator('.profile-choice:not(#adultProfileChoice)').nth(index).click();
  await page.waitForFunction(index => FG.store.current().id === `player${index + 1}`, index); await exploreWelcome(page);
}
async function openRewards(page) {
  await navigate(page,'#jemsRewardsWidget');
  await page.locator('#page-jems-rewards').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.getElementById('page-jems-rewards').getAttribute('aria-busy') === 'false');
}
async function answerLanguage(page) {
  const item = await page.evaluate(() => FG.learning.activeItem);
  const activity = page.locator('.language-activity:visible');
  if (item.kind === 'choice') {
    const values = await activity.locator('.language-choice').evaluateAll(elements => elements.map(element => element.dataset.value));
    const index = values.indexOf(String(item.answer));
    assert.ok(index >= 0); await activity.locator('.language-choice').nth(index).click();
  } else if (item.kind === 'edit') {
    await activity.locator('.language-edit-input').fill(String(item.answer));
    await activity.locator('.language-edit-form button[type="submit"]').click();
  } else if (item.kind === 'creative') {
    await activity.locator('.language-creative-input').fill('My imaginary rocket carries a garden to the moon.');
    await activity.locator('.language-creative-form button[type="submit"]').click();
  } else {
    const joiner = item.kind === 'sentence-tiles' ? ' ' : '';
    const find = (chosen, remaining) => {
      const value = chosen.map(index => item.tiles[index]).join(joiner);
      if (value === item.answer) return chosen;
      if (!String(item.answer).startsWith(value)) return null;
      for (const index of remaining) { const result = find([...chosen, index], remaining.filter(other => other !== index)); if (result) return result; }
      return null;
    };
    const selected = find([], item.tiles.map((_, index) => index));
    assert.ok(selected, 'The reviewed tile item has an exact constructible answer');
    for (const index of selected) await activity.locator(`[data-tile="${index}"]`).click();
    await activity.locator('[data-action="check-tiles"]').click();
  }
  await page.waitForFunction(() => !FG.learning.active);
}

async function installAuthFixture(context) {
  let authorized = false;
  await context.route('**/factory-config.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 1, mode: 'remote', apiBaseUrl: 'https://rewards-adult.test', previewOrigin: 'https://rewards-preview.test' }) }));
  await context.route('https://rewards-adult.test/**', async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    const proof = request.headers()['x-factory-adult-session'];
    const headers = { 'access-control-allow-origin': request.headers().origin || '*', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'Content-Type,X-Factory-Request,X-Factory-Adult-Session', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
    const send = (body, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
    if (request.method() === 'OPTIONS') return send({});
    const active = authorized && proof === TOKEN;
    if (pathname === '/v1/sessions/status') return send({ connected: true, trusted: true, deviceName: 'Rewards browser fixture', adultPilot: { enabled: true, eligible: true, active, profileId: active ? ADULT : null, expiresAt: active ? Date.now() + 3600000 : null } });
    if (pathname === '/v1/sessions/adult/unlock') {
      if (JSON.parse(request.postData()).parentPassphrase !== PASSPHRASE) return send({ errorCode: 'FORBIDDEN' }, 403);
      authorized = true; return send({ active: true, profileId: ADULT, sessionToken: TOKEN, expiresAt: Date.now() + 3600000 });
    }
    if (pathname === '/v1/sessions/adult/lock') { authorized = false; return send({ active: false }); }
    if (pathname === '/v1/coach/status' || pathname === '/v1/coach/audio/status') return send({ available: false, mode: 'unavailable' });
    if (pathname === '/v1/builder/status') return send({ available: false });
    if (pathname === '/v1/creations') return send([]);
    return send({ errorCode: 'UNAVAILABLE' }, 404);
  });
}

(async () => {
  const server = start(); if (!server.listening) await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
  // Normal contexts also exercise the app's guarded offline initialization.
  // Playwright's blocking shim itself throws in no-same-origin scene previews.
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true });
  await installAuthFixture(context);
  await context.addInitScript(() => {
    window.rewardToastMessages = [];
    const seen = new WeakSet();
    new MutationObserver(records => {
      for (const record of records) for (const added of record.addedNodes) {
        if (!(added instanceof Element)) continue;
        const toasts = [...added.querySelectorAll('.jems-rewards-toast')];
        if (added.matches('.jems-rewards-toast')) toasts.push(added);
        for (const toast of toasts) if (!seen.has(toast)) { seen.add(toast); window.rewardToastMessages.push(toast.textContent); }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  const page = await context.newPage(), errors = [], paid = [], dialogs = [];
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => { dialogs.push({ type: dialog.type(), message: dialog.message() }); void dialog.accept(); });
  page.on('request', request => { if (request.method() === 'POST' && /\/v1\/(jobs|coach)(\/|$)/.test(request.url())) paid.push(request.url()); });
  fs.mkdirSync('test-results', { recursive: true });
  const base = `http://127.0.0.1:${server.address().port}/arcade/`;
  try {
    await page.goto(base); await ready(page); await exploreWelcome(page); await expectTotal(page, 0);
    await openRewards(page);
    assert.equal(await page.locator('#jemsRewardsTotal').textContent(), '0');
    assert.equal(await page.locator('#jemsRewardsMakerName').textContent(), 'Ready to create');
    assert.deepEqual(await page.evaluate(() => window.rewardToastMessages), [], 'Opening rewards cannot earn or replay anything');
    for (const width of [1400, 768, 390, 320]) { await page.setViewportSize({ width, height: 1000 }); await noOverflow(page); }
    await page.setViewportSize({ width: 1400, height: 1000 });

    // The first visit has already saved a character. Rewards opens that owner's
    // Journey; changing the choice remains an explicit action without credit.
    await page.click('#jemsRewardsMakerAction');
    await page.locator('#page-jems-journey').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#jemsCharacterDialog').isVisible(), false);
    assert.equal(await page.evaluate(() => FG.studio.exportNotebook().avatars[FG.store.current().id]), 'spark');
    await page.click('#jemsChangeCharacter');
    await page.locator('#jemsCharacterDialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-journey-character]').count(), 2);
    await page.keyboard.press('Escape');
    await openRewards(page);
    const sessionsBeforeMaking = await page.evaluate(() => FG.studio.exportNotebook().sessions.length);
    await page.click('[data-reward-activity="making"]');
    await page.locator('#page-studio').waitFor({ state: 'visible' });
    const madeIdea = await page.evaluate(() => {
      const notebook = FG.studio.exportNotebook();
      return { count: notebook.sessions.length, session: notebook.sessions.find(session => session.id === notebook.active[FG.store.current().id]) };
    });
    assert.equal(madeIdea.count, sessionsBeforeMaking + 1);
    assert.equal(madeIdea.session.game, 'new', 'Your own game opens a new saved idea');
    await expectTotal(page, 0);

    await page.locator('footer [data-page="parent"]').click(); await page.locator('[data-parent-tab="settings"]').click();
    await page.selectOption('#parentSubject', 'math'); await page.click('#saveParent');
    await openRewards(page);
    const lockedSettings = await page.evaluate(() => ({ subject: FG.store.current().learningSubject, switchAllowed: FG.store.current().allowSubjectSwitch }));
    await page.click('[data-reward-activity="language"]');
    assert.match(await page.locator('#studioGlobalStatus').textContent(), /grown-up.*enable both subjects/i);
    assert.equal(await page.locator('#studioGlobalStatus').getAttribute('role'), 'alert');
    assert.equal(await page.locator('#page-jems-rewards').isVisible(), true, 'A locked subject does not navigate away');
    assert.deepEqual(await page.evaluate(() => ({ subject: FG.store.current().learningSubject, switchAllowed: FG.store.current().allowSubjectSwitch })), lockedSettings, 'Rewards cannot change the parent subject lock');
    assert.equal(await page.evaluate(() => FG.learning.subject), 'math');
    await expectTotal(page, 0);
    await page.click('[data-reward-activity="math"]');
    await activeMath(page).waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => FG.learning.subject), 'math', 'The permitted current subject opens even when switching is locked');
    assert.deepEqual(await page.evaluate(() => ({ subject: FG.store.current().learningSubject, switchAllowed: FG.store.current().allowSubjectSwitch })), lockedSettings);

    // Viewing, an accepted wrong response, a hint and a revealed solution are not completion grants.
    const shownId = await page.evaluate(() => FG.learning.activeAttemptId);
    await answerMath(page, { wrong: true });
    await page.evaluate(() => FG.rewards.refresh()); assert.equal(await total(page), 0);
    await activeMath(page).locator('[data-action="show-solution"]').click();
    await activeMath(page).locator('[data-action="continue-supported"]').click();
    await page.waitForFunction(() => !FG.learning.active);
    await page.evaluate(() => FG.rewards.refresh()); assert.equal(await total(page), 0);
    assert.equal(await page.evaluate(id => FG.store.current().learning.attempts.find(attempt => attempt.id === id).outcome, shownId), 'shown');

    await page.click('#lab-next'); const helpedId = await page.evaluate(() => FG.learning.activeAttemptId);
    await answerMath(page, { hint: true }); await expectTotal(page, 2);
    const helped = await page.evaluate(id => FG.store.current().learning.attempts.find(attempt => attempt.id === id), helpedId);
    assert.equal(helped.independent, false, 'A reward never upgrades assisted evidence to independence');
    assert.equal(helped.outcome, 'completed');
    await page.locator('.jems-rewards-toast').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.jems-rewards-toast').evaluate(element => getComputedStyle(element).pointerEvents), 'none');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'lab-next', 'Reward popup preserves the learning continuation focus');
    await page.screenshot({ path: 'test-results/rewards-app-toast.png' });
    for (let completed = 2; completed <= 10; completed++) {
      await page.click('#lab-next'); await answerMath(page);
      await expectTotal(page, completed * 2 + (completed === 10 ? 10 : 0));
    }
    let earned = await summary(page);
    assert.equal(earned.counts.math, 10); assert.equal(earned.practiceCount, 10);
    assert.equal(earned.recentGrants.filter(grant => grant.kind === 'practice.milestone').length, 1);
    const afterPractice = JSON.stringify(earned);
    await page.evaluate(async () => { await FG.rewards.refresh({ celebrate: true }); await FG.rewards.refresh({ celebrate: true }); });
    assert.equal(JSON.stringify(await summary(page)), afterPractice, 'Repeated projection cannot mint duplicate gems');
    await page.reload(); await ready(page); await expectTotal(page, 30);
    assert.deepEqual(await page.evaluate(() => window.rewardToastMessages), [], 'Reload does not replay earned popups');

    // Each family profile earns through the same host, with a separate total and history.
    await chooseFamily(page, 1); await expectTotal(page, 0); await startMath(page); await answerMath(page); await expectTotal(page, 2);
    await chooseFamily(page, 0); await expectTotal(page, 30);
    await openRewards(page); assert.equal(await page.locator('#jemsRewardsTotal').textContent(), '30');
    await page.click('#jemsRewardsBack');

    // The parent permits both subjects; the Rewards language route chooses the
    // exact subject without changing that permission, then earns a real grant.
    await page.locator('footer [data-page="parent"]').click(); await page.locator('[data-parent-tab="settings"]').click();
    await page.selectOption('#parentSubject', 'both'); await page.click('#saveParent');
    await openRewards(page); await page.click('[data-reward-activity="language"]');
    assert.equal(await page.evaluate(() => FG.learning.subject), 'language');
    assert.equal(await page.evaluate(() => FG.store.current().allowSubjectSwitch), true);
    if (!await page.evaluate(() => FG.learning.active)) await page.click('#lab-next');
    await page.locator('.language-activity:visible').waitFor();
    await answerLanguage(page); await expectTotal(page, 32);
    assert.equal((await summary(page)).counts.language, 1);
    await page.locator('footer [data-page="parent"]').click(); await page.locator('[data-parent-tab="settings"]').click();
    await page.selectOption('#parentSubject', 'math'); await page.click('#saveParent');
    await page.click('#studioNavHome');

    // Real local game development: intent, an actual test, linked reflection and explicit Keep.
    await page.evaluate(() => { FG.store.changeProfile({ rate: 1 }); FG.store.current().mathWindow = [Date.now()]; if (!FG.store.save()) throw Error('Test pacing fixture did not save'); });
    await page.click('[data-starter="gum"]'); await page.click('#studioChange');
    await page.fill('#studioPrompt', 'Give me 2 extra stickers'); await page.click('#studioSend');
    await page.waitForFunction(() => FG.studio.exportNotebook().sessions.some(session => session.game === 'gum' && session.candidate));
    await expectTotal(page, 37);
    for (let index = 0; index < 3; index++) { await page.locator('.gum-sticker').nth(index).click(); await page.locator('.gum-slot').nth(index).click(); }
    await page.click('.gum-launch');
    await page.waitForFunction(() => FG.studio.exportNotebook().sessions.some(session => session.reflection));
    await page.click('#studioChange'); await page.click('#studioReflectAnswer');
    await page.fill('#studioPrompt', 'The extra sticker choices made my rocket more colorful.'); await page.click('#studioSend');
    await expectTotal(page, 47);
    await page.click('#studioKeep'); await expectTotal(page, 92);
    assert.equal((await summary(page)).counts.making, 1, 'A developed project is counted once');
    await page.evaluate(() => FG.rewards.refresh({ celebrate: true })); await expectTotal(page, 92);
    await openRewards(page);
    assert.equal(await page.locator('#jemsRewardsMakerName').textContent(), 'Gem Polisher');
    await page.locator('.jems-rewards-toast').waitFor({ state: 'hidden' });
    await page.screenshot({ path: 'test-results/rewards-app-desktop-settled.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); await noOverflow(page);
    await page.screenshot({ path: 'test-results/rewards-app-mobile-settled.png', fullPage: true });
    await page.setViewportSize({ width: 1400, height: 1000 });

    // Solve one actual rebuilt scene using the visible block editor; a repeat check pays no extra.
    await page.click('[data-reward-activity="coding"]');
    await page.locator('#creationChallengeShelf').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#creationChallengeMode').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#creationFreeShelf').isVisible(), false, 'Coding rewards opens challenges directly');
    await page.click('[data-challenge="robot-taps"]');
    await page.click('#creationFullMode');
    await page.getByRole('combobox', { name: 'When', exact: true }).selectOption('tap');
    await page.click('[data-add-block="move"]');
    const scene = await page.evaluate(() => FG.creation.scene());
    const moveId = scene.programs[0].actions[0].id;
    const move = page.locator(`[data-block-id="${moveId}"]`);
    await move.getByRole('spinbutton', { name: 'right / left', exact: true }).fill('120');
    await move.getByRole('spinbutton', { name: 'seconds', exact: true }).fill('0.4');
    await move.getByRole('spinbutton', { name: 'seconds', exact: true }).press('Tab');
    await page.click('#creationCheck'); await expectTotal(page, 100);
    await page.click('#creationCheck'); await page.evaluate(() => FG.rewards.refresh()); await expectTotal(page, 100);
    assert.equal((await summary(page)).counts.coding, 1);

    // Parent UI exports the actual ledger; restoring it twice remains idempotent.
    await page.click('#creationHome');
    await page.locator('footer [data-page="parent"]').click(); await page.locator('[data-parent-tab="settings"]').click();
    const downloadPromise = page.waitForEvent('download'); await page.click('#exportData');
    const download = await downloadPromise, backupPath = path.resolve('test-results/rewards-family-backup.json');
    await download.saveAs(backupPath);
    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    const rewardBackup = backup.factoryRewards;
    assert.ok(rewardBackup, 'The family backup includes its durable reward ledger');
    assert.equal(rewardBackup.schema, 'jems.rewards.backup.v1');
    assert.equal(rewardBackup.data.profiles.find(profile => profile.owner === 'player1').receipts.reduce((sum, receipt) => sum + receipt.amount, 0), 100);
    assert.equal(rewardBackup.data.profiles.some(profile => profile.owner.startsWith('adult:')), false);
    for (let copy = 0; copy < 2; copy++) {
      await page.locator('footer [data-page="parent"]').click(); await page.locator('[data-parent-tab="settings"]').click();
      const reloaded = page.waitForNavigation({ waitUntil: 'load' });
      const restored = page.waitForEvent('dialog', { predicate: dialog => dialog.type() === 'alert' && /restored successfully/i.test(dialog.message()) });
      await page.locator('#importData').setInputFiles(backupPath); await restored;
      await reloaded; await ready(page);
      await page.evaluate(() => FG.rewards.refresh()); await expectTotal(page, 100);
      assert.deepEqual(await page.evaluate(() => window.rewardToastMessages), [], 'Restoring saved receipts does not replay earned popups');
    }

    // Adult authorization is exercised through the real dialog; reward namespaces stay separate.
    if (!await page.locator('#studioProfileMenu').evaluate(element => element.open)) await page.click('#studioProfileMenu summary');
    await page.click('#adultProfileChoice'); await page.fill('#adultProfilePassphrase', PASSPHRASE); await page.click('#adultProfileSubmit');
    await page.waitForFunction(id => FG.store.current().id === id, ADULT); await expectTotal(page, 0); await exploreWelcome(page);
    await startMath(page); await answerMath(page); await expectTotal(page, 2);
    await chooseFamily(page, 0); await expectTotal(page, 100);
    await page.locator('footer [data-page="parent"]').click(); await page.locator('[data-parent-tab="settings"]').click();
    const afterAdultDownload = page.waitForEvent('download'); await page.click('#exportData');
    const afterAdultPath = path.resolve('test-results/rewards-family-after-adult.json');
    await (await afterAdultDownload).saveAs(afterAdultPath);
    const familyAfterAdult = JSON.parse(fs.readFileSync(afterAdultPath, 'utf8'));
    assert.equal(familyAfterAdult.factoryRewards.data.profiles.some(profile => profile.owner.startsWith('adult:')), false, 'A family export excludes an adult ledger that actually contains earned rewards');
    assert.equal(JSON.stringify(familyAfterAdult).includes(ADULT), false, 'Family backup domains do not include the authenticated adult profile');
    await page.reload(); await ready(page); assert.equal(await page.evaluate(() => FG.store.current().id), 'player1'); await expectTotal(page, 100);

    // A rejected source write cannot make a reward durable or claim one in a popup.
    await startMath(page);
    await page.evaluate(key => {
      window.originalRewardsStorageSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('Synthetic storage failure', 'QuotaExceededError'); return window.originalRewardsStorageSet.call(this, name, value); };
      window.rewardToastMessages = [];
    }, FAMILY_KEY);
    await answerMath(page);
    await page.locator('.learning-save-warning:visible').first().waitFor();
    await page.evaluate(() => FG.rewards.refresh());
    assert.equal(await total(page), 100, 'An unsaved answer cannot award gems');
    assert.deepEqual(await page.evaluate(() => window.rewardToastMessages), []);
    await page.evaluate(() => Storage.prototype.setItem = window.originalRewardsStorageSet);
    await page.reload(); await ready(page); await expectTotal(page, 100);

    // The legacy host still participates in the same reward ledger without an alternate award path.
    await page.goto(base + '?arcade=1'); await page.waitForFunction(() => window.FG?.rewards && window.FG?.learning);
    assert.equal(await total(page), 100);
    await page.getByRole('navigation').getByRole('button', { name: 'My Powers', exact: true }).click();
    await answerMath(page); await expectTotal(page, 102);

    // A second real tab cannot write over the active tab. Taking over reloads its
    // stale in-memory profile before the child can resume ordinary activity.
    const second = await context.newPage(); second.setDefaultTimeout(12000);
    second.on('pageerror', error => errors.push(error.message));
    second.on('dialog', dialog => { dialogs.push({ type: dialog.type(), message: dialog.message() }); void dialog.accept(); });
    second.on('request', request => { if (request.method() === 'POST' && /\/v1\/(jobs|coach)(\/|$)/.test(request.url())) paid.push(request.url()); });
    await second.goto(base); await second.waitForFunction(() => window.FG?.store);
    await second.locator('#jemsWriterNotice').waitFor({ state: 'visible' });
    assert.ok(await second.locator('main').evaluate(element => !!element.closest('[inert]')), 'The paused tab cannot accept learning or creation input');
    assert.equal(await second.evaluate(() => document.activeElement.id), 'jemsWriterRetry');
    const staleAttemptCount = await second.evaluate(() => FG.store.current().learning.attempts.length);
    const pausedTotal = await total(page);
    await second.click('#jemsWriterRetry');
    assert.equal(await second.evaluate(() => !!FG.rewards), false, 'The paused tab never installs a reward projector');
    assert.equal(await total(page), pausedTotal, 'Retrying while the first tab owns saving cannot add rewards');
    assert.deepEqual(await second.evaluate(() => window.rewardToastMessages), [], 'A paused tab cannot celebrate a grant');
    await second.locator('#jemsWriterNotice').waitFor({ state: 'visible' });
    const oldDocument = await second.evaluate(() => window.rewardsDocumentMarker = 'paused-document');
    assert.equal(oldDocument, 'paused-document');
    await page.click('#lab-next');
    const newerAttempt = await page.evaluate(() => FG.learning.activeAttemptId);
    await answerMath(page); await expectTotal(page, 104);
    assert.equal(await second.evaluate(() => FG.store.current().learning.attempts.length), staleAttemptCount, 'The waiting document really holds an older profile');
    await page.close();
    await Promise.all([second.waitForNavigation({ waitUntil: 'load' }), second.click('#jemsWriterRetry')]);
    await ready(second); await expectTotal(second, 104);
    assert.equal(await second.evaluate(() => window.rewardsDocumentMarker), undefined, 'Lock takeover reloads the stale document');
    assert.equal(await second.locator('#jemsWriterNotice').count(), 0);
    assert.equal(await second.locator('main').evaluate(element => !!element.closest('[inert]')), false);
    assert.equal(await second.evaluate(id => FG.store.current().learning.attempts.some(attempt => attempt.id === id && attempt.outcome === 'completed'), newerAttempt), true, 'The takeover preserves the first tab’s last completed evidence');
    await startMath(second); await answerMath(second); await expectTotal(second, 106);
    assert.deepEqual(errors, []); assert.deepEqual(paid, [], 'The reward journey does not request paid generation or coaching');
    console.log('PASS: full app rewards from Math/English/making/coding, assisted evidence, no shown/duplicate credit, reload, profile/adult isolation, parent backup/restore, source-save failure, legacy host, two-tab save ownership and responsive navigation.');
  } catch (error) {
    console.error('Rewards browser failure before capture:', error);
    if (dialogs.length) console.error('Recent application dialogs:', JSON.stringify(dialogs.slice(-3)));
    await context.pages().at(-1)?.screenshot({ path: 'test-results/rewards-app-failure.png', fullPage: true, timeout: 5000 }).catch(() => {});
    throw error;
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

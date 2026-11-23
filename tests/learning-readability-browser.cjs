/* Actual production Studio routes and native host wrappers. The checkpoint
 * event and expired pacing window are explicit local fixtures; no model,
 * provider, real-child or physical-device acceptance is claimed. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { start } = require('./browser-server.cjs');
const { exploreWelcome, navigate } = require('./studio-entry.cjs');
const { assertTextContrast } = require('./helpers/text-contrast.cjs');
const { buildAndRide } = require('./bubble-gum-fixture.cjs');

const devices = [['desktop', { width: 1280, height: 960 }], ['phone', { width: 390, height: 844 }]];
const language = '#stage-overlay .language-activity';
const math = '#stage-overlay .math-activity';

async function inspectActivity(page, selector, label) {
  await page.locator(selector).waitFor({ state: 'visible' });
  const details = await page.locator(selector).evaluate(root => {
    const box = root.getBoundingClientRect();
    const small = [...root.querySelectorAll('h2, h3, button, label, p, output, figcaption')]
      .filter(node => node.getClientRects().length && node.textContent.trim() && getComputedStyle(node).visibility === 'visible')
      .filter(node => parseFloat(getComputedStyle(node).fontSize) < (node.tagName === 'H2' ? 22 : 18))
      .map(node => ({ text: node.textContent.trim().slice(0, 80), size: getComputedStyle(node).fontSize }));
    return { small, left: box.left, right: box.right, width: innerWidth,
      overflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  assert.deepEqual(details.small, [], `${label}: visible task text keeps its child-readable size`);
  assert.ok(details.left >= -1 && details.right <= details.width + 1, `${label}: activity fits the viewport`);
  assert.equal(details.overflow, false, `${label}: no horizontal page overflow`);
  await assertTextContrast(page, `${selector} h2`, `${label} question`);
  await assertTextContrast(page, `${selector} button:not(:disabled)`, `${label} active controls`);
  const copy = await page.locator(selector).innerText();
  assert.doesNotMatch(copy, /LANGUAGE QUEST|MATH MISSION|Think it through|Take your time|Reading support is recorded|Grade 1 [·•]/,
    `${label}: optional metadata and generic encouragement do not precede the task`);
}

async function chooseSubject(page, subject) {
  await navigate(page, '#studioMenuParent');
  await page.locator('[data-parent-tab="settings"]').click();
  await page.selectOption('#parentGrade', '1');
  await page.selectOption('#parentSubject', subject);
  await page.selectOption('#parentIntensity', 'gentle');
  await page.uncheck('#parentHint');
  if (subject === 'language') await page.selectOption('#parentLanguageSkill', 'g1-cvc-patterns');
  else await page.selectOption('#parentSkill', 'g1-add-20');
  await page.click('#saveParent');
  assert.equal(await page.evaluate(() => FG.learning.subject), subject);
  await navigate(page, '#studioNavHome');
}

async function openWorkshop(page) {
  await page.locator('[data-starter="gum"]').click();
  await page.locator('.studio-native-game .gum-builder').waitFor({ state: 'visible' });
}

async function checkpointFixture(page) {
  // Use the installed game's existing safe-event path. The real host performs
  // pause, policy selection, semantic wrapper creation and evidence recording.
  // Freeze only synchronous content randomness to recreate the reported CVC item.
  await page.evaluate(() => {
    const random = Math.random;
    try {
      Math.random = () => 0;
      window.dispatchEvent(new CustomEvent('factory-game-event', { detail: { type: 'checkpoint', game: 'gum' } }));
    } finally { Math.random = random; }
  });
  await page.waitForFunction(() => FG.learning.active);
  assert.equal(await page.locator('#game-mount').evaluate(node => node.inert), true, 'the actual game is inert during its checkpoint');
  assert.equal(await page.locator('#native-learning-activity').getAttribute('class'), 'learning-modal-card',
    'the real host uses a learning surface, not the dark result-card class');
  assert.equal(await page.locator('#native-learning-activity.modal-card').count(), 0);
}

async function finishWithHelp(page, selector) {
  await page.locator(`${selector} [data-action="show-solution"]`).click();
  await page.locator(`${selector} [data-action="continue-supported"]`).click();
  await page.waitForFunction(() => !FG.learning.active);
}

async function journey(browser, base, device, viewport) {
  const context = await browser.newContext({ viewport, hasTouch: device === 'phone', reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [], posts = [];
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
  page.on('dialog', dialog => void dialog.accept());
  await page.route('**/factory-config.json', route => route.fulfill({
    contentType: 'application/json', body: '{"version":1,"mode":"unavailable"}',
  }));
  try {
    await page.goto(base);
    await page.waitForFunction(() => FG?.studio && FG?.learning);
    await exploreWelcome(page);
    await chooseSubject(page, 'language');
    await openWorkshop(page);
    await checkpointFixture(page);
    assert.equal(await page.locator(`${language} h2`).textContent(),
      'Which word has three letters: consonant, vowel, consonant?');
    await inspectActivity(page, language, `${device} native English`);
    const exit = page.locator(`${language} [data-action="leave-game"]`);
    assert.equal(await exit.isVisible(), true, 'native English has a visible exit before an answer');
    const exitBounds = await exit.boundingBox();
    assert.ok(exitBounds.y >= 0 && exitBounds.y + exitBounds.height <= viewport.height, 'the initial exit is in view');
    await page.screenshot({ path: `test-results/learning-readable-native-language-${device}.png`, fullPage: false });
    const attempt = await page.evaluate(() => FG.learning.activeAttemptId);
    await page.locator(`${language} [data-action="hint"]`).click();
    await assertTextContrast(page, `${language} .language-hint h3, ${language} .language-hint p`, `${device} English hint`);
    await page.screenshot({ path: `test-results/learning-readable-language-hint-${device}.png`, fullPage: false });
    await exit.scrollIntoViewIfNeeded();
    assert.equal(await exit.evaluate(button => {
      const rect = button.getBoundingClientRect(), hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit === button || button.contains(hit);
    }), true, 'the learning exit stays reachable after scrolling through help');
    await exit.click();
    assert.equal(await page.evaluate(() => FG.learning.active), false);
    assert.equal(await page.locator('#stage-overlay').isVisible(), false, 'leaving closes the native checkpoint');
    assert.equal(await page.locator('.gum-builder').count(), 0, 'leaving unmounts the native game instead of resuming it');
    const interrupted = await page.evaluate(id => FG.store.current().language.attempts.find(entry => entry.id === id), attempt);
    assert.equal(interrupted.outcome, 'interrupted');
    assert.equal(interrupted.answers.length, 0);
    assert.equal(interrupted.hintDepth, 1, 'requested help remains recorded after leaving');
    assert.equal(await page.evaluate(() => FG.store.current().language.totals.independent), 0);

    await navigate(page, '#studioNavPowers');
    await inspectActivity(page, '#lab-question .language-activity', `${device} English practice`);
    await page.screenshot({ path: `test-results/learning-readable-practice-language-${device}.png`, fullPage: false });
    // This patch changes presentation, not the existing optional-practice policy.
    await finishWithHelp(page, '#lab-question .language-activity');
    await chooseSubject(page, 'math');
    // Expire the existing shared pacing receipt explicitly for the next local fixture.
    await page.clock.install();
    await page.clock.setSystemTime(new Date(await page.evaluate(() => Date.now() + 610000)));
    await openWorkshop(page);
    await checkpointFixture(page);
    await inspectActivity(page, math, `${device} native Math`);
    await page.locator(`${math} [data-action="hint"]`).click();
    await assertTextContrast(page, `${math} .math-hint h3, ${math} .math-hint p`, `${device} Math hint`);
    await page.screenshot({ path: `test-results/learning-readable-native-math-${device}.png`, fullPage: false });
    await finishWithHelp(page, math);
    assert.equal(await page.locator('#game-mount').evaluate(node => node.inert), false, 'supported completion resumes the same game');

    // Complete the actual default assembly and its full adventure to exercise
    // the separate dark result through the ordinary explicit finish control.
    await buildAndRide(page, { touch: device === 'phone', clockInstalled: true });
    await page.locator('#native-result-title').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#native-result-title').evaluate(node => node.parentElement.className), 'modal-card');
    await assertTextContrast(page, '#native-result-title', `${device} actual dark result title`);
    await page.screenshot({ path: `test-results/learning-readable-native-result-${device}.png`, fullPage: false });
    assert.deepEqual(errors, [], `${device}: no browser errors`);
    assert.deepEqual(posts, [], `${device}: no provider requests`);
    console.log(`PASS ${device}: actual native English and Math, hints, practice, interruption and dark result remain readable`);
  } catch (error) {
    await page.screenshot({ path: `test-results/learning-readable-${device}-failure.png`, fullPage: false, timeout: 5000 }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}

(async () => {
  fs.mkdirSync('test-results', { recursive: true });
  const server = start();
  await new Promise(resolve => server.once('listening', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox'] });
    for (const [device, viewport] of devices) await journey(browser, `http://127.0.0.1:${server.address().port}/`, device, viewport);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });

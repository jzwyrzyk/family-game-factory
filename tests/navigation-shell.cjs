/* Exercise the actual compact navigation and its existing guarded routes.
 * Synthetic browser-local work only; config is unavailable and no builds run. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { start } = require('./browser-server.cjs');
const { waitForWelcome, exploreWelcome, navigate, openProfiles } = require('./studio-entry.cjs');

const NOTEBOOK = 'family-game-factory-studio-v1';
const SECONDARY = [
  'studioNavNotifications', 'studioNavScenes', 'studioNavJourney', 'studioNavRewards',
  'studioNavPals', 'studioNavPowers', 'studioNavProblemSolving',
];

async function open(browser, base, viewport) {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 800, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [], posts = [];
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
  await page.route('**/factory-config.json', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ version: 1, mode: 'unavailable' }),
  }));
  await page.goto(base);
  await page.waitForFunction(() => window.FG?.studio && document.getElementById('studioNavMenu'));
  await waitForWelcome(page);
  return { context, page, errors, posts };
}

async function drawer(page) {
  await page.locator('#studioNavMenu').click();
  await page.locator('#studioMenuDialog').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#studioNavMenu').getAttribute('aria-expanded'), 'true');
}

async function menuGeometry(page, viewport) {
  const geometry = await page.evaluate(() => {
    const dialog = document.getElementById('studioMenuDialog');
    const rect = dialog.getBoundingClientRect();
    return {
      left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      controls: [...dialog.querySelectorAll('button')]
        .filter(element => element.getClientRects().length > 0)
        .map(element => ({ id: element.id, height: element.getBoundingClientRect().height,
          width: element.getBoundingClientRect().width, font: parseFloat(getComputedStyle(element).fontSize) })),
    };
  });
  assert.ok(geometry.left >= -1 && geometry.right <= viewport.width + 1, 'drawer fits the horizontal viewport');
  assert.ok(geometry.top >= -1 && geometry.bottom <= viewport.height + 1, 'drawer fits the visible height and scrolls within it');
  assert.equal(geometry.overflow, false, 'the menu creates no horizontal overflow');
  for (const control of geometry.controls) {
    assert.ok(control.height >= 44 && control.width >= 44, `${control.id} remains a complete touch target`);
    assert.ok(control.font >= 16, `${control.id} keeps readable menu text`);
  }
}

async function shellJourney(browser, base, viewport) {
  const { context, page, errors, posts } = await open(browser, base, viewport);
  try {
    // Parents can find session access before character selection. This must not
    // reveal a play-first shortcut or imply that opening a menu grants access.
    await page.locator('#studioWelcome').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#studioNavHome').isVisible(), false);
    assert.equal(await page.locator('#studioNavCreate').isVisible(), false);
    await page.locator('#studioProfileMenu summary').click();
    const choices = await page.locator('#studioProfileMenu .profile-choices').boundingBox();
    assert.ok(choices && choices.x >= 0 && choices.x + choices.width <= viewport.width + 1,
      'first-visit profile choices remain inside the viewport beside Menu');
    await page.locator('#studioProfileMenu summary').click();
    await drawer(page);
    assert.equal(await page.locator('#studioMenuParentSession').isVisible(), true);
    assert.equal(await page.locator('#studioMenuParent').isVisible(), true);
    assert.equal(await page.locator('#studioMenuCreate').isVisible(), false);
    await menuGeometry(page, viewport);
    await page.keyboard.press('Escape');
    await page.locator('#studioMenuDialog').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'studioNavMenu', 'Escape returns focus to Menu');
    assert.equal(await page.locator('#studioNavMenu').getAttribute('aria-expanded'), 'false');
    await exploreWelcome(page);

    const primary = page.locator('.studio-shell-navigation > button');
    assert.deepEqual(await primary.evaluateAll(buttons => buttons.filter(button => button.getClientRects().length).map(button => button.id)),
      ['studioNavHome', 'studioNavCreate', 'studioNavMenu'], 'only three primary navigation controls are shown');
    for (const id of SECONDARY) {
      assert.equal(await page.locator('#' + id).count(), 1, `${id} retains a single authoritative control`);
      assert.equal(await page.locator('#' + id).isVisible(), false, `${id} is out of the crowded header`);
    }
    if (viewport.width <= 760) {
      const bounds = await page.locator('.studio-shell-navigation').boundingBox();
      assert.ok(bounds && bounds.y + bounds.height <= viewport.height + 1 && bounds.y > viewport.height - 100,
        'ordinary phone screens keep the three navigation actions in the bottom dock');
    }
    await page.locator('#studioProfileMenu summary').click();
    assert.equal(await page.locator('#studioProfileMenu').evaluate(element => element.open), true,
      'the compact navigation never obstructs the profile control');
    await page.locator('#studioProfileMenu summary').click();

    await drawer(page);
    for (const id of SECONDARY) assert.equal(await page.locator('#' + id).isVisible(), true, `${id} is discoverable in Menu`);
    assert.equal(await page.locator('#studioMenuArt').isVisible(), true);
    assert.equal(await page.locator('#studioJourneyHelp').isVisible(), true);
    assert.equal(await page.locator('#jemsRewardsWidget').isVisible(), true);
    await menuGeometry(page, viewport);
    // Native modal focus stays inside the menu in both directions.
    await page.locator('#studioMenuClose').focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'studioJourneyHelp');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'studioMenuClose');
    await page.keyboard.press('Escape');
    await drawer(page);
    await page.screenshot({ path: `test-results/navigation-menu-${viewport.width}.png`, fullPage: false });

    for (const [id, target] of [
      ['studioNavNotifications', '#studioNotifications'],
      ['studioNavJourney', '#page-jems-journey'],
      ['studioNavRewards', '#page-jems-rewards'],
      ['studioNavPals', '#page-jems-pals'],
      ['studioNavScenes', '#page-creation'],
      ['studioMenuArt', '#page-art-studio'],
      ['studioNavProblemSolving', '#page-problem-solving'],
    ]) {
      await navigate(page, '#' + id);
      await page.locator(target).waitFor({ state: 'visible' });
      assert.equal(await page.locator('#studioMenuDialog').isVisible(), false, `${id} closes the menu before navigating`);
      if (id.startsWith('studioNav')) {
        assert.equal(await page.locator('#' + id).getAttribute('aria-current'), 'page', `${id} retains current-route semantics`);
        assert.equal(await page.locator('#studioNavMenu').getAttribute('data-current-destination'), id);
      }
    }
    await navigate(page, '#studioMenuParent');
    await page.locator('#page-parent').waitFor({ state: 'visible' });
    await navigate(page, '#studioNavHome');
    await page.locator('[data-starter="factory"]').click();
    await page.waitForFunction(() => window.FG.runtime.snapshot()?.config.orderSize === 3);
    assert.equal(await page.locator('.site-header').isVisible(), false, 'active play replaces duplicate global navigation');
    assert.equal(await page.locator('#studioHome').isVisible(), true, 'the game retains a visible My Games exit');
    await openProfiles(page);
    assert.equal(await page.locator('#studioProfileMenu').evaluate(element => !!element.closest('#studioMore')), true,
      'the original profile picker remains available inside More');
    await page.locator('#studioProfileMenu > summary').click();
    await page.locator('#studioMore > summary').click();
    await navigate(page, '#studioNavHome');
    assert.equal(await page.locator('.site-header').isVisible(), true, 'leaving play restores the ordinary header');
    assert.equal(await page.locator('#studioProfileMenu').evaluate(element => !!element.closest('.site-header')), true,
      'leaving play restores the same profile picker to the header');
    assert.deepEqual(errors, [], 'no runtime errors while navigating real pages');
    assert.deepEqual(posts, [], 'navigation and choosing a character never submit a build');
    console.log(`PASS compact navigation ${viewport.width}px: parent entry before onboarding, three primary controls, drawer keyboard/touch layout, existing destinations and game-safe placement`);
  } catch (error) {
    await page.screenshot({ path: `test-results/navigation-shell-${viewport.width}-failure.png`, fullPage: false, timeout: 5000 }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}

async function saveGuardJourney(browser, base) {
  const { context, page, errors, posts } = await open(browser, base, { width: 390, height: 844 });
  try {
    await exploreWelcome(page);
    await navigate(page, '#studioNavCreate');
    await page.fill('#studioPrompt', 'Fixture: a little leaf boat game.');
    await page.waitForFunction(() => window.FG.studio.exportNotebook().sessions.some(session => session.draft === 'Fixture: a little leaf boat game.'));
    await page.evaluate(key => {
      window.navigationShellSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(name, value) {
        if (this === localStorage && name === key) throw new DOMException('Fixture storage fault', 'QuotaExceededError');
        return window.navigationShellSetItem.call(this, name, value);
      };
    }, NOTEBOOK);
    const draft = 'Fixture: keep these new words when navigation cannot save.';
    await page.fill('#studioPrompt', draft);
    await page.waitForFunction(() => document.getElementById('studioDraftStatus').textContent.includes('Could not save'));
    await navigate(page, '#studioNavJourney');
    assert.equal(await page.locator('#page-studio').isVisible(), true, 'the drawer route obeys the existing save guard');
    assert.equal(await page.inputValue('#studioPrompt'), draft, 'an unsuccessful route retains the exact unsaved words');
    assert.equal(await page.locator('#page-jems-journey').isVisible(), false);
    await page.evaluate(() => { Storage.prototype.setItem = window.navigationShellSetItem; });
    await navigate(page, '#studioNavJourney');
    await page.locator('#page-jems-journey').waitFor({ state: 'visible' });
    assert.ok(await page.evaluate(text => window.FG.studio.exportNotebook().sessions.some(session => session.draft === text), draft),
      'retrying the guarded navigation saves the draft');
    assert.deepEqual(errors, []); assert.deepEqual(posts, []);
    console.log('PASS compact navigation recovery: failed draft save blocks drawer navigation; retry preserves the exact draft');
  } finally { await context.close(); }
}

(async () => {
  const server = start(); let browser;
  fs.mkdirSync('test-results', { recursive: true });
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || (!process.env.CI && fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
      headless: true, args: ['--no-sandbox'],
    });
    const base = `http://127.0.0.1:${server.address().port}/arcade/`;
    for (const viewport of [{ width: 1280, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
      await shellJourney(browser, base, viewport);
    }
    await saveGuardJourney(browser, base);
  } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

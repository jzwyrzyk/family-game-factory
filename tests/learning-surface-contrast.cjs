// Render the real activities with the complete production CSS, including host
// selectors absent from the isolated activity tests. No backend or child data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium } = require('playwright');
const { assertTextContrast } = require('./helpers/text-contrast.cjs');

const fixtureOrigin = 'http://jems.test';
const surfaces = {
  native: { body: 'studio-review', html: '<main><section id="page-game" class="page studio-native-game"><div class="game-stage"><div class="stage-overlay"><div id="mount" class="learning-modal-card"></div></div></div></section></main>' },
  legacy: { body: '', html: '<main><section id="page-game" class="page"><div class="game-stage"><div class="stage-overlay"><div id="mount" class="learning-modal-card"></div></div></div></section></main>' },
  practice: { body: 'studio-review', html: '<main><section id="page-lab" class="page"><div class="panel"><div id="mount"></div></div></section></main>' },
  generated: { body: 'studio-review', html: '<main><section id="page-studio" class="page"><div class="studio-game-host" style="position:relative;min-height:850px"><div class="learning-preview-cover" id="mount"></div></div></section></main>' },
};
const languageCases = {
  choice: { skill: 'g3-inference', tier: 0, random: 0 },
  tiles: { skill: 'g1-plural-s', tier: 0, random: .999999 },
  edit: { skill: 'g1-punctuation', tier: 2, random: .999999 },
  creative: { skill: 'g4-revision', tier: 0, random: .1 },
};

function productionStyles() {
  const html = fs.readFileSync('dist/index.html', 'utf8');
  const hrefs = [...html.matchAll(/<link\b[^>]*>/g)]
    .map(match => match[0]).filter(tag => /rel=["']stylesheet["']/.test(tag))
    .map(tag => tag.match(/href=["']([^"']+)["']/)?.[1]);
  assert.ok(hrefs.length > 0 && hrefs.every(Boolean), 'Build must expose its actual stylesheet links');
  return hrefs.map(href => fs.readFileSync(path.join('dist/assets', path.posix.basename(href)), 'utf8')).join('\n');
}

(async () => {
  const css = productionStyles();
  const built = await build({ stdin: {
    contents: "export { mountLanguageActivity } from './src/language/activity'; export { generateLanguageItem } from './src/language/content'; export { mountMathActivity } from './src/learning/activity'; export { generateItem } from './src/learning/content';",
    resolveDir: process.cwd(), loader: 'ts',
  }, bundle: true, platform: 'browser', format: 'iife', globalName: 'SurfaceTest', write: false });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox'] });
  let textChecks = 0, minimumRatio = Infinity;
  const contrastFailures = [];
  async function check(page, selector, label, options) {
    try {
      const states = await assertTextContrast(page, selector, label, options);
      textChecks += states.length;
      minimumRatio = Math.min(minimumRatio, ...states.map(state => state.ratio));
    }
    catch (error) { contrastFailures.push(error.message); }
  }
  async function mountLanguage(page, name, failSave = false) {
    const spec = languageCases[name];
    await page.evaluate(({ spec, failSave }) => {
      window.activity?.dispose(); window.completions = []; window.failSave = failSave;
      const item = window.SurfaceTest.generateLanguageItem(spec.skill, { tier: spec.tier, random: () => spec.random });
      window.currentItem = item;
      window.activity = window.SurfaceTest.mountLanguageActivity(document.getElementById('mount'), {
        profile: { id: 'contrast-fixture', age: 9, grade: 4, skills: {}, hints: true, learningSubject: 'language' },
        item, onSave() { return !window.failSave; }, onComplete(result) { window.completions.push(result); }, onLeave() {},
      });
    }, { spec, failSave });
  }
  async function mountMath(page, failSave = false) {
    await page.evaluate(failSave => {
      window.activity?.dispose(); window.completions = [];
      const item = window.SurfaceTest.generateItem('g3-multiply', { factId: 'mul:8x7', representation: 'symbolic', random: () => 0 });
      window.currentItem = item;
      window.activity = window.SurfaceTest.mountMathActivity(document.getElementById('mount'), {
        profile: { id: 'contrast-fixture', grade: 4, skills: {}, hints: true }, item, mode: 'checkpoint', legacyIds: true,
        onSave() { return !failSave; }, onComplete(result) { window.completions.push(result); },
      });
    }, failSave);
  }
  try {
    for (const width of [390, 1280]) for (const [surface, markup] of Object.entries(surfaces)) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const label = `${surface} ${width}px`, errors = [], previousFailures = contrastFailures.length;
      page.on('pageerror', error => errors.push(error.message));
      await page.route(`${fixtureOrigin}/**`, route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><style>${css}</style></head><body class="${markup.body}">${markup.html}</body></html>` });
        const file = path.resolve('dist', '.' + url.pathname), root = path.resolve('dist') + path.sep;
        if (file.startsWith(root) && fs.existsSync(file) && fs.statSync(file).isFile()) return route.fulfill({ path: file });
        return route.fulfill({ status: 404, body: '' });
      });
      try {
        await page.goto(fixtureOrigin); await page.addScriptTag({ content: built.outputFiles[0].text });
        await mountLanguage(page, 'choice');
        await check(page, '.language-question', `${label} question`);
        await check(page, '.language-story-text', `${label} passage`);
        await check(page, '.language-choice', `${label} answers`);
        await check(page, '.language-help-controls button', `${label} support controls`);
        const wrongIndex = await page.locator('.language-choice').evaluateAll(buttons => buttons.findIndex(button => button.dataset.value !== window.currentItem.answer));
        await page.locator('.language-choice').nth(wrongIndex).click();
        await check(page, '.language-feedback', `${label} incorrect feedback`);
        await check(page, '.language-hint h3, .language-hint p', `${label} graduated hint`);
        await page.locator('[data-action="show-solution"]').click();
        await check(page, '.language-hint h3, .language-hint p, .language-hint button', `${label} worked example`);
        await mountLanguage(page, 'choice');
        const correctIndex = await page.locator('.language-choice').evaluateAll(buttons => buttons.findIndex(button => button.dataset.value === window.currentItem.answer));
        await page.locator('.language-choice').nth(correctIndex).click();
        await check(page, '.language-feedback', `${label} correct feedback`);
        await check(page, '.language-choice[aria-pressed="true"]', `${label} completed answer remains readable`, { includeDisabled: true });

        await mountLanguage(page, 'tiles');
        assert.equal(await page.locator('.language-activity').getAttribute('data-kind'), 'word-tiles');
        await check(page, '.language-built, .language-tile', `${label} word construction`);
        await page.locator('.language-tile').first().click();
        await check(page, '.language-built', `${label} constructed output`);
        await check(page, '.language-tile:disabled', `${label} used letter remains readable`, { includeDisabled: true });

        await mountLanguage(page, 'edit', true);
        assert.equal(await page.locator('.language-activity').getAttribute('data-kind'), 'edit');
        await page.locator('.language-edit-input').fill('My example sentence.');
        await check(page, '.language-edit-form label, .language-edit-input', `${label} editing label and input`);
        await check(page, '.language-save-warning', `${label} language save failure`);
        await page.locator('#mount').evaluate(node => {
          const warning = document.createElement('p'); warning.className = 'learning-save-warning'; warning.setAttribute('role', 'alert');
          warning.textContent = 'Progress could not be saved. Keep this page open and ask a grown-up to export it.'; node.append(warning);
        });
        await check(page, '.learning-save-warning', `${label} host save failure`);

        await mountLanguage(page, 'creative');
        assert.equal(await page.locator('.language-activity').getAttribute('data-kind'), 'creative');
        await page.locator('.language-creative-input').fill('My dragon bakes a cake.');
        await check(page, '.language-creative-form label, .language-creative-input', `${label} creative label and text`);

        await mountMath(page, true);
        await page.locator('#math-answer').fill('55');
        await check(page, '.math-activity h2, .math-answer-form label, #math-answer', `${label} dark math question and answer`);
        await check(page, '.math-save-warning', `${label} math save failure`);
        await page.locator('#math-submit').click();
        await check(page, '.math-feedback', `${label} math incorrect feedback`);
        await check(page, '.math-hint h3, .math-hint p', `${label} math hint`);
        await page.locator('[data-action="show-solution"]').click();
        await check(page, '.math-hint h3, .math-hint p, .math-hint .math-primary', `${label} math worked example`);
        await mountMath(page);
        await page.locator('#math-answer').fill('56'); await page.locator('#math-submit').click();
        await check(page, '.math-feedback', `${label} math correct feedback`);

        if (surface === 'native' || surface === 'legacy') {
          await page.evaluate(() => {
            window.activity.dispose();
            const target = document.getElementById('mount'); target.className = 'modal-card';
            target.innerHTML = '<h2>Level cleared!</h2><p>Your game is ready.</p><button class="btn primary">Next level</button>';
          });
          await check(page, '.modal-card > h2, .modal-card > p, .modal-card > button', `${label} dark game result`);
          await page.evaluate(() => { document.getElementById('mount').className = 'learning-modal-card'; });
          await check(page, '.learning-modal-card > h2, .learning-modal-card > p, .learning-modal-card > button', `${label} learning load recovery`);
        }
        assert.deepEqual(errors, [], `${label} has no browser exceptions`);
        console.log(`${contrastFailures.length === previousFailures ? 'PASS' : 'FAIL'} ${label}: question, reading, response, help, writing, save and dark surfaces`);
      } finally { await page.close(); }
    }
    assert.equal(contrastFailures.length, 0, 'Learning surface contrast failures:\n' + contrastFailures.join('\n'));
    console.log(`PASS learning surface contrast: 8 rendered host/viewport combinations, ${textChecks} visible text checks; lowest sampled contrast ${minimumRatio.toFixed(2)}:1 (required 4.5:1).`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

/* Actual Rewards components in an isolated browser fixture, not live award evidence.
 * Covers base-path art, responsive reflow, keyboard actions, owner-safe loading and
 * nonblocking celebrations. Integrated award/persistence checks live separately. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { build } = require('esbuild');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const script = `
import { createRewardsPage, createRewardsWidget, createRewardCelebration } from './src/rewards/ui';
import { emptyRewardsSummary } from './src/rewards/model';
import { installGemJourney } from './src/brand/journey';
import './src/brand/art-library.css';
import './src/brand/journey.css';
const empty = {summary:emptyRewardsSummary('player1'),journey:{ownerId:'player1',level:0,character:null,polishedCount:0,nextAction:'Save your first idea'}};
const state = {summary:{...emptyRewardsSummary('player1'),lifetimeGems:135,nextGemMilestone:150,reachedGemMilestones:[50],gemMilestoneFloor:50,gemMilestoneProgress:.85,counts:{math:20,language:10,coding:2,making:1},practiceCount:32,nextPracticeMilestone:{goal:50,progress:32,amount:20},totalGrants:35,recentGrants:[{id:'game-1',kind:'game.developed',domain:'making',amount:25,label:'Your new game is yours',createdAt:'2026-11-19T12:00:00Z'},{id:'math-1',kind:'math.completed',domain:'math',amount:2,label:'Math activity completed',createdAt:'2026-11-19T11:58:00Z'},{id:'coding-1',kind:'scene.challenge',domain:'coding',amount:8,label:'A new coding challenge solved',createdAt:'2026-11-18T12:00:00Z'}]},journey:{ownerId:'player1',level:3,character:'nova',polishedCount:1,nextAction:'Polish 2 more jems'}};
window.rewardActions=[];
const act=name=>()=>window.rewardActions.push(name);
const page=createRewardsPage({state,onBack:act('back'),onOpenJourney:act('journey'),onPlay:act('play'),onCreate:act('create'),onActivity:activity=>window.rewardActions.push('activity:'+activity),onRetry:act('retry')});
const widget=createRewardsWidget({summary:state.summary,onOpen:act('open')});
document.querySelector('main').append(page.element);
document.querySelector('header').append(widget.element);
page.show();
window.rewardsFixture={page,widget,state,empty,showToast(){const toast=createRewardCelebration({grants:state.summary.recentGrants.slice(0,1),journey:state.journey});Object.assign(toast.style,{position:'fixed',bottom:'20px',left:'50%',transform:'translateX(-50%)',zIndex:'999'});document.body.append(toast);return toast},emptyToast(){return createRewardCelebration({grants:[],journey:state.journey})},
  fallbackActions(){
    const actions=[];
    const fallback=createRewardsPage({state,onBack(){},onOpenJourney(){},onPlay:()=>actions.push('play'),onCreate:()=>actions.push('create')});
    fallback.element.querySelector('[data-reward-activity="math"]').click();
    fallback.element.querySelector('[data-reward-activity="making"]').click();
    fallback.dispose();return actions;
  },
  showJourney(){
    page.hide();
    const journey=installGemJourney({onBack(){},onCreate:act('new-idea'),onChooseCharacter(){},onPrimaryAction:owner=>window.rewardActions.push('continue:'+owner)});
    document.querySelector('main').append(journey.element);
    journey.render({...state.journey,primaryActionLabel:'Continue my game'});
    journey.element.hidden=false;journey.element.classList.remove('hidden');
    window.rewardsFixture.journey=journey;
  }
};
`;

(async () => {
  const output = await build({
    absWorkingDir: root, stdin: { contents: script, resolveDir: root, sourcefile: 'rewards-ui-fixture.ts' },
    bundle: true, format: 'iife', outdir: 'rewards-ui-fixture', write: false,
    external: ['/fonts/*', '/jems-art/*']
  });
  const javascript = output.outputFiles.find(file => file.path.endsWith('.js')).text;
  const css = output.outputFiles.find(file => file.path.endsWith('.css')).text;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="/arcade/"><title>Jems Rewards component fixture</title><link rel="stylesheet" href="./bundle.css"><style>body{margin:0;background:#fbf9fe;font-family:Inter,system-ui}header{max-width:1182px;margin:0 auto;padding:20px 18px;display:flex;justify-content:space-between;align-items:center;gap:10px}header>img{width:145px;max-width:48%;height:auto}main{max-width:1182px;margin:12px auto;padding:0 18px}footer{max-width:1182px;margin:24px auto;padding:18px}#outside{min-height:44px;padding:10px 18px}.hidden{display:none!important}</style></head><body><header><img src="./jems-logo.svg" alt="jems"></header><main></main><footer><button id="outside">Keep playing</button></footer><script src="./bundle.js"></script></body></html>`;
  const mime = { '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff': 'font/woff' };
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/arcade/' || pathname === '/') { response.setHeader('content-type', 'text/html'); response.end(html); return; }
    if (pathname === '/arcade/bundle.js') { response.setHeader('content-type', 'application/javascript'); response.end(javascript); return; }
    if (pathname === '/arcade/bundle.css') { response.setHeader('content-type', 'text/css'); response.end(css); return; }
    const relative = pathname.replace(/^\/arcade\//, '').replace(/^\//, '');
    const file = path.resolve(root, 'public', relative);
    if (!file.startsWith(path.join(root, 'public') + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream');
    response.end(fs.readFileSync(file));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1400, height: 1050 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const destination = path.join(root, 'test-results');
  fs.mkdirSync(destination, { recursive: true });
  const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'Rewards fit the viewport without horizontal scrolling');
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/arcade/`);
    await page.waitForFunction(() => !!window.rewardsFixture);
    await page.evaluate(async () => {
      await document.fonts.ready;
      for (const source of new Set([...document.querySelectorAll('[data-sprite-src]')].map(element => element.dataset.spriteSrc))) {
        const image = new Image(); image.src = new URL(source, document.baseURI).href; await image.decode();
      }
      await Promise.all([...document.images].map(image => image.decode()));
    });
    assert.equal(await page.locator('#jemsRewardsTotal').textContent(), '135');
    assert.equal(await page.locator('#jemsRewardsMakerName').textContent(), 'Gem Polisher');
    assert.equal(await page.locator('#jemsRewardsMakerArt .jems-rank-thumbnail').getAttribute('data-character'), 'nova');
    assert.equal(await page.locator('#jemsRewardsMakerArt .jems-character-art').getAttribute('data-level'), '3');
    assert.equal(await page.locator('#jemsRewardsProgress').getAttribute('max'), '100');
    assert.equal(await page.locator('#jemsRewardsProgress').getAttribute('value'), '85');
    assert.equal(await page.locator('#jemsRewardsMilestones [data-earned="true"]').count(), 1);
    assert.match(await page.locator('#jemsRewardsPracticeBonus').textContent(), /18 more activities.*20 gems/);
    await page.locator('#jemsRewardsPlay').focus(); await page.keyboard.press('Enter');
    await page.locator('#jemsRewardsCreate').click();
    await page.locator('#jemsRewardsJourney').click();
    await page.locator('#jemsRewardsWidget').click();
    assert.deepEqual(await page.evaluate(() => window.rewardActions), ['play', 'create', 'journey', 'open']);
    assert.match(await page.locator('#jemsRewardsExplanation').textContent(), /gems add up.*maker level grows/i);
    for (const activity of ['math', 'language', 'coding', 'making']) {
      const action = page.locator(`[data-reward-activity="${activity}"]`);
      assert.equal(await action.getAttribute('type'), 'button');
      await action.focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => window.rewardActions.at(-1)), 'activity:' + activity, 'Each earning route requests its own host-owned activity');
    }
    assert.deepEqual(await page.evaluate(() => window.rewardsFixture.fallbackActions()), ['play', 'create'], 'Existing hosts retain their play and creation fallbacks');
    await noOverflow();
    await page.screenshot({ path: path.join(destination, 'rewards-ui-desktop.png'), fullPage: true });

    for (const width of [768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow();
      const undersized = await page.locator('#page-jems-rewards button').evaluateAll(buttons => buttons.filter(button => !button.hidden && button.getClientRects().length && button.getBoundingClientRect().height < 43).map(button => button.id));
      assert.deepEqual(undersized, [], 'Visible reward actions retain touch target heights');
      if (width === 390) await page.screenshot({ path: path.join(destination, 'rewards-ui-mobile.png'), fullPage: true });
    }
    await page.setViewportSize({ width: 800, height: 900 });
    await page.evaluate(() => document.body.style.zoom = '2');
    await noOverflow();
    await page.evaluate(() => document.body.style.zoom = '');

    await page.evaluate(() => window.rewardsFixture.page.update(window.rewardsFixture.empty));
    assert.equal(await page.locator('#jemsRewardsTotal').textContent(), '0');
    assert.match(await page.locator('#jemsRewardsMakerState').textContent(), /preview/);
    assert.match(await page.locator('#jemsRewardsMakerAction').textContent(), /Choose your maker/);
    assert.equal(await page.locator('#jemsRewardsMakerArt .jems-character-art').count(), 0, 'An unselected owner never inherits either human outside the explicit chooser');
    assert.equal(await page.locator('#jemsRewardsMakerArt .jems-rank-thumbnail').getAttribute('data-character'), 'none', 'Clearing the selection clears the previous Nova portrait');
    const neutralMaker = page.locator('#jemsRewardsMakerArt .jems-gem-art');
    assert.equal(await neutralMaker.count(), 1, 'One neutral gem remains instead of a blank or paired-human slot');
    assert.equal(await neutralMaker.isVisible(), true);
    assert.equal(await neutralMaker.getAttribute('data-sprite-src'), 'jems-journey/gems.webp', 'The unselected view uses the approved neutral gem artwork');
    assert.equal(await page.locator('#jemsRewardsRecent').isVisible(), false);
    await page.evaluate(() => window.rewardsFixture.page.update({ ...window.rewardsFixture.empty, loading: true }));
    assert.equal(await page.locator('#jemsRewardsTotal').textContent(), '…');
    assert.equal(await page.locator('#jemsRewardsNext').isVisible(), false);
    await page.evaluate(() => window.rewardsFixture.page.update({ ...window.rewardsFixture.empty, error: 'test storage failure' }));
    assert.equal(await page.locator('#jemsRewardsTotal').textContent(), '—');
    assert.equal(await page.locator('#jemsRewardsRetry').isVisible(), true);
    await page.locator('#jemsRewardsRetry').click();
    assert.equal(await page.evaluate(() => window.rewardActions.at(-1)), 'retry');
    await page.evaluate(() => window.rewardsFixture.page.update({ ...window.rewardsFixture.state, journey: { ...window.rewardsFixture.empty.journey, ownerId: 'player2' } }));
    assert.equal(await page.locator('#jemsRewardsTotal').textContent(), '…', 'Stale grants never paint another owner’s balance');
    assert.equal(await page.locator('#jemsRewardsRecent').isVisible(), false);

    await page.evaluate(() => window.rewardsFixture.page.update(window.rewardsFixture.state));
    await page.locator('#outside').focus();
    await page.evaluate(() => window.rewardsFixture.showToast());
    assert.equal(await page.evaluate(() => document.activeElement.id), 'outside', 'Earned celebration never takes focus');
    assert.equal(await page.locator('.jems-rewards-toast').evaluate(element => getComputedStyle(element).pointerEvents), 'none');
    assert.equal(await page.locator('.jems-rewards-toast').evaluate(element => getComputedStyle(element).animationName), 'none');
    assert.match(await page.locator('.jems-rewards-toast').innerText(), /25 gems/);
    assert.equal(await page.evaluate(() => window.rewardsFixture.emptyToast().hidden), true, 'No empty +0 celebration');

    await page.evaluate(() => window.rewardsFixture.showJourney());
    assert.match(await page.locator('#jemsJourneyCreate').textContent(), /Continue my game/);
    await page.locator('[data-journey-level="4"]').click();
    assert.match(await page.locator('#jemsJourneyCreate').textContent(), /Continue my game/, 'Outfit previews do not replace the current next-step action');
    await page.locator('#jemsJourneyCreate').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => window.rewardActions.at(-1)), 'continue:player1');
    await page.evaluate(() => window.rewardsFixture.journey.render({...window.rewardsFixture.empty.journey,ownerId:'player2',primaryActionLabel:'Start my game'}));
    await page.locator('#jemsJourneyCreate').click();
    assert.equal(await page.evaluate(() => window.rewardActions.at(-1)), 'continue:player2', 'The host action receives the current owner after a profile change');
    assert.deepEqual(errors, []);
    console.log('PASS: Rewards layout, actionable earning routes, contextual journey action, base-path artwork, keyboard actions, owner-safe loading, reduced motion and nonblocking celebration.');
  } finally {
    await browser.close(); server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

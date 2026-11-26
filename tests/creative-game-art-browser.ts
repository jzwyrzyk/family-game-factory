import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {buildSync} from 'esbuild';
import {chromium} from 'playwright';
import {buildReviewPage, reviewFixture} from '../tools/creative-game-art/review';
import {prepareReviewCapsule} from '../tools/creative-game-art/capsule';
import {compileArtFixture, illustratedGame} from './generated-art-fixtures';

async function main() {
  const game = compileArtFixture(illustratedGame());
  for (const assetId of ['unknown', 'workshop']) {
    assert.throws(() => prepareReviewCapsule(game, {assetId, width: 100, height: 104}), /actor slot/);
  }
  assert.throws(() => prepareReviewCapsule({...game, compiled: {...game.compiled!, codeHash: 'changed'}},
    {assetId: 'helper', width: 100, height: 104}), /ATTESTATION/);
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH ||
    (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport: {width: 980, height: 900}});
    const requests: string[] = [];
    const html = buildReviewPage();
    await page.route('**/*', route => {
      if (route.request().url() === 'http://localhost/review') return route.fulfill({contentType: 'text/html', body: html});
      requests.push(route.request().url());
      return route.abort();
    });
    await page.goto('http://localhost/review');
    await page.getByRole('button', {name: 'Try the rock'}).click();
    const frame = page.frameLocator('iframe');
    await frame.locator('#game[data-assets-ready=true]').waitFor();
    await frame.getByRole('button', {name: 'Play!', exact: true}).click();
    await frame.locator('#game[data-frames]').waitFor();
    const rockX = () => frame.locator('#game').evaluate(element => {
      const canvas = element as HTMLCanvasElement, {data} = canvas.getContext('2d')!.getImageData(0, 0, 720, 400);
      let sum = 0, count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] === 230 && data[i + 1] === 119 && data[i + 2] === 246) {sum += (i / 4) % 720; count++;}
      }
      return count > 1000 ? sum / count : 0;
    });
    const before = await rockX();
    assert.ok(before > 100 && before < 200, 'selected rock pixels render in the exact slot');
    await frame.locator('#game').focus();
    await page.keyboard.down('ArrowRight');
    try {
      for (let i = 0; i < 40 && await rockX() <= before + 70; i++) await page.waitForTimeout(50);
    } finally {await page.keyboard.up('ArrowRight');}
    assert.ok(await rockX() > before + 60, 'ordinary input moves the authentic sprite');
    assert.equal(await page.locator('iframe').getAttribute('sandbox'), 'allow-scripts');
    const contents = await page.locator('iframe').getAttribute('srcdoc');
    assert.doesNotMatch(contents!, /offline-fixture-|Synthetic rock fixture|art:image:|family-private-drawings/);
    assert.match(contents!, /connect-src 'none'/);
    assert.equal(await frame.locator('#local-sprite-pixels').count(), 0);
    const isolation = await page.locator('iframe').evaluate(element => {
      const source = new DOMParser().parseFromString((element as HTMLIFrameElement).srcdoc, 'text/html');
      const pixels = source.querySelector<HTMLTemplateElement>('#local-sprite-pixels')!.content.textContent!;
      const script = source.scripts[0].textContent!;
      // The frozen worker and its declared IDs are in the hashed script. Only
      // the trusted presentation client reads the separate raster on startup.
      return {hasRaster: pixels.length > 100, scriptContainsRaster: script.includes(pixels)};
    });
    assert.deepEqual(isolation, {hasRaster: true, scriptContainsRaster: false});
    if (process.env.JEMS_ART_SCREENSHOT) await frame.locator('main').screenshot({path: process.env.JEMS_ART_SCREENSHOT});
    await page.getByRole('button', {name: 'Close playtest'}).click();
    assert.equal(await page.locator('iframe').count(), 0);

    // Exercise the host module against the same synthetic authority, including
    // cancellation, exact version rejection, cross-owner reads, and bad hashes.
    const helpers = buildSync({stdin: {contents: `export {openDrawingPlaytest} from './tools/creative-game-art/playtest';
      export {saveDrawing,drawing} from './src/assets/private-drawings';
      export {artChoice} from './src/creation/private-art';`, resolveDir: process.cwd()},
      bundle: true, platform: 'browser', define: {'import.meta.env.MODE': JSON.stringify('offline-review')}, format: 'iife', globalName: 'ArtTests', write: false}).outputFiles[0].text;
    await page.addScriptTag({content: helpers});
    const results = await page.evaluate(async capsule => {
      const api = (window as any).ArtTests, canvas = document.createElement('canvas');
      const blob = await new Promise(resolve => canvas.toBlob(resolve));
      const owner = 'fixture-a', item = await api.saveDrawing(owner, 'Art fixture', blob);
      const choice = await api.artChoice(owner, {drawingId: item.id});
      const binding = {revision: capsule.revision, slotId: capsule.slot.assetId, assetPin: choice.assetId};
      const view = new AbortController();
      const box = document.createElement('div');
      const outcomes = [];
      for (const [pin, player] of [
        [{...binding, assetPin: binding.assetPin.replace(/.$/, binding.assetPin.endsWith('0') ? '1' : '0')}, owner],
        [binding, 'fixture-b'], [{...binding, revision: 'old'}, owner], [{...binding, slotId: 'elsewhere'}, owner]
      ] as const) {
        try {await api.openDrawingPlaytest(box, capsule, pin, () => player, view.signal); outcomes.push('unexpected success');}
        catch (error) {outcomes.push((error as Error).message);}
      }
      const pending = api.openDrawingPlaytest(box, capsule, binding, () => owner, view.signal);
      view.abort();
      try {await pending; outcomes.push('unexpected success');}
      catch (error) {outcomes.push((error as Error).message);}
      return {outcomes, frames: box.children.length, original: (await api.drawing(owner, item.id)).sha256 === item.sha256};
    }, reviewFixture());
    assert.match(results.outcomes[0], /does not match/);
    assert.match(results.outcomes[1], /profile/);
    assert.match(results.outcomes[2], /version/);
    assert.match(results.outcomes[3], /slot/);
    assert.match(results.outcomes[4], /changed|own profile/);
    assert.equal(results.frames, 0);
    assert.equal(results.original, true);
    assert.deepEqual(requests, []);
    console.log('PASS pinned private sprite, worker playback, movement, cancellation, scope, offline and immutable originals');
  } finally {await browser.close();}
}
main().catch(error => {console.error(error); process.exitCode = 1;});

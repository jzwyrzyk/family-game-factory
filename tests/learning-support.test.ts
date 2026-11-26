import {after, before, test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {pointerPoint} from '../src/drawing/pointer-input';
import {chromium, type Browser, type Page} from 'playwright';

let browser: Browser;
let bundle: string;
const css = readFileSync('src/learning/workspace/support.css', 'utf8');
before(async () => {
  const out = await build({entryPoints: ['src/learning/workspace/support.ts'], bundle: true,
    write: false, platform: 'browser', format: 'iife', globalName: 'SupportTest'});
  bundle = out.outputFiles[0].text;
  browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH ||
    (!process.env.CI && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    args: ['--no-sandbox']});
});
after(async () => { await browser?.close(); });

async function mount(kind: 'number' | 'fraction', width = 320) {
  const page = await browser.newPage({viewport: {width, height: 667}, hasTouch: true});
  await page.setContent('<base href="http://jems.test/"><style>' + css +
    '</style><form><label for="entry">Answer</label><input id="entry" maxlength="80" inputmode="decimal"><button>Check</button></form>');
  await page.route('http://jems.test/**', route => route.fulfill({body: '<svg xmlns="http://www.w3.org/2000/svg"/>'}));
  await page.addScriptTag({content: bundle});
  await page.evaluate(format => {
    const app = window as any;
    const signal = (app.controller = new AbortController()).signal;
    const form = document.querySelector('form')!;
    const input = form.querySelector('input')!;
    input.after(app.SupportTest.createNumericKeypad(input, format, signal));
    form.after(app.SupportTest.createScratchpad(signal));
    app.submissions = [];
    form.onsubmit = event => { event.preventDefault(); app.submissions.push(input.value); };
  }, kind);
  return page;
}

test('scaled paper uses its own bitmap dimensions and precision', () => {
  const canvas = {
    width: 840, height: 560, getBoundingClientRect: () => ({left: 12, top: 24, width: 400, height: 320}),
  } as HTMLCanvasElement;
  const pen = {clientX: 12.5, clientY: 25.5, pointerType: 'pen', pressure: .407} as PointerEvent;
  assert.deepEqual(pointerPoint(canvas, pen, 'position'), {x: 1.05, y: 2.625});
  assert.deepEqual(pointerPoint(canvas, pen), {x: 1, y: 2.75, p: .41});
  canvas.width = 560; canvas.height = 800;
  const edge = {...pen, clientX: 520, clientY: -30} as PointerEvent;
  assert.deepEqual(pointerPoint(canvas, edge, 'position'), {x: 560, y: 0});
});

test('number pad preserves selection, native typing, bounded input and deliberate submission', async () => {
  const page = await mount('fraction');
  try {
    const input = page.getByLabel('Answer', {exact: true});
    const keys = page.locator('.learning-keypad-keys');
    const press = (name: string) => keys.getByRole('button', {name, exact: true}).tap();
    for (const name of ['1','Space','3','Fraction slash','4']) await press(name);
    assert.equal(await input.inputValue(), '1 3/4');
    await input.evaluate((el: HTMLInputElement) => el.setSelectionRange(2, 3));
    await press('2');
    assert.equal(await input.inputValue(), '1 2/4');
    await press('Delete');
    assert.equal(await input.inputValue(), '1 /4');
    await press('Clear');
    for (const name of ['Minus','0','Decimal point','5']) await press(name);
    assert.equal(await input.inputValue(), '-0.5');
    assert.deepEqual(await page.evaluate(() => (window as any).submissions), []);
    await input.fill('8'.repeat(80));
    await press('9');
    assert.equal(await input.inputValue(), '8'.repeat(80));
    await page.locator('.learning-keypad > summary').tap();
    await page.waitForFunction(() => document.querySelector('input')!.inputMode === 'decimal');
    await input.fill('2.75');
    await input.press('Enter');
    assert.deepEqual(await page.evaluate(() => (window as any).submissions), ['2.75']);
  } finally { await page.close(); }
});

async function ink(page: Page) {
  return page.locator('canvas').evaluate((el: HTMLCanvasElement) => el.getContext('2d')!.getImageData(0, 0, el.width, el.height)
    .data.filter((alpha, i) => i % 4 === 3 && alpha > 0).length);
}
test('scratchpad keeps finger, pen, mouse and keyboard work within one activity and supports reversible erasure', async () => {
  const page = await mount('number', 768);
  try {
    assert.equal(await page.locator('canvas').count(), 0);
    const summary = page.locator('.learning-scratchpad > summary');
    await summary.tap();
    const canvas = page.locator('canvas');
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    const x = Math.round(box.x + box.width / 3), y = Math.round(box.y + box.height / 4);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y}]});
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x+50, y}]});
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    const first = await ink(page);
    assert.ok(first > 0, 'finger actually draws ink');
    await page.mouse.move(x, y+20);
    await page.mouse.down();
    await page.mouse.move(x+50, y+20, {steps: 4});
    await page.mouse.up();
    const second = await ink(page);
    assert.ok(second > first);
    await cdp.send('Input.dispatchMouseEvent', {type: 'mousePressed', x, y:y+40, button:'left', buttons:1, clickCount:1, pointerType:'pen'});
    await cdp.send('Input.dispatchMouseEvent', {type: 'mouseMoved', x:x+50, y:y+40, buttons:1, pointerType:'pen'});
    await cdp.send('Input.dispatchMouseEvent', {type: 'mouseReleased', x:x+50, y:y+40, button:'left', clickCount:1, pointerType:'pen'});
    const drawn = await ink(page);
    assert.ok(drawn > second, 'pen draws another line');
    const tools = page.locator('.learning-scratch-tools');
    const press = (name: string) => tools.getByRole('button', {name, exact: true}).click();
    await press('Eraser');
    await canvas.scrollIntoViewIfNeeded();
    const current = (await canvas.boundingBox())!;
    await page.mouse.click(current.x + current.width / 3, current.y + current.height / 4);
    assert.ok(await ink(page) < drawn);
    await press('Undo');
    assert.equal(await ink(page), drawn);
    await press('Clear paper');
    assert.equal(await ink(page), 0);
    await press('Undo');
    assert.equal(await ink(page), drawn);
    await press('Redo');
    assert.equal(await ink(page), 0);
    await press('Pencil');
    await canvas.focus();
    await canvas.press('Shift+ArrowRight');
    await canvas.press('Enter');
    const keyboard = await ink(page);
    assert.ok(keyboard > 0);
    await summary.click();
    await summary.click();
    assert.equal(await ink(page), keyboard);
    assert.deepEqual(await page.evaluate(() => (window as any).submissions), []);
    await page.evaluate(() => (window as any).controller.abort());
    assert.equal(await canvas.evaluate((el: HTMLCanvasElement) => el.width), 0);
    assert.equal(await page.locator('.learning-keypad-keys').getByRole('button', {name:'Fraction slash'}).count(), 0);
  } finally { await page.close(); }
});

test('old ink survives the undo limit, and branching after undo removes the abandoned redo path', async () => {
  const page = await mount('number',320);
  try {
    await page.locator('.learning-scratchpad > summary').click();
    const canvas=page.locator('canvas');
    await canvas.focus();
    await canvas.press('Enter');
    for(let i=0;i<20;i++)await canvas.press('ArrowRight');
    for(let i=0;i<64;i++)await canvas.press('Enter');
    const undo=page.getByRole('button',{name:'Undo',exact:true});
    for(let i=0;i<64;i++)await undo.press('Enter');
    assert.equal(await undo.isDisabled(),true);
    assert.ok(await ink(page)>0,'the first dot is kept in the baseline');
    const redo=page.getByRole('button',{name:'Redo',exact:true});
    assert.equal(await redo.isEnabled(),true);
    await canvas.press('Enter');
    assert.equal(await redo.isDisabled(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.ok(await page.locator('.learning-keypad-keys button').first().evaluate(el=>el.getBoundingClientRect().height>=48));
  } finally {await page.close();}
});

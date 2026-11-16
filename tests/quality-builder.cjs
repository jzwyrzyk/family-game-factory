const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');

// Exercises the real editor and Planck simulation. No completion/state stubs.
(async () => {
  let server, browser;
  try {
    server = require('./browser-server.cjs').start();
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH,
      headless: true,
      args: ['--no-sandbox'],
    });
    fs.mkdirSync('test-results', { recursive: true });
    for (const mobile of [false, true]) {
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 1000 },
        hasTouch: mobile,
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const state = () => page.evaluate(() => FG.runtime.snapshot().state);
      const blueprint = async () => (await state()).blueprint;
      const root = page.locator('.quality-builder');
      const canvas = root.locator('.q-canvas');
      const button = name => root.getByRole('button', { name, exact: true });
      const undo = () => button('↶ Undo').click();
      const advance = ms => page.clock.runFor(ms);
      await page.clock.install();
      await page.goto(`http://127.0.0.1:${server.address().port}/arcade/`);
      await page.waitForFunction(() => window.FG?.app);
      await page.evaluate(() => {
        FG.store.changeProfile({ rate: 0 });
        FG.app.openGame('gum');
      });
      await root.waitFor();
      assert.equal((await state()).schema, 'quality-construction-v1');
      assert.equal((await state()).mode, 'build');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'page fits the viewport');
      const initialCanvas = await canvas.boundingBox();
      assert.ok(initialCanvas.height > 240 && initialCanvas.width > 280, 'the playable canvas remains substantial');
      const trayLabels = await root.locator('.q-part > span').evaluateAll(labels => labels.map(label => ({
        font: parseFloat(getComputedStyle(label).fontSize),
        line: parseFloat(getComputedStyle(label).lineHeight),
        width: label.parentElement.getBoundingClientRect().width,
        height: label.parentElement.getBoundingClientRect().height,
        fits: label.scrollWidth <= label.clientWidth + 1,
      })));
      assert.equal(trayLabels.length, 10);
      assert.ok(trayLabels.every(label => label.font >= 10 && label.font <= 12 && label.line <= 15), 'legacy emoji font rules must not enlarge tray labels');
      assert.ok(trayLabels.every(label => label.width >= 62 && label.width <= 80 && label.height <= 130 && label.fits), 'part cards stay compact and their labels fit');
      await root.screenshot({ path: `test-results/quality-gum-${mobile ? 'mobile' : 'desktop'}.png` });

      // The provided machine is editable, and undo restores exact part identity and geometry.
      const initial = await blueprint();
      await button('Add Bottle').click();
      await page.keyboard.press('r');
      assert.ok(Math.abs((await state()).parts.at(-1).angle - Math.PI / 12) < 1e-9);
      await undo();
      assert.equal((await state()).parts.at(-1).angle, 0);
      await undo();
      assert.deepEqual(await blueprint(), initial);

      await button('Start fresh').click();
      await button('Add Bottle').click();
      const worldPoint = async (x, y) => {
        await canvas.scrollIntoViewIfNeeded();
        const r = await canvas.boundingBox(), scale = Math.min(r.width / 24, r.height / 13.5);
        return { x: r.x + (r.width - scale * 24) / 2 + x * scale, y: r.y + (r.height - scale * 13.5) / 2 + y * scale };
      };
      const tapAt = async (x, y) => {
        const p = await worldPoint(x, y);
        if (mobile) await page.touchscreen.tap(p.x, p.y);
        else await page.mouse.click(p.x, p.y);
      };
      // Tap-select/tap-place is a real alternative to dragging.
      await tapAt(6, 5);
      assert.ok(Math.abs((await state()).parts[0].x - 6) < .06);
      assert.ok(Math.abs((await state()).parts[0].y - 5) < .06);
      const beforeDrag = await blueprint();
      const from = await worldPoint(6, 5), to = await worldPoint(7.1, 4.3);
      if (mobile) {
        const client = await context.newCDPSession(page);
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [to] });
        assert.equal((await state()).dragActive, true, 'snapshots remain readable during a touch drag');
        await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(to.x, to.y, { steps: 6 });
        assert.equal((await state()).dragActive, true);
        await page.mouse.up();
      }
      assert.ok(Math.abs((await state()).parts[0].x - 7.1) < .1);
      await undo();
      assert.deepEqual(await blueprint(), beforeDrag);

      // Cancellation returns the previous placement and does not add an undo step.
      const cancelFrom = await worldPoint(6, 5), cancelTo = await worldPoint(7, 4);
      await page.mouse.move(cancelFrom.x, cancelFrom.y);
      await page.mouse.down();
      await page.mouse.move(cancelTo.x, cancelTo.y);
      await canvas.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' });
      await page.mouse.up();
      assert.deepEqual(await blueprint(), beforeDrag);

      // Keyboard assembly: cycle selection, preview, gum, rotation, detaching, and undo.
      await button('Start fresh').click();
      await button('Add Bottle').click();
      await button('Add Cardboard box').click();
      await page.keyboard.press('g');
      assert.equal((await state()).joining, true);
      await page.keyboard.press('Enter');
      assert.equal((await state()).joints.length, 1);
      assert.equal((await state()).gumRemaining, 9);
      const connected = await blueprint();
      await page.keyboard.press('r');
      await page.keyboard.press('ArrowRight');
      assert.ok((await state()).parts[1].x > connected.parts[1].x);
      // Every saved seam still agrees in world space after moving or rotating a part.
      const moved = await blueprint();
      const worldAnchor = (p, a) => ({ x: p.x + Math.cos(p.angle) * a.x - Math.sin(p.angle) * a.y, y: p.y + Math.sin(p.angle) * a.x + Math.cos(p.angle) * a.y });
      for (const j of moved.joints) {
        const a = worldAnchor(moved.parts.find(p => p.id === j.a), j.anchorA);
        const b = worldAnchor(moved.parts.find(p => p.id === j.b), j.anchorB);
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < .001);
      }
      await undo();
      await undo();
      assert.deepEqual(await blueprint(), connected);
      await canvas.focus();
      await page.keyboard.press(']');
      await button('Detach selected part').click();
      assert.equal((await state()).joints.length, 0);
      assert.equal((await state()).gumRemaining, 10);
      await undo();
      assert.deepEqual(await blueprint(), connected);

      // Free play runs actual bodies while leaving the editor blueprint untouched.
      await root.getByRole('combobox', { name: 'Choose construction challenge' }).selectOption('free');
      assert.equal((await state()).parts.length, 0);
      await button('Add Bottle').click();
      await button('Add Heavy tin can').click();
      const free = await blueprint();
      await button('Test machine  ▶').click();
      await advance(800);
      const running = await state();
      assert.equal(running.mode, 'run');
      assert.ok(running.simulation.bodies.some(p => p.y > free.parts.find(q => q.id === p.id).y + .2), 'gravity changes the simulated bodies');
      assert.deepEqual(running.blueprint, free, 'the saved machine never becomes the simulated wreck');
      await button('Pause game').click();
      const paused = (await state()).simulation.time;
      await advance(1000);
      assert.equal((await state()).simulation.time, paused, 'pause stops simulation time');
      assert.equal((await state()).paused, true);
      await button('Resume game').click();
      await advance(200);
      assert.ok((await state()).simulation.time > paused);
      await button('Change my machine').click();
      assert.deepEqual(await blueprint(), free);
      assert.equal((await state()).simulation, null);
      assert.ok((await state()).resources.particles <= 80);

      // A stopped design times out as a genuine failed physical experiment.
      await root.getByRole('combobox', { name: 'Choose construction challenge' }).selectOption('delivery');
      await button('Start fresh').click();
      await button('Add Little passenger').click();
      const unsuccessful = await blueprint();
      await button('Test machine  ▶').click();
      await advance(32000);
      assert.equal((await state()).simulation.status, 'lost');
      assert.equal(await page.locator('#stage-overlay').isVisible(), false, 'an unsuccessful test never forces the math/result overlay');
      await root.locator('.q-result').getByRole('button', { name: 'Change my machine', exact: true }).click();
      assert.deepEqual(await blueprint(), unsuccessful);

      // All three goals are reached by actual starter bodies and hold conditions.
      for (const mission of ['delivery', 'loft', 'bridge']) {
        await root.getByRole('combobox', { name: 'Choose construction challenge' }).selectOption(mission);
        await button('Use example').click();
        const ready = await blueprint();
        await button('Test machine  ▶').click();
        await advance(5000);
        assert.equal((await state()).simulation.status, 'won', `${mission} starter reaches its real goal`);
        assert.equal(await page.locator('#stage-overlay').isVisible(), false, 'a win waits for an explicit finish action');
        await root.screenshot({ path: `test-results/quality-gum-${mission}-${mobile ? 'mobile' : 'desktop'}.png` });
        if (mission === 'delivery') {
          await button('Finish challenge →').click();
          await page.locator('#resultNext').waitFor();
          await page.locator('#resultNext').click();
          assert.equal((await state()).mission, 'loft');
        } else {
          await root.locator('.q-result').getByRole('button', { name: 'Change my machine', exact: true }).click();
          assert.deepEqual(await blueprint(), ready);
        }
      }

      // Each mission has its own persisted design. Music preference survives reload too.
      await root.getByRole('combobox', { name: 'Choose construction challenge' }).selectOption('free');
      assert.deepEqual(await blueprint(), free);
      await button('Toggle music').click();
      const music = (await state()).audio.music;
      await page.reload();
      await page.waitForFunction(() => window.FG?.app);
      await page.evaluate(() => FG.app.openGame('gum'));
      assert.equal((await state()).mission, 'free');
      assert.deepEqual(await blueprint(), free);
      assert.equal((await state()).audio.music, music);

      // Unsupported future data is retained verbatim until a deliberate fresh/example choice.
      await page.evaluate(() => {
        FG.app.openGame('buckets');
        FG.store.current().constructionStates['original-gum'] = { legacyMarker: 'retain me', qualityConstruction: { schema: 'future-version', payload: { keep: true } } };
        FG.store.save();
        FG.app.openGame('gum');
      });
      assert.equal((await state()).storageBlocked, true);
      assert.equal(await button('Test machine  ▶').isDisabled(), true);
      await page.evaluate(() => FG.app.openGame('buckets'));
      assert.deepEqual(await page.evaluate(() => FG.store.current().constructionStates['original-gum']), { legacyMarker: 'retain me', qualityConstruction: { schema: 'future-version', payload: { keep: true } } });
      await page.evaluate(() => FG.app.openGame('gum'));
      await button('Use example').click();
      assert.equal((await state()).storageBlocked, false);
      assert.equal(await page.evaluate(() => FG.store.current().constructionStates['original-gum'].legacyMarker), 'retain me');
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS quality builder ${mobile ? 'touch' : 'desktop'}: editing, keyboard gum, undo, cancellation, real physics/three missions, explicit finish, pause, persistence, future-data protection`);
    }
  } finally {
    await browser?.close();
    server?.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

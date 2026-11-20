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
      const undo = () => button('Undo').click();
      const advance = ms => page.clock.runFor(ms);
      const canvasPixels = () => canvas.evaluate(c => {
        const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let hash = 2166136261, painted = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3]) painted++;
          hash = Math.imul(hash ^ (data[i] | data[i + 1] << 8 | data[i + 2] << 16 | data[i + 3] << 24), 16777619);
        }
        return { width: c.width, height: c.height, painted, hash: hash >>> 0 };
      });
      const settlePaused = async time => {
        let frames = -1;
        for (let pass = 0; pass < 8; pass++) {
          // ResizeObserver may produce more than one notification; require the
          // actual game frame counter to settle instead of fixing that count.
          await page.waitForTimeout(25); await advance(100);
          const current = await state();
          assert.equal(current.paused, true); assert.equal(current.simulation?.time ?? null, time);
          if (current.clock.frames === frames) return current;
          frames = current.clock.frames;
        }
        assert.fail('the paused workshop continued repainting after settling');
      };
      await page.clock.install();
      await page.goto(`http://127.0.0.1:${server.address().port}/arcade/?arcade=1`);
      await page.waitForFunction(() => window.FG?.app);
      await page.evaluate(() => {
        // This suite isolates physical behavior using the normal recent-question budget.
        FG.store.changeProfile({ rate: 1 });
        FG.store.current().mathWindow=[Date.now()];FG.store.save();
        FG.app.openGame('gum', {config:{qualityVersion:1,gravity:10,thrust:1,originalRules:true,gumBudget:10,jointStrength:1,highlightMatches:false,extraDecoys:0}});
      });
      await root.waitFor();
      assert.equal((await state()).schema, 'quality-construction-v1');
      assert.equal((await state()).mode, 'build');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'page fits the viewport');
      const initialCanvas = await canvas.boundingBox();
      assert.ok(initialCanvas.height > 240 && initialCanvas.width > 280, 'the playable canvas remains substantial');
      await root.screenshot({ path: `test-results/quality-gum-${mobile ? 'mobile' : 'desktop'}.png` });
      const trayLabels = await root.locator('.q-part > span').evaluateAll(labels => labels.map(label => ({
        text: label.textContent,
        font: parseFloat(getComputedStyle(label).fontSize),
        labelWidth: label.getBoundingClientRect().width,
        clientWidth: label.clientWidth,
        scrollWidth: label.scrollWidth,
        line: parseFloat(getComputedStyle(label).lineHeight),
        width: label.parentElement.getBoundingClientRect().width,
        height: label.parentElement.getBoundingClientRect().height,
        fits: label.scrollWidth <= label.clientWidth + 1,
      })));
      assert.equal(trayLabels.length, 10);
      assert.ok(trayLabels.every(label => label.font >= 10 && label.font <= 12 && label.line <= 15), 'legacy emoji font rules must not enlarge tray labels: ' + JSON.stringify(trayLabels));
      assert.ok(trayLabels.every(label => label.width >= 62 && label.width <= 80 && label.height <= 130 && label.fits), 'part cards stay compact and their labels fit: ' + JSON.stringify(trayLabels));

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
      // Connected dragging temporarily moves geometry; keyboard actions must restore/rebind first.
      const heldPart = connected.parts[1];
      const holdConnected = async () => {
        const from = await worldPoint(heldPart.x, heldPart.y), to = await worldPoint(heldPart.x + .8, heldPart.y + .7);
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(to.x, to.y, { steps: 5 });
        assert.equal((await state()).dragActive, true);
      };
      await holdConnected();
      await page.keyboard.press('Escape');
      assert.equal((await state()).dragActive, false);
      assert.equal(await canvas.evaluate(c => c.hasPointerCapture(1)), false, 'Escape releases pointer capture');
      await page.mouse.up();
      assert.deepEqual(await blueprint(), connected, 'Escape restores the exact connected blueprint');
      await holdConnected();
      await page.keyboard.press('r');
      assert.equal((await state()).dragActive, false);
      assert.equal((await state()).parts[1].x, heldPart.x);
      assert.ok(Math.abs((await state()).parts[1].angle - Math.PI / 12) < 1e-9, 'rotation uses stable geometry');
      await page.mouse.up();
      await undo();
      assert.deepEqual(await blueprint(), connected);
      await holdConnected();
      await page.keyboard.press('Space');
      await page.mouse.up();
      assert.equal((await state()).dragActive, false, 'Test clears an unfinished gesture');
      assert.equal((await state()).mode, 'build');
      assert.match(await root.locator('.q-status').textContent(), /Add the little passenger/);
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
      await button('Test machine').click();
      await advance(800);
      const running = await state();
      assert.equal(running.mode, 'run');
      assert.ok(running.simulation.bodies.some(p => p.y > free.parts.find(q => q.id === p.id).y + .2), 'gravity changes the simulated bodies');
      assert.deepEqual(running.blueprint, free, 'the saved machine never becomes the simulated wreck');
      await button('Pause game').click();
      const paused = (await state()).simulation.time;
      const stopped = await settlePaused(paused);
      await advance(1000);
      assert.equal((await state()).simulation.time, paused, 'pause stops simulation time');
      assert.equal((await state()).paused, true);
      assert.equal((await state()).clock.frames, stopped.clock.frames, 'pause stops recurring workshop redraws');
      const originalViewport = page.viewportSize(), beforeResize = await canvasPixels();
      await page.setViewportSize({ width: mobile ? 350 : 1040, height: originalViewport.height });
      await page.waitForFunction(width => document.querySelector('.quality-builder .q-canvas').width !== width,
        beforeResize.width, { polling: 50, timeout: 5000 });
      const resized = await settlePaused(paused), resizedPixels = await canvasPixels();
      assert.ok(resized.clock.frames > stopped.clock.frames, 'resizing a paused workshop requests a new paint');
      assert.ok(resizedPixels.painted > resizedPixels.width * resizedPixels.height / 2, 'the resized backing canvas is painted, not blank');
      await advance(500); assert.equal((await state()).clock.frames, resized.clock.frames, 'the resized view becomes quiescent again');
      await page.setViewportSize(originalViewport);
      await page.waitForFunction(width => document.querySelector('.quality-builder .q-canvas').width !== width,
        resizedPixels.width, { polling: 50, timeout: 5000 });
      await settlePaused(paused);
      await button('Resume game').click();
      await advance(200);
      assert.ok((await state()).simulation.time > paused);
      await button('Change my machine').focus();
      await page.keyboard.press('Enter');
      assert.equal(await canvas.evaluate(c => document.activeElement === c), true, 'returning from a run puts keyboard focus on the editable machine');
      assert.deepEqual(await blueprint(), free);
      assert.equal((await state()).simulation, null);
      assert.ok((await state()).resources.particles <= 80);

      // Editing can repaint a paused view without restarting the simulation.
      await button('Pause game').click();
      const pausedEditor = await settlePaused(null), held = free.parts[0];
      const pausedFrom = await worldPoint(held.x, held.y), pausedTo = await worldPoint(held.x + 1, held.y + .7);
      await page.mouse.move(pausedFrom.x, pausedFrom.y); await page.mouse.down();
      await settlePaused(null); const beforePausedDrag = await canvasPixels();
      await page.mouse.move(pausedTo.x, pausedTo.y, { steps: 3 });
      const draggedPaused = await settlePaused(null);
      assert.equal(draggedPaused.dragActive, true); assert.ok(draggedPaused.parts[0].x > held.x + .8);
      assert.notEqual((await canvasPixels()).hash, beforePausedDrag.hash, 'paused drag movement is actually painted');
      assert.equal(draggedPaused.clock.steps, pausedEditor.clock.steps, 'editing a paused view does not restart fixed updates');
      await canvas.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' }); await page.mouse.up();
      const cancelledPaused = await settlePaused(null);
      assert.deepEqual(await blueprint(), free); assert.equal(cancelledPaused.clock.steps, pausedEditor.clock.steps);
      assert.equal((await canvasPixels()).hash, beforePausedDrag.hash, 'cancelling the paused drag repaints its restored geometry');
      await button('Resume game').click();

      // A stopped design times out as a genuine failed physical experiment.
      await root.getByRole('combobox', { name: 'Choose construction challenge' }).selectOption('delivery');
      await button('Start fresh').click();
      await button('Add Little passenger').click();
      const unsuccessful = await blueprint();
      await button('Test machine').click();
      await advance(32000);
      assert.equal((await state()).simulation.status, 'lost');
      assert.equal(await page.locator('#stage-overlay').isVisible(), false, 'an unsuccessful test respects the recent-question pacing budget');
      await root.locator('.q-result').getByRole('button', { name: 'Change my machine', exact: true }).focus();
      await page.keyboard.press('Enter');
      assert.deepEqual(await blueprint(), unsuccessful);
      assert.equal(await canvas.evaluate(c => document.activeElement === c), true, 'hiding the result controls restores canvas focus');
      await page.keyboard.press(']');
      assert.equal((await state()).selected, unsuccessful.parts[0].id);
      await page.keyboard.press('ArrowRight');
      assert.ok(Math.abs((await state()).parts[0].x - unsuccessful.parts[0].x - .2) < 1e-9, 'keyboard editing works immediately after Change my machine without clicking the canvas');
      await undo();
      assert.deepEqual(await blueprint(), unsuccessful);

      // All three goals are reached by actual starter bodies and hold conditions.
      for (const mission of ['delivery', 'loft', 'bridge']) {
        await root.getByRole('combobox', { name: 'Choose construction challenge' }).selectOption(mission);
        await button('Use example').click();
        const ready = await blueprint();
        await button('Test machine').click();
        await advance(5000);
        assert.equal((await state()).simulation.status, 'won', `${mission} starter reaches its real goal`);
        assert.equal(await page.locator('#stage-overlay').isVisible(), false, 'the paced physics fixture can review the win before its explicit finish action');
        await root.screenshot({ path: `test-results/quality-gum-${mission}-${mobile ? 'mobile' : 'desktop'}.png` });
        if (mission === 'delivery') {
          await button('Finish challenge').click();
          await page.locator('#resultNext').waitFor();
          await page.locator('#resultNext').click();
          assert.equal((await state()).mission, 'loft');
        } else {
          await root.locator('.q-result').getByRole('button', { name: 'Change my machine', exact: true }).click();
          assert.deepEqual(await blueprint(), ready);
        }
      }

      // A smaller remix budget preserves a larger saved machine and explains the shortage.
      const bridge = await blueprint();
      await page.evaluate(() => FG.app.openGame('gum', { config: { ...FG.runtime.snapshot().config, gumBudget: 4 } }));
      assert.deepEqual(await blueprint(), bridge);
      assert.match(await root.locator('.q-meter').textContent(), /1 gum short/);
      await button('Test machine').click();
      assert.equal((await state()).mode, 'build');
      assert.match(await root.locator('.q-status').textContent(), /Unstick.*add more gum/);
      assert.deepEqual(await blueprint(), bridge);
      await canvas.focus();
      await page.keyboard.press(']');
      await button('Detach selected part').click();
      assert.equal((await state()).gumRemaining, 0);
      await undo();
      assert.deepEqual(await blueprint(), bridge, 'undo remains available when over budget');
      await page.evaluate(() => FG.app.openGame('gum', { config: { ...FG.runtime.snapshot().config, gumBudget: 10 } }));

      // Each mission has its own persisted design. Music preference survives reload too.
      await root.getByRole('combobox', { name: 'Choose construction challenge' }).selectOption('free');
      assert.deepEqual(await blueprint(), free);
      await button('Toggle music').click();
      const music = (await state()).audio.music;
      await page.reload();
      await page.waitForFunction(() => window.FG?.app);
      await page.evaluate(() => FG.app.openGame('gum', {config:{qualityVersion:1,gravity:10,thrust:1,originalRules:true,gumBudget:10,jointStrength:1,highlightMatches:false,extraDecoys:0}}));
      assert.equal((await state()).mission, 'free');
      assert.deepEqual(await blueprint(), free);
      assert.equal((await state()).audio.music, music);

      // Save failure stays visible while edits continue; a later successful save clears it.
      const savedBeforeFailure = await page.evaluate(() => JSON.stringify(FG.store.current().constructionStates['original-gum']));
      await page.evaluate(() => { window.qualityBuilderSave = FG.store.save; FG.store.save = () => false; });
      await button('Add Bottle').click();
      assert.equal(await root.locator('.q-save-notice').isVisible(), true);
      await page.keyboard.press('r');
      assert.equal(await root.locator('.q-save-notice').isVisible(), true, 'ordinary edit messages do not hide the save warning');
      assert.match(await root.locator('.q-save-notice').textContent(), /could not save.*earlier saved build is safe/);
      assert.equal(await page.evaluate(() => JSON.stringify(FG.store.current().constructionStates['original-gum'])), savedBeforeFailure);
      await page.evaluate(() => { FG.store.save = window.qualityBuilderSave; delete window.qualityBuilderSave; });
      await undo();
      assert.equal(await root.locator('.q-save-notice').isVisible(), false, 'successful saving clears the warning');
      await undo();
      assert.deepEqual(await blueprint(), free);

      // Unsupported future data is retained verbatim until a deliberate fresh/example choice.
      await page.evaluate(() => {
        FG.app.openGame('buckets');
        FG.store.current().constructionStates['original-gum'] = { legacyMarker: 'retain me', qualityConstruction: { schema: 'future-version', payload: { keep: true } } };
        FG.store.save();
        FG.app.openGame('gum', {config:{qualityVersion:1,gravity:10,thrust:1,originalRules:true,gumBudget:10,jointStrength:1,highlightMatches:false,extraDecoys:0}});
      });
      assert.equal((await state()).storageBlocked, true);
      assert.equal(await button('Test machine').isDisabled(), true);
      await page.evaluate(() => FG.app.openGame('buckets'));
      assert.deepEqual(await page.evaluate(() => FG.store.current().constructionStates['original-gum']), { legacyMarker: 'retain me', qualityConstruction: { schema: 'future-version', payload: { keep: true } } });
      await page.evaluate(() => FG.app.openGame('gum', {config:{qualityVersion:1,gravity:10,thrust:1,originalRules:true,gumBudget:10,jointStrength:1,highlightMatches:false,extraDecoys:0}}));
      await button('Use example').click();
      assert.equal((await state()).storageBlocked, false);
      assert.equal(await page.evaluate(() => FG.store.current().constructionStates['original-gum'].legacyMarker), 'retain me');
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS quality builder ${mobile ? 'touch' : 'desktop'}: editing, keyboard gum/focus recovery, undo, cancellation, real physics/three missions, explicit finish, paused redraw/resize/editing, persistence, future-data protection`);
    }
  } finally {
    await browser?.close();
    server?.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const repo = path.resolve(__dirname, '../..');
const output = path.join(repo, 'test-results/ui-review/connected-learning');
const { chromium } = require(path.join(repo, 'node_modules/playwright'));
const { standaloneInput } = require(
  path.join(repo, 'tools/ui-review/standalone-input.cjs'),
);

async function artworkIdentities(frame) {
  return frame.evaluate(async () => {
    const db = await new Promise((yes, no) => {
      const open = indexedDB.open('family-private-drawings-v1');
      open.onsuccess = () => yes(open.result);
      open.onerror = () => no(open.error);
    });
    try {
      const records = await new Promise((yes, no) => {
        const read = db
          .transaction('drawings')
          .objectStore('drawings')
          .getAll();
        read.onsuccess = () => yes(read.result);
        read.onerror = () => no(read.error);
      });
      return records
        .map((record) => [record.id, record.sha256])
        .sort((a, b) => a[0].localeCompare(b[0]));
    } finally {
      db.close();
    }
  });
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const input = await standaloneInput(
    path.join(repo, 'dist-review/jems-ui-review.html'),
  );
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    args: ['--no-sandbox'],
  });
  const receipts = [],
    errors = [],
    external = [];
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
      if (/^https?:/.test(r.url()) && r.url() !== input.url)
        external.push(r.url());
    });
    await page.goto(input.url, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    await page.waitForFunction(
      () => document.querySelector('#loading').hidden,
      undefined,
      { timeout: 120000 },
    );
    for (const [subject, grade] of [
      ['math', 1],
      ['language', 3],
    ]) {
      if ((await page.locator('#grade').inputValue()) !== String(grade)) {
        await page.selectOption('#grade', String(grade));
        await page.waitForFunction(
          () => document.querySelector('#loading').hidden,
        );
      }
      await page.selectOption('#destination', 'creative:fork-world');
      const app = page
        .frames()
        .find((f) => f.parentFrame() === page.mainFrame());
      await app.waitForFunction(
        () => FG.creation.scene()?.actors.some((a) => a.name === 'My Dragon'),
        undefined,
        { timeout: 25000 },
      );
      const scene = await app.evaluate(() => FG.creation.scene());
      const owner = await app.evaluate(
        ({ subject, grade }) => {
          // The synthetic family sets the normal subject and frequency through its existing profile.
          if (FG.store.current().grade !== grade)
            throw Error('Synthetic scenario did not apply selected grade.');
          FG.store.changeProfile({
            learningSubject: subject,
            rate: 1,
            ...(subject === 'language'
              ? { languageFocus: ['g3-text-evidence'] }
              : {}),
          });
          const profile = FG.store.current();
          profile.mathWindow = [];
          FG.store.save();
          return profile.id;
        },
        { subject, grade },
      );
      const drawings = await artworkIdentities(app);
      assert.ok(drawings.length >= 3);
      assert.ok(scene.actors.some((a) => a.assetId.startsWith('art:')));
      await app.locator('#creationRun').click();
      const dialog = app.locator('#creationLearning:modal');
      await dialog.waitFor({ timeout: 15000 });
      const work = dialog.locator('.learning-workspace');
      assert.equal(await work.getAttribute('data-subject'), subject);
      const attempt = await app.evaluate(() => FG.learning.activeAttemptId);
      assert.ok(attempt);
      if (subject === 'math') {
        const scratch = dialog.locator('.learning-scratchpad');
        await scratch.locator('summary').click();
        await scratch.locator('canvas').focus();
        await page.keyboard.press('Enter');
        const undo = scratch.getByRole('button', { name: 'Undo', exact: true });
        assert.ok(await undo.isEnabled());
        await undo.click();
        await scratch
          .getByRole('button', { name: 'Redo', exact: true })
          .click();
      } else {
        const directions = dialog.getByRole('button', {
          name: 'Hear directions',
          exact: true,
        });
        await directions.waitFor();
        if (await directions.isEnabled()) await directions.click();
        assert.ok(await dialog.locator('.workspace-question').isVisible());
      }
      await page
        .locator('#appFrame')
        .screenshot({ path: path.join(output, subject + '-activity.png') });
      await dialog.locator('[data-action="show-solution"]').click();
      await dialog.locator('[data-action="continue-supported"]').click();
      await app.waitForFunction(
        () =>
          !FG.learning.active &&
          !document.querySelector('#creationLearning').open,
      );
      assert.deepEqual(await app.evaluate(() => FG.creation.scene()), scene);
      assert.deepEqual(
        await artworkIdentities(app),
        drawings,
        'Transient scratch work must leave all private artwork identities and digests unchanged.',
      );
      const evidence = await app.evaluate(
        ({ attempt, subject }) => {
          const profile = FG.store.current();
          const records =
            subject === 'math'
              ? profile.learning.attempts
              : profile.language.attempts;
          const result = records.find((a) => a.id === attempt);
          return {
            owner: profile.id,
            outcome: result?.outcome,
            independent: result?.independent,
            context: result?.context,
          };
        },
        { attempt, subject },
      );
      assert.equal(evidence.owner, owner);
      assert.equal(evidence.outcome, 'shown');
      assert.equal(evidence.independent, false);
      assert.equal(evidence.context.projectId, scene.id);
      await page
        .locator('#appFrame')
        .screenshot({ path: path.join(output, subject + '-returned.png') });
      receipts.push({
        subject,
        grade,
        owner,
        project: scene.id,
        world: scene.world,
        actors: scene.actors.length,
        originalPins: drawings,
        attempt,
        evidence,
      });
      console.log(
        'PASS',
        subject,
        'grade',
        grade,
        'returned to the unchanged authored world, private originals and selected profile',
      );
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally {
    fs.writeFileSync(
      path.join(output, 'receipt.json'),
      JSON.stringify({ receipts, errors, external }, null, 2),
    );
    await browser.close();
    await input.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

/* Shared ordinary-play fixture for suites whose subject is host learning,
 * making or rewards. The authored catalog supplies a solution; every part,
 * seam, launch and completion still uses the actual child-facing control.
 * No save, outcome, reward or timer duration is invented by this helper.
 */
require('tsx/cjs');
const assert = require('node:assert/strict');
const { createBuild, getBlueprint, TOUR_DURATION_MS } = require('../src/games/bubble-gum-rules.ts');

exports.buildAndRide = async function buildAndRide(page, { touch = false, clockInstalled = false } = {}) {
  const root = page.locator('.gum-builder');
  await root.waitFor();
  const read = () => page.evaluate(() => FG.runtime.snapshot().state);
  const activate = control => touch ? control.tap() : control.click();
  const showPart = async part => {
    const choice = root.locator(`[data-gum-part="${part}"]`);
    const count = await root.locator('[data-gum-part]').count();
    for (let pageIndex = 0; pageIndex <= Math.ceil(count / 3); pageIndex++) {
      if (await choice.isVisible()) return choice;
      const more = root.locator('.gum-build-more-pieces');
      assert.ok(await more.isVisible(), 'later object choices have a usable More pieces control');
      await activate(more);
    }
    throw Error(`The object tray never exposed ${part}`);
  };
  for (let index = 0; index < 24; index++) {
    const state = await read();
    assert.equal(state.mode, 'assembly');
    if (!state.activeSlot && !state.activeJoint) break;
    assert.ok(await root.locator('.gum-build-launch').isDisabled(), 'the host journey cannot launch unfinished construction');
    if (state.activeJoint) {
      await activate(root.locator(`[data-gum-joint="${state.activeJoint}"]`));
      await page.waitForFunction(slot => !!FG.runtime.snapshot().state.bonds[slot], state.activeJoint);
    } else {
      const blueprint = getBlueprint({ ...createBuild(state.completedCount, state.blueprint), placed: state.placed, bonds: state.bonds });
      const slot = blueprint.slots.find(item => item.id === state.activeSlot);
      const part = state.availableChoices.find(id => slot.accepts.includes(id));
      assert.ok(part, 'a visible piece must actually fit the active construction role');
      await activate(await showPart(part));
      await activate(root.locator(`[data-gum-slot="${slot.id}"]`));
      await page.waitForFunction(({ slot, part }) => FG.runtime.snapshot().state.placed[slot] === part, { slot: slot.id, part });
    }
  }
  assert.ok(await root.locator('.gum-build-launch').isEnabled(), 'the child completed every part and join');
  const built = await read();
  await activate(root.locator('.gum-build-launch'));
  await page.waitForFunction(() => FG.runtime.snapshot().state.stage === 'adventure');
  if (clockInstalled) await page.clock.runFor(TOUR_DURATION_MS + 250);
  await page.waitForFunction(() => FG.runtime.snapshot().state.stage === 'showcase', null, { timeout: 45000 });
  const enjoyed = await read();
  assert.ok(enjoyed.tourElapsedMs >= TOUR_DURATION_MS, 'the actual adventure was completed');
  assert.deepEqual(enjoyed.placed, built.placed, 'all chosen objects stay with the invention');
  assert.deepEqual(enjoyed.bonds, built.bonds, 'all gum joints stay with the invention');
  assert.equal(enjoyed.reported, false, 'the host is not credited before the child moves on');
  await activate(root.locator('.gum-build-next'));
  return { blueprint: built.blueprint, placed: built.placed, bonds: built.bonds };
};

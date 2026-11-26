const assert = require('node:assert/strict');

/** Submit the reviewed value using the controls for the item's actual presentation. */
exports.answerLanguageChoice = async (activity, answer) => {
  const value = String(answer);
  const evidence = activity.locator('[data-action="check-evidence"]');
  const beats = activity.locator('[data-action="check-beats"]');
  if (await evidence.count()) {
    await activity.getByRole('button', {name: value, exact: true}).click();
    await evidence.click();
    return;
  }
  if (await beats.count()) {
    const count = Number(value);
    assert.ok(Number.isSafeInteger(count) && count > 0, 'Sound counts must be positive integers');
    for (let i = 0; i < count; i++) await activity.locator('.language-beat-tap').click();
    await beats.click();
    return;
  }

  const choices = activity.locator('.language-choice');
  const values = await choices.evaluateAll(nodes => nodes.map(node => node.dataset.value));
  const index = values.indexOf(value);
  assert.ok(index >= 0, 'The reviewed item must contain its exact answer value');
  await choices.nth(index).click();
  const check = activity.locator('[data-action="check-gap"]');
  if (await check.count()) await check.click();
};

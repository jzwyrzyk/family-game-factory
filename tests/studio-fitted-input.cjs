const assert = require('node:assert/strict');

async function clickFittedControl(page, selector) {
  const control = page.locator(selector);
  const target = await control.evaluate(async element => {
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    const point = () => {
      const box = element.getBoundingClientRect();
      const x = box.left + box.width / 2, y = box.top + box.height / 2;
      const hit = document.elementFromPoint(x, y);
      return {x, y, width: box.width, height: box.height, reachable: Boolean(hit && element.contains(hit))};
    };
    const before = point();
    if (!before.reachable) element.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'instant'});
    await frame();
    const first = point();
    await frame();
    const second = point();
    return {first, second, enabled: !element.matches(':disabled, [aria-disabled="true"]')};
  });
  assert.ok(target.enabled && target.first.reachable && target.second.reachable,
    'The fitted control must be enabled and under the pointer: ' + selector + ' ' + JSON.stringify(target));
  assert.ok(Math.abs(target.first.x - target.second.x) < 1 && Math.abs(target.first.y - target.second.y) < 1,
    'The fitted control moved between frames: ' + selector + ' ' + JSON.stringify(target));
  await page.mouse.click(target.second.x, target.second.y);
}

module.exports = {clickFittedControl};

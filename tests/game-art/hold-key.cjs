// The trusted sample advances by simulation ticks, including on a busy renderer.
async function holdGameKey(page, canvas, key, steps) {
  const frame = await (await canvas.elementHandle()).ownerFrame();
  const start = Number(await canvas.getAttribute('data-ticks'));
  await page.keyboard.down(key);
  try {
    await frame.waitForFunction(target => {
      const field = document.querySelector('#game');
      return Number(field.dataset.ticks) >= target || document.querySelector('#status').dataset.state === 'won';
    }, start + steps, {timeout: 20000});
  } finally {
    await page.keyboard.up(key);
  }
}

module.exports = {holdGameKey};

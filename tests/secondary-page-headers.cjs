const assert = require('node:assert/strict');

// Run inside both the production bundle and the standalone review's application frame.
exports.checkSecondaryHeaders = async function ({page, app, out, name, width, height, offline}) {
 const pages = [
  ['journey', '#page-jems-journey'], ['pals', '#page-jems-pals'],
  ['rewards', '#page-jems-rewards'], ['powers', '#page-lab'],
 ];
 let reference;
 const scope = offline ? 'offline' : 'app';
 for (const [section, selector] of pages) {
  if (section !== 'journey') {
   const link = app.locator('#page-jems-journey [data-journey-section="' + section + '"]');
   if (name === 'phone') await link.tap(); else await link.click();
  }
  const header = app.locator(selector + ' .jems-page-header');
  await header.waitFor();
  const heading = header.locator('h1');
  if (section === 'pals') await app.waitForFunction(()=>document.querySelector('.pals-starter-grid .pals-portrait')?.dataset.state === 'ready');
  if (section !== 'powers') await app.waitForFunction(id=>document.activeElement === document.querySelector(id+' h1'), selector);
  // A learning question may own initial focus on My Powers. Test the ordinary title independently.
  await heading.focus();
  await app.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
  const metrics = await heading.evaluate(node => {
   const box = node.getBoundingClientRect(), style = getComputedStyle(node);
   const header = node.parentElement, back = header.querySelector('button').getBoundingClientRect();
   const description = header.querySelector('p');
   return {
    viewport: [innerWidth, innerHeight], x: box.x, y: box.y, font: style.font,
    color: style.color, descriptionFont: getComputedStyle(description).font,
    left: description.getBoundingClientRect().x, backX: back.x, backY: back.y,
    backHeight: back.height, outline: style.outlineStyle,
   };
  });
  assert.deepEqual(metrics.viewport, [width,height], name + ' real application viewport');
  assert.equal(metrics.outline,'none', selector+' announcement target');
  assert.equal(metrics.backX,metrics.x); assert.equal(metrics.left,metrics.x); assert.ok(metrics.backHeight>=44);
  if (reference) {
   for (const field of ['x','y','font','color','descriptionFont','backX','backY'])
    assert.equal(metrics[field], reference[field], selector+' '+field+' at '+name);
  } else reference = metrics;
  await page.screenshot({path:out+'/'+scope+'-'+name+'-'+section+'.png', animations:'disabled'});
  await page.keyboard.press('Shift+Tab');
  assert.equal(await app.evaluate(()=>document.activeElement.matches('.jems-page-back:focus-visible') && getComputedStyle(document.activeElement).outlineStyle !== 'none'),true,'visible keyboard return action');
  if (section === 'journey') {
   await app.locator('#jemsChangeCharacter').focus();
   await page.keyboard.press('Enter'); await app.locator('.jems-character-dialog[open]').waitFor();
   await page.keyboard.press('Escape');
   await app.waitForFunction(()=>document.activeElement.id === 'jemsChangeCharacter');
  } else {
   await page.keyboard.press('Enter');
   if (section === 'powers') {
    await app.locator('#studioJourneyTile').click();
   }
   await app.waitForFunction(()=>document.activeElement.id === 'jemsJourneyTitle');
  }
 }
};

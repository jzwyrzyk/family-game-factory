/** Shared visible journeys. No stored preference, product flag or hidden
 * control is used to skip the child's first character choice.
 */
async function waitForWelcome(page){
 await page.waitForFunction(()=>document.getElementById('page-studio-library')?.getAttribute('aria-busy')==='false');
}
exports.waitForWelcome=waitForWelcome;
exports.exploreWelcome=async function exploreWelcome(page){
 await waitForWelcome(page);
 const welcome=page.locator('#studioWelcome');
 if(await welcome.isVisible()){
  await page.locator('[data-welcome-character="spark"]').click();
  await page.locator('#studioWelcomeMake').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.getElementById('studioWelcomeMake')?.disabled===false);
  // A deliberate Home action remains available after the character is saved.
  // This exercises the normal library without creating a throwaway project.
  await page.locator('#homeBtn').click();
  await welcome.waitFor({state:'hidden'});
 }
};
exports.completeWelcome=async function completeWelcome(page,character='spark'){
 await waitForWelcome(page);
 if(await page.locator('#studioWelcome').isVisible()){
  await page.locator(`[data-welcome-character="${character}"]`).click();
  await page.waitForFunction(()=>document.getElementById('studioWelcomeMake')?.disabled===false);
  await page.locator('#studioWelcomeMake').click();
  await page.locator('#page-studio').waitFor({state:'visible'});
 }
};
exports.navigate=async function navigate(page,id){
 const selector=id.startsWith('#')?id:'#'+id;
 const target=page.locator(selector);
 if(!await target.isVisible())await page.locator('#studioNavMenu').click();
 await target.click();
};

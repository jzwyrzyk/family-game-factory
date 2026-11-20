/** Ordinary-library suites explicitly take the same optional escape a child can.
 * First-creation acceptance deliberately does not call this on initial entry.
 * No stored preference, product flag, or hidden control bypass is introduced.
 */
exports.exploreWelcome=async function exploreWelcome(page){
 const welcome=page.locator('#studioWelcome');
 if(await welcome.isVisible()){
  await page.locator('#studioWelcomeExplore').click();
  await welcome.waitFor({state:'hidden'});
 }
};

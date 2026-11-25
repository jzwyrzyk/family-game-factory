/** Synthetic authorized parent for existing offline learning tests. The preview
 * integration suite separately exercises the real gateway verification path. */
exports.authorizeLearningParent=async page=>{
 await page.waitForFunction(()=>typeof window.FG?.verifyParentSettings==='function');
 await page.evaluate(()=>{window.FG.verifyParentSettings=async()=>{};});
};

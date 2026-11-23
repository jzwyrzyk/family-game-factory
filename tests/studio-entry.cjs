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
 // Active play has its own visible exit. Global destinations return after the
 // child leaves through that guarded, save-aware route.
 if(await page.locator('#page-studio.studio-play-mode').isVisible())await page.locator('#studioHome').click();
 if(await page.locator('#page-creation.has-scene').isVisible())await page.locator('#creationHome').click();
 if(!await target.isVisible())await page.locator('#studioNavMenu').click();
 await target.click();
};
exports.openProfiles=async function openProfiles(page,activate=target=>target.click()){
 if(await page.locator('#page-studio.studio-play-mode').isVisible()){
  const more=page.locator('#studioMore');
  if(!await more.evaluate(node=>node.open))await activate(more.locator(':scope > summary'));
 }
 const profiles=page.locator('#studioProfileMenu');
 if(!await profiles.evaluate(node=>node.open))await activate(profiles.locator(':scope > summary'));
 await page.locator('#profile-choices').waitFor({state:'visible'});
};
/** Send the fixture child's own words through the same composer they use.
 * Reading the notebook verifies durability; this helper never changes a plan,
 * approves a build, supplies a coach answer, or bypasses a readiness decision.
 */
exports.sendChildMessage=async function sendChildMessage(page,text){
 const before=await page.evaluate(()=>{
  const notebook=FG.studio.exportNotebook(),owner=FG.store.current().id;
  const session=notebook.sessions.find(item=>item.owner===owner&&item.id===notebook.active[owner]);
  if(!session)throw Error('Open a creation conversation before sending a child message');
  return {owner,id:session.id,messageIds:session.messages.map(message=>message.id)};
 });
 await page.locator('#studioPrompt').fill(text);
 await page.locator('#studioTalk').click();
 await page.waitForFunction(({before,text})=>{
  const notebook=FG.studio.exportNotebook();
  if(FG.store.current().id!==before.owner||notebook.active[before.owner]!==before.id)return false;
  const session=notebook.sessions.find(item=>item.owner===before.owner&&item.id===before.id);
  const turn=session?.messages.findIndex(message=>message.role==='child'&&message.text===text.trim()&&!before.messageIds.includes(message.id));
  if(turn===undefined||turn<0)return false;
  const answered=session.messages.slice(turn+1).some(message=>message.role==='helper');
  return answered&&!document.getElementById('coachModeStatus')?.classList.contains('is-thinking');
 },{before,text});
 return page.evaluate(({owner,id})=>FG.studio.exportNotebook().sessions.find(item=>item.owner===owner&&item.id===id),before);
};

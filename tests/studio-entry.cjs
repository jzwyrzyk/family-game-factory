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
 if(await page.locator('#page-studio-library').isVisible())await waitForWelcome(page);
 if(await page.locator('#page-studio.studio-play-mode').isVisible())await page.locator('#studioHome').click();
 if(await page.locator('#page-creation.has-scene').isVisible())await page.locator('#creationHome').click();
 const sections={'#studioNavPals':'pals','#studioNavRewards':'rewards','#studioNavPowers':'powers','#jemsRewardsWidget':'rewards'};
 if(sections[selector]){
  const current=page.locator('.page:not(.hidden) [data-journey-section="'+sections[selector]+'"]');
  if(await current.isVisible()){await current.click();return;}
  await exports.navigate(page,'#studioNavJourney');
  await page.locator('#page-jems-journey [data-journey-section="'+sections[selector]+'"]').click();return;
 }
 if(selector==='#studioNavProblemSolving'){
  if(await page.locator('#journeyExperimentPractice').isVisible()){await page.locator('#journeyExperimentPractice').click();return;}
  await exports.navigate(page,'#studioNavScenes');
  await page.locator('#creationTryIdea').click();return;
 }
 const target=page.locator(selector);
 if(!await target.isVisible())await page.locator('#studioNavMenu').click();
 await target.click();
 if(selector==='#studioNavScenes'&&await page.locator('#creationIntroduction').isVisible())await page.locator('#creationIntroSkip').click();
};
/** Retained games are on My Games; no record is created by opening the shelf. */
exports.openRetainedGame=async function openRetainedGame(page,game,activate=target=>target.click()){
 if(!['buckets','dragon'].includes(game))throw Error('Choose a retained native game');
 if(await page.locator('#page-studio.studio-play-mode').isVisible())await activate(page.locator('#studioHome'));
 if(await page.locator('#page-creation').isVisible())await activate(page.locator('#creationHome'));
 if(!await page.locator('#studioOriginals').isVisible())await activate(page.locator('#studioNavHome'));
 await activate(page.locator(`#studioOriginals [data-starter="${game}"]`));
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

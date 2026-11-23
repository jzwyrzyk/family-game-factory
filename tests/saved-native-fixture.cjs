const {navigate}=require('./studio-entry.cjs');

/** Synthetic pre-existing saves keep compatibility coverage after a game leaves
 * the default shelf. Entry still uses the real, visible saved-game card. */
exports.openSavedNative=async function openSavedNative(page,game,saved={}){
 const id=await page.evaluate(({game,saved})=>{
  const configs={moon:{donutGoal:6,moonGravity:.6,meteorRate:1,bouncePads:false},robot:{robotSpeed:1,showTrail:true,portalEnabled:false}};
  if(!configs[game])throw Error('Only retired native fixtures belong here');
  const owner=FG.store.current().id,n=FG.studio.exportNotebook();
  const existing=n.sessions.find(s=>s.owner===owner&&s.game===game&&s.name==='Saved '+game+' fixture');
  if(existing)return existing.id;
  const workspace=JSON.parse(localStorage.getItem('family-game-factory-workspace-v2')||'{"version":2,"projects":[],"revisions":[],"plays":[]}');
  const projectId=crypto.randomUUID(),revisionId=crypto.randomUUID(),id=crypto.randomUUID(),at=new Date().toISOString();
  workspace.projects.push({id:projectId,owner,game,name:'Saved '+game+' fixture',headId:revisionId});
  workspace.revisions.push({id:revisionId,projectId,parentId:null,config:configs[game],label:'Earlier saved game',hypothesis:'',createdAt:at,state:'private'});
  FG.factory.validateWorkspace(workspace);
  const messages=saved.childMessage?[{id:crypto.randomUUID(),role:'child',text:saved.childMessage,at}]:[];
  n.sessions.push({id,owner,game,name:'Saved '+game+' fixture',projectId,remoteId:null,candidate:null,draft:saved.draft||'',messages,job:null,updated:at,hypothesis:'',reflection:false,playOnly:saved.playOnly??false});
  localStorage.setItem('family-game-factory-workspace-v2',JSON.stringify(workspace));
  localStorage.setItem('family-game-factory-studio-v1',JSON.stringify(n));
  return id;
 },{game,saved});
 await navigate(page,'#studioNavHome');
 await page.locator(`[data-session="${id}"] .studio-saved-open`).click();
 return id;
};

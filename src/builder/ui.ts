import {setIconLabel,type IconName} from '../brand/icons';
import { attachPreviewLearning } from '../learning/remote';
import { interpretLearningRequest } from '../learning/policy';
import { BuilderClient,validateBuilderConfig,type RequestChange,type JobView,type BuilderConfig } from './client';
import {installParentPrivacy} from './privacy';
import {configureAnalytics} from '../analytics/client';
import {installAnalyticsPrivacy} from '../analytics/privacy';
import {profileStorage} from '../adult-pilot/storage';
import type { LearningMode } from '../learning/types';
const FG=(window as any).FG;
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const messages:Record<string,string>={queued:'Your request is in the builder queue.',building:'The builder is making a private candidate.',testing:'Checking that the new game works safely.',ready:'Your playable preview is ready. Try it, then Keep it or go back.',failed:'That build did not work. Your current game is safe.',cancelled:'Build cancelled. Your current game is safe.'};
const errorMessage=(error:Error)=>error.message==='BUILDER_UNAVAILABLE'?'Needs builder: a secure builder is not connected. No job was queued. You can keep your idea and carry on playing.':error.message==='PRIVATE_INFORMATION'?'Keep names, contact details and secrets out of game ideas. Please change your request.':error.message==='SPENDING_CUTOFF'?'The builder has reached its allowance. Your current game is safe.':'The builder is unavailable or could not finish. Your current game is safe. No success has been claimed.';
export async function initBuilder(){
 const panel=document.createElement('section');panel.id='builderPanel';panel.className='panel';panel.hidden=true;panel.innerHTML='<h2>Try a new game</h2><p id="builderMode"></p><p id="builderStatus" role="status" aria-live="polite"></p><div class="example-choices"><button class="btn secondary" id="cancelBuild" hidden>Cancel build</button><button class="btn secondary" id="retryBuild" hidden>Try build again</button><button class="btn primary" id="openReadyBuild" hidden>Try ready preview</button></div><div id="builderPreview" hidden><p id="previewOutcome" role="status"></p><iframe id="generatedPreview" title="Private playable game preview" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe><div class="example-choices"><button class="btn primary" id="keepBuild">Keep this game</button><button class="btn secondary" id="undoBuild">Undo kept change</button><button class="btn secondary" id="backFromBuild">Back to my game</button></div><button class="btn secondary" id="compareBuild">Compare with previous version</button><p id="buildComparison" role="status"></p><form id="forkBuildForm"><label for="builtGameName">Name your new game</label><input id="builtGameName" maxlength="60" required value="My Star Game"><button class="btn secondary" type="submit">Save as new builder game</button></form><form id="reviseBuildForm"><label for="reviseBuildPrompt">What would you change in this new game?</label><input id="reviseBuildPrompt" maxlength="2000" minlength="5" required placeholder="Catch six stars"><button class="btn primary" type="submit">Try It</button></form></div>';
 $('page-create').querySelector('.page-head')!.after(panel);
 setIconLabel(panel.querySelector('h2')!,'play','Try a new game');
 const buildActions: Array<[string,IconName,string,string?]> = [
  ['cancelBuild','close','Cancel build'],['retryBuild','retry','Try build again'],
  ['openReadyBuild','play','Try ready preview'],['keepBuild','save','Keep this game'],
  ['undoBuild','undo','Undo kept change'],['backFromBuild','arrow','Back to my game','jems-icon--back'],
  ['compareBuild','grid','Compare with previous version']
 ];
 for(const [id,icon,label,className] of buildActions)setIconLabel($(id),icon,label,className);
 setIconLabel(panel.querySelector<HTMLButtonElement>('#forkBuildForm button')!,'save','Save as new builder game');
 setIconLabel(panel.querySelector<HTMLButtonElement>('#reviseBuildForm button')!,'play','Try It');
 const library=document.createElement('div');library.id='builtGames';library.className='panel';library.innerHTML='<h2>My builder games</h2><p id="builderLibraryStatus">A connected private builder can keep games here.</p><div id="builderGames"></div>';$('page-creations').querySelector('.page-head')!.after(library);
 setIconLabel(library.querySelector('h2')!,'grid','My builder games');
 const create=document.createElement('button');create.type='button';create.id='createTry';create.className='btn primary';setIconLabel(create,'play','Try It');$('inventIdea').after(create);
 let config:BuilderConfig;try{config=validateBuilderConfig(await (await fetch(new URL('factory-config.json',document.baseURI))).json());}catch{config=validateBuilderConfig({version:1,mode:'unavailable'});}
 configureAnalytics(config);
 let previewLearning:ReturnType<typeof attachPreviewLearning>|null=null;
 let readyPreview:{revisionId:string;owner:string;inheritedMode?:LearningMode;jobId?:string}|null=null;
 const pendingKey='family-game-factory-pending-build-v1';let currentKind='star-catcher-v1';let previewSequence=0,profileSequence=0;let currentRevision:string|null=null,currentProject:string|null=null,channel='',artifactId='',previewOwner='',previousPage='create';
 let currentPage=document.querySelector('main > .page:not(.hidden)')?.id.replace(/^page-/,'')||'home';
 function makeClient(){const owner=FG.store.current().id,at=profileSequence;return new BuilderClient(config,job=>{if(at!==profileSequence||owner!==FG.store.current().id)return;void update(job).catch(error=>{if(at===profileSequence&&owner===FG.store.current().id)showError(error);});});}
 let client=makeClient();
 const mathKey=()=>currentProject?'remote:'+currentProject:null;
 const operation=()=>({owner:FG.store.current().id,page:previousPage,sequence:previewSequence,revision:currentRevision,client});
 const stillCurrent=(at:ReturnType<typeof operation>)=>at.owner===FG.store.current().id&&at.page===currentPage&&at.page===previousPage&&at.sequence===previewSequence&&at.revision===currentRevision&&!panel.hidden;
 function showError(err:Error){if(err.message==='NO_PREVIOUS_VERSION'){$('builderStatus').textContent='This is your first builder version. Your game is safe.';return;}$('builderStatus').textContent=errorMessage(err);$('cancelBuild').hidden=true;$('retryBuild').hidden=true;}
 function move(page:string){$('page-'+page).querySelector('.page-head')!.after(panel);panel.hidden=false;previousPage=page;}
 function mathBusy(){if(!FG.learning?.active)return false;$('builderStatus').textContent='Finish the current learning activity before changing this game.';FG.learning.focus?.();return true;}
 function queuePreview(revisionId:string,inheritedMode?:LearningMode,jobId?:string){readyPreview={revisionId,owner:FG.store.current().id,inheritedMode,jobId};$('openReadyBuild').hidden=false;}
 $('openReadyBuild').onclick=()=>{const ready=readyPreview;if(!ready||ready.owner!==FG.store.current().id||mathBusy())return;void showPreview(ready.revisionId,ready.inheritedMode).catch(error=>{if(ready.owner===FG.store.current().id)showError(error);});};

 async function update(job:JobView){
  $('builderMode').textContent=job.adapter==='mock'?'Test builder (mock) — this is not real AI generation.':'Private workshop · acknowledged job';$('builderStatus').textContent=job.phase==='repairing'?'That version needed a fix. The builder is trying again.':job.status==='failed'&&job.errorCode==='PROVIDER_RATE_LIMIT'?'The builder is busy. Your current game is safe. Try again in a little while.':job.status==='failed'&&job.errorCode==='SPENDING_CUTOFF'?'The workshop has reached its allowance. Your current game is safe.':messages[job.status]||'Your current game is safe.';try{if(['failed','cancelled'].includes(job.status))profileStorage(localStorage).removeItem(pendingKey);else profileStorage(localStorage).setItem(pendingKey,JSON.stringify({owner:FG.store.current().id,api:config.apiBaseUrl,jobId:job.jobId}));}catch{}$('cancelBuild').hidden=!['queued','building','testing'].includes(job.status);$('retryBuild').hidden=job.status!=='failed';
  if(job.status==='ready'&&job.revisionId){
   queuePreview(job.revisionId,undefined,job.jobId);
   // First previews may open in the waiting view; a background revision never
   // replaces an existing game or learning activity without the child's choice.
   if(!currentRevision&&!FG.learning?.active)await showPreview(job.revisionId);
   else $('builderStatus').textContent='Your next preview is ready. Keep playing, or choose Try ready preview.';
  }
 }
 async function showPreview(revisionId:string,inheritedMode?:LearningMode){
  if(FG.store.loadError)throw Error(FG.store.loadError);
  if(currentPage!==previousPage||panel.hidden)return;
  if(mathBusy()){queuePreview(revisionId,inheritedMode,readyPreview?.revisionId===revisionId?readyPreview.jobId:undefined);return;}
  const sequence=++previewSequence,owner=FG.store.current().id,page=previousPage,preview=await client.preview(revisionId);
  if(sequence!==previewSequence||owner!==FG.store.current().id||page!==previousPage||page!==currentPage||panel.hidden)return;
  if(mathBusy()){queuePreview(revisionId,inheritedMode,readyPreview?.revisionId===revisionId?readyPreview.jobId:undefined);return;}
  const project=preview.projectId||revisionId,key='remote:'+project,profile=FG.store.current();
  // Preserve the previous global choice only as a default; each game gets its own durable key.
  const inherited=inheritedMode??(Object.hasOwn(profile.mathModes||{},'builder-generated')?FG.learning.modeFor('builder-generated'):undefined);
  if(!Object.hasOwn(profile.mathModes||{},key)&&inherited)FG.learning.setMode(key,inherited);
  $('builderMode').textContent=preview.adapter==='mock'?'Test builder (mock) — this is not real AI generation.':'Private workshop · confirmed preview';
  previewLearning?.dispose();previewLearning=null;
  currentKind=preview.kind||'star-catcher-v1';currentRevision=revisionId;currentProject=project;
  const frame=$<HTMLIFrameElement>('generatedPreview');frame.style.height=(currentKind==='generated-module-v1'||currentKind==='generated-module-v2')?'720px':'520px';
  channel=crypto.randomUUID();artifactId=preview.artifactId;previewOwner=owner;const url=new URL(preview.url);url.searchParams.set('channel',channel);frame.src=url.href;
  previewLearning=attachPreviewLearning(frame,{channel,artifactId,ownerId:previewOwner,gameId:'generated',projectId:key,versionId:revisionId,onRound:d=>{$('previewOutcome').textContent=currentKind==='star-catcher-v1'?`You caught ${d.score} stars! Keep it or try your own next change.`:`You ${d.won?'finished':'tried'} this round. Score: ${d.score}. Keep it or try your next change.`;}});
  let mathMode=$('builderMathMode');if(!mathMode){mathMode=document.createElement('div');mathMode.id='builderMathMode';frame.before(mathMode);}
  FG.learning.modeControl(mathMode,key);$('builderPreview').hidden=false;$('previewOutcome').textContent='Play the preview. It has not replaced your current game.';
  if(readyPreview?.revisionId===revisionId&&readyPreview.owner===owner){if(readyPreview.jobId)try{const saved=JSON.parse(profileStorage(localStorage).getItem(pendingKey)||'null');if(saved?.owner===owner&&saved.jobId===readyPreview.jobId)profileStorage(localStorage).removeItem(pendingKey);}catch{}readyPreview=null;$('openReadyBuild').hidden=true;}
  return true;
 }
 async function request(input:RequestChange,page=previousPage){const owner=FG.store.current().id,at=profileSequence;move(page);try{const mathRequest=interpretLearningRequest(input.prompt,FG.learning.subject);if(mathRequest?.kind==='required'){$('builderStatus').textContent=mathRequest.message;return;}if(mathRequest?.kind==='mode'){if(mathKey()&&input.baseRevisionId===currentRevision){FG.learning.setMode(mathKey(),mathRequest.mode);$('builderStatus').textContent='Learning format updated for the next safe learning moment.';}else $('builderStatus').textContent='Open the game you want to change, then choose its learning format.';return;}if(config.mode==='unavailable')throw Error('BUILDER_UNAVAILABLE');$('builderStatus').textContent='Sending your request. No queued job has been acknowledged yet.';await client.submit(input);}catch(err){if(owner===FG.store.current().id&&at===profileSequence)showError(err as Error);}}
 create.onclick=()=>{const idea=$<HTMLTextAreaElement>('inventIdea');if(!idea.reportValidity())return;void request({gameId:'new',baseRevisionId:null,prompt:idea.value},'create');};
 $('cancelBuild').onclick=()=>{void client.cancel().catch(showError);};$('retryBuild').onclick=()=>{void client.retry().catch(showError);};
 $('keepBuild').onclick=()=>{if(mathBusy())return;const at=operation();if(at.revision)void at.client.api('/v1/revisions/'+at.revision+'/keep',{}).then(()=>{if(!stillCurrent(at))return;$('builderStatus').textContent='Kept! Find your playable game in My Creations.';return refresh();}).catch(error=>{if(stillCurrent(at))showError(error);});};
 $('undoBuild').onclick=()=>{if(mathBusy())return;const at=operation();if(at.revision)void at.client.api('/v1/revisions/'+at.revision+'/undo',{}).then(async result=>{if(!stillCurrent(at)||!await showPreview(result.revisionId))return;if(at.owner!==FG.store.current().id||at.page!==currentPage||panel.hidden)return;$('builderStatus').textContent='Previous kept version restored.';return refresh();}).catch(error=>{if(at.owner===FG.store.current().id)showError(error);});};
 $('compareBuild').onclick=()=>{const at=operation();if(at.revision)void at.client.api('/v1/revisions/'+at.revision).then(async current=>{if(!current.parentId)throw Error('NO_PREVIOUS_VERSION');const before=await at.client.api('/v1/revisions/'+current.parentId);if(!stillCurrent(at))return;$('buildComparison').textContent=(current.game.kind==='generated-module-v1'||current.game.kind==='generated-module-v2')?`Before: ${before.game.title||'Original game'}. Now: ${current.game.title}. ${current.game.instructions}`:`Before: ${before.game.target} stars in ${before.game.seconds} seconds. Now: ${current.game.target} stars in ${current.game.seconds} seconds.`;}).catch(()=>{if(stillCurrent(at))$('buildComparison').textContent='No previous builder version to compare yet.';});};
 $('forkBuildForm').onsubmit=e=>{e.preventDefault();if(mathBusy())return;const at=operation(),inherited=mathKey()?FG.learning.modeFor(mathKey()):'checkpoint';if(at.revision)void at.client.api('/v1/revisions/'+at.revision+'/fork',{name:$<HTMLInputElement>('builtGameName').value}).then(async result=>{if(!stillCurrent(at)||!await showPreview(result.revisionId,inherited))return;if(at.owner!==FG.store.current().id||at.page!==currentPage||panel.hidden)return;$('builderStatus').textContent='Saved as a new builder game. Your original version is unchanged.';await refresh();}).catch(error=>{if(at.owner===FG.store.current().id)showError(error);});};
 $('backFromBuild').onclick=()=>{previewSequence++;previewLearning?.dispose();previewLearning=null;panel.hidden=true;$<HTMLIFrameElement>('generatedPreview').removeAttribute('src');FG.app.page('feedback');};
 $('reviseBuildForm').onsubmit=e=>{e.preventDefault();if(currentRevision)void request({gameId:(currentKind==='generated-module-v1'||currentKind==='generated-module-v2')?'generated-module':'star-catcher',baseRevisionId:currentRevision,prompt:$<HTMLInputElement>('reviseBuildPrompt').value});};
 window.addEventListener('message',event=>{if(event.source!==$<HTMLIFrameElement>('generatedPreview').contentWindow||previewOwner!==FG.store.current().id)return;const data=event.data;if(!data||data.type!=='factory-preview'||data.channel!==channel||data.artifactId!==artifactId)return;if(data.event==='ready'&&(currentKind==='generated-module-v1'||currentKind==='generated-module-v2')&&Number.isInteger(data.height)&&data.height>=300&&data.height<=1000)$<HTMLIFrameElement>('generatedPreview').style.height=Math.max(400,data.height+12)+'px';});
 async function refresh(){if(config.mode!=='remote')return;const owner=FG.store.current().id,at=profileSequence,source=client;try{const games=await source.api('/v1/creations');if(owner!==FG.store.current().id||at!==profileSequence)return;$('builderGames').replaceChildren();$('builderLibraryStatus').textContent='Private games from the connected family workspace.';for(const game of games){const button=document.createElement('button');button.className='btn secondary';setIconLabel(button,'play',game.name||((game.game.kind==='generated-module-v1'||game.game.kind==='generated-module-v2')?game.game.title:`Catch ${game.game.target} Stars`));button.onclick=()=>{move('create');FG.app.page('create');void showPreview(game.id).catch(showError);};$('builderGames').append(button);}}catch{if(owner===FG.store.current().id&&at===profileSequence)$('builderLibraryStatus').textContent='Private builder games are unavailable. Your local remixes are still here.';}}
 window.addEventListener('factory-page',event=>{const next=(event as CustomEvent<string>).detail;currentPage=next;if(next!==previousPage){previewSequence++;previewLearning?.dispose();previewLearning=null;$<HTMLIFrameElement>('generatedPreview').removeAttribute('src');$('builderPreview').hidden=true;panel.hidden=true;}if(next===previousPage&&readyPreview?.owner===FG.store.current().id)move(next);if(next==='creations')void refresh();});
 window.addEventListener('factory-profile',()=>{previewLearning?.dispose();previewLearning=null;previewSequence++;profileSequence++;client.disconnect();client=makeClient();readyPreview=null;$('openReadyBuild').hidden=true;currentRevision=null;currentProject=null;channel='';previewOwner='';panel.hidden=true;$('builderPreview').hidden=true;$<HTMLIFrameElement>('generatedPreview').removeAttribute('src');$('builderGames').replaceChildren();});
 // Family enrollment is a one-time adult action; ordinary renewals remain invisible.
 // The legacy single-use /v1/sessions route remains server-compatible for old clients.
 const connection=document.createElement('section');
 connection.id='builderConnection';connection.className='panel';
 connection.innerHTML=
  '<h3>Family game workshop</h3><p>A grown-up trusts this browser once. jems renews access automatically during normal use. No repeating invitations every week.</p>'+
  '<p id="connectionStatus" role="status" aria-live="polite">Checking this device…</p>'+
  '<form id="builderConnectForm"><h4>Trust this device</h4>'+
  '<label for="builderDeviceName">Device name</label><input id="builderDeviceName" maxlength="48" required value="Family tablet" autocomplete="off">'+
  '<label for="builderInvite">One-use grown-up invitation</label><input id="builderInvite" type="password" autocomplete="off" maxlength="100" required>'+
  '<label for="builderParentPassphrase">Parent passphrase (at least 12 characters)</label><input id="builderParentPassphrase" type="password" autocomplete="new-password" minlength="12" maxlength="128" required>'+
  '<p>Keep your parent passphrase private. The first trusted device establishes it; future devices use the same passphrase and a new one-use invitation.</p>'+
  '<button class="btn primary" type="submit">Trust this family device</button></form>'+
  '<div id="builderTrustedControls" hidden><p id="builderDeviceSummary"></p>'+
  '<button type="button" class="btn secondary" id="builderDisconnect" hidden>Disconnect this device</button>'+
  '<form id="builderParentUnlock"><label for="builderParentUnlockPassphrase">Parent passphrase</label>'+
  '<input id="builderParentUnlockPassphrase" type="password" autocomplete="current-password" minlength="12" maxlength="128" required>'+
  '<button type="submit" class="btn secondary">Manage family devices</button></form>'+
  '<button type="button" class="btn secondary" id="builderIssueInvite" hidden>Invite another family device</button>'+ 
  '<div id="builderNewInvitation" role="status"></div><div id="builderDeviceList" aria-live="polite"></div></div>';
 $('page-parent').querySelector('.panel')!.append(connection);
 setIconLabel(connection.querySelector<HTMLButtonElement>('#builderConnectForm button')!,'shield','Trust this family device');
 setIconLabel(connection.querySelector<HTMLButtonElement>('#builderParentUnlock button')!,'parent','Manage family devices');
 setIconLabel($('builderDisconnect'),'lock','Disconnect this device');
 setIconLabel($('builderIssueInvite'),'add','Invite another family device');
 const privacy=installParentPrivacy(client,$('page-parent'));
 const analyticsPrivacy=installAnalyticsPrivacy(client,$('page-parent'));
 let managementSequence=0;
 const managementView=()=>({profile:profileSequence,page:managementSequence});
 const sameManagementView=(at:ReturnType<typeof managementView>)=>at.profile===profileSequence&&at.page===managementSequence&&currentPage==='parent';
 async function connectionStatus(){
  if(config.mode!=='remote'){$('builderConnectForm').hidden=true;$('builderTrustedControls').hidden=true;$('connectionStatus').textContent='The private game workshop has not been configured on this website. Your local games are still available.';return false;}
  try{
   const state=await client.api('/v1/sessions/status');
   const trusted=!!state.trusted;
   $<HTMLButtonElement>('builderDisconnect').hidden=true;
   $<HTMLFormElement>('builderConnectForm').hidden=trusted;
   $('builderTrustedControls').hidden=!trusted;
   $('builderDeviceSummary').textContent=trusted?'Trusted on '+(state.deviceName||'this device')+'. Connection renews automatically while this device remains trusted.':'';
   $('connectionStatus').textContent=trusted?'This family device is connected.':'A grown-up needs to trust this device once.';
   return trusted;
  }catch{
   $<HTMLButtonElement>('builderDisconnect').hidden=true;
   $<HTMLFormElement>('builderConnectForm').hidden=false;
   $('builderTrustedControls').hidden=true;
   $('connectionStatus').textContent='No active family workshop session on this browser. Your local games and progress are safe.';
   return false;
  }
 }
 async function showDevices(){
  const at=managementView();if(!sameManagementView(at))return;
  const target=$('builderDeviceList');target.replaceChildren();
  const result=await client.api('/v1/devices');
  if(!sameManagementView(at))return;
  if(!Array.isArray(result.devices))throw Error('DEVICE_LIST_UNAVAILABLE');
  target.append(Object.assign(document.createElement('h4'),{textContent:'Connected family devices'}));
  for(const device of result.devices){
   if(typeof device.id!=='string'||typeof device.name!=='string')continue;
   const row=document.createElement('div');row.className='builder-trusted-device';
   const label=document.createElement('span');label.textContent=device.name+(device.current?' (this device)':'');
   const revoke=document.createElement('button');revoke.className='btn secondary';revoke.type='button';setIconLabel(revoke,'lock','Disconnect');
   revoke.onclick=()=>{if(!confirm('Disconnect '+device.name+' from the private game workshop?'))return;
    void client.api('/v1/devices/revoke',{deviceId:device.id}).then(async()=>{
     if(!sameManagementView(at))return;
     if(device.current){target.replaceChildren();await connectionStatus();}
     else await showDevices();
    }).catch(()=>{if(sameManagementView(at))$('connectionStatus').textContent='Could not disconnect that device. Try again from Parent Controls.';});
   };row.append(label,revoke);target.append(row);
  }
  if(!result.devices.length)target.append(Object.assign(document.createElement('p'),{textContent:'No active devices.'}));
  $<HTMLButtonElement>('builderIssueInvite').hidden=false;
  $<HTMLButtonElement>('builderDisconnect').hidden=false;
 }
 $('builderIssueInvite').onclick=()=>{
  const at=managementView();if(!sameManagementView(at))return;
  void (async()=>{
   const target=$('builderNewInvitation');target.replaceChildren();
   try{
    const data=await client.api('/v1/devices/invite',{});
    if(!sameManagementView(at))return;
    if(typeof data.invitation!=='string'||!Number.isFinite(data.expiresAt))throw Error('INVITE_UNAVAILABLE');
    target.append(Object.assign(document.createElement('p'),{textContent:'This invitation expires in 10 minutes and works only once. Enter it directly on the new device.'}));
    const input=document.createElement('input');input.type='text';input.readOnly=true;input.value=data.invitation;input.setAttribute('aria-label','One-use device invitation');
    const copy=document.createElement('button');copy.type='button';copy.className='btn secondary';copy.textContent='Copy invitation';
    copy.onclick=()=>{
     input.select();
     if(navigator.clipboard?.writeText)void navigator.clipboard.writeText(input.value).then(()=>{
      $('connectionStatus').textContent='Invitation copied. Use it on the new family device.';
     }).catch(()=>$('connectionStatus').textContent='Copy was blocked. Select and copy the invitation manually.');
     else $('connectionStatus').textContent='Select and copy this invitation on your device.';
    };
    target.append(input,copy);
    setTimeout(()=>{if(Date.now()>=data.expiresAt&&input.isConnected)target.replaceChildren();},Math.max(0,data.expiresAt-Date.now()+50));
   }catch{
    if(!sameManagementView(at))return;
    $('connectionStatus').textContent='Could not issue an invitation. Unlock Parent Controls again or let existing invitations expire.';
    $<HTMLButtonElement>('builderIssueInvite').hidden=true;
   }
  })();
 };
 $<HTMLFormElement>('builderConnectForm').onsubmit=e=>{
  e.preventDefault();
  void (async()=>{
   $('connectionStatus').textContent='Connecting this family device…';
   try{
    await client.api('/v1/sessions/enroll',{
     invitation:$<HTMLInputElement>('builderInvite').value,
     deviceName:$<HTMLInputElement>('builderDeviceName').value,
     parentPassphrase:$<HTMLInputElement>('builderParentPassphrase').value
    });
    $<HTMLInputElement>('builderInvite').value='';
    $<HTMLInputElement>('builderParentPassphrase').value='';
    if(!await connectionStatus()){
     $('connectionStatus').textContent='The workshop accepted setup, but this browser did not keep its secure cookies. Do not reuse the invitation; check browser cookie restrictions.';
     return;
    }
    window.dispatchEvent(new Event('factory-session-restored'));
   }catch(error){
    const code=(error as Error).message;
    $('connectionStatus').textContent=code==='PARENT_LOCKED'?'Parent access is temporarily locked. Try again later.':
     code==='DEVICE_LIMIT'?'The family device limit is reached. Disconnect an old device using Parent Controls.':
     'Could not trust this device. Check the fresh invitation and parent passphrase. Local games are unchanged.';
   }
  })();
 };
 $<HTMLFormElement>('builderParentUnlock').onsubmit=e=>{
  e.preventDefault();const at=managementView();if(!sameManagementView(at))return;
  void (async()=>{try{
    await client.api('/v1/devices/unlock',{parentPassphrase:$<HTMLInputElement>('builderParentUnlockPassphrase').value});
    $<HTMLInputElement>('builderParentUnlockPassphrase').value='';
    if(!sameManagementView(at))return;
    await showDevices();
    if(!sameManagementView(at))return;
    await privacy.show();
    if(!sameManagementView(at))return;
    await analyticsPrivacy.show();
    if(sameManagementView(at))$('connectionStatus').textContent='You can now manage trusted devices and permissions.';
   }catch{if(sameManagementView(at))$('connectionStatus').textContent='Parent access was not verified. Check your passphrase or temporary lock.';}})();
 };
 $('builderDisconnect').onclick=()=>{
  if(!confirm('Disconnect this device? Local games and learning progress will stay on this browser.'))return;
  void client.api('/v1/devices/disconnect',{}).then(async()=>{await connectionStatus();$('builderDeviceList').replaceChildren();})
   .catch(()=>$('connectionStatus').textContent='Could not disconnect this device. Please try again.');
 };
 window.addEventListener('factory-page',event=>{
  ++managementSequence;
  privacy.hide();
  analyticsPrivacy.hide();
  if((event as CustomEvent<string>).detail==='parent'){void connectionStatus();void analyticsPrivacy.showAdult();return;}
  $('builderNewInvitation').replaceChildren();$('builderDeviceList').replaceChildren();
  $<HTMLButtonElement>('builderIssueInvite').hidden=true;
  $<HTMLButtonElement>('builderDisconnect').hidden=true;
  for(const id of ['builderInvite','builderParentPassphrase','builderParentUnlockPassphrase'])
   $<HTMLInputElement>(id).value='';
 });
 window.addEventListener('factory-profile',()=>{
  ++managementSequence;
  privacy.hide();
  analyticsPrivacy.hide();
  $('builderNewInvitation').replaceChildren();$('builderDeviceList').replaceChildren();
  $<HTMLButtonElement>('builderIssueInvite').hidden=true;
  $<HTMLButtonElement>('builderDisconnect').hidden=true;
  for(const id of ['builderInvite','builderParentPassphrase','builderParentUnlockPassphrase'])
   $<HTMLInputElement>(id).value='';
 });
 window.addEventListener('factory-session-restored',()=>{if(!$('page-parent').classList.contains('hidden'))void connectionStatus();});
 void connectionStatus();
 try{const saved=JSON.parse(profileStorage(localStorage).getItem(pendingKey)||'null');if(saved?.owner===FG.store.current().id&&saved.api===config.apiBaseUrl&&config.mode==='remote'){move('create');void client.resume(saved.jobId).catch(showError);}}catch{}
 FG.builder={request:(input:RequestChange)=>request(input,'feedback'),mode:config.mode};
 return config;
}

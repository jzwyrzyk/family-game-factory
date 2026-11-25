import {recoverAdultBackupAfterUnlock} from '../storage/adult-recovery';
import {recoverLocalProjects} from '../storage/project-recovery';
import {iconMarkup,setIconLabel} from '../brand/icons';
import {BuilderClient,type BuilderConfig} from '../builder/client';
import {activateAdultSession,adultRequestSession,adultSessionVersion,clearAdultSession,onAdultSessionEnded,type AdultProfileSession} from './session';

type AccessState='checking'|'unconfigured'|'disconnected'|'disabled'|'approval'|'ready'|'unavailable';
const accessCopy:Record<AccessState,{title:string;detail:string}>={
 checking:{title:'Checking private testing access…',detail:'Checking this browser’s connection and testing access.'},
 unconfigured:{title:'Workshop connection not configured',detail:'The private game workshop has not been configured on this website. The owner needs to restore that connection before private testing can open.'},
 disconnected:{title:'Connect this browser',detail:'This browser has no active family workshop connection. Open connection settings to use your existing parent passphrase and a fresh one-use invitation. If this device was trusted before, its connection could not be restored.'},
 disabled:{title:'Private testing is not enabled',detail:'This browser is connected, but private parent testing is not enabled for this deployment. The owner needs to check the existing testing configuration. Recheck after it is restored.'},
 approval:{title:'Testing access needs approval or renewal',detail:'This connected browser needs current approval for private parent testing. Ask the owner to review or renew this device’s testing access, then recheck here.'},
 ready:{title:'Ready to unlock your testing session',detail:'Enter your parent passphrase to open your separate testing workspace for up to an hour. Switching to a family profile ends this access.'},
 unavailable:{title:'Could not check testing access',detail:'Check your connection, then try again. Private testing stays locked while access cannot be verified.'}
};

/** One same-site, server-authorized adult workspace. The parent entry remains
 * discoverable when connection, configuration or authorization needs attention.
 */
export function installAdultProfile(config:BuilderConfig){
 if(document.getElementById('adultProfileDialog'))return;
 const base=config.mode==='remote'?config.apiBaseUrl:undefined;
 const FG=(window as any).FG,client=new BuilderClient(config,()=>{});
 let enabled=false,eligible=false,busy=false,request=0,refreshRequest=0,capabilityRequest=0,changing=false;
 let access:AccessState=base?'checking':'unconfigured',refreshing=false,lastEnd='';
 let returnFocus:HTMLElement|null=null;
 const activeSession=()=>base?adultRequestSession(base):null;
 const button=document.createElement('button');button.id='adultProfileChoice';button.type='button';button.className='profile-choice adult-profile-choice';
 const entry=document.createElement('section');entry.id='adultParentSessionEntry';entry.className='adult-parent-session-entry';
 entry.setAttribute('aria-labelledby','adultParentSessionHeading');
 entry.innerHTML='<h3 id="adultParentSessionHeading">Private parent testing</h3><p>Use your own test ideas in a separate adult workspace.</p><p id="adultParentSessionSummary"></p><button type="button" id="adultParentSessionOpen" class="btn secondary">Open private testing</button>';
 const connection=document.getElementById('builderConnection');
 if(connection)connection.before(entry);
 else (document.getElementById('parentPanel-settings')||document.getElementById('page-parent'))?.append(entry);
 const dialog=document.createElement('dialog');dialog.id='adultProfileDialog';dialog.className='adult-profile-dialog';dialog.setAttribute('aria-labelledby','adultProfileTitle');
 dialog.innerHTML=`<form id="adultProfileForm">
  <h2 id="adultProfileTitle" tabindex="-1">Private parent testing</h2>
  <p>Conversation, game building and private dictation each depend on their current service availability. Your test work stays separate from family notebooks.</p>
  <p id="adultProfileStatus" role="status" aria-live="polite"></p>
  <div id="adultProfileUnlockFields" hidden><label for="adultProfilePassphrase">Parent passphrase</label><input id="adultProfilePassphrase" type="password" autocomplete="current-password" minlength="12" maxlength="128" required></div>
  <dl id="adultParentCapabilities" class="adult-parent-capabilities" hidden>
   <div><dt>AI conversation</dt><dd id="adultConversationState">Checking…</dd></div>
   <div><dt>AI game building</dt><dd id="adultBuildingState">Checking…</dd></div>
   <div><dt>Private dictation</dt><dd id="adultDictationState">Checking…</dd></div>
  </dl>
  <div class="adult-profile-actions">
   <button type="submit" id="adultProfileSubmit" class="btn primary" hidden>Switch to Adult</button>
   <button type="button" id="adultParentConnect" class="btn primary" hidden>Open connection settings</button>
   <button type="button" id="adultParentRecheck" class="btn secondary">Recheck access</button>
   <button type="button" id="adultParentSessionEnd" class="btn secondary" hidden>End testing session</button>
   <button type="button" id="adultProfileCancel" class="btn secondary">Close</button>
  </div>
 </form>`;
 const banner=document.createElement('section');banner.id='adultProfileBanner';banner.className='adult-profile-banner';banner.hidden=true;banner.setAttribute('aria-label','Adult development profile');
 banner.innerHTML=`<div><strong>${iconMarkup('parent')} Private parent testing</strong><p id="adultProfileTools" role="status" aria-live="polite">Checking AI tools…</p><small id="adultProfileExpiry"></small></div><button type="button" class="btn secondary" id="adultProfileExit">Exit Adult profile</button>`;
 document.body.append(dialog);document.querySelector('main')?.prepend(banner);
 const input=dialog.querySelector<HTMLInputElement>('#adultProfilePassphrase')!,status=dialog.querySelector<HTMLElement>('#adultProfileStatus')!;
 const title=dialog.querySelector<HTMLElement>('#adultProfileTitle')!,fields=dialog.querySelector<HTMLElement>('#adultProfileUnlockFields')!;
 const submit=dialog.querySelector<HTMLButtonElement>('#adultProfileSubmit')!;
 const recheck=dialog.querySelector<HTMLButtonElement>('#adultParentRecheck')!,connect=dialog.querySelector<HTMLButtonElement>('#adultParentConnect')!;
 const end=dialog.querySelector<HTMLButtonElement>('#adultParentSessionEnd')!,capabilitiesList=dialog.querySelector<HTMLElement>('#adultParentCapabilities')!;
 setIconLabel(dialog.querySelector<HTMLButtonElement>('#adultProfileCancel')!,'close','Close');
 setIconLabel(submit,'parent','Switch to Adult');setIconLabel(connect,'shield','Open connection settings');
 setIconLabel(recheck,'retry','Recheck access');setIconLabel(end,'lock','End testing session');
 setIconLabel(entry.querySelector<HTMLButtonElement>('#adultParentSessionOpen')!,'parent','Open private testing');
 setIconLabel(banner.querySelector<HTMLButtonElement>('#adultProfileExit')!,'lock','Exit Adult profile');
 const tools=banner.querySelector<HTMLElement>('#adultProfileTools')!;
 const toolStates=['adultConversationState','adultBuildingState','adultDictationState'].map(id=>dialog.querySelector<HTMLElement>('#'+id)!);
 type CoachOutcome='connected'|'limited'|'sign-in'|'unavailable';
 let connectionSequence=0,capabilitiesAt=0;
 let conversationOutcome:{version:number;state:CoachOutcome;at:number}|null=null;
 let capabilityLabels=['Checking…','Checking…','Checking…'];
 function renderCapabilities(){
  const active=activeSession(),outcome=conversationOutcome?.version===adultSessionVersion()?conversationOutcome:null;
  const labels=[...capabilityLabels];
  // Configuration and a health check establish availability, not a successful
  // conversation. Preserve the latest actual result across healthy rechecks.
  if(active&&outcome&&(labels[0]==='available'||labels[0]==='Checking…'||outcome.at>capabilitiesAt)){
   labels[0]=outcome.state==='connected'?'connected':outcome.state==='sign-in'?'unlock needed':'needs reconnect';
  }
  const names=['AI conversation','AI game building','Private dictation'];
  tools.textContent=labels.map((label,i)=>{
   toolStates[i].textContent=label;toolStates[i].dataset.ready=String(['available','connected','ready'].includes(label));
   return `${names[i]}: ${label}`;
  }).join(' · ');
 }
 window.addEventListener('factory-coach-connection',event=>{
  const active=activeSession(),detail=(event as CustomEvent).detail;
  if(!active||FG.store.current().id!==active.profileId||detail?.ownerId!==active.profileId
    ||!['connected','limited','sign-in','unavailable'].includes(detail?.state))return;
  conversationOutcome={version:adultSessionVersion(),state:detail.state,at:++connectionSequence};renderCapabilities();
 });
 function renderChoice(){
  button.hidden=!enabled;setIconLabel(button,'settings','Adult (development)');
  const active=!!activeSession();button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
  if(enabled)document.getElementById('profile-choices')?.append(button);else button.remove();
  banner.hidden=!active;
 }
 function renderAccess(message?:string){
  const active=!!activeSession(),canUnlock=!active&&access==='ready'&&eligible;
  entry.dataset.accessState=active?'active':access;dialog.dataset.accessState=entry.dataset.accessState;
  entry.querySelector<HTMLElement>('#adultParentSessionSummary')!.textContent=active?'Your private testing session is active.':accessCopy[access].title;
  status.textContent=message||(busy?'Switching to Adult…':active?'Your private testing session is active. Check each tool’s availability below. Switching profiles or ending the session locks access.':
   access==='ready'&&lastEnd==='expired'?'Your testing session expired. Enter your parent passphrase to open a new session.':accessCopy[access].detail);
  fields.hidden=!canUnlock;submit.hidden=!canUnlock;input.disabled=!canUnlock||busy;submit.disabled=!canUnlock||busy;
  connect.hidden=active||!['disconnected','unavailable'].includes(access);
  recheck.disabled=refreshing||busy;recheck.hidden=access==='unconfigured';
  end.hidden=!active;capabilitiesList.hidden=!active;
  renderChoice();
 }
 function resetCapabilities(){
  ++capabilityRequest;capabilityLabels=['Checking…','Checking…','Checking…'];
  if(!activeSession()||conversationOutcome?.version!==adultSessionVersion())conversationOutcome=null;
  renderCapabilities();
 }
 function refreshProfile(){FG.app.refreshProfiles();window.dispatchEvent(new Event('factory-profile'));renderAccess();}
 function revoke(session:AdultProfileSession|null){
  if(!session||!base)return;
  // A cancelled unlock is revoked with its captured proof. Never renew or replay
  // a paid action while discarding an old or expired adult session.
  void fetch(base+'/v1/sessions/adult/lock',{method:'POST',credentials:'include',cache:'no-store',redirect:'error',keepalive:true,
   headers:{'Content-Type':'application/json','X-Factory-Request':'1','X-Factory-Adult-Session':session.sessionToken},body:'{}'}).catch(()=>{});
 }
 function closeDialog(restoreFocus=true){
  ++request;input.value='';if(dialog.open)dialog.close();
  const target=returnFocus;returnFocus=null;
  if(restoreFocus&&target?.isConnected&&target.getClientRects().length)target.focus({preventScroll:true});
 }
 function exit(reason='locked',prior?:AdultProfileSession){
  if(changing)return;changing=true;++request;++refreshRequest;refreshing=false;
  // Save/stop the old workspace while it still owns the local storage adapter.
  window.dispatchEvent(new CustomEvent('factory-profile-before-change',{detail:{profileId:null}}));
  const session=prior||clearAdultSession(reason,false);revoke(session);
  lastEnd=reason;access=reason==='unavailable'?'unavailable':enabled&&eligible?'ready':access;
  FG.store.leaveAdultProfile();closeDialog(false);resetCapabilities();refreshProfile();changing=false;
  if(reason==='expired'||reason==='unavailable'){
   const message=document.getElementById('studioCreationNote')||document.getElementById('connectionStatus');
   if(message)message.textContent=reason==='expired'?'Your private testing session expired. Open Private parent testing to unlock it again.':'Your private testing session ended. Open Private parent testing to check access again.';
  }
 }
 onAdultSessionEnded((reason,session)=>exit(reason,session));
 window.addEventListener('factory-profile-changing',event=>{
  if(changing)return;
  ++request;++refreshRequest;refreshing=false;closeDialog(false);
  const next=(event as CustomEvent).detail?.profileId,active=activeSession();
  if(active&&next!==active.profileId){revoke(clearAdultSession('profile-switch',false));resetCapabilities();}
 });
 window.addEventListener('factory-profile-choices',renderChoice);
 window.addEventListener('factory-profile',()=>{++request;renderAccess();if(!changing&&!busy)void refresh();});
 async function checkStatus(path:string){
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   return await Promise.race([client.api(path),new Promise<never>((_resolve,reject)=>{
    timer=setTimeout(()=>reject(Error('STATUS_TIMEOUT')),15_000);
   })]);
  }finally{clearTimeout(timer);}
 }
 async function capabilities(){
  const active=activeSession();if(!active)return;
  resetCapabilities();const at=capabilityRequest,checkedAt=++connectionSequence;
  const results=await Promise.allSettled(['/v1/coach/status','/v1/builder/status','/v1/coach/audio/status'].map(checkStatus));
  if(at!==capabilityRequest||activeSession()?.sessionToken!==active.sessionToken)return;
  capabilitiesAt=checkedAt;capabilityLabels=results.map((r,i)=>{
   const ready=r.status==='fulfilled'&&r.value?.available===true;
   return ready?(i===0?'available':'ready'):r.status==='fulfilled'&&r.value?.reason==='ALLOWANCE_REQUIRED'?'allowance needed':'unavailable';
  });
  renderCapabilities();
 }
 async function refresh(focusInput=false){
  if(!base){access='unconfigured';renderAccess();return;}
  if(busy)return;
  const at=adultSessionVersion(),sequence=++refreshRequest,owner=FG.store.current().id;
  refreshing=true;if(!activeSession())access='checking';renderAccess();
  let next:AccessState='unavailable';
  try{
   const data=await checkStatus('/v1/sessions/status'),pilot=data.adultPilot;
   if(sequence!==refreshRequest||at!==adultSessionVersion()||owner!==FG.store.current().id)return;
   enabled=data.connected===true&&data.trusted===true&&pilot?.enabled===true;
   eligible=enabled&&pilot?.eligible===true;
   next=data.connected!==true||data.trusted!==true?'disconnected':typeof pilot?.enabled!=='boolean'?'unavailable':!enabled?'disabled':!eligible?'approval':'ready';
   if(activeSession()&&(!enabled||!eligible||pilot.active!==true))exit('unavailable');
  }catch(error){
   if(sequence!==refreshRequest||at!==adultSessionVersion()||owner!==FG.store.current().id)return;
   enabled=false;eligible=false;
   next=(error as Error).message==='UNAUTHENTICATED'?'disconnected':'unavailable';
   if(activeSession())exit('unavailable');
  }
  // A verified failure may have ended the old session above. Its explanatory
  // state still belongs here; stale responses returned before reaching this line.
  refreshing=false;access=next;renderAccess();
  if(activeSession())void capabilities();
  if(focusInput&&dialog.open&&access==='ready'&&!activeSession()&&document.activeElement===title)input.focus();
 }
 function openDialog(){
  if(FG.learning?.active){FG.learning.focus?.();return;}
  if(dialog.open)return;
  ++request;returnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  input.value='';renderAccess();dialog.showModal();title.focus();void refresh(true);
 }
 button.onclick=()=>{if(activeSession()){FG.studio?.home();return;}openDialog();};
 entry.querySelector<HTMLButtonElement>('#adultParentSessionOpen')!.onclick=openDialog;
 window.addEventListener('factory-open-parent-session',openDialog);
 dialog.querySelector<HTMLButtonElement>('#adultProfileCancel')!.onclick=()=>closeDialog();
 dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
 dialog.addEventListener('close',()=>{input.value='';});
 recheck.onclick=()=>{input.value='';title.focus();void refresh(true);};
 connect.onclick=()=>{
  closeDialog(false);
  window.dispatchEvent(new CustomEvent('factory-open-parent-connection',{cancelable:true}));
 };
 dialog.querySelector<HTMLFormElement>('#adultProfileForm')!.onsubmit=event=>{
  event.preventDefault();if(!base||busy||!eligible||access!=='ready'||!dialog.open)return;
  busy=true;const attempt=++request,passphrase=input.value;input.value='';renderAccess();
  void (async()=>{
   let activated:AdultProfileSession|null=null;
   let feedback:string|undefined;
   try{
    const data=await client.api('/v1/sessions/adult/unlock',{parentPassphrase:passphrase});
    // Cancelling or switching profiles while unlock is pending must not open
    // the adult workspace later, even if the server has already granted it.
    if(attempt!==request||!dialog.open){
     if(typeof data.sessionToken==='string')revoke({...data,base});return;
    }
    // Indexed notebook writes must finish before changing their owner. The
    // newly issued Adult grant is revoked if the old draft cannot be saved.
    try{await FG.studio?.flushDraft?.();}catch{revoke({...data,base});throw Error('PROFILE_SAVE_FAILED');}
    if(attempt!==request||!dialog.open){revoke({...data,base});return;}
    if(!window.dispatchEvent(new CustomEvent('factory-profile-before-change',{cancelable:true,detail:{profileId:data.profileId}}))){
     revoke({...data,base});throw Error('PROFILE_SAVE_FAILED');
    }
    activated=activateAdultSession(base,data);
    recoverLocalProjects(localStorage,activated.profileId);
    await recoverAdultBackupAfterUnlock(activated.profileId);
    FG.store.enterAdultProfile(activated.profileId);
    closeDialog(false);lastEnd='';banner.querySelector<HTMLElement>('#adultProfileExpiry')!.textContent='Access ends at '+new Date(activated.expiresAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+'. Switching profiles locks this session.';
    refreshProfile();void capabilities();
   }catch(error){
    const currentAttempt=attempt===request&&dialog.open;
    if(activated){revoke(clearAdultSession('failed',false));FG.store.leaveAdultProfile();refreshProfile();}
    if(!currentAttempt)return;
    const code=(error as Error).message;
    if(code==='ADULT_PILOT_ACCESS_REQUIRED'){eligible=false;access='approval';}
    if(code==='UNAUTHENTICATED'){eligible=false;enabled=false;access='disconnected';}
    feedback=code==='PARENT_LOCKED'?'Too many attempts. Wait before trying your passphrase again.':
     code==='ADULT_PILOT_ACCESS_REQUIRED'?accessCopy.approval.detail:
     code==='UNAUTHENTICATED'?accessCopy.disconnected.detail:
     code==='PROFILE_SAVE_FAILED'?'The current draft could not be saved. Close this dialog and save it before switching.':
     'Could not switch to Adult. Check the passphrase and connection, then try again.';
   }finally{
    busy=false;renderAccess(dialog.open?feedback:undefined);
   }
  })();
 };
 end.onclick=()=>exit();banner.querySelector<HTMLButtonElement>('#adultProfileExit')!.onclick=()=>exit();
 window.addEventListener('factory-session-restored',()=>{void refresh();});
 window.addEventListener('focus',()=>{void refresh();});
 window.addEventListener('pagehide',()=>{closeDialog(false);if(activeSession())exit();});
 renderAccess();void refresh();
}

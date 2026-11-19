import {BuilderClient,type BuilderConfig} from '../builder/client';
import {activateAdultSession,adultRequestSession,adultSessionVersion,clearAdultSession,onAdultSessionEnded,type AdultProfileSession} from './session';

/** Temporary same-site development access. Removing this installer and disabling
 * the server pilot flag removes the profile without changing child profiles.
 */
export function installAdultProfile(config:BuilderConfig){
 if(config.mode!=='remote'||!config.apiBaseUrl)return;
 const base=config.apiBaseUrl,FG=(window as any).FG,client=new BuilderClient(config,()=>{});
 let enabled=false,eligible=false,busy=false,request=0,changing=false;
 const button=document.createElement('button');button.id='adultProfileChoice';button.type='button';button.className='profile-choice adult-profile-choice';
 const dialog=document.createElement('dialog');dialog.id='adultProfileDialog';dialog.className='adult-profile-dialog';dialog.setAttribute('aria-labelledby','adultProfileTitle');
 dialog.innerHTML='<form id="adultProfileForm"><h2 id="adultProfileTitle">Switch to Adult</h2><p>AI conversation, game building and private dictation activate in this development profile. Use your own test ideas; family notebooks stay separate.</p><label for="adultProfilePassphrase">Parent passphrase</label><input id="adultProfilePassphrase" type="password" autocomplete="current-password" minlength="12" maxlength="128" required><p id="adultProfileStatus" role="status" aria-live="polite"></p><div class="adult-profile-actions"><button type="button" id="adultProfileCancel" class="btn secondary">Cancel</button><button type="submit" id="adultProfileSubmit" class="btn primary">Switch to Adult</button></div></form>';
 const banner=document.createElement('section');banner.id='adultProfileBanner';banner.className='adult-profile-banner';banner.hidden=true;banner.setAttribute('aria-label','Adult development profile');
 banner.innerHTML='<div><strong>🛠️ Adult development profile</strong><p id="adultProfileTools" role="status" aria-live="polite">Checking AI tools…</p><small id="adultProfileExpiry"></small></div><button type="button" class="btn secondary" id="adultProfileExit">Exit Adult profile</button>';
 document.body.append(dialog);document.querySelector('main')?.prepend(banner);
 const input=dialog.querySelector<HTMLInputElement>('#adultProfilePassphrase')!,status=dialog.querySelector<HTMLElement>('#adultProfileStatus')!;
 const submit=dialog.querySelector<HTMLButtonElement>('#adultProfileSubmit')!;
 const tools=banner.querySelector<HTMLElement>('#adultProfileTools')!;
 function renderChoice(){
  button.hidden=!enabled;button.textContent='🛠️ Adult (development)';
  const active=!!adultRequestSession(base);button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
  if(enabled)document.getElementById('profile-choices')?.append(button);else button.remove();
  banner.hidden=!active;
 }
 function refreshProfile(){FG.app.refreshProfiles();window.dispatchEvent(new Event('factory-profile'));renderChoice();}
 function revoke(session:AdultProfileSession|null){
  if(!session)return;
  // The local proof has already gone. Keep this captured proof only long enough
  // to revoke it, never renew or replay a paid action during logout.
  void fetch(base+'/v1/sessions/adult/lock',{method:'POST',credentials:'include',cache:'no-store',redirect:'error',keepalive:true,
   headers:{'Content-Type':'application/json','X-Factory-Request':'1','X-Factory-Adult-Session':session.sessionToken},body:'{}'}).catch(()=>{});
 }
 function exit(reason='locked',prior?:AdultProfileSession){
  if(changing)return;changing=true;++request;
  // Save/stop the old workspace while it still owns the local storage adapter.
  window.dispatchEvent(new CustomEvent('factory-profile-before-change',{detail:{profileId:null}}));
  const session=prior||clearAdultSession(reason,false);revoke(session);
  FG.store.leaveAdultProfile();dialog.close();input.value='';refreshProfile();changing=false;
  if(reason==='expired'||reason==='unavailable'){
   const message=document.getElementById('studioCreationNote')||document.getElementById('connectionStatus');
   if(message)message.textContent=reason==='expired'?'Adult access expired. Switch to Adult to unlock AI again.':'Adult access ended. Switch to Adult to check access again.';
  }
 }
 onAdultSessionEnded((reason,session)=>exit(reason,session));
 window.addEventListener('factory-profile-changing',event=>{
  if(changing)return;
  const next=(event as CustomEvent).detail?.profileId,active=adultRequestSession(base);
  if(active&&next!==active.profileId)revoke(clearAdultSession('profile-switch',false));
 });
 window.addEventListener('factory-profile-choices',renderChoice);
 window.addEventListener('factory-profile',()=>{++request;renderChoice();});
 async function capabilities(){
  const active=adultRequestSession(base);if(!active)return;
  const results=await Promise.allSettled(['/v1/coach/status','/v1/builder/status','/v1/coach/audio/status'].map(path=>client.api(path)));
  if(adultRequestSession(base)?.sessionToken!==active.sessionToken)return;
  const names=['AI conversation','AI game building','Private dictation'];
  tools.textContent=results.map((r,i)=>`${names[i]}: ${r.status==='fulfilled'&&r.value?.available===true?'ready':'unavailable'}`).join(' · ');
 }
 async function refresh(){
  const at=adultSessionVersion();
  try{
   const data=await client.api('/v1/sessions/status'),pilot=data.adultPilot;
   if(at!==adultSessionVersion())return;
   enabled=pilot?.enabled===true;eligible=pilot?.eligible===true;
   if(adultRequestSession(base)&&(!enabled||!eligible||pilot.active!==true))exit('unavailable');
  }catch{if(at!==adultSessionVersion())return;enabled=false;eligible=false;if(adultRequestSession(base))exit('unavailable');}
  renderChoice();
 }
 button.onclick=()=>{
  if(adultRequestSession(base)){FG.studio?.home();return;}
  input.value='';status.textContent=eligible?'Unlock once for up to an hour. Switching to a family profile ends adult access.':'This trusted device still needs the owner’s adult pilot approval.';
  input.disabled=!eligible;submit.disabled=!eligible;dialog.showModal();if(eligible)input.focus();
 };
 dialog.querySelector<HTMLButtonElement>('#adultProfileCancel')!.onclick=()=>{++request;dialog.close();input.value='';};
 dialog.addEventListener('cancel',()=>{++request;input.value='';});
 dialog.addEventListener('close',()=>{input.value='';});
 dialog.querySelector<HTMLFormElement>('#adultProfileForm')!.onsubmit=event=>{
  event.preventDefault();if(busy||!eligible)return;
  busy=true;submit.disabled=true;const attempt=++request,passphrase=input.value;input.value='';status.textContent='Switching to Adult…';
  void (async()=>{
   let activated:AdultProfileSession|null=null;
   try{
    const data=await client.api('/v1/sessions/adult/unlock',{parentPassphrase:passphrase});
    // Cancelling a slow unlock must not activate AI later in a child profile.
    if(attempt!==request||!dialog.open){
     if(typeof data.sessionToken==='string')revoke({...data,base});return;
    }
    if(!window.dispatchEvent(new CustomEvent('factory-profile-before-change',{cancelable:true,detail:{profileId:data.profileId}}))){
     revoke({...data,base});throw Error('PROFILE_SAVE_FAILED');
    }
    activated=activateAdultSession(base,data);FG.store.enterAdultProfile(activated.profileId);
    dialog.close();banner.querySelector<HTMLElement>('#adultProfileExpiry')!.textContent='Access ends at '+new Date(activated.expiresAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+'. Switching profiles locks AI.';
    tools.textContent='Checking AI tools…';refreshProfile();void capabilities();
   }catch(error){
    if(activated){revoke(clearAdultSession('failed',false));FG.store.leaveAdultProfile();refreshProfile();}
    const code=(error as Error).message;
    status.textContent=code==='PARENT_LOCKED'?'Too many attempts. Wait before trying your passphrase again.':
     code==='ADULT_PILOT_ACCESS_REQUIRED'?'This device does not have current adult pilot approval.':
     code==='PROFILE_SAVE_FAILED'?'The current draft could not be saved. Close this dialog and save it before switching.':
     'Could not switch to Adult. Check the passphrase and connection, then try again.';
   }finally{busy=false;submit.disabled=!eligible;}
  })();
 };
 banner.querySelector<HTMLButtonElement>('#adultProfileExit')!.onclick=()=>exit();
 window.addEventListener('factory-session-restored',()=>{void refresh();});
 window.addEventListener('focus',()=>{void refresh();});
 window.addEventListener('pagehide',()=>{if(adultRequestSession(base))exit();});
 void refresh();
}

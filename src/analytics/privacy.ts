import type {BuilderClient} from '../builder/client';
import {adultRequestSession} from '../adult-pilot/session';
import {ANALYTICS_NOTICE_VERSION,type AnalyticsStatus} from './contract';
import {analyticsConfigured,analyticsPermission,refreshAnalyticsPermission,resetAnalyticsPermission} from './client';

/** Separate, optional product-usage permission. Existing AI choices stay independent. */
export function installAnalyticsPrivacy(client:BuilderClient,container:HTMLElement){
  if(!analyticsConfigured())return {show:async()=>{},hide:()=>{},showAdult:async()=>{}};
  const root=document.createElement('section');root.id='jemsAnalyticsPrivacy';root.className='panel parent-privacy';root.hidden=true;
  root.setAttribute('aria-labelledby','jemsAnalyticsTitle');
  root.innerHTML=`<h3 id="jemsAnalyticsTitle">Help improve Jems</h3>
    <p>Optional usage reports help us find problems with making, playing and reusing creations. Jems works with this choice off.</p>
    <p>When enabled, Jems sends selected actions, technical outcomes and coded identifiers to PostHog. It does not send names, game ideas, drawings, recordings, messages or learning answers. There are no session recordings.</p>
    <p id="jemsAnalyticsScope"></p>
    <form id="jemsAnalyticsForm">
      <label id="jemsAnalyticsGuardianLabel"><input id="jemsAnalyticsGuardian" type="checkbox"> I am the parent or legal guardian.</label>
      <label><input id="jemsAnalyticsNotice" type="checkbox" required> I understand the optional PostHog usage reporting described above.</label>
      <button class="btn secondary" type="submit" id="jemsAnalyticsEnable">Request usage reporting</button>
    </form>
    <button class="btn secondary" type="button" id="jemsAnalyticsRevoke" hidden>Stop usage reporting</button>
    <p id="jemsAnalyticsReference" hidden></p>
    <p id="jemsAnalyticsStatus" role="status" aria-live="polite"></p>
    <p>Stopping reporting prevents new reports. Previously sent reports need a separate deletion request to the Jems operator.</p>`;
  container.append(root);
  const $=<T extends HTMLElement>(id:string)=>root.querySelector<T>('#'+id)!;
  let generation=0,unlocked=false,busy=false;
  const activeAdult=()=>!!(client.config.apiBaseUrl&&adultRequestSession(client.config.apiBaseUrl));
  const checkbox=(id:string)=>$<HTMLInputElement>(id);
  function render(data:AnalyticsStatus|null){
    const adult=activeAdult();root.hidden=!analyticsConfigured()||!unlocked&&!adult;
    if(root.hidden)return;
    $('jemsAnalyticsScope').textContent=adult
      ?'This choice covers your current Adult development session only. Switching profiles ends that session’s reporting.'
      :'This family choice stays pending until the Jems operator records separate guardian verification. It does not change AI or speech permissions.';
    $('jemsAnalyticsGuardianLabel').hidden=adult;checkbox('jemsAnalyticsGuardian').required=!adult;
    $('jemsAnalyticsEnable').textContent=adult?'Enable for this adult session':'Request family usage reporting';
    $<HTMLFormElement>('jemsAnalyticsForm').hidden=!!data&&['enabled','pending'].includes(data.status);
    $<HTMLButtonElement>('jemsAnalyticsRevoke').hidden=!data||!['enabled','pending'].includes(data.status);
    const reference=$('jemsAnalyticsReference');
    reference.hidden=adult||!data?.choiceId||!['pending','enabled'].includes(data.status);
    reference.textContent=reference.hidden?'':'Verification request: '+data!.choiceId;
    $('jemsAnalyticsStatus').textContent=!data?'Usage reporting status is unavailable. Reopen this section to check your choice.':
      data.status==='enabled'?'Usage reporting is enabled for this scope.':
      data.status==='pending'?'Request saved. Usage reporting is off while guardian verification is pending.':
      data.status==='disabled'?'Usage reporting is not configured for this release.':
      data.status==='revoked'?'Usage reporting is stopped.':
      data.status==='expired'?'Permission has expired. Usage reporting is off.':'Usage reporting is off.';
  }
  async function show(){
    if(!analyticsConfigured())return;
    const at=++generation;unlocked=true;
    try{
      const data=activeAdult()?await client.api('/v1/analytics/status'):await client.api('/v1/devices/analytics');
      if(at!==generation)return;render(data as AnalyticsStatus);
    }catch{if(at===generation)render(null);}
  }
  function hide(){
    ++generation;unlocked=false;busy=false;
    $<HTMLButtonElement>('jemsAnalyticsEnable').disabled=false;
    checkbox('jemsAnalyticsGuardian').checked=false;checkbox('jemsAnalyticsNotice').checked=false;
    root.hidden=true;$('jemsAnalyticsReference').textContent='';
  }
  $<HTMLFormElement>('jemsAnalyticsForm').onsubmit=event=>{
    event.preventDefault();if(busy||!analyticsConfigured())return;
    if(!checkbox('jemsAnalyticsNotice').checked||!activeAdult()&&!checkbox('jemsAnalyticsGuardian').checked)return;
    const at=generation,adult=activeAdult();busy=true;
    $<HTMLButtonElement>('jemsAnalyticsEnable').disabled=true;
    resetAnalyticsPermission();
    void client.api(adult?'/v1/analytics/adult-choice':'/v1/devices/analytics',adult?
      {noticeVersion:ANALYTICS_NOTICE_VERSION,enabled:true}:
      {noticeVersion:ANALYTICS_NOTICE_VERSION,guardianAffirmed:true,providerAcknowledged:true})
      .then(async data=>{if(at!==generation)return;checkbox('jemsAnalyticsNotice').checked=false;checkbox('jemsAnalyticsGuardian').checked=false;render(data);await refreshAnalyticsPermission();})
      .catch(()=>{if(at===generation)$('jemsAnalyticsStatus').textContent='Could not confirm your choice. Usage reporting remains off in this tab.';})
      .finally(()=>{if(at===generation){busy=false;$<HTMLButtonElement>('jemsAnalyticsEnable').disabled=false;}});
  };
  $<HTMLButtonElement>('jemsAnalyticsRevoke').onclick=()=>{
    if(busy)return;const at=generation,adult=activeAdult();busy=true;
    resetAnalyticsPermission();
    void client.api(adult?'/v1/analytics/adult-choice':'/v1/devices/analytics/revoke',adult?
      {noticeVersion:ANALYTICS_NOTICE_VERSION,enabled:false}:{})
      .then(async data=>{if(at!==generation)return;render(data);await refreshAnalyticsPermission();})
      .catch(()=>{if(at===generation)$('jemsAnalyticsStatus').textContent='Reporting is stopped in this tab, but server withdrawal could not be confirmed. Try again when connected.';})
      .finally(()=>{if(at===generation)busy=false;});
  };
  window.addEventListener('jems-analytics-status',()=>{
    if(!busy&&!document.getElementById('page-parent')?.classList.contains('hidden'))render(analyticsPermission());
  });
  return {show,hide,showAdult:async()=>{if(activeAdult())await show();}};
}

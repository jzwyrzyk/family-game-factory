/** Parent-only privacy choices are recorded as PENDING until an independent
 * guardian verification is completed on a trusted operator machine.
 * A browser click must never enable a remote model or microphone provider.
 */
import type {BuilderClient} from './client';

const NOTICE='jems-parent-privacy-2026-11-v1';
export function installParentPrivacy(client:BuilderClient,container:HTMLElement){
 const root=document.createElement('section');root.id='builderPrivacyPanel';
 root.className='panel parent-privacy';root.hidden=true;
 root.setAttribute('aria-labelledby','builderPrivacyTitle');
 root.innerHTML=`
  <h3 id="builderPrivacyTitle">Privacy & permissions</h3>
  <p>These choices remain pending until an independent guardian check is recorded. Submitting this form never activates paid AI or speech by itself.</p>
  <details><summary>Read the privacy notice & provider disclosures</summary>
   <p>AI generation and conversation can send ideas and relevant game context to OpenAI. Remote dictation sends a short recording to Google Cloud Speech-to-Text. Each is a separate choice.</p>
   <p>Jems stores saved games, drafts, local learning progress, account/device metadata, operational receipts and some backups. Clear chat does not erase every saved game or provider record.</p>
   <p>OpenAI Zero Data Retention requires separate provider/project approval and has endpoint limitations. This form does not establish ZDR, guarantee that Jems stores no data, or authorize child processing before those approvals.</p>
   <p>You can withdraw permissions below. Requests to inspect or delete saved games, backups and provider data require a separate parent administration process.</p>
  </details>
  <form id="builderPrivacyForm">
   <label><input id="privacyGeneration" type="checkbox"> AI game generation</label>
   <label><input id="privacyConversation" type="checkbox"> AI game-design conversation</label>
   <label><input id="privacySpeech" type="checkbox"> Remote speech transcription (Google Cloud)</label>
   <label><input id="privacyGuardian" type="checkbox" required> I am the parent or legal guardian.</label>
   <label><input id="privacyProvider" type="checkbox" required> I have read the notice and understand selected provider processing.</label>
   <button class="btn primary" type="submit">Submit choices for verification</button>
  </form>
  <button class="btn secondary" type="button" id="privacyRevoke" hidden>Withdraw permissions</button>
  <p role="status" aria-live="polite" id="builderPrivacyStatus">Unlock Parent Controls to review permissions.</p>`;
 container.append(root);
 const $=<T extends HTMLElement>(id:string)=>root.querySelector<T>('#'+id)!;
 const status=$<HTMLElement>('builderPrivacyStatus');
 const checkbox=(id:string)=>$<HTMLInputElement>(id);
 async function show(){
  const data=await client.api('/v1/devices/privacy');
  root.hidden=false;
  const state=String(data.status||'unavailable');
  checkbox('privacyGeneration').checked=!!data.scopes?.generation;
  checkbox('privacyConversation').checked=!!data.scopes?.conversation;
  checkbox('privacySpeech').checked=!!data.scopes?.remoteSpeech;
  $<HTMLButtonElement>('privacyRevoke').hidden=!['verified','pending'].includes(state);
  status.textContent=state==='verified'?'Guardian verification recorded. Provider and product approvals are still separate.':
   state==='pending'?'Choices stored, awaiting separate guardian verification. No AI or audio service enabled.':
   state==='revoked'?'Permission withdrawn. Child processing remains blocked.':
   state==='expired'?'Permission expired. Request new verification before child use.':
   'No permissions recorded. Choose the services you would like reviewed.';
 }
 function hide(){
  root.hidden=true;
  checkbox('privacyGuardian').checked=false;
  checkbox('privacyProvider').checked=false;
 }
 $<HTMLFormElement>('builderPrivacyForm').onsubmit=e=>{
  e.preventDefault();
  void (async()=>{
   status.textContent='Saving request…';
   try{
    const response=await client.api('/v1/devices/privacy',{
     noticeVersion:NOTICE,
     guardianAffirmed:checkbox('privacyGuardian').checked,
     providerAcknowledged:checkbox('privacyProvider').checked,
     scopes:{generation:checkbox('privacyGeneration').checked,
      conversation:checkbox('privacyConversation').checked,
      remoteSpeech:checkbox('privacySpeech').checked}
    });
    if(response.status!=='pending')throw Error('PRIVACY_STATUS_INVALID');
    checkbox('privacyGuardian').checked=false;
    checkbox('privacyProvider').checked=false;
    await show();
   }catch{status.textContent='Could not store consent choices. Nothing was activated.';}
  })();
 };
 $<HTMLButtonElement>('privacyRevoke').onclick=()=>{
  if(!confirm('Withdraw these AI and remote speech permissions?'))return;
  void client.api('/v1/devices/privacy/revoke',{}).then(()=>show())
   .catch(()=>{status.textContent='Withdrawal could not be confirmed. Contact the owner before further child processing.';});
 };
 return {show,hide};
}

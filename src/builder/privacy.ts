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
  <details><summary>Clear temporary server conversation records</summary>
   <p>This deletes cached AI replies and speech usage receipts for this family on the server. Local notebooks, saved games, billing totals, backups and provider records are separate. Clear a local conversation from that game’s Chat options.</p>
   <button class="btn secondary" type="button" id="privacyErase">Clear temporary server records</button>
  </details>
  <p id="privacyChoiceReference" hidden></p>
  <p role="status" aria-live="polite" id="builderPrivacyStatus">Unlock Parent Controls to review permissions.</p>`;
 container.append(root);
 const $=<T extends HTMLElement>(id:string)=>root.querySelector<T>('#'+id)!;
 const status=$<HTMLElement>('builderPrivacyStatus');
 const checkbox=(id:string)=>$<HTMLInputElement>(id);
 let generation=0;
 async function show(){
  const at=++generation;
  const data=await client.api('/v1/devices/privacy');
  if(at!==generation)return;
  root.hidden=false;
  const state=String(data.status||'unavailable');
  checkbox('privacyGeneration').checked=!!data.scopes?.generation;
  checkbox('privacyConversation').checked=!!data.scopes?.conversation;
  checkbox('privacySpeech').checked=!!data.scopes?.remoteSpeech;
  $<HTMLButtonElement>('privacyRevoke').hidden=!['verified','pending'].includes(state);
  const reference=$<HTMLElement>('privacyChoiceReference');
  reference.hidden=!['pending','verified'].includes(state)||typeof data.choiceId!=='string'||!/^[a-f0-9-]{36}$/i.test(data.choiceId);
  reference.textContent=reference.hidden?'':'Request reference: '+data.choiceId+'. Keep this with your guardian verification.';
  status.textContent=state==='verified'?'Guardian verification recorded. Provider and product approvals are still separate.':
   state==='pending'?'Choices stored, awaiting separate guardian verification. No AI or audio service enabled.':
   state==='revoked'?'Permission withdrawn. Child processing remains blocked.':
   state==='expired'?'Permission expired. Request new verification before child use.':
   'No permissions recorded. Choose the services you would like reviewed.';
 }
 function hide(){
  ++generation;
  root.hidden=true;
  checkbox('privacyGuardian').checked=false;
  checkbox('privacyProvider').checked=false;
  $<HTMLElement>('privacyChoiceReference').textContent='';
 }
 $<HTMLFormElement>('builderPrivacyForm').onsubmit=e=>{
  e.preventDefault();
  const at=generation;
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
    if(at!==generation)return;
    if(response.status!=='pending')throw Error('PRIVACY_STATUS_INVALID');
    checkbox('privacyGuardian').checked=false;
    checkbox('privacyProvider').checked=false;
    await show();
   }catch{if(at===generation)status.textContent='Could not store consent choices. Nothing was activated.';}
  })();
 };
 $<HTMLButtonElement>('privacyRevoke').onclick=()=>{
  if(!confirm('Withdraw these AI and remote speech permissions?'))return;
  const at=generation;
  void client.api('/v1/devices/privacy/revoke',{}).then(()=>{if(at===generation)return show();})
   .catch(()=>{if(at===generation)status.textContent='Withdrawal could not be confirmed. Contact the owner before further child processing.';});
 };
 $<HTMLButtonElement>('privacyErase').onclick=()=>{
  if(!confirm('Clear this family’s temporary server AI replies and speech receipts? Local notebooks and saved games will remain.'))return;
  const at=generation,button=$<HTMLButtonElement>('privacyErase');button.disabled=true;
  void client.api('/v1/devices/privacy/erase',{confirm:true}).then(data=>{
   if(at!==generation)return;
   if(!Number.isSafeInteger(data.erased)||data.erased<0)throw Error('INVALID_ERASURE');
   status.textContent=`Cleared ${data.erased} temporary server records. Local notebooks, saved games and billing totals remain.`;
  }).catch(()=>{if(at===generation)status.textContent='Server deletion could not be confirmed. Unlock Parent Controls and try again.';})
   .finally(()=>{button.disabled=false;});
 };
 return {show,hide};
}

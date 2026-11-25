const $=id=>document.getElementById(id);
const status=text=>{$('message').textContent=text;};
const errors={STORAGE_CONSENT_REQUIRED:'Review your private copy choices again.',CONTINUITY_DISABLED:'Private copies are not enabled for this workshop.',STORAGE_DOMAIN_DENIED:'This kind of work is not approved for private copies.',INVALID_INVITATION:'This code cannot be used. Ask your operator for a fresh private code.',INVALID_PARENT_ACCESS:'Check your parent passphrase and try again.',PARENT_LOCKED:'Too many attempts. Try again in 15 minutes.',UNAUTHENTICATED:'Connect this device or sign in again.',FAMILY_ACCESS_PAUSED:'Your workshop is awaiting approval or has been paused. Contact your operator.',CURRENT_NOTICE_REQUIRED:'Review the updated family notices before continuing.',PLAY_REQUIRED:'Start a new supervised play session.',RATE_LIMIT:'Please wait a minute before trying again.'};
export async function request(path,data){
 const res=await fetch(path,{method:data===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:data===undefined?{}:{'Content-Type':'application/json','X-Factory-Request':'1'},body:data===undefined?undefined:JSON.stringify(data)});
 const result=await res.json();if(!res.ok)throw Error(errors[result.errorCode]||'This action could not be completed. Check your access or contact the operator.');
 return result;
}
function act(fn){return async event=>{event?.preventDefault();const btn=event?.submitter??event?.currentTarget;if(btn)btn.disabled=true;
 try{status('');await fn();}catch(e){status(e.message);}finally{if(btn)btn.disabled=false;}};}
function bind(id,fn){const el=$(id);if(el)el.onsubmit=act(()=>fn(el,new FormData(el)));}
const here=location.pathname;
let policy;
const current=async()=>policy??=await request('/entry/status');
bind('workshop',async(_,v)=>{const {origin}=await request('/entry/workshop',{code:String(v.get('code')).trim()});location.assign(origin+here);});
bind('redeem',async(f,v)=>{const {notice,terms}=await current();const result=await request('/entry/redeem',{invitation:String(v.get('invitation')).trim(),purpose:here==='/recovery'?'recovery':'new-family',passphrase:v.get('passphrase'),guardianAffirmed:v.has('guardianAffirmed'),notice,terms});
 f.reset();f.hidden=true;$('paired').hidden=false;$('paired').querySelector('output').textContent=result.pairingCode;});
bind('device',async(f,v)=>{await request('/v1/sessions/enroll',{invitation:String(v.get('invitation')).trim(),parentPassphrase:v.get('passphrase'),deviceName:'Family device'});f.reset();location.replace('/login');});
bind('renewParticipation',async(f,v)=>{const {notice,terms}=await current();await request('/entry/renew-participation',{adult:v.has('adult'),passphrase:v.get('passphrase'),notice,terms});f.reset();location.replace('/grown-ups');});
bind('ack',async(f,v)=>{const {notice,terms}=await current();await request('/entry/acknowledge',{adult:v.has('adult'),supervise:v.has('supervise'),avoidIdentifying:v.has('avoidIdentifying'),passphrase:v.get('passphrase'),notice,terms});f.reset();location.replace('/play/');});
if($('checking'))void (async()=>{
 let s=await current();if(!s.connected){try{await request('/v1/sessions/renew',{});s=policy=await request('/entry/status');}catch{/* Show enrollment choices. */}}
 if(s.connected&&s.status==='active'){location.replace(s.needsNoticeRenewal?'/renew-participation':s.needsProfile?'/grown-ups':'/acknowledge');return;}
 $('checking').textContent=s.connected?'Your workshop is waiting for operator approval.':'This browser needs a trusted-device invitation.';$('loginChoices').hidden=false;
})().catch(()=>{$('checking').textContent='Connection interrupted. Reload to check this device.';});
let storageChoices;
const copyLabels={profiles:'Explorer settings',games:'Games and saved versions',creative:'Coding and creative projects',learning:'Learning history',artwork:'Original artwork',conversation:'Conversations and notebooks',rewards:'Rewards and Gem Pals',notifications:'Notifications',backups:'Complete recovery copies (requires all included categories)'};
function choices(region,rows,selected){
 const fieldset=$(region);for(const child of [...fieldset.children])if(child.tagName!=='LEGEND')child.remove();
 for(const [key,label] of rows){const wrap=document.createElement('label');wrap.className='check';const input=document.createElement('input');input.type='checkbox';input.name=key;input.checked=selected.includes(key);wrap.append(input,document.createTextNode(label));fieldset.append(wrap);}
}
async function showStorage(){
 storageChoices=await request('/entry/storage-consent');const c=storageChoices;
 $('storageState').textContent=c.enabled?(c.available.length?'Choose what may be copied. Every unchecked category stays local.':'Your operator has not approved private copies for this family.'):'Private copies are not enabled. Work stays on this device.';
 $('storageConsent').hidden=!c.enabled||!c.available.length;$('withdrawStorage').hidden=!c.selected||!!c.selected.revokedAt;
 const selected=c.selected?.notice===c.notice&&!c.selected?.revokedAt?c.selected:{profiles:[],domains:[]};
 choices('storageProfiles',c.profiles.map((id,i)=>[id,'Explorer '+(i+1)]),selected.profiles);
 choices('storageDomains',c.available.map(id=>[id,copyLabels[id]]),selected.domains);
}
bind('storageConsent',async(_,values)=>{
 await request('/entry/storage-consent',{notice:storageChoices.notice,profiles:storageChoices.profiles.filter(id=>values.has(id)),domains:storageChoices.available.filter(id=>values.has(id)),acknowledged:values.has('acknowledged')});await showStorage();status('Your private copy choices are saved.');
});
if($('withdrawStorage'))$('withdrawStorage').onclick=act(async()=>{await request('/entry/storage-consent',{notice:storageChoices.notice,profiles:[],domains:[],acknowledged:true});await showStorage();status('Private transfers have stopped. Existing copies remain available through the privacy request process.');});
async function showControls(){
 const [devices,privacy,profiles]=await Promise.all([request('/v1/devices'),request('/v1/devices/privacy'),request('/entry/profiles')]);
 await showStorage();
 $('privacyState').textContent='Processing consent: '+privacy.status+'.';$('profiles').textContent=profiles.ids.length+' explorer profiles.';
 const region=$('devices');region.replaceChildren();for(const d of devices.devices){const p=document.createElement('p');p.append(d.name+' ');const btn=document.createElement('button');btn.textContent='Revoke device';btn.onclick=act(async()=>{if(confirm('Revoke this trusted device?')){await request('/v1/devices/revoke',{deviceId:d.id});location.replace('/login');}});p.append(btn);region.append(p);}
}
bind('parentUnlock',async(f,v)=>{await request('/v1/devices/unlock',{parentPassphrase:v.get('passphrase')});f.reset();await showControls();$('familyControls').hidden=false;});
if($('addProfile'))$('addProfile').onclick=act(async()=>{await request('/entry/profiles',{});await showControls();});
if($('inviteDevice'))$('inviteDevice').onclick=act(async()=>{$('deviceCode').textContent=(await request('/v1/devices/invite',{})).invitation;});
if($('withdraw'))$('withdraw').onclick=act(async()=>{if(confirm('Withdraw remote processing consent for this family?')){await request('/v1/devices/privacy/revoke',{});await showControls();}});
bind('privacyChoice',async(_,v)=>{const {notice}=await current();await request('/v1/devices/privacy',{noticeVersion:notice,guardianAffirmed:v.has('guardianAffirmed'),providerAcknowledged:v.has('providerAcknowledged'),scopes:Object.fromEntries(['generation','conversation','remoteSpeech'].map(k=>[k,v.has(k)]))});await showControls();});
addEventListener('pagehide',()=>{for(const f of document.forms)f.reset();for(const out of document.querySelectorAll('output'))out.textContent='';if($('familyControls'))$('familyControls').hidden=true;});
addEventListener('pageshow',e=>{if(e.persisted)location.reload();});

if($('familyExport'))$('familyExport').onclick=act(async()=>{
 const data=await request('/entry/export',{});
 for(const kind of ['acknowledgments','usage']){
  let after='';const values=[];do{const page=await request('/entry/export-receipts',{kind,after});values.push(...page.rows);after=page.next;}while(after);
  data[kind==='usage'?'monthlyUsage':kind]=values;
 }
 data.storageMetadata={};for(const kind of ['storage-consents','backup-scans','backup-schedules','backup-operations']){
  let after='';const values=[];do{const page=await request('/entry/export-storage-metadata',{kind,after});values.push(...page.rows);after=page.next;}while(after);data.storageMetadata[kind]=values;
 }
 const storage=[];let cursor='';do{const page=await request('/entry/export-storage',{after:cursor});storage.push(...page.rows);cursor=page.next;}while(cursor);data.storageRecords=storage;
 try{const {exportFamilyDevice}=await import('/entry/export-device.js');data.device=await exportFamilyDevice();}
 catch{data.deviceExportIncomplete=true;status('Server records are ready. Device storage needs separate recovery. Keep this device and contact the operator.');}
 const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='jems-private-family-export.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});

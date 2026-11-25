const $=id=>document.getElementById(id);
const status=text=>{$('message').textContent=text;};
const errors={INVALID_INVITATION:'This code cannot be used. Ask your operator for a fresh private code.',INVALID_PARENT_ACCESS:'Check your parent passphrase and try again.',PARENT_LOCKED:'Too many attempts. Try again in 15 minutes.',UNAUTHENTICATED:'Connect this device or sign in again.',FAMILY_ACCESS_PAUSED:'Your workshop is awaiting approval or has been paused. Contact your operator.',PLAY_REQUIRED:'Start a new supervised play session.',RATE_LIMIT:'Please wait a minute before trying again.'};
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
bind('ack',async(f,v)=>{const {notice,terms}=await current();await request('/entry/acknowledge',{adult:v.has('adult'),supervise:v.has('supervise'),avoidIdentifying:v.has('avoidIdentifying'),passphrase:v.get('passphrase'),notice,terms});f.reset();location.replace('/play/');});
if($('checking'))void (async()=>{
 let s=await current();if(!s.connected){try{await request('/v1/sessions/renew',{});s=policy=await request('/entry/status');}catch{/* Show enrollment choices. */}}
 if(s.connected&&s.status==='active'){location.replace(s.needsProfile?'/grown-ups':'/acknowledge');return;}
 $('checking').textContent=s.connected?'Your workshop is waiting for operator approval.':'This browser needs a trusted-device invitation.';$('loginChoices').hidden=false;
})().catch(()=>{$('checking').textContent='Connection interrupted. Reload to check this device.';});
async function showControls(){
 const [devices,privacy,profiles]=await Promise.all([request('/v1/devices'),request('/v1/devices/privacy'),request('/entry/profiles')]);
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
 try{const {exportFamilyDevice}=await import('/entry/export-device.js');data.device=await exportFamilyDevice();}
 catch{data.deviceExportIncomplete=true;status('Server records are ready. Device storage needs separate recovery. Keep this device and contact the operator.');}
 const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='jems-private-family-export.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});

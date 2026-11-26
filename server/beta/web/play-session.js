// This file loads before the private module. Local play can survive a short network outage.
let expires=Number(document.documentElement.dataset.expires),idle=Number(document.documentElement.dataset.idle);
let lastSent=0,active=false,ending=false;
const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('jems-beta-play'):null;
function leave(){if(ending)return;ending=true;document.documentElement.style.visibility='hidden';location.replace('/login');}
channel?.addEventListener('message',e=>{if(e.data==='ended')leave();});
function blank(){document.documentElement.style.visibility='hidden';}
addEventListener('pagehide',blank);addEventListener('pageshow',e=>{if(e.persisted)leave();});
for(const action of ['pointerdown','keydown','touchstart'])addEventListener(action,e=>{if(e.isTrusted)active=true;},{capture:true,passive:true});
async function check(){
 if(Date.now()>=Math.min(expires,idle)){leave();return;}
 const touch=active&&Date.now()-lastSent>=60000;active=false;
 try{const res=await fetch(touch?'/entry/activity':'/entry/check',{method:touch?'POST':'GET',headers:touch?{'Content-Type':'application/json','X-Factory-Request':'1'}:{},body:touch?'{}':undefined,cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(8000)});
  if(res.status===401||res.status===403||res.status===404){leave();return;}if(!res.ok)return;
  const s=await res.json();expires=s.expires;idle=s.idleUntil;if(touch)lastSent=Date.now();
 }catch{/* Keep current work until the last confirmed server deadline. */}}
setInterval(check,20000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check();});
for(const [id,path] of [['endFamilyPlay','/entry/end'],['forgetFamilyDevice','/entry/logout']]){
 document.getElementById(id)?.addEventListener('click',async()=>{
  if(id==='forgetFamilyDevice'&&!confirm('Forget this trusted device? A grown-up will need a new device invitation.'))return;
  const msg=document.getElementById('familyExitStatus');
  try{const r=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Factory-Request':'1'},body:'{}',signal:AbortSignal.timeout(8000)});
   if(!r.ok)throw Error();channel?.postMessage('ended');leave();
  }catch{msg.textContent='Reconnect to confirm sign-out. Your work is still on this device.';}
 });
}
// Unreviewed household file restore/import controls must never ingest files in beta.
for(const ev of ['change','drop','paste'])document.addEventListener(ev,e=>{
 const file=e.target instanceof HTMLInputElement&&e.target.type==='file';
 if(file||e.dataTransfer?.files.length||e.clipboardData?.files.length){
  if(file&&e.target.id==='betaReviewedArt')return;
  e.preventDefault();e.stopImmediatePropagation();if(file)e.target.value='';
  document.getElementById('familyExitStatus').textContent='Use Grown-ups to add approved artwork.';
 }
},true);

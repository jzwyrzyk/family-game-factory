/* Runs before any application module. This file is never imported by production. */
(()=>{
const host=parent.__jemsReview, cfg=host.config, nativeURL=window.URL, nativeFetch=window.fetch.bind(window);
window.__reviewConfig=cfg;
const log=(type,detail)=>parent.postMessage({type:'review-event',kind:type,detail},'*');
const packagedKeys=new Set(host.assetKeys);
const keyFor=value=>{const direct=String(value).replace(/^(?:\.\/|\/)/,'');if(packagedKeys.has(direct))return direct;try{const u=new nativeURL(String(value),document.baseURI);for(const key of host.assetKeys)if(u.pathname.endsWith('/'+key))return key;}catch{}return null;};
const resolve=value=>{if(!value||String(value).startsWith('data:')||String(value).startsWith('blob:')||String(value).startsWith('#'))return value;const key=keyFor(value);return key?host.asset(key):value;};
const rewrite=text=>String(text).replace(/((?:src|href)\s*=\s*["'])([^"']+)(["'])/gi,(m,a,v,b)=>a+resolve(v)+b).replace(/url\(\s*(["']?)([^)"']+)\1\s*\)/g,(m,q,v)=>`url("${resolve(v)}")`);
class ReviewURL extends nativeURL {constructor(value,base){super(resolve(value),base);}}
window.URL=ReviewURL;
const set=Element.prototype.setAttribute;
Element.prototype.setAttribute=function(k,v){return set.call(this,k,['src','href','xlink:href'].includes(k)?resolve(v):k==='style'?rewrite(v):v);};
for(const [proto,prop] of [[Element.prototype,'innerHTML'],[HTMLImageElement.prototype,'src'],[HTMLLinkElement.prototype,'href'],[HTMLSourceElement.prototype,'src'],[CSSStyleDeclaration.prototype,'cssText'],[CSSStyleDeclaration.prototype,'backgroundImage'],[CSSStyleDeclaration.prototype,'background']]){
 const d=Object.getOwnPropertyDescriptor(proto,prop);if(d?.set)Object.defineProperty(proto,prop,{...d,set(v){return d.set.call(this,['src','href'].includes(prop)?resolve(v):rewrite(v));}});
}
const insert=Element.prototype.insertAdjacentHTML;Element.prototype.insertAdjacentHTML=function(p,t){return insert.call(this,p,rewrite(t));};
const styleSet=CSSStyleDeclaration.prototype.setProperty;CSSStyleDeclaration.prototype.setProperty=function(k,v,p){return styleSet.call(this,k,rewrite(v),p);};
const storage=host.storage;
Object.defineProperty(window,'localStorage',{value:{getItem:k=>storage[k]??null,setItem:(k,v)=>{storage[k]=String(v);},removeItem:k=>delete storage[k],clear:()=>{for(const k of Object.keys(storage))delete storage[k];},key:i=>Object.keys(storage)[i]??null,get length(){return Object.keys(storage).length;}}});
Object.defineProperty(window,'sessionStorage',{value:window.localStorage});
// Preserve real local storage engines, but scope their names to this synthetic run.
const open=indexedDB.open.bind(indexedDB),del=indexedDB.deleteDatabase.bind(indexedDB);
indexedDB.open=(name,version)=>{host.dbNames.add(host.dbPrefix+name);return open(host.dbPrefix+name,version);};
indexedDB.deleteDatabase=name=>del(host.dbPrefix+name);
if(navigator.locks){const request=navigator.locks.request.bind(navigator.locks);navigator.locks.request=(name,...args)=>request(host.dbPrefix+name,...args);}
try{Object.defineProperty(navigator,'serviceWorker',{value:undefined});}catch{}
try{Object.defineProperty(navigator,'sendBeacon',{value:()=>false});}catch{}
window.WebSocket=class{constructor(){throw Error('Network disabled in UI review');}};
window.EventSource=window.WebSocket;window.XMLHttpRequest=window.WebSocket;
try{speechSynthesis.getVoices=()=>[];speechSynthesis.speak=()=>log('unsupported','Speech is disabled in this offline review.');speechSynthesis.cancel=()=>{};}catch{}
window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined;
try{Object.defineProperty(navigator,'mediaDevices',{value:undefined});}catch{}
window.open=()=>{log('unsupported','External navigation is disabled in this offline review.');return null;};
document.addEventListener('click',event=>{const a=event.target.closest?.('a[href]');if(a&&!a.download&&!/^(#|blob:|data:)/.test(a.getAttribute('href'))){event.preventDefault();log('unsupported','External link disabled: '+a.getAttribute('href'));}},true);
document.addEventListener('submit',event=>event.preventDefault(),true);
let connected=true,privacy='verified',jobCounter=0;
const jobs=new Map();
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
window.__reviewSimulation={jobs,finish(){for(const job of jobs.values())job.started=0;},fail(){cfg.scenario='error';},retry(){cfg.scenario='normal';for(const job of jobs.values())job.started=Date.now();}};
window.fetch=async(input,init={})=>{
 const url=new nativeURL(typeof input==='string'?input:input.url||input.href,document.baseURI),p=url.pathname;
 if(url.protocol==='blob:'||url.protocol==='data:')return nativeFetch(input,init);
 const asset=keyFor(url.href);if(asset)return nativeFetch(host.asset(asset));
 if(p.endsWith('/factory-config.json'))return json({version:1,mode:'remote',apiBaseUrl:'https://review-api.invalid',previewOrigin:'https://review-preview.invalid'});
 if(url.hostname!=='review-api.invalid'){log('blocked',url.href);return json({errorCode:'UI_REVIEW_UNSUPPORTED'},503);}
 let body={};try{body=JSON.parse(init.body||'{}');}catch{}
 if(p==='/v1/sessions/status')return json({connected,trusted:connected,expiresAt:Date.now()+3600000,adultPilot:{enabled:true,eligible:cfg.scenario!=='locked',active:true}});
 if(p.endsWith('/status'))return json({available:!p.includes('/audio')&&cfg.scenario!=='locked'});
 if(p==='/v1/coach'){
  await delay(500);if(cfg.scenario==='loading')await new Promise(r=>host.pending.push(r));
  if(cfg.scenario==='error')return json({errorCode:'COACH_UNAVAILABLE'},503);
  const c=body.context||{},turns=(c.conversation||[]).filter(x=>x.role==='child');
  const enough=turns.length>=2||String(c.message).length>100;
  const quote=String(c.message||'').slice(0,650);
  const evidence=Object.fromEntries(['action','consequence','experience','world','goal','visualStyle','mood'].map(k=>[k,enough?quote:'']));
  return json({mode:'model',reply:{move:enough?'listen':'clarify',text:enough?'Your idea is ready for this simulated build. Your choices will stay in the notebook.':'Let’s explore your idea. This is a scripted review conversation.',question:enough?null:'What does the player do, what happens next, and how should the game look and feel?',suggestions:[],proposedChange:null,planSuggestions:[],childDecisions:[],evidenceIds:[],...(c.creation?{creationReadiness:{ready:enough,evidence,unresolved:enough?[]:['Tell me what happens and how you want it to feel.']}}:{})}});
 }
 if(cfg.scenario==='locked'&&p==='/v1/jobs')return json({errorCode:'BUILDER_UNAVAILABLE'},503);
 if(p==='/v1/jobs'||/\/jobs\/[^/]+\/retry$/.test(p)){
  const id='review-job-'+(++jobCounter);jobs.set(id,{started:Date.now(),id});return json({jobId:id,status:'queued',adapter:'mock'});
 }
 if(/^\/v1\/jobs\/[^/]+$/.test(p)){
  const id=p.split('/').at(-1),job=jobs.get(id)||{started:Date.now()};const elapsed=Date.now()-job.started;
  const status=cfg.scenario==='error'?'failed':cfg.scenario==='loading'?'building':elapsed>14000?'ready':elapsed>7000?'testing':'building';
  return json({jobId:id,status,adapter:'mock',phase:status==='building'?'building':'testing',...(status==='ready'?{revisionId:'review-revision'}:{}),...(status==='failed'?{errorCode:'BUILD_FAILED'}:{})});
 }
 if(p.endsWith('/preview'))return json({url:'https://review-preview.invalid/game',projectId:'review-project',artifactId:'review-artifact',expiresAt:Date.now()+3600000,adapter:'mock',kind:'generated-module-v2'});
 if(p.endsWith('/creation'))return json({revisionId:'review-revision',projectId:'review-project',manifest:null});
 if(p==='/v1/creations')return json([]);
 if(p==='/v1/revisions')return json({revisionId:'review-base'});
 if(p==='/v1/sessions/adult/unlock')return json({active:true,profileId:'adult:11111111-1111-4111-8111-111111111111',sessionToken:'r'.repeat(43),expiresAt:Date.now()+3500000});
 if(p==='/v1/devices')return json({devices:[{id:'review-device',name:'Review browser',current:true,createdAt:Date.now(),lastSeenAt:Date.now()}]});
 if(p==='/v1/devices/privacy'){if(init.method==='POST')privacy='pending';return json({status:privacy,scopes:body.scopes||{generation:true,conversation:true,remoteSpeech:false},choiceId:'11111111-1111-4111-8111-111111111111'});}
 if(p.endsWith('/privacy/revoke')){privacy='revoked';return json({ok:true});}
 if(p.endsWith('/privacy/erase'))return json({ok:true,erased:true});
 if(p.endsWith('/invite'))return json({code:'DEMO-REVIEW-ONLY',invitation:'DEMO-REVIEW-ONLY',expiresAt:Date.now()+3600000});
 if(p.endsWith('/disconnect')||p.endsWith('/devices/revoke'))connected=false;
 if(p.endsWith('/enroll'))connected=true;
 if(/\/(keep|undo|fork|lock|unlock|renew|enroll|disconnect|revoke)$/.test(p))return json({ok:true,revisionId:'review-revision'});
 log('unsupported','No simulation is defined for '+p);return json({errorCode:'UI_REVIEW_UNSUPPORTED'},503);
};
// The real host keeps its preview/channel protocol; only remote iframe transport is replaced.
const frameSrc=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'src');
Object.defineProperty(HTMLIFrameElement.prototype,'src',{...frameSrc,set(value){
 if(String(value).startsWith('https://review-preview.invalid/')){const u=new nativeURL(value);this.srcdoc=host.preview(u.searchParams.get('channel'));return;}
 if(/^(https?:|file:)/.test(String(value)))throw Error('External frame disabled in review');return frameSrc.set.call(this,value);
}});
window.__reviewNavigate=async action=>{
 const FG=window.FG,click=id=>document.getElementById(id)?.click();
 const enterParent=()=>new Promise((resolve,reject)=>{
  const opened=event=>{if(event.detail==='parent'){clearTimeout(timeout);window.removeEventListener('factory-page',opened);resolve();}};
  const timeout=setTimeout(()=>{window.removeEventListener('factory-page',opened);reject(Error('Parent navigation did not finish. Check the saved-work notice.'));},10000);
  window.addEventListener('factory-page',opened);click('studioMenuParent');
 });
 FG.learning?.dispose();for(const d of document.querySelectorAll('dialog[open]'))d.close();
 if(action==='home')FG.studio.home();
 else if(action==='create')click('studioNavCreate');
 else if(action==='creations'){FG.studio.home();click('studioSavedIdeas');}
 else if(action==='coding')FG.creation.open();
 else if(action==='creative-picker'){await FG.artStudio.open();click('artBrowseAssets');}
 else if(action==='world-builder')await window.__reviewCreative('world-plate-forest');
 else if(action.startsWith('creative:'))await window.__reviewCreative(action.slice(9));
 else if(action==='art')await FG.artStudio.open();
 else if(action==='art-draw'){await FG.artStudio.open();click('artDrawButton');}
 else if(action==='coding-make'){FG.creation.open();await delay(80);click('creationIntroSkip');click('creationFreeMode');}
 else if(action==='coding-intro'){FG.creation.openIntroduction();}
 else if(action==='coding-editor'){FG.creation.open();await delay(80);click('creationIntroSkip');click('creationFreeMode');document.querySelector('[data-creation-starter="robot"]')?.click();}
 else if(action==='coding-challenge'){FG.creation.openChallenges();await delay(80);document.querySelector('[data-challenge]')?.click();}
 else if(action==='review-recovery') {
  await enterParent();
  const section=document.getElementById('jemsRecovery');
  if(!section)throw Error('The recovery controls are unavailable.');
  const origin=section.parentNode,next=section.nextSibling,dialog=document.createElement('dialog');
  dialog.setAttribute('aria-label','Synthetic family recovery');
  dialog.style.cssText='max-width:min(680px,95vw);max-height:86vh;overflow:auto;border-radius:16px';
  const close=document.createElement('button');close.textContent='Back to parent view';close.onclick=()=>dialog.close();
  dialog.append(close,section);
  dialog.addEventListener('close',()=>{origin.insertBefore(section,next?.parentNode===origin?next:null);dialog.remove();},{once:true});
  document.body.append(dialog);dialog.showModal();section.scrollIntoView();
 }
 else if(action==='privacy'){await enterParent();FG.parentDashboard.openTab('settings');document.getElementById('builderParentUnlockPassphrase').value='review-demo-only';document.getElementById('builderParentUnlock')?.requestSubmit();}

 else if(action==='powers'||action==='math'||action==='english'){if(action!=='powers'){FG.store.current().learningSubject=action==='math'?'math':'language';FG.store.current().allowSubjectSwitch=true;}FG.app.page('lab');}
 else if(action==='reasoning')click('studioNavProblemSolving');
 else if(action==='journey')click('studioNavJourney');
 else if(action==='rewards')click('studioNavRewards');
 else if(action==='pals')FG.pals.open();
 else if(action==='parent'||action.startsWith('parent:')||action==='connection'){await enterParent();FG.parentDashboard.openTab(action.split(':')[1]|| (action==='connection'?'settings':'overview'));}
 else if(action==='adult-session')dispatchEvent(new Event('factory-open-parent-session'));
 else if(action==='menu'){FG.studio.home();click('studioNavMenu');}
 else if(action==='profiles'){FG.studio.home();document.getElementById('studioProfileMenu').open=true;}
 else if(action==='notifications')click('studioNavNotifications');
 else if(action==='help')click('studioJourneyHelp');
 else if(action==='learning-setup'){FG.studio.home();document.getElementById('studioProfileMenu').open=true;click('learningProfileEdit');}
 else if(action.startsWith('legacy-')){FG.app.page(action.slice(7));if(action==='legacy-game')FG.app.openGame('buckets');}
 else if(action.startsWith('game:')){FG.studio.home();const game=action.split(':')[1];let b=document.querySelector(`[data-starter="${game}"]`);if(!b){FG.app.page('creations');b=document.querySelector(`[data-starter="${game}"]`);}if(b)b.click();else FG.app.openGame(game);}
 else if(action==='welcome')FG.studio.home();
 else if(action.startsWith('coach-')||action.startsWith('build-')){
  click('studioNavCreate');await delay(100);
  const input=document.getElementById('studioPrompt');input.value='I tap to help a purple moon cat jump to donuts. Each donut makes the cat bigger. Collect five to win. The world is a bouncy moon in cheerful pixel art. It feels silly and springy.';input.dispatchEvent(new Event('input',{bubbles:true}));
  const previous=cfg.scenario;cfg.scenario='normal';click('studioTalk');await delay(900);cfg.scenario=previous;
  if(action.startsWith('build-')){if(action==='build-wait')cfg.scenario='loading';if(action==='build-error')cfg.scenario='error';if(action==='build-unavailable')cfg.scenario='locked';click('studioSend');if(action==='build-ready'){await delay(400);window.__reviewSimulation.finish();}}
 }
 parent.postMessage({type:'review-route',action},'*');
};
document.addEventListener('click',event=>{const t=event.target.closest?.('button,[role="button"],a,input,select,textarea');if(t)host.lastElement=t.id?'#'+t.id:`${t.tagName.toLowerCase()} ${t.getAttribute('aria-label')||t.textContent?.trim().slice(0,90)||''}`;},true);
window.addEventListener('factory-page',event=>parent.postMessage({type:'review-page',page:event.detail},'*'));
window.addEventListener('error',e=>log('error',e.message));
window.addEventListener('unhandledrejection',e=>log('error',String(e.reason)));
let lastPage='';const observer=new MutationObserver(()=>{const active=document.querySelector('.page:not(.hidden)');if(active){host.activePage=active.id;if(lastPage!==active.id){lastPage=active.id;parent.postMessage({type:'review-observed',page:active.id},'*');}}});observer.observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['class']});
})();

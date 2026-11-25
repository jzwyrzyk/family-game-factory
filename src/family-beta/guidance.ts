import {isEarlyGrade,isGrade,type Grade} from '../learning/grades';
const beta=()=>typeof document!=='undefined'&&document.documentElement.dataset.privateBeta==='true';
type Setting={grade:Grade;version:number};
type Guidance={token:string;profileId:string;expiresAt:number};
let guidance:Guidance|undefined,timer:ReturnType<typeof setTimeout>|undefined;
const settings:Record<string,Setting>={};
export function betaProfileSettings(){
 if(!beta())return settings;
 const raw=document.documentElement.dataset.familyProfileSettings;
 if(raw){const value=JSON.parse(raw);for(const [id,entry] of Object.entries(value)){const s=entry as Setting;if(isGrade(s.grade)&&Number.isSafeInteger(s.version)&&s.version>0)settings[id]=s;}delete document.documentElement.dataset.familyProfileSettings;}
 return settings;
}
const owner=()=>String((window as any).FG?.store?.current?.().id??'');
function changed(){window.dispatchEvent(new Event('factory-parent-guidance'));}
function clear(){guidance=undefined;clearTimeout(timer);changed();}
export function hasParentGuidance(id=owner()){if(guidance&&guidance.expiresAt<=Date.now())clear();return beta()&&guidance?.profileId===id;}
export function learnerHeaders(headers:Headers,id:string){
 headers.delete('X-Jems-Learner');headers.delete('X-Jems-Parent-Guidance');
 if(!beta())return;
 headers.set('X-Jems-Learner',id);
 if(hasParentGuidance(id))headers.set('X-Jems-Parent-Guidance',guidance!.token);
}
async function command(path:string,body:unknown){
 const response=await fetch('/entry/'+path,{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json','X-Factory-Request':'1'},body:JSON.stringify(body)});
 const result=await response.json();if(!response.ok){
 const messages:Record<string,string>={PROFILE_VERSION_CONFLICT:'This learning setting changed on another device. Reload to review it.',PARENT_UNLOCK_REQUIRED:'Unlock Parent Controls before changing this setting.',UNAUTHENTICATED:'Unlock Parent Controls before changing this setting.',EARLY_RELEASE_REQUIRED:'Parent-guided creation is not enabled for this preview.',GUIDED_CREATION_SCOPE_REQUIRED:'A separately verified conversation or generation choice is required before supervised creation.'};
 throw Error(messages[result.errorCode]??'The family setting could not be saved. Try again from Parent Controls.');}
 return result;
}
export async function saveBetaLearningGrade(profileId:string,grade:Grade){
 if(!beta())return;
 const before=betaProfileSettings()[profileId];
 const next=await command('profile-settings',{profileId,grade,expectedVersion:before?.version??0});
 settings[profileId]=next;if(guidance?.profileId===profileId)clear();
}
export function installParentGuidance(){
 if(!beta()||document.getElementById('parentGuidance'))return;
 const host=document.getElementById('builderConnection');if(!host)return;
 const panel=document.createElement('section');panel.id='parentGuidance';panel.className='panel';
 panel.innerHTML='<h3>Make together</h3><p>A grown-up can stay with an early learner for a short creation session. This does not grant any optional processing permission.</p><p role="status" id="parentGuidanceStatus"></p><button type="button" class="btn secondary" id="parentGuidanceStart">Start parent-guided creation</button><button type="button" class="btn secondary" id="parentGuidanceEnd">End guided creation</button>';
 host.append(panel);
 const together=document.createElement('p');together.id='guidedCreationTogether';together.className='notice';together.setAttribute('role','status');together.textContent='Making together. Stay with your grown-up while creating.';document.getElementById('page-studio')?.prepend(together);
 const status=panel.querySelector<HTMLElement>('#parentGuidanceStatus')!,start=panel.querySelector<HTMLButtonElement>('#parentGuidanceStart')!,end=panel.querySelector<HTMLButtonElement>('#parentGuidanceEnd')!;
 const render=()=>{const current=(window as any).FG.store.current(),active=hasParentGuidance(current.id);panel.hidden=!isEarlyGrade(current.grade);together.hidden=!active;start.hidden=active;end.hidden=!active;start.disabled=document.documentElement.dataset.parentGuidance!=='true';status.textContent=active?'Stay together while creating. This session ends within 15 minutes, on reload, or when switching explorers.':start.disabled?'Supervised remote creation remains closed in this preview.':'Unlock Parent Controls, then start a session for this explorer. Separately verified processing choices are still required.';};
 start.onclick=async()=>{const profileId=owner();start.disabled=true;try{const result=await command('parent-guidance',{profileId,supervise:true});if(owner()!==profileId)return;guidance=result;clearTimeout(timer);timer=setTimeout(clear,Math.max(0,result.expiresAt-Date.now()));changed();}catch(error){status.textContent=(error as Error).message;}finally{start.disabled=document.documentElement.dataset.parentGuidance!=='true';}};
 end.onclick=async()=>{const profileId=owner();clear();try{await command('parent-guidance',{profileId,supervise:false});}catch(error){status.textContent=(error as Error).message;}};
 window.addEventListener('factory-profile-changing',clear);window.addEventListener('pagehide',clear);
 for(const event of ['factory-parent-guidance','factory-profile','factory-learning-settings'])window.addEventListener(event,render);
 render();
}

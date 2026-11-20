/** Session continuity shared by Studio, remote builder and optional coach.
 * Only a 401 triggers rotation. A rejected POST is NEVER replayed automatically.
 * HttpOnly session/device cookies stay with the gateway, not in browser storage.
 */
import {adultRequestSession,adultSessionVersion,clearAdultSession} from '../adult-pilot/session';
const pending=new Map<string,Promise<boolean>>();
export async function renewTrustedSession(base:string):Promise<boolean>{
 if(pending.has(base))return pending.get(base)!;
 const promise=fetch(base+'/v1/sessions/renew',{
  method:'POST',credentials:'include',cache:'no-store',redirect:'error',
  headers:{'Content-Type':'application/json','X-Factory-Request':'1'},body:'{}'
 }).then(response=>{
  if(response.ok){window.dispatchEvent(new Event('factory-session-restored'));return true;}
  return false;
 }).catch(()=>false).finally(()=>{pending.delete(base);});
 pending.set(base,promise);
 return promise;
}
const unavailable=()=>new Response(JSON.stringify({errorCode:'BUILDER_UNAVAILABLE'}),{
 status:503,headers:{'Content-Type':'application/json'}
});
const statusProbe=(base:string,proof?:string)=>fetch(base+'/v1/sessions/status',{
 credentials:'include',cache:'no-store',redirect:'error',...(proof?{headers:{'X-Factory-Adult-Session':proof}}:{})
}).catch(()=>null);
export async function familyFetch(base:string,path:string,init:RequestInit={}):Promise<Response>{
 const generation=adultSessionVersion(),adult=adultRequestSession(base);
 const changed=()=>generation!==adultSessionVersion();
 const profileChanged=()=>new Response(JSON.stringify({errorCode:'PROFILE_CHANGED'}),{status:409,headers:{'Content-Type':'application/json'}});
 const method=(init.method||'GET').toUpperCase();
 if(method!=='GET'&&!path.startsWith('/v1/sessions/')){
  // Check the actual authenticated gateway before sending a billable mutation.
  // Never assume a successful renewal also means the browser retained cookies.
  let probe=await statusProbe(base,adult?.sessionToken);
  if(!probe)return unavailable();
  if(probe.status===401){
   if(!await renewTrustedSession(base))return probe;
   probe=await statusProbe(base,adult?.sessionToken);
   if(!probe)return unavailable();
  }
  if(probe.status!==200)return probe; // 403/404/5xx must never admit a mutation.
  try{
   const status:unknown=await probe.json();
   if(!status||typeof status!=='object'||(status as {connected?:unknown}).connected!==true)
    return unavailable();
   if(adult&&(status as {adultPilot?:{active?:unknown}}).adultPilot?.active!==true){
    if(!changed())clearAdultSession('unavailable');
    return new Response(JSON.stringify({errorCode:'ADULT_PILOT_ACCESS_REQUIRED'}),{status:403,headers:{'Content-Type':'application/json'}});
   }
  }catch{return unavailable();} // Reject login pages and malformed 200s.
 }
 // A child request waiting for session renewal must not inherit a later adult
 // profile switch; an adult request must not run after switching back either.
 if(changed())return profileChanged();
 // Avoid forwarding child prompts or mutations through unexpected redirects.
 const headers=new Headers(init.headers);
 headers.delete('X-Factory-Adult-Session'); // Only this tab's current memory proof may authorize a request.
 if(adult)headers.set('X-Factory-Adult-Session',adult.sessionToken);
 const signal=adult?(init.signal?AbortSignal.any([init.signal,adult.signal]):adult.signal):init.signal;
 const options={...init,headers,signal,credentials:'include' as RequestCredentials,redirect:'error' as RequestRedirect};
 let response=await fetch(base+path,options);
 if(changed())return profileChanged();
 if(method==='GET'&&response.status===401&&await renewTrustedSession(base)&&!changed())
  response=await fetch(base+path,options);
 if(changed())return profileChanged();
 if(adult&&(response.status===401||response.status===403)){
  // A rejected adult proof cannot silently fall back to a family request.
  clearAdultSession('unavailable');
 }
 return response;
}

/** Session continuity shared by Studio, remote builder and optional coach.
 * Only a 401 triggers rotation. A rejected POST is NEVER replayed automatically.
 * HttpOnly session/device cookies stay with the gateway, not in browser storage.
 */
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
const statusProbe=(base:string)=>fetch(base+'/v1/sessions/status',{
 credentials:'include',cache:'no-store',redirect:'error'
}).catch(()=>null);
export async function familyFetch(base:string,path:string,init:RequestInit={}):Promise<Response>{
 const method=(init.method||'GET').toUpperCase();
 if(method!=='GET'&&!path.startsWith('/v1/sessions/')){
  // Check the actual authenticated gateway before sending a billable mutation.
  // Never assume a successful renewal also means the browser retained cookies.
  let probe=await statusProbe(base);
  if(!probe)return unavailable();
  if(probe.status===401){
   if(!await renewTrustedSession(base))return probe;
   probe=await statusProbe(base);
   if(!probe)return unavailable();
  }
  if(probe.status!==200)return probe; // 403/404/5xx must never admit a mutation.
  try{
   const status:unknown=await probe.json();
   if(!status||typeof status!=='object'||(status as {connected?:unknown}).connected!==true)
    return unavailable();
  }catch{return unavailable();} // Reject login pages and malformed 200s.
 }
 // Avoid forwarding child prompts or mutations through unexpected redirects.
 const options={...init,credentials:'include' as RequestCredentials,redirect:'error' as RequestRedirect};
 let response=await fetch(base+path,options);
 if(method==='GET'&&response.status===401&&await renewTrustedSession(base))
  response=await fetch(base+path,options);
 return response;
}

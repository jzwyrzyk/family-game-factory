/** Session continuity shared by Studio, remote builder and optional coach.
 * Only a 401 triggers rotation. A rejected POST is NEVER replayed automatically.
 * HttpOnly session/device cookies stay with the gateway, not in browser storage.
 */
const pending=new Map<string,Promise<boolean>>();
export async function renewTrustedSession(base:string):Promise<boolean>{
 if(pending.has(base))return pending.get(base)!;
 const promise=fetch(base+'/v1/sessions/renew',{
  method:'POST',credentials:'include',cache:'no-store',
  headers:{'Content-Type':'application/json','X-Factory-Request':'1'},body:'{}'
 }).then(response=>{
  if(response.ok){window.dispatchEvent(new Event('factory-session-restored'));return true;}
  return false;
 }).catch(()=>false).finally(()=>{pending.delete(base);});
 pending.set(base,promise);
 return promise;
}
export async function familyFetch(base:string,path:string,init:RequestInit={}):Promise<Response>{
 const method=(init.method||'GET').toUpperCase();
 if(method!=='GET'&&!path.startsWith('/v1/sessions/')){
  // Before a potentially billable POST, establish authentication without sending
  // any job body. A 401 can be renewed here; a returned POST is never retried.
  const probe=await fetch(base+'/v1/sessions/status',{credentials:'include',cache:'no-store'}).catch(()=>null);
  if(probe?.status===401){
   if(!await renewTrustedSession(base))return probe;
  }else if(probe&&probe.status!==200&&probe.status!==404){
   // 404 preserves compatibility with pre-upgrade fixture servers; all modern
   // production gateways implement the endpoint and must fail closed.
   return probe;
  }
 }
 const options={...init,credentials:'include' as RequestCredentials};
 let response=await fetch(base+path,options);
 if(method==='GET'&&response.status===401&&await renewTrustedSession(base))
  response=await fetch(base+path,options);
 return response;
}

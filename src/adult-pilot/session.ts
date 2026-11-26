/** Temporary adult development profile. Credentials live only in this tab's memory.
 * The server still verifies its HttpOnly cookie, permit, device and this proof.
 */
export interface AdultProfileSession {
  base:string; profileId:string; sessionToken:string; expiresAt:number;
}
let current:AdultProfileSession|null=null,version=0;
let controller:AbortController|null=null,timer:ReturnType<typeof setTimeout>|undefined;
let ended:((reason:string,session:AdultProfileSession)=>void)|undefined;
export const adultSessionVersion=()=>version;
export function onAdultSessionEnded(handler:(reason:string,session:AdultProfileSession)=>void){ended=handler;}
export function clearAdultSession(reason='locked',notify=true):AdultProfileSession|null {
  const previous=current;current=null;++version;clearTimeout(timer);controller?.abort();controller=null;
  if(previous&&notify)ended?.(reason,previous);
  return previous;
}
export function activateAdultSession(base:string,value:unknown):AdultProfileSession {
  const data=value as {active?:unknown;profileId?:unknown;sessionToken?:unknown;expiresAt?:unknown};
  if(!data||data.active!==true||typeof data.profileId!=='string'||!/^adult:[a-f0-9-]{36}$/i.test(data.profileId)
    ||typeof data.sessionToken!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(data.sessionToken)
    ||typeof data.expiresAt!=='number'||!Number.isSafeInteger(data.expiresAt)||data.expiresAt<=Date.now()
    ||data.expiresAt>Date.now()+60*60_000+5_000)throw Error('ADULT_SESSION_UNAVAILABLE');
  clearAdultSession('replaced',false);
  current={base,profileId:data.profileId,sessionToken:data.sessionToken,expiresAt:data.expiresAt};
  controller=new AbortController();
  timer=setTimeout(()=>clearAdultSession('expired'),Math.max(0,current.expiresAt-Date.now()));
  return {...current};
}
export function adultRequestSession(base:string){
  if(current&&current.expiresAt<=Date.now())clearAdultSession('expired');
  return current?.base===base?{...current,signal:controller!.signal}:null;
}

/** Current tab grant only; callers must still verify the live server before restoration. */
export function currentAdultSession():AdultProfileSession|null {if(current&&current.expiresAt<=Date.now())clearAdultSession('expired');return current?{...current}:null;}

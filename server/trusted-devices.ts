/** Trusted-device sessions: enrollment is adult-invitation gated, renewal is automatic,
 * all durable credentials are SHA-256 hashes, and no child prompt or profile is stored.
 * Keep this on the gateway; never include device secrets in browser bundles or logs.
 */
import {createHash,createHmac,randomBytes,randomUUID,scryptSync,timingSafeEqual} from 'node:crypto';
import type {IncomingMessage,ServerResponse} from 'node:http';
import type {VerifiedSession} from './contracts/api';
import type {Repository} from './pipeline/types';
import {signSession,verifySession} from './pipeline/auth';

export interface TrustedDevice {
 id:string;familyId:string;name:string;secretHash:string;rotation:number;
 createdAt:number;lastSeenAt:number;expiresAt:number;revokedAt?:number;
 previousHash?:string;previousAt?:number;
}
export interface FamilyParentAuth {
 salt:string;digest:string;failedAttempts:number;lockedUntil:number;
}
const DAY=86400000,ACCESS=DAY,DEVICE_IDLE=90*DAY,DEVICE_MAX=365*DAY;
const PARENT_ACCESS=15*60000,PREVIOUS_GRACE=15000,MAX_DEVICES=12;
const token=()=>randomBytes(32).toString('base64url');
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const hmac=(key:string,value:string)=>createHmac('sha256',key).update(value).digest('base64url');
const equal=(left:string,right:string)=>/^[0-9a-f]{64}$/.test(left)&&/^[0-9a-f]{64}$/.test(right)&&timingSafeEqual(Buffer.from(left,'hex'),Buffer.from(right,'hex'));
const passwordHash=(passphrase:string,salt:string)=>scryptSync(passphrase,Buffer.from(salt,'hex'),32,{N:16384,r:8,p:1}).toString('hex');
const passphraseOk=(value:unknown):value is string=>typeof value==='string'&&value.length>=12&&value.length<=128;
export function cookieValue(raw:string|undefined,name:string){
 return raw?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);
}
function deviceLive(device:TrustedDevice,now:number){
 return !device.revokedAt&&device.expiresAt>now&&device.lastSeenAt+DEVICE_IDLE>now;
}
export async function verifyBrowserSession(repo:Repository|undefined,rawCookie:string|undefined,key:string,now=Date.now()):Promise<VerifiedSession>{
 const session=verifySession(cookieValue(rawCookie,'factory_session'),key,now);
 if(session.deviceId){
  if(!repo)throw Error('UNAUTHENTICATED');
  const state=await repo.snapshot(),device=state.devices?.find(d=>d.id===session.deviceId&&d.familyId===session.familyId);
  if(!device||!deviceLive(device,now))throw Error('UNAUTHENTICATED');
 }
 return session;
}
const secureCookie=(name:string,value:string,maxAge:number,path='/v1')=>
 name+'='+value+'; Path='+path+'; Secure; HttpOnly; SameSite=None; Partitioned; Max-Age='+Math.max(0,Math.floor(maxAge));
const noCookie=(name:string,path='/v1')=>secureCookie(name,'',0,path);
const deviceCookie=(device:TrustedDevice,secret:string,now:number)=>
 secureCookie('factory_device',device.id+'.'+secret,Math.min(device.expiresAt-now,device.lastSeenAt+DEVICE_IDLE-now)/1000);
const accessCookie=(familyId:string,deviceId:string,sessionKey:string,now:number)=>
 secureCookie('factory_session',signSession({subject:'family-designer',familyId,deviceId,role:'designer',expiresAt:now+ACCESS},sessionKey),ACCESS/1000);
const parentCookie=(familyId:string,deviceId:string,sessionKey:string,now:number)=>
 secureCookie('factory_parent',signSession({subject:'family-parent',familyId,deviceId,role:'parent',expiresAt:now+PARENT_ACCESS},sessionKey),PARENT_ACCESS/1000,'/v1/devices');
const rotatedSecret=(key:string,deviceId:string,sequence:number,secret:string)=>
 hmac(key,'jems-device-rotation-v1\n'+deviceId+'\n'+sequence+'\n'+secret);

export function trustedDeviceHandler(repo:Repository,config:{appOrigin:string;familyId:string;sessionKey:string}){
 return async(request:IncomingMessage,response:ServerResponse)=>{
  const cors={'Access-Control-Allow-Origin':config.appOrigin,'Access-Control-Allow-Credentials':'true','Vary':'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
  const reply=(status:number,value:unknown,cookies?:string[])=>{
   response.writeHead(status,{...cors,'Content-Type':'application/json',...(cookies?{'Set-Cookie':cookies}:{})});
   response.end(JSON.stringify(value));
  };
  const readBody=async()=>{
   if(request.headers['x-factory-request']!=='1'||!request.headers['content-type']?.startsWith('application/json'))throw Error('FORBIDDEN');
   let raw='';for await(const piece of request){raw+=piece;if(Buffer.byteLength(raw)>2048)throw Error('INVALID_REQUEST');}
   let data:unknown;try{data=JSON.parse(raw||'{}');}catch{throw Error('INVALID_REQUEST');}
   if(!data||typeof data!=='object'||Array.isArray(data))throw Error('INVALID_REQUEST');
   return data as Record<string,unknown>;
  };
  const expectKeys=(data:Record<string,unknown>,allowed:string[])=>{
   if(Object.keys(data).some(k=>!allowed.includes(k)))throw Error('INVALID_REQUEST');
  };
  const now=Date.now(),path=new URL(request.url||'/', 'https://internal.invalid').pathname;
  try{
   if(request.headers.origin&&request.headers.origin!==config.appOrigin)throw Error('FORBIDDEN');
   if(request.method!=='GET'&&request.headers.origin!==config.appOrigin)throw Error('FORBIDDEN');
   if(request.method==='OPTIONS'){
    response.writeHead(204,{...cors,'Access-Control-Allow-Headers':'Content-Type,X-Factory-Request','Access-Control-Allow-Methods':'GET,POST'});
    response.end();return;
   }
   if(path==='/v1/sessions/enroll'&&request.method==='POST'){
    const input=await readBody();expectKeys(input,['invitation','deviceName','parentPassphrase']);
    if(typeof input.invitation!=='string'||!/^[A-Za-z0-9_-]{40,100}$/.test(input.invitation)||
       !passphraseOk(input.parentPassphrase)||typeof input.deviceName!=='string'||!/^.{1,48}$/u.test(input.deviceName.trim()))
     throw Error('INVALID_REQUEST');
    const name=input.deviceName.trim(),inviteHash=digest(input.invitation),passphrase=input.parentPassphrase;
    const id=randomUUID(),secret=token(),salt=randomBytes(16).toString('hex');
    const enrolled=await repo.transaction(state=>{
     const invitation=state.invitations?.find(x=>x.hash===inviteHash&&x.familyId===config.familyId&&!x.used&&x.expiresAt>now);
     if(!invitation)throw Error('INVALID_INVITATION');
     const existing=state.parentAuth?.[config.familyId];
     if(existing){
      if(existing.lockedUntil>now)throw Error('PARENT_LOCKED');
      if(!equal(existing.digest,passwordHash(passphrase,existing.salt))){
       existing.failedAttempts++;
       if(existing.failedAttempts>=5){existing.lockedUntil=now+15*60000;existing.failedAttempts=0;}
       return null; // Persist failed attempts; throwing inside a transaction would roll them back.
      }
      existing.failedAttempts=0;existing.lockedUntil=0;
     }else{
      state.parentAuth??={};
      state.parentAuth[config.familyId]={salt,digest:passwordHash(passphrase,salt),failedAttempts:0,lockedUntil:0};
     }
     state.devices??=[];
     // Bound persistent metadata without resurrecting expired or revoked devices.
     state.devices=state.devices.filter(d=>d.familyId!==config.familyId||deviceLive(d,now)||(!!d.revokedAt&&d.revokedAt>now-30*DAY));
     if(state.devices.filter(d=>d.familyId===config.familyId&&deviceLive(d,now)).length>=MAX_DEVICES)throw Error('DEVICE_LIMIT');
     invitation.used=true;
     const device:TrustedDevice={id,familyId:config.familyId,name,secretHash:digest(secret),rotation:0,createdAt:now,lastSeenAt:now,expiresAt:now+DEVICE_MAX};
     state.devices.push(device);return device;
    });
    if(!enrolled)throw Error('INVALID_PARENT_ACCESS');
    reply(200,{connected:true,trusted:true,deviceName:enrolled.name,expiresAt:now+ACCESS},
      [accessCookie(config.familyId,enrolled.id,config.sessionKey,now),deviceCookie(enrolled,secret,now)]);
    return;
   }
   if(path==='/v1/sessions/renew'&&request.method==='POST'){
    const input=await readBody();expectKeys(input,[]);
    const raw=cookieValue(request.headers.cookie,'factory_device')||'',match=raw.match(/^([0-9a-f-]{36})\.([A-Za-z0-9_-]{40,100})$/);
    if(!match)throw Error('UNAUTHENTICATED');
    const id=match[1],oldSecret=match[2],oldHash=digest(oldSecret);
    const {device,next}=await repo.transaction(state=>{
     const device=state.devices?.find(d=>d.id===id&&d.familyId===config.familyId);
     if(!device||!deviceLive(device,now))throw Error('UNAUTHENTICATED');
     let next:string;
     if(equal(device.secretHash,oldHash)){
      const sequence=device.rotation+1;
      next=rotatedSecret(config.sessionKey,id,sequence,oldSecret);
      device.previousHash=device.secretHash;device.previousAt=now;
      device.secretHash=digest(next);device.rotation=sequence;device.lastSeenAt=now;
     }else if(device.previousHash&&equal(device.previousHash,oldHash)&&now-(device.previousAt||0)<=PREVIOUS_GRACE){
      next=rotatedSecret(config.sessionKey,id,device.rotation,oldSecret);
      if(!equal(device.secretHash,digest(next)))throw Error('UNAUTHENTICATED');
     }else throw Error('UNAUTHENTICATED');
     return {device,next};
    });
    reply(200,{connected:true,trusted:true,expiresAt:now+ACCESS},
      [accessCookie(config.familyId,device.id,config.sessionKey,now),deviceCookie(device,next,now)]);
    return;
   }
   if(path==='/v1/sessions/status'&&request.method==='GET'){
    const session=await verifyBrowserSession(repo,request.headers.cookie,config.sessionKey,now);
    if(session.familyId!==config.familyId)throw Error('UNAUTHENTICATED');
    const state=await repo.snapshot(),device=state.devices?.find(d=>d.id===session.deviceId&&d.familyId===config.familyId);
    reply(200,{connected:true,trusted:!!device,deviceName:device?.name||null,expiresAt:session.expiresAt});
    return;
   }
   if(path==='/v1/devices/disconnect'&&request.method==='POST'){
    const input=await readBody();expectKeys(input,[]);
    const session=await verifyBrowserSession(repo,request.headers.cookie,config.sessionKey,now);
    if(!session.deviceId||session.familyId!==config.familyId)throw Error('UNAUTHENTICATED');
    await repo.transaction(state=>{
     const device=state.devices?.find(d=>d.id===session.deviceId&&d.familyId===config.familyId);
     if(!device||!deviceLive(device,now))throw Error('UNAUTHENTICATED');
     device.revokedAt=now;return true;
    });
    reply(200,{disconnected:true},[noCookie('factory_session'),noCookie('factory_device'),noCookie('factory_parent','/v1/devices')]);
    return;
   }
   if(path==='/v1/devices/unlock'&&request.method==='POST'){
    const input=await readBody();expectKeys(input,['parentPassphrase']);
    if(!passphraseOk(input.parentPassphrase))throw Error('INVALID_PARENT_ACCESS');
    const session=await verifyBrowserSession(repo,request.headers.cookie,config.sessionKey,now);
    if(!session.deviceId||session.familyId!==config.familyId)throw Error('UNAUTHENTICATED');
    const passphrase=input.parentPassphrase;
    const allowed=await repo.transaction(state=>{
     const current=state.parentAuth?.[config.familyId];if(!current)throw Error('INVALID_PARENT_ACCESS');
     if(current.lockedUntil>now)throw Error('PARENT_LOCKED');
     if(!equal(current.digest,passwordHash(passphrase,current.salt))){
      current.failedAttempts++;
      if(current.failedAttempts>=5){current.lockedUntil=now+15*60000;current.failedAttempts=0;}
      return false;
     }
     current.failedAttempts=0;current.lockedUntil=0;return true;
    });
    if(!allowed)throw Error('INVALID_PARENT_ACCESS');
    reply(200,{unlocked:true,expiresAt:now+PARENT_ACCESS},[parentCookie(config.familyId,session.deviceId,config.sessionKey,now)]);
    return;
   }
   if((path==='/v1/devices'||path==='/v1/devices/revoke'||path==='/v1/devices/invite')&&
      (request.method==='GET'||request.method==='POST')){
    const session=await verifyBrowserSession(repo,request.headers.cookie,config.sessionKey,now);
    const parent=verifySession(cookieValue(request.headers.cookie,'factory_parent'),config.sessionKey,now);
    if(session.familyId!==config.familyId||!session.deviceId||parent.role!=='parent'||parent.deviceId!==session.deviceId||parent.familyId!==session.familyId)throw Error('FORBIDDEN');
    if(path==='/v1/devices'&&request.method==='GET'){
     const state=await repo.snapshot();
     reply(200,{devices:(state.devices||[]).filter(d=>d.familyId===session.familyId&&deviceLive(d,now))
      .map(d=>({id:d.id,name:d.name,createdAt:d.createdAt,lastSeenAt:d.lastSeenAt,expiresAt:d.expiresAt,current:d.id===session.deviceId}))});
     return;
    }
    if(path==='/v1/devices/invite'&&request.method==='POST'){
     const input=await readBody();expectKeys(input,[]);
     const invitation=token(),hash=digest(invitation),expiresAt=now+600000;
     await repo.transaction(state=>{
      state.invitations??=[];
      state.invitations=state.invitations.filter(x=>x.expiresAt>now&&!x.used);
      if(state.invitations.filter(x=>x.familyId===session.familyId).length>=3)throw Error('INVITE_LIMIT');
      state.invitations.push({hash,familyId:session.familyId,expiresAt,used:false});
      return true;
     });
     reply(200,{invitation,expiresAt});
     return;
    }
    if(path==='/v1/devices/revoke'&&request.method==='POST'){
     const input=await readBody();expectKeys(input,['deviceId']);
     if(typeof input.deviceId!=='string'||!/^[a-f0-9-]{36}$/.test(input.deviceId))throw Error('INVALID_REQUEST');
     await repo.transaction(state=>{
      const device=state.devices?.find(d=>d.id===input.deviceId&&d.familyId===session.familyId);
      if(!device||!deviceLive(device,now))throw Error('NOT_FOUND');
      device.revokedAt=now;return true;
     });
     reply(200,{revoked:true},input.deviceId===session.deviceId?
      [noCookie('factory_session'),noCookie('factory_device'),noCookie('factory_parent','/v1/devices')]:undefined);
     return;
    }
   }
   reply(404,{errorCode:'NOT_FOUND'});
  }catch(error){
   const reason=(error as Error).message;
   const status=reason==='UNAUTHENTICATED'?401:reason==='INVALID_INVITATION'||reason==='INVALID_PARENT_ACCESS'||reason==='FORBIDDEN'?403:
    reason==='PARENT_LOCKED'||reason==='DEVICE_LIMIT'||reason==='INVITE_LIMIT'?429:reason==='INVALID_REQUEST'?400:503;
   reply(status,{errorCode:['UNAUTHENTICATED','INVALID_INVITATION','INVALID_PARENT_ACCESS','FORBIDDEN','PARENT_LOCKED','DEVICE_LIMIT','INVITE_LIMIT','INVALID_REQUEST'].includes(reason)?reason:'SERVICE_UNAVAILABLE'});
  }
 };
}

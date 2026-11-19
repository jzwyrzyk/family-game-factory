import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {test} from 'node:test';
import {MemoryRepository} from '../server/pipeline/repository';
import type {PipelineState} from '../server/pipeline/types';
import type {VerifiedSession} from '../server/contracts/api';
import {trustedDeviceHandler,verifyBrowserSession} from '../server/trusted-devices';
import {mintDeviceInvitation} from '../server/device-owner';
import {signSession,verifySession} from '../server/pipeline/auth';
import {ADULT_PILOT_SESSION_MS,adultPilotAllowed,adultPilotJobAllowed,
 grantAdultPilot,revokeAdultPilot,type AdultPilotFlags} from '../server/adult-pilot';

const familyId='adult-profile-fixture',origin='https://jems.example';
const key='synthetic-signing-key-for-adult-profile-tests-only';
const passphrase='synthetic adult passphrase';
const flags:AdultPilotFlags={enabled:true,ownerApproved:true,profileAccessVerified:true};
const cookie=(response:Response,name:string)=>response.headers.getSetCookie()
 .map(value=>value.split(';')[0]).find(value=>value.startsWith(name+'='))?.slice(name.length+1)||'';
const jar=(response:Response)=>response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
class TestRepository extends MemoryRepository {
 revokeBeforeNextTransaction?:string;
 failBeforeNextTransaction=false;
 override async transaction<T>(update:(state:PipelineState)=>T):Promise<T>{
  if(this.failBeforeNextTransaction){this.failBeforeNextTransaction=false;throw Error('TEST_STORE_UNAVAILABLE');}
  const deviceId=this.revokeBeforeNextTransaction;this.revokeBeforeNextTransaction=undefined;
  if(deviceId)await super.transaction(state=>{
   state.devices!.find(device=>device.id===deviceId)!.revokedAt=Date.now();return true;
  });
  return super.transaction(update);
 }
}
interface RequestOptions {
 method?:'GET'|'POST'|'OPTIONS';body?:unknown;cookies?:string;proof?:string;
 origin?:string|null;requestHeader?:boolean;
}
interface Connected {cookies:string;deviceId:string;session:VerifiedSession}
interface Opened {cookies:string;adultCookie:string;sessionToken:string;profileId:string;expiresAt:number}
async function fixture(run:(args:{repo:TestRepository;
 request:(path:string,options?:RequestOptions)=>Promise<Response>;
 connect:()=>Promise<Connected>;permit:(deviceId:string,receipt?:string,expiresAt?:number)=>Promise<unknown>;
 unlock:(connected:Connected)=>Promise<Opened>;eraseCalls:VerifiedSession[]})=>Promise<void>,adultPilot:AdultPilotFlags=flags){
 const repo=new TestRepository(),eraseCalls:VerifiedSession[]=[];
 const handler=trustedDeviceHandler(repo,{appOrigin:origin,familyId,sessionKey:key,adultPilot,
  eraseCoachReceipts:async session=>{eraseCalls.push(session);return {erased:true};}});
 const server=createServer((req,res)=>{void handler(req,res);});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+(server.address() as {port:number}).port;
 const request=(path:string,options:RequestOptions={})=>{
  const method=options.method??(options.body===undefined?'GET':'POST');
  const headers:Record<string,string>={};
  if(options.origin!==null)headers.Origin=options.origin??origin;
  if(options.cookies)headers.Cookie=options.cookies;
  if(options.proof!==undefined)headers['X-Factory-Adult-Session']=options.proof;
  if(method==='POST'){
   headers['Content-Type']='application/json';
   if(options.requestHeader!==false)headers['X-Factory-Request']='1';
  }
  return fetch(base+path,{method,headers,...(method==='POST'?{body:JSON.stringify(options.body??{})}:{})});
 };
 const connect=async()=>{
  const invitation=await mintDeviceInvitation(repo,familyId);
  const response=await request('/v1/sessions/enroll',{body:{invitation,deviceName:'Development tablet',parentPassphrase:passphrase}});
  assert.equal(response.status,200);
  const cookies=jar(response),session=await verifyBrowserSession(repo,cookies,key);
  return {cookies,session,deviceId:session.deviceId!};
 };
 const permit=(deviceId:string,receipt='operator-reviewed-adult-fixture',expiresAt=Date.now()+86400000)=>
  grantAdultPilot(repo,{familyId,deviceId,receipt,operatorConfirmedAdult:true,expiresAt});
 const unlock=async(connected:Connected)=>{
  const response=await request('/v1/sessions/adult/unlock',{body:{parentPassphrase:passphrase},cookies:connected.cookies});
  assert.equal(response.status,200);
  const data=await response.json() as Omit<Opened,'cookies'|'adultCookie'>&{active:boolean};
  assert.equal(data.active,true);
  return {...data,cookies:connected.cookies+'; '+jar(response),adultCookie:cookie(response,'factory_adult')};
 };
 try{await run({repo,request,connect,permit,unlock,eraseCalls});}
 finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
}

test('adult profile selection needs an operator-approved device and its adult passphrase',async()=>{
 await fixture(async({repo,request,connect,permit,unlock})=>{
  const connected=await connect();
  const status=await(await request('/v1/sessions/status',{cookies:connected.cookies})).json();
  assert.deepEqual(status.adultPilot,{enabled:true,eligible:false,active:false,profileId:null,expiresAt:null});
  assert.equal((await request('/v1/sessions/adult/unlock',{
   body:{parentPassphrase:passphrase},cookies:connected.cookies})).status,403,
  'knowing the passphrase cannot self-enroll a device into the adult pilot');
  await permit(connected.deviceId);
  assert.equal(adultPilotAllowed(await repo.snapshot(),connected.session),false,'permit alone never activates AI');
  const denied=await request('/v1/sessions/adult/unlock',{
   body:{parentPassphrase:'incorrect adult passphrase'},cookies:connected.cookies});
  assert.equal(denied.status,403);assert.equal(denied.headers.getSetCookie().length,0);
  assert.equal((await request('/v1/sessions/adult/unlock',{
   body:{parentPassphrase:passphrase,role:'adult',adultProfileId:'adult:chosen'},cookies:connected.cookies})).status,400);
  assert.equal((await repo.snapshot()).adultPilotSessions?.length||0,0);
  const opened=await unlock(connected);
  assert.equal(opened.profileId,'adult:'+connected.deviceId);
  const active=await verifyBrowserSession(repo,opened.cookies,key,Date.now(),opened.sessionToken);
  assert.equal(adultPilotAllowed(await repo.snapshot(),active),true,'selecting/unlocking the adult profile activates immediately');
 });
});

test('adult session requires both the HttpOnly cookie and a per-tab proof; family cookies cannot elevate',async()=>{
 await fixture(async({repo,request,connect,permit})=>{
  const connected=await connect();await permit(connected.deviceId);
  const response=await request('/v1/sessions/adult/unlock',{body:{parentPassphrase:passphrase},cookies:connected.cookies});
  assert.equal(response.status,200);
  const opened=await response.json();
  const rawCookie=cookie(response,'factory_adult'),cookies=connected.cookies+'; '+jar(response);
  for(const expected of ['Path=/v1;','Secure','HttpOnly','SameSite=None','Partitioned','Max-Age=3600'])
   assert.ok(response.headers.getSetCookie()[0].includes(expected),expected);
  assert.notEqual(rawCookie.split('.')[1],opened.sessionToken,'the browser proof is not the HttpOnly credential');
  const state=await repo.snapshot(),stored=JSON.stringify(state);
  assert.ok(!stored.includes(opened.sessionToken));assert.ok(!stored.includes(rawCookie.split('.')[1]));
  assert.ok(!stored.includes(passphrase));assert.ok(!stored.includes('operator-reviewed-adult-fixture'));
  const child=await verifyBrowserSession(repo,cookies,key);
  assert.equal(child.adultSessionId,undefined);assert.equal(child.adultProfileId,undefined);
  assert.equal(adultPilotAllowed(state,child),false,'another child tab only shares ambient cookies');
  await assert.rejects(verifyBrowserSession(repo,connected.cookies,key,Date.now(),opened.sessionToken),/ADULT_PILOT_ACCESS_REQUIRED/);
  await assert.rejects(verifyBrowserSession(repo,cookies,key,Date.now(),'x'.repeat(43)),/ADULT_PILOT_ACCESS_REQUIRED/);
  await assert.rejects(verifyBrowserSession(repo,cookies,key,Date.now(),[opened.sessionToken]),/ADULT_PILOT_ACCESS_REQUIRED/);
  const adult=await verifyBrowserSession(repo,cookies,key,Date.now(),opened.sessionToken);
  assert.equal(adultPilotAllowed(state,adult),true);
  const injected=signSession({...connected.session,adultSessionId:adult.adultSessionId,adultProfileId:adult.adultProfileId},key);
  const cleaned=await verifyBrowserSession(repo,'factory_session='+injected+'; factory_adult='+rawCookie,key);
  assert.equal(cleaned.adultSessionId,undefined);assert.equal(cleaned.adultProfileId,undefined,
   'even signed family-cookie fields cannot substitute for the per-tab proof');
  const status=await(await request('/v1/sessions/status',{cookies})).json();
  assert.equal(status.adultPilot.eligible,true);assert.equal(status.adultPilot.active,false);
  const active=await(await request('/v1/sessions/status',{cookies,proof:opened.sessionToken})).json();
  assert.equal(active.adultPilot.active,true);assert.equal(active.adultPilot.expiresAt,opened.expiresAt);
  const forged=await(await request('/v1/sessions/status',{cookies,proof:'x'.repeat(43)})).json();
  assert.equal(forged.adultPilot.active,false);
 });
});

test('adult sessions cannot move between trusted devices, families, cookies or grants',async()=>{
 await fixture(async({repo,request,connect,permit,unlock})=>{
  const one=await connect(),two=await connect();
  await permit(one.deviceId,'operator-reviewed-device-one');await permit(two.deviceId,'operator-reviewed-device-two');
  const first=await unlock(one),second=await unlock(two);
  await assert.rejects(verifyBrowserSession(repo,two.cookies+'; factory_adult='+first.adultCookie,key,Date.now(),first.sessionToken),/ADULT_PILOT_ACCESS_REQUIRED/);
  await assert.rejects(verifyBrowserSession(repo,first.cookies,key,Date.now(),second.sessionToken),/ADULT_PILOT_ACCESS_REQUIRED/);
  const foreign=signSession({...one.session,familyId:'another-family'},key);
  await assert.rejects(verifyBrowserSession(repo,'factory_session='+foreign+'; factory_adult='+first.adultCookie,key,Date.now(),first.sessionToken),/UNAUTHENTICATED/);
  const altered=one.cookies+'; factory_adult='+first.adultCookie.split('.')[0]+'.'+'y'.repeat(43);
  await assert.rejects(verifyBrowserSession(repo,altered,key,Date.now(),first.sessionToken),/ADULT_PILOT_ACCESS_REQUIRED/);
  const before=(await repo.snapshot()).adultPilotSessions;
  const wrongLock=await request('/v1/sessions/adult/lock',{body:{},cookies:first.cookies,proof:second.sessionToken});
  assert.equal(wrongLock.status,200);assert.equal(wrongLock.headers.getSetCookie().length,0);
  assert.deepEqual((await repo.snapshot()).adultPilotSessions,before,'invalid proof cannot revoke someone else\'s grant');
  assert.equal(adultPilotAllowed(await repo.snapshot(),await verifyBrowserSession(repo,second.cookies,key,Date.now(),second.sessionToken)),true);
 });
});

test('a delayed old-tab lock preserves the newer cookie and grant, while valid logout works after family access expires',async()=>{
 await fixture(async({repo,request,connect,permit,unlock})=>{
  const connected=await connect();await permit(connected.deviceId);
  const old=await unlock(connected),current=await unlock(connected);
  const active=await verifyBrowserSession(repo,current.cookies,key,Date.now(),current.sessionToken);
  const job={familyId,adultPilotDeviceId:connected.deviceId,adultPilotSessionId:active.adultSessionId,adultPilotProfileId:active.adultProfileId};
  // A pending unlock from the old tab was cancelled. Its revocation finally
  // arrives after another tab replaced the shared browser cookie.
  const stale=await request('/v1/sessions/adult/lock',{body:{},cookies:current.cookies,proof:old.sessionToken});
  assert.equal(stale.status,200);assert.deepEqual(await stale.json(),{active:false});
  assert.equal(stale.headers.getSetCookie().length,0,'do not clear the new tab\'s cookie');
  assert.equal(adultPilotJobAllowed(await repo.snapshot(),job),true);
  assert.equal(adultPilotAllowed(await repo.snapshot(),await verifyBrowserSession(repo,current.cookies,key,Date.now(),current.sessionToken)),true);
  const expiredBase=signSession({...connected.session,expiresAt:Date.now()-1000},key);
  const locked=await request('/v1/sessions/adult/lock',{body:{},
   cookies:'factory_session='+expiredBase+'; factory_adult='+current.adultCookie,proof:current.sessionToken});
  assert.equal(locked.status,200);assert.ok(locked.headers.getSetCookie()[0].includes('Max-Age=0'));
  assert.equal(adultPilotJobAllowed(await repo.snapshot(),job),false);
  const expired=await request('/v1/sessions/adult/lock',{body:{},cookies:current.cookies,proof:current.sessionToken});
  assert.equal(expired.status,200);assert.ok(expired.headers.getSetCookie()[0].includes('Max-Age=0'));
 });
});

test('a failed lock transaction cannot overwrite an unverified shared cookie',async()=>{
 await fixture(async({repo,request,connect,permit,unlock})=>{
  const connected=await connect();await permit(connected.deviceId);const opened=await unlock(connected);
  const before=(await repo.snapshot()).adultPilotSessions;
  repo.failBeforeNextTransaction=true;
  const failed=await request('/v1/sessions/adult/lock',{body:{},cookies:opened.cookies,proof:opened.sessionToken});
  assert.equal(failed.status,503);assert.equal(failed.headers.getSetCookie().length,0);
  assert.deepEqual((await repo.snapshot()).adultPilotSessions,before);
 });
});

test('switching out of the adult profile revokes its grant and pending work; re-unlock never revives old work',async()=>{
 await fixture(async({repo,request,connect,permit,unlock})=>{
  const connected=await connect();await permit(connected.deviceId);const opened=await unlock(connected);
  const adult=await verifyBrowserSession(repo,opened.cookies,key,Date.now(),opened.sessionToken);
  const job={familyId,adultPilotDeviceId:connected.deviceId,adultPilotSessionId:adult.adultSessionId,adultPilotProfileId:adult.adultProfileId};
  assert.equal(adultPilotJobAllowed(await repo.snapshot(),job),true);
  const locked=await request('/v1/sessions/adult/lock',{body:{},cookies:opened.cookies,proof:opened.sessionToken});
  assert.equal(locked.status,200);assert.deepEqual(await locked.json(),{active:false});
  assert.ok(locked.headers.getSetCookie()[0].startsWith('factory_adult='));
  assert.ok(locked.headers.getSetCookie()[0].includes('Max-Age=0'));
  assert.equal(adultPilotAllowed(await repo.snapshot(),adult),false);
  assert.equal(adultPilotJobAllowed(await repo.snapshot(),job),false);
  await assert.rejects(verifyBrowserSession(repo,opened.cookies,key,Date.now(),opened.sessionToken),/ADULT_PILOT_ACCESS_REQUIRED/);
  const again=await unlock(connected),newAdult=await verifyBrowserSession(repo,again.cookies,key,Date.now(),again.sessionToken);
  assert.notEqual(newAdult.adultSessionId,adult.adultSessionId);
  assert.equal(adultPilotAllowed(await repo.snapshot(),newAdult),true);
  assert.equal(adultPilotJobAllowed(await repo.snapshot(),job),false,'a new unlock does not inherit an earlier pending job');
  const anonymous=await request('/v1/sessions/adult/lock',{body:{}});
  assert.equal(anonymous.status,200);assert.ok(anonymous.headers.getSetCookie()[0].includes('Max-Age=0'));
 });
});

test('adult privilege expires after 60 minutes and family renewal never renews or recreates it',async()=>{
 await fixture(async({repo,request,connect,permit,unlock})=>{
  const connected=await connect();await permit(connected.deviceId);const opened=await unlock(connected);
  const grant=(await repo.snapshot()).adultPilotSessions![0];
  assert.equal(grant.expiresAt-grant.createdAt,ADULT_PILOT_SESSION_MS);
  assert.equal(ADULT_PILOT_SESSION_MS,3600000);
  const response=await request('/v1/sessions/renew',{body:{},cookies:opened.cookies,proof:opened.sessionToken});
  assert.equal(response.status,200);assert.equal(cookie(response,'factory_adult'),'');
  const renewed=verifySession(cookie(response,'factory_session'),key);
  assert.equal(renewed.adultSessionId,undefined);assert.equal(renewed.adultProfileId,undefined);
  assert.equal((await repo.snapshot()).adultPilotSessions![0].expiresAt,opened.expiresAt);
  const cookies=jar(response)+'; factory_adult='+opened.adultCookie;
  assert.equal((await verifyBrowserSession(repo,cookies,key)).adultSessionId,undefined);
  await assert.rejects(verifyBrowserSession(repo,cookies,key,opened.expiresAt+1,opened.sessionToken),/ADULT_PILOT_ACCESS_REQUIRED/);
  const expiring=await connect();await permit(expiring.deviceId,'operator-reviewed-short-window',Date.now()+60000);
  const short=await unlock(expiring);
  const state=await repo.snapshot(),permitExpires=state.adultPilotPermits!.find(x=>x.deviceId===expiring.deviceId)!.expiresAt;
  assert.equal(short.expiresAt,permitExpires,'a short operator approval also limits the adult session');
 });
});

test('permit replacement retains receipt history and cannot resurrect an old adult session',async()=>{
 await fixture(async({repo,connect,permit,unlock})=>{
  const connected=await connect();await permit(connected.deviceId,'operator-original-receipt');
  const first=await unlock(connected),adult=await verifyBrowserSession(repo,first.cookies,key,Date.now(),first.sessionToken);
  await revokeAdultPilot(repo,familyId,connected.deviceId);
  await permit(connected.deviceId,'operator-replacement-receipt');
  const state=await repo.snapshot();assert.equal(state.adultPilotPermits!.length,2);
  assert.ok(state.adultPilotPermits![0].revokedAt);
  assert.equal(adultPilotAllowed(state,adult),false);
  await assert.rejects(verifyBrowserSession(repo,first.cookies,key,Date.now(),first.sessionToken),/ADULT_PILOT_ACCESS_REQUIRED/);
  await assert.rejects(permit(connected.deviceId,'operator-original-receipt'),/ADULT_PILOT_RECEIPT_REUSED/);
  const second=await unlock(connected);
  assert.equal(adultPilotAllowed(await repo.snapshot(),await verifyBrowserSession(repo,second.cookies,key,Date.now(),second.sessionToken)),true);
 });
});

test('a stored permit outside its maximum approval window cannot authorize an adult session',async()=>{
 await fixture(async({repo,request,connect,permit,unlock})=>{
  const connected=await connect();await permit(connected.deviceId);const opened=await unlock(connected);
  const adult=await verifyBrowserSession(repo,opened.cookies,key,Date.now(),opened.sessionToken);
  await repo.transaction(state=>{const permit=state.adultPilotPermits![0];permit.expiresAt=permit.approvedAt+15*86400000;return true;});
  assert.equal(adultPilotAllowed(await repo.snapshot(),adult),false);
  const status=await(await request('/v1/sessions/status',{cookies:opened.cookies,proof:opened.sessionToken})).json();
  assert.equal(status.adultPilot.eligible,false);assert.equal(status.adultPilot.active,false);
  await assert.rejects(verifyBrowserSession(repo,opened.cookies,key,Date.now(),opened.sessionToken),/ADULT_PILOT_ACCESS_REQUIRED/);
 });
});

test('adult unlock shares the family passphrase throttle and checks device revocation inside admission',async()=>{
 await fixture(async({repo,request,connect,permit,unlock})=>{
  const connected=await connect();await permit(connected.deviceId);
  for(let i=0;i<3;i++)assert.equal((await request('/v1/sessions/adult/unlock',{
   body:{parentPassphrase:'wrong adult passphrase'},cookies:connected.cookies})).status,403);
  for(let i=0;i<2;i++)assert.equal((await request('/v1/devices/unlock',{
   body:{parentPassphrase:'wrong adult passphrase'},cookies:connected.cookies})).status,403);
  for(const path of ['/v1/sessions/adult/unlock','/v1/devices/unlock'])
   assert.equal((await request(path,{body:{parentPassphrase:passphrase},cookies:connected.cookies})).status,429,
    'changing endpoints cannot evade the shared password lockout');
  assert.equal((await repo.snapshot()).adultPilotSessions?.length||0,0);
  await repo.transaction(state=>{state.parentAuth![familyId].lockedUntil=0;return true;});
  await unlock(connected);
  const other=await connect();await permit(other.deviceId,'operator-reviewed-race-device');
  repo.revokeBeforeNextTransaction=other.deviceId;
  assert.equal((await request('/v1/sessions/adult/unlock',{
   body:{parentPassphrase:passphrase},cookies:other.cookies})).status,401);
  assert.equal((await repo.snapshot()).adultPilotSessions!.some(x=>x.deviceId===other.deviceId),false);
 });
});

test('adult profile endpoints reject cross-site and malformed requests and stay off without all rollout flags',async()=>{
 await fixture(async({repo,request,connect,permit})=>{
  const connected=await connect();await permit(connected.deviceId);
  for(const path of ['/v1/sessions/adult/unlock','/v1/sessions/adult/lock']){
   const body=path.endsWith('/unlock')?{parentPassphrase:passphrase}:{};
   assert.equal((await request(path,{body,cookies:connected.cookies,origin:'https://evil.example'})).status,403);
   assert.equal((await request(path,{body,cookies:connected.cookies,origin:null})).status,403);
   assert.equal((await request(path,{body,cookies:connected.cookies,requestHeader:false})).status,403);
  }
  assert.equal((await repo.snapshot()).adultPilotSessions?.length||0,0);
  const preflight=await request('/v1/sessions/adult/unlock',{method:'OPTIONS'});
  assert.equal(preflight.status,204);assert.ok(preflight.headers.get('Access-Control-Allow-Headers')?.includes('X-Factory-Adult-Session'));
 });
 for(const disabled of [{...flags,enabled:false},{...flags,ownerApproved:false},{...flags,profileAccessVerified:false}])
  await fixture(async({repo,request,connect,permit})=>{
   const connected=await connect();await permit(connected.deviceId);
   const status=await(await request('/v1/sessions/status',{cookies:connected.cookies})).json();
   assert.equal(status.adultPilot.enabled,false);assert.equal(status.adultPilot.eligible,false);
   assert.equal((await request('/v1/sessions/adult/unlock',{
    body:{parentPassphrase:passphrase},cookies:connected.cookies})).status,403);
   assert.equal((await repo.snapshot()).adultPilotSessions?.length||0,0);
  },disabled);
});

test('an explicitly revoked device is denied even when its recorded revocation time is zero',async()=>{
 await fixture(async({repo,request,connect,permit,unlock})=>{
  const connected=await connect();await permit(connected.deviceId);const opened=await unlock(connected);
  const adult=await verifyBrowserSession(repo,opened.cookies,key,Date.now(),opened.sessionToken);
  await repo.transaction(state=>{state.devices!.find(x=>x.id===connected.deviceId)!.revokedAt=0;return true;});
  assert.equal(adultPilotAllowed(await repo.snapshot(),adult),false);
  assert.equal((await request('/v1/sessions/status',{cookies:connected.cookies})).status,401);
  assert.equal((await request('/v1/sessions/renew',{cookies:connected.cookies,body:{}})).status,401);
  await assert.rejects(verifyBrowserSession(repo,opened.cookies,key,Date.now(),opened.sessionToken),/UNAUTHENTICATED/);
 });
});

test('conversation erasure is reachable only with the current device parent unlock and explicit confirmation',async()=>{
 await fixture(async({repo,request,connect,permit,unlock,eraseCalls})=>{
  const connected=await connect();await permit(connected.deviceId);const adult=await unlock(connected);
  assert.equal((await request('/v1/devices/privacy/erase',{
   body:{confirm:true},cookies:adult.cookies,proof:adult.sessionToken})).status,401,
   'adult AI profile is not an ambient parent-management authorization');
  const parent=await request('/v1/devices/unlock',{body:{parentPassphrase:passphrase},cookies:connected.cookies});
  assert.equal(parent.status,200);
  const cookies=connected.cookies+'; '+jar(parent);
  for(const body of [{},{confirm:false},{confirm:true,arbitrary:'field'}])
   assert.equal((await request('/v1/devices/privacy/erase',{body,cookies})).status,400);
  assert.equal(eraseCalls.length,0);
  const erased=await request('/v1/devices/privacy/erase',{body:{confirm:true},cookies});
  assert.equal(erased.status,200);assert.deepEqual(await erased.json(),{erased:true});
  assert.equal(eraseCalls.length,1);assert.equal(eraseCalls[0].role,'parent');
  assert.equal(eraseCalls[0].deviceId,connected.deviceId);assert.equal(eraseCalls[0].familyId,familyId);
  await repo.transaction(state=>{state.devices!.find(x=>x.id===connected.deviceId)!.revokedAt=Date.now();return true;});
  assert.equal((await request('/v1/devices/privacy/erase',{body:{confirm:true},cookies})).status,401);
  assert.equal(eraseCalls.length,1);
 });
});

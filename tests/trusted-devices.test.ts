import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {test} from 'node:test';
import {MemoryRepository} from '../server/pipeline/repository';
import {trustedDeviceHandler,verifyBrowserSession} from '../server/trusted-devices';
import {apiHandler} from '../server/pipeline/http';
import {mintDeviceInvitation} from '../server/device-owner';
import {signSession} from '../server/pipeline/auth';
import type {JobService} from '../server/pipeline/service';

const origin='https://jems.example',familyId='family-one',signing='a-really-long-test-only-key-for-session-signing-not-a-secret';
const day=86400000;
const invitation='i'.repeat(43),passphrase='parent secret phrase 2026';
const cookie=(response:Response,name:string)=>{
 const value=response.headers.getSetCookie().map(x=>x.split(';')[0]).find(x=>x.startsWith(name+'='));
 return value?.slice(name.length+1)||'';
};
const jar=(response:Response)=>['factory_session','factory_device','factory_parent'].map(name=>{
 const value=cookie(response,name);return value?name+'='+value:null;
}).filter(Boolean).join('; ');
async function fixture(fn:(args:{
 repo:MemoryRepository;url:string;
 request:(path:string,method?:'GET'|'POST',body?:unknown,cookies?:string,requestOrigin?:string)=>Promise<Response>;
})=>Promise<void>){
 const repo=new MemoryRepository();
 const handler=trustedDeviceHandler(repo,{appOrigin:origin,familyId,sessionKey:signing});
 const server=createServer((req,res)=>{void handler(req,res);});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+(server.address() as {port:number}).port;
 const request=(path:string,method:'GET'|'POST'='GET',body?:unknown,cookies='',requestOrigin=origin)=>
  fetch(url+path,{method,headers:{Origin:requestOrigin,...(cookies?{Cookie:cookies}:{}),...(method==='POST'?{'Content-Type':'application/json','X-Factory-Request':'1'}:{})},...(method==='POST'?{body:JSON.stringify(body??{})}:{})});
 try{await fn({repo,url,request});}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
async function addInvite(repo:MemoryRepository,code:string){
 await repo.transaction(state=>{state.invitations??=[];state.invitations.push({hash:createHash('sha256').update(code).digest('hex'),familyId,expiresAt:Date.now()+600000,used:false});return true;});
}
test('trusted device: invitation enrollment, hashed storage, secure cookies and renewal across tabs',async()=>{
 await fixture(async({repo,request})=>{
  await addInvite(repo,invitation);
  assert.equal((await request('/v1/sessions/enroll','POST',{invitation:'x'.repeat(43),deviceName:'Tablet',parentPassphrase:passphrase})).status,403);
  const enrolled=await request('/v1/sessions/enroll','POST',{invitation,deviceName:'Kitchen tablet',parentPassphrase:passphrase});
  assert.equal(enrolled.status,200);assert.equal((await enrolled.json()).trusted,true);
  const headers=enrolled.headers.getSetCookie();
  assert.equal(headers.length,2);for(const header of headers)for(const flag of ['Secure','HttpOnly','SameSite=None','Partitioned'])assert.ok(header.includes(flag),flag);
  const first=jar(enrolled),session=cookie(enrolled,'factory_session'),deviceCookie=cookie(enrolled,'factory_device');
  assert.ok(first.includes('factory_device='));assert.ok(deviceCookie.length>70);
  const state=await repo.snapshot();assert.equal(state.devices?.length,1);
  assert.ok(!JSON.stringify(state).includes(deviceCookie.split('.')[1]),'no raw refresh secret persisted');
  assert.ok(!JSON.stringify(state).includes(passphrase),'no parent passphrase persisted');
  assert.equal((await request('/v1/sessions/status','GET',undefined,first)).status,200);
  assert.equal((await request('/v1/sessions/enroll','POST',{invitation,deviceName:'duplicate',parentPassphrase:passphrase})).status,403);
  assert.equal((await request('/v1/sessions/status','GET')).status,401);
  const renewed=await request('/v1/sessions/renew','POST',{},'factory_device='+deviceCookie);
  assert.equal(renewed.status,200);const nextCookie=cookie(renewed,'factory_device');
  assert.notEqual(nextCookie,deviceCookie,'rotated device secret');
  const competing=await request('/v1/sessions/renew','POST',{},'factory_device='+deviceCookie);
  assert.equal(competing.status,200);assert.equal(cookie(competing,'factory_device'),nextCookie,'simultaneous tabs receive the same next credential');
  assert.equal((await request('/v1/sessions/status','GET',undefined,jar(renewed))).status,200);
  assert.equal((await request('/v1/sessions/renew','POST',{},'factory_device='+deviceCookie.slice(0,-3)+'bad')).status,401);
  const after=await repo.snapshot();assert.equal(after.devices?.[0].rotation,1);
  assert.equal(after.devices?.[0].previousHash,createHash('sha256').update(deviceCookie.split('.')[1]).digest('hex'));
  assert.ok(session.length>40);
  assert.equal((await request('/v1/sessions/status','GET',undefined,first,'https://evil.example')).status,403);
 });
});
test('trusted device: parent unlock, same-family listing, revocation invalidates existing signed access immediately',async()=>{
 await fixture(async({repo,request})=>{
  await addInvite(repo,invitation);
  const one=await request('/v1/sessions/enroll','POST',{invitation,deviceName:'Living room',parentPassphrase:passphrase});
  const oneCookies=jar(one);
  assert.equal((await request('/v1/devices','GET',undefined,oneCookies)).status,401);
  assert.equal((await request('/v1/devices/unlock','POST',{parentPassphrase:'wrong password'},oneCookies)).status,403);
  const unlocked=await request('/v1/devices/unlock','POST',{parentPassphrase:passphrase},oneCookies);
  assert.equal(unlocked.status,200);const parent='factory_parent='+cookie(unlocked,'factory_parent');
  assert.equal((await request('/v1/devices','GET',undefined,oneCookies+'; '+parent)).status,200);
  assert.equal((await request('/v1/devices/invite','POST',{},oneCookies)).status,401,'child session cannot issue adult device invitations');
  const invitationResponse=await request('/v1/devices/invite','POST',{},oneCookies+'; '+parent);
  assert.equal(invitationResponse.status,200);
  const {invitation:secondInvitation}=await invitationResponse.json();
  assert.equal(typeof secondInvitation,'string');assert.equal(secondInvitation.length,43);
  const two=await request('/v1/sessions/enroll','POST',{invitation:secondInvitation,deviceName:'Family phone',parentPassphrase:passphrase});
  assert.equal(two.status,200);const twoCookies=jar(two);
  const listed=await(await request('/v1/devices','GET',undefined,oneCookies+'; '+parent)).json();
  assert.deepEqual(listed.devices.map((d:{name:string})=>d.name),['Living room','Family phone']);
  const target=listed.devices.find((d:{name:string})=>d.name==='Family phone');
  assert.equal((await request('/v1/devices/revoke','POST',{deviceId:target.id},oneCookies)).status,401);
  assert.equal((await request('/v1/devices/revoke','POST',{deviceId:target.id},oneCookies+'; '+parent)).status,200);
  assert.equal((await request('/v1/sessions/status','GET',undefined,twoCookies)).status,401);
  await assert.rejects(()=>verifyBrowserSession(repo,twoCookies,signing),/UNAUTHENTICATED/);
  const fakeService={readiness:async()=>({available:true})} as unknown as JobService;
  const gate=apiHandler(fakeService,{appOrigin:origin,previewOrigin:'https://preview.example',sessionKey:signing,previewKey:signing},repo);
  const fakeResponse:any={status:0,headers:{},setHeader(name:string,value:string){this.headers[name]=value;return this;},writeHead(code:number,heads:unknown){this.status=code;this.headers=heads;return this;},end(){return this;}};
  await gate({method:'GET',url:'/v1/builder/status',headers:{origin,cookie:twoCookies}} as any,fakeResponse);
  assert.equal(fakeResponse.status,401,'existing signed access is immediately refused after revocation');
  assert.equal((await request('/v1/sessions/status','GET',undefined,oneCookies)).status,200,'another family device remains connected');
  const disconnected=await request('/v1/devices/disconnect','POST',{},oneCookies);
  assert.equal(disconnected.status,200);
  assert.ok(disconnected.headers.getSetCookie().some(s=>s.startsWith('factory_device=')&&s.includes('Max-Age=0')));
  assert.equal((await request('/v1/sessions/status','GET',undefined,oneCookies)).status,401);
 });
});
test('trusted device: idle and absolute expiry, legacy compatibility, parent lockout and wrong-family isolation',async()=>{
 await fixture(async({repo,request})=>{
  await addInvite(repo,invitation);
  const first=await request('/v1/sessions/enroll','POST',{invitation,deviceName:'Tablet',parentPassphrase:passphrase});
  const cookies=jar(first),deviceCookie=cookie(first,'factory_device');
  assert.equal((await request('/v1/devices/unlock','POST',{parentPassphrase:'x'.repeat(12)},cookies)).status,403);
  for(let i=0;i<4;i++)await request('/v1/devices/unlock','POST',{parentPassphrase:'x'.repeat(12)},cookies);
  assert.equal((await request('/v1/devices/unlock','POST',{parentPassphrase:passphrase},cookies)).status,429,'lockout cannot be skipped by correct password');
  await repo.transaction(s=>{s.parentAuth![familyId].lockedUntil=0;s.devices![0].lastSeenAt=Date.now()-91*day;return true;});
  assert.equal((await request('/v1/sessions/renew','POST',{},'factory_device='+deviceCookie)).status,401,'90-day inactivity');
  await repo.transaction(s=>{s.devices![0].lastSeenAt=Date.now();s.devices![0].expiresAt=Date.now()-1;return true;});
  assert.equal((await request('/v1/sessions/renew','POST',{},'factory_device='+deviceCookie)).status,401,'12-month absolute expiry');
  const legacy=signSession({subject:'legacy-family',familyId,role:'designer',expiresAt:Date.now()+50000},signing);
  assert.equal((await request('/v1/sessions/status','GET',undefined,'factory_session='+legacy)).status,200,'pre-migration session remains valid until its original expiry');
  const handlerOther=trustedDeviceHandler(repo,{appOrigin:origin,familyId:'another-family',sessionKey:signing});
  const response:any={status:0,writeHead(status:number){this.status=status;},end(){}};
  await handlerOther({method:'GET',url:'/v1/sessions/status',headers:{origin,cookie:'factory_session='+legacy}} as any,response);
  assert.equal(response.status,401);
 });
});

test('owner invitation issuance does not reset spending allowance or paid execution',async()=>{
 const repo=new MemoryRepository();
 await repo.transaction(s=>{s.ledgers[familyId]={allowance:5000000,used:200000,reserved:100000,paidEnabled:true,month:'2026-11'};return true;});
 const before=(await repo.snapshot()).ledgers[familyId];
 const token=await mintDeviceInvitation(repo,familyId);
 const after=await repo.snapshot();
 assert.deepEqual(after.ledgers[familyId],before);
 assert.equal(after.invitations?.[0].hash,createHash('sha256').update(token).digest('hex'));
 assert.ok(!JSON.stringify(after).includes(token),'no plaintext invitation stored');
});

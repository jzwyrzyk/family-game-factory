import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {test} from 'node:test';
import {MemoryRepository} from '../server/pipeline/repository';
import {trustedDeviceHandler} from '../server/trusted-devices';
import {
 PARENT_PRIVACY_NOTICE_VERSION,recordExternalGuardianVerification,privacyStatus,
 submitParentPrivacyChoice,verifiedParentScope
} from '../server/privacy/parent-consent';
import {signSession} from '../server/pipeline/auth';
const familyId='privacy-family',origin='https://jems.example';
const signing='privacy-testing-signature-material-12345';
const invitation='a'.repeat(43),parentPassphrase='my private parent passphrase';
const scopes={generation:true,conversation:true,remoteSpeech:false};
const body={noticeVersion:PARENT_PRIVACY_NOTICE_VERSION,scopes,guardianAffirmed:true,providerAcknowledged:true};
const cookie=(r:Response,name:string)=>
 r.headers.getSetCookie().map(x=>x.split(';')[0]).find(x=>x.startsWith(name+'='))||'';
async function withGateway(fn:(x:{
 repo:MemoryRepository;send:(path:string,method?:'GET'|'POST',data?:unknown,jar?:string,originOverride?:string)=>Promise<Response>;
 connect:()=>Promise<{session:string;parent:string;deviceId:string}>}
)=>Promise<void>){
 const repo=new MemoryRepository();
 const handler=trustedDeviceHandler(repo,{appOrigin:origin,familyId,sessionKey:signing});
 const server=createServer((req,res)=>{void handler(req,res);});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+(server.address() as {port:number}).port;
 const send=(path:string,method:'GET'|'POST'='GET',data?:unknown,jar='',originOverride=origin)=>
  fetch(url+path,{method,headers:{Origin:originOverride,...(jar?{Cookie:jar}:{}),
   ...(method==='POST'?{'Content-Type':'application/json','X-Factory-Request':'1'}:{})},
   ...(method==='POST'?{body:JSON.stringify(data??{})}:{})});
 const connect=async()=>{
  await repo.transaction(s=>{
   s.invitations??=[];
   s.invitations.push({familyId,hash:createHash('sha256').update(invitation).digest('hex'),used:false,expiresAt:Date.now()+600000});
   return true;
  });
  const enrolled=await send('/v1/sessions/enroll','POST',{invitation,deviceName:'Test',parentPassphrase});
  assert.equal(enrolled.status,200);
  const session=[cookie(enrolled,'factory_session'),cookie(enrolled,'factory_device')].join('; ');
  const unlocked=await send('/v1/devices/unlock','POST',{parentPassphrase},session);
  assert.equal(unlocked.status,200);
  const parent=[session,cookie(unlocked,'factory_parent')].join('; ');
  const deviceId=(await repo.snapshot()).devices?.[0].id;
  assert.ok(deviceId);
  return {session,parent,deviceId:deviceId!};
 };
 try{await fn({repo,send,connect});}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
test('privacy: only a freshly unlocked trusted parent can submit a bounded request, never self-verify',async()=>{
 await withGateway(async({repo,send,connect})=>{
  const {session,parent}=await connect();
  assert.equal((await send('/v1/devices/privacy')).status,401);
  assert.equal((await send('/v1/devices/privacy','GET',undefined,session)).status,401);
  assert.equal((await send('/v1/devices/privacy','POST',body,session)).status,401);
  assert.equal((await send('/v1/devices/privacy','POST',{...body,providerAcknowledged:false},parent)).status,400);
  assert.equal((await send('/v1/devices/privacy','POST',{...body,scopes:{...scopes,model:true}},parent)).status,400);
  assert.equal((await send('/v1/devices/privacy','POST',body,parent,'https://evil.example')).status,403);
  const submit=await send('/v1/devices/privacy','POST',body,parent);
  assert.equal(submit.status,200);
  const choice=await submit.json();
  assert.equal(choice.status,'pending');
  assert.match(choice.choiceId,/^[0-9a-f-]{36}$/);
  const status=await (await send('/v1/devices/privacy','GET',undefined,parent)).json();
  assert.equal(status.status,'pending');
  assert.deepEqual(status.scopes,scopes);
  assert.equal(status.externalVerificationRequired,true);
  const state=await repo.snapshot();
  assert.equal(state.parentPrivacyChoices?.length,1);
  assert.equal(state.parentPrivacyChoices?.[0].verifiedAt,undefined);
  assert.deepEqual(state.coachConsent,[]);
  assert.equal(verifiedParentScope(state,familyId,'conversation'),false);
 });
});
test('privacy: externally verified receipt activates chosen scopes and never a deselected service',async()=>{
 await withGateway(async({repo,send,connect})=>{
  const {parent}=await connect();
  const p=await (await send('/v1/devices/privacy','POST',body,parent)).json();
  assert.equal((await recordExternalGuardianVerification(repo,{familyId,choiceId:p.choiceId,receipt:'guardian-review-001',verifiedByOwner:false}).catch(e=>e.message)),'EXTERNAL_VERIFICATION_REQUIRED');
  assert.deepEqual(await recordExternalGuardianVerification(repo,{familyId,choiceId:p.choiceId,receipt:'guardian-review-001',verifiedByOwner:true}),{
   status:'verified',noticeVersion:PARENT_PRIVACY_NOTICE_VERSION
  });
  const state=await repo.snapshot();
  assert.equal(verifiedParentScope(state,familyId,'generation'),true);
  assert.equal(verifiedParentScope(state,familyId,'conversation'),true);
  assert.equal(verifiedParentScope(state,familyId,'remoteSpeech'),false);
  assert.equal(state.coachConsent?.[0].model,true);
  assert.equal(state.coachConsent?.[0].audio,false);
  assert.ok(!JSON.stringify(state).includes('guardian-review-001'),'raw verification references never persisted');
  assert.equal((await send('/v1/devices/privacy','GET',undefined,parent).then(x=>x.json())).status,'verified');
  assert.equal(await recordExternalGuardianVerification(repo,{familyId,choiceId:p.choiceId,receipt:'guardian-review-001',verifiedByOwner:true}).then(()=>false).catch(()=>true),true);
 });
});
test('privacy: changing consent, withdrawal, device revocation and reused receipts all fail closed',async()=>{
 await withGateway(async({repo,send,connect})=>{
  const {parent,deviceId}=await connect();
  const one=await (await send('/v1/devices/privacy','POST',body,parent)).json();
  await recordExternalGuardianVerification(repo,{familyId,choiceId:one.choiceId,receipt:'external-approval-0001',verifiedByOwner:true});
  const two=await (await send('/v1/devices/privacy','POST',{...body,scopes:{generation:false,conversation:false,remoteSpeech:true}},parent)).json();
  assert.equal(two.status,'pending');
  assert.equal(verifiedParentScope(await repo.snapshot(),familyId,'conversation'),false);
  assert.deepEqual((await repo.snapshot()).coachConsent,[]);
  assert.equal(await recordExternalGuardianVerification(repo,{familyId,choiceId:one.choiceId,receipt:'external-approval-0002',verifiedByOwner:true}).then(()=>false).catch(()=>true),true);
  assert.equal(await recordExternalGuardianVerification(repo,{familyId,choiceId:two.choiceId,receipt:'external-approval-0001',verifiedByOwner:true}).then(()=>false).catch(()=>true),true);
  await recordExternalGuardianVerification(repo,{familyId,choiceId:two.choiceId,receipt:'external-approval-0002',verifiedByOwner:true});
  assert.equal(verifiedParentScope(await repo.snapshot(),familyId,'remoteSpeech'),true);
  assert.equal((await send('/v1/devices/privacy/revoke','POST',{},parent)).status,200);
  assert.equal(privacyStatus(await repo.snapshot(),familyId).status,'revoked');
  assert.equal(verifiedParentScope(await repo.snapshot(),familyId,'remoteSpeech'),false);
  assert.deepEqual((await repo.snapshot()).coachConsent,[]);
  const three=await (await send('/v1/devices/privacy','POST',body,parent)).json();
  await repo.transaction(s=>{const d=s.devices?.find(d=>d.id===deviceId);if(d)d.revokedAt=Date.now();return true;});
  assert.equal(await recordExternalGuardianVerification(repo,{familyId,choiceId:three.choiceId,receipt:'external-approval-0003',verifiedByOwner:true}).then(()=>false).catch(()=>true),true);
  assert.equal((await send('/v1/devices/privacy','GET',undefined,parent)).status,401);
 });
});
test('privacy: forged non-parent sessions cannot write consent or use an old parent cookie',async()=>{
 await withGateway(async({repo,send,connect})=>{
  const {session,parent}=await connect();
  const fake=signSession({familyId,role:'parent',subject:'family-parent',deviceId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',expiresAt:Date.now()+60000},signing);
  const headers=session+'; factory_parent='+fake;
  assert.equal((await send('/v1/devices/privacy','POST',body,headers)).status,403);
  const valid=await send('/v1/devices/privacy','POST',body,parent);assert.equal(valid.status,200);
  const id=(await valid.json()).choiceId;
  await repo.transaction(s=>{s.parentPrivacyChoices![0].expiresAt=Date.now()-1;return true;});
  assert.equal(await recordExternalGuardianVerification(repo,{familyId,choiceId:id,receipt:'expired-receipt-0001',verifiedByOwner:true}).then(()=>false).catch(()=>true),true);
 });
});

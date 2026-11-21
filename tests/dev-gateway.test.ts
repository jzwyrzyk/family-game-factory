import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {createHmac} from 'node:crypto';
import {createServer,request,type IncomingHttpHeaders,type RequestListener} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {generateKeyPair,SignJWT} from 'jose';
import {createGateway,type GatewayConfig} from '../server/gateway';
import {createPreview,type PreviewConfig} from '../server/preview-server';
import {MemoryRepository} from '../server/pipeline/repository';
import {signSession} from '../server/pipeline/auth';
import type {DevAccessConfig} from '../server/dev-access';

const number='234567890123',region='us-east1',familyId='dev-synthetic',projectId='jems-fixture-dev';
const origin=(name:string)=>`https://jems-dev-${name}-${number}.${region}.run.app`;
const audience=(name:string)=>`/projects/${number}/locations/${region}/services/jems-dev-${name}`;
const devAccess:DevAccessConfig={environment:'development',projectNumber:number,iapAudience:audience('app'),
 allowedAdults:[{subject:'accounts.google.com:123456789012345678901',email:'adult@example.com',operatorConfirmedAdult:true}],
 syntheticDataOnly:true,syntheticFamilyId:familyId,syntheticWorkspace:'dev-synthetic',workerOwner:'fixture-lab',
 workerOwnerId:'987654321',maxTotalMicroUsd:5000000};
const changed=['FACTORY_ENVIRONMENT','FACTORY_ADULT_PILOT_MODE','FACTORY_ADULT_PILOT_OWNER_APPROVED',
 'FACTORY_ADULT_PILOT_PROFILE_ACCESS_VERIFIED','FACTORY_ACTIONS_APPROVED','K_SERVICE'] as const;
const previous=changed.map(k=>process.env[k]);let directory:string;
before(async()=>{
 process.env.FACTORY_ENVIRONMENT='development';
 process.env.FACTORY_ADULT_PILOT_MODE='true';process.env.FACTORY_ADULT_PILOT_OWNER_APPROVED='true';
 process.env.FACTORY_ADULT_PILOT_PROFILE_ACCESS_VERIFIED='true';process.env.FACTORY_ACTIONS_APPROVED='false';delete process.env.K_SERVICE;
 directory=await mkdtemp(join(tmpdir(),'dev-gateway-fixture-'));
});
after(async()=>{
 changed.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});
 await rm(directory,{recursive:true,force:true});
});
const config=():GatewayConfig=>({active:false,appOrigin:origin('app'),gatewayOrigin:origin('gateway'),previewOrigin:origin('preview'),
 sessionKey:'synthetic-dev-session-key-not-a-real-secret',previewKey:'synthetic-dev-preview-key-not-a-real-secret',familyId,
 repository:'jzwyrzyk/family-game-factory',repositoryId:'1458033181',workflow:'factory-agent.yml',approvedSha:'a'.repeat(40),
 workerRepository:'fixture-lab/worker-dev',workerRepositoryId:'2222222222',workerWorkflow:'factory-private-dev.yml',workerApprovedSha:'b'.repeat(40),
 githubAppId:'1',githubInstallationId:'2',githubPrivateKey:'not-used-by-inactive-fixture',
 approval:{enabled:false,approvalId:'fixture',model:'fixture',inputUsdPerMillion:1,outputUsdPerMillion:1,maxInputTokens:2000,
  maxOutputTokens:1000,priceReviewedOn:new Date().toISOString().slice(0,10)},
 maxJobMicroUsd:10000,workspace:'dev-synthetic',projectId,artifactBucket:projectId+'-artifacts',
 localFile:join(directory,'state.json'),devAccess});
async function server(handler:RequestListener,host:string){
 const s=createServer(handler);await new Promise<void>(resolve=>s.listen(0,'127.0.0.1',resolve));
 const port=(s.address() as {port:number}).port;
 const call=(path:string,headers:Record<string,string>={},method='GET',body?:string)=>new Promise<{status:number;body:string;headers:IncomingHttpHeaders}>((resolve,reject)=>{
  const req=request({hostname:'127.0.0.1',port,path,method,headers:{host,...headers}},res=>{
   let text='';res.on('data',c=>{text+=c;});res.on('end',()=>resolve({status:res.statusCode!,body:text,headers:res.headers}));
  });req.on('error',reject);req.end(body);
 });
 return {call,close:()=>new Promise<void>(resolve=>s.close(()=>resolve()))};
}
async function signer(){
 const pair=await generateKeyPair('ES256');
 const token=(service='app',email=devAccess.allowedAdults[0].email)=>new SignJWT({email}).setProtectedHeader({alg:'ES256'})
  .setSubject(devAccess.allowedAdults[0].subject).setIssuer('https://cloud.google.com/iap').setAudience(audience(service))
  .setIssuedAt().setExpirationTime('10m').sign(pair.privateKey);
 return {pair,token};
}

test('gateway browser routes require signed adult IAP plus trusted sessions, while machine callbacks retain separate authentication',async()=>{
 const c=config(),keys=await signer(),gateway=await createGateway(c,{iapKeys:async()=>keys.pair.publicKey});
 const now=Date.now(),deviceId='00000000-aaaa-bbbb-cccc-000000000111';
 const session={familyId,deviceId,subject:'family-designer',role:'designer' as const,expiresAt:now+86400000};
 await gateway.repo.transaction(s=>{s.devices=[{id:deviceId,familyId,name:'Fixture',secretHash:'a'.repeat(64),rotation:0,
  createdAt:now,lastSeenAt:now,expiresAt:now+86400000}];return true;});
 const http=await server((req,res)=>void gateway.handler(req,res),new URL(c.gatewayOrigin).host);
 const cookie='factory_session='+signSession(session,c.sessionKey),iap=await keys.token();
 const trusted={cookie,origin:c.appOrigin,'x-goog-iap-jwt-assertion':iap};
 try{
  assert.equal((await http.call('/health')).status,200);
  for(const path of ['/v1/builder/status','/v1/coach/status','/v1/coach/audio/status','/v1/sessions/status','/v1/creations']){
   assert.equal((await http.call(path,{cookie})).status,403,path);
   assert.equal((await http.call(path,{cookie,'x-goog-authenticated-user-email':'accounts.google.com:adult@example.com'})).status,403);
   assert.equal((await http.call(path,{...trusted,'x-goog-iap-jwt-assertion':await keys.token('preview')})).status,403);
   assert.equal((await http.call(path,trusted)).status,200,path);
  }
  assert.equal((await http.call('/v1/builder/status',{'x-goog-iap-jwt-assertion':iap})).status,401);
  assert.equal((await http.call('/v1/builder/status',{...trusted,origin:'https://hostile.example'})).status,403);
  assert.equal((await http.call('/v1/builder/status',{...trusted,'x-factory-adult-session':'invalid'})).status,403);
  assert.equal((await http.call('/v1/builder/status',{...trusted,host:'factory-gateway-ola734esta-ul.a.run.app'})).status,403);
  const state=await gateway.repo.snapshot();assert.equal(state.devTestGrants?.length,1);
  assert.equal(state.parentPrivacyChoices,undefined);assert.equal(state.adultPilotPermits,undefined);
  assert.equal((await http.call('/v1/internal/dispatch',trusted,'POST')).status,403);
  assert.equal((await http.call('/v1/worker/claim',trusted,'POST','{}')).status,403);
 }finally{await http.close();}
});

test('DEV configuration cannot start with production destinations, public workers, or an omitted independent target',async()=>{
 for(const patch of [{devAccess:undefined},{projectId:'family-game-factory-jzw'},
  {artifactBucket:'production-artifacts'},{appOrigin:'https://jzwyrzyk.github.io'},
  {workerRepositoryId:'1458899834'},{workerRepository:'family-game-factory-lab/family-game-factory-worker'},
  {workerWorkflow:'factory-private.yml'},{workerApprovedSha:undefined},{workerRepository:undefined},
  {sessionKey:config().previewKey},{schedulerEmail:'factory-scheduler@family-game-factory-jzw.iam.gserviceaccount.com'}])await assert.rejects(createGateway({...config(),...patch}));
});

test('generated preview requires its own signed adult IAP and the existing scoped ticket before returning game data',async()=>{
 const keys=await signer(),repo=new MemoryRepository(),previewKey=config().previewKey,id='synthetic-preview';
 await repo.transaction(s=>{s.revisions.push({id,familyId,parentId:null,projectId:id,
  game:{kind:'star-catcher-v1',target:5,seconds:15},devTestPolicyId:'fixture-provenance'});return true;});
 const c:PreviewConfig={previewOrigin:origin('preview'),previewKey,projectId,artifactBucket:projectId+'-artifacts',workspace:'dev-synthetic',
  devAccess:{...devAccess,iapAudience:audience('preview')}};
 const handler=createPreview(c,repo,async()=>keys.pair.publicKey),http=await server((req,res)=>void handler(req,res),new URL(c.previewOrigin).host);
 const expires=Date.now()+60000,cap=createHmac('sha256',previewKey).update(`${id}\n${familyId}\n${expires}`).digest('base64url');
 const url=`/preview/${id}?scope=${familyId}&expires=${expires}&cap=${cap}&channel=fixture-channel`;
 const headers={'x-goog-iap-jwt-assertion':await keys.token('preview')};
 try{
  assert.equal((await http.call('/health')).status,200);
  assert.equal((await http.call(url)).status,403);
  assert.equal((await http.call(url,{'x-goog-authenticated-user-email':'accounts.google.com:adult@example.com'})).status,403);
  assert.equal((await http.call(url,{'x-goog-iap-jwt-assertion':await keys.token('app')})).status,403);
  assert.equal((await http.call(url,{'x-goog-iap-jwt-assertion':await keys.token('preview','not-allowed@example.com')})).status,403);
  const ready=await http.call(url,headers);assert.equal(ready.status,200);assert.match(String(ready.headers['content-security-policy']),/default-src 'none'/);
  assert.equal((await http.call(url.replace(cap,'wrong-capability'),headers)).status,403);
  assert.equal((await http.call(url,{...headers,host:'production.example'})).status,403);
  assert.throws(()=>createPreview({...c,sessionKey:'forbidden-extra-secret'} as PreviewConfig,repo),/PREVIEW_CONFIG_MUST_NOT_CONTAIN_GATEWAY_SECRETS/);
 }finally{await http.close();}
});

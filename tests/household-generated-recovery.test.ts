import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type Server} from 'node:http';
import {createHash} from 'node:crypto';
import {FixtureDocuments,type AtomicStore} from '../server/beta/documents';
import {createHouseholdRecovery,type HouseholdRecoveryConfig} from '../server/storage/household-recovery';
import {MemoryRepository} from '../server/pipeline/repository';
import {readWorkspace,writeWorkspace} from '../server/pipeline/workspace-state';
import {beginAdultPilotSession,grantAdultPilot,authenticateAdultPilotSession} from '../server/adult-pilot';
import {signSession} from '../server/pipeline/auth';
import {JobService} from '../server/pipeline/service';
import {PREMIUM_POLICY_VERSION,INITIAL_PREMIUM_MODELS,type ModelStage,type PremiumApproval} from '../server/agent/model-policy';
import {mapGeneratedRecovery,captureGeneratedRecovery} from '../server/storage/generated-recovery';
import type {PrivateArtifacts} from '../server/storage/artifacts';
import type {BackupScheduleLedger} from '../server/storage/recovery-scheduler';
import type {VerifiedSession} from '../server/contracts/api';
import {compileArtFixture,pixelGame} from './generated-art-fixtures';
const signing='synthetic-household-recovery-key-no-production-secret',familyId='household-recovery-fixture',workspace='household-recovery-test',appOrigin='https://owner.example';
const sourceDevice='00000000-0000-0000-0000-000000000111',targetDevice='00000000-0000-0000-0000-000000000222';
const sourceAudience='adult:'+sourceDevice,targetAudience='adult:'+targetDevice;
async function fixture(split=false){
 const db:AtomicStore=new FixtureDocuments(),repo=new MemoryRepository(),now=Date.now(),blobs=new Map<string,Buffer>();let calls=0;
 const artifacts:PrivateArtifacts={put:async bytes=>{calls++;const sha256=createHash('sha256').update(bytes).digest('hex');blobs.set(sha256,Buffer.from(bytes));return {storage:'private-artifact-v1',sha256,bytes:bytes.length};},get:async ref=>{const bytes=blobs.get(ref.sha256);if(!bytes)throw Error('ORIGINAL_ASSET_MISSING');return Buffer.from(bytes);}};
 await repo.transaction(s=>{s.devices=[sourceDevice,targetDevice].map(id=>({id,familyId,name:'Synthetic Adult',secretHash:'a'.repeat(64),rotation:0,createdAt:now-1000,lastSeenAt:now,expiresAt:now+86400000}));s.ledgers[familyId]={month:new Date().toISOString().slice(0,7),allowance:50_000_000,used:5_000_000,reserved:1234,paidEnabled:true};return true;});
 const sessions:{browser:VerifiedSession;session:VerifiedSession;proof:string;cookies:string}[]=[];
 for(const deviceId of [sourceDevice,targetDevice]){
  const browser:VerifiedSession={familyId,deviceId,role:'designer',subject:'family-designer',expiresAt:now+86400000};
  await grantAdultPilot(repo,{familyId,deviceId,receipt:'synthetic-review-'+deviceId,operatorConfirmedAdult:true,expiresAt:now+86400000});
  const opened=await repo.transaction(s=>beginAdultPilotSession(s,browser));
  sessions.push({browser,session:authenticateAdultPilotSession(await repo.snapshot(),browser,opened.cookieValue,opened.sessionToken),proof:opened.sessionToken,cookies:'factory_session='+signSession(browser,signing)+'; factory_adult='+opened.cookieValue});
 }
 const original=pixelGame();original.source+='\n/*'+'retained original'.repeat(1000)+'*/';const game=compileArtFixture(original);
 await repo.transaction(s=>{s.revisions.push({id:'source-revision',projectId:'source-project',familyId,parentId:null,game,adultPilotProfileId:sourceAudience,name:'Original Adult game'});s.active['source-project']='source-revision';s.revisions.push({id:'family-original',projectId:'family-project',familyId,parentId:null,game:{kind:'star-catcher-v1',seconds:10,target:3}});s.active['family-project']='family-original';return true;});
 const originalState=await repo.snapshot();await db.run(async tx=>{const loaded=await readWorkspace(tx,workspace,artifacts);loaded.state=originalState;await writeWorkspace(tx,loaded,artifacts,{splitGamePayloads:split});});
 const config:HouseholdRecoveryConfig={platformMode:'HOUSEHOLD',householdPrivateHost:{audience:'/projects/1/global/backendServices/2',subject:'synthetic-owner',sourceOrigin:'https://previous.example'},familyId,workspace,appOrigin,gatewayOrigin:appOrigin,sessionKey:signing,storageEncoding:split?'private-game-v2':undefined,householdRecovery:{enabled:true,domains:['profiles','games','creative','learning','artwork','conversation','rewards','notifications','backups'],adultMappings:[{sourceOrigin:appOrigin,sourceAudience,targetAudience}]}};
 const frozen=new Map<string,{sources:Record<string,string|null>;completed:boolean}>();
 const ledgerFor=(audience:string,authorize:(tx:any)=>Promise<void>):BackupScheduleLedger=>({claim:async(key,make)=>{await db.run(authorize,true);const id=audience+key;if(!frozen.has(id))frozen.set(id,{...await make(),completed:false});return structuredClone(frozen.get(id)!);},complete:async key=>{await db.run(authorize,true);frozen.get(audience+key)!.completed=true;}});
 const route=createHouseholdRecovery(config,db,artifacts,ledgerFor);
 const call=(who:0|1,path:string,body:object={})=>route.request(sessions[who].cookies,sessions[who].proof,path,{profile:sessions[who].session.adultProfileId,...body});
 const mutate=async(fn:(s:any)=>void)=>db.run(async tx=>{const loaded=await readWorkspace(tx,workspace,artifacts);fn(loaded.state);await writeWorkspace(tx,loaded,artifacts,{splitGamePayloads:split});});
 return {db,repo,config,route,artifacts,blobs,sessions,call,mutate,game,originalState,ledgerFor,writes:()=>calls};
}
async function serve(handler:(req:any,res:any)=>Promise<void>){const server=createServer((req,res)=>void handler(req,res));await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));return {server,url:'http://127.0.0.1:'+(server.address() as any).port};}
async function close(server:Server){await new Promise<void>(resolve=>server.close(()=>resolve()));}

test('actual household HTTP requires enabled private surface, current cookie AND tab proof, origin and CSRF',async()=>{
 const f=await fixture(),{server,url}=await serve(f.route.handler),headers={Origin:appOrigin,Cookie:f.sessions[0].cookies,'X-Factory-Adult-Session':f.sessions[0].proof,'X-Factory-Request':'1','Content-Type':'application/json'};
 const post=(overrides:Record<string,string|undefined>={})=>fetch(url+'/v1/recovery/generated/list',{method:'POST',headers:Object.fromEntries(Object.entries({...headers,...overrides}).filter(([,v])=>v!==undefined)) as Record<string,string>,body:JSON.stringify({profile:sourceAudience,after:''})});
 try{
  assert.equal((await post()).status,200);
  for(const override of [{'X-Factory-Adult-Session':undefined},{'X-Factory-Adult-Session':'z'.repeat(43)},{Cookie:headers.Cookie.split(';')[0]},{Origin:'https://foreign.example'},{'X-Factory-Request':undefined}])assert.equal((await post(override)).status,403);
  f.config.householdRecovery!.enabled=false;assert.equal((await post()).status,503);f.config.householdRecovery!.enabled=true;
  f.config.platformMode='PRIVATE_FAMILY_BETA';assert.equal((await post()).status,403);f.config.platformMode='HOUSEHOLD';
  const mappings=await fetch(url+'/v1/recovery/adult/mappings',{headers:{...headers,Cookie:f.sessions[1].cookies,'X-Factory-Adult-Session':f.sessions[1].proof}});assert.equal(mappings.status,200);const value=await mappings.json();assert.equal(value.mappings.length,1);assert.equal(value.mappings[0].targetAudience,targetAudience);assert.equal(value.mappings[0].familyId,familyId);
  await f.mutate(s=>{s.adultPilotSessions[0].revokedAt=Date.now();});assert.equal((await post()).status,403);
 }finally{await close(server);}
});
for(const split of [false,true])test('server-only originals repair missing '+(split?'split':'legacy')+' payloads without changing jobs, grants, ledgers, or family records',async()=>{
 const f=await fixture(split),point=await f.call(0,'capture',{requestId:'original-copy'}) as any;
 assert.deepEqual(await f.call(0,'capture',{requestId:'original-copy'}),point,'retry freezes one archive identity');
 f.blobs.clear();const listed=await f.call(0,'list',{after:''}) as any;assert.equal(listed.copies.length,1,'auth and list do not resolve lost originals');
 const preview=await f.call(0,'preview',{pointId:point.pointId}) as any;assert.equal(preview.versions,1);
 const restored=await f.call(0,'restore',{pointId:point.pointId,checksum:preview.checksum,approved:true,attemptId:'restore-attempt-one'}) as any;assert.equal(restored.retained,1);assert.equal(restored.added,0);
 const after=await f.db.run(async tx=>(await readWorkspace(tx,workspace,f.artifacts)).state,true);assert.deepEqual(after,f.originalState);assert.equal((await f.call(0,'restore',{pointId:point.pointId,checksum:preview.checksum,approved:true,attemptId:'restore-attempt-one'}) as any).alreadyRestored,true);
 f.blobs.clear();await f.call(0,'restore',{pointId:point.pointId,checksum:preview.checksum,approved:true,attemptId:'restore-after-later-loss'});assert.deepEqual(await f.db.run(async tx=>(await readWorkspace(tx,workspace,f.artifacts)).state),f.originalState,'a new explicit attempt repairs later damage from the same saved point');
 await assert.rejects(f.call(0,'restore',{pointId:point.pointId,checksum:'0'.repeat(64),approved:true,attemptId:'restore-attempt-one'}),/REVIEW_REQUIRED/);
 await assert.rejects(f.call(0,'capture',{requestId:'forged',snapshot:{}}),/INVALID_REQUEST/);
});
test('exact approved Adult mapping makes deterministic playback-only copies and preserves originals and paid accounting',async()=>{
 const f=await fixture(true),point=await f.call(0,'capture',{requestId:'source-copy'}) as any;
 await assert.rejects(f.call(1,'preview',{pointId:point.pointId}),/unavailable/i);
 await assert.rejects(f.call(1,'preview',{pointId:point.pointId,sourceAudience:'adult:00000000-0000-0000-0000-000000000333'}),/MAPPING_REQUIRED/);
 await assert.rejects(f.call(1,'preview',{pointId:point.pointId,sourceAudience,sourceOrigin:'https://foreign.example'}),/MAPPING_REQUIRED/);
 const preview=await f.call(1,'preview',{pointId:point.pointId,sourceAudience}) as any;assert.equal(preview.playbackOnly,true);assert.notEqual(preview.revisionMap['source-revision'],'source-revision');
 f.blobs.clear();const restored=await f.call(1,'restore',{pointId:point.pointId,sourceAudience,checksum:preview.checksum,approved:true,attemptId:'restore-attempt-one'}) as any;
 assert.deepEqual(restored.revisionMap,preview.revisionMap);const authority=await f.route.request(f.sessions[1].cookies,f.sessions[1].proof,'mappings',{}) as any;assert.deepEqual(authority.mappings[0].revisionMap,preview.revisionMap);assert.deepEqual(authority.mappings[0].projectMap,preview.projectMap);const after=await f.db.run(async tx=>(await readWorkspace(tx,workspace,f.artifacts)).state,true);
 assert.deepEqual(after.revisions.slice(0,2),f.originalState.revisions);for(const field of ['jobs','ledgers','audit','devices','adultPilotSessions','adultPilotPermits'] as const)assert.deepEqual(after[field],f.originalState[field]);
 const mapped=after.revisions.find(r=>r.id===preview.revisionMap['source-revision'])!;assert.deepEqual(mapped.game,f.game);assert.equal(mapped.adultPilotProfileId,targetAudience);assert.equal(mapped.recoveryProvenance?.playbackOnly,true);assert.equal(mapped.recoveryProvenance?.sourceRevisionId,'source-revision');
 await f.repo.transaction(state=>{Object.assign(state,after);return true;});let paidCalls=0;
 const day=new Date().toISOString().slice(0,10),stage=(name:ModelStage)=>({model:INITIAL_PREMIUM_MODELS[name],reasoningEffort:'high' as const,zdrApproved:true as const,priceReviewedOn:day,providerAccessReviewedOn:day,maxInputTokens:64000,maxOutputTokens:8000,lowDetailImageTokens:4096,inputUsdPerMillion:INITIAL_PREMIUM_MODELS[name]==='gpt-6.2-astra'?8:2,outputUsdPerMillion:INITIAL_PREMIUM_MODELS[name]==='gpt-6.2-astra'?40:10});
 const approval:PremiumApproval={version:PREMIUM_POLICY_VERSION,enabled:true,approvalId:'synthetic-recovery-budget',maxRepairAttempts:1,stages:{planning:stage('planning'),construction:stage('construction'),review:stage('review'),repair:stage('repair')}};
 const service=new JobService(f.repo,{kind:'metered-api',available:true,generate:async()=>{paidCalls++;throw Error('NEVER_CALL_PAID_PROVIDER');}},{test:async()=>{}},{allowMock:false,maxUnits:5_000_000,premiumMaxJobMicroUsd:5_000_000,timeoutMs:1000,maxRetries:2,adultPilotMode:true,premiumPilot:{approval,workerSha:'a'.repeat(40)}});
 assert.equal((await service.readiness(f.sessions[1].session)).available,true,'valid premium route and allowance are available independently of recovery restriction');
 const before=await f.repo.snapshot();
 await assert.rejects(service.submit(f.sessions[1].session,{gameId:'generated-module',baseRevisionId:mapped.id,prompt:'Make the same game blue',clientRequestId:'new-five-dollar-lineage'}),/RECOVERY_PLAYBACK_ONLY/);
 await assert.rejects(service.fork(f.sessions[1].session,mapped.id,'Copy','fresh-project'),/RECOVERY_PLAYBACK_ONLY/);
 const {defaults}=await import('../src/runtime/manifests');
 await assert.rejects(service.registerBase(f.sessions[1].session,{gameId:'factory',localRevisionId:mapped.id,config:defaults('factory')}),/RECOVERY_PLAYBACK_ONLY/);
 assert.deepEqual(await f.repo.snapshot(),before,'all rejected admissions precede mutations or reservations');assert.equal(paidCalls,0);
 assert.deepEqual((await service.revision(f.sessions[1].session,mapped.id)).game,f.game,'playback still authorized');
});
test('grant withdrawal and mapping changes deny long reads and final restore transaction without overwrites',async()=>{
 const f=await fixture(),point=await f.call(0,'capture',{requestId:'captured'}) as any;
 const preview=await f.call(1,'preview',{pointId:point.pointId,sourceAudience}) as any;f.config.householdRecovery!.adultMappings=[];
 await assert.rejects(f.call(1,'restore',{pointId:point.pointId,sourceAudience,checksum:preview.checksum,approved:true,attemptId:'restore-attempt-one'}),/MAPPING_REQUIRED/);
 await f.mutate(s=>{s.revisions[0].name='Newer immutable metadata';});
 await assert.rejects(f.call(0,'restore',{pointId:point.pointId,checksum:point.checksum,approved:true,attemptId:'restore-attempt-one'}),/IMMUTABLE_CONFLICT/);
 const state=await f.db.run(async tx=>(await readWorkspace(tx,workspace,f.artifacts)).state,true);assert.equal(state.revisions[0].name,'Newer immutable metadata');
 f.config.householdRecovery!.domains=f.config.householdRecovery!.domains.filter(d=>d!=='artwork');await assert.rejects(f.call(0,'list',{after:''}),/CONFIG_REQUIRED/);
});
test('mapped ancestry IDs remain stable across captures and carry source fingerprint',async()=>{
 const f=await fixture(),snapshot=captureGeneratedRecovery(f.originalState,familyId,sourceAudience),first=mapGeneratedRecovery(snapshot,familyId,sourceAudience,targetAudience,appOrigin);
 const next=structuredClone(snapshot);next.revisions.push({...next.revisions[0],id:'second-source',parentId:'source-revision'});next.active['source-project']='second-source';
 const second=mapGeneratedRecovery(next,familyId,sourceAudience,targetAudience,appOrigin);assert.equal(first.revisionMap['source-revision'],second.revisionMap['source-revision']);assert.equal(second.snapshot.revisions[1].parentId,first.revisionMap['source-revision']);assert.match(second.snapshot.revisions[0].recoveryProvenance!.sourceHash,/^[a-f0-9]{64}$/);
});

test('revoking the grant during archive reads denies restore before any target revision is published',async()=>{
 const f=await fixture(),point=await f.call(0,'capture',{requestId:'read-race'}) as any;let revoke=true;
 const store={run:async<T>(operation:(tx:any)=>Promise<T>,readOnly?:boolean)=>{let sawChunk=false;const result=await f.db.run(tx=>operation({...tx,get:async(path:string)=>{const value=await tx.get<any>(path);if(value?.key?.includes('recovery-chunks'))sawChunk=true;return value;}}),readOnly);if(revoke&&sawChunk){revoke=false;await f.mutate(s=>{s.adultPilotSessions.find((g:any)=>g.profileId===targetAudience).revokedAt=Date.now();});}return result;}};
 const route=createHouseholdRecovery(f.config,store,f.artifacts,f.ledgerFor);
 await assert.rejects(route.request(f.sessions[1].cookies,f.sessions[1].proof,'restore',{profile:targetAudience,sourceAudience,pointId:point.pointId,checksum:point.checksum,approved:true,attemptId:'restore-attempt-one'}),/ADULT_PILOT_ACCESS_REQUIRED/);
 const state=await f.db.run(async tx=>(await readWorkspace(tx,workspace,f.artifacts)).state,true);assert.equal(state.revisions.length,2);assert.equal(revoke,false);assert.deepEqual(state.ledgers,f.originalState.ledgers);
});
test('HTTP capture, list, preview and reviewed mapped restore deliver original game bytes with current authority maps',async()=>{
 const f=await fixture(true),{server,url}=await serve(f.route.handler);
 const post=async(who:0|1,path:string,body:object)=>{const response=await fetch(url+'/v1/recovery/generated/'+path,{method:'POST',headers:{Origin:appOrigin,Cookie:f.sessions[who].cookies,'X-Factory-Adult-Session':f.sessions[who].proof,'X-Factory-Request':'1','Content-Type':'application/json'},body:JSON.stringify({profile:f.sessions[who].session.adultProfileId,...body})});return {status:response.status,value:await response.json()};};
 try{
  const captured=await post(0,'capture',{requestId:'http-original'});assert.equal(captured.status,200);
  const listed=await post(1,'list',{sourceAudience,after:''});assert.equal(listed.status,200);assert.equal(listed.value.copies.length,1);
  const preview=await post(1,'preview',{sourceAudience,pointId:captured.value.pointId});assert.equal(preview.status,200);
  assert.equal((await post(1,'restore',{sourceAudience,pointId:captured.value.pointId,checksum:preview.value.checksum,approved:false,attemptId:'restore-unapproved'})).status,403);
  const restored=await post(1,'restore',{sourceAudience,pointId:captured.value.pointId,checksum:preview.value.checksum,approved:true,attemptId:'restore-attempt-one'});assert.equal(restored.status,200);assert.equal(restored.value.added,1);
  const state=await f.db.run(async tx=>(await readWorkspace(tx,workspace,f.artifacts)).state,true);assert.deepEqual(state.revisions.at(-1)!.game,f.game);
 }finally{await close(server);}
});

test('approved cross-origin recovery also maps an unchanged Adult audience and never relabels the archive origin',async()=>{
 const f=await fixture(),point=await f.call(0,'capture',{requestId:'old-origin-original'}) as any;
 f.config.appOrigin='https://new-owner.example';f.config.gatewayOrigin=f.config.appOrigin;f.config.householdPrivateHost!.sourceOrigin=appOrigin;
 f.config.householdRecovery!.adultMappings=[{sourceOrigin:appOrigin,sourceAudience,targetAudience:sourceAudience}];
 await assert.rejects(f.call(0,'preview',{pointId:point.pointId}),/This recovery point is damaged, belongs to another family or uses an unsupported version/);
 const preview=await f.call(0,'preview',{pointId:point.pointId,sourceAudience,sourceOrigin:appOrigin}) as any;assert.equal(preview.playbackOnly,true);assert.notEqual(preview.revisionMap['source-revision'],'source-revision');
 const response=await f.call(0,'restore',{pointId:point.pointId,sourceAudience,sourceOrigin:appOrigin,checksum:preview.checksum,approved:true,attemptId:'move-origin-reviewed'}) as any;assert.equal(response.added,1);
 const state=await f.db.run(async tx=>(await readWorkspace(tx,workspace,f.artifacts)).state,true);assert.equal(state.revisions.at(-1)!.recoveryProvenance!.sourceOrigin,appOrigin);assert.deepEqual(state.revisions[0],f.originalState.revisions[0]);
});
test('fresh authorization before each original republish prevents mapped publication after revocation',async()=>{
 const f=await fixture(),point=await f.call(0,'capture',{requestId:'publish-race'}) as any;let forced=0;
 const artifacts:PrivateArtifacts={get:ref=>f.artifacts.get(ref),put:async(bytes,options)=>{const ref=await f.artifacts.put(bytes,options);if(options?.verifyStored&&++forced===1)await f.mutate(s=>{s.adultPilotSessions.find((g:any)=>g.profileId===targetAudience).revokedAt=Date.now();});return ref;}};
 const route=createHouseholdRecovery(f.config,f.db,artifacts,f.ledgerFor);
 await assert.rejects(route.request(f.sessions[1].cookies,f.sessions[1].proof,'restore',{profile:targetAudience,sourceAudience,pointId:point.pointId,checksum:point.checksum,approved:true,attemptId:'revoke-during-put'}),/ADULT_PILOT_ACCESS_REQUIRED/);
 assert.equal(forced,1);const state=await f.db.run(async tx=>(await readWorkspace(tx,workspace,f.artifacts)).state,true);assert.equal(state.revisions.length,2);assert.deepEqual(state.ledgers,f.originalState.ledgers);
});

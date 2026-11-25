import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {encodeArtifacts,decodeArtifacts,GcsPrivateArtifacts,validateRef,MAX_ARTIFACT_BYTES,type ArtifactRef,type PrivateArtifacts} from '../server/storage/artifacts';
import type {PipelineState} from '../server/pipeline/types';
import {MemoryRepository} from '../server/pipeline/repository';
import {JobService} from '../server/pipeline/service';
import {validateQualityEvidence,type GameQualityEvidence} from '../server/quality/game-quality';
import {syntheticQualityEvidence,syntheticEvidencePng} from '../server/testing/presentation-quality-fixtures';
import {stickerLaunchFixture} from '../server/testing/working-game-fixtures';
import {compiledPipelineFixture,productionFixture} from './quality-pipeline-fixtures';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function fake(){const data=new Map<string,Buffer>();const store:PrivateArtifacts={async put(bytes){const ref:ArtifactRef={storage:'private-artifact-v1',sha256:sha(bytes),bytes:bytes.length};data.set(ref.sha256,bytes);return ref},async get(ref){return data.get(ref.sha256)!}};return {data,store}}
const state=():PipelineState=>({version:1,jobs:[],revisions:[],active:{},ledgers:{},audit:[]});
test('large revision payloads leave Firestore metadata while round-trip authorization and games remain intact',async()=>{const s=state(),{store}=fake();for(let i=0;i<50;i++)s.revisions.push({id:String(i),familyId:'family-a',projectId:'p',parentId:i?String(i-1):null,game:{kind:'generated-module-v1',title:'Game',instructions:'Use arrows',source:' '.repeat(25000),controls:['left'],compiled:{code:' '.repeat(70000),codeHash:'x',sourceHash:'y',tests:{desktop:true,mobile:true,replay:true,isolation:true}}}});assert.ok(Buffer.byteLength(JSON.stringify(s))>3*1024*1024);const packed=await encodeArtifacts(s,store);assert.ok(Buffer.byteLength(packed)<20000);assert.deepEqual(await decodeArtifacts(packed,store),s);assert.equal(s.revisions[0].game?.kind,'generated-module-v1');await assert.rejects(decodeArtifacts(packed),/STORE_REQUIRED/);});
test('artifact tampering and unsafe references fail closed; legacy inline workspaces still load',async()=>{const s=state(),{store,data}=fake();assert.deepEqual(await decodeArtifacts(await encodeArtifacts(s)),s);assert.throws(()=>validateRef({storage:'private-artifact-v1',sha256:'../another-family',bytes:12}));const ref=await store.put(Buffer.from('{"kind":"original"}'));data.set(ref.sha256,Buffer.from('{"kind":"tampered"}'));const raw=JSON.stringify({...s,revisions:[{id:'r',game:ref}]});await assert.rejects(decodeArtifacts(raw,store),/INTEGRITY/);});
test('large private review evidence externalizes, round-trips exactly, rejects tampering and leaves no terminal job reference',async()=>{
 // These valid PNGs contain synthetic test colors, never actual game capture
 // or visual-quality proof. Six images exercise realistic large storage bytes.
 const prompt='Attach stickers to a rocket and launch it.',game=compiledPipelineFixture(productionFixture(stickerLaunchFixture,prompt));
 const captures:GameQualityEvidence['captures']=[];
 for(const [device,color]of [['desktop',20],['tablet',100]] as const)for(const [phase,offset,tick]of [['initial',0,0],['interaction',15,60],['progress',35,600]] as const){
  const bytes=syntheticEvidencePng(color+offset,720,960);
  captures.push({id:device+'-'+phase,device,phase,tick,width:720,height:960,sha256:sha(bytes),data:bytes.toString('base64')});
 }
 const rawBytes=captures.reduce((total,capture)=>total+Buffer.from(capture.data,'base64').length,0);
 assert.ok(rawBytes>3*1024*1024&&rawBytes<4*1024*1024,'exercise more than 3MiB of real PNG bytes within the 4MiB review cap');
 const evidence=validateQualityEvidence(game,{...syntheticQualityEvidence(game),captures});
 assert.throws(()=>validateQualityEvidence(game,{...evidence,captures:[...captures,...captures.slice(0,2).map((capture,index)=>({...capture,id:'extra-'+index}))]}),/QUALITY_EVIDENCE_LIMIT/);
 const s=state(),{store,data}=fake();
 s.revisions.push({id:'kept',familyId:'family-a',projectId:'rocket',parentId:null,game});s.active.rocket='kept';
 s.jobs.push({id:'review-job',familyId:'family-a',gameId:'new',baseRevisionId:null,prompt,clientRequestId:'storage-review',status:'testing',phase:'reviewing',adapter:'metered-api',qualityRequired:'game-quality-v1',maxUnits:1000,usedUnits:11,retryCount:0,execution:{attempt:0,dispatchPending:false,stage:'test',candidate:{format:'generated-source-v1',game},qualityEvidence:evidence}});
 assert.ok(Buffer.byteLength(JSON.stringify(s))>4*1024*1024,'the inline workspace would exceed the metadata document budget');
 const packed=await encodeArtifacts(s,store),metadata=JSON.parse(packed),ref:ArtifactRef=metadata.jobs[0].execution.qualityEvidence;
 validateRef(ref);assert.deepEqual(Object.keys(ref).sort(),['bytes','sha256','storage']);assert.ok(ref.bytes>4*1024*1024&&ref.bytes<MAX_ARTIFACT_BYTES);
 assert.ok(Buffer.byteLength(packed)<32000,'large screenshots must leave transactional metadata');
 assert.equal(ref.sha256,sha(Buffer.from(JSON.stringify(evidence))));assert.deepEqual(metadata.revisions,s.revisions);assert.equal(JSON.stringify(metadata.revisions).includes(ref.sha256),false);
 await assert.rejects(decodeArtifacts(packed),/PRIVATE_ARTIFACT_STORE_REQUIRED/);
 const restored=await decodeArtifacts(packed,store);assert.deepEqual(restored,s);assert.deepEqual(restored.jobs[0].execution?.qualityEvidence,evidence);
 const repo=new MemoryRepository();await repo.transaction(current=>{Object.assign(current,restored);return true;});
 const service=new JobService(repo,{kind:'mock',available:false,generate:async()=>{throw Error('NO_GENERATION_IN_STORAGE_TEST');}},{test:async()=>{throw Error('NO_SANDBOX_IN_STORAGE_TEST');}});
 const owner={subject:'storage-owner',familyId:'family-a',role:'parent' as const,expiresAt:Date.now()+60000};
 assert.deepEqual(await service.revision(owner,'kept'),s.revisions[0],'saved revision response contains the game, never review screenshots');
 const publicStatus=await service.get(owner,'review-job');assert.equal('execution'in publicStatus,false);assert.equal('qualityEvidence'in publicStatus,false);
 const original=data.get(ref.sha256)!,tampered=Buffer.from(original);tampered[tampered.length-2]^=1;assert.equal(tampered.length,original.length);data.set(ref.sha256,tampered);
 await assert.rejects(decodeArtifacts(packed,store),/PRIVATE_ARTIFACT_INTEGRITY_FAILED/);data.set(ref.sha256,original);
 const terminal=structuredClone(restored);terminal.jobs[0].status='cancelled';terminal.jobs[0].phase='cancelled';delete terminal.jobs[0].execution!.candidate;delete terminal.jobs[0].execution!.qualityEvidence;
 const finalPacked=await encodeArtifacts(terminal,store);assert.equal(finalPacked.includes(ref.sha256),false);assert.equal('qualityEvidence'in JSON.parse(finalPacked).jobs[0].execution,false);assert.deepEqual((await decodeArtifacts(finalPacked,store)).revisions,s.revisions);
 assert.equal(data.has(ref.sha256),true,'removing a job reference does not claim blob garbage collection');
});
test('GCS adapter uses private workspace-scoped immutable writes, bounded reads and digest verification',async()=>{
 let path='',options:any;let bytes:Buffer=Buffer.alloc(0);
 const client:any={bucket:(name:string)=>{
  assert.equal(name,'private-artifacts');
  return {file:(key:string)=>{
   path=key;
   return {
    save:async(b:Buffer,o:any)=>{bytes=b;options=o},
    download:async(o:any)=>{assert.equal(o.end,8*1024*1024);return [bytes]}
   };
  }};
 }};
 const store=new GcsPrivateArtifacts('private-artifacts','workspace-a',client);
 const ref=await store.put(Buffer.from('private source'));
 assert.equal(path,`factory/workspace-a/sha256/${ref.sha256}`);
 assert.equal(options.preconditionOpts.ifGenerationMatch,0);
 assert.equal(options.metadata.cacheControl,'private,no-store');
 assert.equal(options.public,undefined);
 assert.equal((await new GcsPrivateArtifacts('private-artifacts','workspace-a',client).get(ref)).toString(),'private source');
 bytes=Buffer.from('changed');
 await assert.rejects(new GcsPrivateArtifacts('private-artifacts','workspace-a',client).get(ref),/INTEGRITY/);
 assert.throws(()=>new GcsPrivateArtifacts('private-artifacts','../other',client));
});
test('reviewed artifact repair verifies storage despite a cached reference and refuses corrupt existing bytes',async()=>{
 const objects=new Map<string,Buffer>();let writes=0,reads=0;
 const client:any={bucket:()=>({file:(path:string)=>({save:async(bytes:Buffer,options:any)=>{writes++;assert.equal(options.preconditionOpts.ifGenerationMatch,0);if(objects.has(path))throw Object.assign(Error('already exists'),{code:412});objects.set(path,Buffer.from(bytes));},download:async()=>{reads++;const bytes=objects.get(path);if(!bytes)throw Error('MISSING');return [bytes];}})})};
 const store=new GcsPrivateArtifacts('private-artifacts','workspace-a',client),bytes=Buffer.from('exact retained original'),ref=await store.put(bytes),path='factory/workspace-a/sha256/'+ref.sha256;
 objects.clear();await store.put(bytes);assert.equal(objects.size,0,'ordinary immutable cache remains an optimization');
 await store.put(bytes,{verifyStored:true});assert.deepEqual(objects.get(path),bytes);assert.equal(writes,2);
 await store.put(bytes,{verifyStored:true});assert.equal(reads,1,'an existing object is verified through a fresh read');
 objects.set(path,Buffer.from('corrupt retained object'));await assert.rejects(store.put(bytes,{verifyStored:true}),/INTEGRITY/);assert.equal(objects.get(path)!.toString(),'corrupt retained object','recovery must not overwrite an existing object');
});

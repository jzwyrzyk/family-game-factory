import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {encodeArtifacts,decodeArtifacts,GcsPrivateArtifacts,validateRef,type ArtifactRef,type PrivateArtifacts} from '../server/storage/artifacts';
import type {PipelineState} from '../server/pipeline/types';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function fake(){const data=new Map<string,Buffer>();const store:PrivateArtifacts={async put(bytes){const ref:ArtifactRef={storage:'private-artifact-v1',sha256:sha(bytes),bytes:bytes.length};data.set(ref.sha256,bytes);return ref},async get(ref){return data.get(ref.sha256)!}};return {data,store}}
const state=():PipelineState=>({version:1,jobs:[],revisions:[],active:{},ledgers:{},audit:[]});
test('large revision payloads leave Firestore metadata while round-trip authorization and games remain intact',async()=>{const s=state(),{store}=fake();for(let i=0;i<50;i++)s.revisions.push({id:String(i),familyId:'family-a',projectId:'p',parentId:i?String(i-1):null,game:{kind:'generated-module-v1',title:'Game',instructions:'Use arrows',source:' '.repeat(25000),controls:['left'],compiled:{code:' '.repeat(70000),codeHash:'x',sourceHash:'y',tests:{desktop:true,mobile:true,replay:true,isolation:true}}}});assert.ok(Buffer.byteLength(JSON.stringify(s))>3*1024*1024);const packed=await encodeArtifacts(s,store);assert.ok(Buffer.byteLength(packed)<20000);assert.deepEqual(await decodeArtifacts(packed,store),s);assert.equal(s.revisions[0].game?.kind,'generated-module-v1');await assert.rejects(decodeArtifacts(packed),/STORE_REQUIRED/);});
test('artifact tampering and unsafe references fail closed; legacy inline workspaces still load',async()=>{const s=state(),{store,data}=fake();assert.deepEqual(await decodeArtifacts(await encodeArtifacts(s)),s);assert.throws(()=>validateRef({storage:'private-artifact-v1',sha256:'../another-family',bytes:12}));const ref=await store.put(Buffer.from('{"kind":"original"}'));data.set(ref.sha256,Buffer.from('{"kind":"tampered"}'));const raw=JSON.stringify({...s,revisions:[{id:'r',game:ref}]});await assert.rejects(decodeArtifacts(raw,store),/INTEGRITY/);});
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

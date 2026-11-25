import {test} from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {encodeArtifacts,decodeArtifacts,type PrivateArtifacts,type ArtifactRef} from '../server/storage/artifacts';
import {traceGameReferences,type GamePayloadRef} from '../server/storage/game-payload';
import type {PipelineState} from '../server/pipeline/types';
import {artifactEncoding} from '../server/storage/encoding-policy';
import {FixtureDocuments} from '../server/beta/documents';
import {FamilyDirectory} from '../server/beta/store';
import {createFamily} from '../server/beta/model';
import {fixtureConfig} from './beta-fixture';
test('split encoding requires an explicit private configuration and durable artifact store',()=>{
 assert.deepEqual(artifactEncoding({artifactBucket:'private-bucket'}),{});
 assert.deepEqual(artifactEncoding({artifactBucket:'private-bucket',storageEncoding:'private-game-v2'}),{splitGamePayloads:true});
 for(const value of [{storageEncoding:true},{storageEncoding:'private-game-v3'},{storageEncoding:'private-game-v2'},
  {storageEncoding:'private-game-v2',artifactBucket:'private-bucket',localFile:'local.json'}])assert.throws(()=>artifactEncoding(value));
});
test('configured family repository writes split payloads and old and new readers preserve exact games',async()=>{
 const db=new FixtureDocuments(),art=memoryArtifacts(),family=createFamily('synthetic-art-owner');
 const enabled=new FamilyDirectory(db,fixtureConfig,()=>art.store,{splitGamePayloads:true});
 await db.run(async tx=>tx.create(enabled.path(family.id),family));
 const source=revisionFixture(2).revisions.map(r=>({...r,familyId:family.id}));
 await enabled.repository(family.id).transaction(s=>{s.revisions.push(...source);});
 const raw=await db.run(tx=>tx.get<{json:string}>('factoryWorkspaces/'+family.workspace+'/state/current/chunks/0'));
 assert.equal(JSON.parse(raw!.json).revisions[0].game.storage,'private-game-v2');
 assert.deepEqual((await enabled.repository(family.id).snapshot()).revisions,source);
 const compatibleReader=new FamilyDirectory(db,fixtureConfig,()=>art.store);
 assert.deepEqual((await compatibleReader.repository(family.id).snapshot()).revisions,source);
 assert.equal(art.values.size,4); // two manifests, one original asset and one compiled payload
});
export function memoryArtifacts(){const values=new Map<string,Buffer>();const store:PrivateArtifacts={put:async bytes=>{const ref:ArtifactRef={storage:'private-artifact-v1',sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};values.set(ref.sha256,Buffer.from(bytes));return ref;},get:async ref=>{const bytes=values.get(ref.sha256);if(!bytes)throw Error('unavailable');return Buffer.from(bytes);}};return {store,values};}
export function revisionFixture(count=50):PipelineState {
 const state:PipelineState={version:1,jobs:[],revisions:[],active:{},ledgers:{},audit:[]};
 for(let i=0;i<count;i++)state.revisions.push({id:'r'+i,familyId:'family1',projectId:'p1',parentId:i?'r'+(i-1):null,game:{kind:'generated-module-v2',title:'Saved '+i,instructions:'Move and explore',source:'// exact revision '+i+'\n'.repeat(100),controls:['left'],assets:{version:'game-assets-v1',style:'illustrated',assets:[{id:'hero',role:'actor',mime:'image/png',width:10,height:10,sha256:'f'.repeat(64),data:'SYNTHETIC-NOT-AN-IMAGE'.repeat(20000),sampling:'smooth',provenance:{kind:'generated',sourceId:'same-approved-art'}}]},compiled:{code:'synthetic compiled bytes'.repeat(1000),sourceHash:'fixture',codeHash:'fixture',tests:{desktop:true,mobile:true,replay:true,isolation:true}}}});
 return state;
}
test('opt-in split assets round-trip exact revisions and deduplicate unchanged artwork and code',async()=>{
 const source=revisionFixture(),legacy=memoryArtifacts(),split=memoryArtifacts();
 const old=await encodeArtifacts(source,legacy.store),packed=await encodeArtifacts(source,split.store,{splitGamePayloads:true});
 assert.deepEqual(await decodeArtifacts(old,legacy.store),source);assert.deepEqual(await decodeArtifacts(packed,split.store),source);
 const bytes=(values:Map<string,Buffer>)=>[...values.values()].reduce((n,b)=>n+b.length,0);
 assert.ok(bytes(split.values)<bytes(legacy.values)*.05);assert.equal(split.values.size,52);
 const metadata=JSON.parse(packed),roots=metadata.revisions.map((r:any)=>r.game) as GamePayloadRef[];
 assert.equal((await traceGameReferences(roots,split.store)).complete,true);
 const root=roots[0],manifest=JSON.parse(split.values.get(root.manifest.sha256)!.toString());split.values.delete(manifest.blobs[0].ref.sha256);
 assert.equal((await traceGameReferences(roots,split.store)).complete,false);await assert.rejects(decodeArtifacts(packed,split.store));
});
test('interrupted upload does not mutate source, and retry uses stable immutable object identities',async()=>{
 const source=revisionFixture(2),before=JSON.stringify(source),{store,values}=memoryArtifacts();let calls=0;
 const failing:PrivateArtifacts={get:store.get,put:async bytes=>{if(++calls===3)throw Error('lost upload');return store.put(bytes);}};
 await assert.rejects(encodeArtifacts(source,failing,{splitGamePayloads:true}));assert.equal(JSON.stringify(source),before);const retained=[...values.keys()];
 const packed=await encodeArtifacts(source,store,{splitGamePayloads:true});assert.deepEqual(await decodeArtifacts(packed,store),source);assert.ok(retained.every(key=>values.has(key)));
});
test('missing store, corrupted objects and unknown manifest fields fail without changing inline source',async()=>{
 const source=revisionFixture(1),{store,values}=memoryArtifacts(),packed=await encodeArtifacts(source,store,{splitGamePayloads:true});await assert.rejects(decodeArtifacts(packed),/STORE_REQUIRED/);
 const ref=JSON.parse(packed).revisions[0].game.manifest;values.set(ref.sha256,Buffer.from('{}'));await assert.rejects(decodeArtifacts(packed,store),/INTEGRITY/);
 assert.equal(source.revisions[0].game!.kind,'generated-module-v2');
});
test('identical artwork never shares object identities across family or Adult audiences',async()=>{
 const source=revisionFixture(1),{store,values}=memoryArtifacts();source.revisions.push({...structuredClone(source.revisions[0]),id:'other-family',familyId:'family2'});source.revisions.push({...structuredClone(source.revisions[0]),id:'adult',adultPilotProfileId:'adult:11111111-1111-1111-1111-111111111111'});
 const packed=await encodeArtifacts(source,store,{splitGamePayloads:true}),metadata=JSON.parse(packed);
 const manifests=metadata.revisions.map((r:any)=>JSON.parse(values.get(r.game.manifest.sha256)!.toString()));assert.equal(new Set(manifests.map((m:any)=>m.blobs[0].ref.sha256)).size,3);assert.equal(new Set(manifests.map((m:any)=>m.code.sha256)).size,3);
 assert.deepEqual(await decodeArtifacts(packed,store),source);metadata.revisions[0].game=metadata.revisions[1].game;await assert.rejects(decodeArtifacts(JSON.stringify(metadata),store),/AUDIENCE/);
});
test('a hash-valid manifest with a missing original asset or code reference is rejected',async()=>{
 const source=revisionFixture(1),{store,values}=memoryArtifacts(),packed=await encodeArtifacts(source,store,{splitGamePayloads:true});
 const metadata=JSON.parse(packed),original=JSON.parse(values.get(metadata.revisions[0].game.manifest.sha256)!.toString());
 for(const missing of ['blobs','code']){
  const changed=structuredClone(original);if(missing==='blobs')changed.blobs=[];else delete changed.code;
  metadata.revisions[0].game.manifest=await store.put(Buffer.from(JSON.stringify(changed)));
  await assert.rejects(decodeArtifacts(JSON.stringify(metadata),store),/MANIFEST_REJECTED/);
  assert.equal((await traceGameReferences([metadata.revisions[0].game],store)).complete,false);
 }
 assert.deepEqual(await decodeArtifacts(packed,store),source);
});

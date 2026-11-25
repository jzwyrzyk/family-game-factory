import {createHash} from 'node:crypto';
import {validateRef,type ArtifactRef,type PrivateArtifacts} from './artifacts';
export interface GamePayloadRef {storage:'private-game-v2';manifest:ArtifactRef}
interface Manifest {schema:'jems.game-payload.v2';audience:string;game:any;blobs:{index:number;ref:ArtifactRef}[];code?:ArtifactRef}
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
export async function verifiedArtifact(store:PrivateArtifacts,ref:ArtifactRef):Promise<Buffer>{
 validateRef(ref);const bytes=await store.get(ref);
 if(!Buffer.isBuffer(bytes)||bytes.length!==ref.bytes||sha(bytes)!==ref.sha256)throw Error('PRIVATE_ARTIFACT_INTEGRITY_FAILED');
 return bytes;
}
/** Optional encoding only. Runtime/quality contracts see the exact original object.
 * Existing workspace-scoped private store supplies isolation and immutable puts.
 */
export async function encodeGamePayload(game:any,store:PrivateArtifacts,audience:string):Promise<GamePayloadRef>{
 const scope=JSON.parse(audience);if(!Array.isArray(scope)||scope.length!==2||typeof scope[0]!=='string'||!scope[0]||scope[1]!==null&&typeof scope[1]!=='string')throw Error('PRIVATE_GAME_AUDIENCE_REQUIRED');
 const manifest:Manifest={schema:'jems.game-payload.v2',audience:sha(Buffer.from(audience)),game:JSON.parse(JSON.stringify(game)),blobs:[]};
 const assets=manifest.game.assets?.assets;
 if(assets!==undefined){
  if(!Array.isArray(assets)||assets.length>8)throw Error('PRIVATE_GAME_MANIFEST_REJECTED');
  for(let index=0;index<assets.length;index++){
   if(typeof assets[index]?.data!=='string')throw Error('PRIVATE_GAME_MANIFEST_REJECTED');
   const ref=await store.put(Buffer.from(JSON.stringify({audience:manifest.audience,data:assets[index].data})));
   manifest.blobs.push({index,ref});delete assets[index].data;
  }
 }
 if(typeof manifest.game.compiled?.code==='string'){
  manifest.code=await store.put(Buffer.from(JSON.stringify({audience:manifest.audience,data:manifest.game.compiled.code})));delete manifest.game.compiled.code;
 }
 return {storage:'private-game-v2',manifest:await store.put(Buffer.from(JSON.stringify(manifest)))};
}
export async function readGameManifest(ref:GamePayloadRef,store:PrivateArtifacts):Promise<Manifest>{
 if(!ref||ref.storage!=='private-game-v2'||Object.keys(ref).some(k=>!['storage','manifest'].includes(k)))throw Error('PRIVATE_GAME_MANIFEST_REJECTED');
 const m=JSON.parse((await verifiedArtifact(store,ref.manifest)).toString('utf8')) as Manifest;
 if(!m||m.schema!=='jems.game-payload.v2'||Object.keys(m).some(k=>!['schema','audience','game','blobs','code'].includes(k))||!/^[a-f0-9]{64}$/.test(m.audience)||!m.game||typeof m.game!=='object'||Array.isArray(m.game)||!Array.isArray(m.blobs)||m.blobs.length>8)throw Error('PRIVATE_GAME_MANIFEST_REJECTED');
 const seen=new Set<number>();let bytes=ref.manifest.bytes;
 for(const b of m.blobs){
  if(!b||Object.keys(b).length!==2||!Number.isInteger(b.index)||b.index<0||b.index>7||seen.has(b.index)||!m.game.assets?.assets?.[b.index]||Object.hasOwn(m.game.assets.assets[b.index],'data'))throw Error('PRIVATE_GAME_MANIFEST_REJECTED');
  seen.add(b.index);validateRef(b.ref);bytes+=b.ref.bytes;
 }
 if(m.code){validateRef(m.code);bytes+=m.code.bytes;if(!m.game.compiled||Object.hasOwn(m.game.compiled,'code'))throw Error('PRIVATE_GAME_MANIFEST_REJECTED');}
 const assets=m.game.assets?.assets;
 if(assets!==undefined&&(!Array.isArray(assets)||assets.length!==seen.size||assets.some((_:unknown,i:number)=>!seen.has(i))))throw Error('PRIVATE_GAME_MANIFEST_REJECTED');
 if(m.game.compiled&&!m.code)throw Error('PRIVATE_GAME_MANIFEST_REJECTED');
 if(bytes>8*1024*1024)throw Error('PRIVATE_ARTIFACT_QUOTA_REACHED');
 return m;
}
export async function decodeGamePayload(ref:GamePayloadRef,store:PrivateArtifacts,audience:string):Promise<any>{
 const m=await readGameManifest(ref,store);if(m.audience!==sha(Buffer.from(audience)))throw Error('PRIVATE_GAME_AUDIENCE_MISMATCH');
 for(const b of m.blobs){const value=JSON.parse((await verifiedArtifact(store,b.ref)).toString('utf8'));if(!value||value.audience!==m.audience||typeof value.data!=='string')throw Error('PRIVATE_GAME_MANIFEST_REJECTED');m.game.assets.assets[b.index].data=value.data;}
 if(m.code){const value=JSON.parse((await verifiedArtifact(store,m.code)).toString('utf8'));if(!value||value.audience!==m.audience||typeof value.data!=='string')throw Error('PRIVATE_GAME_MANIFEST_REJECTED');m.game.compiled.code=value.data;}
 return m.game;
}
/** Dry-run reference tracing. Unknown/missing roots prevent any unused verdict.
 * Callers must include every retained revision, job, backup and recovery point.
 * There is intentionally no deletion API or scheduled destructive policy.
 */
export async function traceGameReferences(roots:GamePayloadRef[],store:PrivateArtifacts):Promise<{complete:boolean;referenced:string[]}>{
 const referenced=new Set<string>();let complete=true;
 for(const root of roots){try{const m=await readGameManifest(root,store);referenced.add(root.manifest.sha256);for(const b of m.blobs){const value=JSON.parse((await verifiedArtifact(store,b.ref)).toString('utf8'));if(value?.audience!==m.audience||typeof value.data!=='string')throw Error('PRIVATE_GAME_AUDIENCE_MISMATCH');referenced.add(b.ref.sha256);}if(m.code){const value=JSON.parse((await verifiedArtifact(store,m.code)).toString('utf8'));if(value?.audience!==m.audience||typeof value.data!=='string')throw Error('PRIVATE_GAME_AUDIENCE_MISMATCH');referenced.add(m.code.sha256);}}catch{complete=false;}}
 return {complete,referenced:[...referenced].sort()};
}

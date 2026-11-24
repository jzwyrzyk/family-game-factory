// This experiment admits only checked-in, cost-free fixture work. It has no provider
// transport, job store, lease, retry or credential. It cannot schedule a paid stage.
import {createHash} from 'node:crypto';
import {setImmediate} from 'node:timers/promises';
import {transform} from 'esbuild';
import {authoredCase,type ArtCase} from './premium-art-cases';
import {extractSheet} from '../server/agent/sprite-sheet';
import {makeRasterAsset,validateAssetPack,assetPackHash} from '../server/agent/game-assets';
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
export async function compareSchedule(id:ArtCase,mode:'serial'|'overlap',signal:AbortSignal,
 fault?:'partial-art'|'stale-contract'){
 const fixture=authoredCase(id),d=fixture.proposal.artDirection,started=performance.now();
 const contract=sha(JSON.stringify([fixture.request,fixture.proposal,sha(fixture.scene),sha(fixture.sheet),sha(fixture.module.source)]));
 const times:Record<string,number>={};
 async function code(){
  signal.throwIfAborted();const start=performance.now();
  const result=await transform(fixture.module.source,{loader:'ts',format:'iife',globalName:'GameModule'});
  signal.throwIfAborted();times.compileMs=performance.now()-start;
  return {contract:fault==='stale-contract'?'stale':contract,hash:sha(result.code)};
 }
 async function art(){
  await setImmediate();signal.throwIfAborted();const start=performance.now();
  const provenance={kind:'approved-library' as const,sourceId:'fixture-'+sha(fixture.sheet)};
  const cells=extractSheet(fixture.sheet,d,provenance,'smooth');
  const scene=makeRasterAsset({id:fixture.proposal.artRequests[0].id,role:'background',bytes:fixture.scene,mime:'image/webp',
   provenance:{kind:'approved-library',sourceId:'fixture-'+sha(fixture.scene)}});
  if(fault==='partial-art')throw Error('FIXTURE_ART_INTERRUPTED');
  const pack=validateAssetPack({version:'game-assets-v1',style:fixture.proposal.presentationStyle,assets:[scene,...cells]});
  signal.throwIfAborted();times.extractMs=performance.now()-start;
  return {contract,hash:assetPackHash(pack)};
 }
 async function both(){
  const results=await Promise.allSettled([code(),art()]);
  const [built,images]=results;
  if(built.status==='rejected')throw built.reason;
  if(images.status==='rejected')throw images.reason;
  return [built.value,images.value] as const;
 }
 const [built,images]=mode==='overlap'?await both():[await code(),await art()];
 signal.throwIfAborted();
 if(built.contract!==contract||images.contract!==contract)throw Error('FIXTURE_JOIN_MISMATCH');
 return {mode,contract,codeHash:built.hash,assetsHash:images.hash,...times,wallMs:performance.now()-started};
}

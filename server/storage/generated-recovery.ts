import {createHash} from 'node:crypto';
import {isGeneratedGame,validateGenerated,hash} from '../agent/generated';
import {assetPackHash} from '../agent/game-assets';
import {runtimeBundle} from '../sandbox/bundle-v2.cjs';
import {qualityArtifactHash} from '../quality/game-quality';
import {isGameId,validateConfig} from '../../src/runtime/manifests';
import {recordId} from '../../src/storage/record-contract';
import type {BuiltRevision,PipelineState} from '../pipeline/types';
export interface GeneratedRecoverySnapshot {schema:'jems.generated-recovery.v1';familyId:string;audience:string;revisions:BuiltRevision[];active:Record<string,string>}
const canonical=(value:any):string=>value===null?'null':Array.isArray(value)?'['+value.map(canonical).join(',')+']':typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);
export const generatedRecoveryHash=(snapshot:GeneratedRecoverySnapshot)=>createHash('sha256').update(canonical(snapshot)).digest('hex');
function validateGame(revision:BuiltRevision){
 const game=revision.game;if(game===null){if(!revision.sourceGame||!isGameId(revision.sourceGame)||!revision.config)throw Error('RECOVERY_ORIGINAL_GAME_MISSING');validateConfig(revision.sourceGame,revision.config);return;}
 if(game.kind==='star-catcher-v1'){if(Object.keys(game).some(k=>!['kind','target','seconds'].includes(k))||!Number.isInteger(game.target)||game.target<1||game.target>100||!Number.isInteger(game.seconds)||game.seconds<1||game.seconds>600)throw Error('RECOVERY_GAME_INVALID');return;}
 if(!isGeneratedGame(game))throw Error('RECOVERY_GAME_VERSION_UNSUPPORTED');const {compiled,...source}=game;validateGenerated(source);
 if(!compiled||typeof compiled.code!=='string'||Buffer.byteLength(compiled.code)>100000||compiled.sourceHash!==hash(game.source)||compiled.codeHash!==hash(compiled.code)||compiled.assetsHash!==assetPackHash(game.assets)||!['desktop','mobile','replay','isolation'].every(k=>compiled.tests?.[k as keyof typeof compiled.tests]===true))throw Error('RECOVERY_ORIGINAL_ATTESTATION_INVALID');
 if(game.kind==='generated-module-v2'){const runtime=runtimeBundle(compiled.runtimeVersion);if(compiled.runtimeHash!==runtime.hash||game.assets&&!runtime.assets||!['input','resources','pause'].every(k=>compiled.tests?.[k as keyof typeof compiled.tests]===true))throw Error('RECOVERY_RUNTIME_UNSUPPORTED');}
 if(compiled.quality&&(compiled.quality.sourceHash!==hash(game.source)||compiled.quality.artifactHash!==qualityArtifactHash(game)))throw Error('RECOVERY_QUALITY_PROVENANCE_INVALID');
}
/** This validates server-retained originals. A checksum is not authorization:
 * callers must only restore from their server-only archive namespace, never an
 * arbitrary uploaded file claiming its own successful test or quality verdict. */
export function validateGeneratedRecovery(input:unknown,familyId:string,audience='family'):GeneratedRecoverySnapshot{
 const value=input as GeneratedRecoverySnapshot;if(!value||value.schema!=='jems.generated-recovery.v1'||value.familyId!==familyId||value.audience!==audience||Object.keys(value).some(k=>!['schema','familyId','audience','revisions','active'].includes(k))||!Array.isArray(value.revisions)||value.revisions.length>512||!value.active||typeof value.active!=='object'||Array.isArray(value.active)||Buffer.byteLength(JSON.stringify(value))>96*1024*1024)throw Error('GENERATED_RECOVERY_SCOPE_INVALID');
 const ids=new Map<string,BuiltRevision>();for(const r of value.revisions){if(!r||Object.keys(r).some(k=>!['id','familyId','parentId','game','projectId','sourceGame','config','name','sourceRevisionId','copyRequestId','adapter','adultPilotProfileId'].includes(k))||!recordId(r.id)||ids.has(r.id)||!recordId(r.projectId)||r.familyId!==familyId||(r.adultPilotProfileId??'family')!==audience||r.parentId!==null&&!recordId(r.parentId)||r.sourceRevisionId!==undefined&&!recordId(r.sourceRevisionId)||r.name!==undefined&&(typeof r.name!=='string'||r.name.length>60))throw Error('GENERATED_RECOVERY_PROVENANCE_INVALID');validateGame(r);ids.set(r.id,r);}
 for(const r of value.revisions){const seen=new Set([r.id]);let parent=r.parentId;while(parent!==null){const prior=ids.get(parent);if(!prior||prior.projectId!==r.projectId||seen.has(parent))throw Error('GENERATED_RECOVERY_ANCESTRY_INVALID');seen.add(parent);parent=prior.parentId;}if(r.sourceRevisionId&&!ids.has(r.sourceRevisionId))throw Error('GENERATED_RECOVERY_SOURCE_MISSING');}
 for(const [project,revision]of Object.entries(value.active))if(!recordId(project)||typeof revision!=='string'||ids.get(revision)?.projectId!==project)throw Error('GENERATED_RECOVERY_POINTER_INVALID');return structuredClone(value);
}
export function captureGeneratedRecovery(state:PipelineState,familyId:string,audience='family'):GeneratedRecoverySnapshot{
 const revisions=state.revisions.filter(r=>r.familyId===familyId&&(r.adultPilotProfileId??'family')===audience),ids=new Set(revisions.map(r=>r.id));return validateGeneratedRecovery({schema:'jems.generated-recovery.v1',familyId,audience,revisions,active:Object.fromEntries(Object.entries(state.active).filter(([,revision])=>ids.has(revision)))},familyId,audience);
}
/** Add original IDs and immutable provenance atomically. Current kept pointers
 * win for existing projects; jobs, grants and accounting are never copied. */
export function importGeneratedRecovery(state:PipelineState,input:unknown,familyId:string,audience='family'){
 const snapshot=validateGeneratedRecovery(input,familyId,audience),existing=new Map(state.revisions.map(r=>[r.id,r]));for(const revision of snapshot.revisions){const prior=existing.get(revision.id);if(prior&&canonical(prior)!==canonical(revision))throw Error('GENERATED_RECOVERY_IMMUTABLE_CONFLICT');if(state.revisions.some(r=>r.projectId===revision.projectId&&(r.familyId!==familyId||(r.adultPilotProfileId??'family')!==audience)))throw Error('GENERATED_RECOVERY_SCOPE_INVALID');}
 const added=snapshot.revisions.filter(r=>!existing.has(r.id));state.revisions.push(...added);let opened=0;for(const [project,revision]of Object.entries(snapshot.active))if(state.active[project]===undefined){state.active[project]=revision;opened++;}return {added:added.length,opened,retained:snapshot.revisions.length-added.length};
}

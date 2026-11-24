// CI packaging proof only; never publishes or rotates an image. Uses authored
// fixtures and Docker's bounded no-network runner, not a production gVisor claim.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {hopper} from '../server/testing/generated-fixtures';
import {authoredCase} from './premium-art-cases';
import {extractSheet} from '../server/agent/sprite-sheet';
import {makeRasterAsset} from '../server/agent/game-assets';
import {bindGameProductionPlan} from '../server/quality/presentation-plan';
import {validateQualityEvidence,qualityEvidenceHash} from '../server/quality/game-quality';
const sha=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
const image='jems-premium-sandbox:ci',directory='test-results/premium-sandbox';
const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const inspect=JSON.parse(execFileSync('docker',['image','inspect',image],{encoding:'utf8'}))[0];
assert.equal(inspect.Config.User,'node');
assert.equal(inspect.Config.Labels['org.opencontainers.image.revision'],source);
const files=execFileSync('git',['ls-files','server/sandbox','server/agent/game-assets.cjs','server/quality/game-quality-evidence.cjs'],{encoding:'utf8'}).trim().split('\n')
 .filter(p=>(p.endsWith('.cjs')&& !p.endsWith('/private-clock-v2.cjs'))||p.includes('/trusted/')||p.endsWith('package.json')||p.endsWith('package-lock.json'));
const hashes=files.map(file=>{
 const expected=sha(readFileSync(file));
 const actual=execFileSync('docker',['run','--rm','--network=none','--entrypoint=sha256sum',image,'/app/'+file],{encoding:'utf8'}).split(' ')[0];
 assert.equal(actual,expected,file);return {file,sha256:actual};
});
const s=authoredCase('factory'),provenance={kind:'approved-library' as const,sourceId:'offline-ci'};
const plan=bindGameProductionPlan(s.proposal,{gameManifest:{id:'new',allowedMechanics:[]},baseRevision:{id:'new'},childIntent:s.request,
 allowedCapabilities:[],signal:new AbortController().signal,budget:{maxUnits:0,timeoutMs:300000}},true);
const factory={...s.module,productionPlan:plan,assets:{version:'game-assets-v1',style:'dimensional',assets:[
 makeRasterAsset({id:'floor',role:'background',bytes:s.scene,mime:'image/webp',provenance}),
 ...extractSheet(s.sheet,s.proposal.artDirection,provenance,'smooth')
]}};
mkdirSync(directory,{recursive:true});
const results=[];
for(const [name,game] of [['legacy',hopper],['premium',factory]] as const){
 const start=performance.now();
 const result=JSON.parse(execFileSync('docker',['run','--rm','-i','--pull=never','--network=none','--read-only','--cap-drop=ALL',
  '--security-opt=no-new-privileges','--pids-limit=128','--memory=1536m','--memory-swap=1536m','--cpus=1',
  '--user=1000:1000','--tmpfs=/tmp:rw,nosuid,nodev,size=256m','--shm-size=128m',image],
  {input:JSON.stringify({game,captureQuality:name==='premium'}),timeout:300000,maxBuffer:10*1024*1024}).toString());
 assert.equal(result.ok,true,result.diagnostics);
 for(const key of ['desktop','mobile','replay','isolation'])assert.equal(result.game.compiled.tests[key],true,key);
 let evidenceHash;
 if(name==='premium'){
  const e=validateQualityEvidence(result.game,result.qualityEvidence);evidenceHash=qualityEvidenceHash(e);
  assert.deepEqual(e.sessions.map(s=>s.outcome),['won','won']);
  for(const c of e.captures)writeFileSync(directory+'/'+c.id+'.png',Buffer.from(c.data,'base64'));
 }
 results.push({name,inputHash:sha(JSON.stringify(game)),tests:result.game.compiled.tests,evidenceHash,elapsedMs:Math.round(performance.now()-start)});
}
writeFileSync(directory+'/build-receipt.json',JSON.stringify({source,imageId:inspect.Id,hashes,results,paidCalls:0,published:false,
 build:'clean Dockerfile; locked npm dependencies; upstream browser download',isolation:'Docker packaging smoke; production gVisor acceptance remains separate'},null,2)+'\n');
console.log('CLEAN_SANDBOX_SOURCE_AND_PROTOCOL_VERIFIED',source,inspect.Id);

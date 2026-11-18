/**
 * O6 end-to-end engineering fixture: ordinary JobService -> EXISTING sandbox
 * worker CLI -> real rendered intent failure -> bounded source-preserving
 * repair -> same sandbox worker passes -> tested ready, no auto-Keep.
 *
 * Only hand-authored, allowlisted source is executed. This is a CI fixture,
 * NOT a production runsc/GVisor attestation or a real paid model evaluation.
 */
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {MemoryRepository} from '../server/pipeline/repository';
import {JobService} from '../server/pipeline/service';
import {draftChildIntentContract} from '../server/quality/child-intent';
import {chooseGameForm} from '../server/quality/game-form';
import {createFunctionalGameContract,type FunctionalGameContract} from '../server/quality/functional-game-contract';
import {stickerLaunchFixture} from '../server/testing/working-game-fixtures';
import {validateCompiled,type GeneratedGame} from '../server/agent/generated';
import type {AgentAdapter} from '../server/pipeline/types';

const idea='Drag three bubble gum stickers onto a rocket, then press Launch to blast off.';
const intent=draftChildIntentContract(idea),form=chooseGameForm(intent);
const spec=createFunctionalGameContract(intent,form,[
  {id:'attach',quote:'Drag three bubble gum stickers onto a rocket'},
  {id:'launch',quote:'press Launch'},
  {id:'payoff',quote:'blast off'}
],[{
  id:'complete-build',covers:['attach','launch','payoff'],
  deterministicReplay:true,
  actions:[
    {kind:'drag',from:{x:60,y:330},to:{x:310,y:270}},
    {kind:'drag',from:{x:140,y:330},to:{x:360,y:270}},
    {kind:'drag',from:{x:220,y:330},to:{x:410,y:270}},
    {kind:'press',button:'action'},{kind:'wait',frames:75}
  ],
  checkpoints:[{after:5,outcome:'won',observations:[
    {kind:'coordinate',key:'rocket',axis:'y',operator:'lt',value:100}
  ]}]
}]);
const broken:GeneratedGame={
 ...stickerLaunchFixture,
 source:stickerLaunchFixture.source.replace('s.launched=true;api.sound','s.launched=false;api.sound')
};
assert.notEqual(broken.source,stickerLaunchFixture.source);
const allowed=new Set([broken.source,stickerLaunchFixture.source]);
let tests=0;

/** Uses the existing dedicated test worker CLI without weakening its logic. */
function authoredWorker(game:GeneratedGame,plan:FunctionalGameContract):Promise<GeneratedGame>{
 if(!allowed.has(game.source))throw Error('O6_UNAPPROVED_FIXTURE');
 return new Promise((resolve,reject)=>{
  let stdout='',settled=false;
  const child=spawn(process.execPath,['server/sandbox/worker.cjs'],{
   env:{PATH:process.env.PATH,HOME:'/tmp',
    WORKER_BROWSER_PATH:process.env.CHROMIUM_PATH||
     (!process.env.CI&&existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath())},
   stdio:['pipe','pipe','pipe']
  });
  const end=(error?:Error,output?:GeneratedGame)=>{
   if(settled)return;
   settled=true;clearTimeout(timer);
   if(error)reject(error);else resolve(output!);
  };
  const timer=setTimeout(()=>{child.kill('SIGKILL');end(Error('O6_WORKER_TIMEOUT'));},110000);
  child.stdout.on('data',data=>{
   stdout+=String(data);
   if(stdout.length>250000){child.kill('SIGKILL');end(Error('O6_WORKER_OUTPUT_LIMIT'));}
  });
  child.stderr.on('data',()=>{}); // never log generated source/child text
  child.on('error',error=>end(error));
  child.on('close',()=>{
   if(settled)return;
   try{
    const result=JSON.parse(stdout);
    if(!result.ok)throw Error(String(result.diagnostics||'PLAYTEST_FAILED').slice(0,300));
    const attested=validateCompiled(game,result.game);
    if(attested.compiled?.tests.intent!==true)throw Error('O6_INTENT_TEST_MISSING');
    end(undefined,attested);
   }catch(error){end(error as Error);}
  });
  child.stdin.end(JSON.stringify({game:{...game,compiled:undefined},independentIntentPlan:plan}));
 });
}
async function main(){
 const repo=new MemoryRepository();
 const parent={subject:'fixture-parent',familyId:'o6-e2e-family',
  role:'parent' as const,expiresAt:Date.now()+600000};
 let generated=0,repaired=0;
 const agent:AgentAdapter={
  kind:'metered-api',available:true,
  async generate(input){
   generated++;
   assert.equal(input.childIntent,idea);
   return {candidate:{format:'generated-source-v1',game:broken},usageUnits:2};
  },
  async repair(input,previous,diagnostics){
   repaired++;
   assert.equal(input.childIntent,idea);
   assert.equal(previous.source,broken.source);
   assert.match(diagnostics,/INTENT_REQUIREMENT_FAILED/);
   assert.match(diagnostics,/CHECKPOINT=0/);
   assert.match(diagnostics,/EXPECTED_OUTCOME=won/);
   assert.doesNotMatch(diagnostics,/http|ignore previous|password/i);
   return {candidate:{format:'generated-source-v1',game:stickerLaunchFixture},usageUnits:3};
  }
 };
 const gate={test:async(game:unknown,context?:{independentIntentPlan?:FunctionalGameContract})=>{
  assert.deepEqual(context?.independentIntentPlan,spec,'both attempts must test identical child requirements');
  assert.ok(!!game&&typeof game==='object');
  tests++;
  return authoredWorker(game as GeneratedGame,context!.independentIntentPlan!);
 }};
 const service=new JobService(repo,agent,gate,{
  allowMock:false,maxUnits:100,timeoutMs:250000,maxRetries:2,maxRepairAttempts:2
 });
 await service.setAllowance(parent,500,true);
 // Existing unrelated previously-kept game must survive a failed build and repair.
 await repo.transaction(s=>{
  s.revisions.push({id:'previous-keep',familyId:parent.familyId,parentId:null,
   projectId:'previous-project',game:stickerLaunchFixture});
  s.active['previous-project']='previous-keep';return true;
 });
 const ack=await service.submit(parent,{
  gameId:'new',baseRevisionId:null,prompt:idea,clientRequestId:'o6-real-browser-repair'
 });
 await repo.transaction(s=>{s.jobs.find(x=>x.id===ack.jobId)!.independentIntentPlan=spec;return true;});
 await service.run(ack.jobId);
 const job=await service.get(parent,ack.jobId);
 assert.equal(job.status,'ready','the failed first candidate must not be called ready until actual repair verifies');
 assert.equal(generated,1);assert.equal(repaired,1);assert.equal(tests,2);
 assert.equal(job.attempts,2);
 assert.ok(job.revisionId);
 const s=await repo.snapshot(),newRevision=s.revisions.find(x=>x.id===job.revisionId);
 assert.ok(newRevision);
 assert.equal((newRevision.game as GeneratedGame).source,stickerLaunchFixture.source);
 assert.equal((newRevision.game as GeneratedGame).compiled?.tests?.intent,true);
 assert.equal(s.active['previous-project'],'previous-keep');
 assert.equal(s.active[newRevision.projectId],undefined,"success cannot auto-Keep the child\u0027s choice");
 assert.equal(s.ledgers[parent.familyId].used,5);
 assert.equal(s.ledgers[parent.familyId].reserved,0);
 assert.ok(s.audit.every(x=>!JSON.stringify(x).includes(idea)));
 await service.keep(parent,job.revisionId!);
 assert.equal((await service.list(parent)).length,2);
 console.log('PASS O6 existing worker/preview: broken launch rejected, repaired launch retested and accepted, both device gates, old Keep preserved, new Keep explicit');
}
void main().catch(error=>{console.error('O6 integration failed:',(error as Error).message);process.exitCode=1;});

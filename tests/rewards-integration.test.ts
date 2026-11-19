/** Real source actions → durable outbox → rewards ledger. No model or generated-game claims. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateItem } from '../src/learning/content';
import { beginAttempt, ensureLearning, finishAttempt, recordLegacyOutcome, submitAnswer, useHint } from '../src/learning/engine';
import { generateLanguageItem } from '../src/language/content';
import { beginLanguageAttempt, ensureLanguage, finishLanguageAttempt, recordLanguageReadAloud, saveCreativeDraft, submitLanguageAnswer, useLanguageHint } from '../src/language/engine';
import type { LearnerProfile } from '../src/learning/types';
import { builderJourney } from '../src/brand/gem-progress';
import { StudioNotebook, STUDIO_KEY, type Candidate } from '../src/studio/notebook';
import { CreationStore, CREATION_KEY } from '../src/creation/storage';
import { createChallengeStarter, createChallengeTarget, evaluateChallenge } from '../src/creation/challenges';
import { createRewardFact, rewardFactId, type RewardFact } from '../src/rewards/model';
import { RewardsStore, type RewardsPersistence, type RewardsTransaction } from '../src/rewards/store';
import { stageLearningReward } from '../src/rewards/integration';

const OWNER='child-one', OTHER='child-two', TIME=Date.UTC(2026,10,19,15);
const clone=<T>(value:T):T=>structuredClone(value);
class SourceMemory {
  data=new Map<string,string>();fail=false;
  getItem(key:string){return this.data.get(key)??null;}
  setItem(key:string,value:string){if(this.fail)throw Error('quota');this.data.set(key,value);}
}
class AtomicMemory implements RewardsPersistence {
  data=new Map<string,unknown>();fail=false;
  async read(namespace:string){return clone(this.data.get(namespace)??null);}
  async update<T>(namespace:string,mutate:(current:unknown|null)=>RewardsTransaction<T>):Promise<T>{
    if(this.fail)throw Error('quota');
    const transaction=mutate(clone(this.data.get(namespace)??null));
    this.data.set(namespace,clone(transaction.next));return transaction.result;
  }
}
const learner=(id=OWNER):LearnerProfile=>({id,grade:4,skills:{},hints:true,learningSubject:'math'});
const mathItem=()=>generateItem('g3-multiply',{factId:'mul:7x8',random:()=>.2});
const rewardStore=()=>{const persistence=new AtomicMemory();return {persistence,rewards:new RewardsStore('family',persistence)};};
const matching=(facts:RewardFact[],kind:RewardFact['kind'])=>facts.filter(fact=>fact.kind===kind);
function localCandidate(key:string):Candidate{
  return {id:'test-'+key,baseId:'base-'+key,config:{bucketCount:4},prompt:'Make four buckets',summary:'A fourth bucket'};
}
function localProject(book:StudioNotebook,key:string,owner=OWNER){
  const session=book.create(owner,'buckets','My '+key,'project-'+key),candidate=localCandidate(key);
  book.saveExperiment(session.id,owner,candidate);
  return {session,candidate};
}
function polish(book:StudioNotebook,key:string){
  const {session,candidate}=localProject(book,key);
  book.observe(session.id,OWNER,'The extra bucket gives me another route.','child',candidate.id);
  book.keepExperiment(session.id,OWNER,candidate.id,{kind:'local',baseId:candidate.baseId,revisionId:'kept-'+key});
  return session;
}

test('real math completion and supported correction earn equally without altering independent evidence',async()=>{
  const profile=learner(),item=mathItem(),first=beginAttempt(profile,item,{now:TIME});
  submitAnswer(profile,first.id,String(item.answer),TIME+100);
  const firstFact=stageLearningReward(profile,'math',first.id);assert.ok(firstFact);
  const second=beginAttempt(profile,item,{now:TIME+1000});
  submitAnswer(profile,second.id,'3',TIME+1100);useHint(profile,second.id,1,TIME+1200);
  submitAnswer(profile,second.id,String(item.answer),TIME+1300);
  const evidence=clone(profile.learning),secondFact=stageLearningReward(profile,'math',second.id);assert.ok(secondFact);
  stageLearningReward(profile,'math',second.id);
  assert.equal(profile.rewardOutbox.length,2);
  assert.deepEqual(profile.learning,evidence,'staging engagement must not change learning evidence');
  assert.equal(first.independent,true);assert.equal(second.independent,false);
  assert.equal(ensureLearning(profile).totals.independent,1);assert.equal(ensureLearning(profile).totals.assisted,1);
  const {rewards}=rewardStore(),granted=await rewards.project(OWNER,profile.rewardOutbox);
  assert.equal(granted.summary.lifetimeGems,4);assert.equal(granted.summary.practiceCount,2);
  assert.deepEqual(granted.newlyGranted.map(grant=>grant.amount),[2,2]);
  assert.equal((await rewards.project(OWNER,profile.rewardOutbox)).newlyGranted.length,0);
});

test('unanswered, wrong-only, shown and interrupted learning never mint a reward',()=>{
  const profile=learner(),item=mathItem();
  for(const [index,outcome] of ['open','shown','interrupted','completed'].entries()){
    const attempt=beginAttempt(profile,item,{now:TIME+index*1000});
    if(outcome!=='open'){
      if(outcome==='completed')submitAnswer(profile,attempt.id,'3',TIME+index*1000+10);
      finishAttempt(profile,attempt.id,outcome as 'shown'|'interrupted'|'completed',TIME+index*1000+100);
    }
    assert.equal(stageLearningReward(profile,'math',attempt.id),null,outcome);
  }
  assert.equal(stageLearningReward(profile,'math','nonexistent-attempt'),null);
  const legacy=recordLegacyOutcome(profile,item,true,false,TIME+9000);
  assert.equal(stageLearningReward(profile,'math',legacy.id),null,'old callers that report a result do not supply an actual host answer');
  assert.equal(profile.rewardOutbox?.length??0,0);
});

test('an explored label cannot turn a noncreative language question into rewarded writing',()=>{
  const profile=learner(),item=generateLanguageItem('g3-main-idea',{random:()=>.1});
  const attempt=beginLanguageAttempt(profile,item,{now:TIME});
  assert.throws(()=>finishLanguageAttempt(profile,attempt.id,'explored',TIME+10),/Only open writing/);
  // Defense in depth for a restored/corrupt source: this is not a permitted UI action.
  attempt.outcome='explored';attempt.finishedAt=TIME+20;attempt.draft='A label cannot change the activity type.';
  assert.equal(stageLearningReward(profile,'language',attempt.id),null);
  assert.equal(profile.rewardOutbox?.length??0,0);
});

test('language assistance and saved unscored writing earn engagement without claiming reading or writing mastery',async()=>{
  const profile=learner(),item=generateLanguageItem('g3-main-idea',{random:()=>.1});
  const attempt=beginLanguageAttempt(profile,item,{now:TIME});
  recordLanguageReadAloud(profile,attempt.id,TIME+10);useLanguageHint(profile,attempt.id,1,TIME+20);
  submitLanguageAnswer(profile,attempt.id,item.answer!,TIME+30);
  assert.equal(stageLearningReward(profile,'language',attempt.id),null,'answer must be finished and saved first');
  finishLanguageAttempt(profile,attempt.id,'completed',TIME+40);
  assert.ok(stageLearningReward(profile,'language',attempt.id));
  const writing=generateLanguageItem('g4-revision',{random:()=>.1});
  const draft=beginLanguageAttempt(profile,writing,{now:TIME+1000});
  assert.equal(saveCreativeDraft(profile,draft.id,' ',TIME+1010).valid,false);
  assert.equal(stageLearningReward(profile,'language',draft.id),null);
  saveCreativeDraft(profile,draft.id,'My robot can find a different route to the moon.',TIME+1020);
  const before=JSON.stringify(profile.language);
  assert.equal(stageLearningReward(profile,'language',draft.id)?.kind,'language.explored');
  assert.equal(JSON.stringify(profile.language),before);assert.equal(ensureLanguage(profile).totals.independent,0);
  assert.equal(ensureLanguage(profile).totals.assisted,1);assert.equal(ensureLanguage(profile).totals.explored,1);
  const {rewards}=rewardStore();
  assert.equal((await rewards.project(OWNER,profile.rewardOutbox)).summary.lifetimeGems,4);
});

test('plain chat and a starter are unrewarded; only newly saved maker evidence queues milestone receipts',()=>{
  const memory=new SourceMemory(),book=new StudioNotebook(memory),session=book.create(OWNER,'buckets','Starter','project-starter');
  book.message(session.id,OWNER,'child','Hello!');book.message(session.id,OWNER,'helper','You are a master!');
  book.update(session.id,OWNER,s=>{s.draft='Maybe a rainbow';});
  assert.deepEqual(book.pendingRewards(OWNER),[]);
  book.update(session.id,OWNER,s=>{s.design!.ideas.push({id:'my-idea',text:'Move the bucket to catch a rainbow',origin:'child',adopted:true});});
  assert.deepEqual(book.pendingRewards(OWNER).map(fact=>fact.kind==='maker.milestone'?fact.level:0),[1]);
  assert.equal(new StudioNotebook(memory).pendingRewards(OWNER).length,1);
  book.setAvatar(OWNER,'nova');assert.equal(book.pendingRewards(OWNER).length,1);
});

test('local development requires a meaningful-change receipt and rewards one canonical project across copies and remote edits',async()=>{
  const memory=new SourceMemory(),book=new StudioNotebook(memory),{session,candidate}=localProject(book,'local');
  book.keepExperiment(session.id,OWNER,candidate.id,{kind:'local',baseId:candidate.baseId,revisionId:'kept-local'});
  assert.equal(matching(book.pendingRewards(OWNER),'game.developed').length,0,'plain Keep is not proof of development');
  book.keepExperiment(session.id,OWNER,candidate.id,{kind:'local',baseId:candidate.baseId,revisionId:'kept-local',contentChanged:true});
  const {rewards}=rewardStore(),first=await rewards.project(OWNER,book.pendingRewards(OWNER));
  assert.equal(first.newlyGranted.find(grant=>grant.kind==='game.developed')?.amount,25);
  assert.equal(Object.hasOwn(book.get(session.id,OWNER).keptExperiments![0],'contentChanged'),false);
  book.acknowledgeRewards(OWNER,book.pendingRewards(OWNER).map(rewardFactId));
  const fork=book.fork(session.id,OWNER,'A copy','copied-local-project',null),copyCandidate=localCandidate('copy');
  book.saveExperiment(fork.id,OWNER,copyCandidate);
  book.keepExperiment(fork.id,OWNER,copyCandidate.id,{kind:'local',baseId:copyCandidate.baseId,revisionId:'kept-copy',contentChanged:true});
  assert.equal(book.get(fork.id,OWNER).rewardProjectId,session.projectId);
  assert.equal((await rewards.project(OWNER,book.pendingRewards(OWNER))).newlyGranted.filter(grant=>grant.kind==='game.developed').length,0);
  const remote:Candidate={id:'remote-test',baseId:'kept-local',remoteId:'remote-revision',prompt:'Add a moving cloud',summary:'Cloud'};
  book.saveExperiment(session.id,OWNER,remote,[],'redesign','child',true,true);
  book.keepExperiment(session.id,OWNER,remote.id,{kind:'remote',baseId:remote.baseId,revisionId:remote.remoteId!});
  assert.equal((await rewards.project(OWNER,book.pendingRewards(OWNER))).summary.counts.making,1,'the developed project is counted once; rank bonuses are not additional games');
  assert.equal(matching(book.pendingRewards(OWNER),'game.developed').length,1,'fork and remote switch share one outbox identity');
});

test('a first verified kept remote build earns development without fabricating a polished improvement; mocks do not',async()=>{
  const book=new StudioNotebook(new SourceMemory()),real=book.create(OWNER,'new','First game');
  const first:Candidate={id:'first-test',baseId:null,remoteId:'first-real-build',prompt:'A cloud game',summary:'A cloud game'};
  book.saveExperiment(real.id,OWNER,first,[],'redesign','helper',true,true);
  book.keepExperiment(real.id,OWNER,first.id,{kind:'remote',baseId:null,revisionId:first.remoteId!});
  assert.equal(book.get(real.id,OWNER).keptExperiments?.length??0,0);
  assert.equal(builderJourney(book.list(OWNER),OWNER).polishedCount,0);
  const mock=book.create(OWNER,'new','Mock fixture'),fake={...first,id:'mock-test',remoteId:'mock-build'};
  book.saveExperiment(mock.id,OWNER,fake,[],'redesign','helper',true,false);
  book.keepExperiment(mock.id,OWNER,fake.id,{kind:'remote',baseId:null,revisionId:fake.remoteId!});
  const {rewards}=rewardStore(),result=await rewards.project(OWNER,book.pendingRewards(OWNER));
  assert.equal(result.summary.lifetimeGems,25);assert.equal(result.newlyGranted.length,1);
});

test('three real polished projects preserve creator ranks while adding each maker milestone only once',async()=>{
  const book=new StudioNotebook(new SourceMemory());polish(book,'one');polish(book,'two');polish(book,'three');
  assert.equal(builderJourney(book.list(OWNER),OWNER).level,4);
  const facts=book.pendingRewards(OWNER);
  assert.deepEqual(facts.map(fact=>fact.kind==='maker.milestone'?fact.level:0),[1,2,3,4]);
  const {rewards}=rewardStore(),result=await rewards.project(OWNER,facts);
  assert.equal(result.summary.lifetimeGems,75);
  book.acknowledgeRewards(OWNER,facts.map(rewardFactId));book.setAvatar(OWNER,'spark');
  assert.deepEqual(book.pendingRewards(OWNER),[]);
});

test('source quota failures cannot persist receipts or award unsaved work',async()=>{
  const memory=new SourceMemory(),book=new StudioNotebook(memory),session=book.create(OWNER,'buckets','Fail safely','failure-project');
  const before=memory.getItem(STUDIO_KEY);memory.fail=true;
  assert.throws(()=>book.saveExperiment(session.id,OWNER,localCandidate('failure')),/Could not save/);
  memory.fail=false;assert.equal(memory.getItem(STUDIO_KEY),before);assert.deepEqual(book.pendingRewards(OWNER),[]);
  const scenes=new CreationStore(memory),starter=createChallengeStarter('robot-route'),project=scenes.create(OWNER,starter,{challengeId:'robot-route'});
  const prior=memory.getItem(CREATION_KEY);memory.fail=true;
  assert.throws(()=>scenes.recordAttempt(project.id,OWNER,project.headId,{challengeId:'robot-route',passed:true,hintUsed:false}),/Could not save/);
  memory.fail=false;assert.equal(memory.getItem(CREATION_KEY),prior);assert.deepEqual(scenes.pendingRewards(OWNER),[]);
  const {rewards}=rewardStore();assert.equal((await rewards.project(OWNER,[])).summary.lifetimeGems,0);
});

test('notebook notifies only newly saved reward owners, never failed writes, reads, restores or acknowledgments',()=>{
  const memory=new SourceMemory(),notifications:string[]=[],book=new StudioNotebook(memory,owner=>{
    assert.ok(JSON.parse(memory.getItem(STUDIO_KEY)!).rewardOutbox.some((fact:RewardFact)=>fact.owner===owner),'notification follows durable persistence');
    notifications.push(owner);
  });
  const session=book.create(OWNER,'buckets','Atomic notification','notify-project');
  memory.fail=true;assert.throws(()=>book.saveExperiment(session.id,OWNER,localCandidate('notify')),/Could not save/);
  memory.fail=false;assert.deepEqual(notifications,[]);
  book.saveExperiment(session.id,OWNER,localCandidate('notify'));assert.deepEqual(notifications,[OWNER]);
  const snapshot=book.read();book.restore(snapshot);book.setAvatar(OWNER,'nova');
  book.acknowledgeRewards(OWNER,book.pendingRewards(OWNER).map(rewardFactId));
  assert.deepEqual(notifications,[OWNER],'acknowledgment cannot trigger a projection loop');
  const other=book.create(OTHER,'buckets','Other owner','other-notify-project');
  book.saveExperiment(other.id,OTHER,localCandidate('other-notify'));assert.deepEqual(notifications,[OWNER,OTHER]);
});

test('ledger failure leaves the source retryable and a failed acknowledgment cannot duplicate saved gems',async()=>{
  const memory=new SourceMemory(),book=new StudioNotebook(memory);polish(book,'retry');
  const facts=book.pendingRewards(OWNER),{persistence,rewards}=rewardStore();
  persistence.fail=true;await assert.rejects(rewards.project(OWNER,facts),/quota/);
  assert.deepEqual(book.pendingRewards(OWNER),facts);
  persistence.fail=false;assert.equal((await rewards.project(OWNER,facts)).summary.lifetimeGems,35);
  memory.fail=true;assert.throws(()=>book.acknowledgeRewards(OWNER,facts.map(rewardFactId)),/Could not save/);
  memory.fail=false;assert.equal((await rewards.project(OWNER,book.pendingRewards(OWNER))).newlyGranted.length,0);
  book.acknowledgeRewards(OWNER,facts.map(rewardFactId));assert.deepEqual(book.pendingRewards(OWNER),[]);
});

test('actual scene checks grant once per challenge even with hints, rechecks and copied scenes',async()=>{
  const scenes=new CreationStore(new SourceMemory()),challenge='robot-route',starter=createChallengeStarter(challenge);
  const project=scenes.create(OWNER,starter,{challengeId:challenge});
  const first=evaluateChallenge(challenge,starter);assert.equal(first.passed,false);
  scenes.recordAttempt(project.id,OWNER,project.headId,{challengeId:challenge,passed:first.passed,hintUsed:false});
  assert.deepEqual(scenes.pendingRewards(OWNER),[]);
  scenes.markHintUsed(project.id,OWNER);
  // A named deterministic solution fixture exercises the real checker and save flow.
  const changed={...starter,programs:createChallengeTarget(challenge).programs};
  const revision=scenes.save(project.id,OWNER,changed,project.headId),result=evaluateChallenge(challenge,changed);
  assert.equal(result.passed,true);
  const receipt=scenes.recordAttempt(project.id,OWNER,revision.id,{challengeId:challenge,passed:result.passed,hintUsed:false});
  assert.equal(receipt.hintUsed,true,'support remains recorded even if a later callback omits it');
  scenes.recordAttempt(project.id,OWNER,revision.id,{challengeId:challenge,passed:result.passed,hintUsed:false});
  const copied=scenes.copy(project.id,OWNER);
  scenes.recordAttempt(copied.id,OWNER,copied.headId,{challengeId:challenge,passed:result.passed,hintUsed:false});
  assert.equal(scenes.pendingRewards(OWNER).length,1);
  const {rewards}=rewardStore(),granted=await rewards.project(OWNER,scenes.pendingRewards(OWNER));
  assert.equal(granted.summary.lifetimeGems,8);assert.equal(granted.summary.counts.coding,1);
  scenes.acknowledgeRewards(OWNER,scenes.pendingRewards(OWNER).map(rewardFactId));
  scenes.recordAttempt(copied.id,OWNER,copied.headId,{challengeId:challenge,passed:true,hintUsed:false});
  assert.equal((await rewards.project(OWNER,scenes.pendingRewards(OWNER))).newlyGranted.length,0);
});

test('player changes reject stale scene writes and foreign acknowledgments cannot consume another player receipt',async()=>{
  let owner=OWNER;const memory=new SourceMemory(),scenes=new CreationStore(memory,()=>owner);
  const scene=createChallengeStarter('robot-route'),project=scenes.create(OWNER,scene,{challengeId:'robot-route'});
  owner=OTHER;
  assert.throws(()=>scenes.recordAttempt(project.id,OWNER,project.headId,{challengeId:'robot-route',passed:true,hintUsed:false}),/Player changed/);
  owner=OWNER;assert.deepEqual(scenes.pendingRewards(OWNER),[]);
  const book=new StudioNotebook(memory);localProject(book,'own');localProject(book,'other',OTHER);
  const mine=book.pendingRewards(OWNER),theirs=book.pendingRewards(OTHER);
  book.acknowledgeRewards(OTHER,mine.map(rewardFactId));assert.deepEqual(book.pendingRewards(OWNER),mine);
  const {rewards}=rewardStore();await assert.rejects(rewards.project(OWNER,theirs),/another player/);
  assert.equal((await rewards.summary(OWNER)).lifetimeGems,0);
  await rewards.project(OWNER,mine);assert.equal((await rewards.summary(OTHER)).lifetimeGems,0);
});

test('backup round trip recovers pending source work without duplicating grants or retro-awarding old ranks',async()=>{
  const book=new StudioNotebook(new SourceMemory());polish(book,'backup');
  const pending=book.read(),{rewards}=rewardStore();await rewards.project(OWNER,book.pendingRewards(OWNER));
  const backup=await rewards.export(),restoredBook=new StudioNotebook(new SourceMemory());restoredBook.restore(pending);
  const restoredRewards=rewardStore().rewards;await restoredRewards.restore(backup,{mode:'replace',allowedOwners:[OWNER]});
  assert.equal((await restoredRewards.project(OWNER,restoredBook.pendingRewards(OWNER))).newlyGranted.length,0);
  assert.equal((await restoredRewards.summary(OWNER)).lifetimeGems,35);
  const older=clone(pending);delete older.rewardOutbox;older.sessions.forEach(session=>delete session.rewardProjectId);
  restoredBook.restore(older);assert.equal(builderJourney(restoredBook.list(OWNER),OWNER).level,3);
  restoredBook.setAvatar(OWNER,'nova');assert.deepEqual(restoredBook.pendingRewards(OWNER),[],'old history is the baseline, not new work');
  assert.equal((await restoredRewards.summary(OWNER)).lifetimeGems,35);
});

test('source backups reject foreign owners and unrelated reward kinds before overwriting saved work',()=>{
  const memory=new SourceMemory(),book=new StudioNotebook(memory);localProject(book,'validate');
  const before=memory.getItem(STUDIO_KEY),badOwner=book.read();
  badOwner.rewardOutbox=[createRewardFact({owner:OTHER,kind:'maker.milestone',level:1,occurredAt:TIME})];
  assert.throws(()=>book.restore(badOwner),/reward receipt/);assert.equal(memory.getItem(STUDIO_KEY),before);
  const wrongKind=book.read();wrongKind.rewardOutbox=[createRewardFact({owner:OWNER,kind:'math.completed',sourceId:'untrusted-round-score',occurredAt:TIME})];
  assert.throws(()=>book.restore(wrongKind),/reward receipt/);assert.equal(memory.getItem(STUDIO_KEY),before);
  const scenes=new CreationStore(memory),scene=createChallengeStarter('robot-route');scenes.create(OWNER,scene,{challengeId:'robot-route'});
  const original=memory.getItem(CREATION_KEY),wrongScene=scenes.export();wrongScene.rewardOutbox=wrongKind.rewardOutbox;
  assert.throws(()=>scenes.restore(wrongScene),/unsupported|damaged/);assert.equal(memory.getItem(CREATION_KEY),original);
});

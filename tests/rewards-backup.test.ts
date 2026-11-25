/** A family import/reset must replace its sources and receipt ledger together. */
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { RevisionStore, WORKSPACE_KEY } from '../src/factory/workspace';
import { StudioNotebook, STUDIO_KEY, type StudioSession } from '../src/studio/notebook';
import { creationBuildReadiness, creationPlan, recordCreationReview, selectedSuggestions, selectionId } from '../src/studio/creation-readiness';
import { authoredFollowupIntents, compileGuidedBuild } from '../src/studio/guided-planning';
import { visibleConversation } from '../src/studio/conversation-view';
import { identifyBuildRequest } from '../src/builder/submission';
import { hasMeaningfulCreation } from '../src/studio/guidance';
import { deriveStudioNotifications, freshStudioNotificationPreferences } from '../src/studio/notifications';
import { CreationStore, CREATION_KEY } from '../src/creation/storage';
import { createChallengeStarter } from '../src/creation/challenges';
import { createRewardFact } from '../src/rewards/model';
import { REWARDS_DB_NAME, RewardsStore, type RewardsPersistence, type RewardsTransaction } from '../src/rewards/store';
import { PALS_DB_NAME, PalsStore, type PalsPersistence } from '../src/pals/store';
import { applyFamilyRewardBackup, assertLosslessRewardJSON, FAMILY_STATE_KEY, REWARD_BACKUP_JOURNAL_KEY, REWARD_SOURCE_KEYS, recoverRewardBackupJournal, validateFamilyRewardBackup } from '../src/rewards/backup';
import { setRewardSourceMaintenance } from '../src/rewards/write-guard';
import { ProblemSolvingStore } from '../src/problem-solving/storage';
import { PROBLEM_SOLVING_EPISODE_SCHEMA, PROBLEM_SOLVING_KEY, emptyProblemSolvingWorkspace, type ProblemSolvingEpisode } from '../src/problem-solving/model';

const clone=<T>(value:T):T=>structuredClone(value);
const OWNER='player1',OTHER='player2',TIME=Date.UTC(2026,10,19,15);
class SourceMemory {
  data=new Map<string,string>();failKeys:string[]=[];
  getItem(key:string){return this.data.get(key)??null;}
  setItem(key:string,value:string){if(this.failKeys[0]===key){this.failKeys.shift();throw Error('quota');}this.data.set(key,value);}
  removeItem(key:string){this.data.delete(key);}
}
class AtomicMemory implements RewardsPersistence,PalsPersistence {
  data=new Map<string,unknown>();failUpdates=0;
  async read(namespace:string){return clone(this.data.get(namespace)??null);}
  async update<T>(namespace:string,mutate:(current:unknown|null)=>RewardsTransaction<T>):Promise<T>{
    if(this.failUpdates){this.failUpdates--;throw Error('ledger write failed');}
    const transaction=mutate(clone(this.data.get(namespace)??null));this.data.set(namespace,clone(transaction.next));return transaction.result;
  }
}
let validateBase:(raw:string)=>unknown;
before(async()=>{
  // Use the actual legacy family validator, without booting its unrelated UI.
  (globalThis as any).window={FG:{}};(globalThis as any).localStorage=new SourceMemory();
  try{await import('../src/legacy/store.js');validateBase=(globalThis as any).window.FG.store.validateBackup;}
  finally{delete (globalThis as any).window;delete (globalThis as any).localStorage;}
});
function base(owners=[OWNER]){return {version:1,activeProfile:owners[0],profiles:owners.map(id=>({id,name:id,grade:3,skills:{},stats:{}})),feedback:[],createdAt:TIME};}
function stores(){const storage=new SourceMemory(),persistence=new AtomicMemory();return {storage,persistence,rewards:new RewardsStore(REWARDS_DB_NAME,persistence),pals:new PalsStore(PALS_DB_NAME,new AtomicMemory())};}
const sources=(storage:SourceMemory)=>Object.fromEntries(REWARD_SOURCE_KEYS.map(key=>[key,storage.getItem(key)]));
function reasoningEpisode(id:string,owner=OWNER):ProblemSolvingEpisode {
  const at=new Date(TIME).toISOString();
  return {schema:PROBLEM_SOLVING_EPISODE_SCHEMA,id,owner,sessionId:'fixture-session',source:'practice',kind:'structured-practice',
    task:{id:'fixture-test',family:'fixture',version:'v1',label:'Fixture reasoning task',exposure:'unknown',firstAttempt:false},
    startedAt:at,completedAt:at,observations:[{id:'fixture-choice',skill:'plan_test',outcome:'demonstrated',authorship:'learner',support:'unknown',elicitation:'prompted',observedAt:at}]};
}
async function incoming(owner=OWNER){
  const {storage,rewards,pals}=stores(),workspace=new RevisionStore(storage),notebook=new StudioNotebook(storage),creation=new CreationStore(storage),problemSolving=new ProblemSolvingStore(storage);
  const project=workspace.create(owner,'buckets','Saved game');notebook.create(owner,'buckets','Saved game',project.id);
  notebook.dismissWelcome(owner);notebook.dismissGuideTip(owner,'idea');
  await pals.chooseStarter(owner,'glim',{owner,lifetimeGems:0,activities:[]});
  await pals.setPreferences(owner,{encouragement:false});
  const scene=creation.create(owner,createChallengeStarter('robot-route'),{challengeId:'robot-route'});
  creation.recordAttempt(scene.id,owner,scene.headId,{challengeId:'robot-route',passed:true,hintUsed:true});
  problemSolving.record(reasoningEpisode('saved-practice',owner));
  const draft=reasoningEpisode('unfinished-practice',owner);delete draft.completedAt;draft.observations=[];problemSolving.saveDraft({episode:draft,stepIndex:0});
  await rewards.project(owner,[createRewardFact({owner,kind:'math.completed',sourceId:'saved-answer',occurredAt:TIME})]);
  return {...base([owner]),factoryWorkspace:workspace.snapshot(),factoryStudio:notebook.read(),factoryCreation:creation.read(),factoryProblemSolving:problemSolving.export(),factoryRewards:await rewards.export(),factoryPals:await pals.export()};
}
async function existing(){
  const result=stores();
  // Raw source strings are intentionally not normalized by the rollback path.
  result.storage.setItem(FAMILY_STATE_KEY,' {"original":"profile bytes"} ');
  result.storage.setItem(WORKSPACE_KEY,'a damaged workspace preserved verbatim');
  result.storage.setItem(STUDIO_KEY,'{"original":"notebook"}');
  result.storage.setItem(PROBLEM_SOLVING_KEY,' damaged original observations preserved verbatim ');
  await result.rewards.project(OTHER,[createRewardFact({owner:OTHER,kind:'game.developed',sourceId:'original-game',occurredAt:TIME})]);
  return {...result,beforeSources:sources(result.storage),beforeLedger:await result.persistence.read(REWARDS_DB_NAME)};
}

test('whole-family prevalidation uses the real base validator and strips duplicate domain envelopes',async()=>{
  const {rewards,pals}=stores(),value=await incoming(),plan=validateFamilyRewardBackup(JSON.stringify(value),validateBase,rewards,pals);
  assert.deepEqual(plan.owners,[OWNER]);assert.equal(plan.creation.rewardOutbox?.length,1);
  assert.equal(plan.rewards.data.profiles[0].receipts.length,1);
  for(const field of ['factoryWorkspace','factoryStudio','factoryCreation','factoryProblemSolving','factoryRewards','factoryPals'])assert.equal(Object.hasOwn(plan.base,field),false);
  assert.equal(plan.problemSolving.episodes.length,1);assert.equal(plan.problemSolving.drafts.length,1);
  assert.equal(value.factoryStudio.sessions.length,1,'validation does not mutate its caller');
  const legacy=validateFamilyRewardBackup(JSON.stringify(base()),validateBase,rewards,pals);
  assert.deepEqual(legacy.workspace.projects,[]);assert.deepEqual(legacy.notebook.sessions,[]);assert.deepEqual(legacy.creation.projects,[]);assert.deepEqual(legacy.rewards.data.profiles,[]);
  assert.deepEqual(legacy.problemSolving,emptyProblemSolvingWorkspace());
});

test('full-family backup preserves linked chat pages, provenance and the same native game',async()=>{
  const value=await incoming(),source=new SourceMemory(),book=new StudioNotebook(source);
  book.restore(value.factoryStudio);const session=book.list(OWNER)[0];
  book.update(session.id,OWNER,s=>{s.messages=Array.from({length:200},(_,index)=>({id:'backup-turn-'+index,role:index%2?'helper':'child',text:'Original words '+index,at:new Date(TIME).toISOString()}));s.design!.plan.action={value:'Original words 0',origin:'child',accepted:true,delegated:false};});
  book.continueConversation(session.id,OWNER);book.message(session.id,OWNER,'child','My next idea');
  value.factoryStudio=book.read();
  const {storage,rewards,pals}=stores(),plan=validateFamilyRewardBackup(JSON.stringify(value),validateBase,rewards,pals);
  await applyFamilyRewardBackup(plan,storage,rewards,'restore',pals);
  const restored=new StudioNotebook(storage);
  assert.deepEqual(restored.read(),book.read());
  assert.deepEqual(restored.get(session.id,OWNER),book.get(session.id,OWNER));
  assert.equal(new RevisionStore(storage).project(session.projectId!,OWNER).id,session.projectId);
  const foreign=structuredClone(value);foreign.factoryStudio.conversationChapters![0].owner=OTHER;
  assert.throws(()=>validateFamilyRewardBackup(JSON.stringify(foreign),validateBase,rewards,pals),/conversation link/);
});

test('family backup keeps selected chapter evidence, existing games, notifications and exact pending identity through a continued fork',async()=>{
  const value=await incoming(),source=new SourceMemory(),book=new StudioNotebook(source);
  book.restore(value.factoryStudio);const native=book.list(OWNER)[0],workspaceBefore=structuredClone(value.factoryWorkspace);
  book.update(native.id,OWNER,s=>{s.job={id:'earlier-native-job',api:'https://builder.test',status:'failed'};});
  const notification=deriveStudioNotifications(book.list(OWNER),OWNER)[0];book.acknowledgeNotifications(OWNER,[notification]);
  const idea=book.create(OWNER,'new','Quiet pond',null,{creationStandard:2});
  const premise='I tap the quiet pond. Each tap makes a ripple. I just want to play with the ripples.',picked='I choose paper waves.';
  book.message(idea.id,OWNER,'child',premise);book.message(idea.id,OWNER,'helper','My ideas are chalk lines, clay rings and paper waves.');
  while(book.conversationPage(idea.id,OWNER).available)book.message(idea.id,OWNER,'helper','Retained history '+book.conversationPage(idea.id,OWNER).count);
  book.continueConversation(idea.id,OWNER);book.message(idea.id,OWNER,'child',picked);
  const choice=book.get(idea.id,OWNER).messages.at(-1)!;
  const verdict={ready:true,evidence:{action:'tap',consequence:'makes a ripple',world:'pond',experience:'play with the ripples',goal:'just want to play with the ripples',mood:'quiet',visualStyle:picked},unresolved:[]};
  book.update(idea.id,OWNER,s=>{
    s.design!.plan.style={value:picked,origin:'helper',accepted:true,delegated:false};
    s.design!.ideas.push({id:selectionId('style',0,choice.id),text:'paper waves',origin:'helper',adopted:true});
    s.design!.creationReview=recordCreationReview(book.withConversation(s),verdict,2);
  });
  const compile=(s:StudioSession)=>{const messages=visibleConversation(s.messages),design={...s.design!,plan:creationPlan(s)};return compileGuidedBuild(premise,design,'',authoredFollowupIntents(messages,design),{messages,selected:selectedSuggestions(s,messages)});};
  const prompt=compile(book.get(idea.id,OWNER)),request=await identifyBuildRequest({gameId:'new',baseRevisionId:null,prompt,clientRequestId:'saved-chapter-build'});
  book.update(idea.id,OWNER,s=>{s.pendingSubmission={owner:OWNER,workspace:s.id,api:'https://builder.test',request};});
  const original=book.get(idea.id,OWNER),preferences=book.notificationPreferences(OWNER);value.factoryStudio=book.read();
  const {storage,rewards,pals}=stores(),plan=validateFamilyRewardBackup(JSON.stringify(value),validateBase,rewards,pals);
  await applyFamilyRewardBackup(plan,storage,rewards,'restore',pals);
  const restored=new StudioNotebook(storage),saved=restored.get(idea.id,OWNER);
  assert.deepEqual(saved,original);assert.deepEqual(new RevisionStore(storage).snapshot(),workspaceBefore);
  assert.deepEqual(restored.notificationPreferences(OWNER),preferences);
  const restoredNative=deriveStudioNotifications(restored.list(OWNER),OWNER,{},restored.notificationPreferences(OWNER)).find(row=>row.sessionId===native.id)!;
  assert.equal(restoredNative.token,notification.token);assert.equal(restoredNative.unread,false);
  assert.deepEqual(saved.pendingSubmission!.request,request);assert.equal(compile(saved),prompt);assert.equal(creationBuildReadiness(saved,2).ready,true);
  assert.throws(()=>restored.continueConversation(idea.id,OWNER),/recover this build/);
  const copied=restored.fork(idea.id,OWNER,'Quiet pond copy',null,null);
  assert.equal(copied.pendingSubmission,null);assert.equal(copied.rewardProjectId,original.rewardProjectId);
  assert.equal(copied.previousConversationId,original.previousConversationId);assert.equal(creationBuildReadiness(restored.get(copied.id,OWNER),2).ready,false,'a new session needs its own review');
  restored.continueConversation(copied.id,OWNER);
  restored.update(copied.id,OWNER,s=>{s.design!.creationReview=recordCreationReview(restored.withConversation(s),verdict,2);});
  const continued=new StudioNotebook(storage).get(copied.id,OWNER);
  assert.deepEqual(continued.messages,original.messages);assert.equal(selectedSuggestions(continued).style?.[0].offer,'paper waves');
  assert.equal(creationBuildReadiness(continued,2).ready,true);assert.equal(compile(continued),prompt);
  assert.deepEqual(restored.get(idea.id,OWNER),original,'copy/continue never changes the pending original');
  assert.doesNotMatch(prompt,/chalk lines|clay rings/);
});

test('invalid family ownership, linked games, namespace and recovery-only files are rejected before any write',async()=>{
  const {storage,rewards,pals}=stores(),valid=await incoming();
  const invalid:(typeof valid|Record<string,unknown>)[]=[];
  invalid.push({...valid,profiles:[valid.profiles[0],valid.profiles[0]]});
  invalid.push({...valid,activeProfile:OTHER});
  invalid.push({...valid,factoryWorkspace:{version:2,projects:[],revisions:[],plays:[]}});
  invalid.push({...valid,factoryStudio:{...valid.factoryStudio,avatars:{[OTHER]:'spark'}}});
  invalid.push({...valid,factoryStudio:{...valid.factoryStudio,guidance:{[OTHER]:{welcomeDismissed:true,dismissedTips:['idea']}}}});
  invalid.push({...valid,factoryStudio:{...valid.factoryStudio,guidance:{'adult:foreign':{welcomeDismissed:true,dismissedTips:[]}}}});
  invalid.push({...valid,factoryStudio:{...valid.factoryStudio,notifications:{[OTHER]:freshStudioNotificationPreferences()}}});
  invalid.push({...valid,factoryStudio:{...valid.factoryStudio,notifications:{'adult:foreign':freshStudioNotificationPreferences()}}});
  invalid.push({...valid,factoryRewards:{...valid.factoryRewards,namespace:'foreign-workspace'}});
  invalid.push({...valid,factoryRewardsRecovery:{namespace:REWARDS_DB_NAME,raw:{damaged:true}}});
  invalid.push({...valid,factoryProblemSolvingRecoveryRaw:'preserved damaged evidence'});
  invalid.push({...valid,factoryProblemSolving:{...valid.factoryProblemSolving,schema:'future-version'}});
  invalid.push({...valid,factoryProblemSolving:{...valid.factoryProblemSolving,episodes:[reasoningEpisode('foreign',OTHER)]}});
  invalid.push({...valid,factoryProblemSolving:{...valid.factoryProblemSolving,drafts:valid.factoryProblemSolving.drafts.map(draft=>({...draft,episode:{...draft.episode,owner:OTHER}}))}});
  invalid.push({...valid,factoryProblemSolving:{...valid.factoryProblemSolving,discardedByOwner:{[OTHER]:1}}});
  invalid.push({...valid,factoryProblemSolving:{...valid.factoryProblemSolving,episodes:[{...reasoningEpisode('invalid-score'),source:'studio'}]}});
  invalid.push({...valid,profiles:base([OTHER]).profiles,activeProfile:OTHER});
  for(const value of invalid)assert.throws(()=>validateFamilyRewardBackup(JSON.stringify(value),validateBase,rewards,pals));
  assert.equal(storage.data.size,0);assert.equal((await rewards.summary(OWNER)).lifetimeGems,0);
});

test('family restoration carries optional guide preferences without creating work or awarding progress',async()=>{
  const source=new StudioNotebook(new SourceMemory());source.dismissWelcome(OWNER);source.dismissGuideTip(OWNER,'waiting');
  const {storage,rewards,pals}=stores();
  const plan=validateFamilyRewardBackup(JSON.stringify({...base(),factoryStudio:source.read()}),validateBase,rewards,pals);
  await applyFamilyRewardBackup(plan,storage,rewards,'restore',pals);
  const restored=new StudioNotebook(storage);
  assert.deepEqual(restored.guidance(OWNER),{welcomeDismissed:true,dismissedTips:['waiting']});
  assert.deepEqual(restored.guidance(OTHER),{welcomeDismissed:false,dismissedTips:[]});
  assert.equal(hasMeaningfulCreation(restored.list(OWNER),OWNER),false,'dismissal is not a completed creation');
  assert.deepEqual(restored.read().sessions,[]);assert.deepEqual(restored.pendingRewards(OWNER),[]);
  assert.equal((await rewards.summary(OWNER)).lifetimeGems,0);
});

test('family restoration preserves notification acknowledgements and pending work without replay or rewards',async()=>{
  const source=new StudioNotebook(new SourceMemory()),project=source.create(OWNER,'new','My saved cat');
  source.update(project.id,OWNER,session=>{
    session.draft='Let the cat jump';
    session.pendingExperiment={parents:[],depth:'tune',origin:'child',baseId:null,prompt:'Let the cat jump'};
    session.job={id:'acknowledged-job',api:'https://builder.test',status:'building'};
  });
  const notification=deriveStudioNotifications(source.list(OWNER),OWNER)[0];
  source.dismissNotification(OWNER,notification);
  const saved=source.read(),{storage,rewards,pals}=stores();
  const plan=validateFamilyRewardBackup(JSON.stringify({...base(),factoryStudio:saved}),validateBase,rewards,pals);
  await applyFamilyRewardBackup(plan,storage,rewards,'restore',pals);
  const restored=new StudioNotebook(storage),row=deriveStudioNotifications(restored.list(OWNER),OWNER,{},restored.notificationPreferences(OWNER))[0];
  assert.deepEqual(restored.read(),saved);
  assert.equal(row.dismissed,true);assert.equal(row.pending,true);assert.equal(row.unread,false);
  assert.equal(restored.get(project.id,OWNER).job?.id,'acknowledged-job');
  assert.deepEqual(restored.notificationPreferences(OTHER),freshStudioNotificationPreferences());
  assert.equal((await rewards.summary(OWNER)).lifetimeGems,0);
});

test('backup rollback restores exact prior notification metadata and a legacy replacement remains optional',async()=>{
  const {storage,rewards,pals}=stores(),source=new StudioNotebook(storage),project=source.create(OWNER,'new','Unconfirmed cat');
  source.update(project.id,OWNER,session=>{
    session.draft='Let the cat jump';
    session.pendingExperiment={parents:[],depth:'tune',origin:'child',baseId:null,prompt:'Let the cat jump'};
  });
  source.acknowledgeNotifications(OWNER,deriveStudioNotifications(source.list(OWNER),OWNER));
  storage.data.set(STUDIO_KEY,' '+storage.getItem(STUDIO_KEY)+'\n');
  const raw=storage.getItem(STUDIO_KEY),before=source.read();
  const legacy={...base(),factoryStudio:{version:1,sessions:[],active:{}}};
  const plan=validateFamilyRewardBackup(JSON.stringify(legacy),validateBase,rewards,pals);
  assert.equal(Object.hasOwn(plan.notebook,'notifications'),false);
  storage.failKeys=[CREATION_KEY];
  await assert.rejects(applyFamilyRewardBackup(plan,storage,rewards,'restore',pals),/original progress was restored/);
  assert.equal(storage.getItem(STUDIO_KEY),raw);assert.deepEqual(new StudioNotebook(storage).read(),before);
  await recoverRewardBackupJournal(storage,rewards,pals);
  await applyFamilyRewardBackup(plan,storage,rewards,'restore',pals);
  const restored=new StudioNotebook(storage);
  assert.equal(Object.hasOwn(restored.read(),'notifications'),false);
  assert.deepEqual(restored.notificationPreferences(OWNER),freshStudioNotificationPreferences());
  assert.deepEqual(restored.list(OWNER),[]);
});

test('native remote sessions and remote copies restore without inventing a local project reference',()=>{
  const {storage,rewards,pals}=stores(),book=new StudioNotebook(storage),remote=book.create(OWNER,'new','Remote original');
  book.update(remote.id,OWNER,session=>{session.remoteId='remote-main-revision';});
  const remoteCopy=book.fork(remote.id,OWNER,'Remote copy',null,'remote-copy-revision');
  // Studio.copyGame passes a null local project id for a remote fork. Its
  // server project id is only transient provenance when opening a coding scene.
  assert.equal(remoteCopy.projectId,null);
  const remoteOnly=validateFamilyRewardBackup(JSON.stringify({...base(),factoryStudio:book.read()}),validateBase,rewards,pals);
  assert.equal(remoteOnly.notebook.sessions.length,2);assert.deepEqual(remoteOnly.workspace.projects,[]);
  const workspace=new RevisionStore(storage),local=workspace.create(OWNER,'buckets','Local original');
  const transitioned=book.create(OWNER,'buckets','Developed remotely',local.id);
  book.update(transitioned.id,OWNER,session=>{session.remoteId='remote-developed-revision';});
  const copy=book.fork(transitioned.id,OWNER,'Remote development copy',null,'remote-development-copy');
  assert.equal(copy.projectId,null);assert.equal(copy.rewardProjectId,local.id);
  const complete={...base(),factoryStudio:book.read(),factoryWorkspace:workspace.snapshot()};
  assert.equal(validateFamilyRewardBackup(JSON.stringify(complete),validateBase,rewards,pals).notebook.sessions.length,4);
  assert.throws(()=>validateFamilyRewardBackup(JSON.stringify({...complete,factoryWorkspace:{version:2,projects:[],revisions:[],plays:[]}}),validateBase,rewards,pals),/missing its matching saved workspace/,'the retained local origin must still have its actual saved workspace');
});

test('successful replacement commits all five sources and the ledger without projecting pending activity or scoring rewards',async()=>{
  const {storage,rewards,pals}=await existing(),plan=validateFamilyRewardBackup(JSON.stringify(await incoming()),validateBase,rewards,pals);
  await applyFamilyRewardBackup(plan,storage,rewards,'restore',pals);
  assert.deepEqual(JSON.parse(storage.getItem(FAMILY_STATE_KEY)!),plan.base);
  assert.deepEqual(JSON.parse(storage.getItem(WORKSPACE_KEY)!),plan.workspace);
  assert.deepEqual(JSON.parse(storage.getItem(STUDIO_KEY)!),plan.notebook);
  assert.deepEqual(new StudioNotebook(storage).guidance(OWNER),{welcomeDismissed:true,dismissedTips:['idea']});
  assert.deepEqual(JSON.parse(storage.getItem(CREATION_KEY)!),plan.creation);
  assert.deepEqual(JSON.parse(storage.getItem(PROBLEM_SOLVING_KEY)!),plan.problemSolving);
  assert.deepEqual(await pals.export(),plan.pals);
  assert.equal((await pals.view(OWNER)).activeId,'glim');
  assert.equal((await pals.view(OWNER)).preferences.encouragement,false);
  assert.equal((await rewards.summary(OWNER)).lifetimeGems,2,'the pending coding receipt is not silently projected during restore');
  assert.equal((await rewards.summary(OWNER)).practiceCount,1,'reasoning episodes and drafts do not mint rewards or practice bonuses');
  assert.equal((await rewards.summary(OTHER)).lifetimeGems,0);
  assert.equal(JSON.parse(storage.getItem(REWARD_BACKUP_JOURNAL_KEY)!).phase,'committed');
  await assert.rejects(applyFamilyRewardBackup(plan,storage,rewards,'restore',pals),/Finish recovering/);
  assert.equal(await recoverRewardBackupJournal(storage,rewards,pals),'cleaned');
  assert.equal(storage.getItem(REWARD_BACKUP_JOURNAL_KEY),null);
  assert.equal((await rewards.summary(OWNER)).lifetimeGems,2);
});

test('a source write failure rolls back exact prior source bytes, absent keys and prior ledger',async()=>{
  const {storage,rewards,pals,persistence,beforeSources,beforeLedger}=await existing(),plan=validateFamilyRewardBackup(JSON.stringify(await incoming()),validateBase,rewards,pals);
  storage.failKeys=[WORKSPACE_KEY];
  await assert.rejects(applyFamilyRewardBackup(plan,storage,rewards,'restore',pals),/original progress was restored/);
  assert.deepEqual(sources(storage),beforeSources);assert.deepEqual(await persistence.read(REWARDS_DB_NAME),beforeLedger);
  assert.equal(JSON.parse(storage.getItem(REWARD_BACKUP_JOURNAL_KEY)!).phase,'rolled-back');
  assert.equal(await recoverRewardBackupJournal(storage,rewards,pals),'cleaned');
});

test('a ledger transaction failure restores every source and preserves the original reward total',async()=>{
  const {storage,rewards,pals,persistence,beforeSources,beforeLedger}=await existing(),plan=validateFamilyRewardBackup(JSON.stringify(await incoming()),validateBase,rewards,pals);
  persistence.failUpdates=1;
  await assert.rejects(applyFamilyRewardBackup(plan,storage,rewards,'restore',pals),/original progress was restored/);
  assert.deepEqual(sources(storage),beforeSources);assert.deepEqual(await persistence.read(REWARDS_DB_NAME),beforeLedger);
  assert.equal((await rewards.summary(OTHER)).lifetimeGems,25);
});

test('an APS source write failure restores original bytes across all domains and the ledger',async()=>{
  const {storage,rewards,pals,persistence,beforeSources,beforeLedger}=await existing(),plan=validateFamilyRewardBackup(JSON.stringify(await incoming()),validateBase,rewards,pals);
  storage.failKeys=[PROBLEM_SOLVING_KEY];
  await assert.rejects(applyFamilyRewardBackup(plan,storage,rewards,'restore',pals),/original progress was restored.*problem-solving/);
  assert.deepEqual(sources(storage),beforeSources);assert.deepEqual(await persistence.read(REWARDS_DB_NAME),beforeLedger);
  assert.equal(await recoverRewardBackupJournal(storage,rewards,pals),'cleaned');
});

test('interruption after replacement but before commit rolls back once and requires a fresh document',async()=>{
  const {storage,rewards,pals,persistence,beforeSources,beforeLedger}=await existing(),plan=validateFamilyRewardBackup(JSON.stringify(await incoming()),validateBase,rewards,pals);
  await applyFamilyRewardBackup(plan,storage,rewards,'restore',pals);
  const journal=JSON.parse(storage.getItem(REWARD_BACKUP_JOURNAL_KEY)!);journal.phase='pending';storage.setItem(REWARD_BACKUP_JOURNAL_KEY,JSON.stringify(journal));
  assert.equal(await recoverRewardBackupJournal(storage,rewards,pals),'reload');
  assert.deepEqual(sources(storage),beforeSources);assert.deepEqual(await persistence.read(REWARDS_DB_NAME),beforeLedger);
  assert.equal(JSON.parse(storage.getItem(REWARD_BACKUP_JOURNAL_KEY)!).phase,'rolled-back','marker blocks stale in-memory stores before reload');
  assert.equal(await recoverRewardBackupJournal(storage,rewards,pals),'cleaned');
  assert.equal(await recoverRewardBackupJournal(storage,rewards,pals),'none');
  assert.deepEqual(await persistence.read(REWARDS_DB_NAME),beforeLedger);
});

test('a failed rollback keeps the original safety journal and a later startup can recover',async()=>{
  const {storage,rewards,pals,persistence,beforeSources,beforeLedger}=await existing(),plan=validateFamilyRewardBackup(JSON.stringify(await incoming()),validateBase,rewards,pals);
  storage.failKeys=[WORKSPACE_KEY,FAMILY_STATE_KEY];
  await assert.rejects(applyFamilyRewardBackup(plan,storage,rewards,'restore',pals),/recovery is still pending/);
  assert.equal(JSON.parse(storage.getItem(REWARD_BACKUP_JOURNAL_KEY)!).phase,'pending');
  assert.equal(await recoverRewardBackupJournal(storage,rewards,pals),'reload');
  assert.deepEqual(sources(storage),beforeSources);assert.deepEqual(await persistence.read(REWARDS_DB_NAME),beforeLedger);
});

test('legacy four-source pending journals recover only their captured keys without erasing APS history',async()=>{
  const {storage,rewards,pals,persistence,beforeSources,beforeLedger}=await existing(),plan=validateFamilyRewardBackup(JSON.stringify(await incoming()),validateBase,rewards,pals);
  await applyFamilyRewardBackup(plan,storage,rewards,'restore',pals);
  const journal=JSON.parse(storage.getItem(REWARD_BACKUP_JOURNAL_KEY)!);journal.phase='pending';delete journal.sources[PROBLEM_SOLVING_KEY];
  storage.setItem(REWARD_BACKUP_JOURNAL_KEY,JSON.stringify(journal));
  const retainedAPS=storage.getItem(PROBLEM_SOLVING_KEY);
  assert.equal(await recoverRewardBackupJournal(storage,rewards,pals),'reload');
  assert.deepEqual(sources(storage),{...beforeSources,[PROBLEM_SOLVING_KEY]:retainedAPS});
  assert.deepEqual(await persistence.read(REWARDS_DB_NAME),beforeLedger);
  assert.equal(new ProblemSolvingStore(storage).list(OWNER).length,1);
  assert.equal(await recoverRewardBackupJournal(storage,rewards,pals),'cleaned');
});

test('no room for a safety journal leaves every original source and reward unchanged',async()=>{
  const {storage,rewards,pals,persistence,beforeSources,beforeLedger}=await existing(),plan=validateFamilyRewardBackup(JSON.stringify(await incoming()),validateBase,rewards,pals);
  storage.failKeys=[REWARD_BACKUP_JOURNAL_KEY];
  await assert.rejects(applyFamilyRewardBackup(plan,storage,rewards,'restore',pals),/Nothing was replaced/);
  assert.deepEqual(sources(storage),beforeSources);assert.deepEqual(await persistence.read(REWARDS_DB_NAME),beforeLedger);assert.equal(storage.getItem(REWARD_BACKUP_JOURNAL_KEY),null);
});

test('journal validation cannot restore arbitrary source keys or a foreign rewards namespace',async()=>{
  const {storage,rewards,pals,persistence,beforeSources,beforeLedger}=await existing();
  const journal={schema:'jems.reward.backup.journal.v1',phase:'pending',operation:'restore',sources:beforeSources,rewards:await rewards.snapshotRawForRecovery()};
  for(const invalid of [{...journal,sources:{...beforeSources,'unrelated-setting':'overwrite'}},{...journal,rewards:{...journal.rewards,namespace:'other-family'}},{...journal,phase:'unsupported'}]){
    storage.setItem(REWARD_BACKUP_JOURNAL_KEY,JSON.stringify(invalid));await assert.rejects(recoverRewardBackupJournal(storage,rewards,pals),/unsupported/);
    assert.deepEqual(sources(storage),beforeSources);assert.deepEqual(await persistence.read(REWARDS_DB_NAME),beforeLedger);assert.equal(storage.getItem('unrelated-setting'),null);
  }
});

test('damaged JSON reward values survive rollback, while non-JSON IDB values fail before mutation',async()=>{
  const {storage,rewards,pals,persistence,beforeSources}=await existing(),plan=validateFamilyRewardBackup(JSON.stringify(await incoming()),validateBase,rewards,pals);
  const damaged={schema:'unknown',receipts:[{future:true}],nested:{preserve:'verbatim value'}};persistence.data.set(REWARDS_DB_NAME,damaged);
  storage.failKeys=[WORKSPACE_KEY];await assert.rejects(applyFamilyRewardBackup(plan,storage,rewards,'restore',pals),/original progress was restored/);
  assert.deepEqual(await persistence.read(REWARDS_DB_NAME),damaged);await recoverRewardBackupJournal(storage,rewards,pals);
  for(const unsupported of [new Uint8Array([1,2]),{missing:undefined},{when:new Date(TIME)},[Number.NaN],[-0]]){
    persistence.data.set(REWARDS_DB_NAME,unsupported);
    await assert.rejects(applyFamilyRewardBackup(plan,storage,rewards,'restore',pals),/safely|recovery/);
    assert.deepEqual(sources(storage),beforeSources);assert.deepEqual(await persistence.read(REWARDS_DB_NAME),unsupported);assert.equal(storage.getItem(REWARD_BACKUP_JOURNAL_KEY),null);
  }
  const cyclic:any={};cyclic.self=cyclic;assert.throws(()=>assertLosslessRewardJSON(cyclic),/safely/);
});

test('a legacy restore or explicit reset empties missing domains and their unacknowledged outboxes',async()=>{
  for(const operation of ['restore','reset'] as const){
    const {storage,rewards,pals}=stores(),complete=validateFamilyRewardBackup(JSON.stringify(await incoming()),validateBase,rewards,pals);
    await applyFamilyRewardBackup(complete,storage,rewards,'restore',pals);await recoverRewardBackupJournal(storage,rewards,pals);
    const legacy=validateFamilyRewardBackup(JSON.stringify(base()),validateBase,rewards,pals);await applyFamilyRewardBackup(legacy,storage,rewards,operation,pals);
    assert.deepEqual(new StudioNotebook(storage).pendingRewards(OWNER),[]);assert.deepEqual(new CreationStore(storage).pendingRewards(OWNER),[]);
    assert.equal(new RevisionStore(storage).list(OWNER).length,0);assert.equal((await rewards.summary(OWNER)).lifetimeGems,0);
    assert.deepEqual(new ProblemSolvingStore(storage).export(),emptyProblemSolvingWorkspace());
    assert.equal((await pals.view(OWNER)).starterId,null);
    assert.equal(JSON.parse(storage.getItem(REWARD_BACKUP_JOURNAL_KEY)!).operation,operation);
  }
});

test('coordinated restore invalidates an open reasoning view after replacement without generating source events',async()=>{
  const priorWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),bus=new EventTarget(),events:string[]=[];
  for(const name of ['factory-problem-solving-reset','factory-problem-solving-updated'])bus.addEventListener(name,()=>events.push(name));
  Object.defineProperty(globalThis,'window',{configurable:true,value:{dispatchEvent:bus.dispatchEvent.bind(bus)}});
  try{
    const {storage,rewards,pals}=stores(),plan=validateFamilyRewardBackup(JSON.stringify(await incoming()),validateBase,rewards,pals);
    await applyFamilyRewardBackup(plan,storage,rewards,'restore',pals);
    assert.deepEqual(events,['factory-problem-solving-reset','factory-problem-solving-updated']);
    assert.deepEqual(new ProblemSolvingStore(storage).export(),plan.problemSolving);
  }finally{if(priorWindow)Object.defineProperty(globalThis,'window',priorWindow);else delete (globalThis as any).window;}
});

test('maintenance pauses a late workspace write before changing its cached draft or persisted source',()=>{
  const {storage}=stores(),workspace=new RevisionStore(storage),project=workspace.create(OWNER,'buckets','Before restore'),prior=workspace.snapshot(),raw=storage.getItem(WORKSPACE_KEY);
  setRewardSourceMaintenance(true);
  try{assert.throws(()=>workspace.keep(project.id,OWNER),/restoring saved progress/);assert.deepEqual(workspace.snapshot(),prior);assert.equal(storage.getItem(WORKSPACE_KEY),raw);}
  finally{setRewardSourceMaintenance(false);}
});

test('complete indexed restore journals only changed legacy sources and retains large originals byte-for-byte',async()=>{
 const {storage,rewards,pals}=stores(),value=await incoming(),plan=validateFamilyRewardBackup(JSON.stringify(value),validateBase,rewards,pals),kept=[WORKSPACE_KEY,STUDIO_KEY,CREATION_KEY];
 for(const key of kept)storage.setItem(key,' original indexed migration source '+key+'x'.repeat(1_900_000));
 const before=Object.fromEntries(kept.map(key=>[key,storage.getItem(key)]));
 const originalSet=storage.setItem.bind(storage);storage.setItem=(key,raw)=>{if(raw.length>1_000_000)throw Error('quota');originalSet(key,raw);};
 await applyFamilyRewardBackup(plan,storage,rewards,'restore',pals,'family',()=>{},kept);
 const journal=JSON.parse(storage.getItem(REWARD_BACKUP_JOURNAL_KEY)!);assert.deepEqual(journal.preservedIndexed,kept);for(const key of kept){assert.equal(Object.hasOwn(journal.sources,key),false);assert.equal(storage.getItem(key),before[key]);}
 assert.equal(await recoverRewardBackupJournal(storage,rewards,pals),'cleaned');for(const key of kept)assert.equal(storage.getItem(key),before[key]);
 // An interruption restores only the protected mutable keys. Retained indexed
 // sources never become a journal-owned deletion or replacement target.
 await applyFamilyRewardBackup(plan,storage,rewards,'restore',pals,'family',()=>{},kept);const pending=JSON.parse(storage.getItem(REWARD_BACKUP_JOURNAL_KEY)!);pending.phase='pending';originalSet(REWARD_BACKUP_JOURNAL_KEY,JSON.stringify(pending));
 assert.equal(await recoverRewardBackupJournal(storage,rewards,pals),'reload');for(const key of kept)assert.equal(storage.getItem(key),before[key]);
 const malformed={...pending,preservedIndexed:[FAMILY_STATE_KEY]};originalSet(REWARD_BACKUP_JOURNAL_KEY,JSON.stringify(malformed));await assert.rejects(recoverRewardBackupJournal(storage,rewards,pals),/indexed recovery journal/);
});

test('recovery leaves identical source strings in place instead of widening or rewriting them',async()=>{
 const {storage,rewards,pals}=stores(),plan=validateFamilyRewardBackup(JSON.stringify(await incoming()),validateBase,rewards,pals);
 const expected={[FAMILY_STATE_KEY]:JSON.stringify(plan.base),[WORKSPACE_KEY]:JSON.stringify(plan.workspace),[STUDIO_KEY]:JSON.stringify(plan.notebook),[CREATION_KEY]:JSON.stringify(plan.creation),[PROBLEM_SOLVING_KEY]:JSON.stringify(plan.problemSolving)};
 for(const [key,value]of Object.entries(expected))storage.setItem(key,value);
 const write=storage.setItem.bind(storage);storage.setItem=(key,value)=>{if(REWARD_SOURCE_KEYS.includes(key as any))throw Error('An identical source was unnecessarily rewritten');write(key,value);};
 await applyFamilyRewardBackup(plan,storage,rewards,'restore',pals);assert.equal(JSON.parse(storage.getItem(REWARD_BACKUP_JOURNAL_KEY)!).phase,'committed');assert.deepEqual(sources(storage),expected);
});

test('a native quota retry preserves every Latin-1 code unit and keeps its original journal intact',async()=>{
 const {storage,rewards,pals}=await existing(),value=await incoming();value.factoryStudio.sessions[0].messages=[{id:'latin-1',role:'child',text:'Caf\u00e9 \u0080 \u00ff '+ 'x'.repeat(2000),at:new Date(TIME).toISOString()}];
 const plan=validateFamilyRewardBackup(JSON.stringify(value),validateBase,rewards,pals),expected=JSON.stringify(plan.notebook),old=storage.getItem(STUDIO_KEY),write=storage.setItem.bind(storage);let attempts=0;
 storage.setItem=(key,raw)=>{if(key===STUDIO_KEY&&raw===expected){attempts++;const journal=JSON.parse(storage.getItem(REWARD_BACKUP_JOURNAL_KEY)!);assert.equal(journal.phase,'pending');assert.equal(journal.sources[STUDIO_KEY],old);assert.equal(storage.getItem(STUDIO_KEY),old);if(attempts===1)throw new DOMException('Synthetic backing-width quota','QuotaExceededError');}write(key,raw);};
 await applyFamilyRewardBackup(plan,storage,rewards,'restore',pals);assert.equal(attempts,2);assert.equal(storage.getItem(STUDIO_KEY),expected);assert.equal(JSON.parse(storage.getItem(REWARD_BACKUP_JOURNAL_KEY)!).phase,'committed');
});

test('permanent quota and genuinely wide source text fail safely without looping or changing original bytes',async()=>{
 for(const wide of [false,true]){
  const {storage,rewards,pals,beforeSources,beforeLedger,persistence}=await existing(),value=await incoming();if(wide)value.factoryStudio.sessions[0].messages=[{id:'wide',role:'child',text:'Original \ud83e\ude81 and \ud800 preserved',at:new Date(TIME).toISOString()}];
  const plan=validateFamilyRewardBackup(JSON.stringify(value),validateBase,rewards,pals),expected=JSON.stringify(plan.notebook),write=storage.setItem.bind(storage);let attempts=0;
  storage.setItem=(key,raw)=>{if(key===STUDIO_KEY&&raw===expected){attempts++;throw new DOMException('Synthetic full store','QuotaExceededError');}write(key,raw);};
  await assert.rejects(applyFamilyRewardBackup(plan,storage,rewards,'restore',pals),/original progress was restored/);assert.equal(attempts,wide?1:2);assert.deepEqual(sources(storage),beforeSources);assert.deepEqual(await persistence.read(REWARDS_DB_NAME),beforeLedger);assert.equal(JSON.parse(storage.getItem(REWARD_BACKUP_JOURNAL_KEY)!).phase,'rolled-back');
 }
});

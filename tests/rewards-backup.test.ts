/** A family import/reset must replace its sources and receipt ledger together. */
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { RevisionStore, WORKSPACE_KEY } from '../src/factory/workspace';
import { StudioNotebook, STUDIO_KEY } from '../src/studio/notebook';
import { CreationStore, CREATION_KEY } from '../src/creation/storage';
import { createChallengeStarter } from '../src/creation/challenges';
import { createRewardFact } from '../src/rewards/model';
import { REWARDS_DB_NAME, RewardsStore, type RewardsPersistence, type RewardsTransaction } from '../src/rewards/store';
import { PALS_DB_NAME, PalsStore, type PalsPersistence } from '../src/pals/store';
import { applyFamilyRewardBackup, assertLosslessRewardJSON, FAMILY_STATE_KEY, REWARD_BACKUP_JOURNAL_KEY, REWARD_SOURCE_KEYS, recoverRewardBackupJournal, validateFamilyRewardBackup } from '../src/rewards/backup';
import { setRewardSourceMaintenance } from '../src/rewards/write-guard';

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
async function incoming(owner=OWNER){
  const {storage,rewards}=stores(),workspace=new RevisionStore(storage),notebook=new StudioNotebook(storage),creation=new CreationStore(storage);
  const project=workspace.create(owner,'buckets','Saved game');notebook.create(owner,'buckets','Saved game',project.id);
  const scene=creation.create(owner,createChallengeStarter('robot-route'),{challengeId:'robot-route'});
  creation.recordAttempt(scene.id,owner,scene.headId,{challengeId:'robot-route',passed:true,hintUsed:true});
  await rewards.project(owner,[createRewardFact({owner,kind:'math.completed',sourceId:'saved-answer',occurredAt:TIME})]);
  return {...base([owner]),factoryWorkspace:workspace.snapshot(),factoryStudio:notebook.read(),factoryCreation:creation.read(),factoryRewards:await rewards.export()};
}
async function existing(){
  const result=stores();
  // Raw source strings are intentionally not normalized by the rollback path.
  result.storage.setItem(FAMILY_STATE_KEY,' {"original":"profile bytes"} ');
  result.storage.setItem(WORKSPACE_KEY,'a damaged workspace preserved verbatim');
  result.storage.setItem(STUDIO_KEY,'{"original":"notebook"}');
  await result.rewards.project(OTHER,[createRewardFact({owner:OTHER,kind:'game.developed',sourceId:'original-game',occurredAt:TIME})]);
  return {...result,beforeSources:sources(result.storage),beforeLedger:await result.persistence.read(REWARDS_DB_NAME)};
}

test('whole-family prevalidation uses the real base validator and strips duplicate domain envelopes',async()=>{
  const {rewards,pals}=stores(),value=await incoming(),plan=validateFamilyRewardBackup(JSON.stringify(value),validateBase,rewards,pals);
  assert.deepEqual(plan.owners,[OWNER]);assert.equal(plan.creation.rewardOutbox?.length,1);
  assert.equal(plan.rewards.data.profiles[0].receipts.length,1);
  for(const field of ['factoryWorkspace','factoryStudio','factoryCreation','factoryRewards'])assert.equal(Object.hasOwn(plan.base,field),false);
  assert.equal(value.factoryStudio.sessions.length,1,'validation does not mutate its caller');
  const legacy=validateFamilyRewardBackup(JSON.stringify(base()),validateBase,rewards,pals);
  assert.deepEqual(legacy.workspace.projects,[]);assert.deepEqual(legacy.notebook.sessions,[]);assert.deepEqual(legacy.creation.projects,[]);assert.deepEqual(legacy.rewards.data.profiles,[]);
});

test('invalid family ownership, linked games, namespace and recovery-only files are rejected before any write',async()=>{
  const {storage,rewards,pals}=stores(),valid=await incoming();
  const invalid:(typeof valid|Record<string,unknown>)[]=[];
  invalid.push({...valid,profiles:[valid.profiles[0],valid.profiles[0]]});
  invalid.push({...valid,activeProfile:OTHER});
  invalid.push({...valid,factoryWorkspace:{version:2,projects:[],revisions:[],plays:[]}});
  invalid.push({...valid,factoryStudio:{...valid.factoryStudio,avatars:{[OTHER]:'spark'}}});
  invalid.push({...valid,factoryRewards:{...valid.factoryRewards,namespace:'foreign-workspace'}});
  invalid.push({...valid,factoryRewardsRecovery:{namespace:REWARDS_DB_NAME,raw:{damaged:true}}});
  invalid.push({...valid,profiles:base([OTHER]).profiles,activeProfile:OTHER});
  for(const value of invalid)assert.throws(()=>validateFamilyRewardBackup(JSON.stringify(value),validateBase,rewards,pals));
  assert.equal(storage.data.size,0);assert.equal((await rewards.summary(OWNER)).lifetimeGems,0);
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

test('successful replacement commits all four sources and the ledger without projecting pending activity',async()=>{
  const {storage,rewards,pals}=await existing(),plan=validateFamilyRewardBackup(JSON.stringify(await incoming()),validateBase,rewards,pals);
  await applyFamilyRewardBackup(plan,storage,rewards,'restore',pals);
  assert.deepEqual(JSON.parse(storage.getItem(FAMILY_STATE_KEY)!),plan.base);
  assert.deepEqual(JSON.parse(storage.getItem(WORKSPACE_KEY)!),plan.workspace);
  assert.deepEqual(JSON.parse(storage.getItem(STUDIO_KEY)!),plan.notebook);
  assert.deepEqual(JSON.parse(storage.getItem(CREATION_KEY)!),plan.creation);
  assert.equal((await rewards.summary(OWNER)).lifetimeGems,2,'the pending coding receipt is not silently projected during restore');
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
    assert.equal(JSON.parse(storage.getItem(REWARD_BACKUP_JOURNAL_KEY)!).operation,operation);
  }
});

test('maintenance pauses a late workspace write before changing its cached draft or persisted source',()=>{
  const {storage}=stores(),workspace=new RevisionStore(storage),project=workspace.create(OWNER,'buckets','Before restore'),prior=workspace.snapshot(),raw=storage.getItem(WORKSPACE_KEY);
  setRewardSourceMaintenance(true);
  try{assert.throws(()=>workspace.keep(project.id,OWNER),/restoring saved progress/);assert.deepEqual(workspace.snapshot(),prior);assert.equal(storage.getItem(WORKSPACE_KEY),raw);}
  finally{setRewardSourceMaintenance(false);}
});

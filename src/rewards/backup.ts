import {installCompleteRecovery} from '../storage/complete-backup';
import {installPrivateCopyControls} from '../storage/private-copy-ui';
import {LOCAL_JOURNAL_KEY} from '../storage/local-journal';
import { adultStorageKey, adultWorkspaceId } from '../adult-pilot/storage';
import { migrateWorkspace, WORKSPACE_KEY, type Workspace } from '../factory/workspace';
import { validateNotebook, STUDIO_KEY, type Notebook } from '../studio/notebook';
import { validateCreationWorkspace, CREATION_KEY, type CreationWorkspace } from '../creation/storage';
import { emptyProblemSolvingWorkspace, validateProblemSolvingWorkspace, PROBLEM_SOLVING_KEY, type ProblemSolvingWorkspace } from '../problem-solving/model';
import { emptyRewardsWorkspace, isRewardOwner, type RewardsBackup } from './model';
import { REWARDS_DB_NAME, RewardsStore, type RewardsRawSnapshot } from './store';
import type { RewardsController } from './service';
import { emptyPalsWorkspace, type PalsBackup } from '../pals/model';
import { PALS_DB_NAME, PalsStore, type PalsRawSnapshot } from '../pals/store';
import { withPalsMaintenance } from '../pals/service';

export const REWARD_BACKUP_JOURNAL_KEY='family-game-factory-reward-backup-journal-v1';
export const FAMILY_STATE_KEY='family-game-factory-state-v1';
const LEGACY_REWARD_SOURCE_KEYS=[FAMILY_STATE_KEY,WORKSPACE_KEY,STUDIO_KEY,CREATION_KEY] as const;
export const REWARD_SOURCE_KEYS=[...LEGACY_REWARD_SOURCE_KEYS,PROBLEM_SOLVING_KEY] as const;
// Previously saved four-source journals did not capture APS. Recover only the
// keys they actually protected; absence here must not erase a newer APS store.
export type RewardSourceSnapshot=Record<typeof LEGACY_REWARD_SOURCE_KEYS[number],string|null>&Partial<Record<typeof PROBLEM_SOLVING_KEY,string|null>>;
export interface BackupStorage {getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void}
type FamilyBase=Record<string,unknown>&{profiles:{id:string}[];activeProfile:string};
export interface PreparedFamilyRewardBackup {
  base:FamilyBase;workspace:Workspace;notebook:Notebook;creation:CreationWorkspace;problemSolving:ProblemSolvingWorkspace;rewards:RewardsBackup;pals:PalsBackup;owners:string[];
}
interface BackupJournal {
  schema:'jems.reward.backup.journal.v1';phase:'pending'|'committed'|'rolled-back';operation:'restore'|'reset';
  sources:RewardSourceSnapshot;rewards:RewardsRawSnapshot;pals?:PalsRawSnapshot;
}
const own=(value:object,key:string)=>Object.prototype.hasOwnProperty.call(value,key);
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const emptyWorkspace=():Workspace=>({version:2,projects:[],revisions:[],plays:[]});
const emptyNotebook=():Notebook=>({version:1,sessions:[],active:{}});
const emptyCreation=():CreationWorkspace=>({schema:'jems.creation.workspace.v1',projects:[],revisions:[],drafts:[],attempts:[]});
const recoveryFields=['factoryStateRecoveryRaw','factoryWorkspaceRecoveryRaw','factoryStudioRecoveryRaw','factoryCreationRecoveryRaw','factoryProblemSolvingRecoveryRaw','factoryRewardsRecovery','factoryPalsRecovery'];

/** The journal must preserve the prior bytes/value. Reject unsupported structured
 * clone values before mutation instead of silently flattening damaged IDB data. */
export function assertLosslessRewardJSON(value:unknown,seen=new Set<object>()):void {
  if(value===null||typeof value==='string'||typeof value==='boolean')return;
  if(typeof value==='number'&&Number.isFinite(value)&&!Object.is(value,-0))return;
  if(typeof value!=='object'||seen.has(value))throw Error('This saved progress value cannot be preserved safely in a JSON backup. Existing data has not been changed.');
  seen.add(value);
  if(Array.isArray(value)){
    if(Object.keys(value).length!==value.length||Object.getOwnPropertySymbols(value).length)throw Error('This saved progress value needs recovery before a safe backup can replace it.');
    for(let index=0;index<value.length;index++){if(!own(value,String(index)))throw Error('This saved progress value needs recovery.');assertLosslessRewardJSON(value[index],seen);}
    return;
  }
  if(Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==Object.keys(value).length)throw Error('This saved progress value needs recovery before a safe backup can replace it.');
  for(const entry of Object.values(value))assertLosslessRewardJSON(entry,seen);
}

export function validateFamilyRewardBackup(raw:string,validateBase:(raw:string)=>unknown,store:RewardsStore,palStore=new PalsStore(PALS_DB_NAME),audience='family'):PreparedFamilyRewardBackup {
  if(raw.length>20_000_000)throw Error('That backup is too large.');
  const input=JSON.parse(raw);
  if(object(input)&&own(input,'factoryCreationRecoveryRaw'))throw Error('This file preserves damaged scene data for recovery. Restore a compatible complete family backup instead.');
  if(object(input)&&own(input,'factoryProblemSolvingRecoveryRaw'))throw Error('This file preserves damaged problem-solving data for recovery. Restore a compatible complete family backup instead.');
  if(!object(input)||recoveryFields.some(field=>own(input,field)))throw Error('This file preserves damaged data for recovery. Restore a compatible complete family backup instead.');
  const base=validateBase(raw) as FamilyBase;
  if(!object(base)||!Array.isArray(base.profiles)||!base.profiles.every(profile=>object(profile)&&isRewardOwner(profile.id)&&(audience==='family'?!profile.id.startsWith('adult:'):profile.id===audience)))throw Error('Choose a family backup with valid player profiles.');
  // Legacy validation normalizes the base while retaining extension fields.
  // Each domain has its own durable key; never store a second stale outbox copy.
  for(const field of ['factoryWorkspace','factoryStudio','factoryCreation','factoryProblemSolving','factoryRewards','factoryPals',...recoveryFields])delete base[field];
  const owners=base.profiles.map(profile=>profile.id),allowed=new Set(owners);
  if(owners.length<1||owners.length>6||allowed.size!==owners.length||!allowed.has(base.activeProfile))throw Error('The backup has duplicate players or an unknown active player.');
  const workspace=own(input,'factoryWorkspace')?migrateWorkspace(input.factoryWorkspace):emptyWorkspace();
  const notebook=own(input,'factoryStudio')?validateNotebook(input.factoryStudio):emptyNotebook();
  const creation=own(input,'factoryCreation')?validateCreationWorkspace(input.factoryCreation):emptyCreation();
  const problemSolving=own(input,'factoryProblemSolving')?validateProblemSolvingWorkspace(input.factoryProblemSolving):emptyProblemSolvingWorkspace();
  if(workspace.projects.some(project=>!allowed.has(project.owner))||notebook.sessions.some(session=>!allowed.has(session.owner))||
    Object.keys(notebook.active).some(owner=>!allowed.has(owner))||Object.keys(notebook.avatars??{}).some(owner=>!allowed.has(owner))||
    Object.keys(notebook.guidance??{}).some(owner=>!allowed.has(owner))||Object.keys(notebook.notifications??{}).some(owner=>!allowed.has(owner))||creation.projects.some(project=>!allowed.has(project.owner))||
    problemSolving.episodes.some(episode=>!allowed.has(episode.owner))||problemSolving.drafts.some(draft=>!allowed.has(draft.episode.owner))||Object.keys(problemSolving.discardedByOwner).some(owner=>!allowed.has(owner)))throw Error('This backup contains saved work belonging to a player outside this family.');
  for(const session of notebook.sessions){
    if(session.projectId&&!workspace.projects.some(project=>project.id===session.projectId&&project.owner===session.owner))throw Error('A Studio game is missing its matching saved workspace.');
  }
  for(const revision of workspace.revisions){
    if(!revision.sourceRevisionId)continue;
    const source=workspace.revisions.find(candidate=>candidate.id===revision.sourceRevisionId)!;
    if(workspace.projects.find(project=>project.id===revision.projectId)!.owner!==workspace.projects.find(project=>project.id===source.projectId)!.owner)throw Error('A copied game crosses player boundaries.');
  }
  const rewards=store.validateBackup(own(input,'factoryRewards')?input.factoryRewards:{schema:'jems.rewards.backup.v1',namespace:store.namespace,data:emptyRewardsWorkspace()},owners);
  const pals=palStore.validateBackup(own(input,'factoryPals')?input.factoryPals:{schema:'jems.pals.backup.v1',namespace:palStore.namespace,data:emptyPalsWorkspace()},owners);
  if(store.namespace!==adultStorageKey(REWARDS_DB_NAME,audience==='family'?null:audience)||palStore.namespace!==adultStorageKey(PALS_DB_NAME,audience==='family'?null:audience)||audience!=='family'&&(owners.length!==1||owners[0]!==audience))throw Error('Recovery belongs to another workspace.');
  return {base,workspace,notebook,creation,problemSolving,rewards,pals,owners};
}

function snapshotSources(storage:BackupStorage):RewardSourceSnapshot {
  return Object.fromEntries(REWARD_SOURCE_KEYS.map(key=>[key,storage.getItem(key)])) as RewardSourceSnapshot;
}
function restoreSources(storage:BackupStorage,snapshot:RewardSourceSnapshot):void {
  // Remove the failed replacement first so quota pressure cannot prevent the
  // original values (which already fit alongside the journal) from returning.
  const captured=REWARD_SOURCE_KEYS.filter(key=>own(snapshot,key));
  for(const key of captured)storage.removeItem(key);
  for(const key of captured)if(snapshot[key]!==null)storage.setItem(key,snapshot[key]!);
}
function readJournal(storage:BackupStorage,rewardsNamespace=REWARDS_DB_NAME,palsNamespace=PALS_DB_NAME):BackupJournal|null {
  const raw=storage.getItem(REWARD_BACKUP_JOURNAL_KEY);if(raw===null)return null;
  if(raw.length>40_000_000)throw Error('The backup recovery journal needs manual recovery. Saved data has not been overwritten.');
  let value:unknown;try{value=JSON.parse(raw);}catch{throw Error('The backup recovery journal is damaged. Saved data has not been overwritten.');}
  if(!object(value)||Object.keys(value).some(key=>!['schema','phase','operation','sources','rewards','pals'].includes(key))||value.schema!=='jems.reward.backup.journal.v1'||
    !['pending','committed','rolled-back'].includes(String(value.phase))||!['restore','reset'].includes(String(value.operation)))throw Error('The backup recovery journal is unsupported. Existing saved work remains protected.');
  const sources=value.sources,rewards=value.rewards;
  if(!object(sources)||Object.keys(sources).some(key=>!(REWARD_SOURCE_KEYS as readonly string[]).includes(key))||
    LEGACY_REWARD_SOURCE_KEYS.some(key=>!own(sources,key))||Object.values(sources).some(value=>value!==null&&typeof value!=='string')||
    !object(rewards)||Object.keys(rewards).some(key=>!['namespace','raw'].includes(key))||rewards.namespace!==rewardsNamespace||!own(rewards,'raw'))throw Error('The backup recovery journal is unsupported. Existing saved work remains protected.');
  assertLosslessRewardJSON(rewards.raw);
  if(own(value,'pals')){
    const pals=value.pals;
    if(!object(pals)||Object.keys(pals).some(key=>!['namespace','raw'].includes(key))||pals.namespace!==palsNamespace||!own(pals,'raw'))throw Error('The companion recovery journal is unsupported. Existing saved work remains protected.');
    assertLosslessRewardJSON(pals.raw);
  }
  return value as unknown as BackupJournal;
}
function writeJournal(storage:BackupStorage,journal:BackupJournal):void {storage.setItem(REWARD_BACKUP_JOURNAL_KEY,JSON.stringify(journal));}
function invalidateProblemSolvingView():void {
  // Stores are replaced directly while source writes are paused. Discard an
  // open practice's stale in-memory draft before the coordinator reloads.
  if(typeof window==='undefined')return;
  window.dispatchEvent(new CustomEvent('factory-problem-solving-reset'));
  window.dispatchEvent(new CustomEvent('factory-problem-solving-updated'));
}

/** Host maintenance owns the source-write pause. Nothing is projected here. */
export async function applyFamilyRewardBackup(plan:PreparedFamilyRewardBackup,storage:BackupStorage,store:RewardsStore,operation:'restore'|'reset'='restore',palStore=new PalsStore(PALS_DB_NAME),audience='family',assertAuthorized:()=>void=()=>{}):Promise<void> {
  assertAuthorized();
  if(storage.getItem(LOCAL_JOURNAL_KEY)!==null)throw Error('Recover the interrupted game save before replacing progress.');
  if(storage.getItem(REWARD_BACKUP_JOURNAL_KEY)!==null)throw Error('Finish recovering the previous backup before replacing saved work.');
  if(store.namespace!==adultStorageKey(REWARDS_DB_NAME,audience==='family'?null:audience)||palStore.namespace!==adultStorageKey(PALS_DB_NAME,audience==='family'?null:audience))throw Error('Backups cannot replace another workspace.');
  const rewards=await store.snapshotRawForRecovery();assertLosslessRewardJSON(rewards.raw);
  const pals=await palStore.snapshotRawForRecovery();assertLosslessRewardJSON(pals.raw);
  const journal:BackupJournal={schema:'jems.reward.backup.journal.v1',phase:'pending',operation,sources:snapshotSources(storage),rewards,pals};
  // If this safety copy cannot fit, fail before changing any source or ledger.
  try{writeJournal(storage,journal);}catch{throw Error('A safety copy could not be saved. Export your current progress before freeing browser space. Nothing was replaced.');}
  try{
    storage.setItem(FAMILY_STATE_KEY,JSON.stringify(plan.base));
    storage.setItem(WORKSPACE_KEY,JSON.stringify(plan.workspace));
    storage.setItem(STUDIO_KEY,JSON.stringify(plan.notebook));
    try{storage.setItem(CREATION_KEY,JSON.stringify(plan.creation));}
    catch{throw Error('Could not save this creation on this device. Your previous scene data remains protected by the backup safety copy.');}
    try{storage.setItem(PROBLEM_SOLVING_KEY,JSON.stringify(plan.problemSolving));}
    catch{throw Error('Could not save these problem-solving observations. Your previous observations remain protected by the backup safety copy.');}
    assertAuthorized();await store.restore(plan.rewards,{mode:'replace',allowedOwners:plan.owners});
    assertAuthorized();await palStore.restore(plan.pals,{mode:'replace',allowedOwners:plan.owners});
    assertAuthorized();writeJournal(storage,{...journal,phase:'committed'});
  }catch(error){
    try{await store.restoreRawRecovery(journal.rewards);await palStore.restoreRawRecovery(pals);restoreSources(storage,journal.sources);writeJournal(storage,{...journal,phase:'rolled-back'});}
    catch{throw Error('The backup could not finish and recovery is still pending. Reload Jems to restore the protected original progress.');}
    throw Error('The backup could not be saved. Your original progress was restored. '+(error instanceof Error?error.message:''));
  }finally{
    // View notifications do not participate in the saved transaction.
    try{invalidateProblemSolvingView();}catch{}
  }
}

/** Testable recovery primitive. A rollback requires a reload because legacy
 * stores may have read a partial replacement before the entrypoint acquired its lock. */
export async function recoverRewardBackupJournal(storage:BackupStorage,store:RewardsStore,palStore=new PalsStore(PALS_DB_NAME)):Promise<'none'|'cleaned'|'reload'> {
  const journal=readJournal(storage,store.namespace,palStore.namespace);if(!journal)return 'none';
  if(journal.phase==='committed'||journal.phase==='rolled-back'){storage.removeItem(REWARD_BACKUP_JOURNAL_KEY);return 'cleaned';}
  await store.restoreRawRecovery(journal.rewards);
  // Old journals predate Pals; recovering them must leave the collection alone.
  if(journal.pals)await palStore.restoreRawRecovery(journal.pals);
  restoreSources(storage,journal.sources);
  writeJournal(storage,{...journal,phase:'rolled-back'});return 'reload';
}
export function hasPendingRewardBackup():boolean {try{return localStorage.getItem(adultStorageKey(REWARD_BACKUP_JOURNAL_KEY))!==null;}catch{return true;}}
export async function recoverRewardBackup():Promise<void> {
  const outcome=await recoverRewardBackupJournal(localStorage,new RewardsStore(REWARDS_DB_NAME));
  if(outcome==='reload')location.reload();
}

function download(value:unknown):void {
  const raw=JSON.stringify(value,null,2),blob=new Blob([raw],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=adultWorkspaceId()?'jems-adult-progress.json':'family-game-factory-progress.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function sourceForExport(storage:BackupStorage,key:string,validate:(value:unknown)=>unknown,fallback:unknown):{value?:unknown;recovery?:string} {
  const raw=storage.getItem(key);if(raw===null)return {value:fallback};
  try{return {value:validate(JSON.parse(raw))};}catch{return {recovery:raw};}
}
/** Capture under the shared reward/Pal maintenance queues. Never reads another adult namespace. */
export async function captureFamilyRewardPayload(FG:any,store:RewardsStore,palStore:PalsStore):Promise<Record<string,unknown>> {
        const adult=adultWorkspaceId(),sources:BackupStorage={getItem:key=>localStorage.getItem(adultStorageKey(key,adult)),setItem(){throw Error('Export is read only.');},removeItem(){throw Error('Export is read only.');}};
        const baseRaw=sources.getItem(FAMILY_STATE_KEY);let payload:Record<string,unknown>;
        try{payload=baseRaw===null?structuredClone(FG.store.data):JSON.parse(baseRaw);if(!object(payload))throw Error('Invalid saved profiles.');if(FG.store.loadError)throw Error('Saved profiles need recovery.');}
        catch{payload={schema:'jems.family.recovery.v1',factoryStateRecoveryRaw:baseRaw??FG.store.recoveryRaw};}
        for(const [key,field,recoveryField,validator,fallback] of [
          [WORKSPACE_KEY,'factoryWorkspace','factoryWorkspaceRecoveryRaw',migrateWorkspace,emptyWorkspace()],
          [STUDIO_KEY,'factoryStudio','factoryStudioRecoveryRaw',validateNotebook,emptyNotebook()],
          [CREATION_KEY,'factoryCreation','factoryCreationRecoveryRaw',validateCreationWorkspace,emptyCreation()],
          [PROBLEM_SOLVING_KEY,'factoryProblemSolving','factoryProblemSolvingRecoveryRaw',validateProblemSolvingWorkspace,emptyProblemSolvingWorkspace()],
        ] as const){const result=sourceForExport(sources,key,validator,fallback);payload[own(result,'recovery')?recoveryField:field]=result.recovery??result.value;}
        const recovery=await store.recovery();
        if(recovery){assertLosslessRewardJSON(recovery.raw);payload.factoryRewardsRecovery=recovery;}
        else payload.factoryRewards=await store.export();
        const palsRecovery=await palStore.recovery();
        if(palsRecovery){assertLosslessRewardJSON(palsRecovery.raw);payload.factoryPalsRecovery=palsRecovery;}
        else payload.factoryPals=await palStore.export();
  return payload;
}

export function installRewardBackupControls(rewards:RewardsController):void {
  const FG=(window as any).FG,exportButton=document.getElementById('exportData'),importInput=document.getElementById('importData') as HTMLInputElement|null;
  if(!exportButton||!importInput||exportButton.dataset.rewardBackups==='true')return;
  exportButton.dataset.rewardBackups='true';
  installCompleteRecovery(rewards);
  installPrivateCopyControls();
  const flush=()=>{if(!FG.store.loadError){FG.studio?.flushDraft?.();FG.creation?.flush?.();}};
  const fail=(error:unknown)=>{
    const message=error instanceof Error?error.message:'The backup could not be saved.',status=document.getElementById('studioGlobalStatus'),reloading=hasPendingRewardBackup();
    if(status){status.textContent=message;status.hidden=false;status.classList.add('is-error');status.setAttribute('role','alert');status.setAttribute('aria-live','assertive');}
    // Validation errors remain visible beside the parent controls. A recovery
    // reload must first give the parent a chance to read its outcome.
    if(!status||reloading)alert(message);
    if(reloading)location.reload();
  };
  exportButton.addEventListener('click',event=>{
    event.preventDefault();event.stopImmediatePropagation();
    void (async()=>{
      flush();await withPalsMaintenance(palStore=>rewards.maintenance(async store=>{
        download(await captureFamilyRewardPayload(FG,store,palStore));
      }));
    })().catch(fail);
  },true);
  importInput.addEventListener('change',event=>{
    event.preventDefault();event.stopImmediatePropagation();const file=importInput.files?.[0];if(!file)return;
    void (async()=>{
      if(FG.store.adultProfileId)throw Error('Switch to a family profile before restoring a family backup.');
      if(file.size>20_000_000)throw Error('That backup is too large.');
      const owner=FG.store.current().id;
      const raw=await file.text(),plan=validateFamilyRewardBackup(raw,FG.store.validateBackup,rewards.store());
      if(FG.store.backupChangesGrades(plan.base))await FG.verifyParentSettings();
      if(FG.store.current().id!==owner||FG.store.adultProfileId)throw Error('The selected player changed. Open backup import again.');
      if(!confirm('Restore this backup? Current family progress will be replaced.'))return;
      flush();await withPalsMaintenance(palStore=>rewards.maintenance(store=>applyFamilyRewardBackup(plan,localStorage,store,'restore',palStore)));
      alert('Progress restored successfully.');location.reload();
    })().catch(fail).finally(()=>{importInput.value='';});
  },true);
  // Reset has no separate public button today, but callers of the existing host
  // API must not leave another source key or its outbox behind to mint old credit.
  FG.store.reset=async()=>{
    if(FG.store.adultProfileId)throw Error('Switch to a family profile before resetting family data.');
    if(FG.store.loadError)throw Error('Export the preserved progress or restore a compatible backup before resetting.');
    const owner=FG.store.current().id;
    const plan=validateFamilyRewardBackup(JSON.stringify(FG.store.emptyBackup()),FG.store.validateBackup,rewards.store());
    if(FG.store.backupChangesGrades(plan.base))await FG.verifyParentSettings();
    if(FG.store.current().id!==owner||FG.store.adultProfileId)throw Error('The selected player changed. Open settings again.');
    flush();
    try{await withPalsMaintenance(palStore=>rewards.maintenance(store=>applyFamilyRewardBackup(plan,localStorage,store,'reset',palStore)));location.reload();}
    catch(error){if(hasPendingRewardBackup())location.reload();throw error;}
  };
}

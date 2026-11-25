import {recoverCompleteRestore} from './complete-backup';
import {adultStorageKey,adultWorkspaceId} from '../adult-pilot/storage';
import {currentAdultSession,adultSessionVersion} from '../adult-pilot/session';
import {familyFetch} from '../builder/session';
import {recoverRewardBackupJournal,type BackupStorage} from '../rewards/backup';
import {RewardsStore,REWARDS_DB_NAME} from '../rewards/store';
import {PalsStore,PALS_DB_NAME} from '../pals/store';
export const adultRecoveryStorage=(profileId:string):BackupStorage=>({getItem:key=>localStorage.getItem(adultStorageKey(key,profileId)),setItem:(key,value)=>localStorage.setItem(adultStorageKey(key,profileId),value),removeItem:key=>localStorage.removeItem(adultStorageKey(key,profileId))});
/** Verification is read-only and never replays a model request or restores a grant. */
export async function verifyAdultRecovery(profileId:string):Promise<()=>void>{
 const session=currentAdultSession(),version=adultSessionVersion();if(!session||session.profileId!==profileId||adultWorkspaceId()!==profileId)throw Error('Open a fresh Private parent session before recovering adult work.');
 const response=await familyFetch(session.base,'/v1/sessions/status',{cache:'no-store'});const status=await response.json();if(!response.ok||status?.connected!==true||status?.adultPilot?.active!==true)throw Error('Private parent access could not be verified. Your saved work was not replaced.');
 const guard=()=>{if(adultSessionVersion()!==version||currentAdultSession()?.profileId!==profileId||adultWorkspaceId()!==profileId)throw Error('The Private parent session ended. Reopen it to continue recovery.');};guard();return guard;
}
/** Called only after a newly issued server grant, before loading adult stores. */
export async function recoverAdultBackupAfterUnlock(profileId:string):Promise<void>{
 if(currentAdultSession()?.profileId!==profileId)throw Error('Fresh Private parent access is required for recovery.');const storage=adultRecoveryStorage(profileId),rewards=new RewardsStore(adultStorageKey(REWARDS_DB_NAME,profileId)),pals=new PalsStore(adultStorageKey(PALS_DB_NAME,profileId));
 await recoverCompleteRestore(profileId);
 const result=await recoverRewardBackupJournal(storage,rewards,pals);if(result==='reload')await recoverRewardBackupJournal(storage,rewards,pals);
}

import {adultWorkspaceId} from '../adult-pilot/storage';
import {assertRewardSourceWritable} from '../rewards/write-guard';
import {installNotebookRewardSource,installCreationRewardSource,type NotebookRewardSource} from '../rewards/service';
import {IndexedNotebook} from './indexed-notebook';
import {IndexedCreationStore} from './indexed-creation';
import {indexedStoragePreview,nativeScope} from './native-workspace';

/** Install before the reward projector starts. Each operation opens the current
 * durable source; a damaged prepared source must never fall back to old bytes. */
export function installIndexedRewardAuthorities(owner:()=>string):void {
 if(!indexedStoragePreview())return;
 const resolver=(kind:'notebook'|'creation')=>async(captured:string,adult:string|null):Promise<NotebookRewardSource|null>=>{
  const authorize=()=>{if(owner()!==captured||adultWorkspaceId()!==adult)throw Error('The player changed. Rewards will resume in the selected profile.');assertRewardSourceWritable();};
  authorize();const scope=await nativeScope(captured);
  const open=()=>kind==='notebook'?IndexedNotebook.open(scope,authorize):IndexedCreationStore.open(scope,authorize);
  const check=await open();let active=false;try{active=await check.isActive();}finally{check.close();}
  authorize();if(!active)return null;
  return {
   async pendingRewards(requested){if(requested!==captured)throw Error('Choose the player who earned this progress.');authorize();const source=await open();try{if(!await source.isActive())throw Error('Prepared progress needs recovery.');return source instanceof IndexedNotebook?await source.pendingRewards(captured):await source.pendingRewards();}finally{source.close();}},
   async acknowledgeRewards(requested,ids){if(requested!==captured)throw Error('Choose the player who earned this progress.');authorize();const source=await open();try{if(!await source.isActive())throw Error('Prepared progress needs recovery.');if(source instanceof IndexedNotebook)await source.acknowledgeRewards(captured,ids);else await source.acknowledgeRewards(ids);}finally{source.close();}}
  };
 };
 installNotebookRewardSource(resolver('notebook'));installCreationRewardSource(resolver('creation'));
}

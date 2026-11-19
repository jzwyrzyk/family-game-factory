import { profileStorage } from '../adult-pilot/storage';
import { adaptSourceEvidence } from './adapters';
import { emptyProblemSolvingWorkspace, validateProblemSolvingWorkspace } from './model';
import { installEvidenceReceiver } from './signals';
import { ProblemSolvingStore } from './storage';

/** Trusted host integration; generated games cannot submit performance judgments. */
export function installProblemSolvingEvidence() {
  const FG=(window as any).FG;
  if(FG.problemSolvingEvidence)return FG.problemSolvingEvidence;
  const owner=()=>String(FG.store.current().id),store=new ProblemSolvingStore(profileStorage(localStorage),owner);
  const warnings=new Map<string,string>();
  const changed=()=>window.dispatchEvent(new CustomEvent('factory-problem-solving-updated',{detail:{owner:owner()}}));
  const reset=()=>window.dispatchEvent(new CustomEvent('factory-problem-solving-reset',{detail:{owner:owner()}}));
  installEvidenceReceiver(signal=>{
    const captured=signal.kind==='studio'?signal.after.owner:signal.owner;
    if(captured!==owner())return;
    try{
      if(signal.kind==='clear-studio')store.removeSource(captured,'studio',signal.sessionId);
      else if(signal.kind==='clear-creation')store.removeSource(captured,'creation',signal.projectId);
      else {
        const records=adaptSourceEvidence(signal);if(!records.length)return;
        const known=new Set(store.list(captured).map(e=>e.id));
        for(const record of records)if(!known.has(record.id)){store.record(record);known.add(record.id);}
      }
      // A later successful activity does not recover an earlier missing record.
      changed();
    }catch(error){
      const cleared=signal.kind==='clear-studio'||signal.kind==='clear-creation';
      warnings.set(captured,`${cleared?'The source was cleared, but its derived problem-solving observations could not be removed':'The activity was saved, but its problem-solving observation was not'}: ${(error as Error).message}`);changed();
    }
  });
  const api={
    list:()=>store.list(owner()),retention:()=>store.retention(owner()),warning:()=>warnings.get(owner())??null,
    backup:()=>{const raw=store.recoveryRaw;return raw!==null?{factoryProblemSolvingRecoveryRaw:raw}:{factoryProblemSolving:store.export()};},
    validate:validateProblemSolvingWorkspace,empty:emptyProblemSolvingWorkspace,
    rawSnapshot:()=>store.rawSnapshot(),restoreRawSnapshot:(raw:string|null)=>store.restoreRawSnapshot(raw),
    restore:(value:unknown)=>{store.restore(value);warnings.clear();reset();changed();},
    clearCurrent:()=>{store.removeOwner(owner());warnings.delete(owner());reset();changed();},
  };
  FG.problemSolvingEvidence=api;
  return api;
}

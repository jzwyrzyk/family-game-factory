import {isGrade} from '../learning/grades';
import {validateLearning} from '../learning/engine';
import {validateLanguage} from '../language/engine';
import {validateLearningRewardOutbox} from '../rewards/integration';
export const FAMILY_STATE_KEY='family-game-factory-state-v1';
/** Shared legacy envelope validator. Recovery must not normalize original bytes. */
export function validateFamilyState(value:any,checkLearning=true):boolean {
 if (!value || value.version!==1 || !Array.isArray(value.profiles) || !Array.isArray(value.feedback)) return false;
 if(value.profiles.length<1 || value.profiles.length>6 || value.feedback.length>1000) return false;
 return value.profiles.every((p:any)=>p&&typeof p.id==='string' && typeof p.name==='string' && typeof p.skills==='object' && p.skills!==null && !Array.isArray(p.skills) && typeof p.stats==='object' && p.stats!==null && (p.grade===undefined||isGrade(p.grade)) && (p.learningSetupComplete===undefined||typeof p.learningSetupComplete==='boolean') && (p.learningSubject===undefined||['math','language'].includes(p.learningSubject)) && (p.allowSubjectSwitch===undefined||typeof p.allowSubjectSwitch==='boolean') && validateLearningRewardOutbox(p) && (!checkLearning||(validateLearning(p.learning)&&validateLanguage(p.language))));
}

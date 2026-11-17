/** Host-trusted language-arts contracts. No generated game may grade a child. */
import type {Grade, LearningContext, LearnerProfile} from '../learning/types';
export type LanguageDomain = 'phonics'|'spelling'|'vocabulary'|'grammar'|'comprehension'|'writing';
export type LanguageForm = 'pattern'|'encoding'|'syntax'|'comprehension'|'expression';
export type LanguageKind = 'choice'|'word-tiles'|'sentence-tiles'|'edit'|'creative';
export type LanguageLevel = 0|1|2;
export interface LanguageSkill {
  id:string; title:string; grade:Grade; domain:LanguageDomain;
  standards:string[]; prerequisites:string[]; objective:string;
}
export interface LanguageChoice {value:string; label:string}
export interface LanguageItem {
  id:string; contentPack:string; skillId:string; title:string; grade:Grade; domain:LanguageDomain;
  kind:LanguageKind; form:LanguageForm; tier:LanguageLevel;
  question:string; passage?:string; choices?:LanguageChoice[]; tiles?:string[];
  answer?:string; hints:[string,string,string]; explanation:string;
  /** Separate written response from reading assistance. */
  source:'reviewed-local'; purpose?:'focus'|'review'|'confidence'|'prerequisite'|'explore';
}
export interface LanguageContext extends LearningContext { opportunity?:'mid-play'|'round-end'|'practice'; }
export type LanguageProfile = LearnerProfile & {language?:unknown; learningSubject?:'math'|'language'; languageFocus?:string[]};
export interface LanguageResult {
  independent:boolean; outcome:'completed'|'shown'|'incorrect'|'explored';
  attemptId:string; item:LanguageItem; mode:'checkpoint'|'interaction'|'both';
}
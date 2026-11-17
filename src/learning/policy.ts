import type { LearnerProfile, LearningMode } from './types';

export const LEARNING_MODES: readonly LearningMode[] = ['checkpoint', 'interaction', 'both'];
export const MODE_LABELS: Record<LearningMode, string> = {
  checkpoint: 'Math at a pause', interaction: 'Build, move & solve', both: 'A mix of both',
};
export const REQUIRED_MATH_MESSAGE = 'Math stays part of every game. You can choose math at a pause, build-and-solve activities, or a mix of both.';
export function validMode(value: unknown): value is LearningMode {
  return typeof value === 'string' && LEARNING_MODES.includes(value as LearningMode);
}
export function modeFor(profile: LearnerProfile, key: string): LearningMode {
  const value = Object.hasOwn(profile.mathModes || {}, key) ? profile.mathModes?.[key] : undefined;
  return validMode(value) ? value : 'checkpoint';
}
export function setMode(profile: LearnerProfile, key: string, value: unknown): LearningMode {
  if (!validMode(value) || !/^[\w:-]{1,160}$/.test(key) || ['__proto__','constructor','prototype'].includes(key)) {
    throw Error(REQUIRED_MATH_MESSAGE);
  }
  profile.mathModes = { ...profile.mathModes, [key]: value };
  return value;
}
export type MathRequest = { kind: 'required'; message: string } | { kind: 'mode'; mode: LearningMode };
/** Bounded interpretation of explicit learning-format requests. No model or proficiency mutation. */
export function interpretMathRequest(text: string): MathRequest | null {
  const t = text.toLowerCase().replace(/[’']/g, "'").trim();
  const math = '(?:maths?|arithmetic|learning questions)';
  if (!new RegExp('\\b'+math+'\\b').test(t)) return null;
  // Negation must attach to math. “A math game with no score” is a valid design.
  const removal = new RegExp('\\b(?:remove|disable|delete|skip|eliminate|hide|stop|turn off|switch off|get rid of)\\s+(?:(?:all|the|any|these|every)\\s+){0,2}'+math+'\\b|\\b(?:no|without|zero)\\s+(?:(?:more|any|the)\\s+){0,2}'+math+'\\b|\\b'+math+'(?: questions| problems| activities)?\\s+(?:off|disabled|removed)\\b|\\bdon\'t (?:want|include|show|ask for)\\s+(?:any |the )?'+math+'\\b|\\bnever (?:show |ask |include )?(?:any |the )?'+math+'\\b');
  const replaceFormat = /\b(instead|replace|move)\b/.test(t) && /\b(checkpoints?|pauses?|inside|within|interactive|interaction|both)\b/.test(t);
  const negatedRemoval = /\b(?:don't|never) (?:remove|disable|delete|skip) (?:the |all )?(?:maths?|arithmetic)\b/.test(t);
  if (removal.test(t) && !replaceFormat && !negatedRemoval) return { kind: 'required', message: REQUIRED_MATH_MESSAGE };
  // An approved/new game brief is still a game request, not just a format toggle.
  if (/^(?:please )?(?:build|create|design|invent)\b/.test(t) || /^(?:please )?make (?:a|an|new)\b/.test(t) || /approved game plan/.test(t)) return null;
  if (/\b(both|mix|mixture|combine)\b/.test(t)) return { kind: 'mode', mode: 'both' };
  if (/\b(inside|within|interactive|interaction|embedded|build.and.solve)\b/.test(t) || /math (?:in|as part of) (?:the |my )?game/.test(t) || /without (?:more )?(?:popups?|pop-ups?|interruptions?)/.test(t)) {
    return { kind: 'mode', mode: 'interaction' };
  }
  if (/\b(checkpoints?|pauses?|between|breaks?)\b/.test(t)) return { kind: 'mode', mode: 'checkpoint' };
  if (removal.test(t) && !negatedRemoval) return { kind: 'required', message: REQUIRED_MATH_MESSAGE };
  return null;
}

/** ELA remains required; only a grown-up may switch the learning subject.
 * Never reinterpret an ordinary game-design request as a learning-policy change.
 */
export const REQUIRED_LANGUAGE_MESSAGE =
  'Language Arts checkpoints stay part of every game. A grown-up chooses Math or Language Arts in Parent Controls; children can change how language activities appear, not turn them off.';
export const LANGUAGE_MODE_LABELS:Record<LearningMode,string> = {
  checkpoint:'Language at a pause',
  interaction:'Build words & sentences when available',
  both:'A mix of language activities',
};
export function learningFormatLabel(subject:unknown,mode:LearningMode):string {
  return subject==='language'?LANGUAGE_MODE_LABELS[mode]:MODE_LABELS[mode];
}
export function interpretLearningRequest(text:string,subject:unknown='math'):MathRequest|null {
  if(subject!=='language')return interpretMathRequest(text);
  const t=text.toLowerCase().replace(/[’']/g,"'").trim();
  // Do not construe "remove all math" as an attempt to remove current language practice.
  // Subject changes are parent-owned, including explicit requests for Math instead.
  if(/\b(?:switch|change|replace|choose|select)\b.{0,50}\b(?:learning subject|subject to math|math instead|from (?:english|language|reading) to math)\b/.test(t)||
     /\b(?:use|do|give me) math instead of (?:english|language|reading)\b/.test(t)){
    return {kind:'required',message:REQUIRED_LANGUAGE_MESSAGE};
  }
  const domain='(?:language(?: arts)?|english|reading|literacy|spelling|learning(?: activities| questions| checkpoints)?|educational (?:activities|questions)|checkpoints?)';
  const removal=new RegExp('\\b(?:remove|disable|delete|skip|eliminate|hide|stop|turn off|switch off|get rid of)\\s+(?:(?:all|the|any|these|every|more)\\s+){0,2}'+domain+'\\b|\\b(?:no|without|zero)\\s+(?:(?:more|any|the)\\s+){0,2}'+domain+'\\b|\\b(?:don.t want|never show|never ask for)\\s+(?:(?:any|the|more)\\s+)?'+domain+'\\b|\\b'+domain+'\\s+(?:off|disabled|removed)\\b');
  const negated=/\b(?:don't|never)\s+(?:remove|disable|delete|skip|turn off)\s+(?:(?:the|all|any)\s+)?(?:language arts|english|reading|literacy|learning|checkpoints?)\b/.test(t);
  if(removal.test(t)&&!negated)return {kind:'required',message:REQUIRED_LANGUAGE_MESSAGE};
  const language=/\b(?:language|english|reading|literacy|spelling|vocabulary|word-building|word tiles|sentence tiles|sentences?|phonics)\b/.test(t);
  if(!language)return null;
  // A complete creative-game brief is not only a mode request.
  if(/^(?:please )?(?:build|create|design|invent)\b/.test(t)||
     /^(?:please )?make (?:a|an|new)\b/.test(t)||
     /approved game plan/.test(t))return null;
  if(/\b(?:both|mix|mixture|combine)\b/.test(t)&&/\b(?:activities|formats|reading|words|spelling|language)\b/.test(t)){
    return {kind:'mode',mode:'both'};
  }
  if(/\b(?:inside|within|interactive|interaction|embedded|build words|word tiles|sentence tiles)\b/.test(t)){
    return {kind:'mode',mode:'interaction'};
  }
  if(/\b(?:checkpoints?|pauses?|between rounds|at a pause)\b/.test(t)){
    return {kind:'mode',mode:'checkpoint'};
  }
  return null;
}

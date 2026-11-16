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

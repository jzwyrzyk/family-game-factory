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
  if (!/\b(math|maths|arithmetic|learning questions)\b/.test(t)) return null;
  if (/\b(no|without|remove|disable|delete|skip|eliminate|stop|hide|off|zero|don't|never)\b/.test(t) &&
      !/\b(instead|replace|move)\b/.test(t) && !/\b(no|without) (?:more )?(?:popups?|pop-ups?|interruptions?)\b/.test(t)) {
    return { kind: 'required', message: REQUIRED_MATH_MESSAGE };
  }
  if (/\b(both|mix|mixture|combine)\b/.test(t)) return { kind: 'mode', mode: 'both' };
  if (/\b(inside|within|interactive|interaction|embedded|build.and.solve)\b/.test(t) || /math (?:in|as part of) (?:the |my )?game/.test(t) || /without (?:more )?(?:popups?|pop-ups?|interruptions?)/.test(t)) {
    return { kind: 'mode', mode: 'interaction' };
  }
  if (/\b(checkpoints?|pauses?|between|breaks?)\b/.test(t)) return { kind: 'mode', mode: 'checkpoint' };
  if (/\b(remove|disable|delete|skip|eliminate|off|without)\b/.test(t)) return { kind: 'required', message: REQUIRED_MATH_MESSAGE };
  return null;
}

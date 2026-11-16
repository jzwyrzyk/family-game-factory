/** Shared contracts for the host-owned, grades 1–4 learning service. */
export type Grade = 1 | 2 | 3 | 4;
export type LearningMode = 'checkpoint' | 'interaction' | 'both';
export type Domain = 'operations' | 'place-value' | 'fractions' | 'measurement' | 'geometry' | 'data';
export type Representation = 'symbolic' | 'visual' | 'story';
export type ProgressState = 'not-enough-evidence' | 'learning-with-support' | 'independent' | 'remembered-later';
export type SelectionPurpose = 'focus' | 'review' | 'confidence' | 'readiness' | 'prerequisite';
export interface SkillDefinition {
  id: string; title: string; grade: Grade; domain: Domain; standards: string[];
  prerequisites: string[]; description: string;
}
export type MathVisual =
  | { kind: 'ten-frame'; count: number; extra?: number }
  | { kind: 'number-line'; min: number; max: number; start: number; jumps: number[] }
  | { kind: 'array'; rows: number; columns: number; splitAfter?: number }
  | { kind: 'groups'; groups: number; each: number }
  | { kind: 'fraction'; numerator: number; denominator: number; whole?: number }
  | { kind: 'place-value'; value: number; highlight?: number }
  | { kind: 'clock'; hours: number; minutes: number }
  | { kind: 'shape'; shape: string; width?: number; height?: number; labels?: string[] }
  | { kind: 'chart'; labels: string[]; values: number[]; unit?: string }
  | { kind: 'line-plot'; labels: string[]; values: number[]; unit?: string }
  | { kind: 'angle'; degrees: number };
export interface HintStep { text: string; visual?: MathVisual }
export interface MathItem {
  id: string; factId?: string; skillId: string; skill: string; grade: Grade;
  question: string; answer: number | string; answerKind: 'number' | 'fraction' | 'choice' | 'text';
  choices?: { value: string; label: string }[]; unit?: string;
  hints: HintStep[]; workedExample: string; visual?: MathVisual;
  representation: Representation; tier: number;
  parameters: Record<string, number | string>;
  purpose?: SelectionPurpose;
}
export interface AnswerCheck { valid: boolean; correct: boolean; normalized: string; message?: string }
export interface LearningContext {
  now?: number; random?: () => number; sessionId?: string; gameId?: string;
  versionId?: string; projectId?: string; mode?: LearningMode;
}
export interface LearnerProfile {
  id?: string; name?: string; age?: number; grade?: Grade; focus?: string; skillFocus?: string[];
  intensity?: string; rate?: number; hints?: boolean; punish?: boolean;
  factTargets?: string[]; mathModes?: Record<string, LearningMode>;
  skills: Record<string, any>; learning?: any; learningEvidence?: any[];
  mathWindow?: number[]; [key: string]: any;
}

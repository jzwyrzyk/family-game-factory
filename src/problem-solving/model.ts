/** Local formative observations. These records never establish aptitude or independent mastery. */
export const PROBLEM_SOLVING_EPISODE_SCHEMA = 'jems.problem-solving.episode.v1' as const;
export const PROBLEM_SOLVING_SCHEMA = 'jems.problem-solving.workspace.v1' as const;
export const PROBLEM_SOLVING_KEY = 'family-game-factory-problem-solving-v1';
export const PROBLEM_SOLVING_LIMITS = Object.freeze({
  episodesPerOwner: 200, retainedStart: 12, owners: 32, episodes: 6400,
  drafts: 64, observations: 24, characters: 1_000_000,
});
export const APS_SKILLS = [
  'define_problem', 'compare_options', 'plan_test', 'interpret_evidence', 'revise', 'transfer',
] as const;
export type ProblemSolvingSkill = typeof APS_SKILLS[number];
export type APSSkill = ProblemSolvingSkill;
export const APS_SKILL_LABELS: Record<ProblemSolvingSkill, string> = {
  define_problem: 'Define the problem', compare_options: 'Compare ideas',
  plan_test: 'Plan a test', interpret_evidence: 'Use the result',
  revise: 'Revise an idea', transfer: 'Try in a new situation',
};
export type ProblemSolvingSource = 'math' | 'language' | 'creation' | 'studio' | 'practice';
export type EvidenceOutcome = 'demonstrated' | 'not-yet' | 'unobserved';
export type EvidenceAuthorship = 'learner' | 'shared' | 'helper' | 'unknown';
export type EvidenceSupport = 'none-observed' | 'access-only' | 'strategy' | 'solution' | 'unknown';
export type EvidenceElicitation = 'prompted' | 'spontaneous' | 'unknown';
export interface ProblemSolvingTask {
  id: string; family: string; version: string; label: string;
  demand?: string; variant?: string;
  exposure: 'first-seen' | 'repeat' | 'unknown';
  firstAttempt: boolean;
}
export interface ProblemSolvingObservation {
  id: string; skill: ProblemSolvingSkill; outcome: EvidenceOutcome;
  authorship: EvidenceAuthorship; support: EvidenceSupport; elicitation: EvidenceElicitation;
  observedAt: string; responseId?: string; evidenceRef?: string; note?: string;
}
export interface ProblemSolvingEpisode {
  schema: typeof PROBLEM_SOLVING_EPISODE_SCHEMA;
  id: string; owner: string; sessionId: string; source: ProblemSolvingSource;
  kind: 'structured-practice' | 'context-only';
  task: ProblemSolvingTask; startedAt: string; completedAt?: string;
  /** A missing status on a completed record means completed. Drafts have no completedAt. */
  status?: 'completed' | 'interrupted' | 'technical-invalid';
  observations: ProblemSolvingObservation[];
  /** A short trusted fact, never a raw conversation or a generated ability judgment. */
  context?: string;
}
export interface ProblemSolvingDraft { episode: ProblemSolvingEpisode; stepIndex: number }
export interface ProblemSolvingWorkspace {
  schema: typeof PROBLEM_SOLVING_SCHEMA;
  episodes: ProblemSolvingEpisode[]; drafts: ProblemSolvingDraft[];
  /** Dropped middle observations. Retained first observations are not a calibrated baseline. */
  discardedByOwner: Record<string, number>;
}
export interface ProblemSolvingStoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

const badIds = new Set(['__proto__', 'prototype', 'constructor']);
export function isProblemSolvingId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value) && !badIds.has(value);
}
export const copyEvidence = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function invalid(): never { throw Error('This problem-solving record is unsupported or damaged. Your saved observations have not been replaced.'); }
function object(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.keys(value).some(key => !fields.includes(key))) invalid();
  return value as Record<string, unknown>;
}
const text = (value: unknown, max: number): value is string => typeof value === 'string'
  && value.length <= max && !!value.trim() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const instant = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const at = Date.parse(value); return Number.isFinite(at) && new Date(at).toISOString() === value;
};
const member = (value: unknown, choices: readonly string[]) => typeof value === 'string' && choices.includes(value);
const id = (value: unknown) => { if (!isProblemSolvingId(value)) invalid(); };

/** Allowlisted, bounded data only; validates before copying or changing storage. */
export function validateProblemSolvingEpisode(value: unknown, allowIncomplete = false): ProblemSolvingEpisode {
  const e = object(value, ['schema','id','owner','sessionId','source','kind','task','startedAt','completedAt','status','observations','context']);
  if (e.schema !== PROBLEM_SOLVING_EPISODE_SCHEMA) invalid();
  for (const name of ['id','owner','sessionId']) id(e[name]);
  if (!member(e.source, ['math','language','creation','studio','practice'])
    || !member(e.kind, ['structured-practice','context-only']) || !instant(e.startedAt)) invalid();
  // v1 has one authored assessment opportunity path. A restored ordinary subject
  // or game record cannot promote itself into a structured reasoning result.
  if (e.kind === 'structured-practice' && e.source !== 'practice') invalid();
  if (e.status !== undefined && !member(e.status, ['completed','interrupted','technical-invalid'])) invalid();
  if (e.completedAt === undefined) {
    if (!allowIncomplete || e.status !== undefined) invalid();
  } else if (!instant(e.completedAt) || e.completedAt < e.startedAt) invalid();
  const task = object(e.task, ['id','family','version','label','demand','variant','exposure','firstAttempt']);
  for (const name of ['id','family','version']) id(task[name]);
  if (!text(task.label, 120) || typeof task.firstAttempt !== 'boolean'
    || !member(task.exposure, ['first-seen','repeat','unknown'])) invalid();
  if (task.demand !== undefined && !text(task.demand, 80)) invalid();
  if (task.variant !== undefined) id(task.variant);
  if (e.context !== undefined && !text(e.context, 1200)) invalid();
  if (!Array.isArray(e.observations) || e.observations.length > PROBLEM_SOLVING_LIMITS.observations) invalid();
  const seen = new Set<string>(); let lastAt = e.startedAt;
  for (const raw of e.observations) {
    const o = object(raw, ['id','skill','outcome','authorship','support','elicitation','observedAt','responseId','evidenceRef','note']);
    id(o.id);
    if (seen.has(o.id as string) || !member(o.skill, APS_SKILLS)
      || !member(o.outcome, ['demonstrated','not-yet','unobserved'])
      || !member(o.authorship, ['learner','shared','helper','unknown'])
      || !member(o.support, ['none-observed','access-only','strategy','solution','unknown'])
      || !member(o.elicitation, ['prompted','spontaneous','unknown']) || !instant(o.observedAt)
      || o.observedAt < lastAt || (e.completedAt !== undefined && o.observedAt > e.completedAt)) invalid();
    if (e.kind === 'context-only' && o.outcome !== 'unobserved') invalid();
    if (o.responseId !== undefined) id(o.responseId);
    if (o.evidenceRef !== undefined && !text(o.evidenceRef, 240)) invalid();
    if (o.note !== undefined && !text(o.note, 360)) invalid();
    lastAt = o.observedAt; seen.add(o.id as string);
  }
  return copyEvidence(value) as ProblemSolvingEpisode;
}

export function validateProblemSolvingDraft(value: unknown): ProblemSolvingDraft {
  const d = object(value, ['episode','stepIndex']);
  const episode = validateProblemSolvingEpisode(d.episode, true);
  if (episode.completedAt !== undefined || episode.kind !== 'structured-practice'
    || !Number.isInteger(d.stepIndex) || (d.stepIndex as number) < 0 || (d.stepIndex as number) > 32) invalid();
  return {episode, stepIndex: d.stepIndex as number};
}

export function emptyProblemSolvingWorkspace(): ProblemSolvingWorkspace {
  return {schema: PROBLEM_SOLVING_SCHEMA, episodes: [], drafts: [], discardedByOwner: {}};
}

export function validateProblemSolvingWorkspace(value: unknown): ProblemSolvingWorkspace {
  const data = object(value, ['schema','episodes','drafts','discardedByOwner']);
  if (data.schema !== PROBLEM_SOLVING_SCHEMA || !Array.isArray(data.episodes)
    || data.episodes.length > PROBLEM_SOLVING_LIMITS.episodes || !Array.isArray(data.drafts)
    || data.drafts.length > PROBLEM_SOLVING_LIMITS.drafts) invalid();
  const count = data.discardedByOwner;
  if (!count || typeof count !== 'object' || Array.isArray(count)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(count))) invalid();
  const owners = new Set<string>(), ids = new Set<string>(), counts = new Map<string, number>();
  const episodes = data.episodes.map(raw => {
    const episode = validateProblemSolvingEpisode(raw), key = `${episode.owner}/${episode.id}`;
    if (ids.has(key)) invalid(); ids.add(key); owners.add(episode.owner);
    const n = (counts.get(episode.owner) ?? 0) + 1;
    if (n > PROBLEM_SOLVING_LIMITS.episodesPerOwner) invalid(); counts.set(episode.owner, n);
    return episode;
  });
  const drafts = data.drafts.map(raw => {
    const draft = validateProblemSolvingDraft(raw), key = `${draft.episode.owner}/${draft.episode.id}`;
    if (ids.has(key)) invalid(); ids.add(key); owners.add(draft.episode.owner); return draft;
  });
  for (const [owner, dropped] of Object.entries(count)) {
    id(owner); owners.add(owner);
    if (!Number.isSafeInteger(dropped) || (dropped as number) < 1) invalid();
  }
  if (owners.size > PROBLEM_SOLVING_LIMITS.owners) invalid();
  const checked: ProblemSolvingWorkspace = {
    schema: PROBLEM_SOLVING_SCHEMA, episodes, drafts, discardedByOwner: copyEvidence(count) as Record<string, number>,
  };
  if (JSON.stringify(checked).length > PROBLEM_SOLVING_LIMITS.characters) invalid();
  return checked;
}

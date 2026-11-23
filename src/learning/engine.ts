import { SKILLS, getSkill } from './curriculum';
import { generateItem, evaluateAnswer, legacyFactItem } from './content';
import type { Grade, LearnerProfile, LearningContext, MathItem, ProgressState, Representation, SelectionPurpose, SkillDefinition } from './types';

const DAY = 86_400_000;
const MAX_ATTEMPTS = 120;
const MAX_FACTS = 1500;
const MAX_COUNT = 1_000_000_000;
const MAX_TIME = 253_402_300_799_999;
const INTERVALS = [1, 2, 4, 8, 14] as const;
export const PROGRESS_LABELS: Record<ProgressState, string> = {
  'not-enough-evidence': 'Not enough evidence',
  'learning-with-support': 'Learning with support',
  independent: 'Independently successful',
  'remembered-later': 'Remembered later',
};
export const PURPOSE_LABELS: Record<SelectionPurpose, string> = {
  focus: 'Your current focus', review: 'Time to revisit this', confidence: 'Build on something familiar',
  readiness: 'Explore a small next step', prerequisite: 'A useful building block',
};
export interface AnswerEvent { raw: string; normalized: string; correct: boolean; at: number }
export interface Attempt {
  id: string; item: MathItem; context: Omit<LearningContext, 'random' | 'now'>;
  startedAt: number; completedAt?: number; answers: AnswerEvent[];
  hintLevel: number; hintEvents: { level: number; at: number }[];
  outcome: 'open' | 'completed' | 'skipped' | 'interrupted' | 'shown';
  correct: boolean; independent: boolean;
  firstResponseRecorded: boolean; struggleRecorded: boolean;
  legacy?: { firstTryCorrect: boolean; helpUsed: boolean; reportedAttempts: number; rawAnswersAvailable: false };
}
export interface ErrorPattern {
  kind: 'addition-for-multiplication' | 'nearby-product'; count: number; itemKeys: string[]; lastAt: number;
}
export interface EvidenceSummary {
  presentations: number; submissions: number; completed: number; independentCorrect: number;
  assistedCorrect: number; incorrectResponses: number; struggledPresentations: number;
  skipped: number; interrupted: number; shown: number; helpRequests: number;
  firstAttemptCount: number; firstAttemptCorrect: number;
  independentDays: string[]; independentItems: string[]; independentForms: Representation[];
  firstIndependentAt: number | null; lastIndependentAt: number | null;
  lastQualifyingAt: number | null; lastQualifyingDay: string | null;
  reviewStage: number; dueAt: number | null; delayedSuccesses: number;
  lastAt: number; recent: { independent: boolean; wrong: boolean; assisted: boolean; at: number }[];
  patterns: ErrorPattern[]; migrated: boolean;
}
export interface LearningState {
  version: 2; nextAttempt: number; selectionCount: number; targetCursor: number;
  attempts: Attempt[]; skills: Record<string, EvidenceSummary>; facts: Record<string, EvidenceSummary>;
  recentItems: string[]; recentFacts: string[]; recentSkills: string[];
  support: Record<string, { count: number; lastAt: number }>;
  totals: { presentations: number; submissions: number; completed: number; independent: number; assisted: number; skipped: number; interrupted: number; shown: number };
}
export interface SkillReport {
  id: string; title: string; grade: Grade; state: ProgressState; label: string;
  evidence: 'limited' | 'developing' | 'across-days'; presentations: number;
  independent: number; assisted: number; errors: number; distinctDays: number;
  representations: Representation[]; dueAt: number | null; reviewDue: boolean;
  independentAccuracy: number | null; hypotheses: string[]; migrated: boolean;
}
export interface LearningReport {
  grade: Grade; totals: LearningState['totals']; skills: SkillReport[];
  due: SkillReport[]; support: SkillReport[]; unknown: SkillReport[];
  activeAttempts: number; recentAttempts: Attempt[];
}

const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.min(MAX_COUNT, Math.max(0, Math.floor(value))) : 0;
const stamp = (value = Date.now()) => Number.isFinite(value) ? Math.min(MAX_TIME, Math.max(0, value)) : Date.now();
const add = <T, K extends keyof T>(record: T, key: K, amount = 1) => { record[key] = count(Number(record[key]) + amount) as T[K]; };
function nextSequence(state: LearningState, key: 'selectionCount' | 'targetCursor' | 'nextAttempt') {
  const value = state[key];
  state[key] = value >= MAX_COUNT ? (key === 'nextAttempt' ? 1 : 0) : value + 1;
  return value;
}
const dayKey = (at: number) => new Date(at).toISOString().slice(0, 10);
const unique = <T>(items: T[], value: T, max: number) => items.includes(value) ? items : [...items, value].slice(-max);
const safeObject = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const safeKey = (value: string) => /^[a-zA-Z0-9:._/\-]+$/.test(value) && value.length < 180 && value !== '__proto__';
const checkedStates = new WeakSet<object>();
const validTime = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_TIME;
const validCount = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= MAX_COUNT;
const boundedString = (value: unknown, length: number) => typeof value === 'string' && value.length <= length;
function validSummary(s: unknown): s is EvidenceSummary {
  if (!safeObject(s)) return false;
  const counters = ['presentations', 'submissions', 'completed', 'independentCorrect', 'assistedCorrect', 'incorrectResponses',
    'struggledPresentations', 'skipped', 'interrupted', 'shown', 'helpRequests', 'firstAttemptCount', 'firstAttemptCorrect', 'delayedSuccesses'];
  if (!counters.every(k => validCount(s[k])) || !validCount(s.reviewStage) || s.reviewStage > 4 || !validTime(s.lastAt)) return false;
  if (!['firstIndependentAt', 'lastIndependentAt', 'lastQualifyingAt', 'dueAt'].every(k => s[k] === null || validTime(s[k]))) return false;
  if (s.lastQualifyingDay !== null && !/^\d{4}-\d{2}-\d{2}$/.test(s.lastQualifyingDay)) return false;
  if (!Array.isArray(s.independentDays) || s.independentDays.length > 90 || !s.independentDays.every((x: unknown) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x))) return false;
  if (!Array.isArray(s.independentItems) || s.independentItems.length > 80 || !s.independentItems.every((x: unknown) => typeof x === 'string' && safeKey(x))) return false;
  if (!Array.isArray(s.independentForms) || s.independentForms.length > 3 || !s.independentForms.every((x: unknown) => ['symbolic', 'story', 'visual'].includes(String(x)))) return false;
  if (!Array.isArray(s.recent) || s.recent.length > 20 || !s.recent.every((x: any) => safeObject(x) && validTime(x.at) && ['independent', 'wrong', 'assisted'].every(k => typeof x[k] === 'boolean'))) return false;
  if (!Array.isArray(s.patterns) || s.patterns.length > 2 || !s.patterns.every((p: any) => safeObject(p) && validCount(p.count) && validTime(p.lastAt)
    && ['addition-for-multiplication', 'nearby-product'].includes(p.kind) && Array.isArray(p.itemKeys) && p.itemKeys.length <= 12
    && p.itemKeys.every((x: unknown) => typeof x === 'string' && safeKey(x)))) return false;
  return typeof s.migrated === 'boolean' && s.firstAttemptCorrect <= s.firstAttemptCount;
}
function validItem(item: unknown): item is MathItem {
  if (!safeObject(item) || typeof item.id !== 'string' || !safeKey(item.id) || typeof item.skillId !== 'string' || !getSkill(item.skillId)) return false;
  if (item.factId !== undefined && (typeof item.factId !== 'string' || !safeKey(item.factId))) return false;
  if (getSkill(item.skillId)?.grade !== item.grade || !boundedString(item.question, 2000) || !boundedString(item.skill, 200)) return false;
  if (!(typeof item.answer === 'number' && Number.isFinite(item.answer)) && !boundedString(item.answer, 100)) return false;
  if (!['number', 'fraction', 'choice', 'text'].includes(item.answerKind) || !['symbolic', 'visual', 'story'].includes(item.representation)) return false;
  if (!Array.isArray(item.hints) || item.hints.length > 5 || !item.hints.every((h: any) => safeObject(h) && boundedString(h.text, 2000))) return false;
  if (!boundedString(item.workedExample, 4000) || !safeObject(item.parameters) || Object.keys(item.parameters).length > 30
    || !Object.values(item.parameters).every(value => (typeof value === 'number' && Number.isFinite(value)) || boundedString(value, 1000))) return false;
  if (![0, 1, 2].includes(item.tier)) return false;
  if (item.choices !== undefined && (!Array.isArray(item.choices) || item.choices.length > 20 || !item.choices.every((c: any) => safeObject(c) && boundedString(c.value, 120) && boundedString(c.label, 500)))) return false;
  return JSON.stringify(item).length <= 20_000;
}
/** Validate imported persistent state before replacing the child's existing profile. */
export function validateLearning(value: unknown): boolean {
  if (value === undefined) return true;
  try {
    if (!safeObject(value) || value.version !== 2 || !validCount(value.nextAttempt) || value.nextAttempt < 1
      || !validCount(value.selectionCount) || !validCount(value.targetCursor)) return false;
    for (const name of ['skills', 'facts'] as const) {
      const records = value[name];
      if (!safeObject(records) || Object.keys(records).length > (name === 'skills' ? SKILLS.length : MAX_FACTS)) return false;
      if (!Object.entries(records).every(([id, s]) => safeKey(id) && (name !== 'skills' || !!getSkill(id)) && validSummary(s))) return false;
    }
    if (!safeObject(value.totals) || !['presentations', 'submissions', 'completed', 'independent', 'assisted', 'skipped', 'interrupted', 'shown'].every(k => validCount(value.totals[k]))) return false;
    if (!['recentItems', 'recentFacts', 'recentSkills'].every(k => Array.isArray(value[k]) && value[k].length <= 12 && value[k].every((x: unknown) => typeof x === 'string' && safeKey(x)))) return false;
    if (!safeObject(value.support) || Object.keys(value.support).length > SKILLS.length || !Object.entries(value.support).every(([id, s]) => !!getSkill(id) && safeObject(s) && validCount(s.count) && validTime(s.lastAt))) return false;
    if (!Array.isArray(value.attempts) || value.attempts.length > MAX_ATTEMPTS) return false;
    const ids = new Set<string>();
    return value.attempts.every((a: any) => {
      if (!safeObject(a) || !boundedString(a.id, 100) || ids.has(a.id) || !validItem(a.item) || !safeObject(a.context)) return false;
      ids.add(a.id);
      if (!['sessionId', 'gameId', 'versionId', 'projectId'].every(k => a.context[k] === undefined || boundedString(a.context[k], 200))) return false;
      if (!['checkpoint', 'interaction', 'both'].includes(a.context.mode) || !validTime(a.startedAt) || (a.completedAt !== undefined && !validTime(a.completedAt))) return false;
      if (!['open', 'completed', 'skipped', 'interrupted', 'shown'].includes(a.outcome) || !['correct', 'independent', 'firstResponseRecorded', 'struggleRecorded'].every(k => typeof a[k] === 'boolean')) return false;
      if (!validCount(a.hintLevel) || a.hintLevel > a.item.hints.length + 1 || !Array.isArray(a.hintEvents) || a.hintEvents.length > a.item.hints.length + 1) return false;
      if (!a.hintEvents.every((h: any) => safeObject(h) && validCount(h.level) && h.level >= 1 && h.level <= a.item.hints.length + 1 && validTime(h.at))) return false;
      if (!Array.isArray(a.answers) || a.answers.length > 12 || !a.answers.every((r: any) => safeObject(r) && boundedString(r.raw, 160) && boundedString(r.normalized, 160) && typeof r.correct === 'boolean' && validTime(r.at))) return false;
      return a.legacy === undefined || (safeObject(a.legacy) && typeof a.legacy.firstTryCorrect === 'boolean' && typeof a.legacy.helpUsed === 'boolean' && validCount(a.legacy.reportedAttempts) && a.legacy.rawAnswersAvailable === false);
    });
  } catch { return false; }
}

function emptySummary(at: number): EvidenceSummary {
  return { presentations: 0, submissions: 0, completed: 0, independentCorrect: 0, assistedCorrect: 0,
    incorrectResponses: 0, struggledPresentations: 0, skipped: 0, interrupted: 0, shown: 0,
    helpRequests: 0, firstAttemptCount: 0, firstAttemptCorrect: 0, independentDays: [], independentItems: [],
    independentForms: [], firstIndependentAt: null, lastIndependentAt: null, lastQualifyingAt: null,
    lastQualifyingDay: null, reviewStage: 0, dueAt: null, delayedSuccesses: 0, lastAt: at, recent: [], patterns: [], migrated: false };
}
function emptyState(): LearningState {
  return { version: 2, nextAttempt: 1, selectionCount: 0, targetCursor: 0, attempts: [], skills: {}, facts: {},
    recentItems: [], recentFacts: [], recentSkills: [], support: {},
    totals: { presentations: 0, submissions: 0, completed: 0, independent: 0, assisted: 0, skipped: 0, interrupted: 0, shown: 0 } };
}
export function profileGrade(profile: LearnerProfile): Grade {
  if (typeof profile.grade === 'number' && [1, 2, 3, 4].includes(profile.grade)) return profile.grade;
  // Age, a character choice and game progress never establish school level.
  // An unconfigured or malformed profile starts at the supported entry grade.
  return 1;
}
function addLegacy(summary: EvidenceSummary, old: Record<string, any>, now: number) {
  const tries = count(old.tries), right = Math.min(tries, count(old.right)), hints = Math.min(tries, count(old.hints));
  add(summary, 'presentations', tries); add(summary, 'completed', tries); add(summary, 'independentCorrect', right);
  add(summary, 'assistedCorrect', Math.min(tries - right, hints)); add(summary, 'helpRequests', hints);
  // Old records have no actual response, session, or representation evidence. Never manufacture those.
  summary.migrated = tries > 0;
  const oldDue = Date.parse(old.dueAt);
  summary.dueAt = tries ? stamp(Math.min(Number.isFinite(oldDue) ? oldDue : now, now + DAY)) : null;
}
export function ensureLearning(profile: LearnerProfile, now = Date.now()): LearningState {
  now = stamp(now);
  if (!safeObject(profile.skills)) profile.skills = {};
  const old = profile.learning;
  if (old !== undefined) {
    if (!safeObject(old) || (old.version !== 2) || (!checkedStates.has(old) && !validateLearning(old))) {
      throw new Error('This learning record is unsupported or damaged. Existing progress has not been reset.');
    }
    checkedStates.add(old);
    old.nextAttempt = Math.max(1, count(old.nextAttempt)); old.selectionCount = count(old.selectionCount); old.targetCursor = count(old.targetCursor);
    return old as LearningState;
  }
  const state = emptyState();
  for (const [fact, record] of Object.entries(profile.skills).slice(0, MAX_FACTS)) {
    if (!safeKey(fact) || !safeObject(record)) continue;
    const item = legacyFactItem(fact);
    if (!item || !count(record.tries)) continue;
    const factSummary = state.facts[fact] = emptySummary(now);
    const skillSummary = state.skills[item.skillId] ||= emptySummary(now);
    addLegacy(factSummary, record, now); addLegacy(skillSummary, record, now);
    add(state.totals, 'presentations', count(record.tries)); add(state.totals, 'completed', count(record.tries));
    add(state.totals, 'independent', Math.min(count(record.tries), count(record.right)));
    add(state.totals, 'assisted', Math.min(count(record.tries) - Math.min(count(record.tries), count(record.right)), count(record.hints)));
  }
  profile.learning = state;
  checkedStates.add(state);
  return state;
}
function summaries(state: LearningState, item: MathItem, now: number) {
  const fact = item.factId || item.id;
  if (!safeKey(item.skillId) || !safeKey(fact)) throw new Error('Invalid learning item identity.');
  return [state.skills[item.skillId] ||= emptySummary(now), state.facts[fact] ||= emptySummary(now)];
}
function prune(state: LearningState) {
  if (state.attempts.length > MAX_ATTEMPTS) state.attempts.splice(0, state.attempts.length - MAX_ATTEMPTS);
  const keys = Object.keys(state.facts);
  if (keys.length > MAX_FACTS) {
    const activeFacts = new Set(state.attempts.filter(a => a.outcome === 'open').map(a => a.item.factId || a.item.id));
    keys.filter(k => !activeFacts.has(k)).sort((a, b) => state.facts[a].lastAt - state.facts[b].lastAt)
      .slice(0, keys.length - MAX_FACTS).forEach(key => delete state.facts[key]);
  }
}
function currentAttempt(profile: LearnerProfile, id: string): Attempt {
  const attempt = ensureLearning(profile).attempts.find(a => a.id === id);
  if (!attempt) throw new Error('This practice activity is no longer active.');
  return attempt;
}

/** Status rules are conservative product heuristics, not calibrated probabilities of mastery. */
export function evidenceState(summary: EvidenceSummary | undefined, fact = false): ProgressState {
  if (!summary) return 'not-enough-evidence';
  const recent = summary.recent.slice(-8);
  const independentlySuccessful = recent.filter(x => x.independent).length;
  const reliableRecent = recent.length >= 3 && independentlySuccessful / recent.length >= 0.75;
  const enoughItems = fact || summary.independentItems.length >= 3;
  if (summary.independentCorrect >= 5 && summary.independentDays.length >= 3 && summary.independentForms.length >= 2
    && summary.delayedSuccesses > 0 && reliableRecent && enoughItems) return 'remembered-later';
  if (summary.independentCorrect >= 4 && summary.independentDays.length >= 2 && reliableRecent && enoughItems) return 'independent';
  const recentSupport = recent.filter(x => x.wrong || x.assisted).length;
  if (recentSupport >= 2) return 'learning-with-support';
  return 'not-enough-evidence';
}

export function beginAttempt(profile: LearnerProfile, item: MathItem, context: LearningContext = {}): Attempt {
  const now = stamp(context.now), state = ensureLearning(profile, now);
  if (!validItem(item) || item.grade > profileGrade(profile)) throw new Error('This skill is outside the selected learning range or its activity is invalid.');
  // A new activity closes unfinished work without losing its submitted errors.
  for (const prior of state.attempts.filter(a => a.outcome === 'open')) finishAttempt(profile, prior.id, 'interrupted', now);
  let id: string;
  do { id = `attempt-${nextSequence(state, 'nextAttempt')}-${now.toString(36)}`; } while (state.attempts.some(a => a.id === id));
  const attempt: Attempt = {
    id, item: JSON.parse(JSON.stringify(item)),
    context: { sessionId: context.sessionId || `session-${dayKey(now)}`, gameId: context.gameId || 'math-lab',
      versionId: context.versionId, projectId: context.projectId, mode: context.mode || 'checkpoint' },
    startedAt: now, answers: [], hintLevel: 0, hintEvents: [], outcome: 'open', correct: false, independent: false,
    firstResponseRecorded: false, struggleRecorded: false,
  };
  state.attempts.push(attempt); add(state.totals, 'presentations');
  for (const s of summaries(state, item, now)) { add(s, 'presentations'); s.lastAt = now; }
  prune(state);
  return attempt;
}
function observeError(summary: EvidenceSummary, item: MathItem, raw: string, now: number) {
  const match = /^mul:(\d+)x(\d+)$/.exec(item.factId || '');
  const normalizedFraction = /^([+-]?\d+)\/(\d+)$/.exec(raw);
  const n = normalizedFraction ? Number(normalizedFraction[1]) / Number(normalizedFraction[2]) : Number(raw);
  if (!match || !Number.isFinite(n)) return;
  const a = +match[1], b = +match[2];
  const kind = n === a + b && n !== a * b ? 'addition-for-multiplication'
    : n === a * (b - 1) || n === a * (b + 1) ? 'nearby-product' : null;
  if (!kind) return;
  let pattern = summary.patterns.find(p => p.kind === kind);
  if (!pattern) { pattern = { kind, count: 0, itemKeys: [], lastAt: now }; summary.patterns.push(pattern); }
  add(pattern, 'count'); pattern.lastAt = now; pattern.itemKeys = unique(pattern.itemKeys, item.factId || item.id, 12);
}
export function submitAnswer(profile: LearnerProfile, attemptId: string, raw: string, now = Date.now()) {
  now = stamp(now); const state = ensureLearning(profile, now), attempt = currentAttempt(profile, attemptId);
  if (attempt.outcome !== 'open') return { valid: false, correct: attempt.correct, attempt, message: 'This activity is already complete.' };
  if (attempt.answers.length >= 12) return { valid: false, correct: false, attempt, message: 'Let’s look at a worked example, then try a fresh activity.' };
  const checked = evaluateAnswer(attempt.item, String(raw).slice(0, 160));
  if (!checked.valid) return { ...checked, attempt };
  const first = attempt.answers.length === 0;
  attempt.answers.push({ raw: String(raw).slice(0, 160), normalized: checked.normalized, correct: checked.correct, at: now });
  add(state.totals, 'submissions');
  for (const s of summaries(state, attempt.item, now)) {
    add(s, 'submissions'); s.lastAt = now;
    if (first && attempt.hintLevel === 0) { add(s, 'firstAttemptCount'); if (checked.correct) add(s, 'firstAttemptCorrect'); }
    if (!checked.correct) { add(s, 'incorrectResponses'); observeError(s, attempt.item, checked.normalized, now); }
  }
  attempt.firstResponseRecorded = true;
  if (!checked.correct && !attempt.struggleRecorded) {
    attempt.struggleRecorded = true;
    for (const s of summaries(state, attempt.item, now)) add(s, 'struggledPresentations');
    const support = state.support[attempt.item.skillId] ||= { count: 0, lastAt: now };
    add(support, 'count'); support.lastAt = now;
  }
  attempt.correct = checked.correct;
  if (checked.correct) finishAttempt(profile, attemptId, 'completed', now);
  return { ...checked, attempt };
}
export function useHint(profile: LearnerProfile, attemptId: string, level: number, now = Date.now()): Attempt {
  now = stamp(now); const state = ensureLearning(profile, now), attempt = currentAttempt(profile, attemptId);
  if (attempt.outcome !== 'open') return attempt;
  const next = Math.min(attempt.item.hints.length + 1, Math.max(1, count(level)));
  if (next <= attempt.hintLevel) return attempt;
  attempt.hintLevel = next; attempt.hintEvents.push({ level: next, at: now });
  for (const s of summaries(state, attempt.item, now)) { add(s, 'helpRequests'); s.lastAt = now; }
  return attempt;
}
function updateSchedule(summary: EvidenceSummary, item: MathItem, attempt: Attempt, now: number) {
  const day = dayKey(now);
  if (attempt.independent) {
    const previousIndependent = summary.lastIndependentAt;
    add(summary, 'independentCorrect');
    summary.independentDays = unique(summary.independentDays, day, 90);
    summary.independentItems = unique(summary.independentItems, item.factId || item.id, 80);
    summary.independentForms = unique(summary.independentForms, item.representation, 3);
    if (summary.firstIndependentAt === null) summary.firstIndependentAt = now;
    if (previousIndependent !== null && now - previousIndependent >= DAY
      && now - summary.firstIndependentAt >= 7 * DAY) add(summary, 'delayedSuccesses');
    summary.lastIndependentAt = now;
    const first = summary.lastQualifyingAt === null;
    const spaced = !first && now - summary.lastQualifyingAt! >= DAY && summary.lastQualifyingDay !== day;
    // Only a due, separated retrieval advances the interval. Five rapid successes remain next-day review.
    if (first || (spaced && (summary.dueAt === null || now >= summary.dueAt))) {
      summary.reviewStage = first ? 0 : Math.min(INTERVALS.length - 1, summary.reviewStage + 1);
      summary.dueAt = stamp(now + INTERVALS[summary.reviewStage] * DAY);
      summary.lastQualifyingAt = now; summary.lastQualifyingDay = day;
    }
  } else if (attempt.correct) add(summary, 'assistedCorrect');
  if ((!attempt.independent && (attempt.answers.length > 0 || attempt.hintLevel > 0)) || attempt.outcome === 'shown') {
    summary.reviewStage = 0;
    summary.dueAt = stamp(Math.min(summary.dueAt ?? Infinity, now + DAY));
    // A support event does not count as an independent qualifying success.
  }
}
function syncLegacy(profile: LearnerProfile, attempt: Attempt, now: number) {
  const key = attempt.item.factId || attempt.item.id;
  const old = profile.skills[key] ||= { tries: 0, right: 0, hints: 0, streak: 0, last: null };
  const observed = attempt.answers.length > 0 || !!attempt.legacy;
  if (!observed && !attempt.hintLevel) return;
  old.tries = count(count(old.tries) + 1);
  old.right = count(count(old.right) + (attempt.independent ? 1 : 0));
  old.hints = count(count(old.hints) + (attempt.hintLevel > 0 ? 1 : 0));
  old.streak = attempt.independent ? count(count(old.streak) + 1) : 0;
  old.last = new Date(now).toISOString();
  const summary = (profile.learning as LearningState).facts[key];
  old.dueAt = summary.dueAt === null ? null : new Date(summary.dueAt).toISOString();
  old.lastAttempts = attempt.legacy?.reportedAttempts ?? attempt.answers.length;
  old.lastIndependent = attempt.independent;
  profile.learningEvidence ||= [];
  profile.learningEvidence.push({ fact: key, at: old.last, attempts: old.lastAttempts, independent: attempt.independent,
    helpUsed: attempt.hintLevel > 0, outcome: attempt.outcome, attemptId: attempt.id, sourceGame: attempt.context.gameId });
  profile.learningEvidence = profile.learningEvidence.slice(-500);
}
export function finishAttempt(profile: LearnerProfile, attemptId: string, outcome: Exclude<Attempt['outcome'], 'open'>, now = Date.now()): Attempt {
  now = stamp(now); const state = ensureLearning(profile, now), attempt = currentAttempt(profile, attemptId);
  if (attempt.outcome !== 'open') return attempt;
  attempt.outcome = outcome; attempt.completedAt = now;
  attempt.correct = outcome === 'completed' && (attempt.legacy ? true : attempt.answers.at(-1)?.correct === true);
  attempt.independent = attempt.correct && attempt.hintLevel === 0 && (attempt.legacy ? attempt.legacy.firstTryCorrect : attempt.answers.length === 1);
  add(state.totals, outcome);
  if (attempt.independent) { add(state.totals, 'independent'); state.support[attempt.item.skillId] = { count: 0, lastAt: now }; }
  else if (attempt.correct) add(state.totals, 'assisted');
  for (const s of summaries(state, attempt.item, now)) {
    add(s, outcome); s.lastAt = now;
    updateSchedule(s, attempt.item, attempt, now);
    if (attempt.answers.length || attempt.hintLevel || attempt.legacy) {
      s.recent.push({ independent: attempt.independent, wrong: attempt.struggleRecorded, assisted: attempt.hintLevel > 0, at: now });
      s.recent = s.recent.slice(-20);
    }
  }
  syncLegacy(profile, attempt, now);
  return attempt;
}

/** Compatibility for old callers which only supply an outcome; no invented wrong-answer strings. */
export function recordLegacyOutcome(profile: LearnerProfile, item: MathItem, firstTryCorrect: boolean, helpUsed: boolean,
  now = Date.now(), attempts = firstTryCorrect ? 1 : 2) {
  const attempt = beginAttempt(profile, item, { now, gameId: 'legacy-practice' });
  attempt.legacy = { firstTryCorrect, helpUsed, reportedAttempts: Math.max(1, count(attempts)), rawAnswersAvailable: false };
  if (helpUsed) useHint(profile, attempt.id, 1, now);
  if (!firstTryCorrect) {
    attempt.struggleRecorded = true;
    for (const s of summaries(ensureLearning(profile, now), item, now)) add(s, 'struggledPresentations');
  }
  return finishAttempt(profile, attempt.id, 'completed', now);
}

function rootFocus(profile: LearnerProfile, available: SkillDefinition[]) {
  const selected = Array.isArray(profile.skillFocus) ? profile.skillFocus.filter(id => available.some(s => s.id === id)) : [];
  if (selected.length) return available.filter(s => selected.includes(s.id));
  const focus = profile.focus;
  if (focus === 'times8') return available.filter(s => s.id === 'g3-multiply');
  const matches = available.filter(s => focus === 'times8' || focus === 'mul' ? /multiply/.test(s.id)
    : focus === 'div' ? /divide/.test(s.id) : focus === 'add' ? /add|subtract|make-ten/.test(s.id) : false);
  if (matches.length) {
    const highest = Math.max(...matches.map(s => s.grade));
    return matches.filter(s => s.grade === highest);
  }
  return available.filter(s => s.grade === profileGrade(profile));
}
function randomUnit(random: () => number) { const v = random(); return Number.isFinite(v) ? Math.min(0.999999, Math.max(0, v)) : 0; }
function selectSkill(candidates: SkillDefinition[], state: LearningState, random: () => number, preferWeak = false) {
  const recent = state.recentSkills.slice(-2);
  let pool = candidates.filter(s => !recent.includes(s.id));
  if (!pool.length) pool = candidates;
  const scored = pool.map(skill => {
    const s = state.skills[skill.id];
    const supportEvidence = evidenceState(s) === 'learning-with-support'
      ? Math.max(1, s?.recent.slice(-8).filter(x => x.wrong || x.assisted).length || 0) : 0;
    return { skill, score: (preferWeak ? Math.min(5, supportEvidence) * 4 : 0) - Math.min(3, (s?.presentations || 0) * 0.05) };
  }).sort((a, b) => b.score - a.score);
  const best = scored.filter(x => x.score >= scored[0].score - 0.1);
  return best[Math.floor(randomUnit(random) * best.length)].skill;
}
export function selectItem(profile: LearnerProfile, context: LearningContext = {}): MathItem {
  const now = stamp(context.now), random = context.random || Math.random, state = ensureLearning(profile, now), grade = profileGrade(profile);
  const available = SKILLS.filter(s => s.grade <= grade);
  if (!available.length) throw new Error('No reviewed learning activities are available.');
  const targets = (Array.isArray(profile.factTargets) ? profile.factTargets : [])
    .map(fact => legacyFactItem(fact)).filter((q): q is MathItem => !!q && q.grade <= grade);
  let focus = rootFocus(profile, available);
  if (targets.length) focus = available.filter(s => targets.some(q => q.skillId === s.id));
  else if (profile.focus === 'adaptive' && !profile.skillFocus?.some(id => available.some(s => s.id === id))) {
    // A known supporting skill can need attention even when the parent has selected a later grade scope.
    const needsSupport = available.filter(s => evidenceState(state.skills[s.id]) === 'learning-with-support');
    if (needsSupport.length) focus = needsSupport;
  }
  if (!focus.length) focus = [available[0]];
  const cycles: Record<string, SelectionPurpose[]> = {
    gentle: ['focus', 'confidence', 'review', 'confidence'],
    balanced: ['focus', 'confidence', 'focus', 'review'],
    stretch: ['focus', 'review', 'focus', 'readiness', 'confidence'],
  };
  const cycle = cycles[profile.intensity || 'balanced'] || cycles.balanced;
  const sequence = nextSequence(state, 'selectionCount');
  let purpose = cycle[sequence % cycle.length];
  let candidates: SkillDefinition[] = focus;
  let target: MathItem | undefined;
  const struggling = focus.find(s => (state.support[s.id]?.count || 0) >= 2 && s.prerequisites.length);
  if (struggling && purpose === 'focus') {
    candidates = available.filter(s => struggling.prerequisites.includes(s.id));
    if (candidates.length) { purpose = 'prerequisite'; state.support[struggling.id].count = 1; }
    else candidates = focus;
  }
  if (purpose === 'review') {
    const dueFacts = Object.entries(state.facts).filter(([id, s]) => s.dueAt !== null && s.dueAt <= now && id !== state.recentFacts.at(-1))
      .sort((a, b) => (a[1].dueAt || 0) - (b[1].dueAt || 0));
    target = dueFacts.map(([id]) => legacyFactItem(id)).find(q => q && q.grade <= grade);
    const dueSkills = available.filter(s => state.skills[s.id]?.dueAt !== null && (state.skills[s.id]?.dueAt ?? Infinity) <= now);
    candidates = dueSkills.length ? dueSkills : available.filter(s => state.skills[s.id]?.presentations > 0);
    if (!candidates.length && !target) { purpose = 'readiness'; candidates = available.filter(s => s.grade === grade); }
  }
  if (purpose === 'confidence') {
    const familiarFacts = Object.entries(state.facts)
      .filter(([id, s]) => id !== state.recentFacts.at(-1) && ['independent', 'remembered-later'].includes(evidenceState(s, true)))
      .map(([id]) => legacyFactItem(id)).filter((q): q is MathItem => !!q && q.grade <= grade);
    if (familiarFacts.length) target = familiarFacts[Math.floor(randomUnit(random) * familiarFacts.length)];
    candidates = available.filter(s => ['independent', 'remembered-later'].includes(evidenceState(state.skills[s.id])));
    if (!candidates.length && !target) {
      // With no known-success history, use a supported prerequisite probe and label it honestly.
      const supporting = new Set(focus.flatMap(s => s.prerequisites));
      candidates = available.filter(s => supporting.has(s.id));
      if (!candidates.length) candidates = available.filter(s => s.grade === Math.max(1, grade - 1));
      purpose = 'readiness';
    }
  }
  if (purpose === 'readiness' && !candidates.length) candidates = available.filter(s => s.grade === grade);
  if (purpose === 'readiness' && profile.intensity === 'stretch') {
    const onward = available.filter(s => s.prerequisites.length && s.prerequisites.every(p => ['independent', 'remembered-later'].includes(evidenceState(state.skills[p]))));
    if (onward.length) candidates = onward;
  }
  if (purpose === 'focus' && targets.length) {
    const usable = targets.filter(q => (q.factId || q.id) !== state.recentFacts.at(-1));
    const pool = usable.length ? usable : targets;
    target = pool[nextSequence(state, 'targetCursor') % pool.length];
  }
  if (!candidates.length) candidates = focus;
  const skill = target ? getSkill(target.skillId)! : selectSkill(candidates, state, random, purpose === 'focus' || purpose === 'prerequisite');
  const s = state.skills[skill.id];
  const level = evidenceState(s);
  const recent = s?.recent.slice(-4) || [];
  const successfulPractice = recent.length >= 4 && recent.every(x => x.independent) && (s?.independentItems.length || 0) >= 3;
  const needsEasierWork = (state.support[skill.id]?.count || 0) >= 2 || recent.filter(x => x.wrong || x.assisted).length >= 2;
  // Local challenge may rise after varied successful practice; that never establishes across-day retention.
  let tier = profile.intensity === 'gentle' ? 0
    : successfulPractice || ['independent', 'remembered-later'].includes(level) ? 2 : 1;
  if (purpose === 'prerequisite' || needsEasierWork) tier = 0;
  const knownPrerequisites = skill.prerequisites.every(id => ['independent', 'remembered-later'].includes(evidenceState(state.skills[id])));
  if (purpose === 'readiness' && (!knownPrerequisites || level === 'not-enough-evidence')) tier = 0;
  const forms: Representation[] = profile.intensity === 'gentle' ? ['visual', 'symbolic', 'visual', 'story'] : ['symbolic', 'visual', 'story'];
  const representation = forms[sequence % forms.length];
  const factId = target?.factId || (profile.focus === 'times8' && purpose === 'focus' && skill.id === 'g3-multiply'
    ? `mul:8x${2 + (nextSequence(state, 'targetCursor') % 9)}` : undefined);
  let item: MathItem | undefined;
  for (let i = 0; i < 8; i++) {
    // Deterministic clocks/random sources remain supported, while repeated selections can vary templates.
    let calls = 0;
    const varied = () => (randomUnit(random) + ((sequence + i) * 0.61803398875 + calls++ * 0.137)) % 1;
    const candidate = generateItem(skill.id, { random: varied, tier, representation, factId });
    item = candidate;
    if (!state.recentItems.slice(-4).includes(candidate.id) && (!factId || sequence % 4 === 0 || candidate.factId !== state.recentFacts.at(-1))) break;
  }
  if (!item) throw new Error('Could not prepare a reviewed activity.');
  item.purpose = purpose;
  state.recentItems = [...state.recentItems, item.id].slice(-12);
  state.recentFacts = [...state.recentFacts, item.factId || item.id].slice(-12);
  state.recentSkills = [...state.recentSkills, item.skillId].slice(-12);
  profile.lastFact = item.factId || item.id;
  return item;
}

export function report(profile: LearnerProfile, now = Date.now()): LearningReport {
  now = stamp(now); const state = ensureLearning(profile, now), grade = profileGrade(profile);
  const skills: SkillReport[] = SKILLS.filter(s => s.grade <= grade).map(skill => {
    const s = state.skills[skill.id], status = evidenceState(s);
    const patterns = (s?.patterns || []).filter(p => p.count >= 2 && p.itemKeys.length >= 2);
    return { id: skill.id, title: skill.title, grade: skill.grade, state: status, label: PROGRESS_LABELS[status],
      evidence: !s || s.recent.length < 3 ? 'limited' : s.independentDays.length >= 2 ? 'across-days' : 'developing',
      presentations: s?.presentations || 0, independent: s?.independentCorrect || 0, assisted: s?.assistedCorrect || 0,
      errors: s?.incorrectResponses || 0, distinctDays: s?.independentDays.length || 0,
      representations: s?.independentForms || [], dueAt: s?.dueAt ?? null,
      reviewDue: s?.dueAt !== null && (s?.dueAt ?? Infinity) <= now,
      independentAccuracy: s && s.firstAttemptCount >= 5 ? Math.round(100 * s.firstAttemptCorrect / s.firstAttemptCount) : null,
      hypotheses: patterns.map(p => p.kind === 'addition-for-multiplication'
        ? 'Possible confusion between adding and equal groups; check with a representation.'
        : 'Some answers match a neighboring multiplication fact; check a related example.'), migrated: !!s?.migrated };
  });
  return { grade, totals: { ...state.totals }, skills,
    due: skills.filter(s => s.reviewDue), support: skills.filter(s => s.state === 'learning-with-support'),
    unknown: skills.filter(s => s.state === 'not-enough-evidence'),
    activeAttempts: state.attempts.filter(a => a.outcome === 'open').length, recentAttempts: state.attempts.slice(-12) };
}

export function questionRate(profile: LearnerProfile) { return Math.max(1, Math.min(8, Math.floor(Number(profile.rate) || 3))); }
export function canAsk(profile: LearnerProfile, now = Date.now()) {
  now = stamp(now); const rate = questionRate(profile);
  profile.mathWindow = (Array.isArray(profile.mathWindow) ? profile.mathWindow : []).filter(t => Number.isFinite(t) && t > now - 600_000 && t <= now);
  if (profile.mathWindow.length >= rate) return false;
  const last = profile.mathWindow.at(-1);
  return last === undefined || now - last >= Math.max(30_000, 600_000 / (rate * 2));
}
export function didAsk(profile: LearnerProfile, now = Date.now()) {
  now = stamp(now);
  profile.mathWindow = (Array.isArray(profile.mathWindow) ? profile.mathWindow : []).filter(t => Number.isFinite(t) && t > now - 600_000 && t <= now);
  profile.mathWindow.push(now);
}

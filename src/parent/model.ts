import type {Grade} from '../learning/grades';
/** Read-only parent reporting over existing host evidence. No new scoring or storage. */
import type { Attempt } from '../learning/engine';
import type { LanguageAttempt } from '../language/engine';
import type { ParentReport, ParentSkill } from '../learning/insights';
import type { CreationWorkspace } from '../creation/storage';
import { getSkill } from '../learning/curriculum';
import { getLanguageSkill } from '../language/curriculum';
import { CREATION_CHALLENGES, getCreationChallenge } from '../creation/challenges';
import { APS_SKILL_LABELS, validateProblemSolvingEpisode } from '../problem-solving/model';

export type ParentRange = 7 | 30 | 90 | 'all';
export type ParentSubjectId = 'math' | 'language' | 'creation' | 'problem-solving';
export type ParentUnavailableReason = 'not-connected' | 'read-error';
export type ParentAvailability = 'available' | ParentUnavailableReason;
export interface ParentLearningSnapshot<T> {
  /** The profile that supplied BOTH the report and retained attempts. */
  ownerId: string;
  report: ParentReport;
  attempts: readonly T[];
}
export interface ParentDashboardInput {
  ownerId: string;
  range?: ParentRange;
  now?: number;
  math?: ParentLearningSnapshot<Attempt>;
  language?: ParentLearningSnapshot<LanguageAttempt>;
  /** The validated CreationStore snapshot; ownership is filtered before joining. */
  creation?: CreationWorkspace;
  /** Optional trusted bridge. Its versioned records are checked again here. */
  problemSolving?: { ownerId: string; episodes: readonly unknown[]; discarded?: number };
  /** Preserve absence versus read failure; a failed source contributes no results. */
  unavailable?: Partial<Record<ParentSubjectId, ParentUnavailableReason>>;
}
export interface ParentPeriodCounts {
  records: number;
  completed: number;
  independent: number;
  supported: number;
  firstResponses: number;
  firstCorrect: number;
  firstUnaidedResponses: number;
  firstUnaidedCorrect: number;
  retries: number;
  withHint: number;
  readAloud: number;
  shown: number;
  interrupted: number;
  skipped: number;
  open: number;
  explored: number;
  incorrect: number;
  noContentHelp: number;
  withContentHelp: number;
  unknownAttribution: number;
  matchedWithoutHint: number;
  matchedWithHint: number;
}
export interface ParentEvidence {
  id: string;
  subject: ParentSubjectId;
  skillId: string;
  skillTitle: string;
  grade?: Grade;
  standards: string[];
  at: number;
  prompt: string;
  passage?: string;
  firstResponse: string | null;
  finalResponse: string | null;
  firstCorrect: boolean | null;
  firstUnaided: boolean;
  outcome: string;
  outcomeLabel: string;
  completed: boolean;
  independent: boolean;
  support: string[];
  hintUsed: boolean;
  readAloud: boolean;
  retried: boolean;
  observation: string;
  context: {
    gameId?: string; projectId?: string; revisionId?: string; itemId?: string; form?: string; tier?: number;
    source?: string; taskFamily?: string; taskVersion?: string; demand?: string;
    exposure?: 'first-seen' | 'repeat' | 'unknown'; firstAttempt?: boolean;
  };
  /** The same exact scene/version/goal counts once in summary; history is retained. */
  overviewKey: string;
  contextOnly?: boolean;
  attribution?: 'no-content-help-recorded' | 'supported' | 'unknown';
  provenance?: { authorship: string; support: string; elicitation: string };
}
export interface ParentSkillRow {
  id: string;
  subject: ParentSubjectId;
  title: string;
  grade?: Grade;
  standards: string[];
  state: string;
  stateLabel: string;
  stateBasis: 'all-recorded-practice' | 'selected-period-checks';
  recordedPresentations: number;
  period: ParentPeriodCounts;
  evidenceIds: string[];
  reviewDue: boolean;
  dueAt: number | null;
  note: string;
}
export interface ParentTrendDay {
  key: string;
  at: number;
  records: number;
  independent: number;
  supported: number;
  completed: number;
  matchedWithoutHint: number;
  matchedWithHint: number;
}
export interface ParentOpportunity {
  id: string;
  subject: ParentSubjectId;
  skillId: string;
  title: string;
  reason: string;
  action: string;
  prompt: string;
  basis: 'review-due' | 'recorded-support' | 'try-again';
  evidenceIds: string[];
}
export interface ParentSubjectReport {
  id: ParentSubjectId;
  title: string;
  available: boolean;
  availability: ParentAvailability;
  period: ParentPeriodCounts;
  /** All selected records including repeated identical scene checks. */
  historyRecords: number;
  /** Unscored source/interruption records, separate from structured decisions. */
  contextRecords: number;
  contextBySource: Record<string, number>;
  collapsedChecks: number;
  latestAt: number | null;
  skills: ParentSkillRow[];
  trend: ParentTrendDay[];
  notices: string[];
}
export interface ParentDashboard {
  ownerId: string;
  range: ParentRange;
  from: number | null;
  through: number;
  subjects: ParentSubjectReport[];
  evidence: ParentEvidence[];
  opportunities: ParentOpportunity[];
  comparisons: ParentExamplePair[];
  notes: string[];
}
export interface ParentExamplePair {
  subject: 'math' | 'language'; skillId: string; title: string;
  earlierId: string; laterId: string; earlierAt: number; laterAt: number;
  form: string; tier: number; conditionNote: string;
}

/** Recorded help/correction can matter even when an activity was not completed. */
export function hasRecordedSupport(skill: Pick<ParentSkillRow, 'subject' | 'period'>): boolean {
  const counts = skill.period;
  if (skill.subject === 'creation') return counts.withHint > 0;
  if (skill.subject === 'problem-solving') return counts.withContentHelp > 0;
  return counts.supported + counts.withHint + counts.readAloud + counts.shown + counts.retries > 0;
}

const TITLES: Record<ParentSubjectId, string> = {
  math: 'Math', language: 'Language Arts', creation: 'Computational Thinking', 'problem-solving': 'Problem Solving',
};
const PS_LABELS: Record<string, string> = APS_SKILL_LABELS;
const STATES: Record<string, string> = {
  'not-enough-evidence': 'Not enough evidence yet', discovering: 'Not enough evidence yet',
  'learning-with-support': 'Practising with support', independent: 'Observed independently in practice',
  'remembered-later': 'Observed again after a break',
};
const emptyCounts = (): ParentPeriodCounts => ({
  records: 0, completed: 0, independent: 0, supported: 0, firstResponses: 0, firstCorrect: 0,
  firstUnaidedResponses: 0, firstUnaidedCorrect: 0, retries: 0, withHint: 0, readAloud: 0,
  shown: 0, interrupted: 0, skipped: 0, open: 0, explored: 0, incorrect: 0,
  noContentHelp: 0, withContentHelp: 0, unknownAttribution: 0,
  matchedWithoutHint: 0, matchedWithHint: 0,
});
const timestamp = (value: unknown, now: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= now;
const dateKey = (at: number) => {
  const date = new Date(at);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
};
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown, max = 4000): value is string => typeof value === 'string' && value.length <= max;
const clean = (value: unknown, max = 4000) => string(value, max) ? value : '';
const dateStamp = (value: unknown, now: number) => {
  if (!string(value, 40) || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const parsed = Date.parse(value); return timestamp(parsed, now) ? parsed : null;
};

function countEvidence(records: readonly ParentEvidence[]): ParentPeriodCounts {
  const counts = emptyCounts();
  for (const record of records) {
    if (record.contextOnly) continue;
    counts.records++;
    if (record.completed) {
      counts.completed++;
      if (record.independent) counts.independent++;
      else if (record.subject === 'math' || record.subject === 'language') counts.supported++;
      if (record.subject === 'creation') record.hintUsed ? counts.matchedWithHint++ : counts.matchedWithoutHint++;
    }
    if (record.firstCorrect !== null) {
      counts.firstResponses++;
      if (record.firstCorrect) counts.firstCorrect++;
      if (record.firstUnaided) {
        counts.firstUnaidedResponses++;
        if (record.firstCorrect) counts.firstUnaidedCorrect++;
      }
    }
    if (record.retried) counts.retries++;
    if (record.hintUsed) counts.withHint++;
    if (record.readAloud) counts.readAloud++;
    if (['shown', 'interrupted', 'skipped', 'open', 'explored', 'incorrect'].includes(record.outcome)) {
      counts[record.outcome as 'shown' | 'interrupted' | 'skipped' | 'open' | 'explored' | 'incorrect']++;
    }
    if (record.subject === 'problem-solving' && ['demonstrated', 'not-yet'].includes(record.outcome)) {
      if (record.attribution === 'no-content-help-recorded') counts.noContentHelp++;
      else if (record.attribution === 'unknown') counts.unknownAttribution++;
      else counts.withContentHelp++;
    }
  }
  return counts;
}

function practiceEvidence(subject: 'math' | 'language', attempts: readonly (Attempt | LanguageAttempt)[], now: number): ParentEvidence[] {
  const result: ParentEvidence[] = [], seen = new Set<string>();
  for (const attempt of attempts) {
    if (!attempt || seen.has(attempt.id) || !string(attempt.id, 180) || !timestamp(attempt.startedAt, now)) continue;
    const end = subject === 'math' ? (attempt as Attempt).completedAt : (attempt as LanguageAttempt).finishedAt;
    if (end !== undefined && (!timestamp(end, now) || end < attempt.startedAt)) continue;
    const at = end ?? attempt.startedAt;
    if (!Array.isArray(attempt.answers) || attempt.answers.some(a => !timestamp(a.at, now) || a.at < attempt.startedAt || (end !== undefined && a.at > end))) continue;
    const math = subject === 'math' ? attempt as Attempt : null;
    const language = subject === 'language' ? attempt as LanguageAttempt : null;
    const definition = math ? getSkill(attempt.item.skillId) : getLanguageSkill(attempt.item.skillId);
    if (!definition) continue;
    seen.add(attempt.id);
    const hints = math ? math.hintEvents.map(h => h.at) : language!.hints.map(h => h.at);
    if (hints.some(time => !timestamp(time, now) || time < attempt.startedAt || (end !== undefined && time > end))) continue;
    const hintUsed = math ? math.hintLevel > 0 || !!math.legacy?.helpUsed : language!.hintDepth > 0;
    const readAloud = language?.readTargetAt !== undefined;
    if (readAloud && (!timestamp(language!.readTargetAt, now) || language!.readTargetAt! < attempt.startedAt || (end !== undefined && language!.readTargetAt! > end))) continue;
    const legacy = !!math?.legacy;
    const first = legacy ? undefined : attempt.answers[0];
    const last = legacy ? undefined : attempt.answers.at(-1);
    // A missing hint timestamp cannot prove the first response preceded that hint.
    const firstUnaided = !!first && !(hintUsed && (!hints.length || hints.some(time => time <= first.at)))
      && !(readAloud && language!.readTargetAt! <= first.at);
    const retried = (math?.legacy?.reportedAttempts ?? attempt.answers.length) > 1;
    const completed = attempt.outcome === 'completed' && attempt.correct;
    const independent = completed && attempt.independent && !hintUsed && !readAloud && !retried;
    const support: string[] = [];
    if (hintUsed) support.push('Strategy or answer hint recorded');
    if (readAloud) support.push('Target read aloud');
    if (retried) support.push('Another response recorded');
    if (!support.length) support.push('No in-app help recorded');
    if (legacy) support.push('Older summary; original responses unavailable');
    let outcomeLabel = 'No completed result yet', observation = 'This activity is still open. No result was inferred.';
    if (completed) {
      outcomeLabel = independent ? 'First-response success' : hintUsed ? 'Completed with a hint' : readAloud ? 'Completed with read-aloud support' : 'Completed after another try';
      observation = independent ? 'Answered correctly on the first recorded response without an in-app hint.'
        : readAloud ? 'Completed with the target read aloud. This is supported language practice, not independent reading evidence.'
        : hintUsed ? 'Completed this activity with a recorded hint.' : 'Completed this activity after another response.';
      if (legacy) observation = independent ? 'An older record reports first-try success without recorded help; original responses are unavailable.'
        : 'An older record reports supported completion; original responses are unavailable.';
    } else if (attempt.outcome === 'explored') {
      outcomeLabel = 'Writing explored'; observation = 'Saved a writing response. Writing quality was not automatically graded.';
    } else if (attempt.outcome === 'shown') {
      outcomeLabel = 'Worked example viewed'; observation = 'Viewed a worked example. This is not a recorded independent success.';
    } else if (attempt.outcome === 'interrupted') {
      outcomeLabel = 'Activity interrupted'; observation = 'Left the activity before completing it. No incorrect result was inferred.';
    } else if (attempt.outcome === 'skipped') {
      outcomeLabel = 'Activity skipped'; observation = 'Skipped this activity. No incorrect result was inferred.';
    } else if (attempt.outcome === 'incorrect') {
      outcomeLabel = 'Another approach to explore'; observation = 'The recorded response did not match this activity’s answer.';
    }
    result.push({
      id: `${subject}:${attempt.id}`, subject, skillId: definition.id, skillTitle: definition.title,
      grade: definition.grade, standards: [...definition.standards], at,
      prompt: attempt.item.question, ...(language?.item.passage ? { passage: language.item.passage } : {}),
      firstResponse: first?.raw ?? null,
      finalResponse: language?.outcome === 'explored' ? language.draft ?? null : last?.raw ?? null,
      firstCorrect: first?.correct ?? null, firstUnaided, outcome: attempt.outcome,
      outcomeLabel, completed, independent, support, hintUsed, readAloud, retried, observation,
      context: { gameId: attempt.context.gameId, projectId: attempt.context.projectId,
        revisionId: attempt.context.versionId, itemId: attempt.item.id,
        form: math?.item.representation ?? language?.item.form, tier: attempt.item.tier },
      overviewKey: `${subject}:${attempt.id}`,
    });
  }
  return result;
}

function creationEvidence(workspace: CreationWorkspace | undefined, owner: string, now: number): ParentEvidence[] {
  if (!workspace) return [];
  const projects = new Map(workspace.projects.filter(p => p.owner === owner).map(p => [p.id, p]));
  const revisions = new Map(workspace.revisions.filter(r => projects.has(r.projectId)).map(r => [r.id, r]));
  const seen = new Set<string>(), result: ParentEvidence[] = [];
  for (const check of workspace.attempts) {
    if (!projects.has(check.projectId) || seen.has(check.id)) continue;
    const revision = revisions.get(check.revisionId), project = projects.get(check.projectId)!;
    const at = dateStamp(check.checkedAt, now), challenge = getCreationChallenge(check.challengeId);
    if (at === null || !revision || revision.projectId !== check.projectId || project.challengeId !== check.challengeId || !challenge) continue;
    const revisionAt = dateStamp(revision.createdAt, now);
    if (revisionAt === null || revisionAt > at) continue;
    seen.add(check.id);
    const support = [check.hintUsed ? 'A hint was opened for this scene' : 'No hint recorded for this scene'];
    const origin = revision.scene.provenance?.createdBy;
    if (origin === 'starter') support.push('Started from a supplied scene');
    else if (origin === 'assisted') support.push('Assisted scene origin');
    else if (origin !== 'child') support.push('Scene authorship not fully recorded');
    result.push({
      id: `creation:${check.id}`, subject: 'creation', skillId: check.challengeId, skillTitle: challenge.title,
      standards: [], at, prompt: challenge.brief, firstResponse: null, finalResponse: revision.scene.title,
      firstCorrect: null, firstUnaided: false, outcome: check.passed ? 'matched' : 'needs-work',
      outcomeLabel: check.passed ? 'Matched this scene goal' : 'Still trying this scene goal',
      completed: check.passed, independent: false, support, hintUsed: check.hintUsed,
      readAloud: false, retried: false,
      observation: `${check.passed ? 'This saved version matched' : 'This saved version did not yet match'} “${challenge.title}”${check.hintUsed ? ' with a hint recorded for this scene' : '; no hint was recorded for this scene'}. The check describes this version, not general coding mastery.`,
      context: { projectId: check.projectId, revisionId: check.revisionId, itemId: check.challengeId, form: challenge.concepts.join(', ') },
      overviewKey: JSON.stringify([check.projectId, check.revisionId, check.challengeId]),
    });
  }
  return result;
}

function problemEvidence(snapshot: ParentDashboardInput['problemSolving'], owner: string, now: number): ParentEvidence[] {
  if (!snapshot) return [];
  const seen = new Set<string>(), records: ParentEvidence[] = [];
  for (const value of snapshot.episodes) {
    let raw;
    try { raw = validateProblemSolvingEpisode(value); } catch { continue; }
    if (raw.owner !== owner || seen.has(raw.id)) continue;
    const start = dateStamp(raw.startedAt, now), finish = dateStamp(raw.completedAt, now);
    if (start === null || finish === null || finish < start) continue;
    if (raw.status !== undefined && !['completed', 'interrupted', 'technical-invalid'].includes(raw.status)) continue;
    seen.add(raw.id);
    const contextOnly = raw.kind === 'context-only' || raw.status === 'interrupted' || raw.status === 'technical-invalid'
      || raw.observations.every(observation => observation.outcome === 'unobserved');
    if (contextOnly) {
      records.push({
        id: `problem-solving:${raw.id}`, subject: 'problem-solving', skillId: 'source-context', skillTitle: 'Activity context',
        standards: [], at: finish, prompt: raw.task.label, firstResponse: null, finalResponse: null,
        firstCorrect: null, firstUnaided: false, outcome: raw.status === 'interrupted' ? 'interrupted' : raw.status === 'technical-invalid' ? 'technical-invalid' : raw.kind === 'context-only' ? 'context-only' : 'unobserved',
        outcomeLabel: raw.status === 'technical-invalid' ? 'Technical issue; no skill result' : raw.status === 'interrupted' ? 'Interrupted; no skill result' : raw.kind === 'context-only' ? 'Context only; unscored' : 'No scored decision recorded',
        completed: false, independent: false, support: ['No skill result inferred'], hintUsed: false, readAloud: false,
        retried: false, observation: clean(raw.context) || 'This activity supplies context, not a scored problem-solving observation.',
        context: { itemId: raw.task.id, source: raw.source, taskFamily: raw.task.family,
          taskVersion: raw.task.version, demand: clean(raw.task.demand, 240),
          exposure: raw.task.exposure, firstAttempt: raw.task.firstAttempt, form: clean(raw.task.version, 100) },
        overviewKey: `problem-solving:${raw.id}`, contextOnly: true,
      });
      continue;
    }
    const skillSeen = new Set<string>();
    for (const observation of raw.observations) {
      if (!object(observation) || !Object.hasOwn(PS_LABELS, observation.skill) || skillSeen.has(observation.skill)
        || !['demonstrated', 'not-yet', 'unobserved'].includes(observation.outcome)
        || !['learner', 'shared', 'helper', 'unknown'].includes(observation.authorship)
        || !['none-observed', 'access-only', 'strategy', 'solution', 'unknown'].includes(observation.support)
        || !['prompted', 'spontaneous', 'unknown'].includes(observation.elicitation)) continue;
      const at = dateStamp(observation.observedAt, now);
      if (at === null || at < start || at > finish || observation.outcome === 'unobserved') continue;
      skillSeen.add(observation.skill);
      // Match the existing evidence contract: known help/shared authorship remains supported,
      // even when a different part of provenance is unknown.
      const knownSupport = ['helper', 'shared'].includes(observation.authorship) || ['strategy', 'solution'].includes(observation.support);
      const attributionUnknown = !knownSupport && (observation.authorship === 'unknown' || observation.support === 'unknown');
      const noContentHelp = observation.authorship === 'learner' && ['none-observed', 'access-only'].includes(observation.support);
      const support = [attributionUnknown ? 'Help or authorship unknown' : noContentHelp
        ? observation.support === 'access-only' ? 'Access support only recorded' : 'No content help recorded'
        : observation.authorship === 'helper' ? 'Helper-authored response' : observation.authorship === 'shared'
          ? 'Shared work' : observation.support === 'solution' ? 'Answer help recorded' : 'Strategy help recorded'];
      if (observation.authorship === 'unknown' && !support.includes('Help or authorship unknown')) support.push('Authorship unknown');
      if (observation.support === 'unknown' && !support.includes('Help or authorship unknown')) support.push('Help not fully recorded');
      if (observation.support === 'strategy' && !support.includes('Strategy help recorded')) support.push('Strategy help recorded');
      if (observation.support === 'solution' && !support.includes('Answer help recorded')) support.push('Answer help recorded');
      if (observation.support === 'access-only' && !support.includes('Access support only recorded')) support.push('Access support recorded');
      support.push(observation.elicitation === 'prompted' ? 'Prompted decision' : observation.elicitation === 'spontaneous' ? 'Spontaneous decision recorded' : 'Prompting not recorded');
      const note = clean(observation.note);
      records.push({
        id: `problem-solving:${raw.id}:${observation.skill}`, subject: 'problem-solving',
        skillId: observation.skill, skillTitle: PS_LABELS[observation.skill], standards: [], at,
        prompt: raw.task.label, firstResponse: null, finalResponse: note || null,
        firstCorrect: null, firstUnaided: false, outcome: observation.outcome,
        outcomeLabel: observation.outcome === 'demonstrated' ? 'Matched this activity rule' : 'Another approach to explore',
        completed: observation.outcome === 'demonstrated', independent: false, support,
        hintUsed: ['strategy', 'solution'].includes(observation.support), readAloud: false, retried: false,
        observation: `${PS_LABELS[observation.skill]}: ${observation.outcome === 'demonstrated' ? 'matched this activity rule' : 'did not yet match this activity rule'}. ${support[0]}.${note ? ' ' + note : ''}`,
        context: { itemId: raw.task.id, form: `${raw.task.version}${string(raw.task.variant, 100) ? ' · ' + raw.task.variant : ''}`,
          source: raw.source, taskFamily: raw.task.family, taskVersion: raw.task.version,
          demand: clean(raw.task.demand, 240), exposure: raw.task.exposure, firstAttempt: raw.task.firstAttempt },
        overviewKey: `problem-solving:${raw.id}:${observation.skill}`,
        attribution: noContentHelp ? 'no-content-help-recorded' : attributionUnknown ? 'unknown' : 'supported',
        provenance: { authorship: observation.authorship, support: observation.support, elicitation: observation.elicitation },
      });
    }
  }
  return records;
}

function distinctChecks(evidence: readonly ParentEvidence[]): ParentEvidence[] {
  const known = new Set<string>();
  return evidence.filter(e => { if (known.has(e.overviewKey)) return false; known.add(e.overviewKey); return true; });
}
function trendFor(evidence: readonly ParentEvidence[]): ParentTrendDay[] {
  const grouped = new Map<string, ParentEvidence[]>();
  for (const record of evidence) {
    if (record.contextOnly) continue;
    const key = dateKey(record.at), day = grouped.get(key) ?? [];
    day.push(record); grouped.set(key, day);
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, rows]) => {
    const counts = countEvidence(rows), date = new Date(rows[0].at); date.setHours(0, 0, 0, 0);
    return { key, at: date.getTime(), records: counts.records, independent: counts.independent, supported: counts.supported, completed: counts.completed,
      matchedWithoutHint: counts.matchedWithoutHint, matchedWithHint: counts.matchedWithHint };
  });
}
function learningSkills(subject: 'math' | 'language', report: ParentReport | undefined, evidence: readonly ParentEvidence[], now: number): ParentSkillRow[] {
  return (report?.skills ?? []).map((skill: ParentSkill) => {
    const rows = evidence.filter(e => e.skillId === skill.id), definition = subject === 'math' ? getSkill(skill.id) : getLanguageSkill(skill.id);
    return {
      id: skill.id, subject, title: skill.title, grade: skill.grade, standards: [...definition?.standards ?? []],
      state: skill.presentations > 0 ? skill.state : 'not-observed',
      stateLabel: skill.presentations > 0 ? STATES[skill.state] ?? 'Not enough evidence yet' : 'Not observed yet',
      stateBasis: 'all-recorded-practice', recordedPresentations: skill.presentations, period: countEvidence(rows),
      evidenceIds: rows.map(e => e.id), reviewDue: skill.presentations > 0 && skill.reviewDue && timestamp(skill.dueAt, now),
      dueAt: typeof skill.dueAt === 'number' && Number.isFinite(skill.dueAt) ? skill.dueAt : null,
      note: skill.presentations === 0 ? 'No recorded opportunity yet; this is not an area of weakness.'
        : 'Current practice state uses all recorded skill history. The counts beside it use the selected period and retained detailed records.',
    };
  });
}
function observedSkills(subject: 'creation' | 'problem-solving', evidence: readonly ParentEvidence[]): ParentSkillRow[] {
  const definitions = subject === 'creation' ? CREATION_CHALLENGES.map(c => ({ id: c.id as string, title: c.title }))
    : Object.entries(PS_LABELS).map(([id, title]) => ({ id, title }));
  return definitions.map(definition => {
    const rows = evidence.filter(e => e.skillId === definition.id && !e.contextOnly), matches = rows.filter(e => e.completed).length;
    return { id: definition.id, subject, title: definition.title, standards: [],
      state: !rows.length ? 'not-observed' : matches ? 'task-observed' : 'still-exploring',
      stateLabel: !rows.length ? 'Not observed in this period' : matches ? 'Specific task evidence recorded' : 'Still exploring this task',
      stateBasis: 'selected-period-checks', recordedPresentations: rows.length, period: countEvidence(rows),
      evidenceIds: rows.map(e => e.id), reviewDue: false, dueAt: null,
      note: !rows.length ? 'No qualifying observation here; no difficulty or ability is inferred.'
        : subject === 'creation' ? 'Matched versions and hints describe these scene goals. Starter and assisted work may be included.'
          : 'These are recorded activity-rule results, separated by help and authorship. They do not establish general thinking ability.',
    };
  });
}

function comparableExamples(evidence: readonly ParentEvidence[]): ParentExamplePair[] {
  const used = new Set<string>(), pairs: ParentExamplePair[] = [];
  const eligible = evidence.filter(e => (e.subject === 'math' || e.subject === 'language') && e.firstCorrect !== null
    && e.firstResponse !== null && ['completed', 'incorrect', 'shown'].includes(e.outcome));
  for (const latest of eligible) {
    const key = `${latest.subject}:${latest.skillId}`;
    if (used.has(key)) continue;
    // Choose the latest qualifying record before seeking a prior comparison. Never search
    // for a more successful later record, or claim a missing matched pair is a decline.
    used.add(key);
    if (latest.context.tier === undefined || !latest.context.form) continue;
    const earlier = eligible.filter(e => e.subject === latest.subject && e.skillId === latest.skillId
      && e.context.tier === latest.context.tier && e.context.form === latest.context.form
      && e.at < latest.at && dateKey(e.at) !== dateKey(latest.at)).at(-1);
    if (!earlier) continue;
    const conditionsMatch = earlier.hintUsed === latest.hintUsed && earlier.readAloud === latest.readAloud
      && earlier.firstUnaided === latest.firstUnaided;
    pairs.push({ subject: latest.subject as 'math' | 'language', skillId: latest.skillId, title: latest.skillTitle,
      earlierId: earlier.id, laterId: latest.id, earlierAt: earlier.at, laterAt: latest.at,
      form: latest.context.form, tier: latest.context.tier,
      conditionNote: `Same recorded skill, practice tier, and format on different dates. ${conditionsMatch
        ? 'Recorded help conditions match.' : 'Recorded help conditions differ; compare the support notes.'} These tasks are not equated test forms and do not measure a learning gain.`,
    });
  }
  return pairs.slice(0, 6);
}

/** Calendar-day windows use the browser's local date. "all" means retained records, not lifetime history. */
export function buildParentDashboard(input: ParentDashboardInput): ParentDashboard {
  const now = input.now ?? Date.now(), range = input.range ?? 30;
  if (!timestamp(now, 253_402_300_799_999) || ![7, 30, 90, 'all'].includes(range)) throw new RangeError('Choose a valid parent report date range.');
  if (!input.ownerId || [input.math, input.language, input.problemSolving].some(snapshot => snapshot && snapshot.ownerId !== input.ownerId)) {
    throw new Error('Player changed. Reopen the parent report for the selected profile.');
  }
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  if (range !== 'all') start.setDate(start.getDate() - range + 1);
  const from = range === 'all' ? null : start.getTime();
  const mathSource = input.unavailable?.math ? undefined : input.math;
  const languageSource = input.unavailable?.language ? undefined : input.language;
  const creationSource = input.unavailable?.creation ? undefined : input.creation;
  const problemSource = input.unavailable?.['problem-solving'] ? undefined : input.problemSolving;
  const allEvidence = [
    ...practiceEvidence('math', mathSource?.attempts ?? [], now),
    ...practiceEvidence('language', languageSource?.attempts ?? [], now),
    ...creationEvidence(creationSource, input.ownerId, now),
    ...problemEvidence(problemSource, input.ownerId, now),
  ].sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
  const evidence = allEvidence.filter(e => from === null || e.at >= from);
  const subjects = (Object.keys(TITLES) as ParentSubjectId[]).map(id => {
    const rows = evidence.filter(e => e.subject === id), overview = id === 'creation' ? distinctChecks(rows) : rows;
    const snapshot = id === 'math' ? mathSource : id === 'language' ? languageSource : null;
    const availability: ParentAvailability = input.unavailable?.[id] ??
      (snapshot || id === 'creation' && creationSource || id === 'problem-solving' && problemSource ? 'available' : 'not-connected');
    const notices = id === 'math' || id === 'language'
      ? ['Date-filtered counts use retained detailed activities (up to 120 per subject). Older skill summaries may remain after detailed records expire.',
        'First-response results and eventual completion are different. A retry, hint, or read-aloud remains visible.',
        'Activities adapt and may differ in difficulty. This activity chart is not a measured learning-gain score.']
      : id === 'creation' ? ['Repeated checks of the same saved version and goal count once in the summary; each check remains in the evidence list.',
        'No hint recorded does not prove unaided authorship. These checks do not establish general coding mastery.']
        : ['Only completed structured activities contribute skill observations. Source context, interrupted work, and technical failures do not count as wrong.',
          'No content help recorded includes access support; help outside the app may not be recorded. These are not standardized scores.',
          'The first scored response for each skill is retained; a later retry does not replace it. Revising an idea is a separate decision. The current activities sample planning a test, using a result, and revising an idea.'];
    if (availability === 'read-error') notices.unshift('Saved records could not be read. No performance result is inferred; existing data has not been changed.');
    else if (id === 'problem-solving' && availability === 'not-connected') notices.unshift('The problem-solving evidence provider is not connected in this build. No performance result is inferred.');
    if (id === 'problem-solving' && problemSource && Number.isSafeInteger(problemSource.discarded) && problemSource.discarded! > 0) notices.push(`${problemSource.discarded} older middle records were removed by the existing retention limit.`);
    const contextRows = rows.filter(row => row.contextOnly);
    const contextBySource: Record<string, number> = {};
    for (const row of contextRows) { const source = row.context.source || 'unknown'; contextBySource[source] = (contextBySource[source] || 0) + 1; }
    return {
      id, title: TITLES[id], available: availability === 'available', availability,
      period: countEvidence(overview), historyRecords: rows.length, collapsedChecks: id === 'creation' ? rows.length - overview.length : 0,
      contextRecords: contextRows.length, contextBySource,
      latestAt: rows[0]?.at ?? null,
      skills: id === 'math' || id === 'language' ? learningSkills(id, snapshot?.report, rows, now) : observedSkills(id, overview),
      trend: trendFor(overview), notices,
    } satisfies ParentSubjectReport;
  });
  const opportunities: ParentOpportunity[] = [];
  for (const subject of subjects) {
    for (const skill of subject.skills) {
      const skillEvidence = evidence.filter(e => e.subject === subject.id && e.skillId === skill.id && !e.contextOnly);
      const supportedEvidence = skillEvidence.filter(e => (e.completed && !e.independent) || e.retried || e.hintUsed || e.readAloud || ['shown', 'incorrect'].includes(e.outcome));
      if (skill.reviewDue) opportunities.push({
        id: `review:${subject.id}:${skill.id}`, subject: subject.id, skillId: skill.id, title: `Revisit ${skill.title}`,
        reason: 'The existing practice schedule says this skill is ready for a later check.',
        action: 'Offer one fresh example before showing a hint. Keep help available if it is useful.',
        prompt: 'What do you remember about how you worked this out?', basis: 'review-due', evidenceIds: skill.evidenceIds.slice(0, 2),
      });
      else if ((subject.id === 'math' || subject.id === 'language') && (skill.period.supported > 0 || skill.period.shown > 0 || skill.period.incorrect > 0)) opportunities.push({
        id: `support:${subject.id}:${skill.id}`, subject: subject.id, skillId: skill.id, title: `Explore ${skill.title} together`,
        reason: 'Selected-period records include a retry, recorded support, a worked example, or an answer that did not match.',
        action: 'Try one short example together, then offer a different example on a later day.',
        prompt: subject.id === 'math' ? 'Can you show me another way to work it out?' : 'What clue helped you choose your answer?',
        basis: 'recorded-support', evidenceIds: supportedEvidence.slice(0, 2).map(e => e.id),
      });
      else if (subject.id === 'creation' && evidence.find(e => e.subject === subject.id && e.skillId === skill.id)?.outcome === 'needs-work') opportunities.push({
        id: `scene:${skill.id}`, subject: subject.id, skillId: skill.id, title: `Try another idea for ${skill.title}`,
        reason: 'A saved version did not yet match this particular scene goal.',
        action: 'Open the checked scene and change one action, then check what happens.',
        prompt: 'Where does your scene first do something different from the target?', basis: 'try-again',
        evidenceIds: skillEvidence.filter(e => e.outcome === 'needs-work').slice(0, 2).map(e => e.id),
      });
      else if (subject.id === 'problem-solving' && skillEvidence[0]?.outcome === 'not-yet'
        && skillEvidence[0]?.provenance?.authorship === 'learner') opportunities.push({
        id: `reasoning:${skill.id}`, subject: subject.id, skillId: skill.id, title: `Explore how to ${skill.title.toLowerCase()}`,
        reason: 'A recorded learner response did not yet match this particular activity rule.',
        action: skill.id === 'plan_test' ? 'Try one short experiment and discuss which single change would make its result useful.'
          : skill.id === 'interpret_evidence' ? 'Look at the result together before choosing the next move.'
            : skill.id === 'revise' ? 'Ask which one change the result suggests, then try it.'
              : 'Use one short activity to compare an idea with what actually happens.',
        prompt: skill.id === 'plan_test' ? 'What would this test help us find out?' : 'What did the result show you, and what could you try next?',
        basis: 'try-again', evidenceIds: [skillEvidence[0].id],
      });
    }
  }
  opportunities.sort((a, b) => Number(b.basis === 'review-due') - Number(a.basis === 'review-due'));
  return {
    ownerId: input.ownerId, range, from, through: now, subjects, evidence, opportunities: opportunities.slice(0, 6), comparisons: comparableExamples(evidence),
    notes: [
      'These reports describe recorded practice in Jems. They do not convert to IXL scores, grade placement, percentiles, or standardized test results.',
      'A skill with no recorded opportunity is not a demonstrated weakness. A grade label describes content, not the child.',
      'Current Math and Language Arts skill states use all recorded practice. Selected-period counts and examples use retained detailed records only.',
      'Reported progress is not proof that Jems caused improvement. Match task, difficulty, format, and help conditions before comparing outcomes.',
    ],
  };
}

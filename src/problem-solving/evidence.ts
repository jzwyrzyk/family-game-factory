/** Descriptive summaries only. No latent ability, weighted total, mastery, or growth estimate. */
import {
  APS_SKILLS, APS_SKILL_LABELS, validateProblemSolvingEpisode,
  type EvidenceAuthorship, type EvidenceElicitation, type EvidenceOutcome, type EvidenceSupport,
  type ProblemSolvingEpisode, type ProblemSolvingObservation, type ProblemSolvingSkill, type ProblemSolvingSource,
} from './model';

export type EvidenceAttribution = 'learner-no-solution-help-observed' | 'supported' | 'unknown';
export interface OutcomeCounts { opportunities: number; demonstrated: number; notYet: number }
export interface ProblemSolvingSample {
  episodeId: string; at: string; taskId: string; taskLabel: string; taskFamily: string;
  taskVersion: string; demand?: string; variant?: string; source: ProblemSolvingSource;
  outcome: EvidenceOutcome; authorship: EvidenceAuthorship; support: EvidenceSupport; elicitation: EvidenceElicitation;
  exposure: ProblemSolvingEpisode['task']['exposure']; firstAttempt: boolean;
  responseId?: string; evidenceRef?: string; note?: string;
}
export interface SkillEvidenceSummary extends OutcomeCounts {
  skill: ProblemSolvingSkill; label: string;
  /** Episodes with only unscored markers for this skill. Never counted as wrong. */
  unobserved: number;
  learnerNoSolutionHelpObserved: number; supported: number; unknownAttribution: number;
  unknownAuthorship: number; unknownSupport: number;
  attribution: Record<EvidenceAttribution, OutcomeCounts>;
  prompted: number; spontaneous: number; unknownElicitation: number;
  firstAttempts: number; repeatEpisodes: number; unknownExposure: number;
  distinctSessions: number; distinctDates: number; distinctTaskFamilies: number; distinctTasks: number;
  earliestAt: string | null; latestAt: string | null;
  samples: ProblemSolvingSample[];
}
export interface ProblemSolvingSummary {
  episodes: number; structuredEpisodes: number; contextEpisodes: number;
  interruptedEpisodes: number; technicalInvalidEpisodes: number;
  contextBySource: Record<ProblemSolvingSource, number>;
  bySkill: Record<ProblemSolvingSkill, SkillEvidenceSummary>;
  distinctSessions: number; distinctDates: number; distinctTaskFamilies: number;
  earliestAt: string | null; latestAt: string | null;
  discarded: number; historyTruncated: boolean;
  recentContext: {episodeId: string; at: string; source: ProblemSolvingSource; label: string; context?: string}[];
}

/** Authorship and support are separate: a local learner label never verifies independence. */
export function evidenceAttribution(observation: ProblemSolvingObservation): EvidenceAttribution {
  if (observation.authorship === 'helper' || observation.authorship === 'shared'
    || observation.support === 'strategy' || observation.support === 'solution') return 'supported';
  if (observation.authorship === 'unknown' || observation.support === 'unknown') return 'unknown';
  return 'learner-no-solution-help-observed';
}
const emptyCounts = (): OutcomeCounts => ({opportunities: 0, demonstrated: 0, notYet: 0});
const time = (episode: ProblemSolvingEpisode) => episode.completedAt ?? episode.startedAt;
const ascending = (a: ProblemSolvingEpisode, b: ProblemSolvingEpisode) => time(a).localeCompare(time(b)) || a.id.localeCompare(b.id);
const sample = (e: ProblemSolvingEpisode, o: ProblemSolvingObservation): ProblemSolvingSample => ({
  episodeId: e.id, at: o.observedAt, taskId: e.task.id, taskLabel: e.task.label, taskFamily: e.task.family,
  taskVersion: e.task.version, source: e.source, outcome: o.outcome, authorship: o.authorship,
  support: o.support, elicitation: o.elicitation, exposure: e.task.exposure, firstAttempt: e.task.firstAttempt,
  ...(e.task.demand === undefined ? {} : {demand: e.task.demand}),
  ...(e.task.variant === undefined ? {} : {variant: e.task.variant}),
  ...(o.responseId === undefined ? {} : {responseId: o.responseId}),
  ...(o.evidenceRef === undefined ? {} : {evidenceRef: o.evidenceRef}),
  ...(o.note === undefined ? {} : {note: o.note}),
});

/**
 * One first scored response per skill and episode. A later assisted correction cannot erase it.
 * Unscored predictions/hint markers do not take that slot. Context-only and invalid/interrupted
 * episodes supply no scored opportunities. Task-family counts do not assert item equivalence.
 * Distinct dates use recorded UTC dates; this is coverage, never speed or daily performance.
 */
export function summarizeProblemSolving(
  input: readonly ProblemSolvingEpisode[], options: {discarded?: number; sampleLimit?: number} = {},
): ProblemSolvingSummary {
  const discarded = options.discarded ?? 0, sampleLimit = options.sampleLimit ?? 3;
  if (!Number.isSafeInteger(discarded) || discarded < 0 || !Number.isInteger(sampleLimit) || sampleLimit < 0 || sampleLimit > 10) {
    throw Error('Choose valid problem-solving summary limits.');
  }
  // Defend callers outside the store against duplicate records and accidentally pooled profiles.
  const ids = new Set<string>(); const episodes: ProblemSolvingEpisode[] = []; let owner: string | undefined;
  for (const raw of input) {
    const e = validateProblemSolvingEpisode(raw);
    if (owner !== undefined && owner !== e.owner) throw Error('Summarize one player’s observations at a time.');
    owner = e.owner;
    if (ids.has(e.id)) throw Error('A repeated episode cannot be counted as new problem-solving evidence.');
    ids.add(e.id); episodes.push(e);
  }
  episodes.sort(ascending);
  const contextBySource: Record<ProblemSolvingSource, number> = {math: 0, language: 0, creation: 0, studio: 0, practice: 0};
  const structured = episodes.filter(e => e.kind === 'structured-practice' && (e.status === undefined || e.status === 'completed'));
  const bySkill = Object.fromEntries(APS_SKILLS.map(skill => {
    const result: SkillEvidenceSummary = {
      skill, label: APS_SKILL_LABELS[skill], ...emptyCounts(), unobserved: 0,
      learnerNoSolutionHelpObserved: 0, supported: 0, unknownAttribution: 0, unknownAuthorship: 0, unknownSupport: 0,
      attribution: {'learner-no-solution-help-observed': emptyCounts(), supported: emptyCounts(), unknown: emptyCounts()},
      prompted: 0, spontaneous: 0, unknownElicitation: 0, firstAttempts: 0, repeatEpisodes: 0, unknownExposure: 0,
      distinctSessions: 0, distinctDates: 0, distinctTaskFamilies: 0, distinctTasks: 0,
      earliestAt: null, latestAt: null, samples: [],
    };
    const sessions = new Set<string>(), dates = new Set<string>(), families = new Set<string>(), tasks = new Set<string>();
    for (const episode of structured) {
      const observations = episode.observations.filter(o => o.skill === skill);
      const first = observations.find(o => o.outcome !== 'unobserved');
      if (!first) { if (observations.length) result.unobserved++; continue; }
      const attribution = evidenceAttribution(first), category = result.attribution[attribution];
      result.opportunities++; category.opportunities++;
      if (first.outcome === 'demonstrated') { result.demonstrated++; category.demonstrated++; }
      else { result.notYet++; category.notYet++; }
      if (attribution === 'learner-no-solution-help-observed') result.learnerNoSolutionHelpObserved++;
      else if (attribution === 'supported') result.supported++;
      else result.unknownAttribution++;
      if (first.authorship === 'unknown') result.unknownAuthorship++;
      if (first.support === 'unknown') result.unknownSupport++;
      if (first.elicitation === 'prompted') result.prompted++;
      else if (first.elicitation === 'spontaneous') result.spontaneous++;
      else result.unknownElicitation++;
      if (episode.task.firstAttempt) result.firstAttempts++;
      if (episode.task.exposure === 'repeat') result.repeatEpisodes++;
      if (episode.task.exposure === 'unknown') result.unknownExposure++;
      sessions.add(episode.sessionId); dates.add(first.observedAt.slice(0,10)); families.add(episode.task.family);
      tasks.add([episode.task.id, episode.task.version, episode.task.variant ?? '', episode.task.demand ?? ''].join('/'));
      if (result.earliestAt === null || first.observedAt < result.earliestAt) result.earliestAt = first.observedAt;
      if (result.latestAt === null || first.observedAt > result.latestAt) result.latestAt = first.observedAt;
      result.samples.push(sample(episode, first));
    }
    result.distinctSessions = sessions.size; result.distinctDates = dates.size;
    result.distinctTaskFamilies = families.size; result.distinctTasks = tasks.size;
    result.samples.sort((a,b) => b.at.localeCompare(a.at) || b.episodeId.localeCompare(a.episodeId));
    result.samples = result.samples.slice(0, sampleLimit);
    return [skill, result];
  })) as Record<ProblemSolvingSkill, SkillEvidenceSummary>;
  const contexts = episodes.filter(e => e.kind === 'context-only');
  for (const e of contexts) contextBySource[e.source]++;
  return {
    episodes: episodes.length, structuredEpisodes: structured.length, contextEpisodes: contexts.length,
    interruptedEpisodes: episodes.filter(e => e.status === 'interrupted').length,
    technicalInvalidEpisodes: episodes.filter(e => e.status === 'technical-invalid').length,
    contextBySource, bySkill,
    distinctSessions: new Set(episodes.map(e => e.sessionId)).size,
    distinctDates: new Set(episodes.map(e => time(e).slice(0,10))).size,
    distinctTaskFamilies: new Set(episodes.map(e => e.task.family)).size,
    earliestAt: episodes.length ? time(episodes[0]) : null,
    latestAt: episodes.length ? time(episodes.at(-1)!) : null,
    discarded, historyTruncated: discarded > 0,
    recentContext: (sampleLimit ? contexts.slice(-sampleLimit) : []).reverse().map(e => ({
      episodeId: e.id, at: time(e), source: e.source, label: e.task.label,
      ...(e.context === undefined ? {} : {context: e.context}),
    })),
  };
}

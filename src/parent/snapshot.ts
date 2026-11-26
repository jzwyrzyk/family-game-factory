import {profileGrade} from '../learning/engine';
import { report, type Attempt } from '../learning/engine';
import { reportLanguage, type LanguageAttempt } from '../language/engine';
import { CreationStore, type CreationWorkspace } from '../creation/storage';
import { profileStorage } from '../adult-pilot/storage';
import { PROBLEM_SOLVING_LIMITS, validateProblemSolvingEpisode } from '../problem-solving/model';
import { buildParentDashboard, type ParentDashboard, type ParentDashboardInput, type ParentRange } from './model';

export interface ParentSnapshot {
  ownerId: string;
  name: string;
  grade: number;
  adult: boolean;
  dashboard: ParentDashboard;
  warnings: string[];
}

/** Reporting normalizes a COPY. Opening a report must never initialize or save learner state. */
export function captureParentSnapshot(FG: any, range: ParentRange = 30, now = Date.now(), creation?:{snapshot:CreationWorkspace}|{error:unknown}): ParentSnapshot {
  const current = FG.store.current();
  const ownerId = String(current.id);
  const profile = JSON.parse(JSON.stringify(current));
  const warnings: string[] = [];
  const input: ParentDashboardInput = { ownerId, range, now, unavailable: {} };
  try {
    const summary = report(profile, now);
    input.math = { ownerId, report: summary, attempts: (profile.learning?.attempts ?? []) as Attempt[] };
  } catch { input.unavailable!.math = 'read-error'; warnings.push('Math history could not be read. Use Settings to export the preserved data before restoring a backup.'); }
  try {
    const summary = reportLanguage(profile, now);
    input.language = { ownerId, report: summary, attempts: (profile.language?.attempts ?? []) as LanguageAttempt[] };
  } catch { input.unavailable!.language = 'read-error'; warnings.push('Language Arts history could not be read. Existing records have not been changed.'); }
  try { if(creation&&'error' in creation)throw creation.error;input.creation = creation&&'snapshot' in creation?creation.snapshot:new CreationStore(profileStorage(localStorage), () => String(FG.store.current().id)).export(); }
  catch { input.unavailable!.creation = 'read-error'; warnings.push('Creation history could not be read. Existing scenes have not been changed.'); }
  if (FG.problemSolvingEvidence?.list) {
    try {
      const episodes = JSON.parse(JSON.stringify(FG.problemSolvingEvidence.list()));
      if (!Array.isArray(episodes) || episodes.length > PROBLEM_SOLVING_LIMITS.episodesPerOwner) throw Error('Unsupported problem-solving source shape.');
      const ids = new Set<string>();
      for (const raw of episodes) {
        const episode = validateProblemSolvingEpisode(raw);
        if (episode.owner !== ownerId || ids.has(episode.id)) throw Error('Unsupported problem-solving owner or duplicate record.');
        ids.add(episode.id);
      }
      const retention = FG.problemSolvingEvidence.retention?.();
      if (retention?.discarded !== undefined && (!Number.isSafeInteger(retention.discarded) || retention.discarded < 0)) throw Error('Unsupported retention count.');
      input.problemSolving = { ownerId, episodes, discarded: typeof retention?.discarded === 'number' ? retention.discarded : undefined };
      const warning = FG.problemSolvingEvidence.warning?.();
      if (warning) warnings.push(String(warning));
    } catch { input.unavailable!['problem-solving'] = 'read-error'; warnings.push('Problem-solving observations could not be read. The other reports remain available.'); }
  } else input.unavailable!['problem-solving'] = 'not-connected';
  if (String(FG.store.current().id) !== ownerId) throw Error('The selected learner changed. Reopen their report.');
  if (FG.store.loadError) warnings.unshift(String(FG.store.loadError));
  return { ownerId, name: String(profile.name || 'Your learner'), grade: profileGrade(profile), adult: ownerId.startsWith('adult:'), dashboard: buildParentDashboard(input), warnings };
}

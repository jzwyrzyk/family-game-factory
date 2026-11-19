import { report, type Attempt } from '../learning/engine';
import { reportLanguage, type LanguageAttempt } from '../language/engine';
import { CreationStore } from '../creation/storage';
import { profileStorage } from '../adult-pilot/storage';
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
export function captureParentSnapshot(FG: any, range: ParentRange = 30, now = Date.now()): ParentSnapshot {
  const current = FG.store.current();
  const ownerId = String(current.id);
  const profile = JSON.parse(JSON.stringify(current));
  const warnings: string[] = [];
  const input: ParentDashboardInput = { ownerId, range, now };
  try {
    const summary = report(profile, now);
    input.math = { ownerId, report: summary, attempts: (profile.learning?.attempts ?? []) as Attempt[] };
  } catch { warnings.push('Math history could not be read. Use Settings to export the preserved data before restoring a backup.'); }
  try {
    const summary = reportLanguage(profile, now);
    input.language = { ownerId, report: summary, attempts: (profile.language?.attempts ?? []) as LanguageAttempt[] };
  } catch { warnings.push('Language Arts history could not be read. Existing records have not been changed.'); }
  try { input.creation = new CreationStore(profileStorage(localStorage), () => String(FG.store.current().id)).export(); }
  catch { warnings.push('Creation history could not be read. Existing scenes have not been changed.'); }
  if (FG.problemSolvingEvidence?.list) {
    try {
      const episodes = JSON.parse(JSON.stringify(FG.problemSolvingEvidence.list()));
      const retention = FG.problemSolvingEvidence.retention?.();
      input.problemSolving = { ownerId, episodes, discarded: typeof retention?.discarded === 'number' ? retention.discarded : undefined };
      const warning = FG.problemSolvingEvidence.warning?.();
      if (warning) warnings.push(String(warning));
    } catch { warnings.push('Problem-solving observations could not be read. The other reports remain available.'); }
  }
  if (String(FG.store.current().id) !== ownerId) throw Error('The selected learner changed. Reopen their report.');
  if (FG.store.loadError) warnings.unshift(String(FG.store.loadError));
  return { ownerId, name: String(profile.name || 'Your learner'), grade: Number(profile.grade || 1), adult: ownerId.startsWith('adult:'), dashboard: buildParentDashboard(input), warnings };
}

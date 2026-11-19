/** One bounded local key; observations are separate from learning scores and game saves. */
import {
  PROBLEM_SOLVING_KEY, PROBLEM_SOLVING_LIMITS, copyEvidence, emptyProblemSolvingWorkspace,
  isProblemSolvingId, validateProblemSolvingDraft, validateProblemSolvingEpisode, validateProblemSolvingWorkspace,
  type ProblemSolvingDraft, type ProblemSolvingEpisode, type ProblemSolvingStoragePort, type ProblemSolvingWorkspace,
} from './model';

export { PROBLEM_SOLVING_KEY, PROBLEM_SOLVING_LIMITS, validateProblemSolvingWorkspace } from './model';
export type { ProblemSolvingStoragePort } from './model';

const canonical = (value: unknown): string => {
  const ordered = (input: unknown): unknown => Array.isArray(input) ? input.map(ordered)
    : input && typeof input === 'object'
      ? Object.fromEntries(Object.entries(input).sort(([a],[b]) => a.localeCompare(b)).map(([key, item]) => [key, ordered(item)]))
      : input;
  return JSON.stringify(ordered(value));
};
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const when = (episode: ProblemSolvingEpisode) => episode.completedAt ?? episode.startedAt;
const byTime = (a: ProblemSolvingEpisode, b: ProblemSolvingEpisode) => when(a).localeCompare(when(b)) || a.id.localeCompare(b.id);
function retainPrefix(previous: ProblemSolvingEpisode, next: ProblemSolvingEpisode): void {
  const identity = ({observations: _observations, completedAt: _at, status: _status, ...fixed}: ProblemSolvingEpisode) => fixed;
  if (!same(identity(previous), identity(next)) || previous.observations.length > next.observations.length
    || previous.observations.some((observation, index) => !same(observation, next.observations[index]))) {
    throw Error('This practice changed elsewhere. Reopen the saved activity; earlier responses cannot be replaced.');
  }
}

export interface ProblemSolvingRetention {
  retained: number; discarded: number; firstRetained: number;
  earliestAt: string | null; latestAt: string | null;
}

export class ProblemSolvingStore {
  private snapshots: {raw: string | null; owner: string | undefined}[] = [];
  constructor(private storage: ProblemSolvingStoragePort, private currentOwner?: () => string) {}

  private scope(owner: string): void {
    if (!isProblemSolvingId(owner) || this.currentOwner && this.currentOwner() !== owner) {
      throw Error('Player changed. Reopen problem-solving practice in your own profile.');
    }
  }
  get recoveryRaw(): string | null {
    const raw = this.storage.getItem(PROBLEM_SOLVING_KEY);
    if (raw === null) return null;
    try {
      if (raw.length > PROBLEM_SOLVING_LIMITS.characters) return raw;
      validateProblemSolvingWorkspace(JSON.parse(raw)); return null;
    } catch { return raw; }
  }
  read(): ProblemSolvingWorkspace {
    const raw = this.storage.getItem(PROBLEM_SOLVING_KEY);
    if (raw === null) return emptyProblemSolvingWorkspace();
    try {
      if (raw.length > PROBLEM_SOLVING_LIMITS.characters) throw Error('oversize');
      return validateProblemSolvingWorkspace(JSON.parse(raw));
    } catch {
      throw Error('These problem-solving observations cannot be opened. Export the recovery data before replacing them.');
    }
  }
  export(): ProblemSolvingWorkspace { return this.read(); }

  /** Capture the original bytes for an existing parent-backup transaction, including damaged bytes. */
  rawSnapshot(): string | null {
    const raw = this.storage.getItem(PROBLEM_SOLVING_KEY);
    this.snapshots.push({raw, owner: this.currentOwner?.()});
    this.snapshots = this.snapshots.slice(-4); return raw;
  }
  /** Roll back only bytes captured by this instance in the same active profile. Not a backup import API. */
  restoreRawSnapshot(raw: string | null): void {
    const index = this.snapshots.findIndex(s => s.raw === raw && s.owner === this.currentOwner?.());
    if (index < 0) throw Error('Use an original problem-solving snapshot from this profile for recovery.');
    if (raw === null) {
      if (this.storage.getItem(PROBLEM_SOLVING_KEY) !== null) {
        if (!this.storage.removeItem) throw Error('This storage cannot restore an empty problem-solving snapshot.');
        this.storage.removeItem(PROBLEM_SOLVING_KEY);
      }
    } else this.storage.setItem(PROBLEM_SOLVING_KEY, raw);
    this.snapshots.splice(index, 1);
  }
  private persist(data: ProblemSolvingWorkspace, owner?: string): void {
    const checked = validateProblemSolvingWorkspace(data), raw = JSON.stringify(checked);
    if (owner !== undefined) this.scope(owner);
    try { this.storage.setItem(PROBLEM_SOLVING_KEY, raw); }
    catch {
      throw Error('Could not save these observations on this device. Your last saved observations are safe. Export a backup before freeing browser space.');
    }
  }
  /** Chronological retained records for one player. Returns detached data, never shared mutable state. */
  list(owner: string): ProblemSolvingEpisode[] {
    this.scope(owner); const data = this.read(); this.scope(owner);
    return data.episodes.filter(episode => episode.owner === owner).sort(byTime);
  }
  retention(owner: string): ProblemSolvingRetention {
    this.scope(owner); const data = this.read(); this.scope(owner);
    const records = data.episodes.filter(episode => episode.owner === owner).sort(byTime);
    return {
      retained: records.length, discarded: data.discardedByOwner[owner] ?? 0,
      firstRetained: Math.min(PROBLEM_SOLVING_LIMITS.retainedStart, records.length),
      earliestAt: records[0] ? when(records[0]) : null, latestAt: records.length ? when(records.at(-1)!) : null,
    };
  }
  private trim(data: ProblemSolvingWorkspace, owner: string): void {
    const records = data.episodes.filter(episode => episode.owner === owner).sort(byTime);
    if (records.length <= PROBLEM_SOLVING_LIMITS.episodesPerOwner) return;
    const recent = PROBLEM_SOLVING_LIMITS.episodesPerOwner - PROBLEM_SOLVING_LIMITS.retainedStart;
    const kept = new Set([...records.slice(0, PROBLEM_SOLVING_LIMITS.retainedStart), ...records.slice(-recent)].map(episode => episode.id));
    const discarded = records.length - kept.size;
    data.episodes = data.episodes.filter(episode => episode.owner !== owner || kept.has(episode.id));
    data.discardedByOwner[owner] = (data.discardedByOwner[owner] ?? 0) + discarded;
  }
  /** Same episode ID and payload are idempotent. A repeated check cannot rewrite its first evidence. */
  record(input: ProblemSolvingEpisode): ProblemSolvingEpisode {
    const episode = validateProblemSolvingEpisode(input); this.scope(episode.owner);
    const data = this.read(); this.scope(episode.owner);
    const previous = data.episodes.find(e => e.owner === episode.owner && e.id === episode.id);
    if (previous) {
      if (!same(previous, episode)) throw Error('This observation is already saved. An earlier response cannot be replaced by a recheck.');
      return copyEvidence(previous);
    }
    if (data.discardedByOwner[episode.owner]) {
      const retained = data.episodes.filter(e => e.owner === episode.owner).sort(byTime);
      const recentStart = retained[PROBLEM_SOLVING_LIMITS.retainedStart];
      // Bounded storage cannot remember every evicted ID. Do not re-admit an old replay or
      // silently manufacture history inside the omitted interval after retention has begun.
      if (recentStart && byTime(episode, recentStart) < 0) {
        throw Error('This earlier observation is outside the retained history. It has not been counted again.');
      }
    }
    const draft = data.drafts.find(d => d.episode.owner === episode.owner && d.episode.id === episode.id);
    if (draft) retainPrefix(draft.episode, episode);
    data.drafts = data.drafts.filter(d => d.episode.owner !== episode.owner || d.episode.id !== episode.id);
    data.episodes.push(episode); this.trim(data, episode.owner); this.persist(data, episode.owner);
    return copyEvidence(episode);
  }
  draft(owner: string, taskId?: string): ProblemSolvingDraft | null {
    this.scope(owner); if (taskId !== undefined && !isProblemSolvingId(taskId)) throw Error('Choose a saved practice.');
    const data = this.read(); this.scope(owner);
    return data.drafts.filter(d => d.episode.owner === owner && (taskId === undefined || d.episode.task.id === taskId))
      .sort((a,b) => b.episode.startedAt.localeCompare(a.episode.startedAt))[0] ?? null;
  }
  saveDraft(input: ProblemSolvingDraft): ProblemSolvingDraft {
    const next = validateProblemSolvingDraft(input), owner = next.episode.owner; this.scope(owner);
    const data = this.read(); this.scope(owner);
    if (data.episodes.some(e => e.owner === owner && e.id === next.episode.id)) {
      throw Error('That practice is already complete. Start a new activity to try it again.');
    }
    const index = data.drafts.findIndex(d => d.episode.owner === owner && d.episode.id === next.episode.id);
    if (index >= 0) {
      const previous = data.drafts[index]; retainPrefix(previous.episode, next.episode);
      if (next.stepIndex < previous.stepIndex) throw Error('This practice changed elsewhere. Reopen the saved activity.');
      if (same(previous, next)) return copyEvidence(previous);
      data.drafts[index] = next;
    } else data.drafts.push(next);
    this.persist(data, owner); return copyEvidence(next);
  }
  discardDraft(owner: string, episodeId: string): void {
    this.scope(owner); if (!isProblemSolvingId(episodeId)) throw Error('Choose a saved practice.');
    const data = this.read(); this.scope(owner);
    const keep = data.drafts.filter(d => d.episode.owner !== owner || d.episode.id !== episodeId);
    if (keep.length === data.drafts.length) return;
    data.drafts = keep; this.persist(data, owner);
  }
  removeOwner(owner: string): void {
    this.scope(owner); const data = this.read(); this.scope(owner);
    data.episodes = data.episodes.filter(episode => episode.owner !== owner);
    data.drafts = data.drafts.filter(draft => draft.episode.owner !== owner);
    delete data.discardedByOwner[owner]; this.persist(data, owner);
  }
  /** Explicit deletion of a source removes its retained derived facts without touching other projects. */
  removeSource(owner: string, source: 'studio' | 'creation', sessionId: string): void {
    this.scope(owner);
    if (!['studio','creation'].includes(source) || !isProblemSolvingId(sessionId)) throw Error('Choose the source to remove.');
    const data = this.read(); this.scope(owner);
    const matches = (episode: ProblemSolvingEpisode) => episode.owner === owner && episode.source === source && episode.sessionId === sessionId;
    data.episodes = data.episodes.filter(episode => !matches(episode));
    data.drafts = data.drafts.filter(draft => !matches(draft.episode));
    this.persist(data, owner);
  }
  /** Parent restore validates the entire key before an atomic setItem; existing corrupt bytes are recoverable. */
  restore(value: unknown): void { this.persist(validateProblemSolvingWorkspace(value)); }
  /** The ordinary reset never silently erases unsupported or corrupt data. Explicit restore can replace it. */
  reset(): void { this.read(); this.persist(emptyProblemSolvingWorkspace()); }
}

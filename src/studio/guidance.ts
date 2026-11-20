import type { Experiment } from './design';
import type { StudioSession } from './notebook';

/** Small, optional explanations. These IDs are presentation preferences, never achievements. */
export const GUIDE_TIP_IDS = ['idea', 'waiting', 'ready', 'play', 'improve', 'keep', 'saved', 'scenes', 'practice', 'progress'] as const;
export type GuideTipId = typeof GUIDE_TIP_IDS[number];
export type GuidePreferences = { welcomeDismissed: boolean; dismissedTips: GuideTipId[] };
export type GuideCopy = { title: string; description: string };
export const GUIDE_TIPS: Readonly<Record<GuideTipId, GuideCopy>> = {
  idea: { title: 'Start with your idea', description: 'What would you like to happen? One sentence is enough. You can talk about it, then choose Build my game when you are ready.' },
  waiting: { title: 'Play while it is being made', description: 'Your idea stays here while you play. We will tell you when your game is ready to try.' },
  ready: { title: 'Your game is ready to try', description: 'Open your game whenever you are ready. You can finish what you are playing first.' },
  play: { title: 'Give it a try', description: 'Play and see what happens. Have an idea? Open My ideas to try a change.' },
  improve: { title: 'Make it more yours', description: 'What would make this more fun? Try one change and see what happens. You can always return to your main game.' },
  keep: { title: 'You choose your favorite', description: 'Like this version? Make it your main game. Your other saved versions stay in My tests.' },
  saved: { title: 'Ready when you are', description: 'Your ideas and local work are saved on this device. Find them in My Games when you come back.' },
  scenes: { title: 'Make a little story', description: 'Give a character actions, then press Play. The blocks change this scene; a linked game keeps its own saved version.' },
  practice: { title: 'Watch, try, make it yours', description: 'Watch the scene, try your own instructions, and check what happens. Hints are here whenever you need them.' },
  progress: { title: 'Different ways to grow', description: 'Gems celebrate completed activities. Your maker level follows your creations. My Powers shows what you have been practicing.' },
};

export const isGuideTipId = (value: unknown): value is GuideTipId =>
  typeof value === 'string' && (GUIDE_TIP_IDS as readonly string[]).includes(value);

export function freshGuidance(): GuidePreferences {
  return { welcomeDismissed: false, dismissedTips: [] };
}

/** Strict, bounded preferences travel with the existing notebook backup. */
export function validateGuidePreferences(input: unknown): GuidePreferences {
  const value = input as GuidePreferences;
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).some(key => key !== 'welcomeDismissed' && key !== 'dismissedTips') ||
    typeof value.welcomeDismissed !== 'boolean' || !Array.isArray(value.dismissedTips) ||
    value.dismissedTips.length > GUIDE_TIP_IDS.length ||
    !value.dismissedTips.every(isGuideTipId) || new Set(value.dismissedTips).size !== value.dismissedTips.length)
    throw Error('Invalid journey guidance preferences.');
  return { welcomeDismissed: value.welcomeDismissed, dismissedTips: [...value.dismissedTips] };
}

const meaningful = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const busy = (session: StudioSession) => !!session.job && ['queued', 'building', 'testing'].includes(session.job.status);
const playable = (session: StudioSession) => !!(session.projectId || session.remoteId);

/** Whether a child has started creative work, not a claim about skill or a completed creation. */
function hasSessionWork(session: StudioSession): boolean {
  return meaningful(session.draft) || session.messages.some(message => message.role !== 'helper' && meaningful(message.text)) ||
    !!session.candidate || !!session.pendingExperiment || !!session.experiments?.length || !!session.remoteId ||
    !!session.design?.ideas.some(idea => idea.adopted && meaningful(idea.text)) ||
    Object.values(session.design?.plan ?? {}).some(field => field?.accepted && meaningful(field.value)) ||
    !!session.design?.observations.some(observation => observation.source === 'child' && meaningful(observation.text)) ||
    (!!session.projectId && session.playOnly !== true);
}

/** Archives still establish prior use; a plain ready-made play session does not. */
export function hasMeaningfulCreation(sessions: readonly StudioSession[], owner: string): boolean {
  return sessions.some(session => session.owner === owner && hasSessionWork(session));
}

/**
 * Mirrors Studio readiness: the acknowledged job must identify a saved,
 * unselected result. A known kept result must not be revived after an undo.
 * Selecting a recommendation never chooses or keeps a version by itself.
 */
export function readyGuidedExperiment(session: StudioSession): Experiment | undefined {
  if (session.job?.status !== 'ready' || !session.job.revisionId) return undefined;
  return session.experiments?.find(test => test.candidate.remoteId === session.job!.revisionId &&
    test.candidate.remoteId !== session.remoteId && test.id !== session.selectedTest &&
    !session.keptExperiments?.some(kept => kept.experimentId === test.id));
}

export type NextRecommendation = {
  sessionId: string;
  kind: 'ready' | 'building' | 'retry' | 'idea' | 'experiment' | 'play';
  title: string;
  description: string;
  action: string;
  experimentId?: string;
};

function intentReminder(session: StudioSession): string {
  const idea = session.draft.trim() || session.pendingExperiment?.prompt.trim() ||
    [...session.messages].reverse().find(message => message.role === 'child' && meaningful(message.text))?.text.trim();
  if (!idea) return session.name;
  const singleLine = idea.replace(/\s+/g, ' ');
  return singleLine.length > 160 ? singleLine.slice(0, 157).trimEnd() + '…' : singleLine;
}

/**
 * An owner-scoped suggestion from existing work only. No clock, writes, model
 * call, inferred mastery, or automatic Build/Keep. Call again on activation so
 * a late build or a different profile cannot open the previously rendered item.
 */
export function recommendNext(sessions: readonly StudioSession[], owner: string, lastSessionId?: string | null): NextRecommendation | null {
  const available = sessions.filter(session => session.owner === owner && !session.archived && !session.resumeDismissed)
    .sort((left, right) => right.updated.localeCompare(left.updated) || left.id.localeCompare(right.id));
  const result = (session: StudioSession, kind: NextRecommendation['kind'], title: string,
    description: string, action: string, experimentId?: string): NextRecommendation => ({
    sessionId: session.id, kind, title, description, action, ...(experimentId ? { experimentId } : {}),
  });
  for (const session of available) {
    const test = readyGuidedExperiment(session);
    if (test) return result(session, 'ready', playable(session) ? 'Your change is ready' : 'Your game is ready',
      session.name + ' is ready to try. You choose when to open it.', playable(session) ? 'Try my change' : 'Play my game', test.id);
  }
  const building = available.find(busy);
  if (building) return result(building, 'building', 'Your idea is being made',
    building.name + ' is still in progress. You can play while you wait.', 'See my idea');

  // Prioritize the most recently active unfinished intention. A later ready-made
  // play session cannot bury an older creative draft or a recoverable build.
  for (const session of available) {
    const candidate = session.candidate;
    if (candidate && candidate.remoteId !== session.remoteId &&
      !session.keptExperiments?.some(kept => kept.experimentId === candidate.id))
      return result(session, 'experiment', 'Pick up your experiment',
        'Try your change, then choose the version you like.', 'Try my change', candidate.id);
    if (session.job?.status === 'failed' && hasSessionWork(session))
      return result(session, 'retry', 'Your idea is still here',
        'The build did not finish. Open your idea to choose what to try next.', 'Open my idea');
    if (meaningful(session.draft) || (!playable(session) && hasSessionWork(session)))
      return result(session, 'idea', 'Keep shaping your idea', intentReminder(session), 'Continue my idea');
  }

  const last = available.find(session => session.id === lastSessionId);
  const working = last && playable(last) ? last :
    available.find(session => playable(session) && hasSessionWork(session)) ?? available.find(playable);
  if (working) return result(working, 'play', 'Ready for another go?', working.name, 'Continue playing');
  if (last && last.game === 'new') return result(last, 'idea', 'Start with your idea',
    'What would you like to happen in your game?', 'Continue my idea');
  return null;
}

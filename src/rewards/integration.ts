import type { LearnerProfile } from '../learning/types';
import type { Attempt } from '../learning/engine';
import type { LanguageAttempt } from '../language/engine';
import { createRewardFact, enqueueRewardFact, validateRewardOutbox, type RewardFact } from './model';

/** Called only for the live host activity, immediately before its source save.
 * Reading old learning history never generates new lifetime rewards. */
export function stageLearningReward(profile: LearnerProfile, subject: 'math' | 'language', attemptId: string): RewardFact | null {
  const owner = profile.id;
  if (!owner || !attemptId) return null;
  let fact: RewardFact | null = null;
  if (subject === 'math') {
    const attempt = (profile.learning?.attempts as Attempt[] | undefined)?.find(entry => entry.id === attemptId);
    if (attempt?.outcome === 'completed' && attempt.correct && attempt.completedAt !== undefined &&
        !attempt.legacy && attempt.answers.some(answer => answer.correct)) {
      fact = createRewardFact({ owner, kind: 'math.completed', sourceId: attempt.id, occurredAt: attempt.completedAt });
    }
  } else {
    const attempt = (profile.language?.attempts as LanguageAttempt[] | undefined)?.find(entry => entry.id === attemptId);
    if (attempt?.finishedAt !== undefined) {
      if (attempt.outcome === 'completed' && attempt.correct && attempt.answers.some(answer => answer.correct)) {
        fact = createRewardFact({ owner, kind: 'language.completed', sourceId: attempt.id, occurredAt: attempt.finishedAt });
      } else if (attempt.outcome === 'explored' && attempt.item.kind === 'creative' && typeof attempt.draft === 'string' && attempt.draft.trim()) {
        fact = createRewardFact({ owner, kind: 'language.explored', sourceId: attempt.id, occurredAt: attempt.finishedAt });
      }
    }
  }
  if (fact) profile.rewardOutbox = enqueueRewardFact(profile.rewardOutbox, fact);
  return fact;
}

export function validateLearningRewardOutbox(profile: LearnerProfile): boolean {
  try {
    return validateRewardOutbox(profile.rewardOutbox).every(fact => fact.owner === profile.id &&
      ['math.completed', 'language.completed', 'language.explored'].includes(fact.kind));
  } catch { return false; }
}

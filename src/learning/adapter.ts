import { SKILLS } from './curriculum';
import { generateItem, legacyFactItem } from './content';
import { beginAttempt, canAsk, didAsk, ensureLearning, finishAttempt, profileGrade, recordLegacyOutcome, report, selectItem, submitAnswer, useHint, evidenceState, validateLearning } from './engine';
import type { LearnerProfile, LearningContext, MathItem } from './types';

/** Kept at the shell boundary so games never own learning policy or answer evaluation. */
export function createMathAdapter(save: () => unknown = () => undefined) {
  const persist = <T>(value: T): T => { save(); return value; };
  const estimate = (record: { tries?: number; right?: number } | undefined) => {
    const tries = Math.max(0, Number(record?.tries) || 0), right = Math.max(0, Number(record?.right) || 0);
    return tries < 5 ? null : Math.round(Math.min(1, right / tries) * 100);
  };
  return {
    validateLearning,
    bank(profile: LearnerProfile) {
      return SKILLS.filter(s => s.grade <= profileGrade(profile)).map(s => generateItem(s.id, { random: () => 0.4, tier: 0 }));
    },
    select(profile: LearnerProfile, now = Date.now(), random = Math.random): MathItem & { hint: string } {
      const item = selectItem(profile, { now, random });
      save(); return { ...item, hint: item.hints[0]?.text || item.workedExample };
    },
    record(profile: LearnerProfile, question: MathItem | any, firstTryCorrect: boolean, helpUsed: boolean, now = Date.now(), attempts = firstTryCorrect ? 1 : 2) {
      const item: MathItem | undefined = question.skillId ? question : legacyFactItem(question.factId || question.id);
      if (!item) throw new Error('Unknown reviewed learning activity.');
      return persist(recordLegacyOutcome(profile, item, firstTryCorrect, helpUsed, now, attempts));
    },
    review(profile: LearnerProfile, now = Date.now()) {
      const state = ensureLearning(profile, now), entries = Object.entries(profile.skills).filter(([, s]) => s && s.tries > 0);
      const weak = Object.entries(state.facts).filter(([, s]) => s.struggledPresentations >= 2 && s.recent.length >= 3)
        .filter(([, s]) => !['independent', 'remembered-later'].includes(evidenceState(s, true)))
        .sort((a, b) => b[1].struggledPresentations - a[1].struggledPresentations).slice(0, 6)
        .map(([id]) => ({ id, confidence: estimate(profile.skills[id]), tries: profile.skills[id]?.tries || 0 }));
      return { attempts: state.totals.presentations, practiced: Object.keys(state.facts).length, weak,
        entries: entries.sort((a, b) => a[0].localeCompare(b[0])), learning: report(profile, now) };
    },
    estimate,
    canAsk,
    didAsk(profile: LearnerProfile, now = Date.now()) { didAsk(profile, now); save(); },
    beginAttempt(profile: LearnerProfile, item: MathItem, context: LearningContext = {}) { return persist(beginAttempt(profile, item, context)); },
    submitAnswer(profile: LearnerProfile, id: string, raw: string, now = Date.now()) { return persist(submitAnswer(profile, id, raw, now)); },
    useHint(profile: LearnerProfile, id: string, level: number, now = Date.now()) { return persist(useHint(profile, id, level, now)); },
    finishAttempt(profile: LearnerProfile, id: string, outcome: 'completed' | 'skipped' | 'interrupted' | 'shown', now = Date.now()) { return persist(finishAttempt(profile, id, outcome, now)); },
    report,
  };
}
export function installLearning() {
  const FG = (window as any).FG = (window as any).FG || {};
  FG.math = createMathAdapter(() => FG.store?.save());
  FG.learning = FG.math;
}

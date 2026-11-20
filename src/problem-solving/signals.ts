/** Trusted-host observation boundary. Generated games never receive a scoring API. */
import type { Attempt } from '../learning/engine';
import type { LanguageAttempt } from '../language/engine';
import type { CreationAttempt } from '../creation/storage';
import type { CreationChallengeResult } from '../creation/challenges';
import type { StudioSession } from '../studio/notebook';

export type SourceEvidenceSignal =
  | { kind: 'math'; owner: string; attempt: Attempt }
  | { kind: 'language'; owner: string; attempt: LanguageAttempt }
  | { kind: 'creation'; owner: string; attempt: CreationAttempt; result: CreationChallengeResult }
  | { kind: 'studio'; before: StudioSession; after: StudioSession }
  | { kind: 'clear-studio'; owner: string; sessionId: string }
  | { kind: 'clear-creation'; owner: string; projectId: string };

let receiver: ((signal: SourceEvidenceSignal) => void) | null = null;
export function installEvidenceReceiver(next: (signal: SourceEvidenceSignal) => void): () => void {
  receiver = next;
  return () => { if (receiver === next) receiver = null; };
}

/** An optional observer cannot turn an already saved answer or game into a failure.
 * The receiver reports its own save failure on the evidence report surface.
 */
export function publishSourceEvidence(signal: SourceEvidenceSignal): void {
  try { receiver?.(signal); } catch { /* A source task keeps its own save/error contract. */ }
}

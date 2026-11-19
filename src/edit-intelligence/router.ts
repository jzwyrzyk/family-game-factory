/**
 * Fail-closed, side-effect-free fast-edit planning.
 *
 * No provider calls, persistence, revision promotion, module installation or
 * paid-job admission. The existing authenticated Studio/Keep path remains
 * responsible for deciding whether to save an accepted local candidate.
 */
import {interpret} from '../factory/interpreter';
import {diff, validateConfig} from '../runtime/manifests';
import type {GameId, Mechanics} from '../runtime/types';
import {makeNativeEditManifest, validRevisionId} from './native-manifest';

export type EditTarget =
  | {readonly kind: 'native'; readonly game: GameId; readonly config: Mechanics; readonly revisionId: string}
  | {readonly kind: 'generated'; readonly artifactKind: 'generated-module-v1' | 'generated-module-v2'; readonly revisionId: string};
export interface LocalChange {
  readonly key: string;
  readonly label: string;
  readonly before: number | boolean;
  readonly after: number | boolean;
}
export interface LocalEditPreview {
  readonly route: 'native-config-preview';
  readonly originalRequest: string;
  readonly game: GameId;
  readonly baseRevisionId: string;
  readonly before: Readonly<Mechanics>;
  readonly after: Readonly<Mechanics>;
  readonly changes: readonly LocalChange[];
  /** Does NOT mean a game was played, persisted, approved or automatically Kept. */
  readonly verified: 'schema-and-local-interpreter';
  readonly persisted: false;
}
export interface DeferredEdit {
  readonly route: 'generation-required' | 'review-required' | 'unchanged';
  readonly originalRequest: string;
  readonly baseRevisionId: string;
  readonly reason: string;
  readonly queued: false;
  readonly persisted: false;
}
export type EditDecision = LocalEditPreview | DeferredEdit;
const copy = (value: Mechanics): Readonly<Mechanics> => Object.freeze({...value});
const equal = (a: Mechanics, b: Mechanics): boolean =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(a).every(([k,v]) => Object.hasOwn(b,k) && b[k] === v);
const deferred = (route: DeferredEdit['route'], originalRequest: string, revisionId: string, reason: string): DeferredEdit =>
  Object.freeze({route, originalRequest, baseRevisionId: revisionId, reason, queued: false as const, persisted: false as const});

export function planEdit(target: EditTarget, originalRequest: string): EditDecision {
  if (!target || !validRevisionId(target.revisionId)) throw Error('EDIT_REVISION_ID_INVALID');
  if (typeof originalRequest !== 'string' || !originalRequest.trim() || originalRequest.length > 2000)
    throw Error('EDIT_REQUEST_INVALID');
  if (target.kind === 'generated') {
    if (!['generated-module-v1','generated-module-v2'].includes(target.artifactKind)) throw Error('EDIT_ARTIFACT_INVALID');
    return deferred('generation-required', originalRequest, target.revisionId,
      'Generated source has no certified dynamic-edit contract. Use the existing authorized generation and independent-test route.');
  }
  if (target.kind !== 'native') throw Error('EDIT_TARGET_INVALID');
  // validateConfig is authoritative for saved engine flags and parameter bounds.
  const before = validateConfig(target.game, target.config);
  const manifest = makeNativeEditManifest(target.game, before, target.revisionId);
  const interpreted = interpret(target.game, before, originalRequest);
  if (interpreted.kind === 'generation-needed')
    return deferred('generation-required', originalRequest, target.revisionId,
      'The local interpreter cannot fulfill the entire request. Nothing changed.');
  if (interpreted.kind === 'invalid')
    return deferred('review-required', originalRequest, target.revisionId, interpreted.message);
  if (interpreted.kind === 'unchanged')
    return deferred('unchanged', originalRequest, target.revisionId, interpreted.message);
  const after = validateConfig(target.game, interpreted.config);
  const changed = diff(target.game, before, after);
  const allowed = new Set(manifest.properties.map(p => p.key));
  // Never quietly save a partly implemented multi-clause request or silently
  // migrate between the original, physics and sticker engines.
  if (!changed.length || changed.some(c => !allowed.has(c.key)))
    return deferred('review-required', originalRequest, target.revisionId,
      'That change cannot be verified as an editable property of this saved game.');
  return Object.freeze({
    route: 'native-config-preview' as const, originalRequest,
    game: target.game, baseRevisionId: target.revisionId,
    before: copy(before), after: copy(after),
    changes: Object.freeze(changed.map(c => Object.freeze({...c}))),
    verified: 'schema-and-local-interpreter' as const, persisted: false as const
  });
}

/**
 * Revalidate BEFORE a host creates a revision. Replays the original text
 * through the trusted interpreter to reject a fabricated or stale preview.
 * This returns a config snapshot; it never writes or promotes a revision.
 */
export function validatePreviewAgainstCurrent(
  preview: LocalEditPreview,
  current: {readonly game: GameId; readonly revisionId: string; readonly config: Mechanics}
): Readonly<Mechanics> {
  if (!preview || preview.route !== 'native-config-preview' || preview.game !== current.game ||
    preview.baseRevisionId !== current.revisionId) throw Error('EDIT_BASE_REVISION_STALE');
  const currentValid = validateConfig(current.game, current.config);
  if (!equal(currentValid, preview.before)) throw Error('EDIT_BASE_CONFIG_STALE');
  const replayed = planEdit({kind:'native',game:current.game,revisionId:current.revisionId,config:currentValid},preview.originalRequest);
  if (replayed.route !== 'native-config-preview' || !equal(replayed.after, preview.after) ||
    JSON.stringify(replayed.changes) !== JSON.stringify(preview.changes))
    throw Error('EDIT_PREVIEW_REVALIDATION_FAILED');
  return copy(replayed.after);
}

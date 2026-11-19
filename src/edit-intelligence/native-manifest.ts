/**
 * Read-only edit capabilities for a SAVED native game.
 * The archetype catalog defines concepts; the native runtime manifest is the
 * only source of values that are actually editable in this saved engine.
 * No local capability implies portable composition or a production module.
 */
import {inspectNative, nativeLinks} from '../archetypes/native';
import {mechanicById, type Maturity} from '../archetypes/catalog';
import {playableMechanics, validateConfig} from '../runtime/manifests';
import type {GameId, Mechanics} from '../runtime/types';

export interface NativeEditProperty {
  readonly key: string;
  readonly label: string;
  readonly value: number | boolean;
  readonly type: 'number' | 'boolean';
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** A related research concept, NOT an installable shared component. */
  readonly conceptId: string;
  readonly conceptMaturity: Maturity;
  readonly operation: 'validated-native-config';
}
export interface NativeEditManifest {
  readonly schema: 'jems-native-edit-manifest-v1';
  readonly game: GameId;
  /** Revision expected by a future authenticated preview/Keep caller. */
  readonly baseRevisionId: string;
  readonly archetypeIds: readonly string[];
  readonly properties: readonly NativeEditProperty[];
  readonly supportsPortableModuleInsertion: false;
  readonly caveat: string;
}
export function validRevisionId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id);
}
export function makeNativeEditManifest(game: GameId, config: Mechanics, baseRevisionId: string): NativeEditManifest {
  if (!validRevisionId(baseRevisionId)) throw Error('EDIT_REVISION_ID_INVALID');
  const valid = validateConfig(game, config);
  const inspected = inspectNative(game, valid);
  const link = nativeLinks.find(x => x.game === game);
  if (!link) throw Error('EDIT_NATIVE_GAME_UNKNOWN');
  const supported = new Set(inspected.adjustableFields);
  // Intersection is deliberate. Archetype links can contain a concept that is
  // not actually editable in the saved original/sticker/physics engine.
  const properties = playableMechanics(game, valid)
    .filter(field => supported.has(field.key) && Object.hasOwn(link.knobs, field.key))
    .map((field): NativeEditProperty => {
      const conceptId = link.knobs[field.key], concept = mechanicById.get(conceptId);
      if (!concept) throw Error('EDIT_ARCHETYPE_CONCEPT_DRIFT');
      return Object.freeze({
        key: field.key, label: field.label, value: valid[field.key],
        type: field.type, ...(field.min === undefined ? {} : {min: field.min}),
        ...(field.max === undefined ? {} : {max: field.max}),
        ...(field.step === undefined ? {} : {step: field.step}),
        conceptId, conceptMaturity: concept.maturity,
        operation: 'validated-native-config' as const
      });
    });
  return Object.freeze({
    schema: 'jems-native-edit-manifest-v1' as const, game, baseRevisionId,
    archetypeIds: Object.freeze([...inspected.archetypeIds]),
    properties: Object.freeze(properties),
    supportsPortableModuleInsertion: false as const, caveat: inspected.caveat
  });
}

import { isPalId, PAL_CATALOG, palDefinition, type PalId } from './catalog';

export const PALS_POLICY_VERSION = 1 as const;
export const PALS_LIMITS = Object.freeze({ owners: 80, receiptsPerOwner: 25_000, selectionsPerOwner: 25_000, characters: 16_000_000 });
export const PRACTICE_PER_ADVENTURE = 5;
export const PAL_STAGE_THRESHOLDS = Object.freeze([0, 5, 15] as const);
export type PalStage = 1 | 2 | 3;
export type PalActivityKind = 'math.completed' | 'language.completed' | 'language.explored' | 'scene.challenge' | 'game.developed';
export interface PalActivity { id: string; kind: PalActivityKind; occurredAt: string }
/** Trusted host bridge only: not a generated-game message or a public award API. */
export interface PalRewardSnapshot { owner: string; lifetimeGems: number; activities: PalActivity[] }
export interface PalPreferences { showCompanion: boolean; encouragement: boolean }
export interface OwnedPal { id: PalId; joinedAt: string; source: 'starter' | 'gems' }
export interface PalSelection { palId: PalId; from: string }
export interface PalAssignment extends PalActivity { palId: PalId | null }
export interface PalProfile {
  owner: string; policyVersion: typeof PALS_POLICY_VERSION;
  starterId: PalId | null; activeId: PalId | null; owned: OwnedPal[];
  unlockedIds: PalId[]; selections: PalSelection[]; assignments: PalAssignment[];
  preferences: PalPreferences;
}
export interface PalsWorkspace { schema: 'jems.pals.workspace.v1'; profiles: PalProfile[] }
export interface PalsBackup { schema: 'jems.pals.backup.v1'; namespace: string; data: PalsWorkspace }
export interface OwnedPalView extends OwnedPal {
  adventures: number; practiceActivities: number; creationAdventures: number;
  stage: PalStage; stageName: 'New Pal' | 'Bright Pal' | 'Radiant Pal';
  nextStageAt: number | null; adventuresToNext: number; practiceToNextAdventure: number;
}
export interface PalsView {
  owner: string; starterId: PalId | null; activeId: PalId | null;
  owned: OwnedPalView[]; availableIds: PalId[]; preferences: PalPreferences;
}
export interface PalGrowth { palId: PalId; from: PalStage; to: PalStage }
export interface PalsMutation { profile: PalsView; newlyAvailable: PalId[]; growth: PalGrowth[] }

export const copyPals = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => !!value &&
  typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
export const isPalOwner = (value: unknown): value is string => typeof value === 'string' &&
  /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
export const isPalsNamespace = (value: unknown): value is string => typeof value === 'string' &&
  /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,259}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
export const isPalTimestamp = (value: unknown): value is string => typeof value === 'string' && value.length <= 40 &&
  /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const activityKinds: readonly PalActivityKind[] = ['math.completed', 'language.completed', 'language.explored', 'scene.challenge', 'game.developed'];
const receiptId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 1024 && !/[\u0000-\u001f\u007f]/.test(value);
function invalid(): never { throw Error('This Pal collection is unsupported or damaged. Your saved collection has not been replaced.'); }
export function validatePalPreferences(value: unknown): PalPreferences {
  if (!exact(value, ['showCompanion', 'encouragement']) || typeof value.showCompanion !== 'boolean' || typeof value.encouragement !== 'boolean') invalid();
  return { showCompanion: value.showCompanion, encouragement: value.encouragement };
}
export function emptyPalProfile(owner: string): PalProfile {
  if (!isPalOwner(owner)) invalid();
  return { owner, policyVersion: 1, starterId: null, activeId: null, owned: [], unlockedIds: [], selections: [], assignments: [],
    preferences: { showCompanion: true, encouragement: true } };
}
export function emptyPalsWorkspace(): PalsWorkspace { return { schema: 'jems.pals.workspace.v1', profiles: [] }; }
export function validatePalRewardSnapshot(value: unknown, owner?: string): PalRewardSnapshot {
  if (!exact(value, ['owner', 'lifetimeGems', 'activities']) || !isPalOwner(value.owner) || owner !== undefined && value.owner !== owner ||
      !Number.isSafeInteger(value.lifetimeGems) || (value.lifetimeGems as number) < 0 ||
      !Array.isArray(value.activities) || value.activities.length > PALS_LIMITS.receiptsPerOwner) invalid();
  const seen = new Set<string>();
  for (const activity of value.activities) {
    if (!exact(activity, ['id', 'kind', 'occurredAt']) || !receiptId(activity.id) || seen.has(activity.id) ||
        !activityKinds.includes(activity.kind as PalActivityKind) || !isPalTimestamp(activity.occurredAt)) invalid();
    seen.add(activity.id);
  }
  return copyPals(value as unknown as PalRewardSnapshot);
}
export function validatePalsWorkspace(value: unknown): PalsWorkspace {
  if (!exact(value, ['schema', 'profiles']) || value.schema !== 'jems.pals.workspace.v1' ||
      !Array.isArray(value.profiles) || value.profiles.length > PALS_LIMITS.owners) invalid();
  const owners = new Set<string>();
  for (const profile of value.profiles) {
    if (!exact(profile, ['owner', 'policyVersion', 'starterId', 'activeId', 'owned', 'unlockedIds', 'selections', 'assignments', 'preferences']) ||
        !isPalOwner(profile.owner) || owners.has(profile.owner) || profile.policyVersion !== 1 ||
        !(profile.starterId === null || isPalId(profile.starterId) && palDefinition(profile.starterId).starter) ||
        !(profile.activeId === null || isPalId(profile.activeId)) ||
        !Array.isArray(profile.owned) || profile.owned.length > PAL_CATALOG.length ||
        !Array.isArray(profile.unlockedIds) || profile.unlockedIds.length > PAL_CATALOG.length ||
        !Array.isArray(profile.selections) || profile.selections.length > PALS_LIMITS.selectionsPerOwner ||
        !Array.isArray(profile.assignments) || profile.assignments.length > PALS_LIMITS.receiptsPerOwner) invalid();
    owners.add(profile.owner); validatePalPreferences(profile.preferences);
    const owned = new Map<PalId, OwnedPal>(), unlocked = new Set<PalId>();
    for (const id of profile.unlockedIds) { if (!isPalId(id) || unlocked.has(id)) invalid(); unlocked.add(id); }
    for (const pal of profile.owned) {
      if (!exact(pal, ['id', 'joinedAt', 'source']) || !isPalId(pal.id) || owned.has(pal.id) ||
          !unlocked.has(pal.id) || !isPalTimestamp(pal.joinedAt) || !['starter', 'gems'].includes(pal.source as string) ||
          (pal.source === 'starter') !== (pal.id === profile.starterId)) invalid();
      owned.set(pal.id, pal as unknown as OwnedPal);
    }
    if (profile.starterId === null) {
      if (profile.activeId !== null || owned.size || unlocked.size || profile.selections.length) invalid();
    } else if (!owned.has(profile.starterId) || !isPalId(profile.activeId) || !owned.has(profile.activeId) || !profile.selections.length) invalid();
    let previous = '';
    for (const selection of profile.selections) {
      if (!exact(selection, ['palId', 'from']) || !isPalId(selection.palId) || !isPalTimestamp(selection.from) ||
          !owned.has(selection.palId) || selection.from < previous || selection.from < owned.get(selection.palId)!.joinedAt) invalid();
      previous = selection.from;
    }
    if (profile.selections.length && (profile.selections[0].palId !== profile.starterId ||
        profile.selections[0].from !== owned.get(profile.starterId as PalId)!.joinedAt ||
        profile.selections.at(-1).palId !== profile.activeId)) invalid();
    const ids = new Set<string>();
    for (const assignment of profile.assignments) {
      if (!exact(assignment, ['id', 'kind', 'occurredAt', 'palId']) || !receiptId(assignment.id) || ids.has(assignment.id) ||
          !activityKinds.includes(assignment.kind as PalActivityKind) || !isPalTimestamp(assignment.occurredAt) ||
          !(assignment.palId === null || isPalId(assignment.palId) && owned.has(assignment.palId) &&
            assignment.occurredAt >= owned.get(assignment.palId)!.joinedAt)) invalid();
      ids.add(assignment.id);
    }
  }
  if (JSON.stringify(value).length > PALS_LIMITS.characters) throw Error('This Pal collection is full. Export a backup before continuing. Existing Pals are safe.');
  return copyPals(value as unknown as PalsWorkspace);
}
export function validatePalsBackup(value: unknown, namespace?: string): PalsBackup {
  if (!exact(value, ['schema', 'namespace', 'data']) || value.schema !== 'jems.pals.backup.v1' ||
      !isPalsNamespace(value.namespace) || namespace !== undefined && value.namespace !== namespace) invalid();
  return { schema: 'jems.pals.backup.v1', namespace: value.namespace, data: validatePalsWorkspace(value.data) };
}
export function palStage(adventures: number): PalStage { return adventures >= 15 ? 3 : adventures >= 5 ? 2 : 1; }
export function summarizePals(profile: PalProfile): PalsView {
  const owned = profile.owned.map(pal => {
    const activities = profile.assignments.filter(assignment => assignment.palId === pal.id);
    const practiceActivities = activities.filter(activity => activity.kind.startsWith('math.') || activity.kind.startsWith('language.')).length;
    const creationAdventures = activities.length - practiceActivities;
    const adventures = Math.floor(practiceActivities / PRACTICE_PER_ADVENTURE) + creationAdventures;
    const stage = palStage(adventures), nextStageAt = stage === 3 ? null : PAL_STAGE_THRESHOLDS[stage];
    return { ...copyPals(pal), adventures, practiceActivities, creationAdventures, stage,
      stageName: (['New Pal', 'Bright Pal', 'Radiant Pal'] as const)[stage - 1], nextStageAt,
      adventuresToNext: nextStageAt === null ? 0 : nextStageAt - adventures,
      practiceToNextAdventure: PRACTICE_PER_ADVENTURE - practiceActivities % PRACTICE_PER_ADVENTURE };
  });
  return { owner: profile.owner, starterId: profile.starterId, activeId: profile.activeId, owned,
    availableIds: profile.unlockedIds.filter(id => !profile.owned.some(pal => pal.id === id)), preferences: copyPals(profile.preferences) };
}
export function emptyPalsView(owner: string): PalsView { return summarizePals(emptyPalProfile(owner)); }

/** Mutates only a transaction's private copy. Every receipt is assigned once. */
export function projectPalSnapshot(profile: PalProfile, snapshot: PalRewardSnapshot): PalsMutation {
  const before = summarizePals(profile), existing = new Map(profile.assignments.map(assignment => [assignment.id, assignment]));
  for (const activity of snapshot.activities) {
    const prior = existing.get(activity.id);
    if (prior) {
      if (prior.kind !== activity.kind || prior.occurredAt !== activity.occurredAt) throw Error('A saved activity changed identity. Your Pal progress has not been replaced.');
      continue;
    }
    // Keep original selection windows so a delayed reward follows the Pal who
    // was present when it happened. Re-equipping cannot replay older work.
    let selection: PalSelection | undefined;
    for (let i = profile.selections.length - 1; i >= 0; i--) {
      if (profile.selections[i].from <= activity.occurredAt) { selection = profile.selections[i]; break; }
    }
    const assignment = { ...copyPals(activity), palId: selection?.palId ?? null };
    profile.assignments.push(assignment); existing.set(activity.id, assignment);
  }
  if (profile.starterId !== null) for (const pal of PAL_CATALOG) {
    if (snapshot.lifetimeGems >= pal.unlockGems && !profile.unlockedIds.includes(pal.id)) profile.unlockedIds.push(pal.id);
  }
  const after = summarizePals(profile);
  return { profile: after,
    newlyAvailable: after.availableIds.filter(id => !before.availableIds.includes(id)),
    growth: after.owned.flatMap(pal => {
      const old = before.owned.find(entry => entry.id === pal.id);
      return old && old.stage < pal.stage ? [{ palId: pal.id, from: old.stage, to: pal.stage }] : [];
    }) };
}

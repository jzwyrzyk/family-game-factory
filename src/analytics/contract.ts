/** Explicit, content-free product observations. No SDK/autocapture or child-authored content. */
export const ANALYTICS_SCHEMA_VERSION = 1 as const;
export const ANALYTICS_NOTICE_VERSION = 'jems-product-analytics-2026-11-v1' as const;
export const ANALYTICS_EVENTS = [
  'jems_journey_started', 'jems_creation_submitted', 'jems_creation_completed',
  'jems_creation_failed', 'jems_game_play_started', 'jems_art_saved',
  'jems_asset_added_to_game', 'jems_game_revision_played',
] as const;
export type AnalyticsEventName = typeof ANALYTICS_EVENTS[number];
export type ClientAnalyticsEventName = Exclude<AnalyticsEventName,
  'jems_creation_submitted' | 'jems_creation_completed' | 'jems_creation_failed'>;
export const ANALYTICS_MODES = ['generated', 'native', 'scene', 'drawing', 'upload', 'camera'] as const;
export type AnalyticsCreationMode = typeof ANALYTICS_MODES[number];
export const ANALYTICS_SURFACES = ['home', 'studio', 'art-studio', 'creation-studio', 'library', 'builder', 'journey', 'play'] as const;
export type AnalyticsSurface = typeof ANALYTICS_SURFACES[number];
export type AnalyticsAudience = 'adult' | 'child';
export interface AnalyticsBuildContext {
  schemaVersion: typeof ANALYTICS_SCHEMA_VERSION;
  choiceId: string;
  ownerId: string;
  creationId: string;
}
export interface ClientAnalyticsEvent extends AnalyticsBuildContext {
  event: ClientAnalyticsEventName;
  eventId: string;
  jobId?: string;
  gameId?: string;
  revisionId?: string;
  assetId?: string;
  creationMode?: AnalyticsCreationMode;
  surface?: AnalyticsSurface;
}
export interface AnalyticsStatus {
  enabled: boolean;
  permitted: boolean;
  audience: AnalyticsAudience;
  noticeVersion: typeof ANALYTICS_NOTICE_VERSION;
  status: 'disabled' | 'not-requested' | 'pending' | 'enabled' | 'revoked' | 'expired';
  choiceId: string | null;
  expiresAt: number | null;
}
export const isAnalyticsChoiceId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
/** Local owner/project references are opaque handles, never display names. */
export const analyticsReference = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_:.\/-]{0,179}$/.test(value) &&
  !value.includes('://') && !['constructor', 'prototype', '__proto__'].includes(value);
export function validateAnalyticsBuildContext(input: unknown): AnalyticsBuildContext {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('INVALID_ANALYTICS_EVENT');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).sort().join(',') !== 'choiceId,creationId,ownerId,schemaVersion' ||
      value.schemaVersion !== ANALYTICS_SCHEMA_VERSION || !isAnalyticsChoiceId(value.choiceId) || !analyticsReference(value.ownerId) ||
      !analyticsReference(value.creationId)) throw Error('INVALID_ANALYTICS_EVENT');
  return {schemaVersion: ANALYTICS_SCHEMA_VERSION, choiceId: value.choiceId, ownerId: value.ownerId, creationId: value.creationId};
}
export function validateClientAnalyticsEvent(input: unknown): ClientAnalyticsEvent {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('INVALID_ANALYTICS_EVENT');
  const value = input as Record<string, unknown>;
  const allowed = ['schemaVersion', 'choiceId', 'event', 'eventId', 'ownerId', 'creationId', 'jobId', 'gameId', 'revisionId', 'assetId', 'creationMode', 'surface'];
  const clientEvents: readonly string[] = ['jems_journey_started', 'jems_game_play_started', 'jems_art_saved', 'jems_asset_added_to_game', 'jems_game_revision_played'];
  if (Object.keys(value).some(key => !allowed.includes(key)) || value.schemaVersion !== ANALYTICS_SCHEMA_VERSION ||
      !isAnalyticsChoiceId(value.choiceId) || typeof value.event !== 'string' || !clientEvents.includes(value.event) ||
      typeof value.eventId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.eventId) ||
      !analyticsReference(value.ownerId) || !analyticsReference(value.creationId)) throw Error('INVALID_ANALYTICS_EVENT');
  for (const key of ['jobId', 'gameId', 'revisionId', 'assetId']) {
    if (value[key] !== undefined && !analyticsReference(value[key])) throw Error('INVALID_ANALYTICS_EVENT');
  }
  if (value.creationMode !== undefined && !(ANALYTICS_MODES as readonly unknown[]).includes(value.creationMode)) throw Error('INVALID_ANALYTICS_EVENT');
  if (value.surface !== undefined && !(ANALYTICS_SURFACES as readonly unknown[]).includes(value.surface)) throw Error('INVALID_ANALYTICS_EVENT');
  if (['jems_art_saved', 'jems_asset_added_to_game'].includes(value.event) && !value.assetId) throw Error('INVALID_ANALYTICS_EVENT');
  if (['jems_game_play_started', 'jems_game_revision_played', 'jems_asset_added_to_game'].includes(value.event) && !value.gameId && !value.jobId && !value.revisionId) throw Error('INVALID_ANALYTICS_EVENT');
  return {...value} as unknown as ClientAnalyticsEvent;
}

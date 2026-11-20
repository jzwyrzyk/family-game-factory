/** Product analytics permission is independent of all AI/provider permissions. */
import {createHash, randomUUID} from 'node:crypto';
import {ANALYTICS_NOTICE_VERSION, type AnalyticsAudience, type AnalyticsStatus} from '../../src/analytics/contract';
import {activeAdultPilotSession, adultPilotAllowed} from '../adult-pilot';
import type {VerifiedSession} from '../contracts/api';
import type {PipelineState, Repository} from '../pipeline/types';
import {assertActiveTrustedDevice} from '../trusted-devices';
import type {AnalyticsChoice, AnalyticsState} from './types';
const MAX_AGE = 90 * 86400000;
export function analyticsState(state: PipelineState): AnalyticsState {
  return state.analytics ??= {choices: [], bindings: [], pending: [], receipts: []};
}
export function analyticsAudience(session: VerifiedSession): AnalyticsAudience {
  return session.adultProfileId ? 'adult' : 'child';
}
export function assertAnalyticsSession(state: PipelineState, session: VerifiedSession, now = Date.now()): void {
  if (!session.deviceId || session.role !== 'designer' || !Number.isSafeInteger(session.expiresAt) || session.expiresAt <= now) throw Error('UNAUTHENTICATED');
  assertActiveTrustedDevice(state, session, now);
  if ((session.adultSessionId || session.adultProfileId) && !adultPilotAllowed(state, session, now)) throw Error('FORBIDDEN');
}
function activeDevice(state: PipelineState, choice: AnalyticsChoice, now: number): boolean {
  const device = state.devices?.find(x => x.familyId === choice.familyId && x.id === choice.deviceId);
  return !!device && device.revokedAt === undefined && Number.isSafeInteger(device.expiresAt) && device.expiresAt > now &&
    Number.isSafeInteger(device.lastSeenAt) && device.lastSeenAt + 90 * 86400000 > now;
}
export function newestAnalyticsChoice(state: PipelineState, familyId: string, audience: AnalyticsAudience, adultProfileId?: string): AnalyticsChoice | undefined {
  return state.analytics?.choices.filter(x => x.familyId === familyId && x.audience === audience &&
    (audience === 'child' || x.adultProfileId === adultProfileId)).at(-1);
}
export function validAnalyticsChoice(state: PipelineState, choice: AnalyticsChoice, now = Date.now()): boolean {
  if (choice.audience !== 'child' && choice.audience !== 'adult') return false;
  const grant = choice.audience === 'adult' && choice.adultSessionId
    ? activeAdultPilotSession(state, choice.familyId, choice.deviceId, choice.adultSessionId, now) : undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(choice.id) &&
    choice.noticeVersion === ANALYTICS_NOTICE_VERSION && choice.revokedAt === undefined &&
    Number.isSafeInteger(choice.requestedAt) && choice.requestedAt <= now && Number.isSafeInteger(choice.expiresAt) &&
    choice.expiresAt > now && choice.expiresAt > choice.requestedAt && choice.expiresAt <= choice.requestedAt + MAX_AGE &&
    Number.isSafeInteger(choice.verifiedAt) && choice.verifiedAt! >= choice.requestedAt && choice.verifiedAt! <= now &&
    typeof choice.verificationReceiptHash === 'string' && /^[a-f0-9]{64}$/.test(choice.verificationReceiptHash) &&
    (choice.audience === 'child' ? choice.adultProfileId === undefined && choice.adultSessionId === undefined :
      !!grant && choice.adultProfileId === grant.profileId && choice.requestedAt >= grant.createdAt && choice.expiresAt <= grant.expiresAt) &&
    activeDevice(state, choice, now) && newestAnalyticsChoice(state, choice.familyId, choice.audience, choice.adultProfileId)?.id === choice.id;
}
export function requireAnalyticsChoice(state: PipelineState, session: VerifiedSession, choiceId: string, now = Date.now()): AnalyticsChoice {
  assertAnalyticsSession(state, session, now);
  const choice = newestAnalyticsChoice(state, session.familyId, analyticsAudience(session), session.adultProfileId);
  if (!choice || choice.id !== choiceId || choice.adultSessionId !== session.adultSessionId ||
      !validAnalyticsChoice(state, choice, now)) throw Error('ANALYTICS_PERMISSION_REQUIRED');
  return choice;
}
export function analyticsStatus(state: PipelineState, session: VerifiedSession, enabled: boolean, now = Date.now()): AnalyticsStatus {
  assertAnalyticsSession(state, session, now);
  const audience = analyticsAudience(session), latest = newestAnalyticsChoice(state, session.familyId, audience, session.adultProfileId);
  // A new adult unlock starts with no analytics choice; an old choice cannot transfer.
  const choice = audience === 'adult' && latest?.adultSessionId !== session.adultSessionId ? undefined : latest;
  const status: AnalyticsStatus['status'] = !enabled ? 'disabled' : !choice ? 'not-requested' :
    choice.revokedAt !== undefined || !activeDevice(state, choice, now) ? 'revoked' :
    choice.expiresAt <= now ? 'expired' : validAnalyticsChoice(state, choice, now) ? 'enabled' : 'pending';
  return {enabled, permitted: enabled && status === 'enabled', audience, noticeVersion: ANALYTICS_NOTICE_VERSION,
    status, choiceId: choice?.id ?? null, expiresAt: choice?.expiresAt ?? null};
}
function assertParent(state: PipelineState, session: VerifiedSession, now: number) {
  if (!session.deviceId || session.role !== 'parent' || !Number.isSafeInteger(session.expiresAt) || session.expiresAt <= now) throw Error('PARENT_UNLOCK_REQUIRED');
  assertActiveTrustedDevice(state, session, now);
}
function dropScope(state: PipelineState, familyId: string, audience: AnalyticsAudience, adultProfileId: string | undefined, now: number) {
  const a = analyticsState(state);
  const matches = (x: {familyId: string; audience: AnalyticsAudience; adultProfileId?: string}) =>
    x.familyId === familyId && x.audience === audience && (audience === 'child' || x.adultProfileId === adultProfileId);
  for (const choice of a.choices) if (matches(choice) && choice.revokedAt === undefined) choice.revokedAt = now;
  a.pending = a.pending.filter(x => !matches(x));
  a.bindings = a.bindings.filter(x => !matches(x));
}
export async function submitAnalyticsChoice(repo: Repository, session: VerifiedSession, input: unknown, now = Date.now()) {
  const v = input as Record<string, unknown>;
  if (!v || typeof v !== 'object' || Array.isArray(v) ||
      Object.keys(v).sort().join(',') !== 'guardianAffirmed,noticeVersion,providerAcknowledged' ||
      v.noticeVersion !== ANALYTICS_NOTICE_VERSION || v.guardianAffirmed !== true || v.providerAcknowledged !== true) throw Error('INVALID_ANALYTICS_CHOICE');
  return repo.transaction(state => {
    assertParent(state, session, now);
    const a = analyticsState(state);
    if (a.choices.length >= 300) throw Error('ANALYTICS_RECORD_LIMIT');
    dropScope(state, session.familyId, 'child', undefined, now);
    const choice: AnalyticsChoice = {id: randomUUID(), familyId: session.familyId, deviceId: session.deviceId!, audience: 'child',
      noticeVersion: ANALYTICS_NOTICE_VERSION, requestedAt: now, expiresAt: now + MAX_AGE};
    a.choices.push(choice);
    return {status: 'pending' as const, choiceId: choice.id, noticeVersion: ANALYTICS_NOTICE_VERSION, expiresAt: choice.expiresAt};
  });
}
export async function revokeAnalyticsChoice(repo: Repository, session: VerifiedSession, now = Date.now()) {
  return repo.transaction(state => {
    assertParent(state, session, now); dropScope(state, session.familyId, 'child', undefined, now);
    return {status: 'revoked' as const, downstreamErasure: 'operator-required' as const};
  });
}
export async function adultAnalyticsChoice(repo: Repository, session: VerifiedSession, input: unknown, now = Date.now()) {
  const v = input as Record<string, unknown>;
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join(',') !== 'enabled,noticeVersion' ||
      v.noticeVersion !== ANALYTICS_NOTICE_VERSION || typeof v.enabled !== 'boolean') throw Error('INVALID_ANALYTICS_CHOICE');
  return repo.transaction(state => {
    assertAnalyticsSession(state, session, now);
    if (!adultPilotAllowed(state, session, now)) throw Error('FORBIDDEN');
    const grant = activeAdultPilotSession(state, session.familyId, session.deviceId!, session.adultSessionId!, now)!;
    const a = analyticsState(state);
    if (v.enabled && a.choices.length >= 300) throw Error('ANALYTICS_RECORD_LIMIT');
    dropScope(state, session.familyId, 'adult', session.adultProfileId, now);
    if (!v.enabled) return {status: 'revoked' as const, downstreamErasure: 'operator-required' as const};
    const choice: AnalyticsChoice = {id: randomUUID(), familyId: session.familyId, deviceId: session.deviceId!, audience: 'adult',
      adultProfileId: session.adultProfileId, adultSessionId: grant.id, noticeVersion: ANALYTICS_NOTICE_VERSION, requestedAt: now,
      expiresAt: Math.min(session.expiresAt, grant.expiresAt), verifiedAt: now,
      verificationReceiptHash: createHash('sha256').update('adult-analytics-choice\n' + session.adultSessionId + '\n' + now).digest('hex')};
    a.choices.push(choice);
    return {status: 'enabled' as const, choiceId: choice.id, noticeVersion: ANALYTICS_NOTICE_VERSION, expiresAt: choice.expiresAt};
  });
}
/** Independent trusted-operator guardian verification; no UI can call this. */
export async function verifyAnalyticsChoice(repo: Repository, options: {familyId: string; choiceId: string; receipt: string; verifiedByOwner: boolean}, now = Date.now()) {
  if (options.verifiedByOwner !== true || !/^[A-Za-z0-9_-]{1,100}$/.test(options.familyId) ||
      !/^[0-9a-f-]{36}$/.test(options.choiceId) || !/^[A-Za-z0-9_-]{12,120}$/.test(options.receipt)) throw Error('EXTERNAL_VERIFICATION_REQUIRED');
  return repo.transaction(state => {
    const a = analyticsState(state), choice = newestAnalyticsChoice(state, options.familyId, 'child');
    if (!choice || choice.id !== options.choiceId || choice.revokedAt !== undefined || choice.verifiedAt !== undefined ||
        choice.verificationReceiptHash !== undefined || choice.noticeVersion !== ANALYTICS_NOTICE_VERSION ||
        !Number.isSafeInteger(choice.requestedAt) || choice.requestedAt > now || !Number.isSafeInteger(choice.expiresAt) ||
        choice.expiresAt <= now || choice.expiresAt <= choice.requestedAt || choice.expiresAt > choice.requestedAt + MAX_AGE ||
        !activeDevice(state, choice, now)) throw Error('ANALYTICS_CHOICE_NOT_PENDING');
    const digest = createHash('sha256').update(options.receipt).digest('hex');
    if (a.choices.some(x => x.verificationReceiptHash === digest)) throw Error('RECEIPT_REUSED');
    choice.verifiedAt = now; choice.verificationReceiptHash = digest;
    return {status: 'enabled' as const, choiceId: choice.id, noticeVersion: ANALYTICS_NOTICE_VERSION};
  });
}

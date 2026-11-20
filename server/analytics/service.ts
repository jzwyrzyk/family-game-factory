import {createHmac, randomUUID} from 'node:crypto';
import {validateAnalyticsBuildContext, validateClientAnalyticsEvent, type AnalyticsBuildContext,
  type ClientAnalyticsEvent, type AnalyticsEventName} from '../../src/analytics/contract';
import {activeAdultPilotSession} from '../adult-pilot';
import type {VerifiedSession} from '../contracts/api';
import {requireResourceAudience} from '../pipeline/audience';
import type {Job, PipelineState, Repository} from '../pipeline/types';
import {analyticsAudience, analyticsState, assertAnalyticsSession, requireAnalyticsChoice, validAnalyticsChoice} from './consent';
import type {AnalyticsBinding, AnalyticsConfig, AnalyticsPayload, AnalyticsPending} from './types';

const PENDING_TTL = 30 * 60000, RECEIPT_TTL = 86400000, BINDING_TTL = 8 * 86400000;
const MAX_PENDING = 256, MAX_RECEIPTS = 2048, MAX_BINDINGS = 512, RATE_PER_MINUTE = 120;
export type PreparedAnalyticsSubmission = AnalyticsBuildContext & {preparedAt: number; requestId: string};
export type AnalyticsSender = (config: Extract<AnalyticsConfig, {enabled: true}>, events: AnalyticsPayload[]) => Promise<boolean>;
function digest(key: string, kind: string, ...parts: string[]) {
  return createHmac('sha256', key).update(JSON.stringify(['jems-product-v1', kind, ...parts])).digest('hex');
}
function uuidFromDigest(value: string) {
  const chars = value.slice(0, 32).split(''); chars[12] = '4'; chars[16] = '8';
  const s = chars.join(''); return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
function failureCategory(job: Job): string {
  if (job.status === 'cancelled') return 'cancelled';
  const code = job.errorCode || '';
  if (/TIMEOUT/.test(code)) return 'timeout';
  if (/SPENDING|BUDGET/.test(code)) return 'allowance';
  if (/RATE_LIMIT/.test(code)) return 'provider-busy';
  if (/CONSENT|ADULT_PILOT|FORBIDDEN|UNAUTHENTICATED/.test(code)) return 'permission';
  if (/QUALITY|TEST|COMPILE|SANDBOX|RUNTIME|INTENT|ARTIFACT/.test(code)) return 'validation';
  return 'build-failed';
}
function pendingAllowed(state: PipelineState, p: Pick<AnalyticsPending, 'familyId' | 'deviceId' | 'audience' | 'choiceId' | 'adultSessionId' | 'adultProfileId'>, now: number): boolean {
  const choice = state.analytics?.choices.find(x => x.id === p.choiceId && x.familyId === p.familyId && x.audience === p.audience);
  const device = state.devices?.find(x => x.id === p.deviceId && x.familyId === p.familyId);
  if (!choice || !validAnalyticsChoice(state, choice, now) || !device || device.revokedAt !== undefined ||
      device.expiresAt <= now || device.lastSeenAt + 90 * 86400000 <= now) return false;
  if (p.audience === 'adult') {
    if (!p.adultSessionId || !p.adultProfileId || choice.adultProfileId !== p.adultProfileId || choice.adultSessionId !== p.adultSessionId) return false;
    const grant = activeAdultPilotSession(state, p.familyId, p.deviceId, p.adultSessionId, now);
    return !!grant && grant.profileId === p.adultProfileId;
  }
  return !p.adultSessionId && !p.adultProfileId;
}
function bindingAllowed(state: PipelineState, binding: AnalyticsBinding, now: number): boolean {
  return pendingAllowed(state, binding, now);
}
function prune(state: PipelineState, now: number) {
  const a = state.analytics; if (!a) return;
  a.pending = a.pending.filter(x => x.expiresAt > now && pendingAllowed(state, x, now));
  a.receipts = a.receipts.filter(x => x.at > now - RECEIPT_TTL).slice(-MAX_RECEIPTS);
  a.bindings = a.bindings.filter(x => x.acceptedAt > now - BINDING_TTL && bindingAllowed(state, x, now)).slice(-MAX_BINDINGS);
}
/** Legacy batch capture remains supported. It sends no request cookies, URLs,
 * user-agent, referrer, client IP, names or child-authored content. */
export const sendPostHogBatch: AnalyticsSender = async (config, events) => {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(config.captureOrigin + '/batch/', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, redirect: 'error', signal: controller.signal,
      body: JSON.stringify({api_key: config.projectToken, batch: events}),
    });
    if (!response.ok) { await response.body?.cancel(); return false; }
    await response.body?.cancel(); return true;
  } catch { return false; } finally { clearTimeout(timer); }
};
export class ProductAnalytics {
  readonly repository: Repository;
  private flushing?: Promise<void>;
  constructor(private base: Repository, readonly config: AnalyticsConfig,
    private options: {send?: AnalyticsSender; now?: () => number} = {}) {
    this.repository = !config.enabled ? base : {
      snapshot: () => base.snapshot(),
      transaction: async <T>(update: (state: PipelineState) => T): Promise<T> => base.transaction(state => {
        let before = new Map<string, string | undefined>();
        try { before = new Map((state.analytics?.bindings || []).map(binding => [binding.jobId,
          state.jobs.find(job => job.id === binding.jobId)?.status])); } catch { /* Invalid optional analytics state cannot stop play. */ }
        const result = update(state); // Core exceptions retain their original semantics.
        try { this.observeTransitions(state, before, this.now()); } catch { /* Optional diagnostics cannot break a committed game action. */ }
        return result;
      }),
    };
  }
  private now() { return this.options.now?.() ?? Date.now(); }
  private reference(familyId: string, deviceId: string, audience: string, ownerId: string, kind: string, ref: string) {
    if (!this.config.enabled) throw Error('ANALYTICS_DISABLED');
    // Local profile IDs can repeat on separate devices; this is the profile on
    // one verified device, not a cross-device person identity.
    const profile = digest(this.config.pseudonymKey, 'profile', familyId, deviceId, audience, ownerId);
    return kind === 'profile' ? profile : digest(this.config.pseudonymKey, 'bound-' + kind, profile, ref);
  }
  private scope(session: VerifiedSession, choiceId: string) {
    return {familyId: session.familyId, deviceId: session.deviceId!, audience: analyticsAudience(session), choiceId,
      ...(session.adultSessionId ? {adultSessionId: session.adultSessionId, adultProfileId: session.adultProfileId} : {})};
  }
  private assertOwner(session: VerifiedSession, ownerId: string) {
    if (session.adultProfileId ? ownerId !== session.adultProfileId : ownerId.startsWith('adult:')) throw Error('ANALYTICS_PERMISSION_REQUIRED');
  }
  private payload(event: AnalyticsEventName, id: string, distinctId: string, audience: string, source: 'client' | 'server', now: number,
    properties: Record<string, string | number | boolean | null>): AnalyticsPayload {
    if (!this.config.enabled) throw Error('ANALYTICS_DISABLED');
    return {uuid: id, event, timestamp: new Date(now).toISOString(), properties: {
      distinct_id: distinctId, schema_version: 1, audience, environment: this.config.environment,
      release: this.config.release, source, $process_person_profile: false, $geoip_disable: true, $ip: null,
      $lib: 'jems-explicit-relay', ...properties,
    }};
  }
  private enqueue(state: PipelineState, scope: ReturnType<ProductAnalytics['scope']>, payload: AnalyticsPayload, now: number): boolean {
    const a = analyticsState(state); prune(state, now);
    if (a.receipts.some(x => x.id === payload.uuid) || a.pending.some(x => x.id === payload.uuid)) return false;
    if (a.pending.length >= MAX_PENDING || a.receipts.filter(x => x.familyId === scope.familyId && x.deviceId === scope.deviceId && x.at > now - 60000).length >= RATE_PER_MINUTE) return false;
    a.pending.push({...scope, id: payload.uuid, createdAt: now, expiresAt: now + PENDING_TTL, payload});
    a.receipts.push({id: payload.uuid, at: now, familyId: scope.familyId, deviceId: scope.deviceId});
    a.receipts = a.receipts.slice(-MAX_RECEIPTS); return true;
  }
  async record(session: VerifiedSession, input: unknown): Promise<{accepted: number}> {
    if (!this.config.enabled) return {accepted: 0};
    const body = input as Record<string, unknown>;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).join(',') !== 'events' ||
        !Array.isArray(body.events) || body.events.length < 1 || body.events.length > 20) throw Error('INVALID_ANALYTICS_EVENT');
    const events = body.events.map(validateClientAnalyticsEvent);
    return this.base.transaction(state => {
      const now = this.now(); assertAnalyticsSession(state, session, now);
      // Validate the entire batch before adding anything; cross-consent batches never partially export.
      for (const event of events) { requireAnalyticsChoice(state, session, event.choiceId, now); this.assertOwner(session, event.ownerId); }
      let accepted = 0;
      for (const event of events) {
        const p = this.clientPayload(state, session, event, now);
        if (this.enqueue(state, this.scope(session, event.choiceId), p, now)) accepted++;
      }
      return {accepted};
    });
  }
  private clientPayload(state: PipelineState, session: VerifiedSession, event: ClientAnalyticsEvent, now: number): AnalyticsPayload {
    const audience = analyticsAudience(session);
    const ref = (kind: string, value: string) => this.reference(session.familyId, session.deviceId!, audience, event.ownerId, kind, value);
    const distinctId = ref('profile', event.ownerId);
    const properties: Record<string, string | number | boolean | null> = {creation_id: ref('creation', event.creationId)};
    if (event.creationMode) properties.creation_mode = event.creationMode;
    if (event.surface) properties.surface = event.surface;
    for (const [input, output, kind] of [['gameId', 'game_id', 'game'], ['assetId', 'asset_id', 'asset'], ['revisionId', 'revision_id', 'revision']] as const) {
      const value = event[input]; if (value) properties[output] = ref(kind, value);
    }
    // Job/revision relationships come from authorized server records, never client claims.
    let job: Job | undefined;
    if (event.jobId) { if (event.creationMode !== 'generated') throw Error('INVALID_ANALYTICS_EVENT'); job = state.jobs.find(x => x.id === event.jobId); if (!job) throw Error('INVALID_ANALYTICS_EVENT'); requireResourceAudience(state, session, job); }
    if (event.revisionId && event.creationMode === 'generated') {
      const revision = state.revisions.find(x => x.id === event.revisionId); if (!revision) throw Error('INVALID_ANALYTICS_EVENT');
      requireResourceAudience(state, session, revision);
      if (event.gameId && event.gameId !== revision.projectId) throw Error('INVALID_ANALYTICS_EVENT');
      if (job && job.revisionId !== revision.id) throw Error('INVALID_ANALYTICS_EVENT');
      job ??= state.jobs.find(x => x.revisionId === revision.id && x.familyId === session.familyId);
      properties.game_id = ref('game', revision.projectId); properties.revision_id = ref('revision', revision.id);
    }
    if (event.creationMode === 'generated' && ['jems_game_play_started', 'jems_game_revision_played', 'jems_asset_added_to_game'].includes(event.event) && !job) {
      throw Error('INVALID_ANALYTICS_EVENT');
    }
    if (job) {
      requireResourceAudience(state, session, job);
      const binding = state.analytics?.bindings.find(x => x.jobId === job!.id && x.choiceId === event.choiceId);
      if (!binding || binding.distinctId !== distinctId || binding.creationId !== properties.creation_id) throw Error('INVALID_ANALYTICS_EVENT');
      if (['jems_game_play_started', 'jems_game_revision_played'].includes(event.event) && job.status !== 'ready') throw Error('INVALID_ANALYTICS_EVENT');
      properties.job_id = ref('job', job.id); properties.build_adapter = job.adapter; properties.creation_mode = 'generated';
      if (job.revisionId) {
        const revision = state.revisions.find(x => x.id === job!.revisionId); if (!revision) throw Error('INVALID_ANALYTICS_EVENT');
        if ((event.gameId && event.gameId !== revision.projectId) || (event.revisionId && event.revisionId !== revision.id)) throw Error('INVALID_ANALYTICS_EVENT');
        properties.game_id = ref('game', revision.projectId); properties.revision_id = ref('revision', revision.id);
      }
    }
    return this.payload(event.event, uuidFromDigest(ref('event', event.eventId)), distinctId, audience, 'client', now, properties);
  }
  async prepareSubmission(session: VerifiedSession, input: unknown, request: unknown): Promise<PreparedAnalyticsSubmission | null> {
    if (!this.config.enabled || input === undefined) return null;
    try {
      const context = validateAnalyticsBuildContext(input), r = request as Record<string, unknown>, state = await this.base.snapshot(), now = this.now();
      if (!r || typeof r.clientRequestId !== 'string') return null;
      requireAnalyticsChoice(state, session, context.choiceId, now); this.assertOwner(session, context.ownerId);
      // A later opt-in or replay cannot enroll a historical accepted job.
      if (state.jobs.some(x => x.familyId === session.familyId && x.clientRequestId === r.clientRequestId &&
          x.adultPilotProfileId === session.adultProfileId)) return null;
      return {...context, preparedAt: now, requestId: r.clientRequestId};
    } catch { return null; }
  }
  async acceptedSubmission(session: VerifiedSession, context: PreparedAnalyticsSubmission | null, ack: {jobId: string}): Promise<void> {
    if (!this.config.enabled || !context) return;
    try {
      await this.base.transaction(state => {
        const now = this.now(); requireAnalyticsChoice(state, session, context.choiceId, now); this.assertOwner(session, context.ownerId);
        const job = state.jobs.find(x => x.id === ack.jobId);
        if (!job || job.clientRequestId !== context.requestId || job.status !== 'queued') return false;
        // The initial queued audit is the core service's acceptance timestamp.
        // A stale prepare snapshot must not enroll an older idempotent request.
        const admittedAt = Date.parse(state.audit.find(x => x.jobId === job.id && x.familyId === job.familyId && x.status === 'queued')?.at || '');
        if (!Number.isSafeInteger(admittedAt) || admittedAt < context.preparedAt) return false;
        requireResourceAudience(state, session, job);
        const a = analyticsState(state); prune(state, now);
        if (a.bindings.some(x => x.jobId === job.id) || a.bindings.length >= MAX_BINDINGS) return false;
        const scope = this.scope(session, context.choiceId), ref = (kind: string, value: string) => this.reference(session.familyId, session.deviceId!, scope.audience, context.ownerId, kind, value);
        const binding: AnalyticsBinding = {...scope, jobId: job.id, distinctId: ref('profile', context.ownerId),
          creationId: ref('creation', context.creationId), acceptedAt: now};
        a.bindings.push(binding);
        this.enqueue(state, scope, this.payload('jems_creation_submitted', uuidFromDigest(ref('server-event', job.id + ':submitted')),
          binding.distinctId, scope.audience, 'server', now, {creation_id: binding.creationId, job_id: ref('job', job.id),
            creation_mode: 'generated', build_adapter: job.adapter}), now);
        return true;
      });
    } catch { /* Analytics never changes an accepted game request. */ }
  }
  private observeTransitions(state: PipelineState, before: Map<string, string | undefined>, now: number) {
    if (!this.config.enabled || !state.analytics) return;
    prune(state, now);
    for (const binding of state.analytics.bindings) {
      const job = state.jobs.find(x => x.id === binding.jobId);
      if (!job || before.get(job.id) === job.status || !['ready', 'failed', 'cancelled'].includes(job.status) || !pendingAllowed(state, binding, now)) continue;
      // References derive from the already scoped profile digest: no raw profile is retained in bindings.
      const scoped = (kind: string, value: string) => digest(this.config.enabled ? this.config.pseudonymKey : '', 'bound-' + kind, binding.distinctId, value);
      // The accepted binding stores export refs to keep them identical across client and server events.
      const event = job.status === 'ready' ? 'jems_creation_completed' : 'jems_creation_failed';
      const properties: Record<string, string | number | boolean | null> = {
        creation_id: binding.creationId, job_id: scoped('job', job.id), creation_mode: 'generated', build_adapter: job.adapter,
        duration_ms: Math.max(0, Math.min(86400000, now - binding.acceptedAt)),
      };
      if (job.status === 'ready') {
        if (!job.revisionId) continue;
        const revision = state.revisions.find(x => x.id === job.revisionId);
        if (!revision || revision.familyId !== job.familyId || revision.adultPilotProfileId !== job.adultPilotProfileId) continue;
        properties.game_id = scoped('game', revision.projectId); properties.revision_id = scoped('revision', revision.id);
      } else properties.failure_category = failureCategory(job);
      this.enqueue(state, binding, this.payload(event, uuidFromDigest(scoped('server-event', job.id + ':' + event)),
        binding.distinctId, binding.audience, 'server', now, properties), now);
    }
  }
  /** Bounded opportunistic drain; no paid jobs or provider retries are involved. */
  async flush(): Promise<void> {
    if (!this.config.enabled) return;
    if (this.flushing) return this.flushing;
    const config = this.config;
    this.flushing = (async () => {
      if (!(await this.base.snapshot()).analytics?.pending.length) return;
      const now = this.now(), lease = randomUUID();
      const batch = await this.base.transaction(state => {
        prune(state, now);
        const events = (state.analytics?.pending || []).filter(x => !x.leaseUntil || x.leaseUntil <= now).slice(0, 20);
        for (const event of events) { event.leaseId = lease; event.leaseUntil = now + 5000; }
        return events;
      });
      if (!batch.length) return;
      const current = await this.base.snapshot(), send = batch.filter(x => current.analytics?.pending.some(p => p.id === x.id && p.leaseId === lease) && pendingAllowed(current, x, this.now()));
      const delivered = !send.length || await (this.options.send || sendPostHogBatch)(config, send.map(x => x.payload));
      await this.base.transaction(state => {
        prune(state, this.now());
        if (!state.analytics) return true;
        const ids = new Set(send.map(x => x.id));
        state.analytics.pending = state.analytics.pending.filter(x => !(x.leaseId === lease && delivered && ids.has(x.id)));
        for (const event of state.analytics.pending) if (event.leaseId === lease) { delete event.leaseId; delete event.leaseUntil; }
        return true;
      });
    })().catch(() => {}).finally(() => { this.flushing = undefined; });
    return this.flushing;
  }
}

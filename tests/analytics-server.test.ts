import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {createServer, type Server} from 'node:http';
import {ANALYTICS_NOTICE_VERSION, validateClientAnalyticsEvent, type ClientAnalyticsEvent} from '../src/analytics/contract';
import {analyticsConfig} from '../server/analytics/config';
import {adultAnalyticsChoice, analyticsStatus, submitAnalyticsChoice, revokeAnalyticsChoice, verifyAnalyticsChoice} from '../server/analytics/consent';
import {ProductAnalytics} from '../server/analytics/service';
import {analyticsHandler} from '../server/analytics/http';
import type {AnalyticsConfig, AnalyticsPayload} from '../server/analytics/types';
import {MemoryRepository} from '../server/pipeline/repository';
import {JobService} from '../server/pipeline/service';
import {apiHandler} from '../server/pipeline/http';
import {signSession} from '../server/pipeline/auth';
import {authenticateAdultPilotSession, beginAdultPilotSession, grantAdultPilot} from '../server/adult-pilot';
import type {VerifiedSession} from '../server/contracts/api';
import type {Repository, PipelineState} from '../server/pipeline/types';

const enabled: Extract<AnalyticsConfig, {enabled: true}> = {
  enabled: true, captureOrigin: 'https://us.i.posthog.com', projectToken: 'phc_synthetic_analytics_fixture',
  pseudonymKey: 'synthetic-analytics-pseudonymization-key-not-a-secret', environment: 'test', release: 'a'.repeat(40),
};
const origin = 'https://jems.example', signing = 'synthetic-analytics-session-signing-key';
const parentChoice = {noticeVersion: ANALYTICS_NOTICE_VERSION, guardianAffirmed: true, providerAcknowledged: true};
async function fixture(options: {config?: AnalyticsConfig; consent?: boolean; send?: (events: AnalyticsPayload[]) => Promise<boolean>} = {}) {
  const repo = new MemoryRepository(), time = {now: Date.now()}, sent: AnalyticsPayload[][] = [];
  const session: VerifiedSession = {familyId: 'family-fixture-one', deviceId: randomUUID(), subject: 'family-designer', role: 'designer', expiresAt: time.now + 86400000};
  const parent: VerifiedSession = {...session, role: 'parent', subject: 'family-parent'};
  await repo.transaction(state => {
    state.devices = [{id: session.deviceId!, familyId: session.familyId, name: 'Fixture tablet', secretHash: 'a'.repeat(64),
      rotation: 0, createdAt: time.now, lastSeenAt: time.now, expiresAt: time.now + 86400000}];
    return true;
  });
  const analytics = new ProductAnalytics(repo, options.config || enabled, {now: () => time.now, send: async (_config, events) => {
    sent.push(events); return options.send ? options.send(events) : true;
  }});
  let choiceId: string = randomUUID();
  if (options.consent !== false) {
    const choice = await submitAnalyticsChoice(repo, parent, parentChoice, time.now); choiceId = choice.choiceId;
    await verifyAnalyticsChoice(repo, {familyId: session.familyId, choiceId, receipt: 'independently-reviewed-fixture-guardian', verifiedByOwner: true}, time.now);
  }
  const event = (overrides: Partial<ClientAnalyticsEvent> = {}): ClientAnalyticsEvent => ({schemaVersion: 1, choiceId,
    event: 'jems_journey_started', eventId: randomUUID(), ownerId: 'profile-local-1', creationId: 'studio-local-1', surface: 'studio', ...overrides});
  return {repo, analytics, session, parent, time, sent, choiceId, event};
}
async function built(f: Awaited<ReturnType<typeof fixture>>, options: {fail?: boolean; requestId?: string; context?: Record<string, unknown>} = {}) {
  const service = new JobService(f.analytics.repository, {kind: 'mock', available: true, testFixture: true,
    generate: async () => { if (options.fail) throw Error('PROVIDER_ERROR secret child prompt 123'); return {
      candidate: {format: 'declarative-v1', game: {kind: 'star-catcher-v1', target: 5, seconds: 10}}, usageUnits: 0}; }},
    {test: async () => {}}, {allowMock: true, maxUnits: 0, timeoutMs: 1000, maxRetries: 1});
  const request = {gameId: 'new', baseRevisionId: null, prompt: 'Catch five shining stars', clientRequestId: options.requestId || randomUUID()};
  const context = options.context || {schemaVersion: 1, choiceId: f.choiceId, ownerId: 'profile-local-1', creationId: 'studio-local-1'};
  const prepared = await f.analytics.prepareSubmission(f.session, context, request);
  const ack = await service.submit(f.session, request);
  await f.analytics.acceptedSubmission(f.session, prepared, ack);
  f.time.now += 50;
  await service.run(ack.jobId);
  const job = await service.get(f.session, ack.jobId);
  return {service, request, context, prepared, ack, job};
}
async function listen(handler: ReturnType<typeof analyticsHandler>) {
  const server = createServer((req, res) => void handler(req, res));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return {server, url: `http://127.0.0.1:${(server.address() as {port: number}).port}`};
}
async function close(server: Server) { await new Promise<void>(resolve => server.close(() => resolve())); }

test('disabled or incomplete analytics config stays inert without replacing the core repository', async () => {
  const f = await fixture({config: {enabled: false}});
  assert.equal(f.analytics.repository, f.repo);
  assert.deepEqual(await f.analytics.record(f.session, {events: [f.event()]}), {accepted: 0});
  await f.analytics.flush(); assert.equal(f.sent.length, 0);
  for (const env of [{}, {FACTORY_ANALYTICS_ENABLED: 'true'}, {FACTORY_ANALYTICS_ENABLED: 'false', FACTORY_POSTHOG_PROJECT_TOKEN: 'bad'}]) assert.deepEqual(analyticsConfig(env), {enabled: false});
  const config = {FACTORY_ANALYTICS_ENABLED: 'true', FACTORY_POSTHOG_CAPTURE_ORIGIN: enabled.captureOrigin,
    FACTORY_POSTHOG_PROJECT_TOKEN: enabled.projectToken, FACTORY_ANALYTICS_HMAC_KEY: enabled.pseudonymKey,
    FACTORY_ANALYTICS_ENVIRONMENT: enabled.environment, FACTORY_ANALYTICS_RELEASE: enabled.release};
  assert.deepEqual(analyticsConfig(config), enabled);
  for (const origin of ['https://evil.example', 'https://us.i.posthog.com/other', 'http://us.i.posthog.com', 'https://us.i.posthog.com@evil.example']) assert.deepEqual(analyticsConfig({...config, FACTORY_POSTHOG_CAPTURE_ORIGIN: origin}), {enabled: false});
});

test('family analytics needs its own current verified choice and never borrows AI permission', async () => {
  const f = await fixture({consent: false});
  assert.equal(analyticsStatus(await f.repo.snapshot(), f.session, true).permitted, false);
  await assert.rejects(f.analytics.record(f.session, {events: [f.event()]}), /ANALYTICS_PERMISSION_REQUIRED/);
  const choice = await submitAnalyticsChoice(f.repo, f.parent, parentChoice, f.time.now);
  assert.equal(analyticsStatus(await f.repo.snapshot(), f.session, true).status, 'pending');
  await assert.rejects(f.analytics.record(f.session, {events: [f.event({choiceId: choice.choiceId})]}), /ANALYTICS_PERMISSION_REQUIRED/);
  await verifyAnalyticsChoice(f.repo, {familyId: f.session.familyId, choiceId: choice.choiceId, receipt: 'independent-analytics-fixture-receipt', verifiedByOwner: true}, f.time.now);
  assert.equal(analyticsStatus(await f.repo.snapshot(), f.session, true).permitted, true);
  assert.equal((await f.repo.snapshot()).parentPrivacyChoices, undefined);
  assert.equal((await f.repo.snapshot()).coachConsent, undefined);
});

test('strict events reject free text, custom properties, URLs, client timestamps and fabricated server outcomes', async () => {
  const f = await fixture();
  for (const additions of [{name: 'Child name'}, {prompt: 'Private idea'}, {properties: {secret: 'private'}}, {timestamp: new Date().toISOString()}, {durationMs: 5},
    {creationId: 'https://secret.example/private?token=x'}, {event: 'jems_creation_completed'}, {event: '$pageview'}, {creationMode: 'anything'}, {eventId: 'not-a-uuid'}]) {
    await assert.rejects(f.analytics.record(f.session, {events: [{...f.event(), ...additions}]}), /INVALID_ANALYTICS_EVENT/);
  }
  assert.throws(() => validateClientAnalyticsEvent({...f.event(), event: 'jems_art_saved'}), /INVALID_ANALYTICS_EVENT/);
  assert.equal((await f.repo.snapshot()).analytics!.pending.length, 0);
});

test('event envelope exports only selected fields and HMAC-scoped identifiers', async () => {
  const f = await fixture();
  const event = f.event({event: 'jems_asset_added_to_game', gameId: 'local-game-1', assetId: 'drawing-asset-1', creationMode: 'scene'});
  assert.equal((await f.analytics.record(f.session, {events: [event]})).accepted, 1);
  await f.analytics.flush();
  const payload = f.sent[0][0], serialized = JSON.stringify(payload);
  for (const original of [f.session.familyId, f.session.deviceId!, event.ownerId, event.creationId, event.gameId!, event.assetId!, f.choiceId]) assert.equal(serialized.includes(original), false, original);
  assert.match(String(payload.properties.distinct_id), /^[a-f0-9]{64}$/);
  assert.equal(payload.properties.source, 'client'); assert.equal(payload.properties.$process_person_profile, false);
  assert.equal(payload.properties.$geoip_disable, true); assert.equal(payload.properties.$ip, null);
  assert.equal(payload.properties.release, enabled.release); assert.equal((await f.repo.snapshot()).analytics!.pending.length, 0);
  assert.equal((await f.analytics.record(f.session, {events: [event]})).accepted, 0, 'same receipt cannot enqueue again');
});

test('identical local profiles on two verified devices have separate event and reference identities', async () => {
  const f = await fixture(), second = {...f.session, deviceId: randomUUID()};
  await f.repo.transaction(state => {
    state.devices!.push({...state.devices![0], id: second.deviceId, name: 'Second fixture tablet'}); return true;
  });
  const event = f.event({event: 'jems_asset_added_to_game', ownerId: 'player1', creationId: 'project1',
    gameId: 'game1', revisionId: 'revision1', assetId: 'art1', creationMode: 'scene'});
  assert.equal((await f.analytics.record(f.session, {events: [event]})).accepted, 1);
  assert.equal((await f.analytics.record(second, {events: [event]})).accepted, 1);
  await f.analytics.flush();
  const [first, other] = f.sent.flat();
  assert.notEqual(first.uuid, other.uuid);
  for (const key of ['distinct_id', 'creation_id', 'game_id', 'revision_id', 'asset_id']) {
    assert.notEqual(first.properties[key], other.properties[key], key);
  }
  const serialized = JSON.stringify(f.sent);
  for (const raw of [f.session.deviceId!, second.deviceId, 'player1']) assert.equal(serialized.includes(raw), false);
});

test('revocation and replacement drop queued data and reject stale consent-pinned callbacks', async () => {
  const f = await fixture(); await f.analytics.record(f.session, {events: [f.event()]});
  const revoked = await revokeAnalyticsChoice(f.repo, f.parent, f.time.now + 1);
  assert.equal(revoked.downstreamErasure, 'operator-required');
  assert.equal((await f.repo.snapshot()).analytics!.pending.length, 0);
  const fresh = await submitAnalyticsChoice(f.repo, f.parent, parentChoice, f.time.now + 2);
  await verifyAnalyticsChoice(f.repo, {familyId: f.session.familyId, choiceId: fresh.choiceId, receipt: 'new-verified-analytics-fixture-receipt', verifiedByOwner: true}, f.time.now + 2);
  f.time.now += 3;
  await assert.rejects(f.analytics.record(f.session, {events: [f.event()]}), /ANALYTICS_PERMISSION_REQUIRED/);
  await f.analytics.flush(); assert.equal(f.sent.length, 0);
});

test('trusted-device revocation before a queued send removes its pending data', async () => {
  const f = await fixture(); await f.analytics.record(f.session, {events: [f.event()]});
  await f.repo.transaction(s => { s.devices![0].revokedAt = f.time.now; return true; });
  await f.analytics.flush(); assert.equal(f.sent.length, 0); assert.equal((await f.repo.snapshot()).analytics!.pending.length, 0);
});

test('transaction rollback cannot export an event or manufacture a confirmed job result', async () => {
  const f = await fixture();
  await assert.rejects(f.analytics.repository.transaction(s => { s.analytics!.pending.push({} as never); throw Error('SAVE_FAILED'); }), /SAVE_FAILED/);
  await f.analytics.flush(); assert.equal(f.sent.length, 0); assert.equal((await f.repo.snapshot()).analytics!.pending.length, 0);
});

test('malformed optional analytics state cannot fail a core game transaction', async () => {
  const f = await fixture();
  await f.repo.transaction(s => { s.analytics!.bindings = {unexpected: true} as never; return true; });
  assert.equal(await f.analytics.repository.transaction(s => { s.active['fixture-game'] = 'fixture-revision'; return 'saved'; }), 'saved');
  assert.equal((await f.repo.snapshot()).active['fixture-game'], 'fixture-revision');
  await f.analytics.flush(); assert.equal(f.sent.length, 0);
});

test('server-confirmed creation and exact same-game play preserve all correlation IDs', async () => {
  const f = await fixture(), b = await built(f);
  assert.equal(b.job.status, 'ready'); assert.ok(b.job.revisionId);
  const revision = await b.service.revision(f.session, b.job.revisionId!);
  await f.analytics.record(f.session, {events: [f.event({event: 'jems_game_play_started', gameId: revision.projectId,
    revisionId: revision.id, jobId: b.ack.jobId, creationMode: 'generated'})]});
  await f.analytics.flush(); const events = f.sent.flat();
  assert.deepEqual(events.map(e => e.event), ['jems_creation_submitted', 'jems_creation_completed', 'jems_game_play_started']);
  const [submitted, completed, played] = events;
  for (const key of ['creation_id', 'job_id', 'distinct_id']) {
    assert.equal(submitted.properties[key], completed.properties[key], key);
    assert.equal(completed.properties[key], played.properties[key], key);
  }
  assert.equal(completed.properties.game_id, played.properties.game_id);
  assert.equal(completed.properties.revision_id, played.properties.revision_id);
  assert.equal(completed.properties.duration_ms, 50);
  assert.equal(completed.properties.source, 'server'); assert.equal(played.properties.source, 'client');
  assert.equal(completed.properties.build_adapter, 'mock');
  assert.equal(JSON.stringify(events).includes('Catch five shining stars'), false);
});

test('generated play rejects a different creation, profile, job, or game project', async () => {
  const f = await fixture(), b = await built(f), revision = await b.service.revision(f.session, b.job.revisionId!);
  const event = f.event({event: 'jems_game_play_started', gameId: revision.projectId, revisionId: revision.id, jobId: b.ack.jobId, creationMode: 'generated'});
  for (const change of [{creationId: 'another-project'}, {ownerId: 'another-profile'}, {gameId: 'other-game'}, {jobId: randomUUID()}, {creationMode: 'native'}]) {
    await assert.rejects(f.analytics.record(f.session, {events: [{...event, ...change}]}), /INVALID_ANALYTICS_EVENT/);
  }
  const {jobId: _job, revisionId: _revision, ...unproven} = event;
  await assert.rejects(f.analytics.record(f.session, {events: [unproven]}), /INVALID_ANALYTICS_EVENT/);
});

test('build failure exports a fixed coarse category while preserving the core failure result', async () => {
  const f = await fixture(), b = await built(f, {fail: true});
  assert.equal(b.job.status, 'failed'); await f.analytics.flush();
  const events = f.sent.flat(); assert.deepEqual(events.map(e => e.event), ['jems_creation_submitted', 'jems_creation_failed']);
  assert.equal(events[1].properties.failure_category, 'build-failed');
  assert.equal(JSON.stringify(events).includes('secret'), false); assert.equal(JSON.stringify(events).includes('child prompt'), false);
});

test('historical or idempotent accepted jobs are not backfilled under a new analytics context', async () => {
  const f = await fixture(), b = await built(f); await f.analytics.flush();
  assert.equal(await f.analytics.prepareSubmission(f.session, b.context, b.request), null);
  const repeated = await b.service.submit(f.session, b.request); assert.equal(repeated.jobId, b.ack.jobId);
  await f.analytics.flush(); assert.equal(f.sent.flat().length, 2);
});

test('a stale prepare snapshot cannot enroll an already accepted idempotent job', async () => {
  const f = await fixture(), previous = await f.repo.snapshot();
  const service = new JobService(f.analytics.repository, {kind: 'mock', available: true, testFixture: true,
    generate: async () => ({candidate: {format: 'declarative-v1', game: {kind: 'star-catcher-v1', target: 3, seconds: 10}}, usageUnits: 0})},
    {test: async () => {}}, {allowMock: true, maxUnits: 0, timeoutMs: 1000, maxRetries: 1});
  const request = {gameId: 'new', baseRevisionId: null, prompt: 'Catch three stars', clientRequestId: randomUUID()};
  const ack = await service.submit(f.session, request), current = await f.repo.snapshot();
  f.time.now = Date.parse(current.audit.find(x => x.jobId === ack.jobId && x.status === 'queued')!.at) + 1;
  const snapshot = f.repo.snapshot.bind(f.repo);
  f.repo.snapshot = async () => previous;
  const prepared = await f.analytics.prepareSubmission(f.session, {schemaVersion: 1, choiceId: f.choiceId,
    ownerId: 'profile-local-1', creationId: 'studio-local-1'}, request);
  f.repo.snapshot = snapshot;
  assert.ok(prepared, 'the deliberately stale read cannot see the existing request');
  await f.analytics.acceptedSubmission(f.session, prepared, await service.submit(f.session, request));
  assert.equal((await f.repo.snapshot()).analytics!.bindings.length, 0);
  assert.equal((await f.repo.snapshot()).analytics!.pending.length, 0);
  assert.equal((await service.get(f.session, ack.jobId)).status, 'queued');
});

test('analytics transport failure remains bounded and retryable without changing the successful job', async () => {
  let ok = false; const f = await fixture({send: async () => ok}), b = await built(f);
  await f.analytics.flush(); assert.equal((await f.repo.snapshot()).analytics!.pending.length, 2); assert.equal((await b.service.get(f.session, b.ack.jobId)).status, 'ready');
  const first = f.sent[0].map(x => x.uuid); ok = true; await f.analytics.flush();
  assert.deepEqual(f.sent[1].map(x => x.uuid), first); assert.equal((await f.repo.snapshot()).analytics!.pending.length, 0);
});

test('expired pending data is dropped instead of replaying an old session', async () => {
  const f = await fixture(); await f.analytics.record(f.session, {events: [f.event()]}); f.time.now += 31 * 60000;
  await f.analytics.flush(); assert.equal(f.sent.length, 0); assert.equal((await f.repo.snapshot()).analytics!.pending.length, 0);
});

test('batch bounds and the per-device rate bound are enforced without blocking the game store', async () => {
  const f = await fixture();
  await assert.rejects(f.analytics.record(f.session, {events: Array.from({length: 21}, () => f.event())}), /INVALID_ANALYTICS_EVENT/);
  for (let i = 0; i < 6; i++) assert.equal((await f.analytics.record(f.session, {events: Array.from({length: 20}, () => f.event())})).accepted, 20);
  assert.equal((await f.analytics.record(f.session, {events: [f.event()]})).accepted, 0);
  assert.equal(await f.analytics.repository.transaction(() => 'game-action-completes'), 'game-action-completes');
});

test('active adult permission is separate from family consent and cannot be asserted by profile name', async () => {
  const f = await fixture({consent: false});
  await grantAdultPilot(f.repo, {familyId: f.session.familyId, deviceId: f.session.deviceId!, receipt: 'separately-approved-fixture-adult', operatorConfirmedAdult: true, expiresAt: f.time.now + 86400000}, f.time.now);
  const unlock = await f.repo.transaction(s => beginAdultPilotSession(s, f.session, f.time.now));
  const adult = authenticateAdultPilotSession(await f.repo.snapshot(), f.session, unlock.cookieValue, unlock.sessionToken, f.time.now);
  assert.equal(analyticsStatus(await f.repo.snapshot(), adult, true, f.time.now).permitted, false);
  const choice = await adultAnalyticsChoice(f.repo, adult, {noticeVersion: ANALYTICS_NOTICE_VERSION, enabled: true}, f.time.now);
  assert.equal(choice.status, 'enabled'); assert.ok('choiceId' in choice);
  const event = f.event({choiceId: choice.choiceId!, ownerId: adult.adultProfileId!});
  await assert.rejects(f.analytics.record(f.session, {events: [event]}), /ANALYTICS_PERMISSION_REQUIRED/);
  await assert.rejects(f.analytics.record(adult, {events: [{...event, ownerId: 'profile-local-1'}]}), /ANALYTICS_PERMISSION_REQUIRED/);
  assert.equal((await f.analytics.record(adult, {events: [event]})).accepted, 1);
  await f.repo.transaction(s => { s.adultPilotSessions![0].revokedAt = f.time.now; return true; });
  await f.analytics.flush(); assert.equal(f.sent.length, 0);
});

test('adult analytics opt-in expires with its exact unlock and never transfers to a later unlock', async () => {
  const f = await fixture({consent: false});
  await grantAdultPilot(f.repo, {familyId: f.session.familyId, deviceId: f.session.deviceId!, receipt: 'session-bound-adult-fixture-receipt',
    operatorConfirmedAdult: true, expiresAt: f.time.now + 86400000}, f.time.now);
  const unlock = await f.repo.transaction(s => beginAdultPilotSession(s, f.session, f.time.now));
  const adult = authenticateAdultPilotSession(await f.repo.snapshot(), f.session, unlock.cookieValue, unlock.sessionToken, f.time.now);
  const firstChoice = await adultAnalyticsChoice(f.repo, adult, {noticeVersion: ANALYTICS_NOTICE_VERSION, enabled: true}, f.time.now);
  assert.equal(firstChoice.expiresAt, unlock.grant.expiresAt);
  assert.equal((await f.repo.snapshot()).analytics!.choices[0].adultSessionId, unlock.grant.id);
  const stale = f.event({choiceId: firstChoice.choiceId!, ownerId: adult.adultProfileId!});
  await f.analytics.record(adult, {events: [stale]});
  f.time.now += 1;
  const nextUnlock = await f.repo.transaction(s => beginAdultPilotSession(s, f.session, f.time.now));
  const nextAdult = authenticateAdultPilotSession(await f.repo.snapshot(), f.session, nextUnlock.cookieValue, nextUnlock.sessionToken, f.time.now);
  const status = analyticsStatus(await f.repo.snapshot(), nextAdult, true, f.time.now);
  assert.equal(status.permitted, false); assert.equal(status.status, 'not-requested'); assert.equal(status.choiceId, null);
  await assert.rejects(f.analytics.record(nextAdult, {events: [stale]}), /ANALYTICS_PERMISSION_REQUIRED/);
  await f.analytics.flush(); assert.equal(f.sent.length, 0); assert.equal((await f.repo.snapshot()).analytics!.pending.length, 0);
  const nextChoice = await adultAnalyticsChoice(f.repo, nextAdult, {noticeVersion: ANALYTICS_NOTICE_VERSION, enabled: true}, f.time.now);
  assert.notEqual(nextChoice.choiceId, firstChoice.choiceId);
  await assert.rejects(f.analytics.record(nextAdult, {events: [stale]}), /ANALYTICS_PERMISSION_REQUIRED/);
  assert.equal((await f.analytics.record(nextAdult, {events: [f.event({choiceId: nextChoice.choiceId!, ownerId: nextAdult.adultProfileId!})]})).accepted, 1);
});

test('invalid stored consent evidence never silently authorizes export', async () => {
  for (const damage of [(c: Record<string, unknown>) => delete c.verificationReceiptHash, (c: Record<string, unknown>) => {c.noticeVersion = 'old';},
    (c: Record<string, unknown>) => {c.verifiedAt = Number.NaN;}, (c: Record<string, unknown>) => {c.expiresAt = Date.now() + 91 * 86400000;}]) {
    const f = await fixture(); await f.repo.transaction(s => { damage(s.analytics!.choices[0] as unknown as Record<string, unknown>); return true; });
    assert.equal(analyticsStatus(await f.repo.snapshot(), f.session, true).permitted, false);
    await assert.rejects(f.analytics.record(f.session, {events: [f.event()]}), /ANALYTICS_PERMISSION_REQUIRED/);
  }
});

test('HTTP collector enforces authentication, Origin, CSRF, parent unlock and strict body limits', async () => {
  const f = await fixture(), live = await listen(analyticsHandler(f.analytics, f.analytics.repository, {appOrigin: origin, familyId: f.session.familyId, sessionKey: signing}));
  const headers = {Origin: origin, Cookie: 'factory_session=' + signSession(f.session, signing), 'Content-Type': 'application/json', 'X-Factory-Request': '1'};
  try {
    assert.equal((await fetch(live.url + '/v1/analytics/status', {headers})).status, 200);
    assert.equal((await fetch(live.url + '/v1/analytics/status')).status, 401);
    const send = (changed: Record<string, string> = {}, body: unknown = {events: [f.event()]}) => fetch(live.url + '/v1/analytics/events', {method: 'POST', headers: {...headers, ...changed}, body: JSON.stringify(body)});
    assert.equal((await send()).status, 202);
    assert.equal((await send({Origin: 'https://other.example'})).status, 403);
    assert.equal((await send({'X-Factory-Request': '0'})).status, 403);
    assert.equal((await send({}, {events: [f.event()], extra: 'private'})).status, 400);
    assert.equal((await send({}, {events: [], blob: 'x'.repeat(25000)})).status, 400);
    assert.equal((await fetch(live.url + '/v1/devices/analytics', {headers})).status, 401);
    const parentHeaders = {...headers, Cookie: headers.Cookie + '; factory_parent=' + signSession(f.parent, signing)};
    const revoked = await fetch(live.url + '/v1/devices/analytics/revoke', {method: 'POST', headers: parentHeaders, body: '{}'});
    assert.equal(revoked.status, 200); assert.equal((await revoked.json()).downstreamErasure, 'operator-required');
    assert.equal((await send()).status, 403);
  } finally { await close(live.server); }
});

test('the optional collector drains once before ending its request for request-billed runtimes', async () => {
  let begin!: () => void, release!: () => void;
  const began = new Promise<void>(resolve => { begin = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  const f = await fixture({send: async () => { begin(); await gate; return true; }});
  const live = await listen(analyticsHandler(f.analytics, f.analytics.repository, {appOrigin: origin, familyId: f.session.familyId, sessionKey: signing}));
  const headers = {Origin: origin, Cookie: 'factory_session=' + signSession(f.session, signing), 'Content-Type': 'application/json', 'X-Factory-Request': '1'};
  try {
    let answered = false;
    const request = fetch(live.url + '/v1/analytics/events', {method: 'POST', headers, body: JSON.stringify({events: [f.event()]})})
      .then(response => { answered = true; return response; });
    await began; assert.equal(answered, false, 'HTTP response stays open until the bounded send completes');
    release(); assert.equal((await request).status, 202);
    assert.equal(f.sent.length, 1); assert.equal((await f.repo.snapshot()).analytics!.pending.length, 0);
  } finally { release(); await close(live.server); }
});

test('gateway build boundary strips optional context but preserves core validation and idempotency', async () => {
  const f = await fixture(), service = new JobService(f.analytics.repository, {kind: 'mock', available: true, testFixture: true,
    generate: async () => ({candidate: {format: 'declarative-v1', game: {kind: 'star-catcher-v1', target: 3, seconds: 10}}, usageUnits: 0})},
    {test: async () => {}}, {allowMock: true, maxUnits: 0, timeoutMs: 1000, maxRetries: 1});
  const handler = apiHandler(service, {sessionKey: signing, previewKey: 'synthetic-preview-signing-key-32-characters', appOrigin: origin,
    previewOrigin: 'https://preview.example', analytics: f.analytics, dispatch: async () => {}}, f.analytics.repository);
  const live = await listen(handler), headers = {Origin: origin, Cookie: 'factory_session=' + signSession(f.session, signing), 'Content-Type': 'application/json', 'X-Factory-Request': '1'};
  try {
    const input = {gameId: 'new', baseRevisionId: null, prompt: 'Catch three stars', clientRequestId: randomUUID(),
      analytics: {schemaVersion: 1, choiceId: f.choiceId, ownerId: 'profile-local-1', creationId: 'studio-local-1'}};
    const post = (value: unknown) => fetch(live.url + '/v1/jobs', {method: 'POST', headers, body: JSON.stringify(value)});
    const first = await post(input); assert.equal(first.status, 202); const ack = await first.json();
    const second = await post(input); assert.equal((await second.json()).jobId, ack.jobId);
    assert.equal((await f.repo.snapshot()).analytics!.bindings.length, 1);
    assert.equal((await post({...input, clientRequestId: randomUUID(), analytics: {unexpected: 'data'}})).status, 202);
    assert.equal((await post({...input, clientRequestId: randomUUID(), arbitrary: 'unknown'})).status, 400);
  } finally { await close(live.server); }
});

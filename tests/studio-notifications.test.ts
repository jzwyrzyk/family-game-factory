import assert from 'node:assert/strict';
import test from 'node:test';
import { StudioNotebook, STUDIO_KEY, validateNotebook, type Candidate, type StudioSession } from '../src/studio/notebook';
import {
  acknowledgeStudioNotificationItems, deriveStudioNotifications, freshStudioNotificationPreferences,
  MAX_STUDIO_NOTIFICATION_ACKNOWLEDGEMENTS, validateStudioNotificationPreferences,
  type StudioNotificationContext, type StudioNotificationRef,
} from '../src/studio/notifications';
import { freshDesign, type Experiment } from '../src/studio/design';
import { builderJourney } from '../src/brand/gem-progress';
import { installEvidenceReceiver } from '../src/problem-solving/signals';
import { setRewardSourceMaintenance } from '../src/rewards/write-guard';

const OWNER = 'child-one', OTHER = 'child-two', AT = '2026-11-22T15:00:00.000Z';
class Memory {
  data = new Map<string, string>(); writes = 0; fail = false;
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.fail) throw Error('quota');
    this.data.set(key, value); this.writes++;
  }
}
function session(id: string, extra: Partial<StudioSession> = {}): StudioSession {
  return { id, owner: OWNER, name: 'My moon cat', game: 'new', projectId: null, remoteId: null,
    candidate: null, draft: '', messages: [], job: null, updated: AT, hypothesis: '', reflection: false,
    design: freshDesign(), experiments: [], selectedTest: null, ...extra };
}
function experiment(id: string, extra: Partial<Candidate> = {}): Experiment {
  const candidate: Candidate = { id, baseId: null, remoteId: 'remote-' + id,
    prompt: 'Let the cat jump', summary: 'A new jump', ...extra };
  return { id, label: 'Test A', title: candidate.prompt, baseId: candidate.baseId, parents: [], candidate,
    depth: 'tune', origin: 'child', prediction: '', notes: '', createdAt: AT };
}
function ready(id: string, extra: Partial<StudioSession> = {}): StudioSession {
  const result = experiment(id + '-test');
  return session(id, { job: { id: 'job-' + id, api: 'https://builder.test', status: 'ready', revisionId: result.candidate.remoteId },
    experiments: [result], ...extra });
}
const pending = (): NonNullable<StudioSession['pendingExperiment']> => ({
  parents: [], depth: 'tune', origin: 'child', baseId: null, prompt: 'Let the cat jump',
});
function item(source: StudioSession, prefs = freshStudioNotificationPreferences(), context: StudioNotificationContext = {}) {
  const rows = deriveStudioNotifications([source], source.owner, context, prefs);
  assert.equal(rows.length, 1); return rows[0];
}
function restored(sessions: StudioSession[], memory = new Memory()) {
  const book = new StudioNotebook(memory);
  book.restore({ version: 1, sessions, active: {} });
  return { book, memory };
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value); for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

test('projection is owner scoped, deduplicated and excludes archives, empty starters and ordinary play', () => {
  const mine = session('idea', { draft: 'My cat can jump' });
  const sources = [ready('sibling', { owner: OTHER }), ready('away', { archived: true }), session('empty'),
    session('starter', { game: 'moon', projectId: 'starter-project', playOnly: true,
      messages: [{ id: 'hello', role: 'helper', text: 'Have fun!', at: AT }] }),
    session('ordinary-play', { game: 'moon', projectId: 'my-project' }), mine, structuredClone(mine)];
  const rows = deriveStudioNotifications(freeze(sources), OWNER);
  assert.deepEqual(rows.map(row => row.sessionId), ['idea']);
  assert.equal(rows[0].kind, 'draft'); assert.equal(rows[0].unread, false);
  assert.equal(rows[0].projectName, mine.name);
  assert.deepEqual(deriveStudioNotifications(sources, 'another-child'), []);
});

test('default project names retain distinct child-authored idea reminders within their owner', () => {
  const first = ready('first', { name: 'My new idea', draft: '  A cat\n who rides a comet.  ' });
  const second = ready('second', { name: 'My new idea', messages: [
    { id: 'idea', role: 'child', text: 'A tiny train carries\tblue flowers.', at: AT },
    { id: 'helper', role: 'helper', text: 'Compile all agreed mechanics.', at: AT },
  ] });
  const sibling = ready('first', { owner: OTHER, name: 'My new idea', draft: 'My sibling-only dragon.' });
  const sources = freeze([sibling, first, second]);
  const rows = deriveStudioNotifications(sources, OWNER);
  assert.deepEqual(rows.map(row => [row.projectName, row.idea]), [
    ['My new idea', 'A cat who rides a comet.'],
    ['My new idea', 'A tiny train carries blue flowers.'],
  ]);
  assert.deepEqual(deriveStudioNotifications(sources, OTHER).map(row => row.idea), ['My sibling-only dragon.']);
});

test('idea reminders prefer the draft, fall back only to meaningful child messages and remain bounded', () => {
  const messages: StudioSession['messages'] = [
    { id: 'first', role: 'child', text: 'My first idea.', at: AT },
    { id: 'latest', role: 'child', text: '  Let the turtle\n\t skate. ', at: AT },
    { id: 'blank', role: 'child', text: ' \n\t ', at: AT },
    { id: 'helper', role: 'helper', text: 'Compile the scene and all plan fields.', at: AT },
    { id: 'reflection', role: 'reflection', text: 'I liked the last test.', at: AT },
  ];
  const source = session('draft', { draft: '  My fresh\n idea. ', messages,
    pendingExperiment: { ...pending(), prompt: 'COMPILED BUILD INSTRUCTIONS: create runtime modules.' } });
  assert.equal(item(source).idea, 'My fresh idea.');
  assert.equal(item({ ...source, draft: ' \t ' }).idea, 'Let the turtle skate.');
  const compiledOnly = item({ ...source, draft: '', messages: messages.slice(2) });
  assert.equal(compiledOnly.idea, undefined);
  assert.equal(Object.hasOwn(compiledOnly, 'idea'), false);
  const long = item({ ...source, draft: 'a'.repeat(158) + '🚀' + 'z'.repeat(20) }).idea!;
  assert.equal(long, 'a'.repeat(158) + '…');
  assert.ok(long.length <= 160);
  assert.equal(item({ ...source, draft: 'b'.repeat(160) }).idea, 'b'.repeat(160));
});

test('idea reminders leave job transition tokens and stable polling order unchanged', () => {
  const first = session('a-project', { draft: 'A jumping comet.',
    job: { id: 'job-a', api: 'https://builder.test', status: 'queued' } });
  const second = session('b-project', { messages: [{ id: 'child', role: 'child', text: 'A dancing train.', at: AT }],
    job: { id: 'job-b', api: 'https://builder.test', status: 'building' } });
  const before = deriveStudioNotifications([second, first], OWNER);
  first.updated = '2026-11-22T17:00:00.000Z'; first.job!.status = 'testing'; second.job!.phase = 'repairing';
  assert.deepEqual(deriveStudioNotifications([first, second], OWNER), before);
  for (const source of [ready('ready'), first, session('failed', {
    job: { id: 'failed-job', api: 'https://builder.test', status: 'failed' },
  })]) {
    const initial = item(source);
    const revised = item({ ...source, draft: 'A newer child-authored reminder.' });
    assert.equal(revised.token, initial.token);
    assert.equal(revised.idea, 'A newer child-authored reminder.');
    if (revised.kind === 'failed') assert.equal(revised.title, 'The build needs help');
  }
});

test('one current item per project prioritizes ready, recovery, failure, pending and unfinished work without truncating', () => {
  const result = experiment('local-test', { baseId: 'main', remoteId: undefined, config: { jump: 4 } });
  const sources = [session('draft', { draft: 'A new idea' }),
    session('experiment', { game: 'moon', projectId: 'project', candidate: result.candidate, experiments: [result] }),
    session('building', { draft: 'Still here', job: { id: 'build', api: 'https://builder.test', status: 'building' } }),
    session('failed', { draft: 'Try again later', job: { id: 'failed-job', api: 'https://builder.test', status: 'failed' } }),
    session('unknown', { draft: 'My saved request', pendingExperiment: pending() }),
    ready('ready', { draft: 'An additional draft', pendingExperiment: pending(), candidate: result.candidate })];
  const rows = deriveStudioNotifications(sources, OWNER);
  assert.deepEqual(rows.map(row => row.kind), ['ready', 'unknown', 'failed', 'building', 'experiment', 'draft']);
  assert.equal(new Set(rows.map(row => row.sessionId)).size, 6);
  assert.equal(rows.filter(row => row.unread).length, 3);
  assert.equal(rows.filter(row => row.pending).length, 2);
  assert.equal(rows[0].action, 'open-ready'); assert.equal(rows[0].actionLabel, 'Play my game');
  assert.ok(rows.every(row => row.actionLabel.length > 0));
});

test('an actual saved ready result wins over stale unknown, unconfirmed and sending observations', () => {
  const source = ready('ready', { pendingExperiment: pending() }), set = new Set([source.id]);
  const row = item(source, freshStudioNotificationPreferences(), {
    unknownSessionIds: set, unconfirmedSessionIds: set, sendingSessionIds: set,
  });
  assert.equal(row.kind, 'ready'); assert.equal(row.pending, false); assert.equal(row.unread, true);
  assert.equal(item({ ...source, projectId: 'working-game' }).actionLabel, 'Try my change');
});

test('selected, current and previously kept results do not return as new ready alerts after Undo', () => {
  const selected = ready('selected'); selected.selectedTest = selected.experiments![0].id;
  selected.candidate = selected.experiments![0].candidate;
  const current = ready('current'); current.remoteId = current.job!.revisionId!;
  const kept = ready('kept', { remoteId: 'older-version' });
  const result = kept.experiments![0]; result.baseId = 'older-version'; result.candidate.baseId = 'older-version';
  kept.keptExperiments = [{ experimentId: result.id, revisionId: result.candidate.remoteId!, baseId: 'older-version', kind: 'remote', at: AT }];
  kept.verifiedRemoteExperiments = [result.id];
  validateNotebook({ version: 1, sessions: [selected, current, kept], active: {} });
  const rows = deriveStudioNotifications([selected, current, kept], OWNER);
  assert.deepEqual(rows.map(row => row.kind), ['experiment']);
  assert.equal(rows[0].sessionId, selected.id); assert.equal(rows[0].unread, false);
});

test('saved selected or kept results resolve stale connection uncertainty while a new unconfirmed submit remains unknown', () => {
  const selected = ready('selected'); selected.selectedTest = selected.experiments![0].id;
  selected.candidate = selected.experiments![0].candidate;
  const kept = ready('kept', { remoteId: 'working-version' }), result = kept.experiments![0];
  result.baseId = 'older-version'; result.candidate.baseId = 'older-version';
  kept.keptExperiments = [{ experimentId: result.id, revisionId: result.candidate.remoteId!, baseId: 'older-version', kind: 'remote', at: AT }];
  kept.verifiedRemoteExperiments = [result.id];
  validateNotebook({ version: 1, sessions: [selected, kept], active: {} });
  const context = { unknownSessionIds: new Set([selected.id, kept.id]) };
  const rows = deriveStudioNotifications([selected, kept], OWNER, context);
  assert.deepEqual(rows.map(row => [row.sessionId, row.kind, row.unread]), [[selected.id, 'experiment', false]]);
  selected.pendingExperiment = pending();
  const unconfirmed = item(selected, freshStudioNotificationPreferences(), {
    ...context, unconfirmedSessionIds: new Set([selected.id]),
  });
  assert.equal(unconfirmed.kind, 'unknown'); assert.equal(unconfirmed.unread, true); assert.equal(unconfirmed.pending, true);
});

test('polling phases and timestamps cannot create unread alerts or undo a pending dismissal', () => {
  const source = session('working', { draft: 'My idea', job: { id: 'job-one', api: 'https://builder.test', status: 'queued' } });
  const original = item(source), prefs = acknowledgeStudioNotificationItems(freshStudioNotificationPreferences(), OWNER, [original], true);
  for (const status of ['queued', 'building', 'testing'] as const) {
    const row = item({ ...source, updated: '2026-11-22T16:00:00.000Z', job: { ...source.job!, status, phase: 'repairing' } }, prefs);
    assert.equal(row.token, original.token); assert.equal(row.unread, false);
    assert.equal(row.dismissed, true); assert.equal(row.pending, true);
  }
});

test('same-priority rows keep their order while different jobs update their polling timestamps', () => {
  const first = session('a-project', { job: { id: 'job-a', api: 'https://builder.test', status: 'queued' } });
  const second = session('b-project', { updated: '2026-11-22T16:00:00.000Z',
    job: { id: 'job-b', api: 'https://builder.test', status: 'building' } });
  const before = deriveStudioNotifications([second, first], OWNER);
  first.updated = '2026-11-22T17:00:00.000Z'; first.job!.status = 'testing'; second.job!.phase = 'repairing';
  assert.deepEqual(deriveStudioNotifications([first, second], OWNER), before,
    'Unchanged visible information preserves the exact row order and values');
});

test('new job and result identities resurface after acknowledgement without replacing the project', () => {
  const source = ready('same-project'), first = item(source);
  const prefs = acknowledgeStudioNotificationItems(freshStudioNotificationPreferences(), OWNER, [first], true);
  const seen = item(source, prefs); assert.equal(seen.unread, false); assert.equal(seen.dismissed, true);
  const newer = structuredClone(source), next = experiment('next-test');
  newer.job = { ...newer.job!, id: 'retry-job', revisionId: next.candidate.remoteId };
  newer.experiments!.push(next);
  const second = item(newer, prefs);
  assert.equal(second.sessionId, first.sessionId); assert.notEqual(second.token, first.token);
  assert.equal(second.unread, true); assert.equal(second.dismissed, false);
  const newRevision = { ...source, experiments: [next], job: { ...source.job!, revisionId: next.candidate.remoteId } };
  assert.notEqual(item(newRevision, prefs).token, first.token, 'A different saved revision is a new transition even if a job ID stays the same');
});

test('read and dismissed alerts remain available, with unread independent from unresolved work', () => {
  const source = session('uncertain', { pendingExperiment: pending() }), original = item(source);
  assert.equal(original.kind, 'unknown'); assert.equal(original.pending, true); assert.equal(original.unread, true);
  const seenPrefs = acknowledgeStudioNotificationItems(freshStudioNotificationPreferences(), OWNER, [original]);
  const seen = item(source, seenPrefs);
  assert.equal(seen.unread, false); assert.equal(seen.pending, true); assert.equal(seen.dismissed, false);
  const dismissedPrefs = acknowledgeStudioNotificationItems(seenPrefs, OWNER, [seen], true);
  const dismissed = item(source, dismissedPrefs);
  assert.equal(dismissed.unread, false); assert.equal(dismissed.pending, true); assert.equal(dismissed.dismissed, true);
  assert.equal(item(source, acknowledgeStudioNotificationItems(dismissedPrefs, OWNER, [dismissed])).dismissed, true,
    'Reading again does not erase an explicit home dismissal');
  const failed = { ...source, job: { id: 'accepted-job', api: 'https://builder.test', status: 'failed' as const } };
  const failure = item(failed, dismissedPrefs);
  assert.equal(failure.kind, 'failed'); assert.equal(failure.unread, true); assert.equal(failure.pending, false); assert.equal(failure.dismissed, false);
  const recovery = item(failed, freshStudioNotificationPreferences(), { unknownSessionIds: new Set([source.id]) });
  assert.equal(recovery.kind, 'unknown'); assert.notEqual(recovery.token, failure.token);
});

test('saved unconfirmed requests and missing results stay honest across reload without claiming a build was accepted', () => {
  const source = session('unconfirmed', { draft: 'Let the cat jump', pendingExperiment: pending() });
  const { book, memory } = restored([source]);
  assert.equal(item(new StudioNotebook(memory).get(source.id, OWNER)).kind, 'unknown');
  const sending = item(book.get(source.id, OWNER), freshStudioNotificationPreferences(), { sendingSessionIds: new Set([source.id]) });
  assert.equal(sending.kind, 'building'); assert.equal(sending.unread, false); assert.equal(sending.pending, true);
  assert.match(sending.title, /Checking/); assert.doesNotMatch(sending.title, /being made/);
  assert.equal(book.get(source.id, OWNER).job, null, 'Projection never invents a server acknowledgement');
  const missing = ready('missing'); missing.experiments = [];
  assert.equal(item(missing).kind, 'unknown'); assert.equal(item(missing).action, 'open-project');
  assert.equal(item({ ...missing, job: { ...missing.job!, revisionId: undefined } }).kind, 'unknown');
});

test('a confirmed cancelled build leaves its saved draft without a pending or unread alert', () => {
  const source = session('cancelled', { pendingExperiment: pending(),
    job: { id: 'stopped-job', api: 'https://builder.test', status: 'cancelled' } });
  const row = item(source);
  assert.equal(row.kind, 'draft'); assert.equal(row.pending, false); assert.equal(row.unread, false);
});

test('draft versions follow child work, not helper replies or recency updates', () => {
  const source = session('draft', { draft: 'Let the cat wait' }), first = item(source);
  const prefs = acknowledgeStudioNotificationItems(freshStudioNotificationPreferences(), OWNER, [first], true);
  const helperOnly = { ...source, updated: '2026-11-22T19:00:00.000Z',
    messages: [{ id: 'helper', role: 'helper' as const, text: 'What happens next?', at: AT }] };
  assert.equal(item(helperOnly, prefs).token, first.token); assert.equal(item(helperOnly, prefs).dismissed, true);
  const edited = item({ ...source, draft: 'Let the cat wait for my tap' }, prefs);
  assert.notEqual(edited.token, first.token); assert.equal(edited.dismissed, false); assert.equal(edited.unread, false);
  const childReply = item({ ...helperOnly, messages: [...helperOnly.messages, { id: 'child', role: 'child', text: 'A big leap!', at: AT }] }, prefs);
  assert.notEqual(childReply.token, first.token);
});

test('legacy resume dismissal keeps routine work tucked away but never hides a new major transition', () => {
  assert.equal(item(session('draft', { draft: 'A cat', resumeDismissed: true })).dismissed, true);
  assert.equal(item(ready('ready', { resumeDismissed: true })).dismissed, false);
  assert.equal(item(session('failed', { resumeDismissed: true, job: { id: 'job', api: 'https://builder.test', status: 'failed' } })).dismissed, false);
});

test('projection and preferences are pure and save only inert bounded version tokens', () => {
  const source = freeze(session('private-idea', { draft: 'A secret child-authored cat story', pendingExperiment: pending() }));
  const original = JSON.stringify(source), prefs = freeze(freshStudioNotificationPreferences()), row = item(source, prefs);
  const changed = acknowledgeStudioNotificationItems(prefs, OWNER, [freeze(row)], true);
  assert.equal(JSON.stringify(source), original); assert.deepEqual(prefs, { acknowledgements: [] });
  assert.equal(row.idea, 'A secret child-authored cat story');
  assert.match(row.token, /^v1:unknown:[a-f0-9]{16}$/);
  assert.deepEqual(Object.keys(changed.acknowledgements[0]).sort(), ['dismissed', 'sessionId', 'token']);
  assert.doesNotMatch(JSON.stringify(changed), /secret|cat story|https:|prompt|api/);
});

test('a stale item cannot acknowledge a newer result', () => {
  const older = item(ready('project')), newer = ready('project'); newer.job!.id = 'new-job';
  const stalePrefs = acknowledgeStudioNotificationItems(freshStudioNotificationPreferences(), OWNER, [older]);
  assert.equal(item(newer, stalePrefs).unread, true);
});

test('acknowledgements retain one latest token per project and have a strict owner-independent size bound', () => {
  const refs = Array.from({ length: MAX_STUDIO_NOTIFICATION_ACKNOWLEDGEMENTS }, (_, index) => item(ready('project-' + index)));
  const full = acknowledgeStudioNotificationItems(freshStudioNotificationPreferences(), OWNER, refs);
  const latest = item(ready('extra'));
  const capped = acknowledgeStudioNotificationItems(full, OWNER, [latest]);
  assert.equal(capped.acknowledgements.length, 80); assert.equal(capped.acknowledgements[0].sessionId, 'project-1');
  assert.equal(full.acknowledgements[0].sessionId, 'project-0');
  const replacement = { ...latest, token: item(ready('another-result')).token };
  const replaced = acknowledgeStudioNotificationItems(capped, OWNER, [replacement], true);
  assert.equal(replaced.acknowledgements.filter(entry => entry.sessionId === latest.sessionId).length, 1);
  assert.equal(replaced.acknowledgements.at(-1)!.token, replacement.token);
  assert.throws(() => acknowledgeStudioNotificationItems(full, OWNER, [...refs, latest]), /Invalid notification/);
});

test('preference validation rejects extra fields, malformed tokens, duplicate projects and unsafe identifiers', () => {
  const ref = item(ready('project'));
  const acknowledgement = { sessionId: ref.sessionId, token: ref.token, dismissed: false };
  for (const invalid of [null, [], {}, { acknowledgements: 'yes' }, { acknowledgements: [], prompts: [] },
    { acknowledgements: [acknowledgement, acknowledgement] },
    { acknowledgements: [{ ...acknowledgement, dismissed: 'yes' }] },
    { acknowledgements: [{ ...acknowledgement, token: 'https://provider.test/secret' }] },
    { acknowledgements: [{ ...acknowledgement, token: ref.token + 'x' }] },
    { acknowledgements: [{ ...acknowledgement, job: { status: 'ready' } }] },
    { acknowledgements: Array.from({ length: 81 }, (_, index) => ({ ...acknowledgement, sessionId: 'p-' + index })) },
    ...['__proto__', 'constructor', 'prototype', 'with space'].map(sessionId => ({ acknowledgements: [{ ...acknowledgement, sessionId }] })),
  ]) assert.throws(() => validateStudioNotificationPreferences(invalid), /notification/);
  assert.throws(() => acknowledgeStudioNotificationItems(freshStudioNotificationPreferences(), OTHER, [ref]), /own profile/);
  assert.throws(() => acknowledgeStudioNotificationItems(freshStudioNotificationPreferences(), OWNER, [ref, ref]), /own profile/);
  assert.throws(() => deriveStudioNotifications([], '__proto__'), /Invalid player/);
});

test('old notebooks and untouched preference reads remain byte-for-byte unchanged', () => {
  const memory = new Memory(), old = { version: 1, sessions: [], active: {} };
  assert.deepEqual(validateNotebook(old), old);
  memory.data.set(STUDIO_KEY, ' ' + JSON.stringify(old) + '\n');
  const original = memory.getItem(STUDIO_KEY), book = new StudioNotebook(memory);
  const prefs = book.notificationPreferences(OWNER); prefs.acknowledgements.push({ sessionId: 'unrelated', token: item(ready('r')).token, dismissed: true });
  assert.deepEqual(book.notificationPreferences(OWNER), freshStudioNotificationPreferences());
  assert.deepEqual(book.acknowledgeNotifications(OWNER, []), freshStudioNotificationPreferences());
  assert.equal(memory.writes, 0); assert.equal(memory.getItem(STUDIO_KEY), original);
  assert.equal(Object.hasOwn(book.read(), 'notifications'), false);
});

test('read and dismissal persist per profile through reload and notebook backup restore', () => {
  const mine = ready('mine'), sibling = ready('sibling', { owner: OTHER });
  const { book, memory } = restored([mine, sibling]);
  book.acknowledgeNotifications(OWNER, [item(mine)]); book.dismissNotification(OTHER, item(sibling));
  const reopened = new StudioNotebook(memory);
  assert.equal(item(reopened.get(mine.id, OWNER), reopened.notificationPreferences(OWNER)).unread, false);
  assert.equal(item(reopened.get(mine.id, OWNER), reopened.notificationPreferences(OWNER)).dismissed, false);
  assert.equal(item(reopened.get(sibling.id, OTHER), reopened.notificationPreferences(OTHER)).dismissed, true);
  const target = new StudioNotebook(new Memory()); target.restore(reopened.read());
  assert.deepEqual(target.notificationPreferences(OWNER), reopened.notificationPreferences(OWNER));
  assert.deepEqual(target.notificationPreferences(OTHER), reopened.notificationPreferences(OTHER));
  target.restore({ version: 1, sessions: [mine, sibling], active: {} });
  assert.equal(item(target.get(mine.id, OWNER), target.notificationPreferences(OWNER)).unread, true);
});

test('notification writes cannot change creative work, job recovery, recency, rank, rewards or evidence', () => {
  const source = ready('my-project', { draft: 'My later idea', pendingExperiment: pending(), hypothesis: 'I think it will leap',
    messages: [{ id: 'child-idea', role: 'child', text: 'My jumping cat', at: AT }] });
  source.design!.ideas.push({ id: 'idea', text: 'A jumping cat', origin: 'child', adopted: true });
  const memory = new Memory(); let rewards = 0, evidence = 0;
  const book = new StudioNotebook(memory, () => { rewards++; });
  book.restore({ version: 1, sessions: [source], active: { [OWNER]: source.id } });
  const before = book.read(), journey = builderJourney(before.sessions, OWNER);
  const cleanup = installEvidenceReceiver(() => { evidence++; });
  try { book.acknowledgeNotifications(OWNER, [item(source)]); book.dismissNotification(OWNER, item(source)); }
  finally { cleanup(); }
  const { notifications, ...after } = book.read();
  assert.ok(notifications); assert.deepEqual(after, before);
  assert.deepEqual(builderJourney(book.list(OWNER), OWNER), journey);
  assert.equal(rewards, 0); assert.equal(evidence, 0);
});

test('metadata writes reread concurrent drafts and other profile acknowledgements', () => {
  const mine = ready('mine'), sibling = ready('sibling', { owner: OTHER });
  const { book: first, memory } = restored([mine, sibling]), second = new StudioNotebook(memory);
  second.update(mine.id, OWNER, value => { value.draft = 'My newer unsent idea'; });
  second.dismissNotification(OTHER, item(sibling));
  first.acknowledgeNotifications(OWNER, [item(mine)]);
  assert.equal(first.get(mine.id, OWNER).draft, 'My newer unsent idea');
  assert.equal(first.notificationPreferences(OTHER).acknowledgements[0].dismissed, true);
  assert.equal(first.notificationPreferences(OWNER).acknowledgements[0].dismissed, false);
});

test('failed acknowledgement saves leave both original preferences and project bytes intact', () => {
  const source = ready('mine'), { book, memory } = restored([source]);
  const original = memory.getItem(STUDIO_KEY); memory.fail = true;
  assert.throws(() => book.acknowledgeNotifications(OWNER, [item(source)]), /Could not save/);
  assert.throws(() => book.dismissNotification(OWNER, item(source)), /Could not save/);
  assert.equal(memory.getItem(STUDIO_KEY), original);
  assert.deepEqual(book.notificationPreferences(OWNER), freshStudioNotificationPreferences());
  assert.equal(item(book.get(source.id, OWNER)).unread, true);
});

test('notification preferences obey the existing backup maintenance writer guard', () => {
  const source = ready('mine'), { book, memory } = restored([source]), original = memory.getItem(STUDIO_KEY);
  setRewardSourceMaintenance(true);
  try {
    assert.throws(() => book.acknowledgeNotifications(OWNER, [item(source)]), /restoring saved progress/);
    assert.throws(() => book.dismissNotification(OWNER, item(source)), /restoring saved progress/);
    assert.deepEqual(book.notificationPreferences(OWNER), freshStudioNotificationPreferences());
  } finally { setRewardSourceMaintenance(false); }
  assert.equal(memory.getItem(STUDIO_KEY), original);
});

test('Notebook rejects cross-profile, missing-project and unsafe acknowledgements before saving', () => {
  const mine = ready('mine'), sibling = ready('sibling', { owner: OTHER });
  const { book, memory } = restored([mine, sibling]), original = memory.getItem(STUDIO_KEY);
  assert.throws(() => book.acknowledgeNotifications(OWNER, [item(sibling)]), /own profile/);
  assert.throws(() => book.acknowledgeNotifications(OWNER, [{ ...item(sibling), ownerId: OWNER }]), /own profile/);
  assert.throws(() => book.dismissNotification(OWNER, { ...item(mine), sessionId: 'missing' }), /own profile/);
  assert.throws(() => book.dismissNotification('__proto__', item(mine)), /Invalid player/);
  assert.throws(() => book.notificationPreferences('constructor'), /Invalid player/);
  const bad = { ...item(mine), token: 'not-an-opaque-token' } as StudioNotificationRef;
  assert.throws(() => book.acknowledgeNotifications(OWNER, [bad]), /own profile/);
  assert.equal(memory.getItem(STUDIO_KEY), original);
});

test('Notebook validates preference owners, session ownership and total bounds on backup input', () => {
  const mine = ready('mine'), sibling = ready('sibling', { owner: OTHER });
  const base = { version: 1, sessions: [mine, sibling], active: {} };
  const prefs = acknowledgeStudioNotificationItems(freshStudioNotificationPreferences(), OWNER, [item(mine)]);
  assert.throws(() => validateNotebook({ ...base, notifications: { [OTHER]: prefs } }), /notification project/);
  assert.throws(() => validateNotebook({ ...base, notifications: { [OWNER]: { acknowledgements: [{ ...prefs.acknowledgements[0], sessionId: 'missing' }] } } }), /notification project/);
  for (const invalid of [null, [], 'bad']) assert.throws(() => validateNotebook({ ...base, notifications: invalid }), /notification preferences/);
  for (const owner of ['__proto__', 'constructor', 'prototype', 'with space'])
    assert.throws(() => validateNotebook({ ...base, notifications: Object.fromEntries([[owner, prefs]]) }), /notification player/);
  assert.throws(() => validateNotebook({ ...base, notifications: Object.fromEntries(Array.from({ length: 81 }, (_, index) => ['owner-' + index, freshStudioNotificationPreferences()])) }), /notification preferences/);
});

test('valid inherited-property names remain isolated owner keys', () => {
  const mine = ready('mine'), named = ready('named', { owner: 'toString' });
  const { book } = restored([mine, named]); book.dismissNotification(OWNER, item(mine));
  assert.deepEqual(book.notificationPreferences('toString'), freshStudioNotificationPreferences());
  book.acknowledgeNotifications('toString', [item(named)]);
  assert.equal(book.notificationPreferences('toString').acknowledgements[0].sessionId, named.id);
  assert.equal(book.notificationPreferences(OWNER).acknowledgements[0].dismissed, true);
});

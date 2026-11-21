import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RevisionStore, WORKSPACE_KEY, type Revision, type StoragePort } from '../src/factory/workspace';
import { StudioGames } from '../src/studio/adapter';
import { defaults } from '../src/runtime/manifests';
import type { PlayOutcome } from '../src/runtime/types';

class Memory implements StoragePort {
  values = new Map<string, string>();
  failWrites = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.failWrites) throw Error('QuotaExceededError');
    this.values.set(key, value);
  }
}
const owner = 'player-one';
function setup() {
  const storage = new Memory();
  const profile = { id: owner, constructionStates: {} as Record<string, unknown> };
  const fg = { store: { current: () => profile, save: () => true } };
  return { storage, profile, fg, legacy: new RevisionStore(storage), games: new StudioGames(storage as unknown as Storage, fg) };
}
const outcome = (revision: Revision): PlayOutcome => ({ game: 'buckets', won: true, level: 1, title: 'Stayed dry', description: 'One safe choice', durationMs: 900, at: '2026-11-21T00:00:00Z', config: revision.config });

test('a long-lived Live Remix store keeps a version without erasing later Studio games or another owner', () => {
  const { storage, legacy, games } = setup();
  const original = legacy.create(owner, 'buckets', 'Original remix');
  const newer = games.create(owner, 'gum', 'New Studio game', defaults('gum'));
  const otherChild = games.create('player-two', 'robot', 'Their game', defaults('robot'));
  legacy.keep(original.id, owner);

  const saved = new RevisionStore(storage).snapshot();
  assert.deepEqual(saved.projects.map(p => p.id), [original.id, newer.id, otherChild.id]);
  assert.equal(saved.projects[0].keptId, original.headId);
  assert.equal(saved.revisions.length, 3);
  assert.deepEqual(legacy.snapshot(), saved);
  assert.deepEqual(JSON.parse(legacy.export()), saved);
  assert.deepEqual(legacy.list(owner).map(p => p.id), [original.id, newer.id]);
  assert.equal(legacy.project(newer.id, owner).headId, newer.headId);
  assert.equal(legacy.revision(newer.id, owner).id, newer.headId);
  assert.equal(legacy.history(newer.id, owner)[0].id, newer.headId);
  assert.throws(() => legacy.project(otherChild.id, owner), /own profile/);
});

test('interleaved Studio and legacy commits preserve the current parent, kept version and immutable history', () => {
  const { storage, legacy, games } = setup();
  const project = legacy.create(owner, 'hill', 'My drawing ride', defaults('hill'), undefined, 'saved-rig-one');
  const root = legacy.revision(project.id, owner);
  const studioRevision = games.keep(owner, project.id, root.id, { ...root.config, wheelSize: .57 }, 'Bigger wheels', '', 'preview');
  const legacyRevision = legacy.commit(project.id, owner, { ...studioRevision.config, wheelSize: .62 }, 'Another wheel test');
  const saved = new RevisionStore(storage);
  assert.equal(legacyRevision.parentId, studioRevision.id);
  assert.equal(legacyRevision.drawingRigId, 'saved-rig-one');
  assert.equal(saved.project(project.id, owner).keptId, studioRevision.id);
  assert.deepEqual(saved.history(project.id, owner).map(r => r.id), [root.id, studioRevision.id, legacyRevision.id]);
  assert.deepEqual(saved.revision(project.id, owner, root.id), root);
  assert.deepEqual(saved.revision(project.id, owner, studioRevision.id), studioRevision);
  assert.equal(games.revision(project.id, owner).id, legacyRevision.id);
});

test('undo, redo, keep and fork resolve the latest head across long-lived writers', () => {
  const { legacy, games } = setup();
  const project = legacy.create(owner, 'buckets', 'Shared adapters');
  const root = legacy.revision(project.id, owner);
  const first = games.keep(owner, project.id, root.id, { ...root.config, bucketCount: 4 }, 'Four', '', 'preview');
  legacy.keep(project.id, owner);
  assert.equal(games.project(project.id, owner).keptId, first.id);
  const second = games.keep(owner, project.id, first.id, { ...first.config, bucketCount: 5 }, 'Five', '', 'preview');
  legacy.undo(project.id, owner);
  assert.equal(games.revision(project.id, owner).id, first.id);
  games.checkout(owner, project.id, root.id);
  legacy.redo(project.id, owner);
  assert.equal(games.revision(project.id, owner).id, first.id);
  games.checkout(owner, project.id, second.id);
  const fork = legacy.fork(project.id, owner, 'Copy current version');
  assert.equal(games.revision(fork.id, owner).sourceRevisionId, second.id);
  assert.deepEqual(games.revision(fork.id, owner).config, second.config);
  assert.deepEqual(games.history(project.id, owner).map(r => r.id), [root.id, first.id, second.id]);
  legacy.checkout(project.id, owner, root.id);
  assert.equal(games.revision(project.id, owner).id, root.id);
  assert.equal(games.project(project.id, owner).keptId, second.id);
});

test('play evidence and reflection accept another writer’s saved revision without losing its work', () => {
  const { storage, legacy, games } = setup();
  const project = legacy.create(owner, 'buckets', 'Played game');
  const latest = games.keep(owner, project.id, project.headId, { ...defaults('buckets'), bucketCount: 4 }, 'Four', '', 'preview');
  const play = new RevisionStore(storage).record(project.id, owner, latest.id, outcome(latest));
  legacy.reflect(play.id, owner, 'Four was harder');
  legacy.record(project.id, owner, latest.id, { ...outcome(latest), won: false });
  const saved = games.export();
  assert.equal(saved.plays.length, 2);
  assert.equal(saved.plays[0].reflection, 'Four was harder');
  assert.equal(saved.projects[0].headId, latest.id);
  assert.equal(saved.revisions.length, 2);
});

test('every owned mutation rechecks ownership after another store restores the workspace', async t => {
  for (const operation of ['commit', 'keep', 'checkout', 'undo', 'redo', 'fork', 'record', 'reflect'] as const) {
    await t.test(operation, () => {
      const { storage, legacy } = setup();
      const project = legacy.create(owner, 'buckets', 'Restored owner');
      const revision = legacy.commit(project.id, owner, { ...defaults('buckets'), bucketCount: 4 }, 'Four');
      const play = legacy.record(project.id, owner, revision.id, outcome(revision));
      const restored = legacy.snapshot();
      restored.projects[0].owner = 'player-two';
      new RevisionStore(storage).restore(JSON.stringify(restored));
      const before = storage.getItem(WORKSPACE_KEY);
      const actions = {
        commit: () => legacy.commit(project.id, owner, defaults('buckets'), 'Old owner'),
        keep: () => legacy.keep(project.id, owner),
        checkout: () => legacy.checkout(project.id, owner, project.headId),
        undo: () => legacy.undo(project.id, owner),
        redo: () => legacy.redo(project.id, owner),
        fork: () => legacy.fork(project.id, owner, 'Old owner'),
        record: () => legacy.record(project.id, owner, revision.id, outcome(revision)),
        reflect: () => legacy.reflect(play.id, owner, 'Old owner'),
      };
      assert.throws(actions[operation], /own profile/);
      assert.equal(storage.getItem(WORKSPACE_KEY), before);
    });
  }
});

test('explicit source heads are checked inside commit, keep, checkout and fork transactions', () => {
  const { storage, legacy, games } = setup();
  const project = legacy.create(owner, 'buckets', 'Preview base');
  const current = games.keep(owner, project.id, project.headId, { ...defaults('buckets'), bucketCount: 4 }, 'Four', '', 'preview');
  const before = storage.getItem(WORKSPACE_KEY);
  for (const change of [
    () => legacy.commit(project.id, owner, defaults('buckets'), 'Old preview', '', undefined, project.headId),
    () => legacy.keep(project.id, owner, project.headId),
    () => legacy.checkout(project.id, owner, project.headId, project.headId),
    () => legacy.fork(project.id, owner, 'Old source', undefined, project.headId),
  ]) {
    assert.throws(change, /changed elsewhere/);
    assert.equal(storage.getItem(WORKSPACE_KEY), before);
  }
  assert.equal(legacy.revision(project.id, owner).id, current.id);
});

test('Studio refuses a preview if the host changes its base after the adapter starts', () => {
  const { storage, profile, fg, legacy, games } = setup();
  const project = legacy.create(owner, 'buckets', 'Changed while keeping');
  let intervening: Revision | undefined;
  fg.store.current = () => {
    intervening ??= legacy.commit(project.id, owner, { ...defaults('buckets'), bucketCount: 5 }, 'Intervening edit');
    return profile;
  };
  assert.throws(() => games.keep(owner, project.id, project.headId, { ...defaults('buckets'), bucketCount: 4 }, 'Stale preview', '', 'preview'), /changed elsewhere/);
  const saved = new RevisionStore(storage);
  assert.equal(saved.revision(project.id, owner).id, intervening!.id);
  assert.equal(saved.history(project.id, owner).length, 2);
  assert.equal(saved.project(project.id, owner).keptId, undefined);
});

for (const saveSucceeded of [false, true]) {
  test(`Studio preserves an intervening revision when construction saving ${saveSucceeded ? 'succeeds before pinning' : 'fails before rollback'}`, () => {
    const { storage, profile, fg, legacy, games } = setup();
    const project = legacy.create(owner, 'buckets', 'Do not roll back another writer');
    profile.constructionStates.preview = { level: 1, parts: ['synthetic part'] };
    let intervening: Revision | undefined;
    fg.store.save = () => {
      intervening = legacy.commit(project.id, owner, { ...defaults('buckets'), bucketCount: 5 }, 'Intervening edit');
      legacy.keep(project.id, owner);
      return saveSucceeded;
    };
    assert.throws(() => games.keep(owner, project.id, project.headId, { ...defaults('buckets'), bucketCount: 4 }, 'Preview', '', 'preview'), saveSucceeded ? /changed elsewhere/ : /preserve the construction/);
    const saved = new RevisionStore(storage);
    assert.equal(saved.revision(project.id, owner).id, intervening!.id);
    assert.equal(saved.project(project.id, owner).keptId, intervening!.id);
    assert.equal(saved.history(project.id, owner).length, 3);
  });
}

test('failed Studio construction save restores only its own head and retains another new game', () => {
  const { storage, profile, fg, legacy, games } = setup();
  const project = legacy.create(owner, 'buckets', 'Failed preview');
  profile.constructionStates.preview = { level: 1, parts: ['synthetic part'] };
  let newGameId = '';
  fg.store.save = () => {
    newGameId = legacy.create(owner, 'robot', 'Created during save').id;
    return false;
  };
  assert.throws(() => games.keep(owner, project.id, project.headId, { ...defaults('buckets'), bucketCount: 4 }, 'Preview', '', 'preview'), /preserve the construction/);
  const saved = new RevisionStore(storage);
  assert.equal(saved.revision(project.id, owner).id, project.headId);
  assert.equal(saved.project(newGameId, owner).name, 'Created during save');
  assert.equal(saved.history(project.id, owner).length, 2, 'the rejected experiment remains an immutable historical revision');
});

test('changed corrupt data blocks stale reads and ordinary edits, but an explicit valid restore can recover it', () => {
  const { storage, legacy } = setup();
  const project = legacy.create(owner, 'buckets', 'Recovery source');
  const backup = legacy.export();
  for (const corrupt of ['{bad', '{"version":99}']) {
    storage.setItem(WORKSPACE_KEY, corrupt);
    for (const read of [() => legacy.snapshot(), () => legacy.export(), () => legacy.list(owner), () => legacy.project(project.id, owner), () => legacy.revision(project.id, owner), () => legacy.history(project.id, owner)]) assert.throws(read);
    assert.throws(() => legacy.keep(project.id, owner));
    assert.throws(() => legacy.create(owner, 'robot', 'Must not erase corruption'));
    assert.throws(() => legacy.restore('{bad'));
    assert.equal(storage.getItem(WORKSPACE_KEY), corrupt);
    legacy.restore(backup);
    assert.equal(legacy.project(project.id, owner).headId, project.headId);
  }
});

test('source removal and deliberate backup replacement never resurrect cached projects', () => {
  const { storage, legacy, games } = setup();
  const original = legacy.create(owner, 'buckets', 'Original');
  const backup = legacy.export();
  const newer = games.create(owner, 'robot', 'Intentionally replaced', defaults('robot'));
  legacy.restore(backup);
  assert.deepEqual(games.list(owner).map(p => p.id), [original.id]);
  assert.throws(() => games.project(newer.id, owner), /own profile/);
  storage.values.delete(WORKSPACE_KEY);
  assert.deepEqual(legacy.snapshot(), { version: 2, projects: [], revisions: [], plays: [] });
  assert.throws(() => legacy.keep(original.id, owner), /own profile/);
  assert.equal(storage.getItem(WORKSPACE_KEY), null);
});

test('quota failure keeps the newest durable workspace visible to an older store', () => {
  const { storage, legacy, games } = setup();
  const original = legacy.create(owner, 'buckets', 'Original');
  const newer = games.create(owner, 'robot', 'New Studio game', defaults('robot'));
  const before = storage.getItem(WORKSPACE_KEY);
  storage.failWrites = true;
  assert.throws(() => legacy.keep(original.id, owner), /last working version is safe/);
  assert.equal(storage.getItem(WORKSPACE_KEY), before);
  assert.deepEqual(legacy.list(owner).map(p => p.id), [original.id, newer.id]);
  assert.equal(legacy.project(original.id, owner).keptId, undefined);
});

test('v1 migration keeps stable IDs until saved and then observes another writer’s durable migration', () => {
  const storage = new Memory();
  storage.setItem(WORKSPACE_KEY, JSON.stringify({ version: 1, games: [{ id: 'old-game', owner, game: 'buckets', name: 'Old game', config: defaults('buckets') }] }));
  const first = new RevisionStore(storage), second = new RevisionStore(storage);
  const firstRoot = first.revision('old-game', owner), secondRoot = second.revision('old-game', owner);
  assert.deepEqual(first.revision('old-game', owner), firstRoot);
  assert.equal(first.snapshot().projects[0].headId, firstRoot.id);
  const committed = second.commit('old-game', owner, { ...defaults('buckets'), bucketCount: 4 }, 'Four');
  first.keep('old-game', owner);
  assert.equal(first.project('old-game', owner).keptId, committed.id);
  assert.deepEqual(first.history('old-game', owner).map(r => r.id), [secondRoot.id, committed.id]);
  assert.equal(JSON.parse(storage.getItem(WORKSPACE_KEY)!).version, 2);
});

test('cached state cannot be mutated through supplied play evidence or returned snapshots', () => {
  const { storage, legacy } = setup();
  const project = legacy.create(owner, 'buckets', 'Immutable evidence');
  const revision = legacy.revision(project.id, owner), evidence = outcome(revision);
  legacy.record(project.id, owner, revision.id, evidence);
  const before = storage.getItem(WORKSPACE_KEY);
  evidence.config.bucketCount = 6;
  legacy.snapshot().projects[0].name = 'Unstored edit';
  assert.equal(JSON.stringify(legacy.snapshot()), before);
  legacy.keep(project.id, owner);
  assert.equal(legacy.snapshot().plays[0].outcome.config.bucketCount, 3);
});

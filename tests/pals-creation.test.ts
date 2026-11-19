import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { addPalToProject, createPalPlayground, CREATION_PAL_IDS } from '../src/pals/creation';
import { palDefinition } from '../src/pals/catalog';
import { creationAsset, createStarterProject, validateEditableProject, validateGeneratedCreationManifest } from '../src/creation/projects';
import { SceneEngine } from '../src/creation/engine';
import { CreationStore } from '../src/creation/storage';

class MemoryStorage implements Storage {
  data = new Map<string, string>(); fail = false;
  get length() { return this.data.size; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.fail) throw Error('quota'); this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

test('all Pal scene assets resolve to existing bundled art and have stable saved IDs', () => {
  for (const id of CREATION_PAL_IDS) {
    const asset = creationAsset('pal-' + id)!;
    const pal = palDefinition(id);
    assert.equal(asset.palId, id);
    assert.equal(asset.id, pal.assetId);
    assert.equal(asset.label, pal.name);
    assert.equal(asset.url, './' + pal.artPath);
    assert.equal(asset.kind, 'image');
    assert.match(asset.url!, /^\.\/jems-art\/gem_(blue|mint|coral)\.webp$/);
    assert.ok(existsSync(resolve('public', asset.url!)));
    const scene = createPalPlayground(id);
    assert.equal(scene.actors[0].assetId, asset.id);
    assert.deepEqual(validateEditableProject(scene), scene);
  }
});

test('each playground visibly jumps, dances and tells a joke on tap; it does not infer mastery', () => {
  for (const id of CREATION_PAL_IDS) {
    const scene = createPalPlayground(id), engine = new SceneEngine(scene);
    assert.equal(scene.provenance?.createdBy, 'starter');
    assert.ok(scene.programs.flatMap(program => program.actions).every(action => action.origin === 'starter'));
    assert.deepEqual(scene.variables, {});
    engine.start(); engine.advance(1800);
    const actorId = scene.actors[0].id, initialX = scene.actors[0].x;
    assert.equal(engine.snapshot().status, 'completed');
    engine.tap(actorId);
    assert.equal(engine.advance(300).actors[0].jumpOffset, -65);
    assert.equal(engine.advance(300).actors[0].jumpOffset, 0);
    assert.notEqual(engine.advance(10).actors[0].rotation, 0);
    const speaking = engine.advance(790);
    assert.match(speaking.actors[0].speech!, /dance|Wobble/);
    assert.equal(speaking.actors[0].x, initialX);
    const done = engine.advance(1800);
    assert.equal(done.status, 'completed');
    assert.equal(done.actors[0].speech, null);
    engine.tap(actorId);
    assert.equal(engine.advance(300).actors[0].jumpOffset, -65, 'The toy remains playable after its first response.');
  }
});

test('adding a Pal preserves the existing scene, source pins and programs with independent identities', () => {
  const original = createStarterProject('dragon');
  original.provenance = { createdBy: 'child', sourceKind: 'curated', sourceProjectId: 'source-game', sourceRevisionId: 'source-v2' };
  const before = structuredClone(original), added = addPalToProject(original, 'kip');
  assert.deepEqual(original, before, 'The source is not mutated.');
  assert.equal(added.scene.id, original.id);
  assert.deepEqual(added.scene.provenance, original.provenance);
  assert.deepEqual(added.scene.actors.slice(0, original.actors.length), original.actors);
  assert.deepEqual(added.scene.programs.slice(0, original.programs.length), original.programs);
  assert.equal(added.scene.programs.find(p => p.id === added.programId)!.actorId, added.actorId);
  const another = addPalToProject(added.scene, 'kip');
  assert.notEqual(another.actorId, added.actorId);
  assert.notEqual(another.programId, added.programId);
  const engine = new SceneEngine(another.scene); engine.start(); engine.advance(2000); engine.tap(added.actorId);
  const playing = engine.advance(300);
  assert.equal(playing.actors.find(a => a.id === added.actorId)!.jumpOffset, -65);
  assert.equal(playing.actors.find(a => a.id === another.actorId)!.jumpOffset, 0);
});

test('Pal insertions remain bounded, validate before mutation, and fit smaller valid stages', () => {
  const scene = createStarterProject('blank');
  scene.width = 200; scene.height = 160; scene.actors[0].x = 100; scene.actors[0].y = 80;
  const small = addPalToProject(scene, 'glim');
  assert.equal(small.scene.actors[1].x, 144);
  assert.equal(small.scene.actors[1].y, 102);
  assert.ok(small.scene.actors[1].size! <= 72);
  const full = createStarterProject('blank');
  while (full.actors.length < 16) full.actors.push({ ...full.actors[0], id: 'actor-' + full.actors.length });
  const before = structuredClone(full);
  assert.throws(() => addPalToProject(full, 'glim'), /cast is full/);
  assert.deepEqual(full, before);
  assert.throws(() => createPalPlayground('invalid' as any), /available Pal/);
});

test('Pal scenes preserve explicit Keep, drafts, owner isolation and failed-write recovery', () => {
  const storage = new MemoryStorage(), store = new CreationStore(storage);
  const scene = createPalPlayground('riff'), project = store.create('one', scene);
  assert.equal(project.keptId, null);
  store.keep(project.id, 'one', project.headId);
  const draft = addPalToProject(scene, 'glim').scene;
  store.autosave(project.id, 'one', draft, project.headId);
  const reloaded = new CreationStore(storage).load(project.id, 'one');
  assert.equal(reloaded.scene.actors.length, 1);
  assert.equal(reloaded.draft!.scene.actors.length, 2);
  assert.equal(reloaded.project.keptId, project.headId);
  assert.throws(() => store.load(project.id, 'two'), /own profile/);
  const before = new Map(storage.data); storage.fail = true;
  assert.throws(() => store.save(project.id, 'one', draft, project.headId), /Could not save/);
  assert.deepEqual(storage.data, before);
});

test('an imported Pal scene is reusable creative content and is attributed as assisted', () => {
  const original = createPalPlayground('glim'), imported = validateGeneratedCreationManifest(original);
  assert.deepEqual(imported.provenance, { createdBy: 'assisted' });
  assert.ok(imported.programs.flatMap(program => program.actions).every(action => action.origin === 'assisted'));
  assert.equal(imported.actors[0].assetId, 'pal-glim');
  assert.equal(Object.hasOwn(imported, 'ownedPals'), false);
  assert.equal(Object.hasOwn(imported, 'lifetimeGems'), false);
});

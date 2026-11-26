import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { addPalToProject, createPalPlayground, CREATION_PAL_IDS } from '../src/pals/creation';
import { palArtworkPath, palDefinition, palSceneAssetId } from '../src/pals/catalog';
import { validateSavedCreationManifest, CREATION_ASSETS, creationAsset, createStarterProject, validateEditableProject, validateGeneratedCreationManifest, privateArtId } from '../src/creation/projects';
import { SceneEngine } from '../src/creation/engine';
import { CreationStore } from '../src/creation/storage';
import { CreationStage, CREATION_ART_LOAD_TIMEOUT_MS } from '../src/creation/stage';

class MemoryStorage implements Storage {
  data = new Map<string, string>(); fail = false;
  get length() { return this.data.size; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.fail) throw Error('quota'); this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

test('all new Pal scenes pin the approved character, form and artwork version', () => {
  const ids = new Set<string>();
  for (const id of CREATION_PAL_IDS) {
    const pal = palDefinition(id);
    for (const form of ['base', 'mature'] as const) {
      const asset = creationAsset(palSceneAssetId(id, form))!;
      assert.ok(asset, `${pal.name} ${form} has a trusted scene asset`);
      assert.equal(asset.palId, id);
      assert.equal(asset.palForm, form);
      assert.equal(asset.label, pal.name);
      assert.equal(asset.url, './' + palArtworkPath(id, form));
      assert.equal(asset.kind, 'image');
      assert.doesNotMatch(asset.url!, /\/jems-art\/gem_/);
      assert.ok(existsSync(resolve('public', asset.url!)));
      assert.ok(!ids.has(asset.id), 'Every character/form has a separate pinned reference'); ids.add(asset.id);
      const scene = createPalPlayground(id, form);
      assert.equal(scene.actors[0].assetId, asset.id);
      assert.equal(scene.actors[0].name, pal.name);
      assert.deepEqual(validateEditableProject(scene), scene);
    }
    assert.equal(createPalPlayground(id).actors[0].assetId, pal.assetId, 'The default is this character’s approved Base form');
  }
  assert.equal(new Set(CREATION_ASSETS.map(asset => asset.id)).size, CREATION_ASSETS.length);
});

test('legacy token scenes keep their exact historical assets through edit, Keep, import and reload', () => {
  const legacy = [
    { id: 'pal-glim', label: 'Glim', kind: 'image', url: './jems-art/gem_blue.webp' },
    { id: 'pal-kip', label: 'Kip', kind: 'image', url: './jems-art/gem_mint.webp', palId: 'kip' },
    { id: 'pal-riff', label: 'Riff', kind: 'image', url: './jems-art/gem_coral.webp', palId: 'riff' },
  ];
  for (const token of legacy) {
    assert.deepEqual(creationAsset(token.id), token);
    const storage = new MemoryStorage(), store = new CreationStore(storage);
    const original = createStarterProject('blank');
    original.actors[0] = { ...original.actors[0], name: token.label, assetId: token.id };
    const saved = store.create('one', original); store.keep(saved.id, 'one', saved.headId);
    const combined = addPalToProject(original, 'navi', 'mature').scene;
    assert.deepEqual(combined.actors[0], original.actors[0]);
    assert.equal(combined.actors.at(-1)!.assetId, palSceneAssetId('navi', 'mature'));
    const updated = store.save(saved.id, 'one', combined, saved.headId); store.keep(saved.id, 'one', updated.id);
    const reopened = new CreationStore(storage).load(saved.id, 'one').scene;
    assert.deepEqual(reopened, combined);
    assert.equal(validateSavedCreationManifest(reopened).actors[0].assetId, token.id);
  }
});

/** Isolate portrait failures from backdrop loads in the legacy-scene fixtures. */
function portraitStageScene(...args:Parameters<typeof createPalPlayground>) {
  const scene = createPalPlayground(...args); delete scene.world; return scene;
}

test('approved scene artwork stays identifiable during loading, retries after reopening and keeps its aspect ratio', t => {
  const originals = new Map(['Image', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as any)[key];
    }
  });
  const images: TestImage[] = [], labels: string[] = [], draws: unknown[][] = [], errors: string[] = [];
  class TestImage {
    complete = false; naturalWidth = 0; naturalHeight = 0; src = '';
    onload: (() => void) | null = null; onerror: (() => void) | null = null;
    constructor() { images.push(this); }
  }
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: TestImage });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { baseURI: 'https://example.test/jems/', createElement() {
    const scratch={width:0,height:0,getContext:()=>({drawImage(){},getImageData(){return {data:new Uint8ClampedArray(scratch.width*scratch.height*4)};}})};return scratch;
  } } });
  const context = new Proxy({
    createLinearGradient: () => ({ addColorStop() {} }), measureText: (text: string) => ({ width: text.length * 8 }),
    fillText: (text: string) => labels.push(text), drawImage: (...args: unknown[]) => draws.push(args),
  } as Record<string, unknown>, { get: (target, key) => target[key as string] ?? (() => {}), set: (target, key, value) => { target[key as string] = value; return true; } });
  const canvas = { width: 800, height: 450, getContext: () => context } as unknown as HTMLCanvasElement;
  const stage = new CreationStage(canvas, undefined, message => errors.push(message));
  const scene = portraitStageScene('navi', 'mature'), snapshot = new SceneEngine(scene).snapshot();
  stage.render(scene, snapshot);
  assert.equal(images.length, 1);
  assert.equal(images[0].src, new URL(palArtworkPath('navi', 'mature'), 'https://example.test/jems/').href);
  assert.ok(labels.includes('Loading picture…'));
  images[0].complete = true; images[0].onerror!();
  assert.ok(labels.includes('Picture unavailable'));
  assert.match(errors[0], /Navi.*Reopen this scene/);
  assert.equal(draws.length, 0, 'A failed portrait cannot substitute a different approved image');
  stage.clear(); stage.render(scene, snapshot);
  assert.equal(images.length, 2, 'Reopening performs a new load of the exact saved asset');
  const recovered = images[1]; recovered.complete = true; recovered.naturalWidth = 400; recovered.naturalHeight = 600; recovered.onload!();
  const draw = draws.at(-1)!;
  assert.equal(draw[0], recovered);
  assert.ok(Math.abs((draw[3] as number) / (draw[4] as number) - 400 / 600) < 1e-12);
  assert.equal(draw[4], scene.actors[0].size);
  assert.equal(scene.actors[0].assetId, palSceneAssetId('navi', 'mature'));
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
    const expectedLine = scene.programs.find(program => program.trigger.type === 'tap')!.actions.find(action => action.type === 'say')!;
    assert.equal(speaking.actors[0].speech, expectedLine.type === 'say' ? expectedLine.text : '');
    assert.equal(speaking.actors[0].x, initialX);
    const done = engine.advance(1800);
    assert.equal(done.status, 'completed');
    assert.equal(done.actors[0].speech, null);
    engine.tap(actorId);
    assert.equal(engine.advance(300).actors[0].jumpOffset, -65, 'The toy remains playable after its first response.');
  }
});

test('scene Pal composites prepare once per active asset and stale loads cannot recreate a cleared scene', t => {
  const originals = new Map(['Image', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as any)[key];
    }
  });
  const images: TestImage[] = [], draws: unknown[] = []; let preparations = 0;
  class TestImage {
    complete = false; naturalWidth = 0; naturalHeight = 0; src = '';
    onload: (() => void) | null = null; onerror: (() => void) | null = null;
    constructor() { images.push(this); }
    ready() { this.complete = true; this.naturalWidth = 100; this.naturalHeight = 80; this.onload?.(); }
  }
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: TestImage });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    baseURI: 'https://example.test/jems/', createElement() {
      preparations++;
      const scratch = { width: 0, height: 0, getContext: () => ({
        drawImage() {}, putImageData() {}, getImageData() {
          const data = new Uint8ClampedArray(scratch.width * scratch.height * 4);
          for (let index = 0; index < data.length; index += 4) data.set([253, 240, 227, 255], index);
          data.set([20, 110, 230, 255], Math.floor(scratch.width * scratch.height / 2) * 4);
          return { data };
        },
      }) };
      return scratch;
    },
  } });
  const context = new Proxy({
    createLinearGradient: () => ({ addColorStop() {} }), measureText: () => ({ width: 80 }),
    drawImage: (image: unknown) => draws.push(image),
  } as Record<string, unknown>, { get: (target, key) => target[key as string] ?? (() => {}), set: (target, key, value) => { target[key as string] = value; return true; } });
  const canvas = { width: 800, height: 450, getContext: () => context } as unknown as HTMLCanvasElement;
  const stage = new CreationStage(canvas), scene = portraitStageScene('kip'), snapshot = new SceneEngine(scene).snapshot();
  stage.render(scene, snapshot); images[0].ready();
  const prepared = draws.at(-1);
  assert.notEqual(prepared, images[0], 'The scene uses the transient alpha composite.');
  stage.render(scene, snapshot); stage.render(scene, snapshot);
  assert.equal(preparations, 1, 'Ordinary animation frames reuse the prepared image.');
  assert.equal(draws.at(-1), prepared);
  stage.clear(); const drawCount = draws.length; images[0].ready();
  assert.equal(draws.length, drawCount, 'A retired onload callback cannot repaint.');
  assert.equal(preparations, 1);
  stage.render(scene, snapshot); images[1].ready();
  assert.equal(preparations, 2, 'Reopening owns a fresh bounded cache.');
  const ordinary = createStarterProject('dragon');
  stage.render(ordinary, new SceneEngine(ordinary).snapshot());
  const previous = preparations;
  for (const image of images.slice(2)) image.ready();
  assert.equal(preparations, previous, 'Non-Pal scene images bypass paper compositing.');
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
  const small = addPalToProject(scene, 'navi');
  assert.equal(small.scene.actors[1].x, 144);
  assert.equal(small.scene.actors[1].y, 102);
  assert.ok(small.scene.actors[1].size! <= 72);
  const full = createStarterProject('blank');
  while (full.actors.length < 16) full.actors.push({ ...full.actors[0], id: 'actor-' + full.actors.length });
  const before = structuredClone(full);
  assert.throws(() => addPalToProject(full, 'navi'), /cast is full/);
  assert.deepEqual(full, before);
  assert.throws(() => createPalPlayground('invalid' as any), /available Pal/);
  assert.throws(() => createPalPlayground('navi', 'future' as any), /available Pal form/);
  assert.throws(() => addPalToProject(scene, 'navi', 'future' as any), /available Pal form/);
});

test('Pal scenes preserve explicit Keep, drafts, owner isolation and failed-write recovery', () => {
  const storage = new MemoryStorage(), store = new CreationStore(storage);
  const scene = createPalPlayground('riff'), project = store.create('one', scene);
  assert.equal(project.keptId, null);
  store.keep(project.id, 'one', project.headId);
  const draft = addPalToProject(scene, 'navi').scene;
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

test('imported approved Pal scenes in either form remain creative content with assisted attribution', () => {
  for (const id of CREATION_PAL_IDS) for (const form of ['base', 'mature'] as const) {
    const original = createPalPlayground(id, form), imported = validateGeneratedCreationManifest(original);
    assert.deepEqual(imported.provenance, { createdBy: 'assisted' });
    assert.ok(imported.programs.flatMap(program => program.actions).every(action => action.origin === 'assisted'));
    assert.equal(imported.actors[0].assetId, palSceneAssetId(id, form));
    assert.equal(Object.hasOwn(imported, 'ownedPals'), false);
    assert.equal(Object.hasOwn(imported, 'lifetimeGems'), false);
  }
});

test('adding a Pal keeps private original/cutout hashes, exact source pins and prior saved revisions intact', () => {
  for (const kind of ['image', 'rig'] as const) {
    const storage = new MemoryStorage(), store = new CreationStore(storage);
    const original = createStarterProject('blank');
    original.actors[0].assetId = privateArtId({ kind, id: `private-${kind}`, sha256: 'b'.repeat(64) });
    original.provenance = { createdBy: 'child', sourceKind: 'curated', sourceProjectId: 'kept-game', sourceRevisionId: 'exact-revision' };
    const project = store.create('one', original);
    store.keep(project.id, 'one', project.headId);
    const combined = addPalToProject(original, 'navi').scene;
    assert.deepEqual(combined.actors.slice(0, original.actors.length), original.actors);
    assert.deepEqual(combined.provenance, original.provenance);
    store.autosave(project.id, 'one', combined, project.headId);
    const restored = new CreationStore(storage).load(project.id, 'one');
    assert.deepEqual(restored.scene, original);
    assert.deepEqual(restored.draft!.scene, combined);
    assert.equal(restored.project.keptId, project.headId);
    assert.throws(() => validateGeneratedCreationManifest(combined), /artwork/, 'adding a Pal cannot make private artwork provider eligible');
    assert.throws(() => store.load(project.id, 'two'), /own profile/);
    assert.deepEqual(store.pendingRewards('one'), []);
  }
});

function stageImageFixture(t: TestContext) {
  const originals = new Map(['Image', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const images: TestImage[] = [], draws: unknown[] = [], errors: string[] = [];
  class TestImage {
    naturalWidth = 0; naturalHeight = 0; src = ''; removed = 0;
    onload: (() => void) | null = null; onerror: (() => void) | null = null;
    private resolveDecode!: () => void;
    private rejectDecode!: (error: Error) => void;
    private decoded = new Promise<void>((resolve, reject) => { this.resolveDecode = resolve; this.rejectDecode = reject; });
    constructor() { images.push(this); }
    load() { this.naturalWidth = 100; this.naturalHeight = 80; this.onload?.(); }
    decode() { return this.decoded; }
    finishDecode() { this.resolveDecode(); }
    failDecode() { this.rejectDecode(Error('invalid bitmap')); }
    removeAttribute(name: string) { assert.equal(name, 'src'); this.removed++; }
  }
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: TestImage });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { baseURI: 'https://example.test/jems/', createElement() {
    const scratch={width:0,height:0,getContext:()=>({drawImage(){},getImageData(){return {data:new Uint8ClampedArray(scratch.width*scratch.height*4)};}})};return scratch;
  } } });
  const context = new Proxy({
    createLinearGradient: () => ({ addColorStop() {} }), measureText: () => ({ width: 80 }),
    drawImage: (image: unknown) => draws.push(image),
  } as Record<string, unknown>, { get: (target, key) => target[key as string] ?? (() => {}), set: (target, key, value) => { target[key as string] = value; return true; } });
  const canvas = { width: 800, height: 450, getContext: () => context } as unknown as HTMLCanvasElement;
  const stage = new CreationStage(canvas, undefined, message => errors.push(message));
  t.after(() => {
    stage.clear();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as any)[key];
    }
  });
  return { stage, images, draws, errors };
}

test('playback preparation shares rendered loads and waits for hidden actors and decoded artwork', async t => {
  const { stage, images, draws } = stageImageFixture(t);
  const scene = addPalToProject(createPalPlayground('navi'), 'kip').scene;
  scene.actors[1].visible = false;
  scene.actors.push({ ...scene.actors[0], id: 'same-picture-again' });
  stage.render(scene, new SceneEngine(scene).snapshot());
  assert.equal(images.length, 2, 'The backdrop and repeated visible actor each load once.');
  let ready = false;
  const preparing = stage.prepare(scene).then(() => { ready = true; });
  const alsoPreparing = stage.prepare(scene);
  assert.equal(images.length, 3, 'A hidden actor is prepared before a later Show block needs it.');
  for (const image of images) image.load();
  await Promise.resolve();
  assert.equal(ready, false, 'A load event alone does not make playback ready.');
  images[0].finishDecode();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(ready, false, 'All exact assets must finish decoding.');
  images[1].finishDecode(); images[2].finishDecode();
  await Promise.all([preparing, alsoPreparing]);
  assert.equal(ready, true);
  assert.ok(draws.includes(images[0]));
  await stage.prepare(scene);
  assert.equal(images.length, 3, 'Repeated Play or export reuses the prepared images.');
});

test('playback preparation rejects an obsolete scene both before and after image readiness', async t => {
  const { stage, images } = stageImageFixture(t), scene = portraitStageScene('navi');
  await assert.rejects(stage.prepare(scene, () => false), /scene or player changed/);
  assert.equal(images.length, 0, 'An already obsolete scene cannot start new artwork requests.');
  let current = true;
  const rejected = assert.rejects(stage.prepare(scene, () => current), /scene or player changed/);
  current = false;
  images[0].load(); images[0].finishDecode();
  await rejected;
});

test('clearing the stage cancels pending preparation and retires late load and decode callbacks', async t => {
  const { stage, images, draws, errors } = stageImageFixture(t), scene = portraitStageScene('navi');
  const snapshot = new SceneEngine(scene).snapshot();
  stage.render(scene, snapshot);
  const rejected = assert.rejects(stage.prepare(scene), /scene or player changed/);
  const oldImage = images[0], staleLoad = oldImage.onload!;
  oldImage.load(); stage.clear();
  await rejected;
  assert.equal(oldImage.removed, 1, 'Cancellation also releases the pending source.');
  assert.equal(oldImage.onload, null); assert.equal(oldImage.onerror, null);
  const count = draws.length;
  oldImage.finishDecode(); staleLoad(); await Promise.resolve();
  assert.equal(draws.length, count, 'Late completion cannot draw a retired scene.');
  assert.deepEqual(errors, [], 'Cancellation is not reported as broken art.');
  stage.render(scene, snapshot);
  const reopened = stage.prepare(scene);
  images[1].load(); images[1].finishDecode();
  await reopened;
  assert.equal(images.length, 2, 'Reopening owns a fresh source load.');
});

test('unresponsive scene art times out once, identifies its Pal and can retry after reopening', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { stage, images, errors } = stageImageFixture(t), scene = portraitStageScene('navi');
  stage.render(scene, new SceneEngine(scene).snapshot());
  const rejected = assert.rejects(stage.prepare(scene), /Navi's picture could not load in time/);
  t.mock.timers.tick(CREATION_ART_LOAD_TIMEOUT_MS - 1);
  assert.deepEqual(errors, []);
  t.mock.timers.tick(1);
  await rejected;
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Reopen this scene/);
  assert.equal(images[0].onload, null); assert.equal(images[0].onerror, null);
  await assert.rejects(stage.prepare(scene), /Navi's picture could not load in time/);
  assert.equal(images.length, 1, 'A failed current cache entry cannot cause a retry loop.');
  stage.clear(); stage.render(scene, new SceneEngine(scene).snapshot());
  const reopened = stage.prepare(scene);
  images[1].load(); images[1].finishDecode(); await reopened;
  t.mock.timers.tick(CREATION_ART_LOAD_TIMEOUT_MS);
  assert.equal(errors.length, 1, 'A completed image clears its timeout.');
});

test('an invalid decoded bitmap fails playback instead of starting an empty export', async t => {
  const { stage, images } = stageImageFixture(t), scene = portraitStageScene('kip');
  const rejected = assert.rejects(stage.prepare(scene), /Nook's picture could not load/);
  images[0].load(); images[0].failDecode();
  await rejected;
  assert.equal(images[0].onload, null); assert.equal(images[0].onerror, null);
});

test('saved retired scene references resolve exact artwork while new generation excludes every retired ID', () => {
  for (const id of ['pal-glim', ...['luma','zippa'].flatMap(slug =>
    ['base','mature'].map(form => `pal-${slug}-${form}-core-2026-11-20`))]) {
    const scene = createStarterProject('blank');
    scene.actors[0].assetId = id;
    assert.equal(validateEditableProject(scene).actors[0].assetId, id);
    assert.equal(validateSavedCreationManifest(scene).actors[0].assetId, id);
    assert.ok(existsSync(resolve('public', creationAsset(id)!.url!)));
    assert.ok(!CREATION_ASSETS.some(asset => asset.id === id));
    assert.throws(() => validateGeneratedCreationManifest(scene), /available artwork/);
    const engine = new SceneEngine(scene);
    engine.start();
    assert.ok(engine.advance(16).actors.some(actor => actor.id === scene.actors[0].id));
  }
});

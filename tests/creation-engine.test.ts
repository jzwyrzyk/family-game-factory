import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  CREATION_SCHEMA, validateCreationProject, type CreationBlock, type CreationProject,
} from '../src/creation/model';
import {ILLUSTRATED_WORLDS, WORLD_PROPS} from '../src/creation/illustrated-art';
import {createIllustratedStarter, validateEditableProject, validateGeneratedCreationManifest} from '../src/creation/projects';
import {placeBackdrop, setWorldLayer} from '../src/creation/world-tools';
import {SceneEngine, runScene} from '../src/creation/engine';

function project(actions: CreationBlock[] = []): CreationProject {
  return {schema: CREATION_SCHEMA, id: 'test-scene', title: 'A child scene', width: 800, height: 450,
    background: 'meadow', actors: [{id: 'dragon', name: 'Dragon', assetId: 'dragon', x: 100, y: 200}],
    variables: {gems: 0}, programs: [{id: 'dragon-start', actorId: 'dragon', trigger: {type: 'start'}, actions}],
    provenance: {createdBy: 'child', sourceKind: 'curated', sourceProjectId: 'saved-project', sourceRevisionId: 'revision-1'},
  };
}
const move = (id: string, dx: number, durationMs = 100): CreationBlock => ({id, type: 'move', dx, durationMs});

test('strict project validation rejects executable fields, dangling references and ambiguous moves', () => {
  const p = project([move('move-1', 40)]);
  assert.deepEqual(validateCreationProject(p), p);
  for (const invalid of [
    {...p, source: 'alert(1)'},
    {...p, actors: [{...p.actors[0], assetUrl: 'https://example.invalid/private-image'}]},
    {...p, actors: [{...p.actors[0], x: Infinity}]},
    {...p, programs: [{...p.programs[0], actorId: 'missing'}]},
    {...p, programs: [{...p.programs[0], actions: [{id: 'x', type: 'move', x: 30, dx: 40}]}]},
    {...p, programs: [{...p.programs[0], actions: [{id: 'x', type: 'move'}]}]},
    {...p, programs: [{...p.programs[0], actions: [{id: 'x', type: 'set', variable: 'missing', value: 1}]}]},
    {...p, programs: [{...p.programs[0], trigger: {type: 'start', name: 'unexpected'}}]},
    {...p, provenance: {...p.provenance, previewToken: 'private'}},
    {...p, variables: JSON.parse('{"__proto__":3}')},
  ]) assert.throws(() => validateCreationProject(invalid), /Creation Lab/);
  const checked = validateCreationProject(p);
  checked.actors[0].x = 555;
  assert.equal(p.actors[0].x, 100, 'validator returns an independent serialized copy');
});

test('duplicate block IDs, overlapping triggers and oversized programs fail before execution', () => {
  const p = project([move('same', 30), move('same', 40)]);
  assert.throws(() => new SceneEngine(p), /Block IDs/);
  const duplicate = project();
  duplicate.programs.push({...duplicate.programs[0], id: 'another-start'});
  assert.throws(() => validateCreationProject(duplicate), /matching character trigger/);
  const deeplyNested = (depth: number): CreationBlock => depth
    ? {id: `repeat-${depth}`, type: 'repeat', count: 2, actions: [deeplyNested(depth - 1)]}
    : move('leaf', 1);
  assert.throws(() => validateCreationProject(project([deeplyNested(8)])), /nested too deeply/);
  assert.throws(() => validateCreationProject(project([{id: 'repeat', type: 'repeat', count: 51, actions: []}])), /repeat count/);
});

test('sequences run at the authored logical times and independently of frame partitioning', () => {
  const p = project([move('right', 100, 200), {id: 'pause', type: 'wait', durationMs: 100},
    {id: 'down', type: 'move', dy: 100, durationMs: 200}]);
  const engine = new SceneEngine(p);
  engine.start();
  assert.equal(engine.advance(100).actors[0].x, 150);
  assert.equal(engine.advance(100).actors[0].x, 200);
  assert.equal(engine.advance(100).actors[0].y, 200);
  assert.equal(engine.advance(200).actors[0].y, 300);
  const result = engine.snapshot();
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.trace.filter(event => event.type === 'complete').map(event => [event.blockId,event.timeMs]),
    [['right',200],['pause',300],['down',500]]);
  const irregular = new SceneEngine(p); irregular.start();
  for (const ms of [17,53,111,19,123,177]) irregular.advance(ms);
  assert.deepEqual(irregular.snapshot(), result);
});

test('relative/absolute moves, zero duration and nested repeats have reproducible outcomes', () => {
  const p = project([
    {id: 'origin', type: 'move', x: 20, y: 50, durationMs: 0},
    {id: 'nothing', type: 'repeat', count: 0, actions: [move('skip', 999)]},
    {id: 'outer', type: 'repeat', count: 2, actions: [
      {id: 'inner', type: 'repeat', count: 3, actions: [move('small-step', 10, 50),
        {id: 'count', type: 'change', variable: 'gems', amount: 1}]},
    ]},
  ]);
  const engine = new SceneEngine(p);
  const first = engine.start();
  assert.equal(first.actors[0].x, 20); assert.equal(first.actors[0].y, 50);
  const last = engine.advance(300);
  assert.equal(last.actors[0].x, 80); assert.equal(last.variables.gems, 6);
  assert.equal(last.status, 'completed');
  assert.equal(last.trace.filter(entry => entry.type === 'complete' && entry.blockId === 'small-step').length, 6);
});

test('jump, dance and speech are observable during actions and clean up at completion', () => {
  const engine = new SceneEngine(project([
    {id: 'jump', type: 'jump', height: 60, durationMs: 200},
    {id: 'dance', type: 'dance', durationMs: 160},
    {id: 'speak', type: 'say', text: 'I caught a gem!', durationMs: 200},
  ]));
  engine.start();
  assert.equal(engine.advance(100).actors[0].jumpOffset, -60);
  assert.equal(engine.advance(100).actors[0].jumpOffset, 0);
  assert.ok(Math.abs(engine.advance(10).actors[0].rotation - 18) < 1e-9);
  const speaking = engine.advance(150);
  assert.equal(speaking.actors[0].rotation, 0);
  assert.equal(speaking.actors[0].speech, 'I caught a gem!');
  assert.deepEqual(speaking.activeBlockIds, ['speak']);
  const done = engine.advance(200);
  assert.equal(done.actors[0].speech, null); assert.equal(done.status, 'completed');
});

test('actors share reusable asset IDs but run independent concurrent sequences', () => {
  const p = project([move('dragon-move', 100, 200)]);
  p.actors.push({id: 'friend', name: 'Another dragon', assetId: 'dragon', x: 500, y: 200});
  p.programs.push({id: 'friend-start', actorId: 'friend', trigger: {type: 'start'}, actions: [move('friend-move', -100, 200)]});
  const engine = new SceneEngine(p); engine.start();
  assert.deepEqual(engine.advance(100).actors.map(actor => actor.x), [150,450]);
  assert.deepEqual(engine.advance(100).actors.map(actor => actor.x), [200,400]);
});

test('tap can restart completed scenes and interrupts one actor without competing motion writers', () => {
  const p = project([move('walk', 200, 1000)]);
  p.programs.push({id: 'on-tap', actorId: 'dragon', trigger: {type: 'tap'}, actions: [
    {id: 'jump', type: 'jump', height: 80, durationMs: 200},
  ]});
  const engine = new SceneEngine(p); engine.start(); engine.advance(500);
  assert.equal(engine.tap('dragon').actors[0].x, 200);
  assert.equal(engine.advance(100).actors[0].jumpOffset, -80);
  engine.advance(100);
  assert.equal(engine.snapshot().status, 'completed');
  engine.step(300);
  assert.equal(engine.snapshot().timeMs, 1000, 'virtual input schedule can advance while idle');
  assert.equal(engine.tap('dragon').status, 'running');
  assert.equal(engine.advance(100).actors[0].jumpOffset, -80);
  assert.ok(engine.snapshot().trace.some(event => event.type === 'interrupt' && event.programId === 'dragon-start'));
});

test('events, variable and position conditions, and touching sensors execute real behavior', () => {
  const p = project([
    {id: 'set', type: 'set', variable: 'gems', value: 3},
    {id: 'check-variable', type: 'if', condition: {type: 'variable', variable: 'gems', operator: 'gte', value: 3},
      then: [{id: 'send', type: 'emit', name: 'celebrate'}], else: [move('wrong', -50)]},
  ]);
  p.actors.push({id: 'bucket', name: 'Bucket', assetId: 'bucket-blue', x: 110, y: 200});
  p.programs.push({id: 'bucket-event', actorId: 'bucket', trigger: {type: 'event', name: 'celebrate'}, actions: [
    {id: 'check-touch', type: 'if', condition: {type: 'touching', actorId: 'dragon'}, then: [
      {id: 'check-position', type: 'if', condition: {type: 'position', axis: 'x', operator: 'eq', value: 110},
        then: [{id: 'reward', type: 'change', variable: 'gems', amount: 10}]},
    ]},
  ]});
  const result = new SceneEngine(p).start();
  assert.equal(result.variables.gems, 13);
  assert.equal(result.status, 'completed');
  assert.ok(result.trace.some(event => event.type === 'event' && event.name === 'celebrate'));
  const failed = project([{id: 'condition', type: 'if', condition: {type: 'variable', variable: 'gems', operator: 'gt', value: 0},
    then: [move('positive', 100, 0)], else: [move('otherwise', -50, 0)]}]);
  assert.equal(new SceneEngine(failed).start().actors[0].x, 50);
});

test('hidden characters do not receive taps or satisfy touching sensors', () => {
  const p = project([{id: 'hide', type: 'hide'}]);
  p.programs.push({id: 'tap', actorId: 'dragon', trigger: {type: 'tap'}, actions: [{id: 'change', type: 'change', variable: 'gems', amount: 1}]});
  const engine = new SceneEngine(p); engine.start();
  assert.equal(engine.tap('dragon').variables.gems, 0);
  assert.equal(engine.snapshot().actors[0].visible, false);
});

test('pause drops stale taps; a deliberate step works and remains paused', () => {
  const p = project([move('walk', 100, 200)]);
  p.programs.push({id: 'tap', actorId: 'dragon', trigger: {type: 'tap'}, actions: [{id: 'count', type: 'change', variable: 'gems', amount: 1}]});
  const engine = new SceneEngine(p); engine.start(); engine.pause();
  assert.equal(engine.advance(100).timeMs, 0);
  engine.tap('dragon');
  const step = engine.step(50);
  assert.equal(step.status, 'paused'); assert.equal(step.timeMs, 50); assert.equal(step.actors[0].x, 125);
  engine.resume();
  const resumed = engine.advance(150);
  assert.equal(resumed.status, 'completed'); assert.equal(resumed.variables.gems, 0);
});

test('cyclic messages and zero-time nested programs stop at explicit execution budgets', () => {
  const p = project([{id: 'emit-first', type: 'emit', name: 'again'}]);
  p.programs.push({id: 'loop', actorId: 'dragon', trigger: {type: 'event', name: 'again'},
    actions: [{id: 'emit-loop', type: 'emit', name: 'again'}]});
  const looping = new SceneEngine(p, {maxEvents: 12}).start();
  assert.equal(looping.status, 'limit'); assert.match(looping.reason!, /event limit/);
  assert.equal(looping.timeMs, 0); assert.equal(looping.activeBlockIds.length, 0);
  const nested = project([{id: 'repeat', type: 'repeat', count: 50,
    actions: [{id: 'change', type: 'change', variable: 'gems', amount: 1}]}]);
  const bounded = new SceneEngine(nested, {maxInstructions: 10}).start();
  assert.equal(bounded.status, 'limit'); assert.equal(bounded.variables.gems, 9);
  assert.ok(bounded.trace.some(event => event.type === 'limit'));
  assert.throws(() => new SceneEngine(p, {maxEvents: Infinity}), /execution budget/);
});

test('time and arithmetic limits stop execution without leaving transient effects', () => {
  const engine = new SceneEngine(project([{id: 'jump', type: 'jump', height: 50, durationMs: 1000}]), {maxDurationMs: 40});
  engine.start(); const stopped = engine.advance(50);
  assert.equal(stopped.status, 'limit'); assert.equal(stopped.timeMs, 40);
  assert.equal(stopped.actors[0].jumpOffset, 0);
  const overflow = project([{id: 'overflow', type: 'change', variable: 'gems', amount: 1000000}]);
  overflow.variables.gems = 1;
  assert.equal(new SceneEngine(overflow).start().status, 'limit');
});

test('input project, exposed project and snapshots cannot mutate a running program; reset restores original state', () => {
  const p = project([move('walk', 100, 100)]);
  const engine = new SceneEngine(p);
  p.actors[0].x = 700;
  engine.project.actors[0].x = 600;
  const first = engine.start(); first.actors[0].x = 500; first.variables.gems = 99;
  const result = engine.advance(100);
  assert.equal(result.actors[0].x, 200); assert.equal(result.variables.gems, 0);
  const fresh = engine.reset();
  assert.equal(fresh.status, 'idle'); assert.equal(fresh.actors[0].x, 100);
  assert.equal(fresh.trace.length, 0); assert.equal(fresh.timeMs, 0);
});

test('runScene applies scheduled taps reproducibly and rejects impossible observation inputs', () => {
  const p = project();
  p.programs.push({id: 'tap', actorId: 'dragon', trigger: {type: 'tap'}, actions: [move('walk', 50, 100)]});
  const options = {durationMs: 500, inputs: [{timeMs: 100, type: 'tap' as const, actorId: 'dragon'},
    {timeMs: 300, type: 'tap' as const, actorId: 'dragon'}]};
  const a = runScene(p, {...options, stepMs: 50});
  const b = runScene(p, {...options, stepMs: 20});
  assert.deepEqual(a, b); assert.equal(a.actors[0].x, 200);
  assert.deepEqual(a.trace.filter(event => event.type === 'tap').map(event => event.timeMs), [100,300]);
  assert.ok(a.trace.every((event,index) => event.sequence === index));
  assert.throws(() => runScene(p, {inputs: [{timeMs: 50, type: 'tap', actorId: 'missing'}]}), /observation input/);
  assert.throws(() => runScene(p, {durationMs: 99999999}), /observation window/);
  assert.throws(() => new SceneEngine(p).advance(-1), /playback duration/);
});


test('four versioned worlds share props and preserve actor movement, IDs and classic saves', () => {
  const labels = ['Enchanted Gem Forest','Inventor’s Workshop','Cloud Kingdom','Moon Adventure'];
  assert.deepEqual(ILLUSTRATED_WORLDS.map(world => world.label), labels);
  assert.equal(new Set(WORLD_PROPS.map(prop => prop.id)).size, WORLD_PROPS.length);
  const classic = project([move('step',35)]);
  assert.deepEqual(validateEditableProject(classic), classic);
  for (const world of ILLUSTRATED_WORLDS) {
    const starter = createIllustratedStarter('blank', world.id);
    assert.equal(starter.background, world.id);
    assert.ok(world.props.includes(starter.actors[0].assetId));
    for (const id of world.props) assert.ok(WORLD_PROPS.some(prop => prop.id === id));
    const illustrated: CreationProject = {...classic, background: world.id};
    setWorldLayer(illustrated, 'foreground', false);
    const run = (scene:CreationProject) => {
      const engine = new SceneEngine(validateEditableProject(scene));
      engine.start(); return engine.advance(400);
    };
    assert.deepEqual(run(illustrated).actors, run(classic).actors);
    assert.equal(classic.background, 'meadow');
  }
});

test('private backdrops retain exact actor references and layer validation rejects injected resources', () => {
  const original = project(), scene = structuredClone(original);
  const first = {assetId: 'art:image:drawA:' + 'a'.repeat(64), label: 'My mountains'};
  const second = {assetId: 'art:image:drawB:' + 'b'.repeat(64), label: 'My forest'};
  const backdrop = placeBackdrop(scene, first);
  assert.equal(backdrop.assetId, first.assetId);
  assert.equal(backdrop.size, 100);
  const kept = validateEditableProject(scene);
  const changed = placeBackdrop(scene, second);
  assert.equal(changed.id, backdrop.id);
  assert.equal(scene.actors.length, original.actors.length + 1);
  assert.equal(kept.actors[1].assetId, first.assetId);
  assert.deepEqual(scene.programs, original.programs);
  assert.throws(() => validateGeneratedCreationManifest(scene));
  for (const invalid of [
    {...scene, background:'https://example.invalid/world'},
    {...scene, worldLayers:{foreground:true,middle:false,url:'file:///secret'}},
    {...scene, actors:[...scene.actors, {...changed,id:'duplicate'}]},
    {...scene, actors:[{...changed, assetId:'dragon'}]},
    {...scene, actors:[{...changed, layer:'execute'}]}
  ]) assert.throws(() => validateEditableProject(invalid));
});

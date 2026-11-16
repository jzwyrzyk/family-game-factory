import test from 'node:test';
import assert from 'node:assert/strict';
import { PARTS, PART_LIST, validatePartDefinition, validateDrawingRig, type DrawingRig, type PartKind } from '../src/quality/parts';
import { addPart, connectParts, emptyBlueprint, rebindConnections, starterBlueprint, validateBlueprint, type Blueprint } from '../src/quality/blueprint';
import { createConstruction, createVehicle, FIXED_DT, type ConstructionSimulation, type VehicleSimulation, type SimulationSnapshot } from '../src/quality/physics';

function advance(simulation: ConstructionSimulation | VehicleSimulation, seconds: number, input = {}) {
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) simulation.step(FIXED_DT, input);
  return simulation.snapshot();
}
const passenger = (s: SimulationSnapshot) => s.bodies.find(b => b.kind === 'capsule')!;
function assertFinite(s: SimulationSnapshot) {
  assert.ok(Number.isFinite(s.time));
  for (const b of s.bodies) for (const k of ['x', 'y', 'angle', 'vx', 'vy', 'previousX', 'previousY', 'previousAngle'] as const) assert.ok(Number.isFinite(b[k]), `${b.id}.${k}`);
  for (const j of s.joints) for (const v of [j.a.x, j.a.y, j.b.x, j.b.y, j.stress]) assert.ok(Number.isFinite(v));
}
function freeze(value: any) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test('authored construction goals are physically reachable and do not depend on a prescribed parts recipe', () => {
  for (const mission of ['delivery', 'loft', 'bridge']) {
    const simulation = createConstruction(starterBlueprint(mission), {}, mission);
    const result = advance(simulation, 12);
    assert.equal(result.status, 'won', mission);
    assert.equal(result.brokenCount, 0, mission);
    assert.ok(result.time > 1, 'the machine must move or carry its load before success');
    assert.equal(simulation.drainEvents().filter(e => e.type === 'win').length, 1);
    assert.deepEqual(simulation.drainEvents(), []);
  }
  // A lighter spoon chassis also works; there is no recipe evaluator deciding the win.
  const alternative = starterBlueprint('delivery');
  alternative.parts.find(p => p.kind === 'carton')!.kind = 'spoon';
  const result = advance(createConstruction(alternative, {}, 'delivery'), 12);
  assert.equal(result.status, 'won');
  assert.ok(passenger(result).x >= result.goal.x);

  const unpowered = starterBlueprint('delivery');
  unpowered.parts = unpowered.parts.filter(p => p.kind !== 'fan');
  unpowered.joints = unpowered.joints.filter(j => j.a !== 'fan-1' && j.b !== 'fan-1');
  assert.equal(advance(createConstruction(unpowered, {}, 'delivery'), 31).status, 'lost');
});

test('mass changes lift, while off-centre mass creates torque from the same fan', () => {
  const light = starterBlueprint('loft'), heavy = structuredClone(light);
  heavy.parts.find(p => p.kind === 'bottle')!.kind = 'can';
  const lightResult = advance(createConstruction(light, {}, 'free'), .5);
  const heavyResult = advance(createConstruction(heavy, {}, 'free'), .5);
  assert.ok(passenger(lightResult).vy < -1, 'lighter craft rises');
  assert.ok(passenger(heavyResult).vy > .5, 'same fan cannot lift the heavier craft');

  let balanced = addPart(light, 'can', 12, 5.5), offset = addPart(light, 'can', 13.4, 8.5);
  balanced = connectParts(balanced, 'bottle-1', 'can-1');
  offset = connectParts(offset, 'bottle-1', 'can-1');
  const a = advance(createConstruction(balanced, { jointStrength: 2 }, 'free'), .6);
  const b = advance(createConstruction(offset, { jointStrength: 2 }, 'free'), .6);
  assert.ok(Math.abs(passenger(a).angle) < .01, 'centred mass stays balanced');
  assert.ok(Math.abs(passenger(b).angle) > .4, 'offset mass tips the craft');
  assert.equal(b.brokenCount, 0, 'the rotation comes from torque, not a broken connection');
});

test('rotating a fan redirects thrust and can turn a successful launch into a tumble', () => {
  const straight = starterBlueprint('loft'), rotated = structuredClone(straight);
  rotated.parts.find(p => p.kind === 'fan')!.angle = Math.PI / 2;
  const a = advance(createConstruction(straight, { jointStrength: 2 }, 'free'), .5);
  const b = advance(createConstruction(rebindConnections(rotated), { jointStrength: 2 }, 'free'), .5);
  assert.ok(passenger(a).vy < 0);
  assert.ok(passenger(b).vy > 3);
  assert.ok(Math.abs(passenger(b).angle) > .5);
  const momentumX = b.bodies.reduce((total, body) => total + body.vx * body.mass, 0);
  assert.ok(momentumX > 2, 'rotated fan adds real horizontal momentum');
});

test('gum stress rises under load and weak joints snap while stronger joints support the bridge', () => {
  const weak = createConstruction(starterBlueprint('bridge'), { jointStrength: .5 }, 'bridge');
  const strong = createConstruction(starterBlueprint('bridge'), { jointStrength: 2 }, 'bridge');
  const weakResult = advance(weak, 8), strongResult = advance(strong, 8);
  assert.equal(weakResult.status, 'lost');
  assert.ok(weakResult.brokenCount >= 1);
  assert.ok(weakResult.joints.some(j => j.broken && j.stress > 1));
  assert.ok(weak.drainEvents().some(e => e.type === 'snap'));
  assert.equal(strongResult.status, 'won');
  assert.equal(strongResult.brokenCount, 0);
});

test('runs own independent bodies and cannot overwrite the editable blueprint or another run', () => {
  const blueprint = freeze(starterBlueprint('delivery')) as Blueprint;
  const before = JSON.stringify(blueprint), first = createConstruction(blueprint), second = createConstruction(blueprint);
  const pristine = second.snapshot();
  advance(first, 2);
  assert.equal(JSON.stringify(blueprint), before);
  assert.deepEqual(second.snapshot(), pristine);
  const exported = first.snapshot();
  exported.bodies[0].x = 999;
  exported.joints[0].a.x = 999;
  assert.notEqual(first.snapshot().bodies[0].x, 999);
  assert.notEqual(first.snapshot().joints[0].a.x, 999);
  const stopped = first.snapshot();
  first.dispose(); advance(first, 1);
  assert.deepEqual(first.snapshot(), stopped);
  const restarted = createConstruction(blueprint);
  assert.deepEqual(restarted.snapshot(), pristine);
});

function seededBlueprint(seed: number) {
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const kinds: PartKind[] = ['bottle', 'carton', 'can', 'spoon', 'cone', 'wheel'];
  let blueprint = emptyBlueprint();
  for (let i = 0; i < 12; i++) {
    blueprint = addPart(blueprint, kinds[Math.floor(random() * kinds.length)], 2 + (i % 6) * 3.5, 2 + Math.floor(i / 6) * 4);
    blueprint.parts.at(-1)!.angle = (random() - .5) * 2;
  }
  return blueprint;
}
test('a seeded scene repeats exactly at 30, 60 and 120 render updates per second', () => {
  const blueprint = seededBlueprint(0x154b);
  assert.deepEqual(blueprint, seededBlueprint(0x154b));
  const results = [30, 60, 120].map(rate => {
    const simulation = createConstruction(blueprint, {}, 'free');
    for (let i = 0; i < rate * 4; i++) simulation.step(1 / rate);
    return simulation.snapshot();
  });
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[1], results[2]);
  const simulation = createConstruction(blueprint, {}, 'free');
  simulation.step(10);
  assert.ok(simulation.snapshot().time <= FIXED_DT * 8 + 1e-10, 'a suspended tab cannot enqueue unbounded catch-up');
  assertFinite(simulation.snapshot());
});

test('vehicle traction, reversal and braking have physical consequences, and the starter completes the meadow', () => {
  const stopped = createVehicle(), forward = createVehicle(), reverse = createVehicle();
  advance(stopped, 1); advance(forward, 1, { throttle: 1 }); advance(reverse, 1, { throttle: -1 });
  assert.ok(forward.snapshot().bodies[0].x > stopped.snapshot().bodies[0].x + 1);
  assert.ok(reverse.snapshot().bodies[0].x < stopped.snapshot().bodies[0].x - 1);
  const coasting = createVehicle(), braking = createVehicle();
  for (const simulation of [coasting, braking]) advance(simulation, 1.25, { throttle: 1 });
  advance(coasting, .75); advance(braking, .75, { brake: true });
  assert.ok(braking.snapshot().speed < coasting.snapshot().speed * .3);
  const drive = createVehicle();
  advance(drive, 20, { throttle: 1 });
  assert.equal(drive.snapshot().status, 'won');
  assert.ok(Math.abs(drive.snapshot().tilt) < .4, 'default ride finishes upright');
  assert.ok(drive.drainEvents().some(e => e.type === 'land'));
});

test('suspension, gravity and every exposed tuning corner remain finite under repeated driving input', () => {
  // All 32 corners exercise light/heavy bodies, tiny/large wheels and weak/stiff springs.
  for (let bits = 0; bits < 32; bits++) for (const track of ['meadow', 'ridge', 'moon']) {
    const simulation = createVehicle({ enginePower: bits & 1 ? 2 : .5, suspension: bits & 2 ? 8 : 2,
      wheelSize: bits & 4 ? .8 : .35, chassisMass: bits & 8 ? 2 : .5, grip: bits & 16 ? 1.5 : .5 }, track);
    for (let i = 0; i < 1200; i++) {
      simulation.step(FIXED_DT, { throttle: i % 600 < 300 ? 1 : -1, brake: i % 200 > 160 });
      const result = simulation.snapshot(); assertFinite(result);
      if (result.status !== 'playing') break;
    }
  }
  for (let bits = 0; bits < 8; bits++) for (const mission of ['delivery', 'loft', 'bridge']) {
    const simulation = createConstruction(starterBlueprint(mission), { gravity: bits & 1 ? 16 : 4,
      jointStrength: bits & 2 ? 2 : .5, thrust: bits & 4 ? 1.5 : .5 }, mission);
    for (let i = 0; i < 1800; i++) {
      simulation.step(FIXED_DT, { action: i % 40 > 20 });
      const result = simulation.snapshot(); assertFinite(result);
      if (result.status !== 'playing') break;
    }
  }
});

test('corrupt saved blueprints, stale anchors and unbounded settings are rejected before simulation', () => {
  const valid = starterBlueprint();
  const mutations: ((b: any) => void)[] = [
    b => { b.version = 2; }, b => { b.parts[0].x = NaN; }, b => { b.parts[0].kind = 'script'; },
    b => { b.parts[0].id = b.parts[1].id; }, b => { b.parts[0].url = 'https://example.com'; },
    b => { b.joints[0].a = 'missing'; }, b => { b.joints[0].anchorA.x = 6; },
    b => { b.parts[0].x += 2; }, b => { b.joints.push(structuredClone(b.joints[0])); },
    b => { b.parts = Array.from({ length: 33 }, (_, i) => ({ ...b.parts[0], id: `part-${i}` })); },
  ];
  for (const change of mutations) { const bad = structuredClone(valid); change(bad); assert.throws(() => createConstruction(bad)); }
  const edited = structuredClone(valid); edited.parts[0].x += .25;
  assert.throws(() => validateBlueprint(edited), /MISALIGNED/);
  assert.doesNotThrow(() => validateBlueprint(rebindConnections(edited)));
  assert.throws(() => createVehicle({ enginePower: Infinity }));
  assert.throws(() => createVehicle({ wheelSize: 0 }));
  assert.throws(() => createConstruction(valid, { gravity: -100 }));
  assert.throws(() => createConstruction(starterBlueprint('bridge'), { gumBudget: 4 }, 'bridge'), /gum/);
  assert.throws(() => createVehicle().step(NaN));
  assert.throws(() => createVehicle().step(FIXED_DT, { throttle: 2 }));
});

test('versioned drawing components accept a car rig and reject unsafe geometry or cyclic parents', () => {
  assert.equal(PART_LIST.length, 10);
  for (const part of PART_LIST) assert.deepEqual(validatePartDefinition(part), part);
  const rig: DrawingRig = { schemaVersion: 1, id: 'drawn-car', components: [
    { id: 'cab', parentId: null, part: PARTS.carton, offset: { x: 0, y: 0 }, angle: 0, physical: true },
    { id: 'wheel', parentId: 'cab', part: PARTS.wheel, offset: { x: 1, y: 1 }, angle: 0, physical: true },
  ], bindings: [{ a: 'cab', b: 'wheel', attachmentA: 'bottom', attachmentB: 'axle', kind: 'suspension' }] };
  assert.deepEqual(validateDrawingRig(rig), rig);
  const cyclic = structuredClone(rig); cyclic.components[0].parentId = 'wheel';
  assert.throws(() => validateDrawingRig(cyclic), /CYCLIC/);
  const badBinding = structuredClone(rig); badBinding.bindings[0].attachmentB = 'not-an-attachment';
  assert.throws(() => validateDrawingRig(badBinding));
  assert.throws(() => validatePartDefinition({ ...PARTS.carton, script: 'run()' }));
  assert.throws(() => validatePartDefinition({ ...PARTS.carton, spriteId: 'https://example.com/image.png' }));
  assert.throws(() => validatePartDefinition({ ...PARTS.carton, mass: 100000 }));
  const star = [0, 2, 4, 1, 3].map(i => ({ x: Math.cos(i * 2 * Math.PI / 5) * .7, y: Math.sin(i * 2 * Math.PI / 5) * .7 }));
  assert.throws(() => validatePartDefinition({ ...PARTS.carton, collider: { type: 'polygon', vertices: star } }), /CONVEX/);
});

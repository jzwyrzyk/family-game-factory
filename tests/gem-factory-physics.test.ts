import test from 'node:test';
import assert from 'node:assert/strict';
import { GemSortingSimulation, type FactoryGemColor } from '../src/games/gem-factory-physics';

const advance = (sim: GemSortingSimulation, seconds: number, rate = 60) => {
  for (let i = 0; i < Math.round(seconds * rate); i++) sim.step(1 / rate);
  return sim.snapshot();
};

test('the same falling gem reaches different real contact sensors when the ramp is tilted', () => {
  for (const color of ['ruby', 'sapphire', 'emerald', 'amethyst', 'sunshine'] as FactoryGemColor[]) {
    for (const direction of [-1, 1] as const) {
      const sim = new GemSortingSimulation(); sim.setDirection(direction); advance(sim, .6);
      sim.release(color); const falling = advance(sim, .2);
      assert.ok(falling.gems[0].vy > 1, 'gravity accelerates the released body');
      assert.equal(falling.gems[0].state, 'moving', 'a route choice never instantly credits a gem');
      assert.equal(sim.drainEvents().length, 0);
      const landed = advance(sim, 2);
      assert.ok(landed.contacts >= 2, 'ramp and basket contacts actually happen');
      assert.deepEqual(sim.drainEvents().map(e => [e.color, e.bin]), [[color, direction === -1 ? 'order' : 'return']]);
      assert.deepEqual(sim.drainEvents(), [], 'a contact event is credited only once');
    }
  }
});

test('changing the ramp while the gem is falling changes its path; gems can jostle', () => {
  const left = new GemSortingSimulation(), switched = new GemSortingSimulation();
  for (const sim of [left, switched]) { sim.release('ruby'); advance(sim, .15); }
  switched.setDirection(1);
  advance(left, 3); advance(switched, 3);
  assert.equal(left.drainEvents()[0].bin, 'order');
  assert.equal(switched.drainEvents()[0].bin, 'return');
  const crowded = new GemSortingSimulation();
  for (const color of ['ruby', 'emerald', 'sapphire', 'ruby'] as FactoryGemColor[]) crowded.release(color);
  assert.equal(crowded.release('sunshine'), null, 'the physical scene is bounded');
  const moving = advance(crowded, .7);
  assert.ok(moving.gemContacts > 0, 'gem bodies collide with one another');
  assert.ok(new Set(moving.gems.map(g => g.x.toFixed(2))).size > 1, 'contacts separate the gems');
  advance(crowded, 9);
  assert.equal(crowded.drainEvents().length, 4, 'every released gem is recoverable even after a jam');
});

test('fixed steps are deterministic across render rates and do not catch up an unbounded pause', () => {
  const results = [30, 60, 120].map(rate => {
    const sim = new GemSortingSimulation(); sim.release('sapphire'); advance(sim, .5, rate); sim.setDirection(1);
    return advance(sim, .5, rate);
  });
  assert.deepEqual(results[0], results[1]); assert.deepEqual(results[1], results[2]);
  const sim = new GemSortingSimulation(); sim.release('ruby');
  const initial = sim.snapshot(); sim.step(0); assert.deepEqual(sim.snapshot(), initial);
  sim.step(10); assert.ok(sim.snapshot().time <= .1000001);
  const frozen = sim.snapshot(); sim.dispose(); advance(sim, 3); assert.deepEqual(sim.snapshot(), frozen);
  assert.equal(sim.release('ruby'), null);
  const invalid = new GemSortingSimulation(); assert.throws(() => invalid.step(NaN)); assert.throws(() => invalid.step(-1));
});

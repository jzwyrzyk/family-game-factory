import test from 'node:test';
import assert from 'node:assert/strict';
import { createMathAdapter } from '../src/learning/adapter';
import { ensureLearning } from '../src/learning/engine';
import type { LearnerProfile } from '../src/learning/types';
import { buildSync } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { resolve } from 'node:path';

const profile = (): LearnerProfile => ({ grade: 3, age: 9, focus: 'times8', skills: {}, factTargets: ['mul:8x7', 'mul:8x8'] });
test('parent targets and due reviews persist while leaving room for supporting practice', () => {
  const math = createMathAdapter(), p = profile(), now = Date.UTC(2026, 10, 14);
  const q = math.select(p, now, () => 0);
  assert.equal(q.factId, 'mul:8x7');
  math.record(p, q, true, false, now, 1);
  assert.equal(p.skills['mul:8x7'].dueAt, new Date(now + 86_400_000).toISOString());
  assert.notEqual(math.select(p, now, () => 0).factId, 'mul:8x7');
  const restored = JSON.parse(JSON.stringify(p));
  ensureLearning(restored).selectionCount = 3;
  assert.equal(math.select(restored, now + 2 * 86_400_000, () => 0).factId, 'mul:8x7');
});
test('legacy assisted outcomes preserve attempt count without inventing raw errors', () => {
  const math = createMathAdapter(), p = profile(), q = math.select(p, 0, () => 0);
  math.record(p, q, true, true, 0, 1);
  assert.equal(p.skills[q.factId!].right, 0);
  assert.equal(p.skills[q.factId!].hints, 1);
  math.record(p, q, false, true, 1000, 3);
  assert.equal(p.skills[q.factId!].lastAttempts, 3);
  assert.equal(p.skills[q.factId!].lastIndependent, false);
  assert.equal(p.skills[q.factId!].tries, 2);
  const latest = ensureLearning(p).attempts.at(-1)!;
  assert.equal(latest.answers.length, 0);
  assert.equal(latest.legacy?.rawAnswersAvailable, false);
});

// Execute the real store and its imported engine, compiled as the browser compiles it.
const storeBundle = buildSync({ entryPoints: [resolve('src/legacy/store.js')], bundle: true, write: false, format: 'iife', platform: 'browser' }).outputFiles[0].text;
function loadStore(raw: string) {
  let stored = raw, writes = 0;
  const window: any = {};
  runInNewContext(storeBundle, { window, console: { warn() {} }, localStorage: {
    getItem: () => stored,
    setItem: (_key: string, value: string) => { writes++; stored = value; },
  } });
  return { store: window.FG.store, get stored() { return stored; }, get writes() { return writes; } };
}
const backup = (learning?: unknown) => JSON.stringify({ version: 1, activeProfile: 'child', feedback: [],
  profiles: [{ id: 'child', name: 'Explorer', age: 8, skills: {}, stats: {}, rate: 0, ...(learning === undefined ? {} : { learning }) }] });

test('store age migration agrees with the learner grade and preserves math participation', () => {
  const loaded = loadStore(backup());
  assert.equal(loaded.store.current().grade, 2);
  assert.ok(loaded.store.current().rate >= 1);
  assert.equal(loaded.store.loadError, null);
});
test('unsupported local learning is preserved and cannot be overwritten by startup saves', () => {
  const raw = backup({ version: 99, preserved: 'original data' }), loaded = loadStore(raw);
  assert.equal(loaded.store.current().learning.version, 99);
  assert.match(loaded.store.loadError, /has not been reset or overwritten/);
  assert.equal(loaded.store.recoveryRaw, raw);
  assert.equal(loaded.store.save(), false); assert.equal(loaded.writes, 0); assert.equal(loaded.stored, raw);
  assert.throws(() => loaded.store.restore(backup({ version: 2 })), /invalid or unsupported/);
  assert.equal(loaded.stored, raw);
  loaded.store.restore(backup());
  assert.equal(loaded.store.loadError, null); assert.equal(loaded.store.recoveryRaw, null);
  assert.equal(loaded.store.save(), true); assert.equal(loaded.store.current().grade, 2);
});
test('unreadable local backup remains exportable with all writes blocked', () => {
  const raw = '{broken backup', loaded = loadStore(raw);
  assert.equal(loaded.store.recoveryRaw, raw); assert.equal(loaded.store.save(), false);
  assert.equal(loaded.stored, raw); assert.equal(loaded.writes, 0);
  assert.throws(() => loaded.store.reset(), /preserved progress/);
});

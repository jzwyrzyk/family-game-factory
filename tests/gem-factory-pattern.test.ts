import test from 'node:test';
import assert from 'node:assert/strict';
import { factoryPalette, factoryPattern, factorySupply } from '../src/games/gem-factory-pattern';

test('Gem Factory asks for the next repeating piece, including blanks away from the first color', () => {
  assert.deepEqual(factoryPattern(1, 0), {
    cycle: ['ruby', 'sapphire'], sequence: ['ruby', 'sapphire', 'ruby', 'sapphire', 'ruby', 'sapphire'], next: 'ruby',
  });
  assert.deepEqual(factoryPattern(1, 1), {
    cycle: ['sapphire', 'emerald'], sequence: ['sapphire', 'emerald', 'sapphire', 'emerald', 'sapphire', 'emerald', 'sapphire'], next: 'emerald',
  });
  const later = factoryPattern(2, 1);
  assert.deepEqual(later.cycle, ['emerald', 'amethyst', 'emerald']);
  assert.deepEqual(later.sequence, ['emerald', 'amethyst', 'emerald', 'emerald', 'amethyst', 'emerald', 'emerald']);
  assert.equal(later.next, 'amethyst', 'accepting an arbitrary color already in the recipe would give a wrong answer');
  assert.notEqual(later.next, later.sequence[0], 'copying the first gem cannot solve every gift');
});

test('pattern progression supplies AB, AAB and ABC with distinct, recognizable gem identities', () => {
  assert.deepEqual(factoryPattern(2, 0).cycle, ['sapphire', 'sapphire', 'emerald']);
  assert.deepEqual(factoryPattern(3, 0).cycle, ['emerald', 'amethyst', 'sunshine']);
  for (const level of [1, 2, 3, 4, 5, 6, 20, 999]) {
    for (let gift = 0; gift < 5; gift++) {
      const p = factoryPattern(level, gift), palette = factoryPalette(level);
      assert.ok(p.sequence.length >= 6 && p.sequence.length <= 7, 'longer clues show at least two full cycles without an unbounded row');
      assert.ok(new Set(p.cycle).size >= 2, 'a constant color is not a repeating-pattern challenge');
      assert.ok([...p.sequence, p.next].every(color => palette.includes(color)));
      assert.deepEqual(p.sequence, Array.from({ length: p.sequence.length }, (_, i) => p.cycle[i % p.cycle.length]));
      assert.equal(p.next, p.cycle[p.sequence.length % p.cycle.length]);
      assert.deepEqual(factoryPattern(level, gift), p, 'a retry preserves the actual puzzle');
    }
  }
});

test('both gifts at a pattern tier cannot be solved just by copying the first pictured jem', () => {
  for (const level of [1, 2, 3, 4, 5, 6, 20, 999]) {
    const first = factoryPattern(level, (level - 1) * 2);
    const second = factoryPattern(level, (level - 1) * 2 + 1);
    assert.equal(first.sequence.length, 6);
    assert.equal(second.sequence.length, 7);
    assert.notEqual(second.next, second.sequence[0], `tier ${level}: the second puzzle checks the repeated rule`);
  }
});

test('every supply loop contains a reachable answer and distractors, including the new-day introduction', () => {
  for (const level of [1, 2, 3, 5, 999]) {
    for (let gift = 0; gift < 5; gift++) {
      const p = factoryPattern(level, gift), supply = factorySupply(p, level, gift);
      assert.equal(supply.length, 4);
      assert.equal(supply.filter(color => color === p.next).length, 2);
      assert.ok(supply.some(color => color !== p.next));
      if (gift === 0) assert.notEqual(supply[0], p.next, 'the first gift introduces the Return bucket');
    }
  }
});

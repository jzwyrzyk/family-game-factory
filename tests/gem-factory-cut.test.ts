import test from 'node:test';
import assert from 'node:assert/strict';
import { factoryCutRating, FACTORY_CUT_ZONE } from '../src/games/gem-factory-cut';

test('the whole visible green cutting zone succeeds, including its edges', () => {
  for (const position of [.26, .3, .38, .62, .7, .74]) {
    assert.equal(factoryCutRating(position), 2, `position ${position} is a good cut`);
  }
  for (const position of [.385, .45, .5, .55, .615]) {
    assert.equal(factoryCutRating(position), 3, `position ${position} is a perfect cut`);
  }
  assert.equal(FACTORY_CUT_ZONE.goodStart, .26);
  assert.equal(FACTORY_CUT_ZONE.goodEnd, .74);
  assert.equal(FACTORY_CUT_ZONE.perfectStart, .385);
  assert.equal(FACTORY_CUT_ZONE.perfectEnd, .615);
});

test('misses and invalid positions never become a successful or rewarded cut', () => {
  for (const position of [0, .1, .259999, .740001, .9, 1, -1, 2, NaN, Infinity, -Infinity]) {
    assert.equal(factoryCutRating(position), 0, `position ${position} must recycle the current jem`);
  }
});

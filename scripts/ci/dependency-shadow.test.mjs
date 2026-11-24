import test from 'node:test';
import assert from 'node:assert/strict';
import {dependencyObservation, changeCategory} from './dependency-shadow.mjs';
import {ALL_SHARDS} from './classify-impact.mjs';

test('game, UI, learning, coding and conversation observations never authorize narrower execution', () => {
  for (const [path, category] of [['src/games/example.ts','game'], ['src/studio/style.css','ui'],
    ['src/learning/content.ts','learning'], ['src/creation/learner-controls.ts','coding'],
    ['src/studio/conversation-view.ts','conversation']]) {
    assert.equal(changeCategory(path), category);
    const result = dependencyObservation({[path]: 'export const value=1;'}, [path]);
    assert.equal(result.maySelectTests, false); assert.equal(result.coverageProven, false);
    assert.deepEqual(result.executableFallbackShards, ALL_SHARDS);
  }
});
test('transitive consumers include type dependencies and terminate on cycles', () => {
  const files = {'src/games/rules.ts': "import './player';", 'src/games/player.ts': "import type {Rule} from './rules';",
    'src/main.ts': "import './games/player';"};
  assert.deepEqual(dependencyObservation(files, ['src/games/rules.ts']).changes[0].staticConsumers,
    ['src/games/player.ts','src/main.ts']);
});
test('runtime imports, missing modules and sensitive paths retain full fallback', () => {
  const result = dependencyObservation({'src/main.ts': "import('./games/rules'); import './missing';"},
    ['src/main.ts', 'src/storage.ts', 'deleted.ts']);
  assert.deepEqual(result.changes[0].ambiguousModules, ['src/main.ts']);
  assert.equal(result.changes[1].category, 'security-sensitive');
  assert.equal(result.changes[2].missingModule, true);
  assert.deepEqual(result.executableFallbackShards, ALL_SHARDS);
});

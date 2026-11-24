const {test} = require('node:test');
const assert = require('node:assert/strict');
const {selectScenarios} = require('./browser-scenarios.cjs');
const scenarios = [{name:'desktop'}, {name:'mobile'}, {name:'recovery'}];

test('default runs every declared scenario; selected scenarios retain suite order', () => {
 assert.deepEqual(selectScenarios(scenarios, undefined, 'DEVICES'), scenarios);
 assert.deepEqual(selectScenarios(scenarios, 'recovery, desktop', 'DEVICES'), [scenarios[0], scenarios[2]]);
});

test('unknown, mixed, empty and duplicate selections fail before browser execution', () => {
 for (const requested of ['', ' ', 'unknown', 'desktop,typo', 'desktop,', ',mobile', 'desktop,desktop', 'desktop, desktop']) {
  assert.throws(() => selectScenarios(scenarios, requested, 'DEVICES'), /DEVICES/);
 }
});

test('duplicate suite declarations cannot conceal missing coverage', () => {
 assert.throws(() => selectScenarios([{name:'desktop'}, {name:'desktop'}], undefined, 'DEVICES'), /unique/);
});

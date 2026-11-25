const assert = require('node:assert/strict');

// A misspelt member must not turn a requested set into a smaller passing suite.
// Undefined means the complete suite; an explicitly empty selection is invalid.
exports.selectScenarios = (scenarios, requested, variable) => {
 const names = scenarios.map(scenario => scenario.name);
 assert.equal(new Set(names).size, names.length, 'Scenario names must be unique');
 if (requested === undefined) return [...scenarios];
 const selected = requested.split(',').map(name => name.trim());
 assert.ok(selected.every(name => names.includes(name)), `${variable} must contain only supported scenarios: ${names.join(',')}`);
 assert.equal(new Set(selected).size, selected.length, `${variable} cannot repeat a scenario`);
 return scenarios.filter(scenario => selected.includes(scenario.name));
};

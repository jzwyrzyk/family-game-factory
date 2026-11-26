import fs from 'node:fs';
import { createHash } from 'node:crypto';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));

// A deliberately small grammar, shared by coverage verification and execution.
// Commands are argv, never shell programs. Add a reviewed parser change if the
// repository needs other syntax; silently interpreting it would lose coverage.
export function parseCommand(command) {
  if (typeof command !== 'string' || !command.trim() || /[|;&<>`$\n\r\\]/.test(command)) throw new Error('CI_COMMAND_INVALID');
  const result = [];
  let rest = command.trim();
  while (rest) {
    const match = /^(?:"([^"\n]*)"|'([^'\n]*)'|([^\s"']+))(?:\s+|$)/.exec(rest);
    if (!match) throw new Error('CI_COMMAND_INVALID');
    result.push(match[1] ?? match[2] ?? match[3]);
    rest = rest.slice(match[0].length);
  }
  if (!result.length) throw new Error('CI_COMMAND_INVALID');
  return result;
}

export function expandCommands(commands, scripts, ancestry = []) {
  return commands.flatMap(command => command.split('&&').flatMap(part => {
    const argv = parseCommand(part);
    if (argv[0] !== 'npm') return [argv];
    const name = argv[2];
    if (argv.length !== 3 || argv[1] !== 'run' || !name?.startsWith('test:') || typeof scripts[name] !== 'string' || ancestry.includes(name)) throw new Error('CI_SCRIPT_INVALID');
    if (scripts[`pre${name}`] || scripts[`post${name}`]) throw new Error('CI_SCRIPT_HOOK_REQUIRES_REVIEW');
    return expandCommands([scripts[name]], scripts, [...ancestry, name]);
  }));
}

export function verifyCoverage(manifest, packageJSON) {
  if (manifest.schemaVersion !== 1 || !manifest.shards || !manifest.legacyGroups || !packageJSON.scripts) throw new Error('CI_MANIFEST_INVALID');
  const summary = {};
  for (const [group, commands] of Object.entries(manifest.legacyGroups)) {
    const expected = expandCommands(commands, packageJSON.scripts).map(JSON.stringify).sort();
    const assigned = Object.values(manifest.shards).filter(shard => shard.group === group).flatMap(shard => expandCommands(shard.commands, packageJSON.scripts)).map(JSON.stringify).sort();
    if (new Set(expected).size !== expected.length || new Set(assigned).size !== assigned.length || JSON.stringify(expected) !== JSON.stringify(assigned)) throw new Error(`CI_COVERAGE_MISMATCH:${group}`);
    summary[group] = expected.length;
  }
  for (const [id, shard] of Object.entries(manifest.shards)) {
    if (!/^[a-z][a-z0-9-]*$/.test(id) || !manifest.legacyGroups[shard.group] || !shard.commands?.length) throw new Error('CI_SHARD_INVALID');
  }
  // npm test includes one independently required parent-reporting browser gate.
  // New npm test leaves must be assigned here or explicitly reviewed separately.
  const all = Object.values(manifest.shards).flatMap(shard => expandCommands(shard.commands, packageJSON.scripts));
  const excluded = expandCommands(['npm run test:parent-dashboard-browser'], packageJSON.scripts);
  const top = packageJSON.scripts.test.split('&&').map(s => s.trim());
  if (top.shift() !== 'npm run build') throw new Error('CI_BUILD_REQUIRED');
  const full = expandCommands(top, packageJSON.scripts).map(JSON.stringify).sort();
  if (new Set([...all, ...excluded].map(JSON.stringify)).size !== all.length + excluded.length) throw new Error('CI_DUPLICATE_ACROSS_GROUPS');
  if (JSON.stringify([...all, ...excluded].map(JSON.stringify).sort()) !== JSON.stringify(full)) throw new Error('CI_NPM_TEST_COVERAGE_MISMATCH');
  return summary;
}

if (process.argv[1]?.endsWith('/suites.mjs')) {
  console.log(JSON.stringify(verifyCoverage(readJSON('scripts/ci/suites.json'), readJSON('package.json')), null, 2));
}

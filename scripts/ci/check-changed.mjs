import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { normalizedReviewRegistry } from './classify-impact.mjs';

// These are editing loops. Each includes the consumer journey for its fixtures.
// Shared persistence, host composition, security and unrecognized files escalate.
const domains = {
  navigation: ['test:navigation-continuity'],
  artwork: ['test:art', 'test:art-browser', 'test:pals', 'test:pals-fidelity'],
  coding: ['test:creation', 'test:creation-browser'],
  games: ['test:quality', 'test:gem-factory'],
  math: ['test:learning-ui', 'test:learning-integration'],
  english: ['test:language-ui', 'test:language-integration'],
  coach: ['test:coach'],
  generated: ['test:intent-playtest', 'test:generated-art'],
  storage: ['test:storage-browser'],
  security: ['test:sandbox'],
};
const routes = [
  [/^src\/studio\/(?:navigation|modernization)\.css$/, 'navigation'],
  [/^src\/(?:drawing|pals)\/[^/]+\.css$|^public\/jems-pals\/[^/]+\.webp$/, 'artwork'],
  [/^src\/creation\/(?:landing|style)\.css$/, 'coding'],
  [/^src\/games\/gem-factory(?:\.css|-(?:pattern|cut|physics)\.ts)$/, 'games'],
  [/^src\/learning\/(?:activity\.css|visuals\.ts)$/, 'math'],
  [/^src\/language\/(?:activity\.css|data-g[1-4]\.ts)$/, 'english'],
  [/^src\/studio\/(?:guided-creation|guidance)\.css$/, 'coach'],
];
const testFiles = new Map([
  ['tests/learning-activity.test.ts', 'test:learning-ui'],
  ['tests/language-activity.test.ts', 'test:language-ui'],
  ['tests/parent-dashboard.test.ts', 'test:parent-dashboard'],
  ['tests/creation-engine.test.ts', 'test:creation'],
  ['tests/pals.test.ts', 'test:pals'],
]);
function dependencies(source) {
  // Treat changed import, URL and dynamic-loading expressions conservatively.
  return [...source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\(\s*|@import\s*|\burl\(\s*)(?:'[^'\n]+'|"[^"\n]+"|[^;\n)]+)/g)]
    .map(match => match[0].trim()).sort();
}
export function sameDependencies(path, ancestor) {
  if (!existsSync(path) || !lstatSync(path).isFile()) return false;
  try {
    const before = execFileSync('git', ['show', ancestor + ':' + path], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']});
    const after = readFileSync(path, 'utf8');
    if (path === 'docs/context/registry.json') {
      return isDeepStrictEqual(normalizedReviewRegistry(JSON.parse(before)), normalizedReviewRegistry(JSON.parse(after)));
    }
    return isDeepStrictEqual(dependencies(before), dependencies(after));
  } catch { return false; }
}
const broad = ['test:ci', 'test:docs', 'test', 'docs:check'];
export function changedFiles(base, cwd = process.cwd()) {
  const git = (...args) => execFileSync('git', args, {cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
  const ancestor = git('merge-base', '--', base, 'HEAD').trim();
  const files = [
    git('diff', '--no-renames', '--name-only', '-z', ancestor, 'HEAD', '--'),
    git('diff', '--cached', '--no-renames', '--name-only', '-z', '--'),
    git('diff', '--no-renames', '--name-only', '-z', '--'),
    git('ls-files', '--others', '--exclude-standard', '-z'),
  ];
  return {ancestor, paths: [...new Set(files.flatMap(list => list.split('\0').filter(Boolean)))].sort()};
}
export function selectChecks(paths, requested = [], safeLeaf = () => false) {
  const selected = new Set(requested);
  for (const domain of selected) if (!Object.hasOwn(domains, domain)) throw Error('Unknown --domain. Choose ' + Object.keys(domains).join(', '));
  const reasons = [];
  const units = new Set();
  let docs = false, full = false;
  for (const file of paths) {
    if (file === 'docs/context/registry.json' && safeLeaf(file)) { docs = true; continue; }
    if (/^(?:[^/]+\.md|docs\/.*\.md)$/.test(file)) { docs = true; continue; }
    const target = routes.find(([pattern]) => pattern.test(file))?.[1];
    const suite = testFiles.get(file);
    const safe = (target || suite) && safeLeaf(file);
    if (suite && safe) { units.add(suite); reasons.push(file + ' → ' + suite); continue; }
    const domain = safe && target;
    if (!domain) { reasons.push(file + ' → shared, removed, sensitive or unclassified'); full = true; continue; }
    selected.add(domain);
    reasons.push(file + ' → ' + domain);
  }
  if (selected.size > 1 || selected.has('security')) full = true;
  if (full && paths.some(path => /(?:security|auth|consent|sandbox|budget|trusted-device)/i.test(path))) selected.add('security');
  if (docs) reasons.push('Documentation → validate references and recorded source reviews');
  const commands = full ? [...broad] : [
    ...units, ...(docs ? ['docs:check'] : []), ...(selected.size ? ['build'] : []),
    ...[...selected].flatMap(domain => domains[domain]),
  ];
  if (full && selected.has('security')) commands.push(...domains.security);
  return {full, reasons, commands: [...new Set(commands)]};
}
function main() {
  const {values} = parseArgs({options: {base: {type: 'string', default: 'origin/main'},
    domain: {type: 'string', multiple: true}, plan: {type: 'boolean'}}});
  if (process.env.GITHUB_ACTIONS === 'true') throw Error('Use the hosted qualification workflow. check:changed is for editing.');
  let comparison;
  try { comparison = changedFiles(values.base); }
  catch {
    console.error('Cannot compare the merge base and working tree. Selecting broad local regression.');
    comparison = {paths: ['(unavailable Git comparison)']};
  }
  const safeLeaf = file => {
    if (file.endsWith('.webp')) return existsSync(file) && lstatSync(file).isFile();
    return sameDependencies(file, comparison.ancestor);
  };
  const plan = selectChecks(comparison.paths, values.domain, safeLeaf);
  console.log('Local editing feedback only. Hosted integration and release evidence are separate.');
  for (const reason of plan.reasons.slice(0, 15)) console.log('  ' + reason);
  if (plan.reasons.length > 15) console.log('  … ' + (plan.reasons.length - 15) + ' additional paths');
  if (plan.full) console.log('Broader regression selected for shared impact or multiple domains.');
  console.log(plan.commands.map(name => 'npm run ' + name).join('\n') || 'No changes since the merge base. Use --domain to exercise a journey.');
  if (values.plan) return;
  for (const name of plan.commands) {
    const result = spawnSync('npm', ['run', name], {stdio: 'inherit'});
    if (result.status !== 0) {
      console.error('Failed: npm run ' + name + '. See the first failing assertion above and available files under test-results/.');
      process.exitCode = result.status || 1;
      return;
    }
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();

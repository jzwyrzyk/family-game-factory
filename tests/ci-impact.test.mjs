import {test} from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, renameSync, chmodSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {ALL_SHARDS, classifyImpact, isInertDocumentation, normalizedReviewRegistry, parsePerformanceBaseline} from '../scripts/ci/classify-impact.mjs';

const policy = readFileSync(new URL('../scripts/ci/classify-impact.mjs', import.meta.url), 'utf8');
const registry = {version: 1, coverageExcludes: ['docs/**'], requiredDocuments: ['README.md'],
  areas: [{id: 'validation', documents: ['README.md'], sources: ['tests/**'], reviewedAt: '2026-11-23T00:00:00Z',
    sourceDigest: 'a'.repeat(64), reviewOutcome: 'updated', reviewReason: 'Initial review', reviewHistory: []}]};
const release = {operation: 'canary', source: 'a'.repeat(40), service: 'factory-gateway',
  image: `registry.example/gateway@sha256:${'b'.repeat(64)}`, baseline: 'gateway-baseline',
  baselineImage: `registry.example/gateway@sha256:${'c'.repeat(64)}`, configuration: 'd'.repeat(64), compatibility: 'e'.repeat(64)};
const compatibility = {source: release.source, service: release.service, image: release.image,
  baseline: release.baseline, baselineImage: release.baselineImage,
  evidence: 'https://github.com/jzwyrzyk/family-game-factory/actions/runs/123'};
release.compatibility = createHash('sha256').update(JSON.stringify(compatibility, null, 2)).digest('hex');
function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'jems-ci-impact-'));
  t.after(() => rmSync(cwd, {recursive: true, force: true}));
  const git = (...args) => execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  const put = (path, value) => { const dest = join(cwd, path); mkdirSync(dirname(dest), {recursive: true}); writeFileSync(dest, typeof value === 'string' ? value : JSON.stringify(value, null, 2)); };
  git('init', '-q'); git('config', 'user.name', 'CI fixture'); git('config', 'user.email', 'ci@example.invalid');
  put('scripts/ci/classify-impact.mjs', policy); put('README.md', '# Test\n');
  put('DELIVERY-STATE.md', '# Delivery\n'); put('docs/context/registry.json', registry);
  put('docs/new-guide.md', '# Unknown guide\n'); put('docs/pals/art/character-references.json', {source: 'old'});
  put(RELEASE, release); put(COMPATIBILITY, compatibility);
  put('ops/ci-performance.json', {schemaVersion: 1, runIds: [123]});
  put('src/games/gem-factory-cut.ts', 'export const cut = 0.26;\n');
  put('src/games/gem-factory-pattern.ts', "import type { FactoryGemColor } from './gem-factory-physics';\nexport const palette = ['ruby'];\n");
  put('src/games/mind-your-jems-rules.ts', 'export const BAG_CAPACITY = 10;\n');
  put('src/language/data-g1.ts', "import type {LanguageTemplateBank} from './content';\nexport const data = {q:'Hello'};\n");
  put('src/main.ts', 'export const app = 1;\n'); put('src/style.css', '.button { color: red }');
  put('src/studio/conversation-view.ts', 'export const view = 1;');
  put('server/sessions.ts', 'export const session = 1;'); put('package-lock.json', '{}');
  put('.github/workflows/test.yml', 'name: test\n'); put('tests/unit.ts', 'assert(true);');
  const commit = () => { git('add', '-A'); git('commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD'); };
  const base = commit();
  return {cwd, base, put, git, commit, classify: (options = {}) => classifyImpact({cwd, base, head: commit(), ...options})};
}
const RELEASE = 'ops/release.json', COMPATIBILITY = 'ops/compatibility.json';
function full(plan) { assert.equal(plan.mode, 'full'); assert.deepEqual(plan.requiredShards, ALL_SHARDS); assert.equal(plan.requiredImage, true); }

test('read-only baseline updates require authenticated operational evidence; schema drift remains full', t => {
  const f = fixture(t); f.put('ops/ci-performance.json', {schemaVersion: 1, runIds: [456]});
  const plan = f.classify(); assert.equal(plan.mode, 'release-intent'); assert.equal(plan.requiresEvidenceReuse, true);
  f.put('ops/ci-performance.json', {schemaVersion: 1, runIds: [456], skipTests: true}); full(f.classify());
});
test('performance baseline rejects arbitrary endpoints, duplicate fields and unbounded IDs', () => {
  assert.deepEqual(parsePerformanceBaseline('{"schemaVersion":1,"runIds":[123]}').runIds, [123]);
  for (const raw of ['{"schemaVersion":1,"schemaVersion":1,"runIds":[123]}',
    '{"schemaVersion":1,"runIds":[]}', '{"schemaVersion":1,"runIds":[1,1]}',
    '{"schemaVersion":1,"runIds":["https://example.invalid"]}',
    '{"schemaVersion":1,"runIds":[-1]}', '{"schemaVersion":2,"runIds":[123]}']) {
    assert.throws(() => parsePerformanceBaseline(raw));
  }
});

test('documentation-only change is exact allowlist and keeps integrity + operations checks', t => {
  const f = fixture(t); f.put('README.md', '# Updated documentation\n');
  const plan = f.classify(); assert.equal(plan.mode, 'documentation'); assert.deepEqual(plan.requiredShards, []);
  assert.equal(plan.requiredDocumentation, true); assert.equal(plan.requiredOperations, true); assert.equal(plan.trustedPolicy, true);
  assert.equal(plan.decisions.length, ALL_SHARDS.length);
});
test('unknown Markdown and executable lookalikes are not broad docs bypasses', t => {
  assert.equal(isInertDocumentation('docs/new-guide.md'), false); assert.equal(isInertDocumentation('README.md.js'), false);
  const f = fixture(t); f.put('docs/new-guide.md', '# New\n'); full(f.classify());
});
test('review-only registry metadata is narrow but routing policy changes are full', t => {
  const f = fixture(t); const value = structuredClone(registry); value.areas[0].reviewReason = 'Checked actual diff';
  f.put('docs/context/registry.json', value); assert.equal(f.classify().mode, 'documentation');
  value.areas[0].sources = []; f.put('docs/context/registry.json', value); full(f.classify());
});
test('registry normalization preserves unknown fields and does not hide source routing', () => {
  const value = structuredClone(registry); value.areas[0].newPolicy = {allow: true};
  assert.deepEqual(normalizedReviewRegistry(value).areas[0].newPolicy, {allow: true});
  assert.deepEqual(normalizedReviewRegistry(value).areas[0].sources, ['tests/**']);
  assert.throws(() => normalizedReviewRegistry({areas: [null]}));
});
test('operation-only promotion requires separate evidence reuse and operations checks', t => {
  const f = fixture(t); f.put(RELEASE, {...release, operation: 'promote'}); f.put('DELIVERY-STATE.md', '# Receipt\n');
  const plan = f.classify(); assert.equal(plan.mode, 'release-intent'); assert.equal(plan.requiresEvidenceReuse, true);
  assert.equal(plan.requiredOperations, true); assert.equal(plan.requiredDocumentation, true);
  assert(plan.decisions.every(d => !d.required && d.reason.includes('verification')));
});
test('a changed release source, image or runtime configuration invalidates narrowing', t => {
  for (const field of ['source', 'image', 'configuration']) {
    const f = fixture(t); f.put(RELEASE, {...release, [field]: `${release[field]}0`}); full(f.classify());
  }
});
test('changed compatibility evidence cannot borrow operation-only classification', t => {
  const f = fixture(t); f.put(COMPATIBILITY, {...compatibility, evidence: 'https://example.invalid/success'}); full(f.classify());
});
test('unknown operational keys, duplicate keys and malformed JSON fail closed', t => {
  for (const value of [{...release, command: 'skip'}, '{broken', JSON.stringify(release).replace('"canary"', '"canary","operation":"promote"')]) {
    const f = fixture(t); f.put(RELEASE, value); full(f.classify());
  }
});
test('isolated Factory shadow plan includes game, shared player, ownership, learning and core contracts', t => {
  const f = fixture(t); f.put('src/games/gem-factory-cut.ts', 'export const cut = 0.27;\n');
  const plan = f.classify(); full(plan); assert(plan.shadowTargetedShards.length > 0);
  for (const id of ['factory', 'browser-core', 'browser-storage', 'studio-core', 'notifications', 'learning-math', 'learning-language', 'physical']) assert(plan.shadowTargetedShards.includes(id), id);
  assert(!plan.shadowTargetedShards.includes('mining')); assert.equal(plan.requiredImage, true);
});
test('new indirect or dynamic dependency on a reviewed leaf broadens to full', t => {
  for (const source of ["import x from '../runtime/shared'; export const cut = 1;", "import('../runtime/shared'); export const cut = 1;", 'globalThis.state = 2; export const cut = 1;', "require('../runtime/shared'); export const cut = 1;"]) {
    const f = fixture(t); f.put('src/games/gem-factory-cut.ts', source); full(f.classify());
  }
});
test('existing reviewed type dependency remains eligible', t => {
  const f = fixture(t); f.put('src/games/gem-factory-pattern.ts', "import type { FactoryGemColor } from './gem-factory-physics';\nexport const palette = ['ruby','sapphire'];\n");
  assert(f.classify().shadowTargetedShards.includes('factory'));
});
test('isolated Language shadow plan retains both learning integrations and child recovery', t => {
  const f = fixture(t); f.put('src/language/data-g1.ts', "import type {LanguageTemplateBank} from './content';\nexport const data = {q:'Hi'};\n");
  const plan = f.classify(); full(plan); assert(plan.shadowTargetedShards.length > 0);
  for (const id of ['learning-math', 'learning-language', 'child-coach', 'studio-core']) assert(plan.shadowTargetedShards.includes(id));
});
test('shared UI, coach, shared source and security-sensitive changes remain full', t => {
  for (const path of ['src/style.css', 'src/studio/conversation-view.ts', 'src/main.ts', 'server/sessions.ts']) {
    const f = fixture(t); f.put(path, 'changed'); full(f.classify());
  }
});
test('tests, dependencies, policy and workflow changes cannot authorize their own skip', t => {
  for (const path of ['tests/unit.ts', 'package-lock.json', '.github/workflows/test.yml', 'scripts/ci/classify-impact.mjs']) {
    const f = fixture(t); f.put(path, 'changed'); full(f.classify());
  }
});
test('artwork index under docs is executable build data and remains full', t => {
  const f = fixture(t); f.put('docs/pals/art/character-references.json', {source: 'new'}); full(f.classify());
});
test('mixed docs plus executable unknown change remains full', t => {
  const f = fixture(t); f.put('README.md', '# Documentation'); f.put('src/main.ts', 'changed'); full(f.classify());
});
test('mixed release intent plus targeted leaf remains full', t => {
  const f = fixture(t); f.put(RELEASE, {...release, operation: 'promote'}); f.put('src/games/gem-factory-cut.ts', 'export const cut = 1;'); full(f.classify());
});
test('mixed feature domains remain full', t => {
  const f = fixture(t); f.put('src/games/gem-factory-cut.ts', 'export const cut = 1;');
  f.put('src/language/data-g1.ts', "import type {LanguageTemplateBank} from './content';\nexport const data = {};\n"); full(f.classify());
});
test('renames, deletions, additions and executable mode changes fail broad', t => {
  for (const mutate of [f => renameSync(join(f.cwd, 'README.md'), join(f.cwd, 'RENAMED.md')),
    f => rmSync(join(f.cwd, 'README.md')), f => f.put('new.md', '# New'), f => chmodSync(join(f.cwd, 'README.md'), 0o755)]) {
    const f = fixture(t); mutate(f); full(f.classify());
  }
});
test('a symlink named like an allowed document cannot hide a changed file', t => {
  const f = fixture(t); rmSync(join(f.cwd, 'README.md')); symlinkSync('src/main.ts', join(f.cwd, 'README.md')); full(f.classify());
});
test('force full and push events preserve complete production source validation', t => {
  const f = fixture(t); f.put('README.md', '# Changed'); const head = f.commit();
  full(classifyImpact({cwd: f.cwd, base: f.base, head, forceFull: true}));
  full(classifyImpact({cwd: f.cwd, base: f.base, head, event: 'push'}));
});
test('missing base policy bootstraps full rather than running a head-supplied exemption', t => {
  const f = fixture(t); f.git('rm', 'scripts/ci/classify-impact.mjs'); const base = f.commit();
  f.put('README.md', '# Changed'); const head = f.commit();
  const plan = classifyImpact({cwd: f.cwd, base, head}); full(plan); assert.equal(plan.trustedPolicy, false);
});
test('unknown base, shallow history and non-SHA ref inputs fail full with an explanation', t => {
  const f = fixture(t);
  for (const base of ['0'.repeat(40), 'main', '--help']) {
    const plan = classifyImpact({cwd: f.cwd, base, head: f.base}); full(plan); assert(plan.reasons.some(r => r.reason.includes('failed closed')));
  }
});
test('base-to-prospective-merge comparison includes target branch changes exactly once', t => {
  const f = fixture(t); const original = f.base;
  f.put('src/main.ts', 'changed on target'); const currentBase = f.commit();
  f.put('README.md', '# Changed by PR'); const prospective = f.commit();
  assert.equal(classifyImpact({cwd: f.cwd, base: currentBase, head: prospective}).mode, 'documentation');
  full(classifyImpact({cwd: f.cwd, base: original, head: prospective}));
});
test('empty range is full and cannot synthesize a narrow successful validation', t => {
  const f = fixture(t); full(classifyImpact({cwd: f.cwd, base: f.base, head: f.base}));
});

test('a base outside the proposed merge ancestry fails closed', t => {
  const f = fixture(t); f.put('README.md', '# Later'); const later = f.commit();
  const plan = classifyImpact({cwd: f.cwd, base: later, head: f.base}); full(plan);
  assert(plan.reasons.some(r => r.reason.includes('failed closed')));
});

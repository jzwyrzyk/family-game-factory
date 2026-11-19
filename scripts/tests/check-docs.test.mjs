import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { check, refresh, sourceDigest, matches, REGISTRY } from '../check-docs.mjs';

const now = new Date('2026-11-19T02:00:00.000Z');
const reason = 'Reviewed the changed fixture and confirmed the documented interface and observed behavior remain accurate.';
function put(root, path, contents) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), contents); }
function git(root, ...args) { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function commit(root) { git(root, 'add', '.'); git(root, 'commit', '-qm', 'fixture'); return git(root, 'rev-parse', 'HEAD'); }
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'jems-docs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Documentation tests');
  git(root, 'config', 'user.email', 'documentation@example.invalid');
  put(root, 'src/app.js', 'export const current = true;\n');
  put(root, 'scripts/policy.mjs', '// The context policy implementation.\n');
  put(root, 'GUIDE.md', '# Guide\n\n[Source](src/app.js).\n');
  const registry = {
    version: 1, coverageExcludes: ['*.md', 'docs/**'], requiredDocuments: ['GUIDE.md'], linkCheckPatterns: ['GUIDE.md'],
    areas: [
      { id: 'app', documents: ['GUIDE.md'], sources: ['src/**'], reviewAfterDays: 30, reviewedAt: now.toISOString(), sourceDigest: 'pending', reviewOutcome: 'updated', reviewReason: reason },
      { id: 'context', documents: ['GUIDE.md'], sources: ['scripts/**'], reviewAfterDays: 30, reviewedAt: now.toISOString(), sourceDigest: 'pending', reviewOutcome: 'updated', reviewReason: reason }
    ]
  };
  put(root, REGISTRY, JSON.stringify(registry));
  refresh(root, 'app', 'updated', reason, now);
  refresh(root, 'context', 'updated', reason, now);
  commit(root);
  return root;
}
const hasError = (result, pattern) => result.errors.some(message => pattern.test(message));

test('unchanged reviewed sources pass; precise glob routing has no prefix leak', t => {
  const root = fixture(t);
  assert.deepEqual(check(root, { now }).errors, []);
  assert.equal(matches('src/deep/app.js', 'src/**'), true);
  assert.equal(matches('src/app.js', 'src/*.js'), true);
  assert.equal(matches('src/deep/app.js', 'src/*.js'), false);
  assert.equal(matches('src/app.js', 'src/**/*.js'), true);
  assert.equal(matches('src/deep/app.js', 'src/**/*.js'), true);
  assert.equal(matches('README.md', '**/*.md'), true);
  assert.equal(matches('srcXappYjs', 'src.app.js'), false);
});

test('source edits, new files and removals invalidate review without changing dates', t => {
  const root = fixture(t);
  put(root, 'src/app.js', 'export const current = false;\n');
  assert.equal(hasError(check(root, { now }), /source content or routing changed/), true);
  refresh(root, 'app', 'unchanged', reason, now);
  assert.deepEqual(check(root, { now }).errors, []);
  put(root, 'src/new.js', 'new behavior');
  assert.equal(hasError(check(root, { now }), /source content or routing changed/), true);
  refresh(root, 'app', 'unchanged', reason, now);
  rmSync(join(root, 'src/new.js'));
  assert.equal(hasError(check(root, { now }), /source content or routing changed/), true);
});

test('new source outside all known roots fails instead of bypassing context review', t => {
  const root = fixture(t);
  put(root, 'new-service/main.py', 'print("new component")');
  assert.equal(hasError(check(root, { now }), /Unmapped source path: new-service\/main.py/), true);
});

test('missing canonical documents and broken relative links fail', t => {
  const root = fixture(t);
  put(root, 'GUIDE.md', '# Guide\n\n[Missing](src/missing.js)\n');
  assert.equal(hasError(check(root, { now }), /missing or out-of-repository local target/), true);
  rmSync(join(root, 'GUIDE.md'));
  assert.equal(hasError(check(root, { now }), /Required context document is missing/), true);
});

test('external links, anchors and code examples do not create false local-link failures', t => {
  const root = fixture(t);
  put(root, 'GUIDE.md', '# Guide\n\n[Web](https://example.invalid/file) [Heading](#guide)\n\n```md\n[Example](missing-file.md)\n```\n');
  assert.deepEqual(check(root, { now }).errors, []);
});

test('an updated review needs a changed routed document in the actual PR range', t => {
  const root = fixture(t);
  const base = git(root, 'rev-parse', 'HEAD');
  put(root, 'src/app.js', 'export const current = "new";\n');
  refresh(root, 'app', 'updated', reason, now);
  let head = commit(root);
  assert.equal(hasError(check(root, { base, head, now }), /no routed document changed/), true);
  put(root, 'GUIDE.md', '# Guide\n\nThe current flag now uses a named value. [Source](src/app.js).\n');
  head = commit(root);
  assert.deepEqual(check(root, { base, head, now }).errors, []);
});

test('a specific unchanged review supports changes with no documentation impact', t => {
  const root = fixture(t);
  const base = git(root, 'rev-parse', 'HEAD');
  put(root, 'src/app.js', '/* Internal simplification; interface is unchanged. */\nexport const current = true;\n');
  refresh(root, 'app', 'unchanged', reason, now);
  const head = commit(root);
  assert.deepEqual(check(root, { base, head, now }).errors, []);
});

test('prospective merge content is checked even when the PR head alone was reviewed', t => {
  const root = fixture(t);
  const base = git(root, 'rev-parse', 'HEAD');
  put(root, 'src/app.js', '/* Small refactor */\nexport const current = true;\n');
  refresh(root, 'app', 'unchanged', reason, now);
  const head = commit(root);
  assert.deepEqual(check(root, { base, head, now }).errors, []);
  // The workflow checks out the merge tree. This extra source models a main
  // change integrated into that tree, absent from the reviewed PR head.
  put(root, 'src/from-main.js', 'export const upstream = true;\n');
  assert.equal(hasError(check(root, { base, head, now }), /source content or routing changed/), true);
});

test('placeholder reasons and bulk refresh requests are rejected', t => {
  const root = fixture(t);
  assert.throws(() => refresh(root, 'app', 'unchanged', 'No impact', now), /specific review explanation/);
  assert.throws(() => refresh(root, 'app', 'unchanged', 'TODO explain here why there are no documentation changes needed', now), /specific review explanation/);
  assert.throws(() => refresh(root, 'all', 'unchanged', reason, now), /Unknown area/);
  assert.throws(() => refresh(root, 'app', 'approved', reason, now), /--outcome/);
});

test('old dates generate review reminders without unrelated merge failures', t => {
  const root = fixture(t);
  const result = check(root, { now: new Date('2026-12-21T02:00:00.000Z') });
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0], /last reviewed 32 days ago/);
});

test('invalid dates and excessive future review stamps fail', t => {
  const root = fixture(t);
  const registry = JSON.parse(readFileSync(join(root, REGISTRY), 'utf8'));
  registry.areas[0].reviewedAt = 'not-a-date';
  put(root, REGISTRY, JSON.stringify(registry));
  assert.equal(hasError(check(root, { now }), /reviewedAt needs an ISO/), true);
  registry.areas[0].reviewedAt = '2027-01-01T00:00:00.000Z';
  put(root, REGISTRY, JSON.stringify(registry));
  assert.equal(hasError(check(root, { now }), /timestamp is more than one day in the future/), true);
});

test('routing changes invalidate the fingerprint and unknown commit ranges fail closed', t => {
  const root = fixture(t);
  const registry = JSON.parse(readFileSync(join(root, REGISTRY), 'utf8'));
  const before = registry.areas[0].sourceDigest;
  registry.areas[0].sources.push('extra/**');
  assert.notEqual(sourceDigest(root, registry.areas[0]), before);
  put(root, REGISTRY, JSON.stringify(registry));
  assert.equal(hasError(check(root, { now }), /source content or routing changed/), true);
  assert.equal(hasError(check(root, { now, base: '0000001', head: '1111111' }), /Cannot inspect change range/), true);
  assert.equal(hasError(check(root, { now, base: git(root, 'rev-parse', 'HEAD') }), /Supply both --base and --head/), true);
});

test('removing a component and its complete area still requires context review', t => {
  const root = fixture(t);
  put(root, 'GUIDE.md', '# Guide\n\nThe application component is part of the system.\n');
  const registry = JSON.parse(readFileSync(join(root, REGISTRY), 'utf8'));
  rmSync(join(root, 'src/app.js'));
  registry.areas = registry.areas.filter(area => area.id !== 'app');
  put(root, REGISTRY, JSON.stringify(registry));
  assert.equal(hasError(check(root, { now }), /context: source content or routing changed/), true);
});

test('global coverage, required files, link scope and intervals are reviewed policy', t => {
  const root = fixture(t);
  const initial = readFileSync(join(root, REGISTRY), 'utf8');
  const changes = [
    registry => registry.coverageExcludes.push('another-area/**'),
    registry => { registry.requiredDocuments = []; },
    registry => { registry.linkCheckPatterns = []; },
    registry => { registry.areas[0].reviewAfterDays = 60; }
  ];
  for (const change of changes) {
    const registry = JSON.parse(initial);
    change(registry);
    put(root, REGISTRY, JSON.stringify(registry));
    assert.equal(hasError(check(root, { now }), /context: source content or routing changed/), true);
  }
});

test('the mandatory context policy area cannot itself disappear', t => {
  const root = fixture(t);
  const registry = JSON.parse(readFileSync(join(root, REGISTRY), 'utf8'));
  registry.areas = registry.areas.filter(area => area.id !== 'context');
  put(root, REGISTRY, JSON.stringify(registry));
  assert.equal(hasError(check(root, { now }), /context area is required/), true);
});

test('registry review fields cannot create a self-changing context digest', t => {
  const root = fixture(t);
  const registry = JSON.parse(readFileSync(join(root, REGISTRY), 'utf8'));
  registry.areas.find(area => area.id === 'context').sources.push('docs/**');
  put(root, REGISTRY, JSON.stringify(registry));
  const first = refresh(root, 'context', 'unchanged', reason, now).sourceDigest;
  assert.deepEqual(check(root, { now }).errors, []);
  const second = refresh(root, 'context', 'unchanged', 'Reviewed the registry source route again and confirmed review metadata is excluded from its stable policy digest.', now).sourceDigest;
  assert.equal(second, first);
  assert.deepEqual(check(root, { now }).errors, []);
});

test('other areas cannot route registry bytes into a self-referential fingerprint', t => {
  const root = fixture(t);
  const registry = JSON.parse(readFileSync(join(root, REGISTRY), 'utf8'));
  registry.areas.find(area => area.id === 'app').sources.push('docs/**');
  put(root, REGISTRY, JSON.stringify(registry));
  assert.equal(hasError(check(root, { now }), /source routes must not include docs\/context\/registry.json/), true);
  assert.throws(() => refresh(root, 'app', 'unchanged', reason, now), /source routes must not include/);
});

test('policy-only changes declaring updated require a changed context document', t => {
  const root = fixture(t);
  const base = git(root, 'rev-parse', 'HEAD');
  const registry = JSON.parse(readFileSync(join(root, REGISTRY), 'utf8'));
  registry.coverageExcludes.push('another-area/**');
  put(root, REGISTRY, JSON.stringify(registry));
  refresh(root, 'context', 'updated', reason, now);
  const head = commit(root);
  assert.equal(hasError(check(root, { now, base, head }), /context: review says updated, but no routed document changed/), true);
});

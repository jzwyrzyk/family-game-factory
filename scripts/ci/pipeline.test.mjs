import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expandCommands, parseCommand, readJSON, sha256, verifyCoverage } from './suites.mjs';
import { validateArchive, verifyBuildIdentity } from './build-artifact.mjs';
import { runCommands } from './run-suite.mjs';
import { verifyAggregate, validatePlan } from './aggregate.mjs';

const manifestBytes = fs.readFileSync(new URL('./suites.json', import.meta.url));
const manifest = JSON.parse(manifestBytes);
const pkg = readJSON(new URL('../../package.json', import.meta.url));
const identity = { sourceSha: 'a'.repeat(40), manifestSha256: sha256(manifestBytes), buildSha256: 'b'.repeat(64), runId: '123', runAttempt: '1', eventName: 'pull_request' };
const plan = { schemaVersion: 1, head: identity.sourceSha, manifestSha256: identity.manifestSha256, runId: '123', runAttempt: '1', mode: 'full', requiredShards: Object.keys(manifest.shards), requiredImage: true, requiredOperations: true, requiredDocumentation: true };
const receipts = Object.entries(manifest.shards).map(([shard, spec]) => ({ schemaVersion: 1, shard, group: spec.group, sourceSha: identity.sourceSha, manifestSha256: identity.manifestSha256, buildSha256: identity.buildSha256, runId: '123', runAttempt: '1', status: 'success', commands: expandCommands(spec.commands, pkg.scripts).map(command => ({ command, seconds: 1, exitCode: 0 })) }));
const input = { group: 'creative', plan, manifest, packageJSON: pkg, receipts, identity, prepareResult: 'success', shardsResult: 'success', imageResult: 'success' };

test('all original Arcade leaf commands occur exactly once in their original required group', () => {
  assert.deepEqual(verifyCoverage(manifest, pkg), { notifications: 2, browser: 19, learning: 12, creative: 63 });
  for (const mutation of [m => m.shards.mining.commands.pop(), m => m.shards.factory.commands.push('node tests/mind-your-jems-browser.cjs')]) {
    const changed = structuredClone(manifest); mutation(changed);
    assert.throws(() => verifyCoverage(changed, pkg), /CI_COVERAGE_MISMATCH/);
  }
  const changed = structuredClone(pkg); changed.scripts.test += ' && node tests/new-required.cjs';
  assert.throws(() => verifyCoverage(manifest, changed), /CI_NPM_TEST_COVERAGE_MISMATCH/);
});

test('argv parser rejects executable shell expansion; hooks and recursive scripts require review', () => {
  assert.deepEqual(parseCommand('python3 -p "test_*.py"'), ['python3', '-p', 'test_*.py']);
  for (const command of ['node x; true', 'node $(x)', 'node `x`', 'node x\ntrue', 'node "unclosed']) assert.throws(() => parseCommand(command));
  assert.throws(() => expandCommands(['npm run test:x'], { 'test:x': 'npm run test:x' }));
  assert.throws(() => expandCommands(['npm run test:x'], { 'test:x': 'node x', 'pretest:x': 'node before' }));
});

test('failed commands remain failures while independent remaining commands still run once', () => {
  let calls = 0;
  const result = runCommands([['node', 'first'], ['node', 'second']], () => ({ status: ++calls === 1 ? 9 : 0 }));
  assert.deepEqual(result.map(c => c.exitCode), [9, 0]);
  assert.equal(calls, 2);
});

test('aggregate accepts complete successful receipts and rejects every false-pass state', () => {
  assert.equal(verifyAggregate(input).requiredShards.length, 7);
  const mutations = [
    x => x.receipts.splice(x.receipts.findIndex(r => r.shard === 'mining'), 1),
    x => x.receipts.push(x.receipts.find(r => r.shard === 'mining')),
    x => { x.receipts.find(r => r.shard === 'mining').status = 'cancelled'; },
    x => { x.receipts.find(r => r.shard === 'mining').commands[0].exitCode = 1; },
    x => { x.receipts.find(r => r.shard === 'mining').commands = []; },
    x => { x.receipts.find(r => r.shard === 'mining').runAttempt = '2'; },
    x => { x.receipts.find(r => r.shard === 'mining').sourceSha = 'c'.repeat(40); },
    x => { x.receipts.find(r => r.shard === 'mining').buildSha256 = 'c'.repeat(64); },
    x => { x.shardsResult = 'skipped'; },
    x => { x.shardsResult = 'cancelled'; },
    x => { x.prepareResult = 'failure'; },
    x => { x.plan.requiredShards = []; },
    x => { x.plan.requiredDocumentation = false; }
  ];
  for (const mutate of mutations) { const changed = structuredClone(input); mutate(changed); assert.throws(() => verifyAggregate(changed)); }
});

test('only authenticated base PR plans may narrow; main and dispatch always full', () => {
  const narrowed = { ...plan, mode: 'documentation', requiredShards: [], requiredImage: false, selectionAuthority: 'trusted-base' };
  assert.equal(validatePlan(narrowed, manifest, identity).mode, 'documentation');
  for (const eventName of ['push', 'workflow_dispatch']) assert.throws(() => validatePlan(narrowed, manifest, { ...identity, eventName }), /CI_NON_PR_MUST_RUN_FULL/);
  assert.throws(() => validatePlan({ ...narrowed, selectionAuthority: 'candidate' }, manifest, identity), /CI_UNTRUSTED_NARROWING/);
  assert.throws(() => verifyAggregate({ ...input, group: 'private-coach-image', imageResult: 'skipped' }), /CI_IMAGE_RESULT_INVALID/);
});

test('shared build identity invalidates changed source, tree, dependencies and artifact bytes', () => {
  const build = { schemaVersion: 1, sourceSha: 'a', sourceTree: 'b', lockSha256: 'c', archiveSha256: 'd' };
  verifyBuildIdentity(build, build);
  for (const key of ['sourceSha', 'sourceTree', 'lockSha256', 'archiveSha256']) assert.throws(() => verifyBuildIdentity({ ...build, [key]: 'wrong' }, build));
});

test('authenticated TAR still rejects links, traversal, devices and duplicate members before extraction', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jems-tar-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const mode of ['valid', 'symlink', 'hardlink', 'traversal', 'absolute', 'fifo', 'duplicate']) {
    const file = path.join(dir, `${mode}.tar`);
    execFileSync('python3', ['-c', `
import io,sys,tarfile
with tarfile.open(sys.argv[1], 'w') as archive:
    for name in ['dist/index.html', 'dist/build-info.json']:
        item=tarfile.TarInfo(name); item.size=2; archive.addfile(item, io.BytesIO(b'{}'))
    mode=sys.argv[2]
    if mode!='valid':
        item=tarfile.TarInfo({'traversal':'dist/../escape', 'absolute':'/escape', 'duplicate':'dist/index.html'}.get(mode,'dist/unsafe'))
        if mode in ['symlink','hardlink']:
            item.type=tarfile.SYMTYPE if mode=='symlink' else tarfile.LNKTYPE; item.linkname='../outside'
        if mode=='fifo': item.type=tarfile.FIFOTYPE
        archive.addfile(item)
`, file, mode]);
    if (mode === 'valid') validateArchive(file);
    else assert.throws(() => validateArchive(file));
  }
});

test('workflow adapter actually executes base policy, bootstraps full and never narrows main', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jems-plan-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q'); git('config', 'user.name', 'CI fixture'); git('config', 'user.email', 'ci@example.invalid');
  fs.mkdirSync(path.join(dir, 'scripts/ci'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'scripts/ci/suites.json'), manifestBytes);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
  fs.writeFileSync(path.join(dir, 'README.md'), 'Initial documentation\n');
  git('add', '.'); git('commit', '-qm', 'Pre-policy base');
  const bootstrapBase = git('rev-parse', 'HEAD');
  fs.copyFileSync(new URL('./classify-impact.mjs', import.meta.url), path.join(dir, 'scripts/ci/classify-impact.mjs'));
  git('add', '.'); git('commit', '-qm', 'Install reviewed policy');
  const base = git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(dir, 'README.md'), 'Updated documentation\n');
  git('add', '.'); git('commit', '-qm', 'Documentation edit');
  const head = git('rev-parse', 'HEAD');
  const run = (sourceBase, event = 'pull_request') => JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL('./prepare-plan.mjs', import.meta.url))], { cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_SHA: head, GITHUB_EVENT_NAME: event, CI_BASE_SHA: sourceBase, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '', CI_FORCE_FULL: 'false' } }));
  const narrow = run(base);
  assert.equal(narrow.mode, 'documentation');
  assert.equal(narrow.selectionAuthority, 'trusted-base');
  assert.deepEqual(narrow.requiredShards, []);
  assert.equal(run(bootstrapBase).mode, 'full');
  assert.equal(run(base, 'push').requiredShards.length, Object.keys(manifest.shards).length);
  fs.writeFileSync(path.join(dir, 'scripts/ci/classify-impact.mjs'), 'throw new Error("PR classifier must not execute");');
  git('add', '.'); git('commit', '-qm', 'Untrusted classifier edit');
  const result = JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL('./prepare-plan.mjs', import.meta.url))], { cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_SHA: git('rev-parse', 'HEAD'), GITHUB_EVENT_NAME: 'pull_request', CI_BASE_SHA: base, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '', CI_FORCE_FULL: 'false' } }));
  assert.equal(result.mode, 'full');
});

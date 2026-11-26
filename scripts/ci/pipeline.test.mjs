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
import { verifyAggregate, validatePlan, parsePreparedPlan } from './aggregate.mjs';
import { MAIN_REUSE_POLICY, mainReuseContext, validateReuseSummary } from './prepare-plan.mjs';

const manifestBytes = fs.readFileSync(new URL('./suites.json', import.meta.url));
const manifest = JSON.parse(manifestBytes);
const pkg = readJSON(new URL('../../package.json', import.meta.url));
const identity = { sourceSha: 'a'.repeat(40), manifestSha256: sha256(manifestBytes), buildSha256: 'b'.repeat(64), runId: '123', runAttempt: '1', eventName: 'pull_request' };
const plan = { schemaVersion: 1, sourceEvent: 'pull_request', head: identity.sourceSha, manifestSha256: identity.manifestSha256, runId: '123', runAttempt: '1', mode: 'full', requiredShards: Object.keys(manifest.shards), requiredImage: true, requiredOperations: true, requiredDocumentation: true };
const receipts = Object.entries(manifest.shards).map(([shard, spec]) => ({ schemaVersion: 1, shard, group: spec.group, sourceSha: identity.sourceSha, manifestSha256: identity.manifestSha256, buildSha256: identity.buildSha256, runId: '123', runAttempt: '1', status: 'success', commands: expandCommands(spec.commands, pkg.scripts).map(command => ({ command, seconds: 1, exitCode: 0 })) }));
const input = { group: 'creative', plan, manifest, packageJSON: pkg, receipts, identity, prepareResult: 'success', shardsResult: 'success', imageResult: 'success' };

test('aggregates reject replaced or self-claimed plan bytes before parsing', () => {
  const bytes = Buffer.from(JSON.stringify(plan));
  assert.equal(parsePreparedPlan(bytes, sha256(bytes)).runId, plan.runId);
  for (const digest of [undefined, '', '0'.repeat(64), 'not-a-digest']) {
    assert.throws(() => parsePreparedPlan(bytes, digest), /CI_PLAN_DIGEST_MISMATCH/);
  }
  const forged = Buffer.from(JSON.stringify({ ...plan, mode: 'documentation', requiredShards: [], requiredImage: false }));
  assert.throws(() => parsePreparedPlan(forged, sha256(bytes)), /CI_PLAN_DIGEST_MISMATCH/);
  assert.throws(() => parsePreparedPlan(Buffer.from('{malformed'), sha256(bytes)), /CI_PLAN_DIGEST_MISMATCH/);
});

test('all original Arcade leaf commands occur exactly once in their original required group', () => {
  assert.deepEqual(verifyCoverage(manifest, pkg), { notifications: 2, browser: 47, learning: 12, creative: 71 });
  const covered = Object.values(manifest.shards).flatMap(shard => expandCommands(shard.commands, pkg.scripts));
  for (const file of ['tests/game-art-security.cjs', 'tests/game-art-browser.cjs', 'tests/drawing-workspace-browser.cjs']) {
    assert.equal(covered.filter(argv => argv.includes(file)).length, 1, file);
  }
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

test('PR narrowing requires base policy; non-PR narrowing without protected-main evidence fails', () => {
  const narrowed = { ...plan, mode: 'documentation', requiredShards: [], requiredImage: false, selectionAuthority: 'trusted-base', trustedPolicy: true };
  assert.equal(validatePlan(narrowed, manifest, identity).mode, 'documentation');
  for (const eventName of ['push', 'workflow_dispatch']) assert.throws(() => validatePlan({ ...narrowed, sourceEvent: eventName }, manifest, { ...identity, eventName }), /CI_NON_PR_REUSE_NOT_VERIFIED/);
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

test('workflow adapter executes base policy, bootstraps full and keeps unopted main full', t => {
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

function reuseSummary(candidateSha = identity.sourceSha, sourceSha = 'c'.repeat(40)) {
  return {reusable: true, scope: 'ci-fixtures-full-regression', candidateSha, sourceSha, runId: 456, runAttempt: 1,
    buildSha256: 'sha256:' + 'd'.repeat(64), receiptArtifactId: 111, buildArtifactId: 222,
    receiptArchiveSha256: 'sha256:' + 'e'.repeat(64), buildArchiveSha256: 'sha256:' + 'f'.repeat(64),
    validationSha256: 'sha256:' + 'a'.repeat(64), manifestSha256: 'sha256:' + identity.manifestSha256,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(), firstAttemptPassed: true, releaseAuthorized: false};
}

const mainEnv = {
  CI_MAIN_REUSE_POLICY: MAIN_REUSE_POLICY, GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main',
  GITHUB_REF_PROTECTED: 'true', GITHUB_REPOSITORY: 'jzwyrzyk/family-game-factory',
  GITHUB_WORKFLOW_REF: 'jzwyrzyk/family-game-factory/.github/workflows/test.yml@refs/heads/main',
};
const pushEvent = {before: 'c'.repeat(40), after: identity.sourceSha, ref: 'refs/heads/main',
  repository: {full_name: 'jzwyrzyk/family-game-factory'}, created: false, deleted: false, forced: false};

test('main reuse requires literal opt-in, protected main and the exact trusted push predecessor', () => {
  assert.equal(mainReuseContext(mainEnv, pushEvent, identity.sourceSha).base, pushEvent.before);
  for (const field of Object.keys(mainEnv)) {
    assert.equal(mainReuseContext({...mainEnv, [field]: 'invalid'}, pushEvent, identity.sourceSha), null, field);
  }
  for (const mutate of [e => {e.before = '0'.repeat(40);}, e => {e.before = 'main';}, e => {e.before = e.after;},
    e => {e.after = 'd'.repeat(40);}, e => {e.ref = 'refs/heads/feature';}, e => {e.repository.full_name = 'fork/repo';},
    e => {e.forced = true;}, e => {e.created = true;}, e => {e.deleted = true;}]) {
    const changed = structuredClone(pushEvent); mutate(changed);
    assert.equal(mainReuseContext(mainEnv, changed, identity.sourceSha), null);
  }
  assert.equal(mainReuseContext(mainEnv, null, identity.sourceSha), null);
});

test('main aggregates require authentic reuse even for documentation and never mint new gameplay coverage', () => {
  const context = mainReuseContext(mainEnv, pushEvent, identity.sourceSha);
  const mainIdentity = {...identity, eventName: 'push', mainReuseContext: context};
  const narrowed = {...plan, base: pushEvent.before, sourceEvent: 'push', mode: 'documentation', requiredShards: [], requiredImage: false,
    selectionAuthority: 'trusted-base', trustedPolicy: true, mainReuse: context, requiresEvidenceReuse: true,
    reusedEvidence: reuseSummary()};
  assert.equal(validatePlan(narrowed, manifest, mainIdentity).requiredShards.length, 0);
  assert.equal(verifyAggregate({...input, plan: narrowed, identity: mainIdentity, receipts: [], shardsResult: 'skipped', imageResult: 'skipped'}).requiredShards.length, 0);
  assert.equal(verifyAggregate({...input, group: 'private-coach-image', plan: narrowed, identity: mainIdentity, receipts: [], shardsResult: 'skipped', imageResult: 'skipped'}).required, false);
  for (const mutate of [p => {delete p.reusedEvidence;}, p => {p.reusedEvidence.reusable = false;},
    p => {p.reusedEvidence.candidateSha = 'd'.repeat(40);}, p => {p.requiresEvidenceReuse = false;},
    p => {p.mode = 'targeted';}, p => {p.base = 'd'.repeat(40);}, p => {p.mainReuse.policy = 'invented';},
    p => {p.trustedPolicy = false;}, p => {p.sourceEvent = 'pull_request';}, p => {p.requiredImage = true;},
    p => {p.requiredShards = ['mining'];}]) {
    const changed = structuredClone(narrowed); mutate(changed); assert.throws(() => validatePlan(changed, manifest, mainIdentity));
  }
  for (const mainReuseContext of [null, {...context, base: 'd'.repeat(40)}, {...context, head: 'd'.repeat(40)}]) {
    assert.throws(() => validatePlan(narrowed, manifest, {...mainIdentity, mainReuseContext}));
  }
  assert.throws(() => verifyAggregate({...input, plan: narrowed, identity: mainIdentity, receipts: [], shardsResult: 'skipped', imageResult: 'skipped', prepareResult: 'failure'}), /CI_PREPARATION_NOT_SUCCESSFUL/);
});

test('protected-main adapter authenticates the predecessor policy and falls back on every missing evidence path', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jems-main-reuse-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const git = (...args) => execFileSync('git', args, {cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  const put = (name, value) => {const target = path.join(dir, name); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, value);};
  git('init', '-q'); git('config', 'user.name', 'CI fixture'); git('config', 'user.email', 'ci@example.invalid');
  put('scripts/ci/suites.json', manifestBytes); put('package.json', JSON.stringify(pkg));
  put('scripts/ci/classify-impact.mjs', fs.readFileSync(new URL('./classify-impact.mjs', import.meta.url)));
  put('scripts/ci/suites.mjs', fs.readFileSync(new URL('./suites.mjs', import.meta.url)));
  // Synthetic verifier isolates orchestration. Its real source/identity/API,
  // archive and negative checks live in validation-evidence.test.mjs.
  put('scripts/ci/validation-evidence.mjs', `import fs from 'node:fs';
    const args=process.argv.slice(2); const option=k=>args[args.indexOf(k)+1];
    const reusable=process.env.TEST_EVIDENCE_RESULT==='valid';
    const proof=${JSON.stringify(reuseSummary())};
    fs.writeFileSync(option('--output'),JSON.stringify({...proof,reusable,candidateSha:option('--head'),sourceSha:option('--base')}));
    if(!reusable)process.exitCode=1;
  `);
  put('DELIVERY-STATE.md', '# Receipt one\n');
  git('add', '.'); git('commit', '-qm', 'Reviewed predecessor policy');
  const base = git('rev-parse', 'HEAD');
  put('DELIVERY-STATE.md', '# Receipt two\n'); git('add', '.'); git('commit', '-qm', 'Narrative only');
  const head = git('rev-parse', 'HEAD');
  const eventFile = path.join(dir, 'push-event.json');
  const event = {...pushEvent, before: base, after: head};
  fs.writeFileSync(eventFile, JSON.stringify(event));
  const run = (overrides = {}) => JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL('./prepare-plan.mjs', import.meta.url))], {
    cwd: dir, encoding: 'utf8', env: {...process.env, ...mainEnv, GITHUB_SHA: head,
      GITHUB_EVENT_PATH: eventFile, CI_BASE_SHA: 'e'.repeat(40), GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1',
      GITHUB_OUTPUT: path.join(dir, 'prepare-output.txt'), GITHUB_STEP_SUMMARY: '', CI_FORCE_FULL: 'false', TEST_EVIDENCE_RESULT: 'valid', ...overrides},
  }));
  const reused = run(); assert.equal(reused.mode, 'documentation'); assert.equal(reused.base, base);
  const emittedDigest = /^plan-digest=(.+)$/m.exec(fs.readFileSync(path.join(dir, 'prepare-output.txt'), 'utf8'))?.[1];
  assert.equal(emittedDigest, sha256(fs.readFileSync(path.join(dir, 'ci-plan.json'))));
  assert.equal(reused.sourceEvent, 'push'); assert.equal(reused.mainReuse.base, base); assert.equal(reused.requiresEvidenceReuse, true);
  assert.equal(reused.reusedEvidence.candidateSha, head); assert.deepEqual(reused.requiredShards, []);
  assert.equal(run({TEST_EVIDENCE_RESULT: 'invalid'}).mode, 'full');
  assert.equal(run({CI_FORCE_FULL: 'true'}).mode, 'full');
  assert.equal(run({CI_MAIN_REUSE_POLICY: ''}).mode, 'full');
  assert.equal(run({GITHUB_EVENT_NAME: 'workflow_dispatch'}).mode, 'full');
  assert.equal(run({GITHUB_REF_PROTECTED: 'false'}).mode, 'full');
  fs.writeFileSync(eventFile, JSON.stringify({...event, before: 'f'.repeat(40)}));
  assert.equal(run().mode, 'full');
  fs.writeFileSync(eventFile, 'malformed'); assert.equal(run().mode, 'full');
  fs.writeFileSync(eventFile, JSON.stringify(event));
  put('scripts/ci/classify-impact.mjs', 'throw new Error("Candidate policy must not execute");');
  git('add', 'scripts/ci/classify-impact.mjs'); git('commit', '-qm', 'Untrusted policy edit');
  const changedHead = git('rev-parse', 'HEAD'); fs.writeFileSync(eventFile, JSON.stringify({...event, after: changedHead}));
  assert.equal(run({GITHUB_SHA: changedHead}).mode, 'full');
});

test('aggregates authenticate exact plan bytes from the preparation output before parsing', () => {
  const bytes = Buffer.from(JSON.stringify({...plan, reusedEvidence: reuseSummary()}));
  assert.equal(parsePreparedPlan(bytes, sha256(bytes)).runId, plan.runId);
  for (const digest of [undefined, '', 'a'.repeat(64), 'sha256:' + sha256(bytes)]) {
    assert.throws(() => parsePreparedPlan(bytes, digest), /CI_PLAN_DIGEST_MISMATCH/);
  }
  const altered = Buffer.from(bytes.toString().replace('"reusable":true', '"reusable":false'));
  assert.throws(() => parsePreparedPlan(altered, sha256(bytes)), /CI_PLAN_DIGEST_MISMATCH/);
  assert.throws(() => parsePreparedPlan(Buffer.from('{malformed'), sha256(bytes)), /CI_PLAN_DIGEST_MISMATCH/);
});

test('a reuse boolean is insufficient without bounded authenticated source and artifact proof', () => {
  const proof = reuseSummary();
  validateReuseSummary(proof, identity.sourceSha, identity.manifestSha256, identity.runId);
  assert.throws(() => validateReuseSummary({reusable: true, candidateSha: identity.sourceSha}, identity.sourceSha, identity.manifestSha256, identity.runId), /CI_REUSE_PROOF_INVALID/);
  for (const mutate of [p => {delete p.sourceSha;}, p => {p.runId = Number(identity.runId);}, p => {p.runAttempt = 2;},
    p => {p.receiptArtifactId = p.buildArtifactId;}, p => {p.buildArtifactId = -1;}, p => {p.receiptArchiveSha256 = 'invented';},
    p => {delete p.buildArchiveSha256;}, p => {delete p.validationSha256;}, p => {p.buildSha256 = 'invented';},
    p => {p.manifestSha256 = 'sha256:' + '0'.repeat(64);}, p => {p.expiresAt = new Date(0).toISOString();},
    p => {p.expiresAt = new Date(Date.now() + 8 * 86_400_000).toISOString();}, p => {p.scope = 'self-asserted';},
    p => {p.releaseAuthorized = true;}, p => {p.firstAttemptPassed = false;}]) {
    const changed = structuredClone(proof); mutate(changed);
    assert.throws(() => validateReuseSummary(changed, identity.sourceSha, identity.manifestSha256, identity.runId), /CI_REUSE_PROOF_INVALID/);
  }
});

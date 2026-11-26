import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changedFiles, selectChecks } from './check-changed.mjs';

test('editing includes committed, staged, deleted, renamed and untracked paths', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'jems-edit-'));
  t.after(() => rmSync(cwd, {recursive: true, force: true}));
  const git = (...args) => execFileSync('git', args, {cwd, encoding: 'utf8'}).trim();
  const write = (name, text) => writeFileSync(join(cwd, name), text);
  git('init', '-q'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Fixture');
  write('one', 'old'); write('before', 'rename'); write('gone', 'removed');
  git('add', '.'); git('commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD');
  git('mv', 'before', 'after'); git('commit', '-qm', 'move');
  write('one', 'staged'); git('add', 'one'); write('one', 'old');
  rmSync(join(cwd, 'gone')); write('new file', 'untracked');
  assert.deepEqual(changedFiles(base, cwd), ['after', 'before', 'gone', 'new file', 'one']);
});

test('requested domains add coverage and cannot hide shared changes', () => {
  assert.deepEqual(selectChecks(['AGENTS.md']).commands, ['docs:check']);
  const isolated = selectChecks(['src/language/activity.css'], [], () => true);
  assert.deepEqual(isolated.commands, ['build', 'test:language-ui', 'test:language-integration']);
  assert.ok(selectChecks(['src/main.ts'], ['coding']).full);
  assert.ok(selectChecks(['src/language/activity.css'], [], () => false).full);
  assert.ok(selectChecks(['server/trusted-devices.ts'], ['english']).commands.includes('test:sandbox'));
  assert.throws(() => selectChecks([], ['invented']));
});

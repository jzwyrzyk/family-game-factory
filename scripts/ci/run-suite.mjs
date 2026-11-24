import fs from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { expandCommands, readJSON, sha256, verifyCoverage } from './suites.mjs';

export function runCommands(commands, run = argv => spawnSync(argv[0], argv.slice(1), { stdio: 'inherit', timeout: 12 * 60_000 })) {
  const results = [];
  for (const argv of commands) {
    const started = performance.now();
    console.log(`::group::${argv.join(' ')}`);
    const result = run(argv);
    const entry = { command: argv, seconds: Math.round((performance.now() - started) / 10) / 100, exitCode: Number.isInteger(result.status) ? result.status : 1 };
    results.push(entry);
    console.log(`::endgroup::\nCI_SUITE_RESULT ${JSON.stringify(entry)}`);
  }
  return results;
}

export function main(shardId) {
  const manifestBytes = fs.readFileSync('scripts/ci/suites.json');
  const manifest = JSON.parse(manifestBytes);
  const pkg = readJSON('package.json');
  verifyCoverage(manifest, pkg);
  const shard = shardId === 'legacy-creative' ? { group: 'creative-shadow', commands: manifest.legacyGroups.creative } : manifest.shards[shardId];
  if (!shard) throw new Error('CI_UNKNOWN_SHARD');
  const build = readJSON('ci-build.json');
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (sourceSha !== build.sourceSha || build.archiveSha256 !== process.env.CI_BUILD_DIGEST) throw new Error('CI_BUILD_SOURCE_MISMATCH');
  const startedAt = new Date().toISOString();
  fs.mkdirSync('test-results/ci', { recursive: true });
  const commands = runCommands(expandCommands(shard.commands, pkg.scripts));
  const receipt = { schemaVersion: 1, shard: shardId, group: shard.group, sourceSha, sourceTree: build.sourceTree, manifestSha256: sha256(manifestBytes), buildSha256: build.archiveSha256, runId: process.env.GITHUB_RUN_ID || 'local', runAttempt: process.env.GITHUB_RUN_ATTEMPT || '1', startedAt, finishedAt: new Date().toISOString(), commands, status: commands.every(c => c.exitCode === 0) ? 'success' : 'failure' };
  fs.writeFileSync(`test-results/ci/${shardId}.json`, JSON.stringify(receipt, null, 2) + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${shardId}: ${receipt.status}\n\n| Command | Seconds | Exit |\n| --- | ---: | ---: |\n${commands.map(c => `| \`${c.command.join(' ')}\` | ${c.seconds} | ${c.exitCode} |`).join('\n')}\n\nSource: \`${sourceSha}\`; build: \`${build.archiveSha256}\`. No automatic test retries.\n`);
  return receipt.status === 'success' ? 0 : 1;
}

if (process.argv[1]?.endsWith('/run-suite.mjs')) process.exitCode = main(process.argv[2]);

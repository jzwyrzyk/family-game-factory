import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readJSON, sha256 } from './suites.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

export function verifyBuildIdentity(manifest, expected) {
  for (const key of ['sourceSha', 'sourceTree', 'lockSha256', 'archiveSha256']) {
    if (manifest[key] !== expected[key]) throw new Error(`CI_BUILD_IDENTITY_MISMATCH:${key}`);
  }
  if (manifest.schemaVersion !== 1) throw new Error('CI_BUILD_SCHEMA_INVALID');
}

function sourceIdentity() {
  const sourceSha = git('rev-parse', 'HEAD');
  if (process.env.GITHUB_SHA && sourceSha !== process.env.GITHUB_SHA) throw new Error('CI_SOURCE_MISMATCH');
  if (git('status', '--porcelain', '--untracked-files=no')) throw new Error('CI_DIRTY_SOURCE');
  return { sourceSha, sourceTree: git('rev-parse', 'HEAD^{tree}'), lockSha256: sha256(fs.readFileSync('package-lock.json')) };
}

function checkBuildInfo(sourceSha) {
  const info = readJSON('dist/build-info.json');
  if (info.sha !== sourceSha || info.dirty !== false || !fs.existsSync('dist/index.html')) throw new Error('CI_BUILD_SOURCE_MISMATCH');
}

export function validateArchive(file) {
  // Inspect structured TAR metadata before extraction. A digest authenticates
  // bytes; it does not make links, device nodes or traversal safe to extract.
  execFileSync('python3', ['-c', `
import pathlib, sys, tarfile
with tarfile.open(sys.argv[1], 'r:') as archive:
    seen, size = set(), 0
    for member in archive:
        name = member.name.rstrip('/')
        path = pathlib.PurePosixPath(name)
        if (not name or name in seen or len(seen) >= 10000 or path.is_absolute()
            or '..' in path.parts or name != str(path)
            or any(ord(c) < 32 for c in name) or chr(92) in name
            or not (name == 'dist' or name.startswith('dist/'))
            or not (member.isfile() or member.isdir()) or member.size < 0):
            raise SystemExit('CI_BUILD_ARCHIVE_MEMBER_INVALID')
        seen.add(name)
        size += member.size
        if size > 512 * 1024 * 1024:
            raise SystemExit('CI_BUILD_ARCHIVE_SIZE_INVALID')
    if not {'dist/index.html', 'dist/build-info.json'} <= seen:
        raise SystemExit('CI_BUILD_ARCHIVE_INCOMPLETE')
`, file], { stdio: ['ignore', 'pipe', 'pipe'] });
}

export function main(mode) {
  const identity = sourceIdentity();
  if (mode === 'pack') {
    checkBuildInfo(identity.sourceSha);
    execFileSync('tar', ['-cf', 'ci-build.tar', 'dist']);
    const manifest = { schemaVersion: 1, ...identity, archiveSha256: sha256(fs.readFileSync('ci-build.tar')) };
    fs.writeFileSync('ci-build.json', JSON.stringify(manifest, null, 2) + '\n');
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `digest=${manifest.archiveSha256}\n`);
    return manifest;
  }
  if (mode !== 'verify') throw new Error('CI_BUILD_MODE_INVALID');
  const archiveSha256 = sha256(fs.readFileSync('ci-build.tar'));
  if (!/^[a-f0-9]{64}$/.test(process.env.CI_BUILD_DIGEST || '') || archiveSha256 !== process.env.CI_BUILD_DIGEST) throw new Error('CI_BUILD_DIGEST_MISMATCH');
  const manifest = readJSON('ci-build.json');
  verifyBuildIdentity(manifest, { ...identity, archiveSha256 });
  validateArchive('ci-build.tar');
  fs.rmSync('dist', { recursive: true, force: true });
  execFileSync('tar', ['-xf', 'ci-build.tar', '--no-same-owner']);
  checkBuildInfo(identity.sourceSha);
  return manifest;
}

if (process.argv[1]?.endsWith('/build-artifact.mjs')) console.log(JSON.stringify(main(process.argv[2])));

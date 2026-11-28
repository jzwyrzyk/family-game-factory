import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {lstat, readFile, readdir, readlink, writeFile} from 'node:fs/promises';
import path from 'node:path';

export const PREVIEW_REPOSITORY = 'jzwyrzyk/family-game-factory';
export const PREVIEW_MANIFEST = 'jems-preview.json';
export const DISCONNECTED_CONFIG = Object.freeze({version: 1, mode: 'unavailable'});
export const PREVIEW_LIMITS = Object.freeze({files: 12000, totalBytes: 512 * 1024 * 1024, fileBytes: 32 * 1024 * 1024});

export interface PreviewSource {
  repository: typeof PREVIEW_REPOSITORY;
  sha: string;
  treeSha: string;
  dirty: boolean;
  workingTreeSha256: string;
}

export interface PreviewFile {path: string; bytes: number; sha256: string}
export interface PreviewManifest {
  version: 1;
  kind: 'jems-static-preview';
  environment: 'preview';
  backendPolicy: 'disconnected';
  source: PreviewSource;
  pr: number | null;
  runId: string | null;
  builtAt: string;
  artifact: {sha256: string; fileCount: number; totalBytes: number; files: PreviewFile[]};
}

const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const sha = /^[0-9a-f]{40}$/;
const digest = /^[0-9a-f]{64}$/;
const allowedExtensions = new Set(['.html','.js','.css','.json','.webmanifest','.svg','.png','.webp','.jpg','.jpeg','.gif','.ico','.woff','.woff2','.ttf','.mp3','.wav','.ogg','.mp4','.webm','.txt','.md']);

function git(root: string, args: string[]): Buffer {
  return execFileSync('git', ['-C', root, ...args], {maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']});
}

/** Identify actual working bytes, including untracked files, without writing Git's index. */
export async function previewSource(root: string): Promise<PreviewSource> {
  const commit = git(root, ['rev-parse', 'HEAD']).toString().trim();
  const treeSha = git(root, ['rev-parse', 'HEAD^{tree}']).toString().trim();
  if (!sha.test(commit) || !sha.test(treeSha)) throw Error('PREVIEW_SOURCE_INVALID');
  if (git(root, ['ls-files', '--unmerged']).length) throw Error('PREVIEW_SOURCE_UNMERGED');
  const changed = git(root, ['diff', '--name-only', '-z', '--no-renames', '--no-ext-diff', '--no-textconv', 'HEAD', '--']).toString().split('\0');
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z']).toString().split('\0');
  const hash = createHash('sha256').update(treeSha).update('\0');
  for (const relative of [...new Set([...changed, ...untracked].filter(Boolean))].sort()) {
    const file = path.resolve(root, relative);
    if (!file.startsWith(path.resolve(root) + path.sep)) throw Error('PREVIEW_SOURCE_PATH_INVALID');
    hash.update(relative).update('\0');
    try {
      const stat = await lstat(file);
      if (stat.isSymbolicLink()) hash.update('symlink\0').update(await readlink(file));
      else if (stat.isFile()) hash.update((stat.mode & 0o111) ? 'executable\0' : 'file\0').update(await readFile(file));
      else throw Error('PREVIEW_SOURCE_TYPE_INVALID');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') hash.update('deleted');
      else throw error;
    }
    hash.update('\0');
  }
  return {repository: PREVIEW_REPOSITORY, sha: commit, treeSha, dirty: git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']).length > 0, workingTreeSha256: hash.digest('hex')};
}

export function assertPreviewSource(value: unknown): asserts value is PreviewSource {
  const source = value as PreviewSource;
  if (!source || source.repository !== PREVIEW_REPOSITORY || !sha.test(source.sha) || !sha.test(source.treeSha) || typeof source.dirty !== 'boolean' || !digest.test(source.workingTreeSha256)) throw Error('PREVIEW_SOURCE_INVALID');
}

export function assertDisconnectedConfig(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('PREVIEW_REMOTE_CONFIGURATION_REJECTED');
  const config = value as Record<string, unknown>;
  if (Object.keys(config).sort().join(',') !== 'mode,version' || config.version !== 1 || config.mode !== 'unavailable') throw Error('PREVIEW_REMOTE_CONFIGURATION_REJECTED');
}

export function previewPort(root: string): number {
  // Stable for this checkout; never silently switch origins and strand saved local work.
  return 43000 + (Number.parseInt(sha256(path.resolve(root)).slice(0, 8), 16) % 1000);
}

export function previewHeaders(websocketOrigin?: string): Record<string, string> {
  if (websocketOrigin && !/^ws:\/\/127\.0\.0\.1:\d{4,5}$/.test(websocketOrigin)) throw Error('PREVIEW_WEBSOCKET_ORIGIN_INVALID');
  return {
    'Content-Security-Policy': `default-src 'self'; script-src 'self' 'unsafe-inline' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' data: blob:; connect-src 'self'${websocketOrigin ? ' ' + websocketOrigin : ''}; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'`,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Permissions-Policy': 'microphone=(), camera=(), geolocation=()'
  };
}

export function previewBanner(source: PreviewSource): string {
  assertPreviewSource(source);
  return `<aside id="jemsPreviewBanner" aria-label="Development preview" style="position:relative;z-index:10000;background:#fff2c6;color:#332807;padding:8px 16px;font:600 18px/1.4 system-ui,sans-serif;overflow-wrap:anywhere"><strong>DEV PREVIEW</strong> · <span id="jemsPreviewSource">${source.sha.slice(0, 8)}${source.dirty ? ' · local edits' : ''}</span> · AI disconnected · Disposable test work <a href="./${PREVIEW_MANIFEST}" target="_blank" rel="noopener" style="color:#332807;text-decoration:underline">Build details</a></aside>`;
}

export function previewPolicyMeta(): string {
  return `<meta http-equiv="Content-Security-Policy" content="${previewHeaders()['Content-Security-Policy']}"><meta name="robots" content="noindex, nofollow, noarchive"><meta name="referrer" content="no-referrer">`;
}

export function addPreviewBanner(html: string, source: PreviewSource): string {
  if (!/<body(?:\s[^>]*)?>/i.test(html) || /id=["']jemsPreviewBanner["']/i.test(html) || /<base\b/i.test(html)) throw Error('PREVIEW_HTML_INVALID');
  return html.replace(/<body(?:\s[^>]*)?>/i, match => match + previewBanner(source));
}

function safeArtifactPath(relative: string): void {
  if (!relative || relative.length > 300 || relative.includes('\\') || relative.includes('\0') || path.posix.isAbsolute(relative) || relative.split('/').some(part => !part || part === '..' || part.startsWith('.'))) throw Error('PREVIEW_ARTIFACT_PATH_INVALID');
  if (!allowedExtensions.has(path.posix.extname(relative).toLowerCase()) || /(?:^|\/)(?:firebase\.json|package(?:-lock)?\.json|credentials[^/]*|service-account[^/]*|gha-creds-[^/]+)$/i.test(relative)) throw Error('PREVIEW_ARTIFACT_FILE_REJECTED');
}

async function inspectArtifact(root: string): Promise<PreviewFile[]> {
  const base = path.resolve(root);
  if (!(await lstat(base)).isDirectory() || (await lstat(base)).isSymbolicLink()) throw Error('PREVIEW_ARTIFACT_ROOT_INVALID');
  const files: PreviewFile[] = [];
  let total = 0, totalBytes = 0;
  async function walk(relative: string): Promise<void> {
    for (const entry of await readdir(path.join(base, relative), {withFileTypes: true})) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw Error('PREVIEW_ARTIFACT_SYMLINK_REJECTED');
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name.includes('\\')) throw Error('PREVIEW_ARTIFACT_PATH_INVALID');
        await walk(name);
      } else if (entry.isFile()) {
        if (name === PREVIEW_MANIFEST) continue;
        safeArtifactPath(name);
        const stat = await lstat(path.join(base, name));
        if (stat.isSymbolicLink() || !stat.isFile()) throw Error('PREVIEW_ARTIFACT_SYMLINK_REJECTED');
        totalBytes += stat.size;
        if (stat.size > PREVIEW_LIMITS.fileBytes || ++total > PREVIEW_LIMITS.files || totalBytes > PREVIEW_LIMITS.totalBytes) throw Error('PREVIEW_ARTIFACT_LIMIT_EXCEEDED');
        const bytes = await readFile(path.join(base, name));
        if (bytes.length !== stat.size) throw Error('PREVIEW_ARTIFACT_CHANGED_DURING_READ');
        if (/\.(?:html|js|json|webmanifest|txt|md)$/i.test(name) && /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"type"\s*:\s*"service_account"/.test(bytes.toString('utf8'))) throw Error('PREVIEW_CREDENTIAL_MATERIAL_REJECTED');
        files.push({path: name, bytes: bytes.length, sha256: sha256(bytes)});
      } else throw Error('PREVIEW_ARTIFACT_TYPE_REJECTED');
    }
  }
  await walk('');
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  for (const required of ['index.html', 'factory-config.json', 'build-info.json', 'sw.js']) if (!files.some(file => file.path === required)) throw Error('PREVIEW_ARTIFACT_INCOMPLETE');
  assertDisconnectedConfig(JSON.parse(await readFile(path.join(base, 'factory-config.json'), 'utf8')));
  const html = await readFile(path.join(base, 'index.html'), 'utf8');
  if (!html.includes('id="jemsPreviewBanner"')) throw Error('PREVIEW_BANNER_MISSING');
  if (!html.includes(previewPolicyMeta())) throw Error('PREVIEW_RESPONSE_POLICY_MISSING');
  return files;
}

function artifactDigest(files: PreviewFile[]): string {
  return sha256(JSON.stringify(files));
}

function assertRun(pr: number | null, runId: string | null): void {
  if (pr !== null && (!Number.isSafeInteger(pr) || pr <= 0)) throw Error('PREVIEW_PR_INVALID');
  if (runId !== null && !/^[1-9]\d{0,19}$/.test(runId)) throw Error('PREVIEW_RUN_INVALID');
}

export async function writePreviewManifest(root: string, source: PreviewSource, identity: {pr?: number; runId?: string} = {}): Promise<PreviewManifest> {
  assertPreviewSource(source);
  const pr = identity.pr ?? null, runId = identity.runId ?? null;
  assertRun(pr, runId);
  const files = await inspectArtifact(root);
  const manifest: PreviewManifest = {version: 1, kind: 'jems-static-preview', environment: 'preview', backendPolicy: 'disconnected', source, pr, runId, builtAt: new Date().toISOString(), artifact: {sha256: artifactDigest(files), fileCount: files.length, totalBytes: files.reduce((n, file) => n + file.bytes, 0), files}};
  await writeFile(path.join(root, PREVIEW_MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

/** Content integrity is not an attestation: the publisher must independently bind the CI run. */
export async function verifyPreviewArtifact(root: string, expected: {sha?: string; pr?: number; runId?: string; allowDirty?: boolean} = {}): Promise<PreviewManifest> {
  const stat = await lstat(path.join(root, PREVIEW_MANIFEST));
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error('PREVIEW_ARTIFACT_SYMLINK_REJECTED');
  if (stat.size > 4 * 1024 * 1024) throw Error('PREVIEW_MANIFEST_TOO_LARGE');
  const raw = await readFile(path.join(root, PREVIEW_MANIFEST));
  if (raw.length > 4 * 1024 * 1024) throw Error('PREVIEW_MANIFEST_TOO_LARGE');
  const manifest = JSON.parse(raw.toString('utf8')) as PreviewManifest;
  if (!manifest || manifest.version !== 1 || manifest.kind !== 'jems-static-preview' || manifest.environment !== 'preview' || manifest.backendPolicy !== 'disconnected' || !Number.isFinite(Date.parse(manifest.builtAt))) throw Error('PREVIEW_MANIFEST_INVALID');
  assertPreviewSource(manifest.source);
  assertRun(manifest.pr, manifest.runId);
  if (manifest.source.dirty && !expected.allowDirty) throw Error('PREVIEW_DIRTY_SOURCE_REJECTED');
  if ((expected.sha !== undefined && manifest.source.sha !== expected.sha) || (expected.pr !== undefined && manifest.pr !== expected.pr) || (expected.runId !== undefined && manifest.runId !== expected.runId)) throw Error('PREVIEW_PROVENANCE_MISMATCH');
  const files = await inspectArtifact(root);
  if (!manifest.artifact || JSON.stringify(files) !== JSON.stringify(manifest.artifact.files) || manifest.artifact.sha256 !== artifactDigest(files) || manifest.artifact.fileCount !== files.length || manifest.artifact.totalBytes !== files.reduce((n, file) => n + file.bytes, 0)) throw Error('PREVIEW_ARTIFACT_DIGEST_MISMATCH');
  const info = JSON.parse(await readFile(path.join(root, 'build-info.json'), 'utf8'));
  if (info.sha !== manifest.source.sha || info.dirty !== manifest.source.dirty || info.workingTreeSha256 !== manifest.source.workingTreeSha256 || info.environment !== 'preview') throw Error('PREVIEW_BUILD_IDENTITY_MISMATCH');
  return manifest;
}

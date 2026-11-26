#!/usr/bin/env node
/**
 * Verify the public active-core-21 Gem Pal manifest, exact bytes and lossless WebP
 * framing using Node built-ins. No npm dependency is required.
 *
 * node scripts/verify-pal-assets.mjs
 * node scripts/verify-pal-assets.mjs --pixels
 * node scripts/verify-pal-assets.mjs --source-kit /path/to/kit --report /outside/public/report.json
 *
 * --pixels freshly decodes every WebP with the exporter's Python/Pillow helper.
 * --source-kit additionally compares all 168 original PNGs, including straight
 * RGB beneath transparent pixels. Default CI verifies committed byte hashes and
 * the recorded source-pixel digests, and does not claim a fresh pixel comparison.
 */
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(root, 'public');
const assetRoot = resolve(publicRoot, 'jems-pals');
export const ASSET_VERSION = 'core-2026-11-20';
export const STATES = ['neutral', 'celebrate', 'thinking', 'encouraging_retry'];
export const FORMS = ['base', 'mature'];
const identities = {
  nook: ['first-round-2026-11-19/B', null],
  mizzle: ['first-round-2026-11-19/D', null], tumble: ['first-round-2026-11-19/E', null],
  navi: ['first-round-2026-11-19/F1', null], mote: ['first-round-2026-11-19/F2', null],
  sivo: ['first-round-2026-11-19/G', null], furl: ['first-round-2026-11-19/H', null],
  tessit: ['first-round-2026-11-19/I', null], flick: ['first-round-2026-11-19/K', null],
  clasp: ['first-round-2026-11-19/L', null], skiff: ['first-round-2026-11-19/M', null],
  peep: ['first-round-2026-11-19/N', null], weft: ['first-round-2026-11-19/O', null],
  cache: ['first-round-2026-11-19/P', null], brim: ['first-round-2026-11-19/Q', null],
  wink: ['first-round-2026-11-19/R', null], poff: ['expansion-2026-11-19/S', 'GP-S019'],
  chimi: ['expansion-2026-11-19/T', 'GP-S020'], pleeko: ['expansion-2026-11-19/U', 'GP-S021'],
  talli: ['expansion-2026-11-19/V', 'GP-S022'],
  whorl: ['expansion-2026-11-19/X', 'GP-S024'],
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
const sameKeys = (object, keys, label) => {
  requireThat(object && typeof object === 'object' && !Array.isArray(object), `${label}: expected object`);
  requireThat(JSON.stringify(Object.keys(object).sort()) === JSON.stringify([...keys].sort()), `${label}: unexpected or missing fields`);
};
const isDigest = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

export function validateManifest(manifest) {
  sameKeys(manifest, ['schemaVersion', 'assetVersion', 'scope', 'characters'], 'manifest');
  requireThat(manifest.schemaVersion === 1 && manifest.assetVersion === ASSET_VERSION, 'Unsupported manifest version');
  sameKeys(manifest.scope, ['id', 'characterCount', 'assetCount'], 'scope');
  requireThat(manifest.scope.id === 'active-core-21' && manifest.scope.characterCount === 21 && manifest.scope.assetCount === 168, 'Unexpected roster scope');
  requireThat(Array.isArray(manifest.characters) && manifest.characters.length === 21, 'Expected 21 active characters');
  const slugs = new Set();
  const urls = new Set();
  const assets = [];
  for (const character of manifest.characters) {
    sameKeys(character, ['characterKey', 'speciesId', 'slug', 'name', 'forms'], 'character');
    const expected = Object.hasOwn(identities, character.slug) && identities[character.slug];
    requireThat(expected && !slugs.has(character.slug), 'Unknown or duplicate original character');
    requireThat(character.characterKey === expected[0] && character.speciesId === expected[1], `${character.slug}: existing identity changed`);
    requireThat(character.name === character.slug[0].toUpperCase() + character.slug.slice(1), `${character.slug}: name changed`);
    slugs.add(character.slug);
    sameKeys(character.forms, FORMS, `${character.slug} forms`);
    for (const form of FORMS) {
      const formData = character.forms[form];
      sameKeys(formData, ['neutralFallback', 'neutralSourceSHA256', 'expressions'], `${character.slug}/${form}`);
      sameKeys(formData.expressions, STATES, `${character.slug}/${form} expressions`);
      for (const expression of STATES) {
        const asset = formData.expressions[expression];
        const label = `${character.slug}/${form}/${expression}`;
        sameKeys(asset, ['form', 'expression', 'url', 'sourceSHA256', 'exportedSHA256', 'width', 'height', 'alpha', 'decodedPixelParity', 'decodedRGBA8SHA256', 'sourceBytes', 'exportedBytes'], label);
        requireThat(asset.form === form && asset.expression === expression, `${label}: slot binding changed`);
        for (const field of ['sourceSHA256', 'exportedSHA256', 'decodedRGBA8SHA256']) requireThat(isDigest(asset[field]), `${label}: invalid ${field}`);
        const expectedUrl = `jems-pals/${character.slug}/${form}/${expression.replaceAll('_', '-')}-${asset.sourceSHA256.slice(0, 12)}.webp`;
        requireThat(asset.url === expectedUrl && !urls.has(asset.url), `${label}: unsafe, duplicate or incorrect URL`);
        requireThat(Number.isInteger(asset.width) && asset.width > 0 && asset.width <= 16384 && Number.isInteger(asset.height) && asset.height > 0 && asset.height <= 16384, `${label}: invalid dimensions`);
        requireThat(typeof asset.alpha === 'boolean' && asset.decodedPixelParity === true, `${label}: missing alpha/pixel preservation evidence`);
        requireThat(Number.isSafeInteger(asset.sourceBytes) && asset.sourceBytes > 0 && Number.isSafeInteger(asset.exportedBytes) && asset.exportedBytes > 0, `${label}: invalid byte count`);
        urls.add(asset.url);
        assets.push({ characterKey: character.characterKey, speciesId: character.speciesId, slug: character.slug, ...asset });
      }
      requireThat(formData.neutralFallback === formData.expressions.neutral.url, `${character.slug}/${form}: fallback must be its own neutral`);
      requireThat(formData.neutralSourceSHA256 === formData.expressions.neutral.sourceSHA256, `${character.slug}/${form}: neutral reference hash mismatch`);
    }
  }
  requireThat(slugs.size === 21 && assets.length === 168, 'Incomplete original roster');
  return assets;
}

export function inspectLosslessWebP(bytes, label = 'WebP') {
  requireThat(bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP', `${label}: invalid WebP container`);
  requireThat(bytes.readUInt32LE(4) + 8 === bytes.length, `${label}: RIFF byte length mismatch`);
  let result;
  let extended;
  let offset = 12;
  for (; offset + 8 <= bytes.length;) {
    const kind = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const payload = offset + 8;
    requireThat(payload + length <= bytes.length, `${label}: truncated ${kind} chunk`);
    requireThat(kind !== 'VP8 ' && kind !== 'ANIM' && kind !== 'ANMF', `${label}: lossy or animated content is forbidden`);
    if (kind === 'VP8L') {
      requireThat(!result && length >= 5 && bytes[payload] === 0x2f, `${label}: invalid or repeated lossless chunk`);
      const bits = bytes.readUInt32LE(payload + 1);
      requireThat((bits >>> 29) === 0, `${label}: unsupported lossless version`);
      result = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, alpha: Boolean((bits >>> 28) & 1), lossless: true };
    } else if (kind === 'VP8X') {
      requireThat(length === 10 && !(bytes[payload] & 0x02), `${label}: invalid extended or animated header`);
      extended = { width: bytes.readUIntLE(payload + 4, 3) + 1, height: bytes.readUIntLE(payload + 7, 3) + 1, alpha: Boolean(bytes[payload] & 0x10) };
    }
    offset = payload + length + (length & 1);
  }
  requireThat(offset === bytes.length && result, `${label}: missing lossless data or trailing bytes`);
  if (extended) requireThat(result.width === extended.width && result.height === extended.height && result.alpha === extended.alpha, `${label}: extended/lossless headers disagree`);
  return result;
}

async function walkFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    requireThat(!entry.isSymbolicLink(), 'Symlink is not an approved production asset');
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

export async function verifyAssets(options = {}) {
  const manifestPath = resolve(options.manifest ?? resolve(assetRoot, 'manifest.json'));
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const assets = validateManifest(manifest);
  const expected = new Set([resolve(assetRoot, 'manifest.json')]);
  const checks = [];
  for (const asset of assets) {
    const path = resolve(publicRoot, asset.url);
    requireThat(path.startsWith(assetRoot + sep), 'Asset path escapes production directory');
    expected.add(path);
    const bytes = await readFile(path);
    requireThat(bytes.length === asset.exportedBytes && sha256(bytes) === asset.exportedSHA256, `${asset.url}: exported bytes changed`);
    const image = inspectLosslessWebP(bytes, asset.url);
    requireThat(image.width === asset.width && image.height === asset.height && image.alpha === asset.alpha, `${asset.url}: framing/alpha metadata changed`);
    checks.push({ url: asset.url, sourceSHA256: asset.sourceSHA256, exportedSHA256: asset.exportedSHA256,
      sourceBytes: asset.sourceBytes, exportedBytes: asset.exportedBytes,
      width: image.width, height: image.height, alpha: image.alpha, lossless: true, byteIntegrity: 'Pass' });
  }
  // Only the four pinned neutrals remain readable by existing saved scenes.
  const historical = JSON.parse(await readFile(resolve(root, 'src/pals/historical-scene-art.json'), 'utf8'));
  for (const asset of historical) {
    const path = resolve(publicRoot, asset.url);
    requireThat(path.startsWith(assetRoot + sep) && sha256(await readFile(path)) === asset.sha256, 'Historical scene artwork changed');
    expected.add(path);
  }
  const actual = await walkFiles(assetRoot);
  requireThat(actual.length === expected.size && actual.every(path => expected.has(path)), 'Unregistered file in public Gem Pal asset directory');
  const sourceBytes = assets.reduce((sum, asset) => sum + asset.sourceBytes, 0);
  const exportedBytes = assets.reduce((sum, asset) => sum + asset.exportedBytes, 0);
  let pixels = null;
  if (options.pixels || options.sourceKit) {
    const args = [resolve(root, 'scripts/export-pal-assets.py'), 'verify-pixels', '--manifest', manifestPath];
    if (options.sourceKit) args.push('--kit', resolve(options.sourceKit));
    const result = spawnSync(process.env.PAL_ASSET_PYTHON || 'python3', args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    requireThat(!result.error && result.status === 0, `Fresh pixel verification failed: ${result.error?.message ?? result.stderr.trim()}`);
    pixels = JSON.parse(result.stdout);
    requireThat(pixels.status === 'Pass' && pixels.decodedAssets === 168 && pixels.manifestSHA256 === sha256(manifestBytes), 'Fresh pixel audit is incomplete or bound to another manifest');
    requireThat(!options.sourceKit || pixels.freshSourcePNGComparison === true, 'Source PNG comparison was not performed');
  }
  const report = {
    schemaVersion: 1, status: 'Pass', assetVersion: ASSET_VERSION, manifestSHA256: sha256(manifestBytes),
    counts: { characters: 21, forms: 42, neutral: 42, emotions: 126, assets: 168, assetsWithTransparency: assets.filter(asset => asset.alpha).length },
    bytes: { sourcePNG: sourceBytes, exportedWebP: exportedBytes, manifest: manifestBytes.length,
      totalProduction: exportedBytes + manifestBytes.length, saved: sourceBytes - exportedBytes,
      reductionPercent: (1 - exportedBytes / sourceBytes) * 100 },
    byteAndContainerIntegrity: 'Pass', publicManifestAllowlist: 'Pass', originalIdentityScope: 'Pass',
    freshDecodedPixelVerification: pixels ? 'Pass' : 'Not requested; committed byte hashes and recorded pixel digests verified',
    freshSourcePNGComparison: pixels?.freshSourcePNGComparison ?? false,
    sourceFrameAndAlphaPreservationRecorded: true, checks, pixels,
  };
  if (options.report) {
    const reportPath = resolve(options.report);
    requireThat(!reportPath.startsWith(publicRoot + sep), 'Detailed verification report must stay outside public/');
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  }
  return report;
}

async function main() {
  const options = {};
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--help') { console.log('Verify exact core Gem Pal assets. Options: --pixels --source-kit <kit> --manifest <json> --report <outside-public.json>'); return; }
    if (flag === '--pixels') { options.pixels = true; continue; }
    const name = { '--source-kit': 'sourceKit', '--manifest': 'manifest', '--report': 'report' }[flag];
    requireThat(name && args[index + 1] && !args[index + 1].startsWith('--'), `Unknown or missing option: ${flag}`);
    options[name] = args[++index];
  }
  const report = await verifyAssets(options);
  console.log(JSON.stringify({ status: report.status, manifestSHA256: report.manifestSHA256,
    counts: report.counts, bytes: report.bytes, freshDecodedPixelVerification: report.freshDecodedPixelVerification,
    freshSourcePNGComparison: report.freshSourcePNGComparison }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Gem Pal asset verification failed: ${error.message}`); process.exitCode = 1; });
}

#!/usr/bin/env node
/** Verify the approved v1.2 public assets and the reversible identity revision. */
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const metadata = 'docs/brand/art-library/';
const digest = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const gitBlob = bytes => digest(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]), 'sha1');
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
const json = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const expectedIdentity = [
  'arcade-icon', 'jems-app-icon', 'jems-logo', 'jems-mark', 'jems-mark-inverse',
  'jems-mark-monochrome', 'jems-mono', 'jems-reversed', 'jems-wordmark'
];
const expectedPatterns = ['jems-clouds', 'jems-facets-pattern', 'jems-pattern', 'jems-sparks'];
const expectedIllustrations = [
  'character_spark_celebrate', 'character_spark_recover', 'character_spark_rest',
  'character_spark_think', 'character_spark_wave', 'gem_blue', 'gem_coral',
  'gem_gold', 'gem_mint', 'hero_gembots', 'hero_mind_your_jems', 'hero_workshop',
  'makers_together', 'spot_first_idea', 'spot_reconnect', 'spot_safe_storage', 'spot_work_in_progress'
];
const forbiddenRays = ['M228,38 225,35', 'M205,9 203,8', 'M168,7 165,9'];

function webpSize(bytes, path) {
  requireThat(bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP', `${path}: not WebP`);
  requireThat(bytes.readUInt32LE(4) + 8 === bytes.length, `${path}: RIFF length changed`);
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const kind = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const payload = offset + 8;
    requireThat(payload + length <= bytes.length, `${path}: truncated ${kind} chunk`);
    if (kind === 'VP8X' && length >= 10) return [bytes.readUIntLE(payload + 4, 3) + 1, bytes.readUIntLE(payload + 7, 3) + 1];
    if (kind === 'VP8L' && length >= 5) {
      requireThat(bytes[payload] === 0x2f, `${path}: invalid lossless header`);
      const bits = bytes.readUInt32LE(payload + 1);
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }
    if (kind === 'VP8 ' && length >= 10) return [bytes.readUInt16LE(payload + 6) & 0x3fff, bytes.readUInt16LE(payload + 8) & 0x3fff];
    offset = payload + length + (length & 1);
  }
  throw new Error(`${path}: no dimension-bearing WebP chunk`);
}

async function verify() {
  const manifest = await json(metadata + 'assets.json');
  requireThat(manifest.version === '1.2.0', 'Unexpected approved library version');
  const records = new Map();
  const buffers = new Map();
  for (const item of manifest.files) {
    requireThat(!records.has(item.path), `Duplicate asset: ${item.path}`);
    requireThat(item.path.startsWith('public/') && !item.path.split('/').includes('..'), `Unsafe asset path: ${item.path}`);
    const absolute = resolve(root, item.path);
    requireThat(absolute.startsWith(root + sep), `Asset escapes repository: ${item.path}`);
    requireThat(item.url === item.path.slice('public/'.length), `${item.path}: base-path-safe URL changed`);
    const bytes = await readFile(absolute);
    requireThat(bytes.length === item.bytes, `${item.path}: byte length changed`);
    requireThat(digest(bytes) === item.sha256, `${item.path}: approved SHA256 mismatch`);
    if (item.path.endsWith('.webp')) {
      const [width, height] = webpSize(bytes, item.path);
      requireThat(width === item.width && height === item.height, `${item.path}: dimensions changed`);
    }
    if (item.kind === 'illustration') {
      requireThat(item.encoding?.lossless === true && item.encoding?.exact === true, `${item.path}: requires exact lossless export`);
      requireThat(item.decoded_rgba_sha256 === item.derivative_decoded_rgba_sha256, `${item.path}: recorded source/derivative pixels differ`);
      requireThat(/^[0-9a-f]{64}$/.test(item.source_sha256), `${item.path}: source hash missing`);
    }
    if (item.path.endsWith('.svg')) {
      const xml = bytes.toString('utf8');
      requireThat(/<svg\b/.test(xml), `${item.path}: SVG root missing`);
      requireThat(!/<script\b|\bon\w+\s*=|<!DOCTYPE/i.test(xml), `${item.path}: executable or external XML added`);
      requireThat(!/\b(?:href|xlink:href)\s*=\s*["'](?!#)/i.test(xml), `${item.path}: external reference added`);
    }
    if (item.kind === 'font') {
      requireThat(bytes.toString('ascii', 0, 4) === 'wOFF' && bytes.readUInt32BE(8) === bytes.length, `${item.path}: WOFF header changed`);
    }
    if (item.kind === 'font-license') requireThat(/SIL OPEN FONT LICENSE/i.test(bytes.toString('utf8')), `${item.path}: OFL license missing`);
    records.set(item.path, item);
    buffers.set(item.path, bytes);
  }

  const kinds = kind => manifest.files.filter(item => item.kind === kind);
  requireThat(kinds('identity').length === 9 && kinds('pattern').length === 4, 'Expected nine identity and four pattern files');
  requireThat(kinds('illustration').length === 17, 'Expected seventeen lossless illustration exports');
  requireThat(kinds('icon').length === 32 && kinds('icon-sprite').length === 1, 'Expected 32 functional icons and one sprite');
  requireThat(kinds('font').length === 2 && kinds('font-license').length === 2, 'Expected two licensed font families');
  requireThat(kinds('journey-atlas').length === 3 && kinds('journey-background').length === 1, 'Expected unchanged Journey atlases and background');
  for (const name of [...expectedIdentity, ...expectedPatterns]) {
    const path = `public/${name}.svg`;
    requireThat(buffers.has(path), `Approved vector missing: ${path}`);
    const xml = buffers.get(path).toString('utf8');
    for (const ray of forbiddenRays) requireThat(!xml.includes(ray), `${path}: rejected three-ray motif restored`);
  }
  requireThat(buffers.get('public/jems-logo.svg').toString('utf8').includes('M608,35 601,51'), 'The separate wordmark sparkle must remain');

  const actualArt = (await readdir(resolve(root, 'public/jems-art'))).filter(name => /\.(?:webp|png|jpe?g|svg|avif|gif)$/i.test(name)).sort();
  requireThat(JSON.stringify(actualArt) === JSON.stringify(expectedIllustrations.map(id => id + '.webp').sort()), 'Unregistered or retired illustration in active art directory');
  for (const id of expectedIllustrations) requireThat(records.has(`public/jems-art/${id}.webp`), `Illustration metadata missing: ${id}`);
  for (const retired of manifest.retired_asset_ids) requireThat(!manifest.files.some(item => item.path.includes(retired)), `Retired reward registered: ${retired}`);

  const original = await json(metadata + manifest.historical_identity_source);
  const revision = await json(metadata + manifest.identity_revision);
  const originalByPath = new Map(original.files.map(item => [item.path, item]));
  requireThat(revision.source_main === '493eb9ce2a98de5f3be8f6d17e63dfe2f6a7e3a7' && revision.date === '2026-11-19', 'Identity source lineage changed');
  requireThat(revision.changes.length === 8, 'Expected eight authorized logo edits');
  const changed = new Set();
  for (const change of revision.changes) {
    requireThat(!changed.has(change.source_path), `Duplicate identity revision: ${change.source_path}`);
    changed.add(change.source_path);
    const current = buffers.get(change.source_path);
    const origin = originalByPath.get(change.source_path);
    requireThat(current && origin, `Identity lineage missing: ${change.source_path}`);
    requireThat(digest(current) === change.revised_sha256 && gitBlob(current) === change.revised_git_blob_sha, `${change.source_path}: revised baseline mismatch`);
    let restored = current;
    if (change.viewbox_edit) {
      const xml = restored.toString('utf8');
      requireThat(xml.split(change.viewbox_edit.new).length === 2, `${change.source_path}: compact viewBox changed`);
      restored = Buffer.from(xml.replace(change.viewbox_edit.new, change.viewbox_edit.old));
    }
    const offset = change.original_removal_offset;
    requireThat(offset >= 0 && offset <= restored.length, `${change.source_path}: invalid source insertion offset`);
    restored = Buffer.concat([restored.subarray(0, offset), Buffer.from(change.removed_path_xml), restored.subarray(offset)]);
    requireThat(digest(restored) === origin.sha256 && digest(restored) === change.original_sha256 && restored.length === origin.bytes && gitBlob(restored) === origin.git_blob_sha, `${change.source_path}: revision no longer reverses to the historical source`);
  }
  for (const name of [...expectedIdentity, ...expectedPatterns]) {
    const path = `public/${name}.svg`;
    if (!changed.has(path)) requireThat(digest(buffers.get(path)) === originalByPath.get(path)?.sha256, `${path}: unchanged source altered`);
  }

  const frameMap = new Map(manifest.journey_frames.map(frame => [frame.asset_id, frame]));
  requireThat(frameMap.size === 13, 'Expected thirteen native Journey exports mapped to existing atlases');
  for (const character of ['spark', 'nova']) for (let level = 1; level <= 4; level++) {
    const frame = frameMap.get(`maker_${character}_${level}`);
    requireThat(frame?.url === `jems-journey/characters-${character}.webp` && frame.level === level && frame.width === 543 && frame.height === 724 && JSON.stringify(frame.crop_xyxy) === JSON.stringify([(level - 1) * 543, 0, level * 543, 724]), `Human maker frame/rank mismatch: ${character} ${level}`);
  }
  for (const [index, id] of ['gem_rough', 'gem_cut', 'gem_polished_rainbow', 'gem_master'].entries()) {
    const frame = frameMap.get(id);
    requireThat(frame?.url === 'jems-journey/gems.webp' && frame.purpose === 'secondary progress marker' && JSON.stringify(frame.crop_xyxy) === JSON.stringify([index * 543, 0, (index + 1) * 543, 724]), `Secondary gem frame mismatch: ${id}`);
  }
  const sprite = buffers.get('public/jems-art/icons/jems-icons.svg').toString('utf8');
  const symbolIds = [...sprite.matchAll(/<symbol\s+id="([^"]+)"/g)].map(match => match[1]);
  requireThat(symbolIds.length === 32 && new Set(symbolIds).size === 32, 'Icon sprite must have 32 unique symbols');
  for (const icon of kinds('icon')) {
    const name = icon.path.split('/').at(-1).replace(/\.svg$/, '');
    requireThat(symbolIds.includes('jems-' + name), `Icon sprite missing ${name}`);
  }
  console.log(`Brand assets verified: ${manifest.files.length} public files; 17 exact lossless illustrations; 13 native Journey mappings; 8 logo edits reverse to original bytes.`);
}

verify().catch(error => { console.error(`Brand asset verification failed: ${error.message}`); process.exitCode = 1; });

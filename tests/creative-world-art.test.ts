import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ILLUSTRATED_WORLDS, WORLD_PROPS } from '../src/creation/illustrated-art';

type Asset = { id: string; file: string; dimensions: number[]; bytes: number; sha256: string; alpha: string; worlds: string[] };
const manifest = JSON.parse(readFileSync('docs/creation-studio/world-art-manifest.json', 'utf8')) as { assets: Asset[] };
const entries = new Map(manifest.assets.map(asset => ['./' + asset.file, asset]));
test('the four pinned world plates, previews, overlays and selectable props have reviewed byte identities', () => {
  assert.equal(ILLUSTRATED_WORLDS.length, 4);
  const paths = new Set<string>();
  const check = (url: string, world: string, alpha: string, dimensions?: number[]) => {
    assert.match(url, /^\.\/art\/creative-worlds\/v1\/[a-z0-9-]+\.webp$/);
    const metadata = entries.get(url);
    assert.ok(metadata && metadata.worlds.includes(world));
    assert.equal(metadata.alpha, alpha);
    if (dimensions) assert.deepEqual(metadata.dimensions, dimensions);
    const bytes = readFileSync('public/' + metadata.file);
    assert.equal(bytes.subarray(8,12).toString(), 'WEBP');
    assert.equal(bytes.length, metadata.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
    paths.add(url);
  };
  for (const world of ILLUSTRATED_WORLDS) {
    check(world.background, world.id, 'opaque', [1280,720]);
    check(world.middle, world.id, 'straight', [1280,720]);
    check(world.foreground, world.id, 'straight', [1280,720]);
    check(world.preview, world.id, 'opaque', [384,216]);
    for (const id of world.props) {
      const prop = WORLD_PROPS.find(item => item.id === id);
      assert.ok(prop, id);
      check(prop.url, world.id, 'straight');
    }
  }
  assert.equal(paths.size, manifest.assets.length);
  assert.equal(new Set(manifest.assets.map(asset => asset.id)).size, manifest.assets.length);
  assert.equal(new Set(WORLD_PROPS.map(prop => prop.id)).size, 32);
  assert.ok(manifest.assets.reduce((sum, asset) => sum + asset.bytes, 0) < 3 * 1024 * 1024);
});

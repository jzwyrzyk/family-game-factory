import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateManifest, inspectLosslessWebP } from '../verify-pal-assets.mjs';

const publicRoot = new URL('../../public/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('jems-pals/manifest.json', publicRoot), 'utf8'));
const copy = () => structuredClone(manifest);

test('all 168 slots preserve the original 21 active identities and same-form neutral fallbacks', () => {
  const assets = validateManifest(manifest);
  assert.equal(assets.length, 168);
  assert.equal(new Set(assets.map(asset => asset.characterKey)).size, 21);
  assert.equal(assets.filter(asset => asset.expression === 'neutral').length, 42);
});

test('rejects extra public provenance fields instead of exposing private source metadata', () => {
  const changed = copy();
  changed.characters[0].approvalEvidence = 'private source metadata';
  assert.throws(() => validateManifest(changed), /unexpected or missing fields/);
});

test('does not alias approved character identities to legacy Pal IDs or invent species IDs', () => {
  const changed = copy();
  changed.characters[0].characterKey = 'glim';
  assert.throws(() => validateManifest(changed), /identity changed/);
  changed.characters[0] = structuredClone(manifest.characters.find(character => character.speciesId === null));
  changed.characters[0].speciesId = 'GP-INVENTED';
  assert.throws(() => validateManifest(changed), /identity changed/);
});

test('rejects Brio, duplicate characters, extra forms and wrong expression bindings', () => {
  const brio = copy();
  brio.characters[0].slug = 'brio';
  assert.throws(() => validateManifest(brio), /Unknown or duplicate/);
  const duplicated = copy();
  duplicated.characters[1] = structuredClone(duplicated.characters[0]);
  assert.throws(() => validateManifest(duplicated), /Unknown or duplicate/);
  const forms = copy();
  forms.characters[0].forms.bright = structuredClone(forms.characters[0].forms.base);
  assert.throws(() => validateManifest(forms), /unexpected or missing fields/);
  const states = copy();
  states.characters[0].forms.base.expressions.celebrate.expression = 'neutral';
  assert.throws(() => validateManifest(states), /slot binding changed/);
});

test('a fallback cannot borrow another form or reference', () => {
  const changed = copy();
  changed.characters[0].forms.base.neutralFallback = changed.characters[0].forms.mature.neutralFallback;
  assert.throws(() => validateManifest(changed), /fallback must be its own neutral/);
});

test('rejects absolute URLs, traversal and stale hash-bearing filenames', () => {
  for (const url of ['https://example.com/other.webp', '../other.webp', '/jems-pals/luma/base/neutral-deadbeef0000.webp']) {
    const changed = copy();
    changed.characters[0].forms.base.expressions.neutral.url = url;
    assert.throws(() => validateManifest(changed), /unsafe, duplicate or incorrect URL/);
  }
});

test('actual WebP headers retain native dimensions and transparency; corruption fails closed', async () => {
  for (const alpha of [false, true]) {
    const asset = validateManifest(manifest).find(item => item.alpha === alpha);
    assert.ok(asset);
    const bytes = await readFile(new URL(asset.url, publicRoot));
    assert.deepEqual(inspectLosslessWebP(bytes), { width: asset.width, height: asset.height, alpha, lossless: true });
    assert.throws(() => inspectLosslessWebP(bytes.subarray(0, bytes.length - 1)), /RIFF byte length mismatch/);
    const corrupted = Buffer.from(bytes);
    corrupted.write('VP8 ', 12, 'ascii');
    assert.throws(() => inspectLosslessWebP(corrupted), /lossy or animated content is forbidden/);
  }
});

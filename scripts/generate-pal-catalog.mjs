#!/usr/bin/env node
/** Build the small synchronous collection lookup from the approved art records.
 * No pixels are regenerated. Brio's two approved PNGs are copied byte for byte;
 * his in-review expressions are deliberately excluded.
 * Run with --write after an intentional art binding change, or --check in CI.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateManifest } from './verify-pal-assets.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = resolve(root, 'docs/pals/art/character-references.json');
const generatedPath = resolve(root, 'src/pals/catalog-artwork.generated.ts');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
const aliases = Object.freeze({ luma: 'glim', nook: 'kip', wink: 'riff' });
const forms = ['base', 'mature'];

function selectedAsset(index, member, form, expression) {
  const reference = expression === 'neutral' ? member.forms[form] : member.forms[form].expressions[expression];
  requireThat(reference?.status === 'approved_art_reference', `${member.display_name}/${form}/${expression}: artwork is not approved`);
  const selected = index.assets[reference.selected_reference?.asset_id];
  requireThat(selected, `${member.display_name}/${form}/${expression}: selected asset is missing`);
  return selected;
}

export async function generatePalCatalog({ write = false } = {}) {
  const manifest = JSON.parse(await readFile(resolve(root, 'public/jems-pals/manifest.json'), 'utf8'));
  validateManifest(manifest);
  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  const members = index.roster_entries.flatMap(entry => entry.members);
  const byKey = new Map(members.map(member => [member.character_key, member]));
  const records = [];
  for (const character of manifest.characters) {
    const member = byKey.get(character.characterKey);
    requireThat(member && member.display_name === character.name && member.species_id === character.speciesId,
      `${character.slug}: manifest and approved character identities differ`);
    const images = {};
    for (const form of forms) {
      images[form] = {};
      for (const [expression, asset] of Object.entries(character.forms[form].expressions)) {
        const selected = selectedAsset(index, member, form, expression);
        requireThat(selected.runtime_url === asset.url && selected.sha256 === asset.exportedSHA256
          && selected.source_png_sha256 === asset.sourceSHA256,
        `${character.slug}/${form}/${expression}: manifest no longer resolves the selected approved image`);
        images[form][expression] = asset.url;
      }
    }
    records.push({ slug: character.slug, name: character.name, characterKey: character.characterKey,
      speciesId: character.speciesId, assetVersion: manifest.assetVersion, forms: images });
  }

  const brio = byKey.get('brio-2026-11-19/brio');
  requireThat(brio?.display_name === 'Brio' && brio.species_id === 'GP-S025', 'Brio identity is missing or changed');
  const brioImages = {};
  const extraPaths = new Set();
  for (const form of forms) {
    const selected = selectedAsset(index, brio, form, 'neutral');
    const expectedSource = `characters/brio/${form === 'base' ? 'initial' : 'growth'}.png`;
    requireThat(selected.repository_path === expectedSource && selected.form_key === form && selected.expression === 'neutral',
      `Brio/${form}: expected the approved neutral master`);
    const bytes = await readFile(resolve(dirname(indexPath), expectedSource));
    requireThat(bytes.length === selected.size_bytes && digest(bytes) === selected.sha256,
      `Brio/${form}: approved PNG bytes have changed`);
    const url = `jems-pals-extra/brio/${form}/neutral-${selected.sha256.slice(0, 12)}.png`;
    const destination = resolve(root, 'public', url);
    extraPaths.add(destination);
    if (write) {
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, bytes);
    } else {
      const shipped = await readFile(destination);
      requireThat(shipped.equals(bytes), `Brio/${form}: published image differs from approved master`);
    }
    brioImages[form] = { neutral: url };
  }
  records.push({ slug: 'brio', name: 'Brio', characterKey: brio.character_key, speciesId: brio.species_id,
    assetVersion: 'neutral-2026-11-21', forms: brioImages });
  requireThat(records.length === 24 && byKey.size === 24, 'Collection must bind the complete current 24-profile roster');

  // Application bindings are a projection of the selected references. Keep art
  // approvals, prior selection history and in-review states unchanged.
  for (const record of records) {
    const member = byKey.get(record.characterKey);
    const mapping = {
      collection_id: aliases[record.slug] ?? record.slug,
      display_name: record.name,
      asset_version: record.assetVersion,
      forms: Object.fromEntries(forms.map(form => [form, {
        neutral_url: record.forms[form].neutral,
        scene_asset_id: `pal-${record.slug}-${form}-${record.assetVersion}`,
      }])),
      compatibility: Object.hasOwn(aliases, record.slug) ? 'retains_existing_collection_id' : 'new_collection_id',
      scope: 'Approved artwork binding; owned progress remains receipt-derived. Scene IDs pin character, form and asset version. Live acceptance is recorded separately.',
    };
    if (write) member.application_mapping = mapping;
    else requireThat(JSON.stringify(member.application_mapping) === JSON.stringify(mapping), `${record.slug}: application mapping is stale`);
  }

  const output = `/** Generated by scripts/generate-pal-catalog.mjs. Do not edit.\n * Derived from the approved original-23 manifest and Brio's two selected neutrals.\n * Approval history and in-review expressions stay in the canonical character index. */\nexport const PAL_COLLECTION_ARTWORK = [\n${records.map(record => `  ${JSON.stringify(record)},`).join('\n')}\n] as const;\n`;
  if (write) {
    await writeFile(generatedPath, output);
    await writeFile(indexPath, JSON.stringify(index, null, 2) + '\n');
  } else {
    requireThat(await readFile(generatedPath, 'utf8') === output, 'Generated collection artwork lookup is stale; run --write');
  }

  const walk = async path => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = resolve(path, entry.name);
      requireThat(!entry.isSymbolicLink(), 'Unexpected symlink in supplemental Pal artwork');
      if (entry.isDirectory()) await walk(child);
      else requireThat(entry.isFile() && extraPaths.has(child), 'Unexpected unapproved supplemental Pal artwork');
    }
  };
  await walk(resolve(root, 'public/jems-pals-extra'));
  return { characters: records.length, approvedCoreImages: 184, approvedSupplementalNeutrals: 2 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--write', '--check'].includes(args[0])) {
    console.error('Usage: node scripts/generate-pal-catalog.mjs --write|--check');
    process.exitCode = 1;
  } else generatePalCatalog({ write: args[0] === '--write' })
    .then(counts => console.log(JSON.stringify({ status: 'Pass', ...counts })))
    .catch(error => { console.error(`Pal collection artwork: ${error.message}`); process.exitCode = 1; });
}

/** Approved artwork identities are independent of saved collection Pal IDs.
 * This module resolves bundled, versioned images; it never grants a companion. */
export const PAL_ARTWORK_ASSET_VERSION = 'core-2026-11-20';
export const PAL_ARTWORK_FORMS = ['base', 'mature'] as const;
export const PAL_ARTWORK_EXPRESSIONS = ['neutral', 'celebrate', 'thinking', 'encouraging_retry'] as const;
export type PalArtworkForm = typeof PAL_ARTWORK_FORMS[number];
export type PalArtworkExpression = typeof PAL_ARTWORK_EXPRESSIONS[number];

export interface PalArtworkAsset {
  readonly form: PalArtworkForm;
  readonly expression: PalArtworkExpression;
  readonly url: string;
  readonly sourceSHA256: string;
  readonly exportedSHA256: string;
  readonly width: number;
  readonly height: number;
  readonly alpha: boolean;
  readonly decodedPixelParity: true;
  readonly decodedRGBA8SHA256: string;
  readonly sourceBytes: number;
  readonly exportedBytes: number;
}
export interface PalArtworkFormRecord {
  readonly neutralFallback: string;
  readonly neutralSourceSHA256: string;
  readonly expressions: Readonly<Partial<Record<PalArtworkExpression, PalArtworkAsset>> & { neutral: PalArtworkAsset }>;
}
export interface PalArtworkCharacter {
  readonly characterKey: string;
  readonly speciesId: string | null;
  readonly slug: string;
  readonly name: string;
  readonly forms: Readonly<Record<PalArtworkForm, PalArtworkFormRecord>>;
}
export interface PalArtworkManifest {
  readonly schemaVersion: 1;
  readonly assetVersion: string;
  readonly scope: Readonly<{ id: string; characterCount: number; assetCount: number }>;
  readonly characters: readonly PalArtworkCharacter[];
}
export interface PalArtworkSelection {
  readonly characterKey: string;
  readonly form: PalArtworkForm;
  readonly expression: PalArtworkExpression;
}
export type PalArtworkFallbackReason = 'expression-unavailable' | 'image-load-failed' | 'image-load-timeout';
export interface PalArtworkResolution {
  readonly characterKey: string;
  readonly slug: string;
  readonly name: string;
  readonly form: PalArtworkForm;
  readonly requestedExpression: PalArtworkExpression;
  readonly expression: PalArtworkExpression;
  readonly asset: PalArtworkAsset;
  readonly fallbackReason: PalArtworkFallbackReason | null;
}
export interface PalArtworkResolver {
  readonly manifest: PalArtworkManifest;
  resolve(selection: PalArtworkSelection): PalArtworkResolution | null;
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max = 160): value is string => typeof value === 'string' && value.length > 0 && value.length <= max
  && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const isPalArtworkForm = (value: unknown): value is PalArtworkForm => value === 'base' || value === 'mature';
export const isPalArtworkExpression = (value: unknown): value is PalArtworkExpression =>
  typeof value === 'string' && (PAL_ARTWORK_EXPRESSIONS as readonly string[]).includes(value);

function asset(input: unknown, slug: string, form: PalArtworkForm, expression: PalArtworkExpression): PalArtworkAsset | null {
  if (!record(input) || input.form !== form || input.expression !== expression || !hash(input.sourceSHA256)
    || !hash(input.exportedSHA256) || !hash(input.decodedRGBA8SHA256) || input.decodedPixelParity !== true
    || !positive(input.width) || !positive(input.height) || input.width > 16_384 || input.height > 16_384
    || typeof input.alpha !== 'boolean' || !positive(input.sourceBytes) || !positive(input.exportedBytes)
    || typeof input.url !== 'string') return null;
  // An approved bundled URL is not a remote URL, a path supplied by a game, or
  // an alias to another character/form. Preserve the application's base path.
  const prefix = `jems-pals/${slug}/${form}/`;
  const filename = input.url.startsWith(prefix) ? input.url.slice(prefix.length) : '';
  const stateName = expression === 'encouraging_retry' ? 'encouraging-retry' : expression;
  if (filename !== `${stateName}-${input.sourceSHA256.slice(0, 12)}.webp`) return null;
  return Object.freeze({ form, expression, url: input.url, sourceSHA256: input.sourceSHA256,
    exportedSHA256: input.exportedSHA256, width: input.width, height: input.height, alpha: input.alpha,
    decodedPixelParity: true, decodedRGBA8SHA256: input.decodedRGBA8SHA256,
    sourceBytes: input.sourceBytes, exportedBytes: input.exportedBytes });
}

/** Fail closed before any image loading. Unknown versions and ambiguous keys
 * cannot silently select different artwork. The returned snapshot is immutable. */
export function createPalArtworkResolver(input: unknown, expectedVersion = PAL_ARTWORK_ASSET_VERSION): PalArtworkResolver | null {
  if (!text(expectedVersion) || !record(input) || input.schemaVersion !== 1 || input.assetVersion !== expectedVersion
    || !record(input.scope) || !text(input.scope.id) || !positive(input.scope.characterCount) || !positive(input.scope.assetCount)
    || !Array.isArray(input.characters) || input.characters.length !== input.scope.characterCount) return null;
  const characters: PalArtworkCharacter[] = [], keys = new Set<string>(), slugs = new Set<string>(), urls = new Set<string>();
  let assetCount = 0;
  for (const raw of input.characters) {
    if (!record(raw) || !text(raw.characterKey) || !text(raw.name, 80) || typeof raw.slug !== 'string'
      || !/^[a-z][a-z0-9-]{0,63}$/.test(raw.slug) || !(raw.speciesId === null || text(raw.speciesId))
      || keys.has(raw.characterKey) || slugs.has(raw.slug) || !record(raw.forms)
      || Object.keys(raw.forms).length !== 2 || !Object.keys(raw.forms).every(isPalArtworkForm)) return null;
    keys.add(raw.characterKey); slugs.add(raw.slug);
    const forms = {} as Record<PalArtworkForm, PalArtworkFormRecord>;
    for (const form of PAL_ARTWORK_FORMS) {
      const row = raw.forms[form];
      if (!record(row) || !record(row.expressions) || !Object.keys(row.expressions).every(isPalArtworkExpression)) return null;
      const expressions: Partial<Record<PalArtworkExpression, PalArtworkAsset>> = {};
      for (const [expression, value] of Object.entries(row.expressions)) {
        const selected = asset(value, raw.slug, form, expression as PalArtworkExpression);
        if (!selected || urls.has(selected.url)) return null;
        urls.add(selected.url); expressions[expression as PalArtworkExpression] = selected; assetCount++;
      }
      const neutral = expressions.neutral;
      if (!neutral || row.neutralFallback !== neutral.url || row.neutralSourceSHA256 !== neutral.sourceSHA256) return null;
      forms[form] = Object.freeze({ neutralFallback: neutral.url, neutralSourceSHA256: neutral.sourceSHA256,
        expressions: Object.freeze({ ...expressions, neutral }) });
    }
    characters.push(Object.freeze({ characterKey: raw.characterKey, speciesId: raw.speciesId,
      slug: raw.slug, name: raw.name, forms: Object.freeze(forms) }));
  }
  if (assetCount !== input.scope.assetCount) return null;
  const manifest: PalArtworkManifest = Object.freeze({ schemaVersion: 1, assetVersion: expectedVersion,
    scope: Object.freeze({ id: input.scope.id, characterCount: characters.length, assetCount }), characters: Object.freeze(characters) });
  const byKey = new Map(characters.map(character => [character.characterKey, character]));
  return Object.freeze({ manifest, resolve(selection: PalArtworkSelection): PalArtworkResolution | null {
    if (!record(selection) || !isPalArtworkForm(selection.form) || !isPalArtworkExpression(selection.expression)
      || typeof selection.characterKey !== 'string') return null;
    const character = byKey.get(selection.characterKey);
    if (!character) return null;
    const expressions = character.forms[selection.form].expressions;
    const selected = expressions[selection.expression] ?? expressions.neutral;
    return Object.freeze({ characterKey: character.characterKey, slug: character.slug, name: character.name,
      form: selection.form, requestedExpression: selection.expression, expression: selected.expression, asset: selected,
      fallbackReason: selected.expression === selection.expression ? null : 'expression-unavailable' });
  } });
}

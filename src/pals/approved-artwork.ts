import { createPalArtworkResolver, type PalArtworkResolver } from './artwork';

let resolved: PalArtworkResolver | null = null;
let loading: Promise<PalArtworkResolver> | null = null;

/** The manifest is small metadata; character pictures load only when selected.
 * No profile data, provider request or collection mutation is involved. */
export function loadApprovedPalArtwork(): Promise<PalArtworkResolver> {
  if (resolved) return Promise.resolve(resolved);
  if (loading) return loading;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  // Keep the exact allowlisted path so the versioned offline shell can serve
  // its manifest. The resolver validates the asset version inside the file.
  const url = new URL('jems-pals/manifest.json', document.baseURI);
  loading = fetch(url, { signal: controller.signal, cache: 'no-cache', credentials: 'same-origin' })
    .then(async response => {
      if (!response.ok) throw Error('Pal pictures could not load. Try again.');
      const resolver = createPalArtworkResolver(await response.json());
      if (!resolver || resolver.manifest.scope.id !== 'active-core-21'
        || resolver.manifest.scope.characterCount !== 21 || resolver.manifest.scope.assetCount !== 168) {
        throw Error('Pal pictures could not load. Try again.');
      }
      resolved = resolver;
      return resolver;
    }).finally(() => { clearTimeout(timeout); loading = null; });
  return loading;
}

export function loadedPalArtwork(): PalArtworkResolver | null { return resolved; }

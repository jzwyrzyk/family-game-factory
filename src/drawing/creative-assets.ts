import { deriveArtUsages, preparedUsageSources, originalPictureId, ownerArtRecords, type ArtUsage, withArtTransaction, type DrawingMetadata } from './library';
import { validateAssembly, type DrawingAssembly } from './model';
import type { SavedRig } from './store';
import { canonicalArtSemantic, type DrawingCategory } from '../assets/private-drawings';
import { CREATION_ASSETS, privateArtId } from '../creation/projects';

export interface CreativeAssetChoice {
  origin: 'private';
  /** Root picture ID within the active owner. An adventure saves assetId, the exact version. */
  creativeId: string;
  identity: {name:string; semantic:string; category:DrawingCategory; originalId:string; originalSha256:string};
  /** Immediate raster lineage. Rig choices retain the image this rig binds. */
  picture: {id:string; sha256:string; parentId?:string; parentSha256?:string};
  drawingId: string;
  rigId?: string;
  rigKind?: DrawingAssembly['kind'];
  assetId: string;
  label: string;
  semantic: string;
  category: DrawingCategory;
  detail: string;
  revisionNumber: number;
  savedAt: string;
  animatedIn?: string;
  previewBytes?: ArrayBuffer;
}

export interface CatalogueChoice {
  origin: 'pal' | 'jems';
  assetId: string;
  label: string;
  imageUrl: string;
}

export function catalogueChoices(owned: readonly {id:string;form:string}[]): CatalogueChoice[] {
  return CREATION_ASSETS.filter(asset => asset.kind === 'image' && asset.url &&
    (!asset.palId || asset.palForm && owned.some(pal => pal.id === asset.palId && pal.form === asset.palForm)))
    .map(asset => ({assetId:asset.id, label:asset.label, origin:asset.palId ? 'pal' : 'jems', imageUrl:asset.url!}));
}
const privateOwners = new WeakMap<CreativeAssetChoice, string>();

export async function assemblyHash(input: DrawingAssembly): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(validateAssembly(input)));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Older edited pictures already carry immutable parent IDs and fingerprints.
 * Resolve them without rewriting either a picture or a saved adventure. */
export async function creativeAssetChoices(owner: string, pictures: DrawingMetadata[], rigs: SavedRig[]): Promise<CreativeAssetChoice[]> {
  const sources = new Map(pictures.filter(picture => picture.owner === owner).map(canonicalArtSemantic).map(picture => [picture.id, picture]));
  const groups = new Map<string, DrawingMetadata[]>();
  for (const picture of sources.values()) {
    const creativeId = originalPictureId(picture,sources);
    const revisions = groups.get(creativeId) ?? [];
    revisions.push(picture);
    groups.set(creativeId, revisions);
  }
  const choices: CreativeAssetChoice[] = [];
  for (const [creativeId, revisions] of groups) {
    const root = sources.get(creativeId)!;
    const identity = {name:root.name, semantic:root.semantic ?? '', category:root.category ?? 'other' as DrawingCategory,
      originalId:root.id, originalSha256:root.sha256};
    revisions.sort((a, b) => Number(b.id === creativeId) - Number(a.id === creativeId) ||
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    for (const [index, picture] of revisions.entries()) {
      if (picture.archived) continue;
      const savedRigs = rigs.filter(rig => rig.owner === owner && rig.assembly.sourceId === picture.id && rig.assembly.sourceSha256 === picture.sha256)
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt) || b.id.localeCompare(a.id));
      const base: CreativeAssetChoice = {
        origin: 'private', creativeId, identity, drawingId: picture.id,
        picture:{id:picture.id, sha256:picture.sha256, ...(picture.sourceId ? {parentId:picture.sourceId,parentSha256:picture.sourceSha256} : {})}, assetId: privateArtId({kind:'image',id:picture.id,sha256:picture.sha256}),
        label: picture.name, semantic: picture.semantic ?? '', category: picture.category ?? 'other',
        detail: picture.sourceId ? 'Edited picture' : 'Original artwork', revisionNumber: index + 1,
        savedAt: picture.createdAt, previewBytes: picture.preview,
      };
      choices.push(base);
      for (const [version, rig] of savedRigs.entries()) {
        const assetId = privateArtId({kind:'rig',id:rig.id,sha256:await assemblyHash(rig.assembly)});
        choices.push({...base, rigId: rig.id, rigKind: rig.assembly.kind, assetId, savedAt: rig.savedAt,
          detail: version === 0 ? 'Latest saved cutout design' : 'Saved cutout design ' + (savedRigs.length - version)});
      }
    }
  }
  for (const choice of choices) privateOwners.set(choice, owner);
  return choices.sort((a,b) => b.savedAt.localeCompare(a.savedAt) || a.assetId.localeCompare(b.assetId));
}

export async function listCreativeAssets(owner: string, current: () => boolean = () => true) {
  const check = () => {
    const active = typeof window !== 'undefined' ? (window as any).FG?.store?.current?.()?.id : undefined;
    if (!current() || active !== undefined && String(active) !== owner) throw Error('The player changed. Open your own art again.');
  };
  check();
  const [pictures, rigs, usage] = await withArtTransaction(['drawingMetadata', 'rigs', 'usage'], 'readonly', tx => Promise.all([
    ownerArtRecords<DrawingMetadata>(tx, 'drawingMetadata', owner), ownerArtRecords<SavedRig>(tx, 'rigs', owner), ownerArtRecords<ArtUsage>(tx, 'usage', owner),
  ]));
  check();
  const choices = await creativeAssetChoices(owner, pictures, rigs);
  check();
  const prepared = await preparedUsageSources(owner);
  check();
  const usages = deriveArtUsages(owner,pictures,rigs,usage,prepared);
  const animated = new Map<string,string>();
  for (const use of usages) {
    if (use.contexts?.includes('animation')) animated.set(use.rigId || use.drawingId, use.title || 'a saved scene');
  }
  for (const item of choices) item.animatedIn = animated.get(item.rigId || item.drawingId);
  const recent = new Map<string,string>();
  for (const used of usage) {
    const key = used.rigId || used.drawingId;
    if (used.usedAt && used.usedAt > (recent.get(key) ?? '')) recent.set(key,used.usedAt);
  }
  const recentDate = (item:CreativeAssetChoice) => recent.get(item.rigId || item.drawingId) ?? item.savedAt;
  return choices.sort((a,b) => recentDate(b).localeCompare(recentDate(a)));
}

const categoryNames = {character: 'My characters', prop: 'My things', vehicle: 'My vehicles', world: 'My worlds'} as const;
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  return el;
}

export interface CreativePickerOptions {
  onChoose: (item: CreativeAssetChoice, button: HTMLButtonElement) => void;
  preview?: (item: CreativeAssetChoice) => HTMLElement;
  onCreate?: () => void;
  compatibility?: (item: CreativeAssetChoice) => string | undefined;
  catalogue?: readonly CatalogueChoice[];
  cataloguePreview?: (item: CatalogueChoice) => HTMLElement;
  catalogueCompatibility?: (item: CatalogueChoice) => string | undefined;
  onChooseCatalogue?: (item: CatalogueChoice) => void;
  roleLabel?: string;
  relatedCreativeId?: string;
}

function thumbnail(item: CreativeAssetChoice, urls: Set<string>) {
  const owner = privateOwners.get(item);
  if ((item.rigId || !item.previewBytes) && owner) {
    const canvas = element('canvas');
    canvas.width = canvas.height = 96;
    const current = () => canvas.isConnected && String((window as any).FG?.store?.current?.()?.id) === owner;
    void import('../creation/private-art').then(async ({resolvePrivateArt}) => {
      if (!current()) return;
      const resolved = await resolvePrivateArt(owner, item.assetId, current);
      if (!current()) return;
      const {image} = resolved, scale = 96 / Math.max(image.width, image.height);
      const width = image.width * scale, height = image.height * scale;
      canvas.getContext('2d')!.drawImage(image, (96-width)/2, (96-height)/2, width, height);
    }).catch(() => { if (current()) canvas.replaceWith(element('small', 'Picture unavailable')); });
    return canvas;
  }
  const image = element('img');
  image.alt = '';
  if (item.previewBytes) {
    const url = URL.createObjectURL(new Blob([item.previewBytes], {type:'image/png'}));
    urls.add(url);
    image.onload = image.onerror = () => { urls.delete(url); URL.revokeObjectURL(url); };
    image.src = url;
  }
  return image;
}

/** The caller chooses the scene role, resolves a pin in its trusted host, and
 * guards its return to the originating activity. This UI never assigns physics. */
export function mountCreativeAssetPicker(container: HTMLElement, choices: readonly CreativeAssetChoice[], options: CreativePickerOptions) {
  const root = element('div'), tools = element('div'), results = element('div'), count = element('p');
  root.className = 'creative-picker';
  tools.className = 'creative-picker-tools';
  results.className = 'creative-picker-results';
  count.setAttribute('role', 'status');
  const search = element('input'), group = element('select');
  search.type = 'search'; search.placeholder = 'Find my art'; search.setAttribute('aria-label', 'Find artwork'); search.maxLength = 60;
  group.setAttribute('aria-label', 'Art collection');
  const names = {recent:'Recent art', ...(options.relatedCreativeId ? {family:'Versions of this picture'} : {}), ...categoryNames, motion:'Moving creations', versions:'Saved versions',
    ...(options.catalogue ? {pal:'My Pals', jems:'Jems artwork'} : {})};
  for (const [id, title] of Object.entries(names)) group.add(new Option(title, id));
  tools.append(search, group);
  if (options.onCreate) {
    const create = element('button', 'Draw or add a picture');
    create.type = 'button'; create.className = 'creation-button'; create.onclick = options.onCreate;
    tools.append(create);
  }
  if (options.roleLabel) root.append(element('p', options.roleLabel));
  root.append(tools, count, results);
  container.replaceChildren(root);
  const urls = new Set<string>();
  const release = () => { for (const url of urls) URL.revokeObjectURL(url); urls.clear(); };
  let limit = 12;
  function render() {
    release(); results.replaceChildren();
    const query = search.value.trim().toLowerCase(), collection = group.value;
    if (collection === 'pal' || collection === 'jems') {
      const items = options.catalogue?.filter(item => item.origin === collection && item.label.toLowerCase().includes(query)) ?? [];
      count.textContent = collection === 'pal' ? 'Pals in your collection' : 'Artwork from Jems';
      if (!items.length) count.textContent = 'No pictures here yet.';
      for (const item of items) {
        const button = element('button'), image = element('img');
        image.src = item.imageUrl; image.alt = ''; button.type = 'button'; button.className = 'creation-character-choice';
        button.dataset.catalogueChoice = item.assetId;
        const reason = options.catalogueCompatibility?.(item);
        button.disabled = !!reason;
        button.append(options.cataloguePreview?.(item) ?? image, element('strong', item.label));
        if (reason) button.append(element('small', reason));
        button.onclick = () => options.onChooseCatalogue?.(item); results.append(button);
      }
      return;
    }
    const items = choices.filter(item => {
      if (collection === 'family' && item.creativeId !== options.relatedCreativeId) return false;
      if (collection === 'motion' && !item.rigId && !item.animatedIn || collection === 'versions' && !item.rigId && item.revisionNumber === 1) return false;
      if (collection in categoryNames && item.category !== collection && !(collection === 'prop' && item.category === 'other')) return false;
      return !query || [item.label, item.semantic, item.detail, item.identity.name, item.identity.semantic].some(text => text.toLowerCase().includes(query));
    });
    count.textContent = items.length ? `${items.length} saved ${items.length === 1 ? 'choice' : 'choices'}` : 'No pictures here yet.';
    for (const item of items.slice(0, limit)) {
      const button = element('button'), reason = options.compatibility?.(item);
      button.type = 'button'; button.className = 'creation-character-choice';
      button.dataset.privateArt = item.assetId;
      button.disabled = Boolean(reason);
      const detail = collection === 'motion' && item.animatedIn ? 'Animated in ' + item.animatedIn : item.detail + (item.revisionNumber > 1 ? ' · Picture ' + item.revisionNumber : '');
      button.append(options.preview?.(item) ?? thumbnail(item, urls), element('strong', item.label), element('small', reason || detail));
      button.onclick = () => options.onChoose(item, button);
      results.append(button);
    }
    if (items.length > limit) {
      const more = element('button', 'More pictures'); more.type = 'button'; more.className = 'creation-button';
      more.onclick = () => { limit += 12; render(); results.querySelectorAll<HTMLButtonElement>('[data-private-art]')[limit-12]?.focus(); };
      results.append(more);
    }
  }
  search.oninput = group.onchange = () => { limit = 12; render(); };
  render();
  return () => { release(); root.remove(); };
}

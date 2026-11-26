import {listCreativeAssetChoices,type CreativeAssetChoice} from '../assets/creative-library';
import {activeArtView} from '../assets/art-lineage';
import {artUsages} from './library';
import {CREATION_ASSETS} from '../creation/projects';
import './creative-picker.css';
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
type PickerChoice=CreativeAssetChoice & {animatedIn?:string};
const privateOwners=new WeakMap<PickerChoice,string>();
export async function listPickerChoices(owner:string,current:()=>boolean):Promise<PickerChoice[]> {
  const valid=activeArtView(owner,current);
  const [choices,uses]=await Promise.all([listCreativeAssetChoices(owner,valid),artUsages(owner)]);
  if(!valid())throw Error('Reopen your own artwork.');
  const motions=new Map(uses.filter(u=>u.contexts?.includes('animation')).map(u=>[u.rigId ?? u.drawingId,u.title ?? 'a saved scene']));
  return choices.map(choice=>{
    const item={...choice,animatedIn:motions.get(choice.rigId ?? choice.drawingId)};
    privateOwners.set(item,owner);return item;
  }).sort((a,b)=>b.savedAt.localeCompare(a.savedAt)||a.assetId.localeCompare(b.assetId));
}
const categoryNames = {character: 'My characters', prop: 'My things', vehicle: 'My vehicles', world: 'My worlds'} as const;
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  return el;
}

export interface CreativePickerOptions {
  onChoose: (item: PickerChoice, button: HTMLButtonElement) => void;
  preview?: (item: PickerChoice) => HTMLElement;
  onCreate?: () => void;
  compatibility?: (item: PickerChoice) => string | undefined;
  catalogue?: readonly CatalogueChoice[];
  cataloguePreview?: (item: CatalogueChoice) => HTMLElement;
  catalogueCompatibility?: (item: CatalogueChoice) => string | undefined;
  onChooseCatalogue?: (item: CatalogueChoice) => void;
  roleLabel?: string;
  relatedCreativeId?: string;
  layout?:{controls:HTMLElement;results:HTMLElement;status:HTMLElement};
  card?:(item:PickerChoice)=>HTMLButtonElement;
}

function thumbnail(item: PickerChoice, urls: Set<string>) {
  const owner = privateOwners.get(item);
  if ((item.rigId || !item.preview) && owner) {
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
  if (item.preview) {
    const url = URL.createObjectURL(new Blob([item.preview], {type:'image/png'}));
    urls.add(url);
    image.onload = image.onerror = () => { urls.delete(url); URL.revokeObjectURL(url); };
    image.src = url;
  }
  return image;
}

/** The caller chooses the scene role, resolves a pin in its trusted host, and
 * guards its return to the originating activity. This UI never assigns physics. */
export function mountCreativeAssetPicker(container: HTMLElement, choices: readonly PickerChoice[], options: CreativePickerOptions) {
  const root = element('div'),tools=options.layout?.controls ?? element('div'),
    results=options.layout?.results ?? element('div'),count=options.layout?.status ?? element('p');
  const empty=count.textContent;
  tools.replaceChildren();results.replaceChildren();
  root.className = 'creative-picker';
  tools.classList.add('creative-picker-tools');
  results.classList.add('creative-picker-results');
  count.setAttribute('role', 'status');
  const search = element('input'), group = element('select');
  search.type = 'search'; search.placeholder = 'Find my art'; search.setAttribute('aria-label',options.layout?'Find my art':'Find artwork'); search.maxLength = 60;
  group.setAttribute('aria-label', 'Art collection');
  const names = {...(options.layout?{'':'All my art'}:{recent:'Recent art'}), ...(options.relatedCreativeId ? {family:'Versions of this picture'} : {}), ...categoryNames, other:'Other art', motion:'Moving creations', versions:'Saved versions',
    ...(options.catalogue ? {pal:'My Pals', jems:'Jems artwork'} : {})};
  for (const [id, title] of Object.entries(names)) group.add(new Option(title, id));
  tools.append(search, group);
  if (options.onCreate) {
    const create = element('button', 'Draw or add a picture');
    create.type = 'button'; create.className = 'creation-button'; create.onclick = options.onCreate;
    tools.append(create);
  }
  if (options.roleLabel) root.append(element('p', options.roleLabel));
  if(!options.layout){root.append(tools,count,results);container.replaceChildren(root);}
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
      if (collection === 'family' && item.logicalId !== options.relatedCreativeId) return false;
      if (collection === 'motion' && !item.rigId && !item.animatedIn || collection === 'versions' && !item.rigId && item.revisionNumber === 1) return false;
      if(collection==='other' && item.category!=='other')return false;
      if (collection in categoryNames && item.category !== collection && !(!options.layout && collection === 'prop' && item.category === 'other')) return false;
      return !query || [item.label, item.semanticIdentity ?? '', item.detail, item.logicalName].some(text => text.toLowerCase().includes(query));
    });
    count.textContent = items.length ? `${items.length} saved ${items.length === 1 ? 'choice' : 'choices'}` : choices.length ? 'No art found. Try another name or collection.' : empty || 'No pictures here yet.';
    for (const item of items.slice(0, limit)) {
      if(options.card){results.append(options.card(item));continue;}
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
      const more = element('button', options.layout?'Show more art':'More pictures'); more.type = 'button'; more.className = 'creation-button';
      more.onclick = () => { limit += 12; render(); results.querySelectorAll<HTMLButtonElement>('[data-private-art]')[limit-12]?.focus(); };
      results.append(more);
    }
  }
  search.oninput = group.onchange = () => { limit = 12; render(); };
  render();
  return () => { release(); root.remove(); };
}

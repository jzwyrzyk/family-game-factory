import {creativeAssetChoices, type CreativeAssetChoice} from './creative-catalog';
import {resolvePrivateArt} from '../creation/private-art';
import {matchesArtSearch} from './creative-identity';
import type {DrawingCategory} from './private-drawings';
import type {DrawingKind} from '../drawing/model';
import './creative-picker.css';

export interface CreativePickerOptions {
  title?:string;
  category?:DrawingCategory;
  imagesOnly?:boolean;
  rigKind?:DrawingKind;
}
const categoryLabels:Record<DrawingCategory,string> = {
  character:'Characters', prop:'Things', vehicle:'Vehicles', world:'Worlds', other:'Other art'
};

function element<K extends keyof HTMLElementTagNameMap>(tag:K, text?:string) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  return node;
}

/** Embeddable inside existing host dialogs. Hosts dispose it on close. */
export function mountCreativePicker(box:HTMLElement, owner:string, current:()=>boolean,
    onChoose:(choice:CreativeAssetChoice)=>Promise<void>|void, options:CreativePickerOptions = {}) {
  let disposed = false;
  let choices:CreativeAssetChoice[] = [];
  let visibleCount = 12;
  const urls = new Map<string,string>();
  const active = () => !disposed && current();
  const controls = element('div');
  controls.className = 'creative-picker-controls';
  const searchLabel = element('label','Find my art');
  const search = element('input');
  search.type = 'search';
  search.maxLength = 60;
  searchLabel.append(search);
  const categoryLabel = element('label','Collection');
  const category = element('select');
  category.append(new Option('All my art',''));
  for (const [value,label] of Object.entries(categoryLabels)) category.append(new Option(label,value));
  category.value = options.category || '';
  categoryLabel.append(category);
  controls.append(searchLabel,categoryLabel);
  const status = element('p','Opening your art…');
  status.setAttribute('role','status');
  const grid = element('div');
  grid.className = 'creative-picker-grid';
  box.classList.add('creative-picker');
  box.replaceChildren(controls,status,grid);
  let choosing = false;
  let renderId = 0;
  let previewQueue = Promise.resolve();
  function render() {
    if (!active()) return;
    const generation = ++renderId;
    grid.replaceChildren();
    const query = search.value.trim().toLowerCase();
    const matches = choices.filter(choice =>
      (!category.value || choice.category === category.value) &&
      (matchesArtSearch({name:choice.label,semanticIdentity:choice.semanticIdentity},query) || choice.identityName.toLowerCase().includes(query)));
    status.textContent = matches.length ? '' : choices.length ? 'Try another name or collection.' : 'Add a drawing in My Art to find it here.';
    for (const choice of matches.slice(0,visibleCount)) {
      const button = element('button');
      button.type = 'button';
      button.dataset.privateArt = choice.assetId;
      if (choice.rigId || !choice.preview) {
        // Saved cutouts can differ materially from the original thumbnail.
        // Decode visible choices one at a time, then retain only a card-sized
        // raster. A stale search or profile cannot paint the next shelf.
        const canvas = element('canvas');
        canvas.width = canvas.height = 120;
        canvas.setAttribute('aria-hidden','true');
        button.append(canvas);
        const live = () => active() && generation === renderId;
        previewQueue = previewQueue.then(async () => {
          if (!live()) return;
          try {
            const {image} = await resolvePrivateArt(owner,choice.assetId,live);
            if (!live()) return;
            const scale = Math.min(120 / image.width,120 / image.height);
            const w = image.width * scale, h = image.height * scale;
            canvas.getContext('2d')!.drawImage(image,(120-w)/2,(120-h)/2,w,h);
          } catch {
            if (live()) {
              button.disabled = true;
              button.append(element('span','Restore this art in My Art.'));
            }
          }
        });
      } else if (choice.preview) {
        let url = urls.get(choice.drawingId);
        if (!url) {
          url = URL.createObjectURL(new Blob([choice.preview],{type:'image/png'}));
          urls.set(choice.drawingId,url);
        }
        const img = element('img');
        img.alt = '';
        img.src = url;
        button.append(img);
      }
      button.append(element('strong',choice.label),element('span',choice.detail));
      button.onclick = async () => {
        if (choosing || !active()) return;
        choosing = true;
        button.disabled = true;
        try { await onChoose(choice); }
        catch (error) { if (active()) status.textContent = (error as Error).message; }
        finally { choosing = false; button.disabled = false; }
      };
      grid.append(button);
    }
    if (matches.length > visibleCount) {
      const more = element('button','Show more art');
      more.type = 'button';
      more.onclick = () => {
        const previous = visibleCount;
        visibleCount += 12;
        render();
        grid.querySelectorAll('button')[previous]?.focus();
      };
      grid.append(more);
    }
  }
  search.oninput = category.onchange = () => { visibleCount = 12; render(); };
  const ready = creativeAssetChoices(owner,active).then(items => {
    if (!active()) return;
    choices = items.filter(item => (!options.imagesOnly || !item.rigId) && (!options.rigKind || item.rigKind === options.rigKind));
    render();
  }).catch(error => { if (active()) status.textContent = (error as Error).message; });
  return {ready, dispose() {
    disposed = true;
    for (const url of urls.values()) URL.revokeObjectURL(url);
    urls.clear();
    choices = [];
    box.replaceChildren();
  }};
}

export function pickCreativeAsset(owner:string, current:()=>boolean, options:CreativePickerOptions = {}):Promise<CreativeAssetChoice|null> {
  if (!current()) return Promise.resolve(null);
  const dialog = element('dialog');
  dialog.className = 'creative-picker-dialog';
  const title = element('h2', options.title || 'Choose your art');
  title.id = 'creative-picker-'+crypto.randomUUID();
  dialog.setAttribute('aria-labelledby',title.id);
  const close = element('button','Close');
  close.type = 'button';
  const body = element('div');
  dialog.append(title,close,body);
  const fullscreen = document.fullscreenElement;
  (fullscreen || document.body).append(dialog);
  dialog.showModal();
  return new Promise(resolve => {
    let result:CreativeAssetChoice|null = null;
    const picker = mountCreativePicker(body, owner, () => current() && dialog.open, choice => { result = choice; dialog.close(); }, options);
    const dismiss = () => dialog.close();
    close.onclick = dismiss;
    window.addEventListener('factory-profile',dismiss);
    window.addEventListener('factory-page',dismiss);
    dialog.addEventListener('close', () => {
      picker.dispose();
      window.removeEventListener('factory-profile',dismiss);
      window.removeEventListener('factory-page',dismiss);
      dialog.remove();
      resolve(current() ? result : null);
    }, {once:true});
  });
}

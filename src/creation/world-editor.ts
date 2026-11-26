import type { CreationProject, SceneBackground, WorldDecoration } from './model';
import { listArtChoices, type PrivateArtResolver } from './private-art';
import { showAssetPicker } from '../drawing/asset-picker';
import type { CreationWorkspace } from '../storage/creation-workspace';
import { SCENERY_ART, SCENERY_LIMIT, WORLD_PLATES } from './worlds';

interface WorldEditorHost {
  owner(): string;
  store(): Promise<CreationWorkspace>;
  current(): boolean;
  project(): CreationProject | null;
  mutate(change: (project: CreationProject) => void): Promise<void>;
  run(action: () => Promise<void>): unknown;
  art(id: string): HTMLElement;
  privateArt: PrivateArtResolver;
}

export const worldControls = `<section class="world-editor" aria-label="Build your world">
  <label>World <select id="creationBackground"></select></label>
  <div class="world-buttons"><button id="creationChooseBackdrop" class="creation-button">Use my art as the world</button>
  <button id="creationClearBackdrop" class="creation-button">Use the Jems picture</button>
  <label id="creationFrameLabel">Picture size <select id="creationBackdropFrame"><option value="fit">Show it all</option><option value="fill">Fill the stage</option></select></label></div>
  <details id="creationUseSavedWorld"><summary>Use a world from my scenes</summary><div id="creationKeptWorlds" class="world-buttons"></div></details>
  <details><summary>Decorate the world</summary><div class="world-decoration-tools">
  <label>Decoration <select id="creationSceneryType"></select></label>
  <button id="creationAddScenery" class="creation-button">Add decoration</button><button id="creationChooseScenery" class="creation-button">Add my art</button>
  <div id="creationWorldPieces"></div></div></details></section>`;

export const worldArtDialog = `<dialog id="creationWorldArtDialog" class="creation-dialog" aria-labelledby="creationWorldArtTitle"><div class="creation-shelf-heading"><h2 id="creationWorldArtTitle">Choose your artwork</h2><button id="creationCloseWorldArt" class="creation-button">Close</button></div><div id="creationWorldFilters" class="creative-picker-tools"></div><p id="creationWorldArtStatus" role="status"></p><div id="creationWorldArtChoices" class="creation-actor-choices"></div></dialog>`;

export function setupWorldEditor(page: HTMLElement, host: WorldEditorHost) {
  const get = <T extends HTMLElement>(id: string) => page.querySelector<T>('#' + id)!;
  const background = get<HTMLSelectElement>('creationBackground');
  const framing = get<HTMLSelectElement>('creationBackdropFrame');
  const decoration = get<HTMLSelectElement>('creationSceneryType');
  const dialog = get<HTMLDialogElement>('creationWorldArtDialog');
  background.add(new Option('Original scene', 'legacy'));
  for (const [key, plate] of Object.entries(WORLD_PLATES)) background.add(new Option(plate.label, key));
  let shownCatalogue = '';
  function renderDecorationList(key: SceneBackground) {
    if (key === shownCatalogue) return;
    const selected = decoration.value, preferred = WORLD_PLATES[key].props ?? [];
    decoration.replaceChildren();
    for (const current of [true, false]) {
      const group = document.createElement('optgroup');
      group.label = current ? WORLD_PLATES[key].label : 'More decorations';
      for (const asset of SCENERY_ART.filter(asset => preferred.includes(asset.id) === current)) group.append(new Option(asset.label, asset.id));
      if (group.childElementCount) decoration.append(group);
    }
    if (selected && preferred.includes(selected)) decoration.value = selected;
    shownCatalogue = key;
  }
  const edit = (change: (project: CreationProject) => void) => host.run(() => host.mutate(change));
  const world = (p: CreationProject) => p.world ??= { edition: 'jems.world.v1' };
  background.onchange = () => {
    const key = background.value as SceneBackground;
    if (!Object.hasOwn(WORLD_PLATES, key)) return;
    edit(p => { p.background = key; delete world(p).backdrop; delete world(p).framing; });
  };
  framing.onchange = () => {
    const selected = framing.value as 'fit' | 'fill';
    edit(p => { if (p.world?.backdrop) p.world.framing = selected; });
  };
  get('creationClearBackdrop').onclick = () => edit(p => { delete world(p).backdrop; delete world(p).framing; });

  function addDecoration(p: CreationProject, assetId: string, label: string) {
    const scenery = world(p).scenery ??= [];
    if (scenery.length >= SCENERY_LIMIT) throw Error('Remove a decoration before adding another.');
    scenery.push({ id: crypto.randomUUID(), label: label.slice(0, 60), assetId,
      x: Math.round(p.width * .25), y: Math.round(p.height * .7), size: 96, layer: 'behind' });
  }
  get('creationAddScenery').onclick = () => {
    const art = SCENERY_ART.find(asset => asset.id === decoration.value)!;
    edit(p => addDecoration(p, art.id, art.label));
  };

  function pickArt(asBackdrop: boolean) {
    const owner = host.owner(), project = host.project();
    if (!host.current() || !project) return;
    const current = () => host.owner() === owner && host.current() && host.project() === project && dialog.open;
    dialog.showModal();
    const choices = get('creationWorldArtChoices'), status = get('creationWorldArtStatus');
    choices.replaceChildren(); get('creationWorldFilters').replaceChildren(); status.textContent = 'Opening My Art…';
    get('creationWorldArtTitle').textContent = asBackdrop ? 'Choose your world picture' : 'Choose a decoration';
    void listArtChoices(owner, current).then(items => {
      if (!current()) return;
      status.textContent = items.length ? '' : 'Save a drawing in My Art first.';
      showAssetPicker(get('creationWorldFilters'), choices, status, items, item => {
        const button = document.createElement('button'), name = document.createElement('strong'), detail = document.createElement('small');
        button.type = 'button'; button.className = 'creation-character-choice'; button.dataset.worldArt = item.assetId;
        name.textContent = item.label; detail.textContent = item.detail;
        button.append(host.art(item.assetId), name, detail);
        button.onclick = () => host.run(async () => {
          if (!current()) return;
          try {
            await host.privateArt.load(item.assetId);
            if (!current()) return;
            await host.mutate(p => {
              if (asBackdrop) { world(p).backdrop = item.assetId; world(p).framing = 'fit'; }
              else addDecoration(p, item.assetId, item.label);
            });
            dialog.close();
          } catch (error) { if (current()) status.textContent = (error as Error).message; }
        });
        return button;
      }, 'creationWorldArt');
    }).catch(error => { if (current()) status.textContent = (error as Error).message; });
  }
  get('creationChooseBackdrop').onclick = () => pickArt(true);
  get('creationChooseScenery').onclick = () => pickArt(false);
  get('creationCloseWorldArt').onclick = () => dialog.close();
  dialog.addEventListener('close', () => get('creationWorldArtChoices').replaceChildren());

  const savedWorlds = get<HTMLDetailsElement>('creationUseSavedWorld');
  savedWorlds.ontoggle = () => {
    const list = get('creationKeptWorlds');
    list.replaceChildren();
    if (!savedWorlds.open || !host.current()) return;
    const owner = host.owner(), active = host.project();
    const current = () => host.owner() === owner && host.current() && host.project() === active && savedWorlds.open;
    host.run(async () => {
      if (!current()) return;
      const store = await host.store(), entries = await store.list(owner);
      if (!current()) return;
      for (const entry of entries) {
        if (!entry.keptId || entry.id === active?.id) continue;
        const button = document.createElement('button');
        button.className = 'creation-button'; button.textContent = entry.title;
        button.onclick = () => host.run(async () => {
          if (!current()) return;
          let cursor: string | null = null;
          do {
            const history = await store.historyPage(entry.id, owner, cursor, 24);
            if (!current()) return;
            const revision = history.items.find(r => r.id === entry.keptId);
            if (revision) {
              const source = revision.scene;
              for (const id of new Set([source.world?.backdrop, ...(source.world?.scenery ?? []).map(p => p.assetId)]))
                if (id?.startsWith('art:')) { await host.privateArt.load(id); if (!current()) return; }
              await host.mutate(p => {
                p.background = source.background;
                if (!source.world) { delete p.world; return; }
                p.world = structuredClone(source.world);
                for (const prop of p.world.scenery ?? []) {
                  prop.x = Math.round(prop.x * p.width / source.width);
                  prop.y = Math.round(prop.y * p.height / source.height);
                }
              });
              savedWorlds.open = false;
              return;
            }
            cursor = history.next;
          } while (cursor);
          throw Error('Reopen the saved world list to choose an available version.');
        });
        list.append(button);
      }
      if (!list.childElementCount) list.textContent = 'Keep another scene to use its world here.';
    });
  };

  function render(p: CreationProject) {
    savedWorlds.open = false;
    renderDecorationList(p.background);
    background.options[0].hidden = !!p.world; background.value = p.world ? p.background : 'legacy';
    get('creationClearBackdrop').hidden = !p.world?.backdrop;
    get('creationFrameLabel').hidden = !p.world?.backdrop;
    framing.value = p.world?.framing ?? 'fit';
    const list = get('creationWorldPieces'); list.replaceChildren();
    const pieces = p.world?.scenery ?? [];
    for (const id of ['creationAddScenery', 'creationChooseScenery']) get<HTMLButtonElement>(id).disabled = pieces.length >= SCENERY_LIMIT;
    for (const piece of pieces) {
      const row = document.createElement('fieldset'), name = document.createElement('legend');
      row.className = 'world-piece'; name.textContent = piece.label; row.append(name);
      const update = (fn: (item: WorldDecoration) => void) => edit(next => {
        const item = next.world?.scenery?.find(item => item.id === piece.id);
        if (item) fn(item);
      });
      const button = (label: string, change: () => unknown) => {
        const b = document.createElement('button'); b.className = 'creation-button'; b.textContent = label; b.type = 'button';
        b.id = 'world-' + piece.id + '-' + label.toLowerCase().replaceAll(' ', '-');
        b.onclick = change; row.append(b); return b;
      };
      const step = 30;
      button('Left', () => update(s => s.x = Math.max(0, s.x - step))).disabled = piece.x <= 0;
      button('Right', () => update(s => s.x = Math.min(p.width, s.x + step))).disabled = piece.x >= p.width;
      button('Up', () => update(s => s.y = Math.max(0, s.y - step))).disabled = piece.y <= 0;
      button('Down', () => update(s => s.y = Math.min(p.height, s.y + step))).disabled = piece.y >= p.height;
      button('Bigger', () => update(s => s.size = Math.min(400, s.size + 20))).disabled = piece.size >= 400;
      button('Smaller', () => update(s => s.size = Math.max(16, s.size - 20))).disabled = piece.size <= 16;
      const inFront = piece.layer === 'in-front';
      button('In front', () => update(s => s.layer = inFront ? 'behind' : 'in-front')).setAttribute('aria-pressed', String(inFront));
      button('Remove', () => edit(next => { world(next).scenery = world(next).scenery?.filter(s => s.id !== piece.id); }));
      list.append(row);
    }
  }
  return { render, close: () => dialog.close() };
}

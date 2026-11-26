import { ILLUSTRATED_WORLDS, WORLD_PROPS } from './illustrated-art';
import type { CreationProject, SceneActor } from './model';

// Paint order is independent of interpreter order, including simultaneous programs.
export function orderedPlacements<T extends SceneActor>(actors:T[]):T[] {
  if (!actors.some(actor => actor.stackOrder !== undefined)) return actors;
  return actors.map((actor,index) => ({actor, rank:actor.stackOrder ?? index}))
    .sort((a,b) => a.rank - b.rank).map(item => item.actor);
}

export function stackPlacement(project:CreationProject, selected:SceneActor, top:boolean) {
  const peers = orderedPlacements(project.actors).filter(actor =>
    actor.id !== selected.id && (actor.layer ?? 'middle') === (selected.layer ?? 'middle'));
  if (top) peers.push(selected);
  else peers.unshift(selected);
  peers.forEach((actor,index) => { actor.stackOrder = index; });
}

export function worldTiles(open: (id: string) => void) {
  const tiles = document.createElement('div');
  tiles.id = 'creationWorldTiles';
  tiles.className = 'creation-world-tiles';
  for (const world of ILLUSTRATED_WORLDS) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.dataset.world = world.id;
    const image = document.createElement('img');
    image.alt = ''; image.src = world.preview; image.decoding = 'async';
    const label = document.createElement('strong');
    label.textContent = world.label;
    tile.append(image, label);
    tile.onclick = () => open(world.id);
    tiles.append(tile);
  }
  return tiles;
}

type LayerName = 'middle' | 'foreground';
export function setWorldLayer(project: CreationProject, name: LayerName, visible: boolean) {
  project.worldLayers = { middle: true, foreground: true, ...project.worldLayers, [name]: visible };
}

export function placeBackdrop(project: CreationProject, art: { assetId: string; label: string }): SceneActor {
  const existing = project.actors.find(actor => actor.layer === 'backdrop');
  const actor: SceneActor = {
    id: existing?.id ?? crypto.randomUUID(), name: art.label, assetId: art.assetId, layer: 'backdrop',
    x: project.width / 2, y: project.height / 2, size: 100, visible: true,
  };
  if (existing) Object.assign(existing, actor);
  else project.actors.push(actor);
  project.worldLayers = { middle: false, foreground: false };
  return actor;
}

export function worldControls(project: CreationProject, handlers: {
  layer: (name: LayerName, visible: boolean) => void;
  chooseBackdrop: () => void; toggleBackdrop: (visible: boolean) => void;
  addProp: (id: string) => void;
}) {
  const tools = document.createDocumentFragment();
  const world = ILLUSTRATED_WORLDS.find(item => item.id === project.background);
  const layers = document.createElement('div');
  layers.className = 'creation-world-layers';
  const check = (name: string, on: boolean, update: (value: boolean) => void) => {
    const label = document.createElement('label'), input = document.createElement('input');
    input.type = 'checkbox'; input.checked = on; input.setAttribute('aria-label', name);
    input.onchange = () => update(input.checked);
    label.append(input, name); layers.append(label);
  };
  if (world) {
    check('Middle scenery', project.worldLayers?.middle !== false, on => handlers.layer('middle', on));
    check('Front scenery', project.worldLayers?.foreground !== false, on => handlers.layer('foreground', on));
  }
  const backdrop = project.actors.find(actor => actor.layer === 'backdrop');
  if (backdrop) check('Show my backdrop', backdrop.visible !== false, handlers.toggleBackdrop);
  const privateArt = document.createElement('button');
  privateArt.type = 'button'; privateArt.className = 'creation-button'; privateArt.id = 'creationMyBackdrop';
  privateArt.textContent = backdrop ? 'Choose another backdrop' : 'Use my drawing as the backdrop';
  privateArt.onclick = handlers.chooseBackdrop;
  tools.append(privateArt, layers);
  if (world) {
    const heading = document.createElement('h3'); heading.textContent = 'Things to add';
    const props = document.createElement('div'); props.className = 'creation-world-props';
    for (const id of world.props) {
      const asset = WORLD_PROPS.find(item => item.id === id);
      if (!asset) continue;
      const button = document.createElement('button'); button.type = 'button'; button.dataset.prop = id;
      const image = document.createElement('img'); image.alt = ''; image.loading = 'lazy'; image.src = asset.url;
      const label = document.createElement('span'); label.textContent = asset.label;
      button.append(image, label); button.onclick = () => handlers.addProp(id);
      props.append(button);
    }
    tools.append(heading, props);
  }
  return tools;
}

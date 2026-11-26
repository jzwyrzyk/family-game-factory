import type {CreationWorkspace} from '../storage/creation-workspace';
import {sceneAssetSlots, type CreationProject} from './model';

/** Bring only the kept stage into the scene already on the worktable.
 * Programmable placements travel separately with the full "Use this world" fork. */
export function keptScenery(project: CreationProject, host: {
  owner: string;
  current(): boolean;
  store(): Promise<CreationWorkspace>;
  loadArt(id: string): Promise<unknown>;
  mutate(change: (scene:CreationProject) => void): Promise<void>;
  run(fn: () => Promise<void>): unknown;
}) {
  const details = document.createElement('details');
  details.id = 'creationUseSavedWorld';
  const summary = document.createElement('summary');
  summary.textContent = 'Use scenery from a kept scene';
  const list = document.createElement('div');
  list.id = 'creationKeptWorlds';
  details.append(summary, list);
  const current = () => details.isConnected && details.open && host.current();
  details.ontoggle = () => {
    list.replaceChildren();
    if (!current()) return;
    host.run(async () => {
      const store = await host.store();
      const entries = await store.list(host.owner);
      if (!current()) return;
      for (const entry of entries) {
        if (entry.id === project.id || !entry.keptId) continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'creation-button';
        button.textContent = entry.title;
        const keptId = entry.keptId;
        button.onclick = () => host.run(async () => {
          if (!current()) return;
          let cursor: string | null = null;
          do {
            const page = await store.historyPage(entry.id, host.owner, cursor, 24);
            if (!current()) return;
            const source = page.items.find(item => item.id === keptId)?.scene;
            if (source) {
              for (const id of new Set(sceneAssetSlots({...source, actors:[]}).map(slot => slot.assetId))) {
                if (id.startsWith('art:')) await host.loadArt(id);
                if (!current()) return;
              }
              await host.mutate(target => {
                target.background = source.background;
                if (source.worldLayers) target.worldLayers = structuredClone(source.worldLayers);
                else delete target.worldLayers;
                if (!source.world) { delete target.world; return; }
                target.world = structuredClone(source.world);
                if ('scenery' in target.world) for (const item of target.world.scenery ?? []) {
                  item.x = Math.round(item.x * target.width / source.width);
                  item.y = Math.round(item.y * target.height / source.height);
                }
              });
              return;
            }
            cursor = page.next;
          } while (cursor);
          throw Error('Reopen your kept scenes to choose an available version.');
        });
        list.append(button);
      }
      if (!list.childElementCount) list.textContent = 'Keep another scene to use its scenery here.';
    });
  };
  return details;
}

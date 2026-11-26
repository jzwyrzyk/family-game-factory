import type {CreationWorkspace} from '../storage/creation-workspace';
import {WORLD_PROPS} from './illustrated-art';
import {EARLIER_PROPS, sceneAssetSlots, type CreationProject} from './model';

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
              const props=new Set([...WORLD_PROPS,...EARLIER_PROPS].map(prop=>prop.id));
              const fixed=source.actors.filter(actor=>actor.layer==='backdrop' ||
                (!source.programs.some(program=>program.actorId===actor.id && program.actions.length) &&
                  (props.has(actor.assetId) || ['scenery','decoration','environment','background'].includes(actor.role ?? actor.creativeRole ?? ''))));
              for (const id of new Set(sceneAssetSlots({...source,actors:fixed}).map(slot => slot.assetId))) {
                if (id.startsWith('art:')) await host.loadArt(id);
                if (!current()) return;
              }
              const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('Jems kept scenery '+project.id));
              const namespace='scenery-'+Array.from(new Uint8Array(bytes).subarray(0,6),i=>i.toString(16).padStart(2,'0')).join('')+'-';
              if(!current())return;
              await host.mutate(target => {
                // Imports receive namespaced placement IDs in the existing format. A placement
                // that a child subsequently programs belongs to their cast on the next import.
                const castPrograms=JSON.stringify(target.programs);
                target.actors=target.actors.filter(actor=>!actor.id.startsWith(namespace) || castPrograms.includes(JSON.stringify(actor.id)));
                const sourceBackdrop=fixed.some(actor=>actor.layer==='backdrop');
                if (!sourceBackdrop) {
                  const prior=target.actors.find(actor=>actor.layer==='backdrop');
                  if(prior)prior.visible=false;
                }
                target.background = source.background;
                for (const original of fixed) {
                  const placed=structuredClone(original);
                  placed.x=original.x*target.width/source.width;
                  placed.y=original.y*target.height/source.height;
                  const backdrop=placed.layer==='backdrop' && target.actors.find(item=>item.layer==='backdrop');
                  if (backdrop) Object.assign(backdrop,placed,{id:backdrop.id});
                  else {
                    placed.id=namespace+crypto.randomUUID();
                    target.actors.push(placed);
                  }
                }
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

import OriginalDragon from '../games/original-dragon.js';
import OriginalBuckets from '../games/original-buckets.js';
import Construction from '../games/original-builder.js';
import Builder from '../games/builder.js';
import Buckets from '../games/buckets.js';
import Dragon from '../games/dragon.js';
import { manifests, defaults } from './manifests';
import { createLifecycle } from './lifecycle';
import type { GameId, GamePlugin, GameContext, GameLifecycle, Difficulty, Mechanics, PlayOutcome } from './types';

export const plugins: Record<GameId, GamePlugin> = {
  gum: {manifest: manifests.gum, mount: (target, context) => new (context.config.originalRules ? Construction : Builder)(target, context)},
  buckets: {manifest: manifests.buckets, mount: (target, context) => new (context.config.originalRules ? OriginalBuckets : Buckets)(target, context)},
  dragon: {manifest: manifests.dragon, mount: (target, context) => new (context.config.originalRules ? OriginalDragon : Dragon)(target, context)},
};
const details = {
  gum: { type: 'BUILD & CREATE', instructions: 'Place and rotate junk; connect it with gum and test your construction.', controls: 'Drag or use arrow keys; rotate, chew gum, connect and test.' },
  buckets: { type: 'GUESS & SURVIVE', instructions: 'Pick a bucket. Can you stay dry?', controls: 'Tap a numbered bucket or use left/right and Space to choose.' },
  dragon: { type: 'SHIELD ADVENTURE', instructions: 'Jump into falling fireballs to reflect them. Only your hero can save the island.', controls: '← → move · ↑ jump · Space jump / shield · touch controls below' },
};
let current: GameLifecycle | undefined;
export function snapshot() { return current?.snapshot(); }
// Compatibility edge for the existing orchestration; plugins themselves do not know profiles or math.
const FG = (window as any).FG;
FG.runtime = { snapshot };
FG.games = Object.fromEntries((Object.keys(plugins) as GameId[]).map(id => [id, {
  name: manifests[id].name, ...details[id], build: function(target: HTMLElement, ctx: {difficulty: Difficulty; config?: Mechanics; stateKey?:string; finish(outcome: PlayOutcome): void}) {
    const lifecycle = createLifecycle(plugins[id], target, ctx.config || defaults(id, ctx.difficulty), ctx.difficulty, ctx.finish, {load:()=>FG.store.current().constructionStates?.[ctx.stateKey||id],save:(state:unknown)=>{const p=FG.store.current();p.constructionStates||={};p.constructionStates[ctx.stateKey||id]=state;return FG.store.save()}});
    current = lifecycle;
    lifecycle.start();
    return { next: () => lifecycle.next(), restart: () => lifecycle.retry(), retry: () => lifecycle.retry(), unmount: () => lifecycle.dispose() };
  },
}]));

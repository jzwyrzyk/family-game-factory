import OriginalDragon from '../games/original-dragon.js';
import OriginalBuckets from '../games/original-buckets.js';
import Construction from '../games/original-builder.js';
import QualityBuilder from '../games/quality-builder';
import StickerBuilder from '../games/sticker-builder';
import Hill from '../games/quality-hill';
import MoonDonutDash from '../games/moon-donut-dash';
import RobotRoute from '../games/robot-route';
import GemFactory from '../games/gem-factory';
import NativeMining from '../games/mind-your-jems-native';
import '../quality/quality.css';
import Builder from '../games/builder.js';
import Buckets from '../games/buckets.js';
import Dragon from '../games/dragon.js';
import { manifests, defaults } from './manifests';
import { createLifecycle } from './lifecycle';
import type { GameId, GamePlugin, GameContext, GameLifecycle, Difficulty, Mechanics, PlayOutcome } from './types';

export const plugins: Record<GameId, GamePlugin> = {
  mining: {manifest:manifests.mining,mount:(target,context)=>new NativeMining(target,context)},
  factory: {manifest:manifests.factory,mount:(target,context)=>new GemFactory(target,context)},
  moon: {manifest:manifests.moon,mount:(target,context)=>new MoonDonutDash(target,context)},
  robot: {manifest:manifests.robot,mount:(target,context)=>new RobotRoute(target,context)},
  gum: {manifest: manifests.gum, mount: (target, context) => context.config.qualityVersion === 2 ? new StickerBuilder(target, context) : context.config.qualityVersion === 1 ? new QualityBuilder(target, context) : new (context.config.originalRules ? Construction : Builder)(target, context)},
  buckets: {manifest: manifests.buckets, mount: (target, context) => new (context.config.originalRules ? OriginalBuckets : Buckets)(target, context)},
  dragon: {manifest: manifests.dragon, mount: (target, context) => new (context.config.originalRules ? OriginalDragon : Dragon)(target, context)},
  hill: {manifest: manifests.hill, mount: (target, context) => new Hill(target, context)},
};
const details = {
  mining: {type:'MINING ADVENTURE',instructions:'Tap crystals to collect Jems. Bank them in the cart. Grab on before the mountain shakes!',controls:'Tap a crystal · Bank Jems · Grab on during a warning · Tab and Enter on a keyboard'},
  factory: {type:'SPARKLE WORKSHOP',instructions:'Find the next jem, tap the cutter in the green, and wrap your gift!',controls:'Keep or Return · Tap in the green · Rub the jem · Pick your paper · Tap your gift'},
  moon: {type:'MOON COLLECTOR',instructions:'Help your cat collect donuts and jump over falling meteors.',controls:'← → move · ↑ or Space jump · touch controls below'},
  robot: {type:'ROBOT PUZZLE',instructions:'Invent an arrow route to the star. The dark squares are walls.',controls:'Tap arrow buttons to plan · Run to test · Undo or Clear to revise'},
  gum: { type: 'BUILD & DISCOVER', instructions: 'Build a silly machine. Watch it move. Try your next idea.', controls: 'Choose a sticker and a bubble, or drag a sticker onto the machine · Make it GO!' },
  buckets: { type: 'GUESS & SURVIVE', instructions: 'Pick a bucket. Can you stay dry?', controls: 'Tap a numbered bucket or use left/right and Space to choose.' },
  dragon: { type: 'SHIELD ADVENTURE', instructions: 'Jump into falling fireballs to reflect them. Only your hero can save the island.', controls: '← → move · ↑ jump · Space jump / shield · touch controls below' },
  hill: { type: 'DRIVE & TINKER', instructions: 'Find your rhythm over the hills. Change your ride and feel what happens.', controls: 'Right / D accelerates · Left / A brakes · R retries · P pauses · touch pedals below' },
};
let current: GameLifecycle | undefined;
export function snapshot() { return current?.snapshot(); }
// Compatibility edge for the existing orchestration; plugins themselves do not know profiles or math.
const FG = (window as any).FG;
FG.runtime = { snapshot, isPlaying: () => current?.isPlaying() ?? false, pause: () => current?.pause(), resume: () => current?.resume() };
FG.games = Object.fromEntries((Object.keys(plugins) as GameId[]).map(id => [id, {
  name: manifests[id].name, ...details[id], build: function(target: HTMLElement, ctx: {difficulty: Difficulty; config?: Mechanics; stateKey?:string; drawingRigId?:string|null; finish(outcome: PlayOutcome): void}) {
    const config = ctx.config || defaults(id, ctx.difficulty), key = ctx.stateKey || id;
    // Capture the owning profile. Unmount can happen AFTER the active profile changes.
    const profile = FG.store.current();
    const quality = id === 'hill' || (id === 'gum' && config.qualityVersion === 1);
    const stickers = id === 'gum' && config.qualityVersion === 2;
    const lifecycle = createLifecycle(plugins[id], target, config, ctx.difficulty, ctx.finish, {
      load: () => { const value = profile.constructionStates?.[key]; return stickers ? value?.stickerConstruction : quality ? value?.qualityConstruction : value; },
      save: (state: unknown) => {
        if (!FG.store.data.profiles.includes(profile)) return false;
        const p = profile, before = p.constructionStates;
        const previous = before?.[key];
        const record = stickers ? { ...(previous && typeof previous === 'object' ? previous : {}), stickerConstruction: state }
          : quality ? { ...(previous && typeof previous === 'object' ? previous : {}), qualityConstruction: state }
          : { ...(state && typeof state === 'object' ? state : {}), ...(previous?.qualityConstruction ? { qualityConstruction: previous.qualityConstruction } : {}), ...(previous?.stickerConstruction ? { stickerConstruction: previous.stickerConstruction } : {}) };
        p.constructionStates = { ...before, [key]: record };
        if (FG.store.save()) return true;
        p.constructionStates = before; return false;
      }
    },ctx.drawingRigId);
    current = lifecycle;
    lifecycle.start();
    return { next: () => lifecycle.next(), restart: () => lifecycle.retry(), retry: () => lifecycle.retry(), isPlaying:()=>lifecycle.isPlaying(),pause:()=>lifecycle.pause(),resume:()=>lifecycle.resume(),unmount: () => lifecycle.dispose() };
  },
}]));

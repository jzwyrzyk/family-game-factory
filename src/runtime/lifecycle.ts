import { validateConfig } from './manifests';
import type { Difficulty, GameLifecycle, GamePlugin, Mechanics, PlayOutcome, GameContext } from './types';
export function createLifecycle(plugin: GamePlugin, target: HTMLElement, config: Mechanics, difficulty: Difficulty, onOutcome: (outcome: PlayOutcome) => void, persistence?: GameContext['persistence']): GameLifecycle {
  const checked = validateConfig(plugin.manifest.id, config);
  let instance: ReturnType<GamePlugin['mount']> | undefined, disposed = false, finished = false, began = performance.now(), pausedAt:number|null=null, pausedMs=0;
  const context: GameContext = { persistence, difficulty, config: Object.freeze({ ...checked }), finish(result) {
    if (disposed || finished) return;
    finished = true;
    onOutcome({ ...result, game: plugin.manifest.id, durationMs: Math.round(performance.now() - began - pausedMs - (pausedAt===null?0:performance.now()-pausedAt)), config: { ...checked }, at: new Date().toISOString() });
  } };
  const resetClock = () => { began = performance.now(); finished = false; pausedMs=0;pausedAt=null;target.inert=false;instance?.resume?.(); };
  return {
    start() { if (disposed || instance) return; resetClock(); instance = plugin.mount(target, context); },
    next() { if (!disposed && instance) { resetClock(); instance.next(); } },
    retry() { if (!disposed && instance) { resetClock(); (instance.retry || instance.restart).call(instance); } },
    isPlaying() { return !disposed&&!finished&&pausedAt===null&&!!instance?.isPlaying?.(); },
    pause() { if(disposed||finished||pausedAt!==null||!instance?.pause?.())return false;pausedAt=performance.now();target.inert=true;return true; },
    resume() { if(disposed||pausedAt===null)return;pausedMs+=performance.now()-pausedAt;pausedAt=null;target.inert=false;instance?.resume?.(); },
    dispose() { if (disposed) return; disposed = true; instance?.unmount(); target.inert=false;target.replaceChildren(); },
    snapshot() { return { config: { ...checked }, state: instance?.snapshot?.() || {}, disposed }; },
  };
}

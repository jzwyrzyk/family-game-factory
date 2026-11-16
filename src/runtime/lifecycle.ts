import { validateConfig } from './manifests';
import type { Difficulty, GameLifecycle, GamePlugin, Mechanics, PlayOutcome, GameContext } from './types';

/** Host learning and game focus/manual pauses share one elapsed-time ledger. */
export function createLifecycle(plugin: GamePlugin, target: HTMLElement, config: Mechanics, difficulty: Difficulty, onOutcome: (outcome: PlayOutcome) => void, persistence?: GameContext['persistence']): GameLifecycle {
  const checked = validateConfig(plugin.manifest.id, config);
  let instance: ReturnType<GamePlugin['mount']> | undefined, disposed = false, finished = false;
  let began = performance.now(), pausedAt: number | null = null, pausedMs = 0, hostPaused = false, gamePaused = false;
  function clockState() {
    const paused = hostPaused || gamePaused;
    if (paused && pausedAt === null) pausedAt = performance.now();
    if (!paused && pausedAt !== null) { pausedMs += performance.now() - pausedAt; pausedAt = null; }
  }
  const context: GameContext = { persistence, difficulty, config: Object.freeze({ ...checked }),
    emit(event) {
      if (disposed) return;
      if (event.type === 'pause' || event.type === 'resume') { gamePaused = event.type === 'pause'; clockState(); }
      window.dispatchEvent(new CustomEvent('factory-game-event', { detail: { game: plugin.manifest.id, ...event } }));
    },
    finish(result) {
      if (disposed || finished) return;
      finished = true;
      const now = performance.now();
      onOutcome({ ...result, game: plugin.manifest.id, durationMs: Math.max(0, Math.round(now - began - pausedMs - (pausedAt === null ? 0 : now - pausedAt))), config: { ...checked }, at: new Date().toISOString() });
    }
  };
  function resetClock() {
    began = performance.now(); finished = false; pausedMs = 0; pausedAt = null; hostPaused = false;
    target.inert = false; instance?.resume?.(); clockState();
  }
  return {
    start() { if (disposed || instance) return; resetClock(); instance = plugin.mount(target, context); },
    next() { if (!disposed && instance) { resetClock(); instance.next(); } },
    retry() { if (!disposed && instance) { resetClock(); (instance.retry || instance.restart).call(instance); } },
    isPlaying() { return !disposed && !finished && !hostPaused && !gamePaused && !!instance?.isPlaying?.(); },
    pause() {
      if (disposed || finished || hostPaused || !instance?.pause?.()) return false;
      hostPaused = true; clockState(); target.inert = true; return true;
    },
    resume() {
      if (disposed || !hostPaused) return;
      hostPaused = false; instance?.resume?.(); clockState(); target.inert = false;
    },
    dispose() { if (disposed) return; disposed = true; instance?.unmount(); target.inert = false; target.replaceChildren(); },
    snapshot() { return { config: { ...checked }, state: instance?.snapshot?.() || {}, disposed }; },
  };
}

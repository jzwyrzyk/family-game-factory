import { setIconLabel } from '../brand/icons';
import './build-handoff.css';

/** One explicit Build gesture, independent of the eventual remote job ID. */
export type BuildHandoffIdentity = { ownerId: string; sessionId: string; attemptId: string };
export type BuildHandoffPhase = 'sending' | 'queued' | 'building' | 'testing' | 'ready' | 'failed' | 'cancelled' | 'uncertain' | 'unavailable';
export type BuildHandoffState = {
  phase: BuildHandoffPhase;
  /** The host has a durably acknowledged, active job for this same project. */
  canPlayWhileWaiting?: boolean;
  /** The matching ready candidate is saved and can be opened explicitly. */
  canPlayReady?: boolean;
};
export type BuildHandoffActions = {
  /** Includes active owner, project, route and the trusted learning guard. */
  isCurrent(identity: BuildHandoffIdentity): boolean;
  onPlayWhileWaiting(identity: BuildHandoffIdentity): void;
  onPlayReady(identity: BuildHandoffIdentity): void;
  /** Explicit Stay here/Escape may restore a useful composer focus target. */
  onStay?(identity: BuildHandoffIdentity): void;
};

const sameAttempt = (left: BuildHandoffIdentity | null, right: BuildHandoffIdentity) => !!left &&
  left.ownerId === right.ownerId && left.sessionId === right.sessionId && left.attemptId === right.attemptId;

const COPY: Record<BuildHandoffPhase, { title: string; description: string; art: string }> = {
  sending: { title: 'Here we go!', description: 'Sending your idea to the workshop…', art: 'character_spark_think.webp' },
  queued: { title: 'Your idea is on its way!', description: 'The workshop has it. Play while you wait?', art: 'spot_work_in_progress.webp' },
  building: { title: 'We’re making your game!', description: 'Play while we bring your idea to life.', art: 'spot_work_in_progress.webp' },
  testing: { title: 'Trying out your game!', description: 'We’re checking how it plays. You can keep playing.', art: 'spot_work_in_progress.webp' },
  ready: { title: 'Your game is ready!', description: 'Let’s see what you made.', art: 'character_spark_celebrate.webp' },
  failed: { title: 'Let’s try that again', description: 'The build didn’t finish. Your idea is still here.', art: 'character_spark_recover.webp' },
  cancelled: { title: 'Your idea is still here', description: 'The build stopped. You can change your idea.', art: 'character_spark_rest.webp' },
  uncertain: { title: 'Connection interrupted', description: 'Your game might still be building. Your idea is still here.', art: 'character_spark_think.webp' },
  unavailable: { title: 'Your idea is still here', description: 'The workshop couldn’t start this build.', art: 'character_spark_recover.webp' },
};

/**
 * A focused handoff for an explicit Build. It owns no job, game, timer or saved
 * progress. Only begin() can open it; late polling cannot reopen a dismissed
 * handoff, move focus, start play or choose a candidate.
 */
export function createBuildHandoff(actions: BuildHandoffActions) {
  const element = document.createElement('dialog');
  element.id = 'studioBuildHandoff';
  element.className = 'studio-build-handoff';
  element.setAttribute('aria-labelledby', 'studioBuildHandoffTitle');
  element.setAttribute('aria-describedby', 'studioBuildHandoffDescription');
  element.innerHTML = '<div class="studio-handoff-art" aria-hidden="true"><img width="200" height="160" alt="" decoding="async"></div>' +
    '<div class="studio-handoff-copy" aria-live="polite" aria-atomic="true"><h2 id="studioBuildHandoffTitle" tabindex="-1"></h2><p id="studioBuildHandoffDescription"></p></div>' +
    '<div class="studio-handoff-actions"><button id="studioBuildHandoffPlay" type="button"></button><button id="studioBuildHandoffStay" type="button">Stay here</button></div>';
  document.body.append(element);

  const title = element.querySelector<HTMLElement>('#studioBuildHandoffTitle')!;
  const description = element.querySelector<HTMLElement>('#studioBuildHandoffDescription')!;
  const art = element.querySelector<HTMLImageElement>('img')!;
  const play = element.querySelector<HTMLButtonElement>('#studioBuildHandoffPlay')!;
  const stay = element.querySelector<HTMLButtonElement>('#studioBuildHandoffStay')!;
  let identity: BuildHandoffIdentity | null = null;
  let state: BuildHandoffState = { phase: 'sending' };
  let previousOverflow: string | null = null;
  let disposed = false;

  const put = (target: HTMLElement, text: string) => { if (target.textContent !== text) target.textContent = text; };
  function restoreScroll() {
    if (previousOverflow === null) return;
    document.body.style.overflow = previousOverflow;
    previousOverflow = null;
  }
  function close() {
    if (element.open) element.close();
    restoreScroll();
  }
  function canWait() {
    return state.canPlayWhileWaiting === true && ['queued', 'building', 'testing', 'uncertain'].includes(state.phase);
  }
  function render() {
    const copy = COPY[state.phase];
    const savingReady = state.phase === 'ready' && !state.canPlayReady;
    put(title, savingReady ? 'Saving your game…' : copy.title);
    put(description, savingReady ? 'Getting it ready to play.' : copy.description);
    if (art.dataset.asset !== copy.art) {
      art.dataset.asset = copy.art;
      art.src = new URL('jems-art/' + copy.art, document.baseURI).href;
    }
    element.dataset.phase = state.phase;
    const terminal = ['failed', 'cancelled', 'unavailable'].includes(state.phase);
    const hadPlayFocus = document.activeElement === play;
    play.hidden = terminal || (state.phase === 'uncertain' && !canWait());
    play.disabled = !(state.phase === 'ready' ? state.canPlayReady === true : canWait());
    setIconLabel(play, state.phase === 'ready' && state.canPlayReady ? 'play' : canWait() ? 'play' : 'clock',
      state.phase === 'ready' ? state.canPlayReady ? 'Play my game' : 'Getting ready…' : state.phase === 'sending' ? 'Sending…' : 'Play while I wait');
    put(stay, terminal ? 'Back to my idea' : 'Stay here');
    if (hadPlayFocus && play.hidden) stay.focus({ preventScroll: true });
  }
  function stayHere() {
    const captured = identity;
    const canRestore = element.open && captured && actions.isCurrent(captured);
    close();
    if (captured && canRestore && !disposed && actions.isCurrent(captured)) actions.onStay?.({ ...captured });
  }
  stay.onclick = stayHere;
  play.onclick = () => {
    const captured = identity;
    if (!element.open || !captured || !actions.isCurrent(captured)) { close(); return; }
    const ready = state.phase === 'ready' && state.canPlayReady === true;
    if (!ready && !canWait()) return;
    // Close first: the selected game/arcade is a different host-owned surface.
    close();
    if (ready) actions.onPlayReady({ ...captured });
    else actions.onPlayWhileWaiting({ ...captured });
  };
  element.addEventListener('cancel', event => { event.preventDefault(); stayHere(); });
  // A native close event is queued. An older event must not unlock scrolling
  // after a second explicit Build has already opened the same dialog again.
  element.addEventListener('close', () => { if (!element.open) restoreScroll(); });
  // Escape/Space/arrow input belongs to this dialog, never an underlying game.
  element.addEventListener('keydown', event => event.stopPropagation());
  element.addEventListener('keyup', event => event.stopPropagation());

  return {
    element,
    begin(nextIdentity: BuildHandoffIdentity, nextState: BuildHandoffState = { phase: 'sending' }) {
      if (disposed || !actions.isCurrent(nextIdentity)) return;
      // Repeated rendering of one request cannot bring back its dismissed popup.
      if (sameAttempt(identity, nextIdentity)) return;
      close();
      identity = { ...nextIdentity };
      state = { ...nextState };
      render();
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      element.showModal();
      title.focus({ preventScroll: true });
    },
    update(nextIdentity: BuildHandoffIdentity, nextState: BuildHandoffState) {
      if (disposed || !sameAttempt(identity, nextIdentity)) return;
      if (!actions.isCurrent(nextIdentity)) { close(); return; }
      state = { ...nextState };
      // No DOM or live-region changes from a build after the child has left it.
      if (element.open) render();
    },
    close,
    isOpen: () => element.open,
    dispose() { close(); disposed = true; identity = null; element.remove(); },
  };
}

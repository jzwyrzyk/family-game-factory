import { isGameId } from '../runtime/manifests';
import type { GameId } from '../runtime/types';

/** Claim the matching embedded game's request synchronously. The legacy fallback
 * waits until dispatch completes, so ownership does not depend on listener order.
 */
export function installStudioRemixRouting(host: { activeGame(): GameId | null; openRequest(prompt?: string): void }, target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> = window) {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ game?: unknown; prompt?: unknown }>).detail;
    if (event.defaultPrevented || !event.cancelable || !detail || !isGameId(detail.game) ||
        detail.prompt !== undefined && (typeof detail.prompt !== 'string' || detail.prompt.length > 2000) ||
        host.activeGame() !== detail.game) return;
    event.preventDefault();
    host.openRequest(typeof detail.prompt === 'string' ? detail.prompt : undefined);
  };
  target.addEventListener('factory-remix-request', listener, true);
  return () => target.removeEventListener('factory-remix-request', listener, { capture: true });
}

/** Bridge the original round-result Home button back to the studio library. */
export function installStudioHostNavigation() {
  const fg = (window as any).FG;
  if (!fg?.studio || new URLSearchParams(location.search).get('arcade') === '1' || new URLSearchParams(location.search).get('studio') === '0') return;
  document.addEventListener('click', event => {
    const button = (event.target as Element | null)?.closest<HTMLElement>('#resultHome, #exitGame');
    if (!button?.closest('#page-studio')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try { fg.studio.home(); }
    catch (error) {
      const status = document.getElementById('studioStatus');
      if (status) { status.textContent = (error as Error).message; status.classList.add('is-error'); }
    }
  }, true);
}

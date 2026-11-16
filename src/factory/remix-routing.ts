/** Let an embedded host claim a remix request before the legacy host handles it.
 * A directly dispatched window event can call listeners in registration order;
 * capture alone does not provide the ownership boundary used by this fallback.
 */
export function installRemixFallback(handle: (event: Event) => void, target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> = window) {
  let installed = true;
  const listener = (event: Event) => {
    queueMicrotask(() => { if (installed && !event.defaultPrevented) handle(event); });
  };
  target.addEventListener('factory-remix-request', listener);
  return () => { installed = false; target.removeEventListener('factory-remix-request', listener); };
}

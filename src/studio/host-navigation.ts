/** Bridge the original round-result Home button back to the studio library. */
export function installStudioHostNavigation() {
  const fg = (window as any).FG;
  if (!fg?.studio || new URLSearchParams(location.search).get('studio') !== '1') return;
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

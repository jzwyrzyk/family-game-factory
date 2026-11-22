import './play-view.css';

/** One viewport boundary for curated and private games. The learning host stays
 * inside this boundary, including when the browser enters native fullscreen. */
export function installPlayView(page: HTMLElement, host: HTMLElement) {
  const button = document.createElement('button');
  button.id = 'studioFullScreen';
  button.type = 'button';
  button.className = 'studio-button';
  button.textContent = 'Full screen';
  button.hidden = true;
  button.setAttribute('aria-pressed', 'false');
  const notice = document.createElement('p');
  notice.id = 'studioPlayDisplayStatus';
  notice.className = 'studio-play-display-status';
  notice.setAttribute('role', 'status');
  notice.hidden = true;
  page.querySelector('.studio-heading')!.append(button);
  page.querySelector('.studio-heading')!.after(notice);
  const header = document.querySelector<HTMLElement>('.site-header');
  let active = false, expanded = false, ready = false, request = 0;
  let previousOverflow: { html: string; body: string } | null = null;
  const labels: { element: HTMLElement; nodes: Node[]; aria: string | null }[] = [];
  const moved: { element: HTMLElement; anchor: Comment }[] = [];
  const nativeMenus = new Map<Element, MutationObserver>();
  let frame = 0;

  function simplifyTools() {
    const menu = page.querySelector<HTMLElement>('#studioMore .studio-more-actions')!;
    menu.scrollTop = 0;
    for (const id of ['studioMakeScene', 'studioUseDrawing', 'studioMathOptions', 'studioProfileMenu', 'studioBuildShelf', 'studioReady']) {
      const element = document.getElementById(id);
      if (!element) continue;
      if (id === 'studioProfileMenu') (element as HTMLDetailsElement).open = false;
      const anchor = document.createComment('play tool returns here');
      element.before(anchor); moved.push({ element, anchor }); menu.append(element);
    }
    for (const [selector, label, aria] of [
      ['#studioChange', 'Change', 'Talk or change my game'],
      ['#studioHelp', 'Help', 'How to play'],
      ['#studioMore > summary', 'More', 'More game tools'],
      ['#studioKeep', 'Keep', 'Make this my main game'],
    ]) {
      const element = page.querySelector<HTMLElement>(selector);
      if (!element) continue;
      labels.push({ element, nodes: [...element.childNodes], aria: element.getAttribute('aria-label') });
      element.textContent = label; element.setAttribute('aria-label', aria);
    }
  }
  function updateReady() {
    if (!active) return;
    const summary = page.querySelector<HTMLElement>('#studioMore > summary')!;
    summary.textContent = ready ? 'More · ready' : 'More';
    summary.setAttribute('aria-label', ready ? 'More game tools. A game is ready.' : 'More game tools');
  }
  function restoreTools() {
    for (const { element, nodes, aria } of labels.splice(0)) {
      element.replaceChildren(...nodes);
      if (aria === null) element.removeAttribute('aria-label'); else element.setAttribute('aria-label', aria);
    }
    for (const { element, anchor } of moved.splice(0)) {
      if (element.id === 'studioProfileMenu') (element as HTMLDetailsElement).open = false;
      anchor.replaceWith(element);
    }
    const more = page.querySelector<HTMLDetailsElement>('#studioMore');
    if (more) more.open = false;
  }

  function resize() {
    if (!active) return;
    const viewport = window.visualViewport;
    const full = document.fullscreenElement === page;
    const top = expanded || full ? 0 : Math.max(0, header?.getBoundingClientRect().bottom || 0);
    const height = full ? window.innerHeight : viewport?.height || window.innerHeight;
    page.style.setProperty('--jems-play-top', `${top}px`);
    page.style.setProperty('--jems-play-height', `${Math.max(160, height - top)}px`);
    page.style.setProperty('--jems-play-menu-top', `${Math.max(52, Math.min(height - 140, (page.querySelector('.studio-topbar')?.getBoundingClientRect().bottom || 60) + 4))}px`);
    host.style.setProperty('--jems-game-height', `${host.clientHeight}px`);
    fitNative();
  }
  function scheduleResize() {
    if (!active || frame) return;
    frame = requestAnimationFrame(() => { frame = 0; resize(); });
  }

  // Recovered native games are deliberately scoped in a shadow root. Their
  // canvas and touch controls must fit together; changing only outer CSS cannot
  // resize that content. Keep the original aspect ratio and all button sizes.
  function fitNative() {
    for (const [menu, observer] of nativeMenus) {
      const root = menu.getRootNode();
      if (!menu.isConnected || !(root instanceof ShadowRoot) || !host.contains(root.host)) {
        observer.disconnect(); nativeMenus.delete(menu);
      }
    }
    for (const element of host.querySelectorAll<HTMLElement>('#game-mount > *')) {
      const root = element.shadowRoot;
      if (!root) continue;
      const app = root.querySelector<HTMLElement>('#app, main');
      const stage = root.querySelector<HTMLElement>('.wrap, .frame');
      const canvas = stage?.querySelector<HTMLCanvasElement>('#game');
      if (!app || !stage || !canvas) continue;
      const menu = root.querySelector('#menu');
      if (menu && !nativeMenus.has(menu)) {
        // Host observers cannot see through a shadow root. Refit immediately
        // after leaving or reopening the native hero chooser, when its HUD
        // changes between overlay and ordinary gameplay layout.
        const menuObserver = new MutationObserver(scheduleResize);
        menuObserver.observe(menu, { attributes: true, attributeFilter: ['class', 'hidden'] });
        nativeMenus.set(menu, menuObserver);
      }
      let style = root.querySelector<HTMLStyleElement>('[data-jems-play-fit]');
      if (!style) {
        style = document.createElement('style');
        style.dataset.jemsPlayFit = '';
        style.textContent = `:host{height:100%;min-height:0;overflow:auto;overscroll-behavior:contain}
          #app,main{width:100%;max-width:none;min-height:100%;margin:0;padding:6px;display:flex;flex-direction:column;align-items:stretch}
          .top{flex:none;gap:6px}.title{font-size:22px}.top button{min-height:44px}
          .wrap,.frame{flex:none;align-self:center;max-width:100%;box-sizing:border-box;margin:auto 0;aspect-ratio:auto}
          .wrap>canvas,.frame>canvas{display:block;width:100%;height:auto;max-height:none;aspect-ratio:auto}
          #touch,.touch{flex:none;margin:8px 0 0;gap:6px}#touch button,.touch button{min-height:48px;font-size:18px}
          .sound{min-height:44px;min-width:44px;font-size:18px}.top button{font-size:18px}
          .footer,.eyebrow{display:none}.panel{max-height:100%;overscroll-behavior:contain}
          .wrap:has(#menu:not(.hidden)){width:100%!important;height:var(--jems-native-space)}
          .wrap:has(#menu:not(.hidden))>canvas{height:100%;object-fit:contain}
          .wrap:has(#menu:not(.hidden))>#hud{position:absolute;inset:10px 10px auto}
          #menu{padding:10px}#menu .panel{height:auto;max-height:100%;padding:12px;display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;gap:8px;overflow:hidden}
          #menu .panel h1{font-size:24px;line-height:1.1;margin:0}#menu .panel p{font-size:20px;line-height:1.25;margin:0}
          #menu .heroes{min-height:0;overflow:auto;overscroll-behavior:contain;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:minmax(100px,1fr);align-content:start;margin:0;padding:4px;gap:8px}
          #menu .heroCard{min-width:0;min-height:100px;padding:6px;gap:4px}#menu .heroCard img,#menu .heroCard canvas{height:56px}#menu .heroCard strong{font-size:18px}#menu .heroCard>div{display:none}
          #menu #startBtn{min-height:48px;font-size:18px}#menu .inst{display:none}
          @media(max-width:599px){#menu .panel{grid-template-rows:auto minmax(0,1fr) auto}#menu .panel>h1{display:none}#menu .heroCard img,#menu .heroCard canvas{height:40px}}
          @media(min-width:600px){#menu .heroes{grid-template-columns:repeat(4,minmax(0,1fr))}}
          @media(max-height:550px) and (min-width:600px){#menu{padding:4px}#menu .panel{padding:6px;gap:4px;grid-template-rows:minmax(0,1fr) auto}#menu .panel>h1,#menu .panel>p{display:none}#menu .heroes{grid-auto-rows:minmax(76px,1fr)}#menu .heroCard{min-height:76px}#menu .heroCard img,#menu .heroCard canvas{height:32px}}
          @media(max-height:550px) and (min-width:600px){.top .title{display:none}.top{justify-content:flex-end}.top button{min-height:44px;padding:5px 10px}#touch button,.touch button{min-height:48px;height:48px}.top{margin:0 0 4px}}
        `;
        root.append(style);
      }
      const available = host.clientHeight;
      const fixed = [...app.children].filter(child => child !== stage).reduce((sum, child) => {
        const node = child as HTMLElement, css = getComputedStyle(node);
        return sum + node.getBoundingClientRect().height + parseFloat(css.marginTop || '0') + parseFloat(css.marginBottom || '0');
      }, 0);
      const css = getComputedStyle(stage);
      const border = parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth);
      const hud = [...stage.children].filter(child => child !== canvas && getComputedStyle(child).position === 'relative')
        .reduce((sum, child) => sum + (child as HTMLElement).getBoundingClientRect().height, 0);
      const height = Math.max(100, available - fixed - border - hud - 22);
      stage.style.setProperty('--jems-native-space', `${Math.max(100, available - fixed - 22)}px`);
      stage.style.width = `${Math.min(app.clientWidth - 12, height * canvas.width / canvas.height)}px`;
    }
  }

  function updateButton() {
    const full = active && (expanded || document.fullscreenElement === page);
    button.textContent = full ? 'Exit full screen' : 'Full screen';
    button.setAttribute('aria-pressed', String(full));
    page.classList.toggle('studio-play-expanded', full);
  }
  function fullscreenChanged() {
    if (!active) return;
    expanded = document.fullscreenElement === page;
    notice.hidden = true;
    updateButton();
    resize();
  }
  async function toggleFullscreen() {
    if (!active) return;
    const attempt = ++request;
    if (document.fullscreenElement === page) {
      try { await document.exitFullscreen(); } catch { /* Keep the visible exit controls. */ }
      return;
    }
    if (expanded) {
      expanded = false; notice.hidden = true; updateButton(); resize(); return;
    }
    // A real tap owns this call. A browser that denies or lacks the API still
    // gets a usable page-filling view with the same exit and learning controls.
    expanded = true; notice.hidden = true; updateButton(); resize();
    if (!page.requestFullscreen || document.fullscreenEnabled === false) {
      notice.textContent = 'Expanded view. Browser full screen is not available here.';
      notice.hidden = false; return;
    }
    try {
      await page.requestFullscreen();
      if ((!active || attempt !== request) && document.fullscreenElement === page) await document.exitFullscreen();
    } catch {
      if (!active || attempt !== request) return;
      notice.textContent = 'Expanded view. Browser full screen is not available here.';
      notice.hidden = false;
    }
    resize();
  }
  button.onclick = () => { void toggleFullscreen(); };
  const more = page.querySelector<HTMLDetailsElement>('#studioMore')!;
  const resetMoreScroll = () => {
    if (!active || !more.open) return;
    // A previous visit to profiles or a long build shelf must not reopen the
    // tool menu partway down, hiding its first actions above the scrollport.
    const menu = more.querySelector<HTMLElement>('.studio-more-actions')!;
    menu.getBoundingClientRect(); // materialize the newly opened scrollport
    menu.scrollTop = 0;
    scheduleResize();
  };
  // Native details dispatches toggle in a later task. Observe the actual open
  // attribute so click/keyboard activation resets its scrollport before paint,
  // without replacing native activation or bypassing the learning click guard.
  const moreState = new MutationObserver(resetMoreScroll);
  moreState.observe(more, { attributes: true, attributeFilter: ['open'] });
  more.addEventListener('toggle', resetMoreScroll);
  page.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !active || !expanded || document.fullscreenElement === page || page.querySelector('#studioMore[open]')) return;
    event.preventDefault(); event.stopPropagation();
    expanded = false; notice.hidden = true; updateButton(); resize(); button.focus({ preventScroll: true });
  }, true);
  document.addEventListener('fullscreenchange', fullscreenChanged);
  window.addEventListener('factory-page', event => {
    if ((event as CustomEvent).detail !== 'game') controller.leave();
  });
  window.addEventListener('resize', scheduleResize);
  window.visualViewport?.addEventListener('resize', scheduleResize);
  const observer = new ResizeObserver(scheduleResize);
  if (header) observer.observe(header);
  observer.observe(host);
  const content = new MutationObserver(scheduleResize);
  content.observe(host, { childList: true, subtree: true });

  const controller = {
    enter() {
      if (!active) {
        previousOverflow = { html: document.documentElement.style.overflow, body: document.body.style.overflow };
        document.documentElement.style.overflow = 'hidden'; document.body.style.overflow = 'hidden';
        active = true;
        simplifyTools();
      }
      document.body.classList.add('studio-playing'); page.classList.add('studio-play-mode');
      updateReady();
      button.hidden = false;
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      resize(); scheduleResize();
      (host.querySelector<HTMLElement>('[data-game-entry-focus]') || host).focus({ preventScroll: true });
    },
    leave() {
      if (!active) return;
      active = false; expanded = false; ++request;
      if (document.fullscreenElement === page) void document.exitFullscreen().catch(() => {});
      document.body.classList.remove('studio-playing'); page.classList.remove('studio-play-mode', 'studio-play-expanded');
      notice.hidden = true; updateButton();
      button.hidden = true;
      restoreTools();
      if (previousOverflow) {
        document.documentElement.style.overflow = previousOverflow.html;
        document.body.style.overflow = previousOverflow.body; previousOverflow = null;
      }
      page.style.removeProperty('--jems-play-top'); page.style.removeProperty('--jems-play-height');
      page.style.removeProperty('--jems-play-menu-top');
      for (const observer of nativeMenus.values()) observer.disconnect();
      nativeMenus.clear();
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
    },
    setReady(value: boolean) { ready = value; updateReady(); },
    get active() { return active; },
  };
  return controller;
}

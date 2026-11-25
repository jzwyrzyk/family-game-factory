import { setIconLabel, type IconName } from '../brand/icons';
import './navigation.css';

interface StudioNavigationOptions {
  nav: HTMLElement;
  headerTools: HTMLElement;
  helpButton: HTMLButtonElement;
  rewards: HTMLElement;
  subjects: HTMLElement;
  openArt(): void;
  openParent(): void;
}

/** A smaller shell around the existing routes. Move the original controls so
 * their save, learning and owner guards remain the only navigation authority.
 * The dialog stays inside nav so existing current-route renderers still see it.
 */
export function installStudioNavigation(options: StudioNavigationOptions) {
  const { nav, headerTools, helpButton, rewards, subjects } = options;
  const home = nav.querySelector<HTMLButtonElement>('#studioNavHome');
  const create = nav.querySelector<HTMLButtonElement>('#studioNavCreate');
  if (!home || !create) throw Error('Studio navigation needs its existing home and creation routes.');
  const moved: Array<{ element: HTMLElement; marker: Comment }> = [];
  const destinations = new Set<HTMLButtonElement>();
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
  };
  const button = (id: string, icon: IconName, label: string) => {
    const element = node('button', 'studio-menu-link');
    element.type = 'button'; element.id = id;
    setIconLabel(element, icon, label);
    return element;
  };
  const move = (element: HTMLElement, destination: HTMLElement, closeOnActivation = true) => {
    const marker = document.createComment('studio-menu:' + element.id);
    element.before(marker); moved.push({ element, marker });
    destination.append(element);
    if (closeOnActivation && element instanceof HTMLButtonElement) destinations.add(element);
  };

  const menu = button('studioNavMenu', 'menu', 'Menu');
  menu.classList.add('studio-menu-toggle');
  menu.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-controls', 'studioMenuDialog');
  menu.setAttribute('aria-haspopup', 'dialog');
  const dialog = node('dialog', 'studio-menu-dialog');
  dialog.id = 'studioMenuDialog';
  dialog.setAttribute('aria-labelledby', 'studioMenuTitle');
  const top = node('div', 'studio-menu-heading');
  const title = node('h2', '', 'Menu'); title.id = 'studioMenuTitle';
  const dismiss = button('studioMenuClose', 'close', 'Close');
  top.append(title, dismiss);
  const content = node('div', 'studio-menu-content');
  const group = (id: string, name: string) => {
    const section = node('section', 'studio-menu-group');
    const heading = node('h3', '', name); heading.id = id + 'Title';
    section.setAttribute('aria-labelledby', heading.id);
    section.append(heading); content.append(section);
    return section;
  };
  const make = group('studioMenuMake', 'Make');
  const world = group('studioMenuWorld', 'Your world');
  const learn = group('studioMenuLearn', 'Learning mode');
  const grownups = group('studioMenuGrownups', 'Grown-ups');
  const help = group('studioMenuHelp', 'Help');
  const createInMenu = button('studioMenuCreate', 'add', 'Invent a game');
  createInMenu.onclick = () => create.click();
  destinations.add(createInMenu); make.append(createInMenu);

  for (const [id, section] of [
    ['studioNavScenes', make],
    ['studioNavNotifications', world],
    ['studioNavJourney', world],
  ] as const) {
    const element = nav.querySelector<HTMLButtonElement>('#' + id);
    if (element) move(element, section);
  }
  const art = button('studioMenuArt', 'edit', 'My Art');
  art.onclick = options.openArt; destinations.add(art); make.append(art);
  const compatibility=node('div');compatibility.hidden=true;
  for(const id of ['studioNavRewards','studioNavPals','studioNavPowers','studioNavProblemSolving']){const control=nav.querySelector<HTMLElement>('#'+id);if(control)move(control,compatibility);}
  nav.append(compatibility);
  move(subjects, learn, false);
  const parent = button('studioMenuParent', 'parent', 'Parent dashboard');
  parent.onclick = options.openParent; destinations.add(parent);
  const privateSession = button('studioMenuParentSession', 'lock', 'Private parent session');
  privateSession.onclick = () => window.dispatchEvent(new Event('factory-open-parent-session'));
  destinations.add(privateSession); grownups.append(parent, privateSession);
  move(helpButton, help);
  dialog.append(top, content); nav.append(menu, dialog);
  nav.classList.add('studio-shell-navigation');
  headerTools.classList.add('studio-shell-tools');
  document.body.classList.add('jems-compact-navigation');

  let savedOverflow: string | null = null;
  function closed() {
    menu.setAttribute('aria-expanded', 'false');
    if (savedOverflow !== null) {
      document.documentElement.style.overflow = savedOverflow;
      savedOverflow = null;
    }
  }
  function close() {
    if (dialog.open) dialog.close();
    closed();
  }
  function open() {
    if (dialog.open) return;
    const profile = document.getElementById('studioProfileMenu');
    if (profile instanceof HTMLDetailsElement) profile.open = false;
    savedOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    dialog.showModal();
    menu.setAttribute('aria-expanded', 'true');
    // A close control at the top keeps both the heading and the beginning of the
    // menu visible, even after its independently scrolling content was visited.
    content.scrollTop = 0; dismiss.focus();
  }
  menu.onclick = open;
  dismiss.onclick = close;
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', closed);
  dialog.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])',
    )].filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
    const first = controls[0], last = controls.at(-1);
    if (!first || !last) { event.preventDefault(); dismiss.focus(); return; }
    // Keep keyboard traversal in the drawer, including browsers that otherwise
    // send Shift+Tab from a native dialog's first control to browser chrome.
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  });
  dialog.addEventListener('click', event => {
    const target = (event.target as Element | null)?.closest('button');
    // Close before the original click handler runs. That handler can then focus
    // its real destination or retain a draft when an existing guard refuses it.
    if (target instanceof HTMLButtonElement && destinations.has(target)) close();
  }, true);
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom) close();
  });

  function currentDestination() {
    const active = dialog.querySelector<HTMLElement>('[aria-current="page"]');
    menu.classList.toggle('has-current-destination', !!active);
    menu.dataset.currentDestination = active?.id ?? '';
  }
  const currentObserver = new MutationObserver(currentDestination);
  currentObserver.observe(dialog, { subtree: true, attributes: true, attributeFilter: ['aria-current'] });
  currentDestination();
  window.addEventListener('factory-page', close);
  window.addEventListener('factory-profile-before-change', close);
  document.addEventListener('fullscreenchange', close);

  return {
    close,
    dispose() {
      close(); currentObserver.disconnect();
      window.removeEventListener('factory-page', close);
      window.removeEventListener('factory-profile-before-change', close);
      document.removeEventListener('fullscreenchange', close);
      for (const { element, marker } of moved) { marker.replaceWith(element); }
      dialog.remove(); menu.remove();
      nav.classList.remove('studio-shell-navigation');
      headerTools.classList.remove('studio-shell-tools');
      document.body.classList.remove('jems-compact-navigation');
    },
  };
}

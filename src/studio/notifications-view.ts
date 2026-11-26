import {createAction} from '../design-system/components/action';
import { createCollectionHeader as createPageHeader } from '../design-system/templates/collection';
import {createIcon, setIconLabel} from '../brand/icons';
import {createReadAloudControl} from '../speech/read-aloud-control';
import type {StudioNotification} from './notifications';
import './notifications.css';

export type NotificationOrigin = 'home' | 'notifications';
export type StudioContinuation = {
  sessionId: string; ownerId: string; name: string; art: string;
  kind: string; title: string; description: string; actionLabel: string;
  notification?: StudioNotification;
};
interface NotificationsViewOptions {
  homeHost: HTMLElement;
  canRead(ownerId: string): boolean;
  onOpen(item: StudioNotification, origin: NotificationOrigin): void;
  onContinue(item: StudioContinuation): void;
  onDismiss(item: StudioContinuation): void;
  onOpenPage(): void;
  onBack(): void;
  onStop(item: StudioNotification): Promise<void>;
  onPlayWhileWaiting(item: StudioNotification): void;
}
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const element = document.createElement(tag); element.className = className; element.textContent = text; return element;
};
const button = (id: string, label: string, icon: Parameters<typeof setIconLabel>[1], className = 'studio-button') => {
  const element = createAction({label, icon, className}); element.id = id; return element;
};

/** Views of the notebook projection. This component never creates, selects,
 * retries or keeps a build; the host rechecks owner, save and current-state guards. */
export function createStudioNotificationsView(options: NotificationsViewOptions) {
  const page = node('section', 'page hidden studio-notifications'); page.id = 'studioNotifications';
  page.setAttribute('aria-labelledby', 'studioNotificationsTitle');
  const back = button('studioNotificationsBack', 'My Games', 'arrow');
  back.querySelector('.jems-icon')?.classList.add('jems-icon--back'); back.onclick = options.onBack;
  const title = node('h1', '', 'Notifications'); title.id = 'studioNotificationsTitle'; title.tabIndex = -1;
  const introduction = node('p', 'studio-notifications-intro', 'Games to try and ideas to finish.');
  const list = node('div', 'studio-notifications-list'); list.id = 'studioNotificationsList';
  page.append(createPageHeader(page, { title, description: introduction, back, backLabel: 'My Games' }), list);
  type CachedRow = { signature: string; row: HTMLElement; reader: ReturnType<typeof createReadAloudControl> };
  let rows = new Map<string, CachedRow>();
  let pageSignature = '', homeSignature = '';
  const clearReaders = () => { rows.forEach(({reader}) => reader.dispose()); rows.clear(); };

  function entry(id: string) {
    const element = button(id, 'Notifications', 'clock'); element.onclick = options.onOpenPage;
    const badge = node('span', 'studio-notification-badge'); badge.dataset.notificationBadge = ''; badge.hidden = true;
    badge.setAttribute('aria-hidden', 'true'); element.append(badge); return element;
  }
  const menuEntry = entry('studioNavNotifications'); menuEntry.className = 'studio-menu-link';
  const playEntry = entry('studioPlayNotifications');

  function updateBadges(items: readonly StudioNotification[]) {
    const unread = items.filter(item => item.unread).length;
    const pending = items.filter(item => item.pending).length;
    for (const id of ['studioNavNotifications', 'studioNotificationsHome', 'studioPlayNotifications']) {
      const element = document.getElementById(id);
      if (!element) continue;
      element.dataset.unread = String(unread); element.dataset.pending = String(pending);
      element.setAttribute('aria-label', `Notifications, ${unread} new, ${pending} in progress`);
    }
    const menu = document.getElementById('studioNavMenu');
    if (menu) {
      if (!menu.querySelector('[data-notification-badge]')) {
        const badge = node('span', 'studio-notification-badge'); badge.dataset.notificationBadge = '';
        badge.setAttribute('aria-hidden', 'true'); menu.append(badge);
      }
      menu.setAttribute('aria-label', unread ? `Menu, ${unread} new notifications` : 'Menu');
    }
    for (const badge of document.querySelectorAll<HTMLElement>('[data-notification-badge]')) {
      badge.textContent = unread ? String(unread) : ''; badge.hidden = unread === 0;
    }
  }

  function renderHome(suggestion: StudioContinuation | null, items: readonly StudioNotification[], ownerId: string) {
    const signature = JSON.stringify([ownerId, suggestion, items.length > 0]);
    if (signature !== homeSignature) {
      homeSignature = signature; options.homeHost.replaceChildren();
      if (suggestion || items.length) {
        const card = node('div', 'studio-continue'); card.dataset.nextKind = suggestion?.kind ?? 'notifications';
        const art = node('span', 'studio-continue-art', suggestion?.art ?? ''); art.setAttribute('aria-hidden', 'true');
        if (!suggestion) art.append(createIcon('clock'));
        const copy = node('div', 'studio-continue-copy');
        if (suggestion) {
          copy.append(node('span', 'studio-next-kind', suggestion.title), node('strong', '', suggestion.name),
            node('span', 'studio-next-description', suggestion.description));
        } else {
          copy.append(node('strong', '', 'Your ideas are here'), node('span', 'studio-next-description', 'See your saved updates whenever you are ready.'));
        }
        const actions = node('div', 'studio-continue-actions');
        if (suggestion) {
          const resume = button('studioContinuePlaying', suggestion.actionLabel,
            ['ready', 'play', 'experiment'].includes(suggestion.kind) ? 'play' : 'edit', 'studio-button studio-primary');
          resume.onclick = () => suggestion.notification ? options.onOpen(suggestion.notification, 'home') : options.onContinue(suggestion);
          actions.append(resume);
        }
        actions.append(entry('studioNotificationsHome')); card.append(art, copy, actions);
        if (suggestion) {
          const dismiss = button('studioDismissResume', '', 'close', 'studio-continue-close');
          dismiss.title = 'Dismiss reminder'; dismiss.setAttribute('aria-label', 'Dismiss reminder for ' + suggestion.name);
          dismiss.onclick = () => options.onDismiss(suggestion); card.append(dismiss);
        }
        options.homeHost.append(card);
      }
    }
    updateBadges(items);
  }

  function renderPage(items: readonly StudioNotification[], ownerId: string, busySessionIds: ReadonlySet<string>) {
    const signature = JSON.stringify([ownerId, items, [...busySessionIds].sort()]);
    if (signature === pageSignature) return;
    pageSignature = signature;
    const focused = document.activeElement as HTMLElement | null;
    const focusedSession = focused?.closest<HTMLElement>('[data-notification-session]')?.dataset.notificationSession;
    const focusedAction = focused?.dataset.notificationOpen !== undefined ? '[data-notification-open]' :
      focused?.dataset.action === 'read-aloud' ? '[data-action="read-aloud"]' :
      focused?.classList.contains('studio-stop-build') ? '.studio-stop-build' :
      focused?.classList.contains('studio-wait-arcade-button') ? '.studio-wait-arcade-button' : null;
    const nextRows = new Map<string, CachedRow>();
    for (const item of items) {
      const key = JSON.stringify([ownerId, item.sessionId]);
      const rowSignature = JSON.stringify([item, busySessionIds.has(item.sessionId)]);
      const previous = rows.get(key);
      // Another project's arrival or new state must not discard a child's
      // current reading or its already downloaded, gesture-required audio.
      if (previous?.signature === rowSignature) { nextRows.set(key, previous); continue; }
      const row = node('article', 'studio-notification-item'); row.dataset.notificationSession = item.sessionId;
      row.dataset.notificationKind = item.kind;
      const copy = node('div', 'studio-notification-copy');
      const kind = node('p', 'studio-notification-kind', item.title);
      if (item.unread) kind.append(node('span', 'studio-notification-new', 'New'));
      copy.append(kind, node('h2', '', item.projectName));
      if (item.idea) copy.append(node('p', 'studio-notification-idea', item.idea));
      copy.append(node('p', 'studio-notification-description', item.description));
      const actions = node('div', 'studio-notification-actions');
      const primary = button('', item.actionLabel, item.action === 'open-ready' || item.kind === 'experiment' ? 'play' : 'edit', 'studio-button studio-primary');
      primary.removeAttribute('id'); primary.dataset.notificationOpen = '';
      primary.onclick = () => options.onOpen(item, 'notifications'); actions.append(primary);
      const reader = createReadAloudControl({
        text: () => [item.title, item.projectName, item.idea, item.description].filter(Boolean).join('. '),
        buttonClass: 'studio-button', canRead: () => options.canRead(item.ownerId) && row.isConnected,
      }); actions.append(reader.element);
      if (busySessionIds.has(item.sessionId)) {
        const wait = button('', 'Play while I wait', 'play', 'studio-button studio-wait-arcade-button'); wait.removeAttribute('id');
        wait.onclick = () => options.onPlayWhileWaiting(item);
        const stop = button('', 'Stop build', 'stop', 'studio-button studio-stop-build'); stop.removeAttribute('id');
        stop.setAttribute('aria-label', 'Stop build for ' + item.projectName);
        stop.onclick = async () => {
          stop.disabled = true; setIconLabel(stop, 'stop', 'Stopping…');
          try { await options.onStop(item); }
          finally { if (stop.isConnected) { stop.disabled = false; setIconLabel(stop, 'stop', 'Stop build'); } }
        };
        actions.append(wait, stop);
      }
      row.append(copy, actions);
      nextRows.set(key, { signature: rowSignature, row, reader });
    }
    for (const [key, previous] of rows) {
      if (nextRows.get(key) !== previous) { previous.reader.dispose(); previous.row.remove(); }
    }
    rows = nextRows;
    if (!items.length) {
      const empty = node('div', 'studio-notifications-empty');
      empty.append(createIcon('check'), node('h2', '', 'All caught up'), node('p', '', 'New games and unfinished ideas will appear here.'));
      list.replaceChildren(empty);
    } else {
      list.querySelector('.studio-notifications-empty')?.remove();
      let index = 0;
      for (const {row} of rows.values()) {
        const at = list.children[index++];
        if (at !== row) list.insertBefore(row, at ?? null);
      }
    }
    if (focusedSession && focusedAction && !page.classList.contains('hidden')) {
      const row = [...list.querySelectorAll<HTMLElement>('[data-notification-session]')]
        .find(element => element.dataset.notificationSession === focusedSession);
      (row?.querySelector<HTMLElement>(focusedAction) ?? title).focus({preventScroll: true});
    }
  }
  return {
    page, menuEntry, playEntry, renderHome, renderPage, updateBadges,
    stopReading() { rows.forEach(({reader}) => reader.stop()); },
    clear() { clearReaders(); list.replaceChildren(); options.homeHost.replaceChildren(); pageSignature = ''; homeSignature = ''; },
  };
}

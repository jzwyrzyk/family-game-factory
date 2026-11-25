import {adultStorageKey} from '../adult-pilot/storage';
import {LOCAL_JOURNAL_KEY} from '../storage/local-journal';
/** The legacy source stores are synchronous. Keep one writer per browser origin
 * so an old tab cannot replace a newer attempt and its pending reward receipt. */
let managed = false;
let writable = true;
let acquiring: Promise<boolean> | undefined;
let release: (() => void) | undefined;
let notice: HTMLDivElement | undefined;
let needsReload = false;
let maintenance = false;
const paused = new Map<HTMLElement, boolean>();

export function assertRewardSourceLockHeld(): void {
  if (managed && !writable) throw Error('Jems is open in another tab. Close that tab, then choose Try this tab here.');
}

export function assertRewardSourceWritable(): void {
  if (typeof localStorage !== 'undefined' && (localStorage.getItem(adultStorageKey(LOCAL_JOURNAL_KEY)) !== null||localStorage.getItem(adultStorageKey('jems-complete-restore-pending-v1'))!==null)) throw Error('Saved work needs recovery. Reload Jems before saving again.');
  if (maintenance) throw Error('Jems is restoring saved progress. Wait for the page to finish reloading.');
  if (managed && !writable) throw Error('Jems is open in another tab. Close that tab, then choose Try this tab here.');
}

export function rewardSourceWritable(): boolean { try { assertRewardSourceWritable(); return true; } catch { return false; } }
export function setRewardSourceMaintenance(blocked: boolean): void { maintenance = blocked; }

function showNotice(message: string, retry = true): void {
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'jemsWriterNotice';
    notice.setAttribute('role', 'dialog');
    notice.setAttribute('aria-modal', 'true');
    notice.setAttribute('aria-labelledby', 'jemsWriterTitle');
    Object.assign(notice.style, { position: 'fixed', inset: '0', zIndex: '10000', background: '#faf8fff5', display: 'grid', placeItems: 'center', padding: '24px' });
    const card = document.createElement('section');
    Object.assign(card.style, { maxWidth: '420px', padding: '28px', borderRadius: '24px', background: 'white', boxShadow: '0 12px 60px #44316b20' });
    const title = document.createElement('h1'); title.id = 'jemsWriterTitle'; title.textContent = 'One Jems tab at a time';
    const copy = document.createElement('p'); copy.id = 'jemsWriterMessage'; copy.setAttribute('role', 'status');
    const button = document.createElement('button'); button.id = 'jemsWriterRetry'; button.type = 'button'; button.textContent = 'Try this tab';
    Object.assign(button.style, { minHeight: '48px', padding: '10px 20px', borderRadius: '16px' });
    button.onclick = () => { void acquire(); };
    card.append(title, copy, button); notice.append(card); document.body.append(notice);
    notice.addEventListener('keydown', event => { if (event.key === 'Tab') { event.preventDefault(); button.focus(); } });
  }
  for (const child of Array.from(document.body.children)) {
    if (child instanceof HTMLElement && child !== notice) { if (!paused.has(child)) paused.set(child, child.inert); child.inert = true; }
  }
  notice.querySelector('#jemsWriterMessage')!.textContent = message;
  const button = notice.querySelector<HTMLButtonElement>('#jemsWriterRetry')!; button.hidden = !retry;
  if (retry) button.focus();
}

function hideNotice(): void {
  for (const [element, inert] of paused) element.inert = inert;
  paused.clear(); notice?.remove(); notice = undefined;
}

function acquire(): Promise<boolean> {
  if (acquiring) return acquiring;
  if (release) return Promise.resolve(true);
  writable = false;
  if (!navigator.locks?.request) {
    showNotice('This browser cannot safely save Jems progress. Open Jems in a current Chrome, Edge, Firefox, or Safari browser.', false);
    return Promise.resolve(false);
  }
  acquiring = new Promise<boolean>(resolve => {
    void navigator.locks.request('jems-source-writer-v1', { mode: 'exclusive', ifAvailable: true }, async lock => {
      acquiring = undefined;
      if (!lock) {
        needsReload = true;
        showNotice('Jems is already open in another tab. Close that tab, then try here. Your saved progress is safe.');
        resolve(false); return;
      }
      const held = new Promise<void>(done => { release = done; });
      if (needsReload) {
        // This document may hold an old in-memory profile from before another
        // tab saved. Reload under the lock before allowing any source writes.
        resolve(false); location.reload(); await held; return;
      }
      writable = true; hideNotice();
      resolve(true);
      window.dispatchEvent(new CustomEvent('jems:source-writable'));
      await held;
    }).catch(() => {
      acquiring = undefined;
      showNotice('Jems could not open safe saving. Close other Jems tabs and try again.'); resolve(false);
    });
  });
  return acquiring;
}

export function installRewardWriteGuard(): Promise<boolean> {
  if (!managed) {
    managed = true; writable = false;
    window.addEventListener('pagehide', () => {
      // Other pagehide listeners save interrupted activity before the lock ends.
      queueMicrotask(() => { needsReload = true; writable = false; release?.(); release = undefined; });
    });
    window.addEventListener('pageshow', event => { if (event.persisted) void acquire(); });
  }
  return acquire();
}

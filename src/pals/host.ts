import { createPalsPage, createPalsWidget, createPalCameo } from './ui';
import { palDefinition, palLine, type PalId, type PalLineKind } from './catalog';
import type { PalsController, PalsNotice } from './service';
import './pals.css';

interface PalsHost {
  controller: PalsController;
  enter(): boolean;
  home(): void;
  create(id: PalId): void;
  refreshCreation(): void;
  help(): void;
}
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const element = document.createElement(tag); element.className = className; element.textContent = text; return element;
};

/** Installs trusted host presentation. Nothing is injected into a game's iframe. */
export function installPalsInterface(host: PalsHost) {
  const FG = (window as any).FG, pals = host.controller;
  let openNow = false, noticeTimer: ReturnType<typeof setTimeout> | undefined;
  let toastTimer: ReturnType<typeof setTimeout> | undefined, pending: PalsNotice | null = null;
  let pendingOwner = '', quip = 0, lastEncouragementAt = 0;
  const action = (work: () => void | Promise<void>) => { try { void Promise.resolve(work()).catch(() => {}); } catch { /* Controller renders its scoped failure. */ } };
  function open() {
    try { if (!host.enter()) return; }
    catch (error) {
      const status = document.getElementById('studioGlobalStatus');
      if (status) { status.hidden = false; status.textContent = error instanceof Error ? error.message : 'Your current work could not be saved. Try again before opening My Pals.'; status.classList.add('is-error'); }
      return;
    }
    openNow = true; page.show();
    document.querySelectorAll('.studio-nav button').forEach(button => {
      const selected = button.id === 'studioNavPals'; button.classList.toggle('active', selected);
      if (selected) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0); void pals.refresh().catch(() => {});
  }
  const page = createPalsPage({ state: pals.state, onBack: host.home,
    onChooseStarter: id => pals.chooseStarter(id), onCollect: id => pals.collect(id),
    onEquip: id => pals.equip(id), onCreate: host.create,
    onPreferences: patch => pals.setPreferences(patch), onRetry: () => pals.refresh(),
  });
  document.querySelector('main')!.append(page.element);
  const nav = node('button', '', 'My Pals'); nav.id = 'studioNavPals'; nav.type = 'button'; nav.onclick = open;
  const journeyNav = document.getElementById('studioNavJourney');
  (document.getElementById('studioNavRewards') ?? journeyNav)?.after(nav);

  const widget = createPalsWidget({ state: pals.state, onOpen: open, onCreate: host.create });
  widget.element.id = 'studioPalsEntry';
  // Keep the first playable game in the mobile viewport. The collection follows
  // the game shelf and the existing Create & code entrance.
  (document.getElementById('studioScenes') ?? document.getElementById('studioFavoritesSection'))?.after(widget.element);
  const cameo = createPalCameo({ state: pals.state, onOpen: open, onHelp: host.help });
  cameo.element.id = 'studioPalCameo';
  document.getElementById('studioGameHost')?.after(cameo.element);
  const toastHost = node('div', 'pals-toast-host'); toastHost.id = 'jemsPalsCelebrations';
  toastHost.style.pointerEvents = 'none'; document.body.append(toastHost);

  const parent = node('section', 'pals-parent-settings'); parent.id = 'parentPals';
  parent.append(node('h2', '', 'Companions'));
  parent.append(node('p', '', 'Choose how Pals appear for this player. Collection and growth keep saving.'));
  const controls = [
    ['showCompanion', 'Show the active Pal around Jems'],
    ['encouragement', 'Funny encouragement and companion celebrations'],
  ] as const;
  for (const [key, label] of controls) {
    const line = node('label'), input = node('input'); input.type = 'checkbox'; input.dataset.palPreference = key;
    input.onchange = () => action(() => pals.setPreferences({ [key]: input.checked }));
    line.append(input, document.createTextNode(label)); parent.append(line);
  }
  const parentStatus = node('p'); parentStatus.setAttribute('role', 'status'); parent.append(parentStatus);
  document.getElementById('page-parent')?.append(parent);

  function visibility() {
    const playing = !document.getElementById('page-studio')?.classList.contains('hidden');
    cameo.setVisible(playing && !FG.learning.active && !document.hidden);
  }
  function learningHelp() {
    document.querySelectorAll('[data-pal-hint]').forEach(element => element.remove());
    const active = pals.state.profile?.activeId;
    if (!active || !pals.state.profile?.preferences.showCompanion || !FG.learning.active) return;
    const hint = Array.from(document.querySelectorAll<HTMLButtonElement>('.math-support-actions [data-action="hint"],.language-help-controls [data-action="hint"]'))
      .find(button => !button.disabled && button.getClientRects().length > 0);
    if (!hint) return;
    const button = node('button', 'pals-hint-button', `Ask ${palDefinition(active).name} for a hint`);
    button.type = 'button'; button.dataset.palHint = active;
    button.onclick = () => {
      if (pals.state.profile?.activeId !== active || !FG.learning.active || hint.disabled || !hint.isConnected) return;
      // The existing host action records hint depth and assisted evidence. The
      // Pal never receives the answer key or changes correctness/difficulty.
      hint.click();
      button.textContent = `${palDefinition(active).name}: clues are useful!`;
      button.disabled = hint.disabled || !hint.isConnected;
    };
    hint.parentElement!.append(button);
  }
  function clear() {
    clearTimeout(noticeTimer); clearTimeout(toastTimer); pending = null; pendingOwner = ''; toastHost.replaceChildren();
  }
  function presentNotice() {
    if (!pending || pendingOwner !== pals.state.owner || document.hidden || FG.learning.active) return;
    const state = pals.state, notice = pending; pending = null;
    const active = state.profile?.activeId;
    if (!active || !state.profile?.preferences.showCompanion || !state.profile.preferences.encouragement) return;
    const gained = notice.growth.find(item => item.palId === active), available = notice.available[0];
    const notable = gained || available;
    if (!notable && Date.now() - lastEncouragementAt < 25_000) return;
    lastEncouragementAt = Date.now();
    const kind: PalLineKind = gained ? 'growth' : notice.activities.includes('game.developed') ? 'making'
      : notice.activities.includes('scene.challenge') ? 'coding' : 'practice';
    cameo.say(kind, ++quip);
    const copy = node('div', 'pals-reward-note');
    if (available) copy.append(node('strong', '', `${palDefinition(available).name} is ready to join!`));
    else if (gained) copy.append(node('strong', '', `${palDefinition(active).name} is now a ${gained.to === 3 ? 'Radiant' : 'Bright'} Pal!`));
    copy.append(node('p', '', `${palDefinition(active).name}: ${palLine(active, kind, quip)}`));
    // One shared achievement surface for a saved action. If the gem popup is
    // already present, add this small Pal response to it rather than stack cards.
    const rewardToast = document.querySelector('#jemsRewardCelebrations > *');
    if (rewardToast) rewardToast.append(copy);
    else if (notable) {
      const toast = node('div', 'pals-toast'); toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite');
      toast.append(copy); toastHost.replaceChildren(toast);
      clearTimeout(toastTimer); toastTimer = setTimeout(() => toastHost.replaceChildren(), 4200);
    }
  }
  const unsubscribe = pals.subscribe((state, notice) => {
    page.update(state); widget.update(state); cameo.update(state); visibility(); learningHelp(); host.refreshCreation();
    for (const [key] of controls) {
      const input = parent.querySelector<HTMLInputElement>(`[data-pal-preference="${key}"]`)!;
      input.checked = state.profile?.preferences[key] ?? true; input.disabled = state.loading || state.saving || !state.profile;
    }
    parentStatus.textContent = state.error ?? (state.saving ? 'Saving your choice…' : '');
    if (!notice.available.length && !notice.growth.length && !notice.activities.length) return;
    if (pending && pendingOwner === state.owner) {
      const growth = new Map(pending.growth.map(item => [item.palId, item]));
      for (const item of notice.growth) {
        const earlier = growth.get(item.palId);
        growth.set(item.palId, earlier ? { ...item, from: earlier.from } : item);
      }
      pending = { available: [...new Set([...pending.available, ...notice.available])],
        growth: [...growth.values()], activities: [...new Set([...pending.activities, ...notice.activities])] };
    } else pending = notice;
    pendingOwner = state.owner; clearTimeout(noticeTimer);
    noticeTimer = setTimeout(presentNotice, 260);
  });
  const hidePage = () => { openNow = false; page.hide(); nav.classList.remove('active'); nav.removeAttribute('aria-current'); };
  const onPage = () => { hidePage(); queueMicrotask(visibility); };
  const onProfile = () => { hidePage(); clear(); lastEncouragementAt = 0; queueMicrotask(visibility); };
  const onLearning = () => { queueMicrotask(() => { visibility(); learningHelp(); if (!FG.learning.active) { clearTimeout(noticeTimer); noticeTimer = setTimeout(presentNotice, 260); } }); };
  const onVisibility = () => { visibility(); if (document.hidden) clear(); };
  window.addEventListener('factory-page', onPage);
  window.addEventListener('factory-profile', onProfile);
  window.addEventListener('factory-learning-active', onLearning);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', clear);
  // This is a host-only read/navigation surface. No award, import, or mutation
  // method is exposed to generated games or their message handlers.
  FG.pals = { version: 1, open, view: () => pals.state.profile ? structuredClone(pals.state.profile) : null };
  if (new URLSearchParams(location.search).get('pals') === '1') open();
  return { open, get isOpen() { return openNow; }, dispose() {
    clear(); unsubscribe(); page.dispose(); widget.dispose(); cameo.dispose();
    nav.remove(); parent.remove(); toastHost.remove();
    window.removeEventListener('factory-page', onPage); window.removeEventListener('factory-profile', onProfile);
    window.removeEventListener('factory-learning-active', onLearning); document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', clear);
  } };
}

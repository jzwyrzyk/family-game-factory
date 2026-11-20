import { PAL_CATALOG, palDefinition, palLine, type PalId, type PalLineKind } from './catalog';
import type { PalsView, PalPreferences, OwnedPalView, PalStage } from './model';
import './pals.css';

/** Read-only presentation. Only the trusted coordinator changes ownership or growth. */
export interface PalsViewState {
  owner: string;
  profile: PalsView | null;
  lifetimeGems: number | null;
  loading: boolean;
  saving?: boolean;
  error?: string;
}
type Action = void | Promise<unknown>;
export interface PalsPageOptions {
  state: PalsViewState;
  onBack: () => Action;
  onChooseStarter: (id: PalId, owner: string) => Action;
  onCollect: (id: PalId, owner: string) => Action;
  onEquip: (id: PalId, owner: string) => Action;
  onCreate: (id: PalId, owner: string) => Action;
  onPreferences: (patch: Partial<PalPreferences>, owner: string) => Action;
  onRetry: () => Action;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const result = document.createElement(tag);
  result.className = className;
  if (text) result.textContent = text;
  return result;
};
const button = (label: string, key: string, className = 'pals-button') => {
  const result = el('button', className, label);
  result.type = 'button';
  result.dataset.palsFocus = key;
  return result;
};
const owned = (state: PalsViewState, id: PalId | null | undefined) => state.profile?.owned.find(item => item.id === id);
const ready = (state: PalsViewState) => !state.loading && !!state.profile && state.profile.owner === state.owner;
const count = (value: number) => new Intl.NumberFormat('en-US').format(value);

/** Existing, approved gem tokens. Character designs and evolved portraits remain separate artwork work. */
export function createPalPortrait(id: PalId, stage: PalStage = 1, className = ''): HTMLElement {
  const definition = palDefinition(id);
  const portrait = el('span', `pals-portrait ${className}`);
  portrait.dataset.pal = id;
  portrait.dataset.stage = String(stage);
  portrait.dataset.form = stage === 2 ? 'mature' : 'base';
  portrait.dataset.artwork = definition.artwork.status;
  portrait.setAttribute('aria-hidden', 'true');
  const image = el('img');
  image.src = new URL(definition.artPath, document.baseURI).href;
  image.alt = '';
  image.width = 240;
  image.height = 240;
  image.decoding = 'async';
  portrait.append(image);
  return portrait;
}

function progress(value: number, max: number, label: string) {
  const meter = el('progress', 'pals-progress');
  meter.max = Math.max(1, max);
  meter.value = Math.max(0, Math.min(value, meter.max));
  meter.setAttribute('aria-label', label);
  return meter;
}

function growthCopy(pal: OwnedPalView): string {
  return pal.nextStageAt === null ? `${count(pal.adventures)} adventures together` : `${count(pal.adventuresToNext)} more adventures to Grown`;
}

/** A complete collection page with no modal takeover and no mutations on render. */
export function createPalsPage(options: PalsPageOptions) {
  let state = options.state;
  let selection: PalId | null = state.profile?.activeId ?? null;
  let localSaving = false;
  let localError = '';
  let epoch = 0;
  let disposed = false;
  let pendingFocus = '';
  let playCount = 0;
  let playLine = '';
  let playPal: PalId | null = null;
  let playTimer: ReturnType<typeof setTimeout> | undefined;
  let optionsOpen = false;
  let growthOpen = false;

  const element = el('section', 'page hidden jems-pals');
  element.id = 'page-jems-pals';
  element.hidden = true;
  element.setAttribute('aria-labelledby', 'jemsPalsTitle');

  const header = el('div', 'pals-page-heading');
  const titleBlock = el('div');
  const back = button('← My games', 'back', 'pals-button pals-quiet');
  back.id = 'jemsPalsBack';
  back.onclick = () => { void perform(() => options.onBack()); };
  const eyebrow = el('span', 'pals-eyebrow', 'A LITTLE SPARKLE. A LOT OF IDEAS.');
  const heading = el('h1', '', 'My Pals');
  heading.id = 'jemsPalsTitle';
  heading.tabIndex = -1;
  const intro = el('p', 'pals-lead', 'Meet your crew. Make something together.');
  titleBlock.append(eyebrow, heading, intro);
  const total = el('span', 'pals-collection-count');
  total.id = 'jemsPalsCount';
  header.append(titleBlock, total);

  const notice = el('p', 'pals-art-note', 'Gem portraits are a preview. Companion character art is coming next.');
  const message = el('div', 'pals-status');
  message.id = 'jemsPalsStatus';
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  message.setAttribute('aria-atomic', 'true');
  const retry = button('Try again', 'retry');
  retry.onclick = () => { void perform(options.onRetry); };
  const content = el('div', 'pals-content');
  element.append(back, header, notice, message, retry, content);

  function focusKey() {
    const target = document.activeElement;
    return target instanceof HTMLElement && element.contains(target) ? target.dataset.palsFocus ?? '' : '';
  }
  function restoreFocus(key: string) {
    if (!key || element.hidden) return;
    const target = Array.from(element.querySelectorAll<HTMLElement>('[data-pals-focus]')).find(item => item.dataset.palsFocus === key);
    if (target && !('disabled' in target && target.disabled)) target.focus({ preventScroll: true });
  }
  async function perform(action: () => Action) {
    if (disposed || localSaving || state.saving) return;
    const capturedOwner = state.owner, capturedEpoch = epoch;
    pendingFocus = focusKey();
    localSaving = true;
    localError = '';
    render();
    try { await action(); }
    catch (error) {
      if (!disposed && capturedEpoch === epoch && capturedOwner === state.owner) localError = error instanceof Error ? error.message : 'That could not be saved. Please try again.';
    } finally {
      if (!disposed && capturedEpoch === epoch && capturedOwner === state.owner) {
        localSaving = false;
        render();
        restoreFocus(pendingFocus);
        pendingFocus = '';
      }
    }
  }
  function actionButton(label: string, key: string, action: () => Action, primary = false) {
    const result = button(label, key, `pals-button${primary ? ' pals-primary' : ''}`);
    result.disabled = localSaving || !!state.saving || !ready(state);
    result.onclick = () => { void perform(action); };
    return result;
  }
  function select(id: PalId) {
    if (selection !== id) { playLine = ''; playPal = null; }
    selection = id;
    render();
  }
  function play(id: PalId) {
    if (disposed || !owned(state, id) || localSaving || state.saving) return;
    playPal = id;
    playLine = palLine(id, 'play', playCount++);
    const line = element.querySelector<HTMLElement>('#jemsPalPlayLine');
    if (line) line.textContent = playLine;
    const toy = element.querySelector<HTMLElement>('#jemsPalPlay');
    if (playTimer) clearTimeout(playTimer);
    toy?.classList.remove('is-playing');
    // Force a fresh finite reaction only after an intentional tap.
    if (toy) { void toy.offsetWidth; toy.classList.add('is-playing'); }
    playTimer = setTimeout(() => toy?.classList.remove('is-playing'), 650);
  }

  function render() {
    if (disposed) return;
    const previousFocus = focusKey();
    const isReady = ready(state), busy = localSaving || !!state.saving;
    element.setAttribute('aria-busy', String(state.loading || busy));
    element.dataset.owner = state.owner;
    back.disabled = busy;
    const error = localError || state.error || '';
    message.textContent = error || (state.loading ? 'Opening your saved Pals…' : busy ? 'Saving…' : '');
    message.classList.toggle('is-error', !!error);
    message.hidden = !message.textContent;
    retry.hidden = !error;
    retry.disabled = busy || state.loading;
    total.textContent = isReady ? `${state.profile!.owned.length} / ${PAL_CATALOG.length} Pals` : 'Your collection';
    content.replaceChildren();
    if (!isReady) {
      content.append(el('div', 'pals-loading', state.loading ? 'Your crew will be right here.' : 'Your saved collection has not been replaced.'));
      restoreFocus(previousFocus);
      return;
    }
    const profile = state.profile!;
    if (selection === null || !PAL_CATALOG.some(pal => pal.id === selection)) selection = profile.activeId;
    const selectedOwned = owned(state, selection);
    if (!profile.starterId) {
      const welcome = el('section', 'pals-welcome');
      welcome.append(el('span', 'pals-kicker', 'YOUR FIRST PAL IS FREE'), el('h2', '', 'Who’s coming on your adventure?'), el('p', '', 'Choose Glim or Kip. You can collect the other Pal as you earn gems.'));
      content.append(welcome);
    } else if (selectedOwned) {
      content.append(detail(selectedOwned));
    }

    const shelf = el('section', 'pals-shelf');
    shelf.setAttribute('aria-labelledby', 'jemsPalsShelfTitle');
    const shelfHeading = el('div', 'pals-section-heading');
    const h2 = el('h2', '', profile.starterId ? 'Your growing crew' : 'Meet the Pals');
    h2.id = 'jemsPalsShelfTitle';
    const gemCount = el('span', 'pals-gem-count', state.lifetimeGems === null ? 'Gems are loading…' : `${count(state.lifetimeGems)} lifetime gems`);
    shelfHeading.append(h2, gemCount);
    const grid = el('div', 'pals-grid');
    for (const definition of PAL_CATALOG) {
      const pal = owned(state, definition.id), available = profile.availableIds.includes(definition.id);
      const starter = !profile.starterId && definition.starter;
      const card = el('article', 'pals-card');
      card.dataset.pal = definition.id;
      card.dataset.owned = String(!!pal);
      card.dataset.active = String(profile.activeId === definition.id);
      card.classList.toggle('is-selected', selection === definition.id && !!pal);
      const badge = el('span', 'pals-card-badge', starter ? 'Free starter' : pal ? profile.activeId === pal.id ? 'Along for the adventure' : pal.stageName : available ? 'Ready to meet' : `Meet at ${definition.unlockGems} gems`);
      const art = pal ? button('', `details-${definition.id}`, 'pals-card-art') : el('div', 'pals-card-art');
      art.append(createPalPortrait(definition.id, pal?.stage ?? 1));
      if (art instanceof HTMLButtonElement) {
        art.setAttribute('aria-label', `Show ${definition.name} and progress`);
        art.setAttribute('aria-pressed', String(selection === definition.id));
        art.disabled = busy;
        art.onclick = () => {
          select(definition.id);
          element.querySelector<HTMLElement>('#jemsPalDetailTitle')?.focus({ preventScroll: true });
        };
      }
      const name = el('h3', '', definition.name);
      const tagline = el('p', 'pals-card-tagline', definition.tagline);
      const description = el('p', 'pals-card-description', definition.description);
      card.append(badge, art, name, tagline, description);
      const actions = el('div', 'pals-card-actions');
      if (starter) {
        actions.append(actionButton(`Choose ${definition.name}`, `starter-${definition.id}`, () => options.onChooseStarter(definition.id, state.owner), true));
      } else if (pal) {
        const text = el('p', 'pals-card-progress', pal.nextStageAt === null ? `Grown · ${count(pal.adventures)} adventures` : `${count(pal.adventures)} / ${pal.nextStageAt} adventures`);
        actions.append(text);
        if (pal.nextStageAt !== null) actions.append(progress(pal.adventures, pal.nextStageAt, `${definition.name}: ${pal.adventures} of ${pal.nextStageAt} adventures`));
        if (profile.activeId !== definition.id) actions.append(actionButton('Take along', `equip-${definition.id}`, () => options.onEquip(definition.id, state.owner)));
        else {
          const active = el('span', 'pals-active-mark', '✓ Your active Pal');
          actions.append(active);
        }
        actions.append(actionButton('Create with this Pal', `create-card-${definition.id}`, () => options.onCreate(definition.id, state.owner), true));
      } else if (available) {
        actions.append(actionButton(`Welcome ${definition.name}`, `collect-${definition.id}`, () => options.onCollect(definition.id, state.owner), true));
        actions.append(el('small', '', 'Your gems stay yours.'));
      } else {
        const remaining = state.lifetimeGems === null ? null : Math.max(0, definition.unlockGems - state.lifetimeGems);
        actions.append(el('p', 'pals-unlock-copy', !profile.starterId ? starter ? 'Choose your first Pal above.' : 'Choose a starter, then grow your crew.' : remaining === null ? 'Checking your gems…' : `${count(remaining)} more gems to meet ${definition.name}`));
        if (state.lifetimeGems !== null) actions.append(progress(state.lifetimeGems, definition.unlockGems, `${definition.name} unlocks at ${definition.unlockGems} lifetime gems`));
        if (profile.starterId) actions.append(actionButton('Find an adventure', `adventure-${definition.id}`, options.onBack));
      }
      card.append(actions);
      grid.append(card);
    }
    shelf.append(shelfHeading, grid);
    content.append(shelf);
    content.append(explainer(), preferences());
    restoreFocus(previousFocus);
  }

  function detail(pal: OwnedPalView) {
    const definition = palDefinition(pal.id), profile = state.profile!;
    const hero = el('section', 'pals-detail');
    hero.setAttribute('aria-labelledby', 'jemsPalDetailTitle');
    hero.dataset.pal = pal.id;
    hero.dataset.stage = String(pal.stage);
    const playground = el('div', 'pals-playground');
    const toy = button(`Play with ${definition.name}`, `play-${pal.id}`, 'pals-play-button');
    toy.id = 'jemsPalPlay';
    toy.textContent = '';
    toy.setAttribute('aria-label', `Tap ${definition.name} for a playful reaction`);
    toy.disabled = localSaving || !!state.saving;
    toy.append(createPalPortrait(pal.id, pal.stage, 'pals-hero-portrait'));
    toy.onclick = () => play(pal.id);
    const hint = el('span', 'pals-tap-hint', `Tap ${definition.name}`);
    const speech = el('p', 'pals-play-line', playPal === pal.id && playLine ? playLine : profile.preferences.encouragement ? palLine(pal.id, 'welcome', state.owner) : `Ready when you are. Tap ${definition.name} to play.`);
    speech.id = 'jemsPalPlayLine';
    speech.setAttribute('role', 'status');
    speech.setAttribute('aria-live', 'polite');
    speech.setAttribute('aria-atomic', 'true');
    playground.append(toy, hint, speech);
    const info = el('div', 'pals-detail-copy');
    info.append(el('span', 'pals-kicker', profile.activeId === pal.id ? 'YOUR ADVENTURE BUDDY' : 'PART OF YOUR CREW'));
    const title = el('h2', '', definition.name);
    title.id = 'jemsPalDetailTitle';
    title.tabIndex = -1;
    info.append(title, el('p', 'pals-detail-tagline', definition.tagline));
    const stage = el('span', 'pals-stage-label', pal.stageName);
    info.append(stage);
    const trail = el('ol', 'pals-growth-stages');
    trail.setAttribute('aria-label', `${definition.name}'s growth stages`);
    for (const [index, label] of ['Base', 'Grown'].entries()) {
      const step = el('li');
      step.dataset.earned = String(index + 1 <= pal.stage);
      if (index + 1 === pal.stage) step.setAttribute('aria-current', 'step');
      step.append(el('span', 'pals-stage-dot', index + 1 <= pal.stage ? '✓' : String(index + 1)), el('span', '', label));
      if (index + 1 > pal.stage) step.append(el('span', 'pals-sr-only', ' · upcoming'));
      trail.append(step);
    }
    info.append(trail);
    const growth = el('div', 'pals-growth');
    growth.append(el('strong', '', growthCopy(pal)));
    if (pal.nextStageAt !== null) {
      growth.append(progress(pal.adventures, pal.nextStageAt, `${definition.name} growth: ${pal.adventures} of ${pal.nextStageAt} adventures`));
      growth.append(el('span', 'pals-growth-detail', `${count(pal.adventures)} / ${pal.nextStageAt} adventures · ${pal.practiceToNextAdventure} learning ${pal.practiceToNextAdventure === 1 ? 'activity' : 'activities'} to the next adventure`));
    } else growth.append(el('p', 'pals-growth-detail', 'Grown form reached. Keep making new memories together.'));
    info.append(growth);
    const actions = el('div', 'pals-detail-actions');
    actions.append(actionButton('Make something with this Pal', `create-${pal.id}`, () => options.onCreate(pal.id, state.owner), true));
    if (profile.activeId !== pal.id) actions.append(actionButton(`Take ${definition.name} along`, `equip-detail-${pal.id}`, () => options.onEquip(pal.id, state.owner)));
    info.append(actions, el('p', 'pals-creation-hint', 'A playable scene, ready for your ideas.'));
    hero.append(playground, info);
    return hero;
  }

  function explainer() {
    const details = el('details', 'pals-explainer');
    details.open = growthOpen;
    details.addEventListener('toggle', () => { growthOpen = details.open; });
    const summary = el('summary', '', 'How do Pals grow?');
    summary.dataset.palsFocus = 'growth-help';
    const body = el('div');
    body.append(el('p', '', 'Take a Pal along while you learn and make. Every 5 saved Math or English activities, each new coding challenge, or a developed game adds an adventure. Using help still counts.'));
    body.append(el('p', '', 'Your Pal grows from Base to Grown at 5 adventures. There are two forms. Tapping your Pal is just for fun. Progress stays when you take a break.'));
    details.append(summary, body);
    return details;
  }

  function preferences() {
    const details = el('details', 'pals-options');
    details.open = optionsOpen;
    details.addEventListener('toggle', () => { optionsOpen = details.open; });
    const summary = el('summary', '', 'Companion options');
    summary.dataset.palsFocus = 'options';
    const body = el('div', 'pals-preferences');
    for (const [key, label, explanation] of [
      ['showCompanion', 'Show my Pal beside games', 'Your collection stays available in My Pals.'],
      ['encouragement', 'Funny encouragement', 'Short reactions while you make and learn.'],
    ] as const) {
      const row = el('label', 'pals-preference');
      const checkbox = el('input');
      checkbox.type = 'checkbox';
      checkbox.checked = state.profile!.preferences[key];
      checkbox.disabled = localSaving || !!state.saving;
      checkbox.dataset.palsFocus = `preference-${key}`;
      checkbox.id = `jemsPalPreference-${key}`;
      const copy = el('span');
      copy.append(el('strong', '', label), el('small', '', explanation));
      checkbox.onchange = () => { const checked = checkbox.checked; void perform(() => options.onPreferences({ [key]: checked }, state.owner)); };
      row.append(checkbox, copy);
      body.append(row);
    }
    details.append(summary, body);
    return details;
  }

  render();
  return {
    element,
    update(next: PalsViewState) {
      if (disposed) return;
      if (next.owner !== state.owner) {
        epoch++;
        selection = next.profile?.activeId ?? null;
        localSaving = false;
        localError = '';
        pendingFocus = '';
        playLine = '';
        playPal = null;
        playCount = 0;
        optionsOpen = growthOpen = false;
        if (playTimer) clearTimeout(playTimer);
      } else if (state.profile?.activeId !== next.profile?.activeId && next.profile?.activeId) selection = next.profile.activeId;
      state = next;
      render();
    },
    show() { element.hidden = false; element.classList.remove('hidden'); render(); heading.focus({ preventScroll: true }); },
    hide() { element.hidden = true; element.classList.add('hidden'); if (playTimer) clearTimeout(playTimer); },
    dispose() { disposed = true; epoch++; if (playTimer) clearTimeout(playTimer); element.remove(); },
  };
}

export function createPalsWidget(options: { state: PalsViewState; onOpen: () => void; onCreate?: (id: PalId, owner: string) => void }) {
  let state = options.state;
  const element = el('section', 'pals-home-widget');
  element.setAttribute('aria-label', 'My Pals');
  const open = button('', 'open-pals', 'pals-widget-open');
  open.onclick = options.onOpen;
  const make = button('Create together', 'widget-create', 'pals-button');
  make.onclick = () => { const id = state.profile?.activeId; if (id && ready(state) && !state.saving) options.onCreate?.(id, state.owner); };
  element.append(open, make);
  function update(next: PalsViewState) {
    state = next;
    const pal = owned(state, state.profile?.activeId);
    open.replaceChildren();
    const copy = el('span', 'pals-widget-copy');
    if (ready(state) && pal) {
      const definition = palDefinition(pal.id);
      open.append(createPalPortrait(pal.id, pal.stage));
      copy.append(el('strong', '', `${definition.name} is coming along`), el('span', '', `${pal.stageName} · ${growthCopy(pal)}`));
    } else {
      copy.append(el('strong', '', 'My Pals'), el('span', '', state.loading ? 'Opening your crew…' : state.error ? 'Open your collection to retry' : 'Choose a free Pal to join your adventures'));
    }
    open.append(copy, el('span', 'pals-widget-arrow', '→'));
    make.hidden = !options.onCreate || !pal || !ready(state);
    make.disabled = !!state.saving;
    element.dataset.owner = state.owner;
  }
  update(state);
  return { element, update, dispose() { element.remove(); } };
}

/** Inline host cameo. The host explicitly hides it during learning and can supply an existing help action. */
export function createPalCameo(options: { state: PalsViewState; onOpen: () => void; onHelp?: () => void }) {
  let state = options.state;
  let allowed = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const element = el('aside', 'pals-cameo');
  element.setAttribute('aria-label', 'Your Pal');
  const open = button('', 'cameo-open', 'pals-cameo-open');
  open.onclick = options.onOpen;
  const copy = el('span', 'pals-cameo-name');
  const speech = el('span', 'pals-cameo-line');
  speech.setAttribute('role', 'status');
  speech.setAttribute('aria-live', 'polite');
  speech.setAttribute('aria-atomic', 'true');
  speech.hidden = true;
  const help = button('Help', 'cameo-help', 'pals-button pals-quiet');
  help.hidden = !options.onHelp;
  help.onclick = () => options.onHelp?.();
  element.append(open, copy, speech, help);
  function visibility() { element.hidden = !allowed || !ready(state) || !state.profile?.activeId || !state.profile.preferences.showCompanion; }
  function clear() { if (timer) clearTimeout(timer); speech.textContent = ''; speech.hidden = true; }
  function update(next: PalsViewState) {
    if (state.owner !== next.owner || state.profile?.activeId !== next.profile?.activeId || !next.profile?.preferences.encouragement || !next.profile.preferences.showCompanion) clear();
    state = next;
    const pal = owned(state, state.profile?.activeId);
    open.replaceChildren();
    copy.textContent = '';
    if (pal) {
      const definition = palDefinition(pal.id);
      open.append(createPalPortrait(pal.id, pal.stage));
      open.setAttribute('aria-label', `Open My Pals. ${definition.name} is your active Pal.`);
      copy.textContent = definition.name;
    }
    visibility();
  }
  update(state);
  return {
    element, update,
    setVisible(value: boolean) { allowed = value; if (!value) clear(); visibility(); },
    say(kind: PalLineKind, seed: string | number = 0) {
      if (element.hidden || !state.profile?.activeId || !state.profile.preferences.encouragement || !ready(state)) return false;
      clear();
      speech.textContent = palLine(state.profile.activeId, kind, seed);
      speech.hidden = false;
      timer = setTimeout(clear, 8000);
      return true;
    },
    dispose() { clear(); element.remove(); },
  };
}

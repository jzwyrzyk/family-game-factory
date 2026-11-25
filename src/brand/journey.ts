import {createIcon,setIconLabel} from './icons';
import {createMakerIdentity, MAKER_ARTWORK, setMakerSprite, type MakerAtlas, type MakerCharacter} from './maker-identity';

/** Art choices are cosmetic. They are never gender, ability or learner records. */
export type JourneyCharacter = MakerCharacter;
export type JourneyLevel = 0 | 1 | 2 | 3 | 4;
export type JourneyState = {
  ownerId: string;
  level: JourneyLevel;
  character: JourneyCharacter | null;
  polishedCount: number;
  nextAction?: string;
  /** Label for the host's current next-step action, independent of outfit previews. */
  primaryActionLabel?: string;
};
export type JourneyAtlas = MakerAtlas;
export type JourneyArtwork = {
  spark: JourneyAtlas;
  nova: JourneyAtlas;
  gems: JourneyAtlas;
  background: string;
};
export type GemJourneyOptions = {
  onBack: () => void;
  onCreate: () => void;
  /** Resolve the current owner's unfinished work at click time; defaults to creation. */
  onPrimaryAction?: (ownerId: string) => void;
  /** Resolve only after the cosmetic choice was durably saved for this owner. */
  onChooseCharacter: (character: JourneyCharacter, ownerId: string) => void | Promise<void>;
  artwork?: Partial<JourneyArtwork>;
};

const LEVELS = [
  { level: 1, name: 'Gem Maker', action: 'Save your own idea.', reward: 'An idea of your own.' },
  { level: 2, name: 'Gem Cutter', action: 'Test a change. Share what you notice.', reward: 'A new way to play.' },
  { level: 3, name: 'Gem Polisher', action: 'Keep a change you tested.', reward: 'An idea, made brighter.' },
  { level: 4, name: 'Gem Master', action: 'Polish 3 different projects.', reward: 'Look what you can make.' }
] as const;

const DEFAULT_ARTWORK: JourneyArtwork = {
  ...MAKER_ARTWORK,
  background: 'jems-journey/background.webp'
};

const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
};
const button = (className: string, text: string, id?: string) => {
  const element = node('button', className, text);
  element.type = 'button';
  if (id) element.id = id;
  return element;
};
const assetUrl = (path: string) => new URL(path, document.baseURI).href;

/** Base-path-safe atlas placement shared by the page, home and celebration host. */
export const setJourneySprite = setMakerSprite;

export function createJourneyCharacter(character: JourneyCharacter, level: number, asset = DEFAULT_ARTWORK[character], ownerId = '') {
  return createMakerIdentity({ ownerId, character, level }, { ...MAKER_ARTWORK, [character]: asset });
}

/** One soft rank tile: the original maker, outfit and held jem stay together.
 * An undecided owner sees a neutral jem; only choice controls show both makers. */
export function createJourneyRankThumbnail(character: JourneyCharacter | null, level: number, artwork: Pick<JourneyArtwork, 'spark' | 'nova'> = DEFAULT_ARTWORK, ownerId = '') {
  const tile = node('span', 'jems-rank-thumbnail');
  tile.setAttribute('aria-hidden', 'true');
  tile.dataset.character = character ?? 'none';
  tile.dataset.level = String(level);
  tile.classList.toggle('is-unselected', !character);
  tile.append(createMakerIdentity({ ownerId, character, level }, { ...MAKER_ARTWORK, ...artwork }));
  return tile;
}

export function createJourneyGem(level: number, asset = DEFAULT_ARTWORK.gems) {
  const art = node('span', 'jems-journey-sprite jems-gem-art');
  art.setAttribute('aria-hidden', 'true');
  art.dataset.level = String(level);
  setJourneySprite(art, asset, level);
  return art;
}

/**
 * One illustrated destination; the Studio owns navigation, evidence and storage.
 * Previewing a future outfit changes no progress or selected character.
 */
export function installGemJourney(options: GemJourneyOptions) {
  const artwork: JourneyArtwork = { ...DEFAULT_ARTWORK, ...options.artwork };
  let state: JourneyState = { ownerId: '', level: 0, character: null, polishedCount: 0 };
  let previewLevel: 1 | 2 | 3 | 4 = 1;
  let returnFocus: HTMLElement | null = null;
  let saveEpoch = 0;
  let disposed = false;
  let saving = false;

  const element = node('section', 'page hidden jems-journey');
  element.id = 'page-jems-journey';
  element.hidden = true;
  element.setAttribute('aria-labelledby', 'jemsJourneyTitle');
  element.style.setProperty('--journey-world', `url(${JSON.stringify(assetUrl(artwork.background))})`);

  const toolbar = node('div', 'jems-journey-toolbar');
  const back = button('jems-journey-back', '', 'jemsJourneyBack');
  setIconLabel(back, 'arrow', 'My jems', 'jems-icon--back');
  back.addEventListener('click', () => options.onBack());
  const heading = node('h1', '', 'My Journey');
  heading.id = 'jemsJourneyTitle';
  heading.tabIndex = -1;
  const headingWrap = node('div', 'jems-journey-heading');
  const actualLevelLabel = node('span', 'jems-journey-actual-level');
  actualLevelLabel.id = 'jemsJourneyLevel';
  headingWrap.append(heading, actualLevelLabel);
  const change = button('jems-journey-change', 'Change character', 'jemsChangeCharacter');
  change.addEventListener('click', () => openCharacterPicker());
  toolbar.append(back, headingWrap, change);

  const hero = node('div', 'jems-journey-hero');
  const heroCopy = node('div', 'jems-journey-copy');
  const levelLabel = node('span', 'jems-journey-level');
  levelLabel.id = 'jemsJourneyPreviewLevel';
  levelLabel.setAttribute('aria-live', 'polite');
  levelLabel.setAttribute('aria-atomic', 'true');
  const title = node('h2', 'jems-journey-name');
  title.id = 'jemsJourneyName';
  const subtitle = node('p', 'jems-journey-message');
  const next = node('div', 'jems-journey-next');
  const nextLabel = node('span', 'jems-journey-next-label', 'Your next step');
  const nextText = node('p');
  nextText.id = 'jemsJourneyNextAction';
  next.append(nextLabel, nextText);
  const create = button('jems-journey-primary', 'Make a jem', 'jemsJourneyCreate');
  const createArrow = createIcon('arrow', 'jems-journey-arrow');
  create.append(createArrow);
  create.addEventListener('click', () => {
    if (disposed || !state.ownerId) return;
    if (options.onPrimaryAction) options.onPrimaryAction(state.ownerId);
    else options.onCreate();
  });
  const returnCurrent = button('jems-journey-current', '', 'jemsJourneyCurrent');
  setIconLabel(returnCurrent, 'arrow', 'Back to my level', 'jems-icon--back');
  returnCurrent.addEventListener('click', () => { previewLevel = Math.max(1, state.level) as 1 | 2 | 3 | 4; renderView(); });
  heroCopy.append(levelLabel, title, subtitle, next, create, returnCurrent);

  const stage = node('div', 'jems-journey-scene');
  stage.setAttribute('aria-hidden', 'true');
  const aura = node('div', 'jems-journey-aura');
  const characters = node('div', 'jems-journey-characters');
  characters.id = 'jemsJourneyCharacters';
  stage.append(aura, characters);
  hero.append(heroCopy, stage);

  const trailHeader = node('div', 'jems-journey-trail-heading');
  const trailTitle = node('h2', '', 'Made by you');
  trailTitle.id = 'jemsJourneyTrailTitle';
  const trailHint = node('p', '', 'Tap a level to explore');
  trailHeader.append(trailTitle, trailHint);
  const trail = node('ol', 'jems-journey-trail');
  trail.setAttribute('aria-labelledby', trailTitle.id);
  const cards = LEVELS.map(level => {
    const item = node('li');
    const card = button('jems-journey-card', '');
    card.dataset.journeyLevel = String(level.level);
    const top = node('div', 'jems-journey-card-top');
    const number = node('span', 'jems-journey-card-number', String(level.level));
    number.setAttribute('aria-hidden', 'true');
    const status = node('span', 'jems-journey-card-status');
    top.append(number, status);
    const illustration = node('div', 'jems-journey-card-art');
    illustration.setAttribute('aria-hidden', 'true');
    const name = node('strong', 'jems-journey-card-name', level.name);
    card.append(top, illustration, name);
    card.addEventListener('click', () => { previewLevel = level.level; renderView(); });
    item.append(card);
    trail.append(item);
    return { ...level, card, status, illustration };
  });
  const masterProgress = node('div', 'jems-journey-master-progress');
  masterProgress.id = 'jemsJourneyMasterProgress';
  const masterProgressText = node('p');
  const masterPips = node('span', 'jems-journey-master-pips');
  masterPips.setAttribute('aria-hidden', 'true');
  masterProgress.append(masterPips, masterProgressText);
  element.append(toolbar, hero, trailHeader, trail, masterProgress);

  const dialog = node('dialog', 'jems-character-dialog');
  dialog.id = 'jemsCharacterDialog';
  dialog.setAttribute('aria-labelledby', 'jemsCharacterTitle');
  dialog.setAttribute('aria-describedby', 'jemsCharacterHint');
  const dialogTop = node('div', 'jems-character-top');
  const dialogHeading = node('h2', '', 'Choose your character');
  dialogHeading.id = 'jemsCharacterTitle';
  const cancel = button('jems-character-close', '', 'jemsCharacterCancel');
  cancel.append(createIcon('close'));
  cancel.setAttribute('aria-label', 'Close character choices');
  cancel.addEventListener('click', () => closeCharacterPicker());
  dialogTop.append(dialogHeading, cancel);
  const hint = node('p', 'jems-character-hint', 'Your style. Same adventure.');
  hint.id = 'jemsCharacterHint';
  const choices = node('div', 'jems-character-choices');
  const choiceButtons = (['spark', 'nova'] as const).map(character => {
    const name = character === 'spark' ? 'Spark' : 'Nova';
    const choice = button('jems-character-choice', '');
    choice.dataset.journeyCharacter = character;
    choice.setAttribute('aria-label', 'Choose ' + name);
    const art = node('span', 'jems-character-choice-art');
    art.setAttribute('aria-hidden', 'true');
    const label = node('strong', '', name);
    const selected = node('span', 'jems-character-selected', 'Selected');
    selected.hidden = true;
    choice.append(art, label, selected);
    choice.addEventListener('click', () => { void chooseCharacter(character); });
    choices.append(choice);
    return { character, choice, art, selected };
  });
  const dialogStatus = node('p', 'jems-character-status');
  dialogStatus.id = 'jemsCharacterStatus';
  dialogStatus.setAttribute('role', 'status');
  dialogStatus.setAttribute('aria-live', 'polite');
  dialogStatus.setAttribute('aria-atomic', 'true');
  dialog.append(dialogTop, hint, choices, dialogStatus);
  element.append(dialog);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeCharacterPicker();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const available = [cancel, ...choiceButtons.map(item => item.choice)].filter(item => !item.disabled);
    const first = available[0], last = available[available.length - 1];
    const focused = document.activeElement;
    if (event.shiftKey && (focused === first || !available.includes(focused as HTMLButtonElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (focused === last || !available.includes(focused as HTMLButtonElement))) {
      event.preventDefault();
      first.focus();
    }
  });
  dialog.addEventListener('close', () => {
    const target = returnFocus;
    returnFocus = null;
    if (target?.isConnected && !target.closest('[hidden],.hidden,[inert]')) target.focus({ preventScroll: true });
  });

  function renderChoices() {
    hint.textContent = previewLevel !== Math.max(1, state.level)
      ? `Your style. Same adventure. Previewing the Level ${previewLevel} outfit.`
      : 'Your style. Same adventure.';
    for (const item of choiceButtons) {
      item.art.replaceChildren(createJourneyRankThumbnail(item.character, previewLevel, artwork, state.ownerId));
      item.choice.setAttribute('aria-pressed', String(state.character === item.character));
      item.choice.disabled = saving;
      item.selected.hidden = state.character !== item.character;
    }
  }

  function renderView() {
    if (disposed) return;
    element.dataset.level = String(state.level);
    element.dataset.previewLevel = String(previewLevel);
    actualLevelLabel.textContent = state.level === 0 ? 'New maker' : `Level ${state.level}`;
    actualLevelLabel.setAttribute('aria-label', state.level === 0 ? 'No builder level earned yet' : `Your earned level: ${state.level}, ${LEVELS[state.level - 1].name}`);
    const actualLevel = Math.max(1, state.level);
    const previewing = previewLevel !== actualLevel;
    const entry = LEVELS[previewLevel - 1];
    hero.dataset.level = String(previewLevel);
    hero.classList.toggle('is-preview', previewing);
    levelLabel.textContent = state.level === 0 && !previewing ? 'Your adventure starts here' : `Level ${previewLevel}${previewing ? ' · Preview' : ''}`;
    title.textContent = state.level === 0 && !previewing ? 'Ready to create?' : entry.name;
    subtitle.textContent = previewing ? entry.action : state.level === 0 ? 'Every great jem starts with you.' : entry.reward;
    next.hidden = previewing || state.level === 4;
    nextText.textContent = state.nextAction || (state.level === 3 ? `${Math.min(3, state.polishedCount)} of 3 projects polished.` : LEVELS[Math.min(3, state.level)].action);
    create.firstChild!.textContent = (options.onPrimaryAction && state.primaryActionLabel?.trim()) || (state.level === 4 ? 'Make something new' : 'Make a jem');
    returnCurrent.hidden = !previewing;
    setIconLabel(change, 'edit', state.character ? 'Change character' : 'Choose character');

    characters.replaceChildren();
    characters.dataset.character = state.character ?? 'none';
    characters.dataset.level = String(previewLevel);
    characters.classList.toggle('is-unselected', !state.character);
    const portrait = createMakerIdentity({ ownerId: state.ownerId, character: state.character, level: previewLevel }, artwork);
    portrait.classList.add('jems-journey-character');
    characters.append(portrait);
    for (const card of cards) {
      const earned = state.level >= card.level;
      card.card.classList.toggle('is-earned', earned);
      card.card.classList.toggle('is-current', state.level === card.level);
      card.card.classList.toggle('is-next', state.level + 1 === card.level);
      card.card.setAttribute('aria-pressed', String(previewLevel === card.level));
      if (state.level === card.level) card.card.setAttribute('aria-current', 'step');
      else card.card.removeAttribute('aria-current');
      const status = earned ? (state.level === card.level ? 'Your level' : 'Reached') : state.level + 1 === card.level ? 'Next' : 'To come';
      if (earned) setIconLabel(card.status, 'check', status);
      else card.status.textContent = status;
      card.card.setAttribute('aria-label', `Level ${card.level}, ${card.name}, ${status}. Preview this level.`);
      card.illustration.replaceChildren(createJourneyRankThumbnail(state.character, card.level, artwork, state.ownerId));
    }
    masterProgress.hidden = state.level < 3;
    masterProgressText.textContent = state.level === 4 ? 'Three projects. So many possibilities.' : `${Math.min(3, state.polishedCount)} of 3 polished projects toward Gem Master`;
    masterPips.replaceChildren();
    for (let i = 0; i < 3; i++) {
      const pip = node('span', 'jems-journey-master-pip' + (i < state.polishedCount ? ' is-earned' : ''));
      setJourneySprite(pip, artwork.gems, 3);
      masterPips.append(pip);
    }
    renderChoices();
  }

  function openCharacterPicker() {
    if (disposed || dialog.open || !element.isConnected || element.hidden || element.classList.contains('hidden')) return;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : change;
    dialogStatus.textContent = '';
    dialogStatus.classList.remove('is-error');
    renderChoices();
    dialog.showModal();
    (choiceButtons.find(item => item.character === state.character)?.choice ?? choiceButtons[0].choice).focus();
  }

  function closeCharacterPicker(restoreFocus = true) {
    ++saveEpoch;
    saving = false;
    if (!restoreFocus) returnFocus = null;
    if (dialog.open) dialog.close();
    renderChoices();
  }

  async function chooseCharacter(character: JourneyCharacter) {
    if (saving || disposed || !dialog.open) return;
    const owner = state.ownerId, at = ++saveEpoch;
    saving = true;
    dialogStatus.textContent = 'Saving…';
    dialogStatus.classList.remove('is-error');
    renderChoices();
    try {
      await options.onChooseCharacter(character, owner);
      if (disposed || at !== saveEpoch || state.ownerId !== owner || !dialog.open) return;
      state = { ...state, character };
      saving = false;
      renderView();
      dialog.close();
    } catch {
      if (disposed || at !== saveEpoch || state.ownerId !== owner || !dialog.open) return;
      saving = false;
      dialogStatus.textContent = 'Could not save. Try again.';
      dialogStatus.classList.add('is-error');
      renderChoices();
      choiceButtons.find(item => item.character === character)?.choice.focus();
    }
  }

  renderView();
  return {
    element,
    render(nextState: JourneyState) {
      if (disposed) return;
      if (state.ownerId !== nextState.ownerId) closeCharacterPicker(false);
      if (state.ownerId !== nextState.ownerId || state.level !== nextState.level) previewLevel = Math.max(1, nextState.level) as 1 | 2 | 3 | 4;
      state = { ...nextState, polishedCount: Math.max(0, Math.floor(nextState.polishedCount)) };
      renderView();
    },
    openCharacterPicker,
    closeCharacterPicker,
    destroy() {
      if (disposed) return;
      closeCharacterPicker(false);
      disposed = true;
      element.remove();
    }
  };
}

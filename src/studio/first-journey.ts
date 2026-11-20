import { createJourneyRankThumbnail, type JourneyCharacter } from '../brand/journey';
import './first-journey.css';

/** The player's first choice is cosmetic. Only the later Build action starts work. */
export function createFirstWelcome(actions: {
  choose(character: JourneyCharacter, ownerId: string): void | Promise<void>;
  make(ownerId: string): void | Promise<void>;
  help(): void;
}) {
  let ownerId = '', selected: JourneyCharacter | null = null, busy = false, version = 0;
  const element = document.createElement('section');
  element.id = 'studioWelcome';
  element.className = 'studio-first-welcome';
  element.hidden = true;
  element.setAttribute('aria-labelledby', 'studioWelcomeTitle');
  element.innerHTML = '<h1 id="studioWelcomeTitle" tabindex="-1">Choose your character</h1>' +
    '<div class="studio-welcome-characters" role="group" aria-label="Choose your character"></div>' +
    '<p id="studioWelcomeStatus" class="studio-welcome-status" role="status" aria-live="polite"></p>' +
    '<button type="button" class="studio-button studio-primary studio-welcome-make" id="studioWelcomeMake" disabled>Let’s create</button>' +
    '<p id="studioWelcomeAvailability" class="studio-welcome-availability" role="status" aria-live="polite"></p>' +
    '<div class="studio-welcome-footer"><button type="button" id="studioWelcomeHelp">How does it work?</button></div>';
  const status = element.querySelector<HTMLElement>('#studioWelcomeStatus')!;
  const make = element.querySelector<HTMLButtonElement>('#studioWelcomeMake')!;
  const choices = (['spark', 'nova'] as const).map(character => {
    const button = document.createElement('button');
    button.type = 'button';button.className = 'studio-welcome-character';
    button.dataset.welcomeCharacter = character;
    const name = character === 'spark' ? 'Spark' : 'Nova';
    button.setAttribute('aria-label', `Choose ${name}`);
    button.setAttribute('aria-pressed', 'false');
    const label = document.createElement('strong');label.textContent = name;
    const check = document.createElement('span');check.className = 'studio-welcome-selected';check.textContent = 'Selected';check.hidden = true;
    button.append(createJourneyRankThumbnail(character, 1), label, check);
    button.onclick = () => void saveChoice(character);
    element.querySelector('.studio-welcome-characters')!.append(button);
    return { character, button, check };
  });
  function render() {
    for (const choice of choices) {
      choice.button.disabled = busy;
      choice.button.setAttribute('aria-pressed', String(selected === choice.character));
      choice.check.hidden = selected !== choice.character;
    }
    make.disabled = busy || !selected;
    element.setAttribute('aria-busy', String(busy));
  }
  async function saveChoice(character: JourneyCharacter) {
    if (busy || !ownerId || element.hidden) return;
    const at = ++version, capturedOwner = ownerId;
    busy = true;status.textContent = '';render();
    try {
      await actions.choose(character, capturedOwner);
      if (version !== at || ownerId !== capturedOwner) return;
      selected = character;
    } catch {
      if (version === at && ownerId === capturedOwner) status.textContent = 'Your choice could not be saved. Please try again.';
    } finally {
      if (version === at && ownerId === capturedOwner) { busy = false;render(); }
    }
  }
  make.onclick = () => {
    if (busy || !selected || !ownerId || element.hidden) return;
    const at = ++version, capturedOwner = ownerId;
    busy = true;status.textContent = '';render();
    void Promise.resolve().then(() => {
      if (at !== version || ownerId !== capturedOwner || element.hidden) return;
      return actions.make(capturedOwner);
    }).catch(() => {
      if (at === version && ownerId === capturedOwner) status.textContent = 'Your idea could not open. Your character is saved. Please try again.';
    }).finally(() => {
      if (at === version && ownerId === capturedOwner) { busy = false;render(); }
    });
  };
  element.querySelector<HTMLButtonElement>('#studioWelcomeHelp')!.onclick = actions.help;
  return {
    element,
    update(visible: boolean, availability: string, player: { ownerId: string; character: JourneyCharacter | null }) {
      if (player.ownerId !== ownerId) {
        ++version;busy = false;status.textContent = '';ownerId = player.ownerId;
      }
      selected = player.character;
      element.hidden = !visible;
      element.querySelector('#studioWelcomeAvailability')!.textContent = availability;
      render();
    },
  };
}

/** This overview can be opened at any point; it never blocks or advances work. */
export function createJourneyOverview(actions: { reset(): void; close(): void }) {
  const element = document.createElement('section');
  element.id = 'studioJourneyMap';
  element.className = 'studio-journey-overview';
  element.hidden = true;
  element.setAttribute('aria-labelledby', 'studioJourneyMapTitle');
  element.innerHTML = '<div class="studio-overview-heading"><div><p class="studio-welcome-kicker">YOUR WAY THROUGH JEMS</p><h2 id="studioJourneyMapTitle" tabindex="-1">One idea can go a long way.</h2></div><button type="button" class="studio-button" id="studioJourneyMapClose">Close</button></div>' +
    '<ol class="studio-overview-steps"><li><strong>Make it yours</strong><span>Choose your character. Tell jems your game idea.</span></li><li><strong>Build &amp; play</strong><span>Choose Build when you are ready. Play another game while it is made.</span></li><li><strong>Try a change</strong><span>Play your game. What would make it more fun?</span></li><li><strong>Keep your favorite</strong><span>You choose. Find your saved work in My Games.</span></li></ol>' +
    '<p class="studio-overview-paths">Open <strong>Menu</strong> for Art Studio, Create &amp; code, your Pals and learning. To record a scene, choose <strong>Create &amp; code → More scene tools → Save a video</strong>.</p>' +
    '<div class="studio-overview-footer"><p>Hints are optional. Dismissing a hint never changes your progress.</p><button type="button" class="studio-button" id="studioGuideReset">Show tips again</button></div>';
  element.querySelector<HTMLButtonElement>('#studioGuideReset')!.onclick = actions.reset;
  element.querySelector<HTMLButtonElement>('#studioJourneyMapClose')!.onclick = actions.close;
  return element;
}

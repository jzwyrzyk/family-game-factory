import { createIcon } from '../brand/icons';
import './first-journey.css';

/** A first invitation, not an account wizard or an achievement checklist. */
export function createFirstWelcome(actions: { make(): void; explore(): void; help(): void }) {
  const element = document.createElement('section');
  element.id = 'studioWelcome';
  element.className = 'studio-first-welcome';
  element.hidden = true;
  element.setAttribute('aria-labelledby', 'studioWelcomeTitle');
  element.innerHTML = '<div class="studio-welcome-art"><img src="./jems-art/spot_first_idea.webp" width="1536" height="1024" alt="" decoding="sync"></div>' +
    '<div class="studio-welcome-copy"><p class="studio-welcome-kicker">YOUR FIRST JEM</p>' +
    '<h1 id="studioWelcomeTitle" tabindex="-1">Let’s make your<br>first game.</h1>' +
    '<p class="studio-welcome-description">Start with a little idea.<br>See what you can make it become.</p>' +
    '<button type="button" class="studio-button studio-primary studio-welcome-make" id="studioWelcomeMake">Make my first game</button>' +
    '<button type="button" class="studio-welcome-explore" id="studioWelcomeExplore">Explore games first</button>' +
    '<p id="studioWelcomeAvailability" class="studio-welcome-availability" role="status" aria-live="polite"></p></div>' +
    '<div class="studio-welcome-footer"><span>Imagine it. Play it. Make it yours.</span><button type="button" id="studioWelcomeHelp">How does it work?</button></div>';
  element.querySelector('#studioWelcomeMake')!.append(createIcon('arrow'));
  element.querySelector<HTMLButtonElement>('#studioWelcomeMake')!.onclick = actions.make;
  element.querySelector<HTMLButtonElement>('#studioWelcomeExplore')!.onclick = actions.explore;
  element.querySelector<HTMLButtonElement>('#studioWelcomeHelp')!.onclick = actions.help;
  return {
    element,
    update(visible: boolean, availability: string) {
      element.hidden = !visible;
      element.querySelector('#studioWelcomeAvailability')!.textContent = availability;
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
    '<ol class="studio-overview-steps"><li><strong>Imagine</strong><span>Tell jems an idea, or make a ready-made game yours.</span></li><li><strong>Play</strong><span>Try your game. While a build runs, play something else.</span></li><li><strong>Try a change</strong><span>What would make it more fun? Try your idea and see.</span></li><li><strong>Keep your favorite</strong><span>You choose your main version. Find your work in My Games.</span></li></ol>' +
    '<p class="studio-overview-paths">You can also make a story in <strong>Create &amp; code</strong>. To make a video of your scene, open <strong>More scene tools</strong> and choose <strong>Save a video</strong>. Practice in <strong>My Powers</strong> or <strong>Try an idea</strong> whenever you like.</p>' +
    '<div class="studio-overview-footer"><p>Hints are optional. Dismissing a hint never changes your progress.</p><button type="button" class="studio-button" id="studioGuideReset">Show tips again</button></div>';
  element.querySelector<HTMLButtonElement>('#studioGuideReset')!.onclick = actions.reset;
  element.querySelector<HTMLButtonElement>('#studioJourneyMapClose')!.onclick = actions.close;
  return element;
}

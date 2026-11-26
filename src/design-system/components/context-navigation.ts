import {createAction} from './action';
import './context-navigation.css';
export interface ContextDestination { key: string; label: string; onOpen: () => void; }
/** Ordinary navigation buttons, not ARIA tabs: each invokes an existing host route. */
export function createContextNavigation(label: string, destinations: readonly ContextDestination[], current: string) {
  const nav = document.createElement('nav');
  nav.className = 'jems-world-nav';
  nav.setAttribute('aria-label', label);
  for (const destination of destinations) {
    const button = createAction({label: destination.label, className: '', onPress: destination.onOpen});
    button.dataset.journeySection = destination.key;
    if (destination.key === current) button.setAttribute('aria-current', 'page');
    nav.append(button);
  }
  return nav;
}

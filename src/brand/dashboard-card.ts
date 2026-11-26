import { createIcon } from './icons';
import './dashboard-card.css';

/** A single keyboard/touch target for a section of My Journey. The host owns
 * navigation and can update the artwork and supporting line independently. */
export function createDashboardCard(title: string, description: string, onOpen: () => void) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'jems-dashboard-card';
  element.onclick = onOpen;
  const artwork = document.createElement('span');
  artwork.className = 'jems-dashboard-art';
  artwork.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('span');
  copy.className = 'jems-dashboard-copy';
  const name = document.createElement('strong');
  name.textContent = title;
  const detail = document.createElement('span');
  detail.textContent = description;
  copy.append(name, detail);
  element.append(artwork, copy, createIcon('arrow', 'jems-dashboard-arrow'));
  return { element, artwork, detail };
}

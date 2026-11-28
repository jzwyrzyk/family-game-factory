import {setIconLabel, type IconName} from '../../brand/icons';
import './action.css';

export type ActionVariant = 'primary' | 'secondary' | 'quiet';
export interface ActionOptions {
  label: string;
  variant?: ActionVariant;
  icon?: IconName;
  onPress?: () => void;
  disabled?: boolean;
  /** Compatibility adapter: existing feature styles retain their exact treatment. */
  className?: string;
}
/** Native keyboard/touch behavior. No automatic retries, saves, or async authority. */
export function createAction(options: ActionOptions): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = options.className ?? 'jems-action';
  button.dataset.variant = options.variant ?? 'secondary';
  button.disabled = options.disabled ?? false;
  if (options.icon) setIconLabel(button, options.icon, options.label);
  else button.textContent = options.label;
  if (options.onPress) button.addEventListener('click', options.onPress);
  return button;
}

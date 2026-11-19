/** Approved Jems functional icons. Their visible labels belong to the controls. */
export const ICON_NAMES = [
  'home', 'play', 'add', 'send', 'mic', 'stop', 'retry', 'close',
  'menu', 'settings', 'parent', 'shield', 'trash', 'undo', 'check', 'arrow',
  'star', 'search', 'volume', 'music', 'help', 'download', 'save', 'edit',
  'pause', 'clock', 'book', 'chart', 'lock', 'chevron', 'grid', 'alert',
] as const;

export type IconName = typeof ICON_NAMES[number];

const iconNames = new Set<string>(ICON_NAMES);
const svgNamespace = 'http://www.w3.org/2000/svg';

function iconHref(name: IconName): string {
  if (!iconNames.has(name)) throw new Error(`Unknown Jems icon: ${name}`);
  // Resolve at use time so imports stay safe outside the DOM, and hosted base
  // paths such as /arcade/ keep the supplied sprite on the same origin.
  const url = new URL('jems-art/icons/jems-icons.svg', document.baseURI);
  url.hash = `jems-${name}`;
  return url.href;
}

function escapeAttribute(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

/** For trusted static templates. Text and accessible names stay outside the SVG. */
export function iconMarkup(name: IconName, className = ''): string {
  const classes = ['jems-icon', className].filter(Boolean).join(' ');
  return `<svg xmlns="${svgNamespace}" class="${escapeAttribute(classes)}" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" data-jems-icon="${name}"><use href="${escapeAttribute(iconHref(name))}"></use></svg>`;
}

export function createIcon(name: IconName, className = ''): SVGSVGElement {
  const href = iconHref(name);
  const icon = document.createElementNS(svgNamespace, 'svg');
  icon.setAttribute('class', ['jems-icon', className].filter(Boolean).join(' '));
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('width', '24');
  icon.setAttribute('height', '24');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  icon.dataset.jemsIcon = name;
  const use = document.createElementNS(svgNamespace, 'use');
  use.setAttribute('href', href);
  icon.append(use);
  return icon;
}

type IconLabel = {
  name: IconName;
  label: string;
  className: string;
  icon: SVGSVGElement;
  text: HTMLSpanElement;
};
const iconLabels = new WeakMap<HTMLElement, IconLabel>();

/** Update a control's content without replacing its focus, listeners or ARIA. */
export function setIconLabel(target: HTMLElement, name: IconName, label: string, className = ''): void {
  const previous = iconLabels.get(target);
  if (previous?.name === name && previous.label === label && previous.className === className
    && target.firstChild === previous.icon && target.lastChild === previous.text
    && target.childNodes.length === 3 && previous.text.textContent === label) return;

  const icon = createIcon(name, className);
  const text = document.createElement('span');
  text.className = 'jems-icon-label';
  text.textContent = label;
  // A text space keeps inline controls readable; flex controls use their own gap.
  target.replaceChildren(icon, document.createTextNode(' '), text);
  iconLabels.set(target, { name, label, className, icon, text });
}

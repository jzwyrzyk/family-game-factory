import { setIconLabel } from './icons';
import './page-header.css';

interface PageHeaderOptions {
  title: HTMLHeadingElement;
  description: HTMLParagraphElement;
  back: HTMLButtonElement;
  backLabel: string;
  progress?: HTMLElement;
}

/** Keep the route's live title, progress and back action when its data refreshes. */
export function createPageHeader(page: HTMLElement, options: PageHeaderOptions) {
  const { title, description, back, backLabel, progress } = options;
  page.classList.add('jems-secondary-page');
  const header = document.createElement('header');
  header.className = 'jems-page-header';
  title.tabIndex = -1;
  title.classList.add('jems-page-title');
  description.classList.add('jems-page-description');
  back.classList.add('jems-page-back');
  setIconLabel(back, 'arrow', backLabel, 'jems-icon--back');
  header.append(back, title, description);
  if (progress) {
    progress.classList.add('jems-page-progress');
    header.append(progress);
  }
  return header;
}

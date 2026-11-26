import {createPageHeader, type PageHeaderOptions} from '../components/page-header';
import './collection.css';

/** Collection/progress template, compatible with already-mounted live page bodies.
 * Keeps title, progress, IDs and guarded back callbacks intact during refresh. */
export function createCollectionHeader(page: HTMLElement, options: PageHeaderOptions) {
  page.dataset.jemsTemplate = 'collection';
  page.classList.add('jems-secondary-page');
  return createPageHeader(page, options);
}
/** A new collection needs only its live content and the standard header slots. */
export function createCollectionPage(options: PageHeaderOptions, content: HTMLElement) {
  const page = document.createElement('section');
  page.className = 'page';
  page.append(createCollectionHeader(page, options), content);
  return page;
}

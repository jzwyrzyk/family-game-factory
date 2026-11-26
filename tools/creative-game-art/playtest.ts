import {revisionSource} from './revision';
import {resolvePrivateArt} from '../../src/creation/private-art';
import type {ReviewCapsule} from './capsule';

/** Held by the trusted local review host, never serialized to the game. */
export interface PlaytestBinding {
  revision: string;
  assetPin: string;
  slotId: string;
}

export async function openDrawingPlaytest(
  container: HTMLElement,
  capsule: ReviewCapsule,
  binding: PlaytestBinding,
  activeOwner: () => string,
  view: AbortSignal
): Promise<HTMLIFrameElement> {
  const owner = activeOwner();
  const {html, revision: qualifiedRevision} = capsule;
  const slot = {...capsule.slot};
  const {assetPin, revision: selectedRevision, slotId} = binding;
  const current = () => !view.aborted && !!owner && activeOwner() === owner;
  const check = () => {
    if (!current()) throw Error('Reopen this playtest in your own profile.');
  };
  check();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(revisionSource(html, slot)));
  const revision = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (revision !== selectedRevision || revision !== qualifiedRevision || slot.assetId !== slotId ||
      ![slot.width, slot.height].every(size => Number.isInteger(size) && size >= 1 && size <= 512)) {
    throw Error('Choose the reviewed game version and actor slot again.');
  }

  const art = await resolvePrivateArt(owner, assetPin, current);
  check();
  const canvas = document.createElement('canvas');
  canvas.width = slot.width;
  canvas.height = slot.height;
  const scale = Math.min(canvas.width / art.image.width, canvas.height / art.image.height);
  const width = art.image.width * scale, height = art.image.height * scale;
  // Leave transparent margins around the authentic silhouette. Raster export
  // discards PNG metadata, names, editable strokes, masks and original bytes.
  canvas.getContext('2d')!.drawImage(art.image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  const png = canvas.toDataURL('image/png');
  if (!png.startsWith('data:image/png;base64,') || png.length > 1500000) throw Error('Choose a smaller sprite.');
  const documentCopy = new DOMParser().parseFromString(html, 'text/html');
  const template = documentCopy.createElement('template');
  template.id = 'local-sprite-pixels';
  template.content.append(png.slice('data:image/png;base64,'.length));
  documentCopy.body.prepend(template);

  check();
  const frame = document.createElement('iframe');
  frame.title = 'Drawing game playtest';
  frame.sandbox.add('allow-scripts');
  frame.referrerPolicy = 'no-referrer';
  frame.srcdoc = '<!doctype html>' + documentCopy.documentElement.outerHTML;
  // The owning view aborts on exit, revision or profile change. Detaching the
  // opaque frame destroys the in-memory client/worker and its selected pixels.
  view.addEventListener('abort', () => {
    frame.remove();
    frame.removeAttribute('srcdoc');
  }, {once: true});
  container.replaceChildren(frame);
  return frame;
}

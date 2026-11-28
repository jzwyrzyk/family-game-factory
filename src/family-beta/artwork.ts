import { drawingHash, saveDrawing } from '../assets/private-drawings';
import { checkReviewedPng, SuggestedPaletteError } from './reviewed-png';
import { ART_LIMITS } from '../drawing/library';

function installReviewedArtwork(file: HTMLInputElement) {
  const status = document.getElementById('familyExitStatus')!;
  const pass = document.querySelector<HTMLInputElement>('#reviewedArtPassphrase')!;
  const prepare = document.querySelector<HTMLInputElement>('#prepareReviewedArt');
  const currentOwner = () => (window as any).FG?.store?.current()?.id;
  let selection = 0;
  let copyUrl: string | undefined;
  let copyLink: HTMLAnchorElement | undefined;

  function clearSelection() {
    selection++;
    pass.value = '';
    file.value = '';
    file.disabled = false;
    if (copyUrl) URL.revokeObjectURL(copyUrl);
    copyUrl = undefined;
    copyLink?.remove();
    copyLink = undefined;
    status.textContent = '';
  }
  function resetProfile() {
    if (prepare) prepare.checked = false;
    clearSelection();
  }
  function offerCopy(blob:Blob, label:string) {
    copyUrl = URL.createObjectURL(blob);
    copyLink = document.createElement('a');
    copyLink.href = copyUrl;
    copyLink.download = 'workshop-picture.png';
    copyLink.textContent = label;
    status.after(copyLink);
  }
  window.addEventListener('factory-profile-changing', resetProfile);
  window.addEventListener('factory-profile', resetProfile);
  window.addEventListener('pagehide', resetProfile);

  file.onchange = async () => {
    const owner = currentOwner(), image = file.files?.[0], passphrase = pass.value;
    const prepareCopy = prepare?.checked;
    clearSelection();
    const attempt = selection;
    const current = () => attempt === selection && owner === currentOwner();
    file.disabled = true;
    try {
      if (!owner || !image || image.type !== 'image/png' || image.size > ART_LIMITS.imageBytes)
        throw Error('Choose a reviewed PNG up to 5 MB.');
      const bytes = await image.arrayBuffer();
      const reviewed = await checkReviewedPng(bytes);
      const digest = await drawingHash(bytes);
      if (!current()) return;
      const headers = { 'Content-Type': 'application/json', 'X-Factory-Request': '1' };
      const unlocked = await fetch('/v1/devices/unlock', {
        method: 'POST', headers, body: JSON.stringify({ parentPassphrase: passphrase }),
      });
      if (!current()) return;
      if (!unlocked.ok) throw Error('A grown-up must authorize this upload.');
      const approval = await fetch('/entry/review-art', {
        method: 'POST', headers, body: JSON.stringify({ digest }),
      });
      if (!current()) return;
      if (!approval.ok) throw Error('Ask the operator to review and approve this exact PNG for your family.');

      if (prepareCopy) {
        const copy = await reviewed.prepareImageOnlyCopy();
        if (!current()) return;
        if (copy.size > ART_LIMITS.imageBytes) throw Error('The prepared picture is over the file size limit.');
        status.textContent = 'Download your image-only copy. Have its exact file approved, then choose it here.';
        offerCopy(copy, 'Download prepared PNG');
        if (prepare) prepare.checked = false;
        return;
      }
      await saveDrawing(owner, 'Reviewed workshop artwork', new Blob([bytes], { type: 'image/png' }), undefined, current);
      if (current()) status.textContent = 'Your reviewed drawing is ready.';
    } catch (error) {
      if (!current()) return;
      status.textContent = (error as Error).message;
      if (error instanceof SuggestedPaletteError) {
        offerCopy(error.imageOnlyCopy, 'Download image-only PNG for separate review');
        if (prepare) prepare.checked = false;
      }
    } finally {
      if (current()) file.disabled = false;
    }
  };
}

const input = document.querySelector<HTMLInputElement>('#betaReviewedArt');
if (input) installReviewedArtwork(input);

import {drawingHash, saveDrawing} from '../assets/private-drawings';
import {checkReviewedPng} from './reviewed-png';

const file = document.querySelector<HTMLInputElement>('#betaReviewedArt');
if (file) {
  const out = document.getElementById('familyExitStatus')!;
  const pass = document.querySelector<HTMLInputElement>('#reviewedArtPassphrase')!;
  const currentOwner = () => (window as any).FG?.store?.current()?.id;
  let attempt = 0;
  const invalidate = () => { attempt++; file.value = ''; pass.value = ''; };
  window.addEventListener('factory-profile', invalidate);
  window.addEventListener('pagehide', invalidate);

  file.onchange = async () => {
    const token = ++attempt, owner = currentOwner();
    const current = () => token === attempt && file.isConnected && currentOwner() === owner;
    const image = file.files?.[0], parentPassphrase = pass.value;
    file.value = ''; pass.value = '';
    try {
      if (typeof owner !== 'string' || !owner) throw Error('Choose an explorer before opening artwork.');
      if (!image || image.type !== 'image/png' || image.size > 5 * 1024 * 1024) throw Error('Choose a reviewed PNG up to 5 MB.');
      const bytes = await image.arrayBuffer();
      await checkReviewedPng(bytes);
      const digest = await drawingHash(bytes);
      if (!current()) return;
      const headers = {'Content-Type': 'application/json', 'X-Factory-Request': '1'};
      const unlocked = await fetch('/v1/devices/unlock', {method: 'POST', headers, body: JSON.stringify({parentPassphrase})});
      if (!current()) return;
      if (!unlocked.ok) throw Error('A grown-up must authorize this upload.');
      const review = await fetch('/entry/review-art', {method: 'POST', headers, body: JSON.stringify({digest})});
      if (!current()) return;
      if (!review.ok) throw Error('Unlock Grown-ups and confirm the operator has reviewed this exact image.');
      // Use the same bytes the operator approved. Never import the filename.
      await saveDrawing(owner, 'Reviewed workshop artwork', new Blob([bytes], {type: 'image/png'}), undefined, current);
      if (current()) out.textContent = 'Your reviewed drawing is ready.';
    } catch (error) {
      if (current()) out.textContent = (error as Error).message;
    }
  };
}

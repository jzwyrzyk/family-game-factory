import {drawingHash, saveDrawing} from '../assets/private-drawings';
import {checkReviewedPng} from './reviewed-png';

const file = document.querySelector<HTMLInputElement>('#betaReviewedArt');
if (file) file.onchange = async () => {
  const out = document.getElementById('familyExitStatus')!;
  const pass = document.querySelector<HTMLInputElement>('#reviewedArtPassphrase')!;
  try {
    const image = file.files?.[0];
    if (!image || image.type !== 'image/png' || image.size > 5 * 1024 * 1024) throw Error('Choose a reviewed PNG up to 5 MB.');
    const owner = (window as any).FG.store.current().id;
    const guard = () => (window as any).FG.store.current().id === owner;
    const bytes = await image.arrayBuffer();
    await checkReviewedPng(bytes);
    const unlocked = await fetch('/v1/devices/unlock', {
      method: 'POST', headers: {'Content-Type': 'application/json', 'X-Factory-Request': '1'},
      body: JSON.stringify({parentPassphrase: pass.value})
    });
    if (!unlocked.ok) throw Error('A grown-up must authorize this upload.');
    const response = await fetch('/entry/review-art', {
      method: 'POST', headers: {'Content-Type': 'application/json', 'X-Factory-Request': '1'},
      body: JSON.stringify({digest: await drawingHash(bytes)})
    });
    if (!response.ok) throw Error('Unlock Grown-ups and confirm the operator has reviewed this exact image.');
    // Use the same bytes the operator approved. Never import the filename.
    await saveDrawing(owner, 'Reviewed workshop artwork', new Blob([bytes], {type: 'image/png'}), undefined, guard);
    out.textContent = 'Your reviewed drawing is ready.';
  } catch (error) {
    out.textContent = (error as Error).message;
  } finally {
    file.value = '';
    pass.value = '';
  }
};

import { drawingHash, inspectDrawingBytes, saveDrawing } from '../assets/private-drawings';
import { checkReviewedPng } from './reviewed-png';
import { ART_LIMITS } from '../drawing/library';

async function rasterize(image: Blob, width: number, height: number): Promise<Blob> {
  const bitmap = await createImageBitmap(image);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('Drawing unavailable.')), 'image/png');
    });
  } finally {
    bitmap.close();
  }
}

function installReviewedArtwork(file: HTMLInputElement) {
  const status = document.getElementById('familyExitStatus')!;
  const pass = document.querySelector<HTMLInputElement>('#reviewedArtPassphrase')!;
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
  window.addEventListener('factory-profile-changing', clearSelection);
  window.addEventListener('pagehide', clearSelection);

  file.onchange = async () => {
    const owner = currentOwner(), image = file.files?.[0], passphrase = pass.value;
    clearSelection();
    const attempt = selection;
    const current = () => attempt === selection && owner === currentOwner();
    file.disabled = true;
    try {
      if (!owner || !image || image.type !== 'image/png' || image.size > ART_LIMITS.imageBytes)
        throw Error('Choose a reviewed PNG up to 5 MB.');
      const headers = { 'Content-Type': 'application/json', 'X-Factory-Request': '1' };
      const unlocked = await fetch('/v1/devices/unlock', {
        method: 'POST', headers, body: JSON.stringify({ parentPassphrase: passphrase }),
      });
      if (!current()) return;
      if (!unlocked.ok) throw Error('A grown-up must authorize this upload.');
      const bytes = await image.arrayBuffer();
      checkReviewedPng(bytes);
      const { width, height } = inspectDrawingBytes(bytes, 'image/png');
      const digest = await drawingHash(bytes);
      if (!current()) return;
      const approval = await fetch('/entry/review-art', {
        method: 'POST', headers, body: JSON.stringify({ digest }),
      });
      if (!current()) return;
      if (!approval.ok) throw Error('Ask the operator to review and approve this exact PNG for your family.');

      // Decode reviewed inputs only. Browser PNG encoders differ, so the file selected
      // for admission must match this device's fingerprint of the clean rendered pixels.
      const raster = await rasterize(image, width, height);
      if (!current()) return;
      if (raster.size > ART_LIMITS.imageBytes) throw Error('The prepared PNG is over 5 MB. Choose a smaller reviewed picture.');
      const cleanDigest = await drawingHash(await raster.arrayBuffer());
      if (!current()) return;
      if (digest !== cleanDigest) {
        status.textContent = 'Keep your original file. Download the prepared copy, have the operator approve it, then choose that copy here.';
        copyLink = document.createElement('a');
        copyUrl = URL.createObjectURL(raster);
        copyLink.href = copyUrl;
        copyLink.download = 'workshop-picture.png';
        copyLink.textContent = 'Download prepared PNG';
        status.after(copyLink);
        return;
      }
      await saveDrawing(owner, 'Reviewed workshop artwork', new Blob([bytes], { type: 'image/png' }), undefined, current);
      if (current()) status.textContent = 'Your reviewed drawing is ready.';
    } catch (error) {
      if (current()) status.textContent = (error as Error).message;
    } finally {
      if (current()) file.disabled = false;
    }
  };
}

const input = document.querySelector<HTMLInputElement>('#betaReviewedArt');
if (input) installReviewedArtwork(input);

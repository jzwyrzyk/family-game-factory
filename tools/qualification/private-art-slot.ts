/** Offline qualification only. The trusted compositor retains every private pixel.
 * The generated program sees its existing public image slot. It never receives
 * this adapter, its canvas, the selection, a store handle, or a URL. */
export interface ArtPlaySession {
  family: string;
  owner: string;
  gameRevision: string;
  artifactHash: string;
  artAllowed: boolean;
}
export interface ReviewedImageSlot {
  gameRevision: string;
  artifactHash: string;
  id: string;
}
export interface PinnedGameSprite {
  slotId: string;
  revision: string;
  sha256: string;
}
export interface SelectedPng {
  owner: string;
  family: string;
  revision: string;
  sha256: string;
  bytes: ArrayBuffer;
}
type ImageCommand = {type: 'image'; assetId: string; x: number; y: number; width: number; height: number; angle?: number};

/** The caller supplies the independently reviewed slot for this exact artifact
 * and a fresh host session object for each mount. Revocation is terminal. */
export async function qualifyPrivateSprite(current: () => Readonly<ArtPlaySession> | null, slot: ReviewedImageSlot, pin: PinnedGameSprite, art: SelectedPng) {
  const session = current();
  const hashFormat = /^[a-f0-9]{64}$/;
  if (!session?.artAllowed || art.family !== session.family || art.owner !== session.owner ||
      pin.slotId !== slot.id || !pin.revision || art.revision !== pin.revision ||
      art.sha256 !== pin.sha256 || !hashFormat.test(pin.sha256) || !hashFormat.test(slot.artifactHash) ||
      slot.gameRevision !== session.gameRevision || slot.artifactHash !== session.artifactHash ||
      !/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(slot.id)) throw Error('Sprite selection unavailable.');
  const slotId = slot.id, revision = session.gameRevision, artifact = session.artifactHash, expectedHash = pin.sha256;
  const family = session.family, owner = session.owner;
  const allowed = () => current() === session && session.artAllowed && session.owner === owner &&
    session.family === family && session.gameRevision === revision && session.artifactHash === artifact;
  if (art.bytes.byteLength < 33 || art.bytes.byteLength > 2 * 1024 * 1024) throw Error('Sprite size unavailable.');
  const bytes = art.bytes.slice(0), header = new DataView(bytes);
  if (header.getUint32(0) !== 0x89504e47 || header.getUint32(4) !== 0x0d0a1a0a ||
      header.getUint32(8) !== 13 || header.getUint32(12) !== 0x49484452) throw Error('Choose a PNG sprite.');
  const width = header.getUint32(16), height = header.getUint32(20);
  if (!width || !height || width > 1024 || height > 1024) throw Error('Sprite dimensions unavailable.');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  if (Array.from(digest, b => b.toString(16).padStart(2, '0')).join('') !== expectedHash || !allowed()) throw Error('Sprite version unavailable.');
  const image = await createImageBitmap(new Blob([bytes], {type: 'image/png'}));
  let closed = false;
  const close = () => { if (!closed) { image.close(); closed = true; } };
  if (!allowed() || width !== image.width || height !== image.height) { close(); throw Error('Sprite selection expired.'); }
  return {
    close,
    /** Receives an already validated sandbox display-list command, in scene coordinates. */
    paint(context: CanvasRenderingContext2D, command: ImageCommand) {
      if (closed || !allowed()) { close(); throw Error('Sprite selection expired.'); }
      if (command.type !== 'image' || command.assetId !== slotId) return false;
      const {x,y,width: boxWidth,height: boxHeight,angle = 0} = command;
      if (![x,y,boxWidth,boxHeight,angle].every(Number.isFinite) || Math.abs(x)>10000 || Math.abs(y)>10000 ||
          boxWidth < 0 || boxHeight < 0 || boxWidth > 2000 || boxHeight > 2000 || Math.abs(angle)>100000) throw Error('Invalid sprite placement.');
      const scale = Math.min(boxWidth / width, boxHeight / height);
      context.save();
      try {
        context.translate(x, y); context.rotate(angle);
        context.drawImage(image, -width * scale/2, -height * scale/2, width * scale, height * scale);
      } finally { context.restore(); }
      return true;
    }
  };
}

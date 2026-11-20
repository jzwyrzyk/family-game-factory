/** A maker is a cosmetic, owner-scoped choice. Rendering never selects one. */
export type MakerCharacter = 'spark' | 'nova';
export type MakerAtlas = { src: string; columns?: number; rows?: number; frameAspectRatio?: number };
export type MakerArtwork = Record<MakerCharacter | 'gems', MakerAtlas>;
export type MakerIdentity = {
  ownerId: string;
  character: MakerCharacter | null;
  /** The earned outfit, or an explicitly labelled Journey preview. */
  level: number;
};

export const MAKER_ARTWORK: MakerArtwork = {
  spark: { src: 'jems-journey/characters-spark.webp', columns: 4, rows: 1, frameAspectRatio: .75 },
  nova: { src: 'jems-journey/characters-nova.webp', columns: 4, rows: 1, frameAspectRatio: .75 },
  gems: { src: 'jems-journey/gems.webp', columns: 4, rows: 1, frameAspectRatio: .75 },
};

/** One base-path-safe mapping for portraits, rank cards and earned popups. */
export function setMakerSprite(target: HTMLElement, asset: MakerAtlas, level: number) {
  const columns = Math.max(1, Math.floor(asset.columns ?? 4));
  const rows = Math.max(1, Math.floor(asset.rows ?? 1));
  const frame = Number.isFinite(level) ? Math.floor(level) : 1;
  const index = Math.max(0, Math.min(columns * rows - 1, frame - 1));
  const x = index % columns, y = Math.floor(index / columns);
  target.style.backgroundImage = `url(${JSON.stringify(new URL(asset.src, document.baseURI).href)})`;
  target.style.backgroundSize = `${columns * 100}% ${rows * 100}%`;
  target.style.backgroundPosition = `${columns === 1 ? 0 : 100 * x / (columns - 1)}% ${rows === 1 ? 0 : 100 * y / (rows - 1)}%`;
  target.style.aspectRatio = String(asset.frameAspectRatio ?? 1);
  target.dataset.spriteSrc = asset.src;
  target.dataset.level = String(level);
}

/** Update from the current owner together with their choice. Null is neutral;
 * the pair belongs only in an explicit choice, never in another player's view.
 * This has no storage, subscription or global-player state to become stale. */
export function renderMakerIdentity(target: HTMLElement, identity: MakerIdentity, artwork: MakerArtwork = MAKER_ARTWORK) {
  const { ownerId, character, level } = identity;
  target.classList.add('jems-maker-identity', 'jems-journey-sprite');
  target.classList.toggle('jems-character-art', character !== null);
  target.classList.toggle('jems-gem-art', character === null);
  target.classList.toggle('is-unselected', character === null);
  target.setAttribute('aria-hidden', 'true');
  target.dataset.makerOwner = ownerId;
  target.dataset.character = character ?? 'none';
  setMakerSprite(target, artwork[character ?? 'gems'], level);
}

export function createMakerIdentity(identity: MakerIdentity, artwork: MakerArtwork = MAKER_ARTWORK) {
  const target = document.createElement('span');
  renderMakerIdentity(target, identity, artwork);
  return target;
}

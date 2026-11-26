// Offline qualification only. The normal preview server uses renderGeneratedV2.
import {revisionSource} from './revision';
import {hash, validateCompiled, validateGenerated, type GeneratedGame} from '../../server/agent/generated';
import {prepareGeneratedV2, renderClientDocument} from '../../server/sandbox/preview-v2.cjs';

/** Operator-selected presentation geometry from the reviewed game program.
 * All draws of this slot must use this aspect ratio. Mechanics stay in the game. */
export interface SpriteSlot {
  assetId: string;
  width: number;
  height: number;
}

export interface ReviewCapsule {
  html: string;
  revision: string;
  slot: SpriteSlot;
}

/** Input is a trusted local qualification fixture. Its hashes identify a build,
 * not a signature granting permission to import untrusted code or archives. */
export function prepareReviewCapsule(candidate: GeneratedGame, slot: SpriteSlot): ReviewCapsule {
  const {compiled, ...source} = candidate;
  const game = validateCompiled(validateGenerated(source), candidate);
  if (game.kind !== 'generated-module-v2' || !compiled ||
      !game.assets?.assets.some(asset => asset.id === slot.assetId && asset.role === 'actor') ||
      ![slot.width, slot.height].every(size => Number.isInteger(size) && size >= 1 && size <= 512)) {
    throw Error('A reviewed 2D actor slot is required.');
  }

  const artifactId = hash(JSON.stringify([compiled.sourceHash, compiled.codeHash, compiled.runtimeHash, compiled.assetsHash]));
  const {client, config} = prepareGeneratedV2(game, artifactId, 'local-art-review');
  const slotImage = config.assets.find((asset: {id: string}) => asset.id === slot.assetId);
  Object.assign(slotImage, {width: slot.width, height: slot.height, mime: 'image/png', sampling: 'pixelated', data: ''});
  const serialized = JSON.stringify(config).replace(/</g, '\\u003c');
  // The trusted client decodes one raster. Its already-compiled worker sees
  // only its original public image-slot IDs, input, and simulation ticks.
  const script = client + '\n' + `
    const config = ${serialized};
    const sprite = document.getElementById('local-sprite-pixels');
    const pixels = sprite?.content.textContent;
    sprite?.remove();
    if (typeof pixels !== 'string' || !pixels.length || pixels.length > 1500000) {
      throw Error('Local sprite unavailable');
    }
    config.assets.find(asset => asset.id === ${JSON.stringify(slot.assetId)}).data = pixels;
    FactoryClient.startClient(config);
  `;
  const document = renderClientDocument(game, script, true);
  return {html: document.html, revision: hash(revisionSource(document.html, slot)), slot: {...slot}};
}

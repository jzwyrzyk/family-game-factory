// The dedicated local sample build uses its named Vite mode. The offline
// owner packager substitutes this module only when embedding the same sample.
export const gameArtReview = import.meta.env?.MODE === 'game-art-review';

import type {GameId} from '../runtime/types';

/** Shelf curation never removes IDs needed by saved games or backups. */
export const PREMADE_GAMES:readonly GameId[]=['factory','mining','gum','hill'];
/** Retained native games open from My Creations, with their saved versions intact. */
export const ORIGINAL_GAMES:readonly GameId[]=['dragon','buckets'];
export const RETIRED_STARTERS:readonly GameId[]=['moon','robot'];
export const isRetiredStarter=(game:GameId|'new')=>game!=='new'&&RETIRED_STARTERS.includes(game);

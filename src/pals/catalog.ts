/**
 * Launch companion identities. These approved gem tokens are temporary system
 * artwork; the separate character-art pass will supply species and growth art.
 * Stable IDs and behavior do not depend on that artwork delivery.
 */
export type PalId = 'glim' | 'kip' | 'riff';
export type PalLineKind = 'welcome' | 'practice' | 'making' | 'coding' | 'growth' | 'play' | 'rest' | 'retry';
export interface PalDefinition {
  id: PalId; name: string; family: string; tagline: string; description: string;
  personality: string; starter: boolean; unlockGems: number;
  assetId: string; artPath: string; color: string;
}

export const PAL_CATALOG: readonly Readonly<PalDefinition>[] = Object.freeze([
  Object.freeze({ id: 'glim' as const, name: 'Glim', family: 'Explorer', tagline: 'What happens if…?',
    description: 'A curious explorer who finds possibilities in every little experiment.',
    personality: 'Curious, adventurous and easily amazed.', starter: true, unlockGems: 50,
    assetId: 'pal-glim', artPath: 'jems-art/gem_blue.webp', color: '#2E6BFF' }),
  Object.freeze({ id: 'kip' as const, name: 'Kip', family: 'Maker', tagline: 'Let’s give it a go!',
    description: 'An eager builder who loves testing an idea and trying a different way.',
    personality: 'Inventive, determined and delightfully overenthusiastic.', starter: true, unlockGems: 50,
    assetId: 'pal-kip', artPath: 'jems-art/gem_mint.webp', color: '#22D3A6' }),
  Object.freeze({ id: 'riff' as const, name: 'Riff', family: 'Story', tagline: 'And then… a tap-dancing turnip!',
    description: 'A playful storyteller who turns small ideas into unexpected adventures.',
    personality: 'Imaginative, expressive and fond of very silly plot twists.', starter: false, unlockGems: 150,
    assetId: 'pal-riff', artPath: 'jems-art/gem_coral.webp', color: '#FF5E7A' }),
]);
export function isPalId(value: unknown): value is PalId {
  return typeof value === 'string' && PAL_CATALOG.some(pal => pal.id === value);
}
export function palDefinition(id: PalId | string): Readonly<PalDefinition> {
  const pal = PAL_CATALOG.find(entry => entry.id === id);
  if (!pal) throw Error('Choose a Pal from your collection.');
  return pal;
}

const LINES: Readonly<Record<PalId, Readonly<Record<PalLineKind, readonly string[]>>>> = {
  glim: {
    welcome: ['Adventure detector: switched on. Sandwich detector: still in testing.', 'What shall we discover? I brought my imaginary map.'],
    practice: ['Another discovery! My imaginary notebook is getting very sparkly.', 'Aha! Filing that under “things we tried.”'],
    making: ['That idea has legs. Are we giving it roller skates?', 'An experiment! Excellent. I have put on my thinking eyebrows.'],
    coding: ['The instructions worked! Even the ones without a snack break.', 'A little plan, a little test, a rather excellent adventure.'],
    growth: ['New sparkle unlocked. Same delightfully curious me.', 'More adventures, more sparkle. Still no pockets.'],
    play: ['I wonder what is over there. Probably not a biscuit. Let’s check.', 'Tiny gem. Enormous curiosity.'],
    rest: ['Our adventure will be right here when you’re ready.', 'Good stopping spot. Map folded. Mostly.'],
    retry: ['That gave us a clue. What shall we try next?', 'Unexpected result! My map has become more interesting.'],
  },
  kip: {
    welcome: ['Tools ready. Silly ideas also ready.', 'Let’s build something. My imaginary hard hat is on.'],
    practice: ['Another step done! Deploying one tiny celebration wiggle.', 'I would give that a high five, but I am still counting my fingers.'],
    making: ['We tested it! That is my favorite part. After the other parts.', 'An idea became a thing. I may need a bigger imaginary toolbox.'],
    coding: ['Step one: try it. Step two: tiny victory dance.', 'It followed the plan! My victory dance did not.'],
    growth: ['More adventures, extra sparkle. Toolbox still imaginary.', 'I have upgraded my celebration wiggle.'],
    play: ['Quality check: boing.', 'I made a plan. Then I drew a duck in the corner.'],
    rest: ['Tools away. Your ideas will keep.', 'We can pick this up later. Imaginary hard hat: parked.'],
    retry: ['Test complete. New clue collected. Want to try another way?', 'That was a useful wobble. What could we change?'],
  },
  riff: {
    welcome: ['Once upon a time… you chose what happened next.', 'New adventure? I packed three plot twists and a turnip.'],
    practice: ['Another chapter! This one has a particularly excellent ending.', 'A small step for us. A huge leap for my imaginary tap shoes.'],
    making: ['Your idea has entered the story. Cue the dramatic kazoo!', 'Now that is a plot twist I can play.'],
    coding: ['First this, then that… and then the turnip takes a bow.', 'The scene is ready. My imaginary audience is wearing party hats.'],
    growth: ['A new chapter of sparkle. The turnip remains mysterious.', 'Our adventure collection has grown. I shall announce it with a tiny kazoo.'],
    play: ['Plot twist: the treasure was a very confident potato.', 'I do all my best thinking in imaginary tap shoes.'],
    rest: ['Bookmark in. The next chapter can wait.', 'A good place to pause. Even turnips need scene changes.'],
    retry: ['A plot twist! Which direction shall our story take now?', 'Let’s try another ending. The kazoo is standing by.'],
  },
};

/** Scripted, deterministic and bounded. No model or emotional-pressure copy. */
export function palLine(id: PalId, kind: PalLineKind, seed: string | number = 0): string {
  const lines = LINES[palDefinition(id).id][kind];
  if (!lines) throw Error('Choose an available Pal reaction.');
  let index = typeof seed === 'number' && Number.isFinite(seed) ? Math.abs(Math.floor(seed)) : 0;
  if (typeof seed === 'string') for (const char of seed) index = (index * 31 + char.charCodeAt(0)) >>> 0;
  return lines[index % lines.length];
}

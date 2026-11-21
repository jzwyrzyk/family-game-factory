import { PAL_COLLECTION_ARTWORK } from './catalog-artwork.generated';

export type PalArtworkSlug = typeof PAL_COLLECTION_ARTWORK[number]['slug'];
/** Existing inventory IDs are compatibility aliases, not displayed identities.
 * Keeping them preserves owned Pals, receipt assignments and selection history. */
export type PalId = 'glim' | 'kip' | 'riff' | Exclude<PalArtworkSlug, 'luma' | 'nook' | 'wink'>;
export type PalForm = 'base' | 'mature';
export type PalExpression = 'neutral' | 'celebrate' | 'thinking' | 'encouraging_retry';
type PalExpressionImages = Readonly<Partial<Record<PalExpression, string>> & { neutral: string }>;
/** Form/version bindings are independent of earned progress. Legacy scene token
 * IDs stay immutable; approved characters have separate scene asset IDs. */
export interface PalArtworkBinding {
  status: 'approved';
  speciesId: string | null; characterKey: string;
  slug: PalArtworkSlug; assetVersion: string;
  forms: Readonly<Record<PalForm, string>>;
  expressions: Readonly<Record<PalForm, PalExpressionImages>>;
}
export type PalLineKind = 'welcome' | 'practice' | 'making' | 'coding' | 'growth' | 'play' | 'rest' | 'retry';
export interface PalDefinition {
  id: PalId; name: string; family: string; tagline: string; description: string;
  personality: string; starter: boolean; unlockGems: number;
  assetId: string; artPath: string; color: string; artwork: Readonly<PalArtworkBinding>;
}

export const PAL_LEGACY_IDENTITIES = Object.freeze({ glim: 'luma', kip: 'nook', riff: 'wink' } as const);
const COPY: Readonly<Record<PalArtworkSlug, { family: string; tagline: string; description: string; personality: string; color: string }>> = {
  luma: { family: 'Explorer', tagline: 'Let’s light the way!', description: 'A curious friend with a bright crystal on its back.', personality: 'Curious, warm and easily amazed.', color: '#2E6BFF' },
  nook: { family: 'Gardener', tagline: 'Small ideas can grow!', description: 'A gentle friend with a cozy little gem garden.', personality: 'Patient, caring and quietly inventive.', color: '#C47A20' },
  wink: { family: 'Storyteller', tagline: 'A little flash of fun!', description: 'A playful friend with a tail full of shining signals.', personality: 'Expressive, cheerful and fond of silly surprises.', color: '#CC3859' },
  mizzle: { family: 'Gardener', tagline: 'One little drop!', description: 'A gentle gardener who makes the most of tiny drops.', personality: 'Thoughtful and quietly cheerful.', color: '#359BB0' },
  tumble: { family: 'Balancer', tagline: 'Wobble, then try again!', description: 'A lively friend with a big gem and a clever balancing tail.', personality: 'Bouncy, determined and playful.', color: '#7B63B3' },
  navi: { family: 'Explorer', tagline: 'What shall we discover?', description: 'A curious friend with a floating violet focus gem.', personality: 'Watchful, curious and imaginative.', color: '#8462C7' },
  mote: { family: 'Explorer', tagline: 'Tiny friend, big ideas!', description: 'A little companion who notices small surprises.', personality: 'Alert, curious and friendly.', color: '#668CB5' },
  sivo: { family: 'Sorter', tagline: 'Let’s see what fits!', description: 'A careful friend with handy gem sieves.', personality: 'Patient, methodical and curious.', color: '#6B9D9B' },
  furl: { family: 'Flyer', tagline: 'Let’s spread our wings!', description: 'A bright friend with a matching pair of gem wings.', personality: 'Gentle, adventurous and cheerful.', color: '#9A79B8' },
  tessit: { family: 'Maker', tagline: 'Step into a pattern!', description: 'A maker whose special feet stamp little tiles.', personality: 'Inventive, precise and playful.', color: '#B87A5B' },
  flick: { family: 'Collector', tagline: 'A seed of an idea!', description: 'A lively friend who gathers little seeds.', personality: 'Energetic, observant and generous.', color: '#65A06D' },
  clasp: { family: 'Climber', tagline: 'One little climb!', description: 'An adventurous friend with hook-shaped gems.', personality: 'Steady, bold and resourceful.', color: '#93805E' },
  skiff: { family: 'Glider', tagline: 'Ready for a little slide?', description: 'A playful friend with a ski-shaped gem foot.', personality: 'Easygoing, lively and adventurous.', color: '#5F98B5' },
  peep: { family: 'Discoverer', tagline: 'Look a little closer!', description: 'A curious friend with a magnifying gem eye.', personality: 'Observant, patient and easily delighted.', color: '#AA875B' },
  weft: { family: 'Maker', tagline: 'Let’s weave an idea!', description: 'A thoughtful maker with a special gem loom.', personality: 'Patient, inventive and gentle.', color: '#A180A6' },
  cache: { family: 'Collector', tagline: 'A place for little treasures!', description: 'A cheerful friend with a geode for keeping treasures.', personality: 'Organized, welcoming and curious.', color: '#9474AB' },
  brim: { family: 'Helper', tagline: 'A little shade to share!', description: 'A friendly companion with a shady gem canopy.', personality: 'Calm, thoughtful and generous.', color: '#769A64' },
  poff: { family: 'Helper', tagline: 'A tiny puff of possibility!', description: 'A little friend with gem valves for careful puffs.', personality: 'Eager, helpful and a little overconfident.', color: '#8D73B4' },
  chimi: { family: 'Musician', tagline: 'That note was a surprise!', description: 'A musical friend with a tuneful back-gem comb.', personality: 'Inventive, cheerful and forgiving.', color: '#B98457' },
  pleeko: { family: 'Helper', tagline: 'A little step can help!', description: 'A small friend whose back unfolds into helpful steps.', personality: 'Helpful, eager and determined.', color: '#78997C' },
  talli: { family: 'Measurer', tagline: 'How far? Let’s find out!', description: 'A thoughtful friend with a flat measuring tail.', personality: 'Curious, patient and precise.', color: '#A38462' },
  zippa: { family: 'Maker', tagline: 'Ready, steady, click!', description: 'A cheerful friend who joins edges with gem teeth.', personality: 'Focused, inventive and proud of a neat finish.', color: '#7A96B4' },
  whorl: { family: 'Balancer', tagline: 'Let’s settle that wobble!', description: 'A thoughtful friend with an enthusiastically spinning gem.', personality: 'Calm, helpful and quietly playful.', color: '#8B7BB5' },
  brio: { family: 'Musician', tagline: 'A little rhythm in every step!', description: 'A cheerful rhythm maker with amber sounding plates.', personality: 'Musical, energetic and fond of getting the beat just right.', color: '#B27640' },
};

function collectionId(slug: PalArtworkSlug): PalId {
  if (slug === 'luma') return 'glim';
  if (slug === 'nook') return 'kip';
  if (slug === 'wink') return 'riff';
  return slug;
}
function sceneId(slug: PalArtworkSlug, form: PalForm, version: string): string {
  return `pal-${slug}-${form}-${version}`;
}
const artworkOrder = [
  ...['luma', 'nook', 'wink'].map(slug => PAL_COLLECTION_ARTWORK.find(record => record.slug === slug)!),
  ...PAL_COLLECTION_ARTWORK.filter(record => !['luma', 'nook', 'wink'].includes(record.slug)),
];
/** November 21 implementation policy: preserve the first two 50-gem options and
 * the existing third 150-gem unlock; later approved Pals begin at 200 and advance
 * by 50 lifetime gems. These cosmetic thresholds make no ability claim. */
export const PAL_CATALOG: readonly Readonly<PalDefinition>[] = Object.freeze(artworkOrder.map((source, index) => {
  const expressions = Object.freeze({ base: Object.freeze({ ...source.forms.base }), mature: Object.freeze({ ...source.forms.mature }) });
  const artwork: Readonly<PalArtworkBinding> = Object.freeze({ status: 'approved', speciesId: source.speciesId,
    characterKey: source.characterKey, slug: source.slug, assetVersion: source.assetVersion,
    forms: Object.freeze({ base: source.forms.base.neutral, mature: source.forms.mature.neutral }), expressions });
  return Object.freeze({ id: collectionId(source.slug), name: source.name, ...COPY[source.slug],
    starter: index < 2, unlockGems: index < 2 ? 50 : index === 2 ? 150 : 200 + (index - 3) * 50,
    artwork, artPath: artwork.forms.base, assetId: sceneId(source.slug, 'base', source.assetVersion) });
}));
export function isPalId(value: unknown): value is PalId {
  return typeof value === 'string' && PAL_CATALOG.some(pal => pal.id === value);
}
export function palDefinition(id: PalId | string): Readonly<PalDefinition> {
  const pal = PAL_CATALOG.find(entry => entry.id === id);
  if (!pal) throw Error('Choose a Pal from your collection.');
  return pal;
}

/** Missing approved expressions (Brio) stay with that character and form. */
export function palArtworkPath(id: PalId | string, form: PalForm = 'base', expression: PalExpression = 'neutral'): string {
  const artwork = palDefinition(id).artwork;
  if (form !== 'base' && form !== 'mature') throw Error('Choose Base or Grown.');
  if (!['neutral', 'celebrate', 'thinking', 'encouraging_retry'].includes(expression)) throw Error('Choose an available Pal expression.');
  return artwork.expressions[form][expression] ?? artwork.forms[form];
}
export function palSceneAssetId(id: PalId | string, form: PalForm = 'base'): string {
  const artwork = palDefinition(id).artwork;
  if (form !== 'base' && form !== 'mature') throw Error('Choose Base or Grown.');
  return sceneId(artwork.slug, form, artwork.assetVersion);
}

const LINES: Readonly<Record<'glim' | 'kip' | 'riff', Readonly<Record<PalLineKind, readonly string[]>>>> = {
  glim: {
    welcome: ['Adventure detector: switched on. Sandwich detector: still in testing.', 'What shall we discover? I brought my imaginary map.'],
    practice: ['Another discovery! My imaginary notebook is getting very sparkly.', 'Aha! Filing that under “things we tried.”'],
    making: ['That idea has legs. Are we giving it roller skates?', 'An experiment! Excellent. I have put on my thinking eyebrows.'],
    coding: ['The instructions worked! Even the ones without a snack break.', 'A little plan, a little test, a rather excellent adventure.'],
    growth: ['New sparkle unlocked. Same delightfully curious me.', 'More adventures, more sparkle. Still no pockets.'],
    play: ['I wonder what is over there. Probably not a biscuit. Let’s check.', 'A small light. Enormous curiosity.'],
    rest: ['Our adventure will be right here when you’re ready.', 'Good stopping spot. Map folded. Mostly.'],
    retry: ['That gave us a clue. What shall we try next?', 'Unexpected result! My map has become more interesting.'],
  },
  kip: {
    welcome: ['A little room for a new idea.', 'Let’s grow an idea. Tiny watering can: ready.'],
    practice: ['Another step done! Deploying one tiny celebration wiggle.', 'I would give that a high five, but I am still counting my fingers.'],
    making: ['We tested it! That is my favorite part. After the other parts.', 'An idea became a thing. I may need a bigger imaginary toolbox.'],
    coding: ['Step one: try it. Step two: tiny victory dance.', 'It followed the plan! My victory dance did not.'],
    growth: ['More adventures, extra sparkle. Toolbox still imaginary.', 'I have upgraded my celebration wiggle.'],
    play: ['Gem garden inspection: looking sparkly.', 'I made a plan. Then I drew a duck in the corner.'],
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

const SHARED_LINES: Readonly<Record<PalLineKind, readonly string[]>> = {
  welcome: ['What shall we make today?', 'A new adventure? Let’s see!'],
  practice: ['Another little discovery!', 'That gave us something to think about.'],
  making: ['Your idea is taking shape!', 'A little try, a little surprise.'],
  coding: ['The plan did something! What shall we try next?', 'Ready for a tiny victory wiggle.'],
  growth: ['More adventures, a new look!', 'A new look for our next adventure.'],
  play: ['An important wiggle is about to happen.', 'Tiny dance. Big finish.'],
  rest: ['A good place to pause.', 'Your idea will be here when you return.'],
  retry: ['That gave us a clue. What could we change?', 'Let’s try another way.'],
};

/** Scripted, deterministic and bounded. No model or emotional-pressure copy. */
export function palLine(id: PalId, kind: PalLineKind, seed: string | number = 0): string {
  const definition = palDefinition(id);
  const legacy = definition.id === 'glim' || definition.id === 'kip' || definition.id === 'riff';
  const lines = legacy ? LINES[definition.id as 'glim' | 'kip' | 'riff'][kind]
    : kind === 'play' ? [definition.tagline, ...SHARED_LINES.play] : SHARED_LINES[kind];
  if (!lines) throw Error('Choose an available Pal reaction.');
  let index = typeof seed === 'number' && Number.isFinite(seed) ? Math.abs(Math.floor(seed)) : 0;
  if (typeof seed === 'string') for (const char of seed) index = (index * 31 + char.charCodeAt(0)) >>> 0;
  return lines[index % lines.length];
}

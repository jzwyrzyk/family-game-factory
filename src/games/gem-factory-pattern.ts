import type { FactoryGemColor } from './gem-factory-physics';

export interface FactoryPattern {
  cycle: FactoryGemColor[];
  sequence: FactoryGemColor[];
  next: FactoryGemColor;
}

export function factoryPalette(level: number): FactoryGemColor[] {
  return level === 1 ? ['ruby', 'sapphire', 'emerald'] : level === 2
    ? ['ruby', 'sapphire', 'emerald', 'amethyst']
    : ['ruby', 'sapphire', 'emerald', 'amethyst', 'sunshine'];
}

/** A repeating visual rule, with enough examples to discover its next piece. */
export function factoryPattern(level: number, gift: number): FactoryPattern {
  const palette = factoryPalette(level), start = (gift + level - 1) % palette.length;
  const a = palette[start], b = palette[(start + 1) % palette.length], c = palette[(start + 2) % palette.length];
  const cycle: FactoryGemColor[] = level === 1 ? [a, b] : level === 2 ? [a, a, b]
    : level % 3 === 0 ? [a, b, c] : level % 3 === 1 ? [a, b, b] : [a, b, a];
  // Vary where the question falls, so copying the first gem is not a solution.
  const length = cycle.length === 2 ? 4 + gift % 2 : 6 - gift % 2;
  const sequence = Array.from({ length }, (_, i) => cycle[i % cycle.length]);
  return { cycle, sequence, next: cycle[length % cycle.length] };
}

/** Every short supply loop contains both the answer and a different gem. */
export function factorySupply(pattern: FactoryPattern, level: number, gift: number): FactoryGemColor[] {
  const palette = factoryPalette(level), other = palette.filter(color => color !== pattern.next);
  return gift % 2 === 0
    ? [other[gift % other.length], pattern.next, other[(gift + 1) % other.length], pattern.next]
    : [pattern.next, other[gift % other.length], pattern.next, other[(gift + 1) % other.length]];
}

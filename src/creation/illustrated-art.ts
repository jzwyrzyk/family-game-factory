/** Immutable, bundled Jems artwork. These URLs are independent of the private art library. */
const base = './art/creative-worlds/v1';
const collections = [
  { key: 'forest', label: 'Enchanted Gem Forest', objects: [
    ['tree', 'Tree'],
    ['mossy-rock', 'Mossy rock'],
    ['flowers', 'Flowers'],
    ['mushrooms', 'Mushrooms'],
    ['amethyst', 'Amethyst crystals'],
    ['log', 'Hollow log'],
    ['bridge', 'Bridge'],
    ['treasure-chest', 'Treasure chest']
  ] },
  { key: 'workshop', label: 'Inventor’s Workshop', objects: [
    ['workbench', 'Workbench'],
    ['crate', 'Crate'],
    ['gear', 'Gear'],
    ['polisher', 'Gem polisher'],
    ['button', 'Button'],
    ['wrench', 'Wrench'],
    ['pipe', 'Copper pipe'],
    ['spring', 'Spring']
  ] },
  { key: 'cloud', label: 'Cloud Kingdom', objects: [
    ['cloud-platform', 'Cloud platform'],
    ['sky-island', 'Floating island'],
    ['balloon', 'Balloon'],
    ['star', 'Golden star'],
    ['rainbow', 'Rainbow'],
    ['turret', 'Castle tower'],
    ['floating-gem', 'Floating gem'],
    ['cloud-stairs', 'Cloud steps']
  ] },
  { key: 'moon', label: 'Moon Adventure', objects: [
    ['moon-rock', 'Moon rock'],
    ['rocket', 'Rocket'],
    ['satellite', 'Satellite'],
    ['crater', 'Crater'],
    ['station', 'Space station'],
    ['space-crystal', 'Space crystal'],
    ['meteorite', 'Meteorite'],
    ['rover', 'Moon rover']
  ] }
] as const;

const propId = (key: string) => `world-prop-${key}-v1`;

export const WORLD_PROPS = collections.flatMap(({ objects }) =>
  objects.map(([key, label]) => ({ id: propId(key), label, url: `${base}/${key}.webp` }))
);

export const ILLUSTRATED_WORLDS = collections.map(({ key, label, objects }) => ({
  id: `world-${key}-v1` as const, label,
  preview: `${base}/${key}-preview.webp`,
  background: `${base}/${key}-background.webp`,
  middle: `${base}/${key}-middle.webp`,
  foreground: `${base}/${key}-foreground.webp`,
  props: [...objects.map(([name]) => propId(name)), ...(key === 'moon' ? [propId('star')] : [])],
}));

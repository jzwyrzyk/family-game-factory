const pictures = new Set('cat dog sun hat bat log frog fox box hen pen pig fish dish sock rock boat goat bee tree key cup bus bed moon spoon apple pear banana carrot rabbit duck turtle ball bell bag book star gem drum kite seed flower rain cube cone can egg chick umbrella shoe hand map milk rainbow sunflower cupcake snowman toothbrush pancake popcorn butterfly'.split(' '));
export function picture(name: string): HTMLImageElement {
  if (!pictures.has(name)) throw Error('Unknown local learning picture.');
  const image = document.createElement('img');
  image.src = new URL('early-pictures/' + name + '.webp', document.baseURI).href;
  image.alt = name;
  image.className = 'early-picture';
  image.draggable = false;
  return image;
}
export const hasPicture = (name: string) => pictures.has(name);

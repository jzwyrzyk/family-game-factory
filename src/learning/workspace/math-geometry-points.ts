export type Vertex = readonly [number, number];

const outlines: Record<string, readonly Vertex[]> = {
  triangle: [[180,25],[90,25+90*Math.sqrt(3)],[270,25+90*Math.sqrt(3)]],
  square: [[100,25],[260,25],[260,185],[100,185]],
  pentagon: [[180,20],[270,80],[235,180],[125,180],[90,80]],
  hexagon: [[110,35],[250,35],[295,105],[250,175],[110,175],[65,105]],
  parallelogram: [[110,45],[300,45],[250,175],[60,175]],
  rhombus: [[180,25],[295,105],[180,185],[65,105]],
  trapezoid: [[120,45],[240,45],[300,175],[60,175]],
};

export function polygonVertices(shape: string, width?: number, height?: number): readonly Vertex[] {
  if (shape !== 'rectangle') return Object.hasOwn(outlines, shape) ? outlines[shape] : [];
  const w = width || 2, h = height || 1;
  const scale = width && height ? Math.min(260/w,150/h) : 120;
  const x = w*scale/2, y = h*scale/2;
  return [[180-x,105-y],[180+x,105-y],[180+x,105+y],[180-x,105+y]];
}
export const pointsAttribute = (vertices: readonly Vertex[]) => vertices.map(point => point.join(',')).join(' ');

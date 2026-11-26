/** Coordinates use this canvas's own bitmap dimensions after CSS scaling. */
export function pointerPoint(canvas: HTMLCanvasElement, event: PointerEvent, precision: 'drawing' | 'position' = 'drawing'): {x: number; y: number; p?: number} {
  const rect = canvas.getBoundingClientRect();
  const coordinate = (offset: number, displayed: number, pixels: number) => {
    if (displayed <= 0) return 0;
    const value = Math.min(pixels, Math.max(0, offset / displayed * pixels));
    return precision === 'drawing' ? Math.round(value * 4) / 4 : value;
  };
  const x = coordinate(event.clientX - rect.left, rect.width, canvas.width);
  const y = coordinate(event.clientY - rect.top, rect.height, canvas.height);
  if (precision === 'drawing' && event.pointerType === 'pen' && event.pressure > 0) {
    return {x, y, p: Math.round(Math.min(event.pressure, 1) * 100) / 100};
  }
  return {x, y};
}

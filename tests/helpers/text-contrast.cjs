const assert = require('node:assert/strict');

/** Browser-side inspection for text on the app's solid/gradient reading surfaces.
 * Samples all computed gradient stops and their midpoints, composites transparent
 * backgrounds, and includes the inspected element's opacity. This is deliberately
 * not an image/pseudo-element accessibility scanner.
 */
function inspectTextContrast(element) {
  const parse = value => {
    const match = value.match(/^rgba?\(([^)]+)\)$/);
    if (!match) throw Error(`Unsupported computed color: ${value}`);
    const numbers = match[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return [numbers[0], numbers[1], numbers[2], numbers.length > 3 ? numbers[3] : 1];
  };
  const over = (front, back) => {
    const alpha = front[3] + back[3] * (1 - front[3]);
    if (!alpha) return [0, 0, 0, 0];
    return [0, 1, 2].map(i => (front[i] * front[3] + back[i] * back[3] * (1 - front[3])) / alpha).concat(alpha);
  };
  const sample = style => {
    const color = parse(style.backgroundColor);
    if (style.backgroundImage === 'none') return [color];
    if (/url\(/.test(style.backgroundImage)) throw Error('Image backgrounds require visual inspection, not this contrast helper');
    const stops = [...style.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map(match => parse(match[0]));
    if (!stops.length) throw Error(`Unsupported background: ${style.backgroundImage}`);
    const midpoints = stops.slice(1).map((stop, i) => stop.map((value, channel) => (value + stops[i][channel]) / 2));
    return [...stops, ...midpoints].map(stop => over(stop, color));
  };
  const unique = colors => [...new Map(colors.map(color => [color.map(value => Math.round(value * 1000)).join(','), color])).values()];
  const layers = [];
  for (let node = element; node; node = node.parentElement) {
    const style = getComputedStyle(node), colors = sample(style);
    layers.unshift({ node, style, colors });
    // Opaque nearest surfaces fully cover earlier imagery and the browser canvas.
    if (colors.every(color => color[3] === 1) && Number(style.opacity) === 1) break;
  }
  let backdrop = [[255, 255, 255, 1]], pairs = [];
  for (const layer of layers) {
    const opacity = Number(layer.style.opacity);
    if (layer.node !== element && opacity !== 1) throw Error('Ancestor group opacity needs a rendered pixel audit');
    pairs = backdrop.flatMap(under => layer.colors.map(color => ({ under, surface: over(color, under) })));
    backdrop = unique(pairs.map(pair => pair.surface));
  }
  const style = getComputedStyle(element), foreground = parse(style.color), opacity = Number(style.opacity);
  const luminance = color => {
    const linear = color.slice(0, 3).map(channel => { const c = channel / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const samples = pairs.map(({ under, surface }) => {
    const text = over(foreground, surface);
    const actualText = over([...text.slice(0, 3), opacity], under);
    const actualSurface = over([...surface.slice(0, 3), opacity], under);
    const first = luminance(actualText), second = luminance(actualSurface);
    return { ratio: (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05), background: actualSurface.slice(0, 3) };
  });
  return {
    ratio: Math.min(...samples.map(sample => sample.ratio)), foreground: style.color,
    backgrounds: unique(samples.map(sample => [...sample.background, 1])), opacity,
    text: (element.value || element.textContent || '').trim().slice(0, 100),
    disabled: element.matches(':disabled'), fontSize: style.fontSize,
  };
}

async function assertTextContrast(page, selector, label, options = {}) {
  const matches = page.locator(selector), count = await matches.count(), results = [];
  assert.ok(count > 0, `${label}: expected ${selector}`);
  for (let index = 0; index < count; index++) {
    const element = matches.nth(index);
    if (!await element.isVisible()) continue;
    const state = await element.evaluate(inspectTextContrast);
    if (!state.text || (state.disabled && !options.includeDisabled)) continue;
    assert.ok(state.ratio >= (options.minRatio || 4.5), `${label}: ${selector}[${index}] has ${state.ratio.toFixed(2)}:1 text contrast: ${JSON.stringify(state)}`);
    results.push(state);
  }
  assert.ok(results.length > 0, `${label}: no visible readable text matched ${selector}`);
  return results;
}

module.exports = { inspectTextContrast, assertTextContrast };

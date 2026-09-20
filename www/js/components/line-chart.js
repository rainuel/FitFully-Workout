// A small line chart drawn as inline SVG. Fully offline, no library.
//
//   lineChart({ points: [{ x: 0, y: 25, label: '5 Sep' }, ...], ariaLabel: '...', formatValue, integers })
//
// `x` positions points along the axis (use an index, or days since a start
// date); `label` is shown under the first and last point. Points must be in
// order. Colours come from CSS (.chart__*).

import { formatWeight } from '../utils/format.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const WIDTH = 320;
const HEIGHT = 170;
const PAD = { top: 14, right: 14, bottom: 28, left: 46 };
const MAX_DOTS = 30;

/** A round step size (1, 2, 2.5, 5 x a power of ten) that gives about `targetTicks` gridlines. */
export function niceStep(range, targetTicks = 4) {
  const raw = range / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  for (const multiple of [1, 2, 2.5, 5, 10]) {
    if (multiple * magnitude >= raw) return multiple * magnitude;
  }
  return 10 * magnitude;
}

/**
 * Axis bounds and gridline values with breathing room around the data: { min, max, ticks }.
 * With `integers`, gridlines fall on whole numbers only (for rep counts).
 */
export function computeAxis(values, { integers = false } = {}) {
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const pad = dataMin === dataMax ? Math.max(1, Math.abs(dataMax) * 0.1) : (dataMax - dataMin) * 0.15;

  let step = niceStep(dataMax + pad - (dataMin - pad));
  if (integers) step = Math.max(1, Math.ceil(step));
  let min = Math.floor((dataMin - pad) / step) * step;
  const max = Math.ceil((dataMax + pad) / step) * step;
  if (dataMin >= 0 && min < 0) min = 0;

  const ticks = [];
  for (let i = 0; min + i * step <= max + step / 1000 && i < 12; i++) {
    ticks.push(Math.round((min + i * step) * 10000) / 10000);
  }
  return { min, max, ticks };
}

function svgEl(tag, attrs = {}, text = null) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  if (text !== null) el.textContent = text;
  return el;
}

export function lineChart({ points, ariaLabel, formatValue = formatWeight, integers = false }) {
  const svg = svgEl('svg', { class: 'chart', viewBox: `0 0 ${WIDTH} ${HEIGHT}`, role: 'img', 'aria-label': ariaLabel });
  if (points.length === 0) return svg;

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const xs = points.map((p) => p.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const axis = computeAxis(points.map((p) => p.y), { integers });

  const px = (x) => PAD.left + (maxX === minX ? innerW / 2 : ((x - minX) / (maxX - minX)) * innerW);
  const py = (y) => PAD.top + innerH - ((y - axis.min) / (axis.max - axis.min)) * innerH;

  for (const tick of axis.ticks) {
    const y = py(tick);
    svg.append(
      svgEl('line', { class: 'chart__grid', x1: PAD.left, x2: WIDTH - PAD.right, y1: y, y2: y }),
      svgEl('text', { class: 'chart__label', x: PAD.left - 8, y: y + 4, 'text-anchor': 'end' }, formatValue(tick)),
    );
  }

  if (points.length > 1) {
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`).join(' ');
    svg.append(svgEl('path', { class: 'chart__line', d }));
  }

  const last = points.length - 1;
  points.forEach((p, i) => {
    if (i !== last && points.length > MAX_DOTS) return;
    svg.append(svgEl('circle', { class: i === last ? 'chart__dot chart__dot--last' : 'chart__dot', cx: px(p.x), cy: py(p.y), r: i === last ? 5 : 3.5 }));
  });

  const baseline = HEIGHT - 8;
  if (points.length === 1) {
    svg.append(svgEl('text', { class: 'chart__label', x: px(points[0].x), y: baseline, 'text-anchor': 'middle' }, points[0].label ?? ''));
  } else {
    svg.append(
      svgEl('text', { class: 'chart__label', x: px(points[0].x), y: baseline, 'text-anchor': 'start' }, points[0].label ?? ''),
      svgEl('text', { class: 'chart__label', x: px(points[last].x), y: baseline, 'text-anchor': 'end' }, points[last].label ?? ''),
    );
  }
  return svg;
}

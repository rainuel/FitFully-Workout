// Stroke icons (24x24). Built with createElementNS, no innerHTML.

const SVG_NS = 'http://www.w3.org/2000/svg';

// A string is a <path d="...">. An object is any other element.
const ICONS = {
  home: ['M3 11.5 12 3l9 8.5', 'M5 10v10.5h5v-6h4v6h5V10'],
  workout: ['M6.5 6.5v11', 'M17.5 6.5v11', 'M3.5 9.5v5', 'M20.5 9.5v5', 'M6.5 12h11'],
  progress: ['M3 3v18h18', 'M7 15.5l4-4.5 3 3 5-6.5'],
  program: [{ tag: 'rect', x: 3, y: 4.5, width: 18, height: 16.5, rx: 2.5 }, 'M3 9.5h18', 'M8 2.5v4', 'M16 2.5v4'],
  profile: [{ tag: 'circle', cx: 12, cy: 8, r: 4 }, 'M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5'],
  back: ['M15 5l-7 7 7 7'],
  chevron: ['M9 5l7 7-7 7'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  search: [{ tag: 'circle', cx: 11, cy: 11, r: 6.5 }, 'M20 20l-4.2-4.2'],
  library: ['M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z', 'M5 17a3 3 0 0 1 3-3h11'],
  grip: ['M9 6h.01', 'M15 6h.01', 'M9 12h.01', 'M15 12h.01', 'M9 18h.01', 'M15 18h.01'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  pause: ['M8.5 5v14', 'M15.5 5v14'],
  play: ['M8 5v14l11-7z'],
  flame: ['M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z'],
  trophy: [
    'M6 9H4.5a2.5 2.5 0 0 1 0-5H6',
    'M18 9h1.5a2.5 2.5 0 0 0 0-5H18',
    'M4 22h16',
    'M10 14.66V17c0 .55-.47.98-1.97 1.21C7.85 18.75 7 20.24 7 22',
    'M14 14.66V17c0 .55.47.98 1.97 1.21C16.15 18.75 17 20.24 17 22',
    'M18 2H6v7a6 6 0 0 0 12 0V2z',
  ],
};

export function icon(name, { strokeWidth = 2 } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(strokeWidth));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  for (const part of ICONS[name] ?? []) {
    if (typeof part === 'string') {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', part);
      svg.append(path);
    } else {
      const { tag, ...attrs } = part;
      const el = document.createElementNS(SVG_NS, tag);
      for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
      svg.append(el);
    }
  }
  return svg;
}

import { h } from '../utils/dom.js';
import { lineChart } from './line-chart.js';
import { formatWeight } from '../utils/format.js';
import { formatChange } from '../services/profile-rules.js';
import { formatShortDate } from '../utils/dates.js';

/** Latest / change / entries, shared by Progress and Profile. */
export function bodyweightStats({ summary, unit, count }) {
  const stat = (value, label) => h('div', { class: 'stat' }, h('span', { class: 'stat__value' }, value), h('span', { class: 'stat__label' }, label));
  return h(
    'div',
    { class: 'stats' },
    stat(`${formatWeight(summary.latest.weight)} ${unit}`, `Latest · ${formatShortDate(summary.latest.date)}`),
    stat(summary.change === null ? '—' : formatChange(summary.change, unit), 'Since first entry'),
    stat(String(count), count === 1 ? 'Entry' : 'Entries'),
  );
}

/** The bodyweight line chart, or a short note until there are two entries. */
export function bodyweightChart({ points, unit }) {
  if (points.length < 2) {
    return h('p', { class: 'muted small' }, 'Log at least two entries to see your trend.');
  }
  return h(
    'div',
    { class: 'chart-box' },
    lineChart({
      points,
      ariaLabel: `Bodyweight over time in ${unit}. Latest ${formatWeight(points[points.length - 1].y)} ${unit}.`,
      formatValue: (v) => formatWeight(Math.round(v * 10) / 10),
    }),
  );
}

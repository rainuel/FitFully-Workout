import { h } from '../utils/dom.js';
import { formatFullDate, toLocalDateString } from '../utils/dates.js';
import { APP_VERSION } from '../utils/app-info.js';
import { formatWeight } from '../utils/format.js';
import { saveWeightIncrement } from '../services/progression-service.js';
import { INCREMENT_PRESETS, MAX_INCREMENT } from '../services/progression-rules.js';
import {
  loadProfile,
  logBodyweight,
  removeBodyweight,
  RECENT_ENTRIES,
  saveHeight,
  saveHeightUnit,
  saveWeightUnit,
} from '../services/profile-service.js';
import {
  HEIGHT_LIMITS,
  bodyweightBounds,
  cmToFeetInches,
  feetInchesToCm,
  formatHeight,
} from '../services/profile-rules.js';
import { stepper, field, segmented } from '../components/controls.js';
import { draftStepper } from '../components/draft-stepper.js';
import { bodyweightChart, bodyweightStats } from '../components/bodyweight-chart.js';
import { confirmDialog } from '../components/modal.js';
import { icon } from '../components/icons.js';
import { showToast } from '../components/toast.js';

function fact(label, value) {
  return h('div', { class: 'facts__row' }, h('dt', null, label), h('dd', null, value));
}

// ---- Body: height + BMI --------------------------------------------------------

const DEFAULT_HEIGHT_CM = 170;

function heightPanel(data, refresh) {
  const startCm = data.heightCm ?? DEFAULT_HEIGHT_CM;
  const start = cmToFeetInches(startCm);
  const inFeet = data.heightUnit === 'ft';

  const cm = draftStepper({ label: 'Height in centimetres', value: Math.round(startCm), min: HEIGHT_LIMITS.minCm, max: HEIGHT_LIMITS.maxCm, step: 1, unit: 'cm' });
  const feet = draftStepper({ label: 'Feet', value: start.feet, min: 3, max: 8, step: 1, unit: 'ft' });
  const inches = draftStepper({ label: 'Inches', value: start.inches, min: 0, max: 11, step: 1, unit: 'in' });

  async function save() {
    const value = inFeet ? feetInchesToCm(feet.value, inches.value) : cm.value;
    const r = await saveHeight(data.db, value);
    if (!r.ok) return showToast(r.errors[0]);
    showToast('Height saved');
    await refresh();
  }

  return h(
    'section',
    { class: 'panel panel--form', 'aria-labelledby': 'height-heading' },
    h('h2', { class: 'section-title', id: 'height-heading' }, 'Height'),
    data.heightCm ? h('p', { class: 'muted' }, `Saved: ${formatHeight(data.heightCm, data.heightUnit)}`) : h('p', { class: 'muted' }, 'Add your height to see your BMI.'),
    segmented({
      label: 'Height unit',
      options: [
        { value: 'cm', label: 'cm' },
        { value: 'ft', label: 'ft / in' },
      ],
      value: data.heightUnit,
      onChange: async (unit) => {
        await saveHeightUnit(data.db, unit);
        await refresh();
      },
    }),
    inFeet ? h('div', { class: 'field-row' }, field('Feet', feet.element), field('Inches', inches.element)) : field('Height', cm.element),
    h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: save }, data.heightCm ? 'Update height' : 'Save height'),
  );
}

function bmiPanel(data) {
  const body = [];
  if (!data.bmi) {
    const missing = [!data.heightCm ? 'your height' : null, !data.summary ? 'your bodyweight' : null].filter(Boolean).join(' and ');
    body.push(h('p', { class: 'muted' }, `Add ${missing} to see your BMI.`));
  } else {
    const b = data.bmi;
    body.push(
      h('div', { class: 'bmi' }, h('span', { class: 'bmi__value' }, b.bmi.toFixed(1)), h('span', { class: `bmi__label bmi__label--${b.category}` }, b.label)),
      h('p', { class: 'muted small' }, `Based on your bodyweight from ${formatFullDate(b.weightDate)}.`),
      h('p', null, b.summary),
      h('p', null, b.suggestion),
    );
  }
  body.push(h('p', { class: 'bmi__note' }, 'BMI is a general screening number for adults, not a medical diagnosis. It doesn’t account for muscle mass, body composition, or your individual circumstances. If you have health concerns, talk to a doctor or dietitian.'));
  return h('section', { class: 'panel', 'aria-labelledby': 'bmi-heading' }, h('h2', { class: 'section-title', id: 'bmi-heading' }, 'BMI'), ...body);
}

// ---- Bodyweight ------------------------------------------------------------------

function entryList(data, refresh, showAll) {
  const shown = showAll ? [...data.records].reverse() : [...data.records].reverse().slice(0, RECENT_ENTRIES);
  return h(
    'ul',
    { class: 'bw-list' },
    ...shown.map((r) =>
      h(
        'li',
        { class: 'bw-row' },
        h('span', { class: 'bw-row__date' }, formatFullDate(r.date)),
        h('span', { class: 'bw-row__weight' }, `${formatWeight(r.weight)} ${r.unit}`),
        h(
          'button',
          {
            class: 'icon-btn',
            type: 'button',
            'aria-label': `Delete entry from ${formatFullDate(r.date)}`,
            onClick: async () => {
              const ok = await confirmDialog({ title: 'Delete this entry?', body: `${formatWeight(r.weight)} ${r.unit} on ${formatFullDate(r.date)}.`, confirmLabel: 'Delete', danger: true });
              if (!ok) return;
              await removeBodyweight(data.db, r.id);
              showToast('Entry deleted');
              await refresh();
            },
          },
          icon('close'),
        ),
      ),
    ),
  );
}

function bodyweightPanel(data, refresh) {
  const { min, max } = bodyweightBounds(data.unit);
  const latest = data.summary?.latest.weight;
  const weight = draftStepper({
    label: `Bodyweight in ${data.unit}`,
    value: latest ?? (data.unit === 'kg' ? 70 : 154),
    min,
    max,
    step: 0.1,
    unit: data.unit,
    format: formatWeight,
  });
  const today = toLocalDateString();
  const date = h('input', { class: 'input', type: 'date', value: today, max: today, 'aria-label': 'Date' });

  async function save() {
    const r = await logBodyweight(data.db, { weight: weight.value, date: date.value });
    if (!r.ok) return showToast(r.errors[0]);
    showToast(r.replaced ? 'Entry for that day updated' : 'Bodyweight logged');
    await refresh();
  }

  const history = [];
  if (data.summary) {
    history.push(bodyweightStats({ summary: data.summary, unit: data.unit, count: data.records.length }), bodyweightChart({ points: data.points, unit: data.unit }), h('h3', { class: 'group-title' }, 'Entries'));
    const wrap = h('div', { class: 'stack' }, entryList(data, refresh, false));
    if (data.records.length > RECENT_ENTRIES) {
      const more = h('button', { class: 'btn btn--secondary btn--block', type: 'button' }, `Show all ${data.records.length} entries`);
      more.addEventListener('click', () => wrap.replaceChildren(entryList(data, refresh, true)));
      wrap.append(more);
    }
    history.push(wrap);
  }

  return h(
    'section',
    { class: 'panel panel--form', 'aria-labelledby': 'bw-heading' },
    h('h2', { class: 'section-title', id: 'bw-heading' }, 'Bodyweight'),
    h('div', { class: 'field-row field-row--wide-first' }, field('Weight', weight.element), field('Date', date)),
    h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: save }, 'Log bodyweight'),
    h('p', { class: 'field__hint' }, 'One entry per day. Logging the same day again replaces it.'),
    ...history,
  );
}

// ---- Units + progression ---------------------------------------------------------

function unitsPanel(data, refresh) {
  const { unit, increment, db } = data;

  async function saveIncrement(value) {
    const r = await saveWeightIncrement(db, value);
    if (!r.ok) return showToast(r.errors[0]);
    showToast(`Weight increment: ${r.value} ${unit}`);
    await refresh();
  }

  return h(
    'section',
    { class: 'panel panel--form', 'aria-labelledby': 'units-heading' },
    h('h2', { class: 'section-title', id: 'units-heading' }, 'Units & progression'),
    field(
      'Weight unit',
      segmented({
        label: 'Weight unit',
        options: [
          { value: 'lbs', label: 'lbs' },
          { value: 'kg', label: 'kg' },
        ],
        value: unit,
        onChange: async (next) => {
          const r = await saveWeightUnit(db, next);
          if (!r.ok) return showToast(r.errors[0]);
          showToast(`Weight unit: ${next}. Increment set to ${r.increment} ${next}.`);
          await refresh();
        },
      }),
      'Used for bodyweight and for exercises you add from now on. Exercises already in your program and past workouts keep their own unit.',
    ),
    h('p', { class: 'muted small' }, 'When you reach the top of your rep range on every set, Fit Fully suggests adding this much weight. Your program only changes when you commit.'),
    h(
      'div',
      { class: 'increment-presets' },
      ...(INCREMENT_PRESETS[unit] ?? INCREMENT_PRESETS.lbs).map((p) =>
        h('button', { class: 'chip-btn', type: 'button', 'aria-pressed': String(p === increment), onClick: () => saveIncrement(p) }, `${p} ${unit}`),
      ),
    ),
    field('Custom increment', stepper({ label: 'Weight increment', value: increment, min: 0.25, max: MAX_INCREMENT, step: 0.25, unit, onChange: saveIncrement })),
  );
}

// ---- About ----------------------------------------------------------------------

function aboutPanel() {
  return h(
    'section',
    { class: 'panel', 'aria-labelledby': 'about-heading' },
    h('h2', { class: 'section-title', id: 'about-heading' }, 'About Fit Fully'),
    h('p', { class: 'muted' }, 'Be faithful to the routine. Be faithful to the goal. Become.'),
    h('dl', { class: 'facts' }, fact('Version', APP_VERSION), fact('Your data', 'Stored on this device only')),
  );
}

export async function renderProfile(root, { db }) {
  async function draw() {
    const data = { ...(await loadProfile(db)), db };
    root.replaceChildren(
      h('h1', { class: 'screen-title' }, 'Profile'),
      bodyweightPanel(data, draw),
      heightPanel(data, draw),
      bmiPanel(data),
      unitsPanel(data, draw),
      aboutPanel(),
    );
  }
  await draw();
}

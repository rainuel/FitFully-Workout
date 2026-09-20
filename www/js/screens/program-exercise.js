import { h } from '../utils/dom.js';
import { formatRest, formatWeight } from '../utils/format.js';
import { weekdayName } from '../utils/dates.js';
import { getProgramDefaults, loadProgramExercise, removeProgramExercise, saveProgramExercise } from '../services/program-service.js';
import {
  LIMITS,
  convertWeight,
  isUniformSets,
  stepForUnit,
  suggestWarmup,
  summarizeProgramExercise,
} from '../services/program-rules.js';
import { screenHeader } from '../components/screen-header.js';
import { panel } from '../components/panel.js';
import { field, segmented, stepper, toggle } from '../components/controls.js';
import { icon } from '../components/icons.js';
import { confirmDialog, confirmDiscard } from '../components/modal.js';
import { showToast } from '../components/toast.js';

const REST_PRESETS = [30, 60, 90, 120, 180];

/**
 * Edit the plan for one exercise on one day: sets, rep target, weight, unit,
 * rest, and warm-up sets. The form works on a local draft and only writes to
 * the database when Save is pressed. Saving changes the PROGRAM only.
 */
export async function renderProgramExercise(root, { db, params, navigate }) {
  const id = Number(params.id);
  const pe = Number.isInteger(id) ? await loadProgramExercise(db, id) : null;
  if (!pe) {
    root.append(
      screenHeader({ title: 'Exercise not found', backHref: '#/program', backLabel: 'Program' }),
      h('p', { class: 'muted' }, 'This exercise is no longer in your program.'),
    );
    return;
  }
  const defaults = await getProgramDefaults(db);

  const draft = {
    workingWeight: pe.workingWeight,
    weightUnit: pe.weightUnit,
    restSeconds: pe.restSeconds,
    notes: pe.notes ?? '',
    workingSets: pe.workingSets.length > 0 ? pe.workingSets.map((s) => ({ ...s })) : [{ min: 8, max: 12 }],
    warmupSets: pe.warmupSets.map((s) => ({ ...s })),
  };
  // Presentation state, derived from the data on load.
  const ui = {
    perSet: !isUniformSets(draft.workingSets),
    repMode: draft.workingSets.every((s) => s.min === s.max) ? 'exact' : 'range',
  };

  const snapshot = () => JSON.stringify(draft);
  const initial = snapshot();
  const isDirty = () => snapshot() !== initial;
  const step = () => stepForUnit(draft.weightUnit, defaults);

  const form = h('div', { class: 'stack' });
  const errorBox = h('div', { class: 'notice notice--error', role: 'alert', hidden: true });
  const saveButton = h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: save }, 'Save');

  // ---- Draft changes -------------------------------------------------------

  function setCount(count) {
    const sets = draft.workingSets;
    if (count > sets.length) {
      const last = sets[sets.length - 1];
      while (sets.length < count) sets.push({ ...last });
    } else {
      sets.length = count;
    }
    paint();
  }

  function setRepMode(mode) {
    ui.repMode = mode;
    draft.workingSets = draft.workingSets.map((s) =>
      mode === 'exact' ? { min: s.min, max: s.min } : { min: s.min, max: s.min === s.max ? Math.min(LIMITS.maxReps, s.min + 4) : s.max },
    );
    paint();
  }

  function setPerSet(on) {
    ui.perSet = on;
    if (!on) {
      const first = draft.workingSets[0];
      draft.workingSets = draft.workingSets.map(() => ({ ...first }));
    }
    paint();
  }

  function setUnit(unit) {
    const from = draft.weightUnit;
    draft.workingWeight = convertWeight(draft.workingWeight, from, unit);
    draft.warmupSets = draft.warmupSets.map((s) => ({ ...s, weight: convertWeight(s.weight, from, unit) }));
    draft.weightUnit = unit;
    paint();
  }

  function addWarmup() {
    const next = suggestWarmup(draft.workingWeight, draft.warmupSets.length, step());
    draft.warmupSets.push(next);
    paint();
  }

  // ---- Sections ------------------------------------------------------------

  function summaryCard() {
    const s = summarizeProgramExercise({ ...draft, workingSets: draft.workingSets, warmupSets: draft.warmupSets });
    return h(
      'section',
      { class: 'summary-card', 'aria-label': 'Plan summary' },
      h('p', { class: 'summary-card__target' }, s.target),
      h('p', { class: 'summary-card__weight' }, s.weight),
      h('p', { class: 'muted small' }, [s.rest, s.warmups].filter(Boolean).join(' · ')),
    );
  }

  /** Rep inputs for one set: one field for exact reps, two for a range. */
  function repFields(set, apply, compact = false) {
    if (ui.repMode === 'exact') {
      return field('Reps', stepper({ label: 'Reps', value: set.min, min: LIMITS.minReps, max: LIMITS.maxReps, compact, onChange: (v) => apply({ min: v, max: v }) }));
    }
    return h(
      'div',
      { class: 'field-row' },
      field('From', stepper({ label: 'Minimum reps', value: set.min, min: LIMITS.minReps, max: LIMITS.maxReps, compact, onChange: (v) => apply({ min: v, max: Math.max(set.max, v) }) })),
      field('To', stepper({ label: 'Maximum reps', value: set.max, min: LIMITS.minReps, max: LIMITS.maxReps, compact, onChange: (v) => apply({ min: Math.min(set.min, v), max: v }) })),
    );
  }

  function setsPanel() {
    const shared = draft.workingSets[0];
    return panel(
      'Working sets',
      field('Sets', stepper({ label: 'Number of sets', value: draft.workingSets.length, min: 1, max: LIMITS.maxWorkingSets, onChange: setCount })),
      field(
        'Rep target',
        segmented({
          label: 'Rep target type',
          options: [
            { value: 'range', label: 'Range' },
            { value: 'exact', label: 'Exact reps' },
          ],
          value: ui.repMode,
          onChange: setRepMode,
        }),
      ),
      ui.perSet
        ? h(
            'ol',
            { class: 'set-rows' },
            ...draft.workingSets.map((set, i) =>
              h(
                'li',
                { class: `set-row${ui.repMode === 'exact' ? ' set-row--inline' : ''}` },
                h('span', { class: 'set-row__label' }, `Set ${i + 1}`),
                repFields(
                  set,
                  (next) => {
                    draft.workingSets[i] = next;
                    paint();
                  },
                  true,
                ),
              ),
            ),
          )
        : repFields(shared, (next) => {
            draft.workingSets = draft.workingSets.map(() => ({ ...next }));
            paint();
          }),
      toggle({ label: 'Different reps for each set', description: 'For example 12, 10, then 8.', checked: ui.perSet, onChange: setPerSet }),
    );
  }

  function weightPanel() {
    return panel(
      'Weight',
      field(
        'Unit',
        segmented({
          label: 'Weight unit',
          options: [
            { value: 'lbs', label: 'lbs' },
            { value: 'kg', label: 'kg' },
          ],
          value: draft.weightUnit,
          onChange: setUnit,
        }),
      ),
      field(
        'Working weight',
        stepper({
          label: 'Working weight',
          value: draft.workingWeight,
          min: 0,
          max: LIMITS.maxWeight,
          step: step(),
          unit: draft.weightUnit,
          format: formatWeight,
          onChange: (v) => {
            draft.workingWeight = v;
            paint();
          },
        }),
        'Your planned weight for future workouts. Past workouts are never changed. Use 0 for bodyweight.',
      ),
    );
  }

  function restPanel() {
    return panel(
      'Rest between sets',
      field(
        'Rest time',
        stepper({
          label: 'Rest time',
          value: draft.restSeconds,
          min: LIMITS.minRestSeconds,
          max: LIMITS.maxRestSeconds,
          step: LIMITS.restStepSeconds,
          unit: 'min',
          format: formatRest,
          editable: false,
          onChange: (v) => {
            draft.restSeconds = v;
            paint();
          },
        }),
      ),
      h(
        'div',
        { class: 'chip-scroll', role: 'group', 'aria-label': 'Common rest times' },
        ...REST_PRESETS.map((seconds) =>
          h(
            'button',
            {
              class: 'chip-btn',
              type: 'button',
              'aria-pressed': String(draft.restSeconds === seconds),
              onClick: () => {
                draft.restSeconds = seconds;
                paint();
              },
            },
            formatRest(seconds),
          ),
        ),
      ),
    );
  }

  function warmupPanel() {
    const atMax = draft.warmupSets.length >= LIMITS.maxWarmupSets;
    return panel(
      'Warm-up sets',
      h('p', { class: 'muted small' }, 'Lighter sets before your working sets. They are shown separately when you train.'),
      draft.warmupSets.length === 0
        ? h('p', { class: 'muted' }, 'No warm-up sets.')
        : h(
            'ol',
            { class: 'set-rows' },
            ...draft.warmupSets.map((set, i) =>
              h(
                'li',
                { class: 'set-row set-row--warmup' },
                h(
                  'div',
                  { class: 'set-row__head' },
                  h('span', { class: 'set-row__label' }, h('span', { class: 'tag tag--warmup' }, 'Warm-up'), ` ${i + 1}`),
                  h(
                    'button',
                    {
                      class: 'icon-btn',
                      type: 'button',
                      'aria-label': `Remove warm-up ${i + 1}`,
                      onClick: () => {
                        draft.warmupSets.splice(i, 1);
                        paint();
                      },
                    },
                    icon('close'),
                  ),
                ),
                h(
                  'div',
                  { class: 'field-row' },
                  field(
                    `Weight (${draft.weightUnit})`,
                    stepper({
                      label: `Warm-up ${i + 1} weight`,
                      value: set.weight,
                      min: 0,
                      max: LIMITS.maxWeight,
                      step: step(),
                      format: formatWeight,
                      compact: true,
                      onChange: (v) => {
                        set.weight = v;
                        paint();
                      },
                    }),
                  ),
                  field(
                    'Reps',
                    stepper({
                      label: `Warm-up ${i + 1} reps`,
                      value: set.reps,
                      min: LIMITS.minReps,
                      max: LIMITS.maxReps,
                      compact: true,
                      onChange: (v) => {
                        set.reps = v;
                        paint();
                      },
                    }),
                  ),
                ),
              ),
            ),
          ),
      h('button', { class: 'btn btn--secondary btn--block', type: 'button', disabled: atMax, onClick: addWarmup }, icon('plus', { strokeWidth: 2.5 }), atMax ? 'Warm-up limit reached' : 'Add warm-up set'),
    );
  }

  function notesPanel() {
    return panel(
      null,
      h(
        'label',
        { class: 'field', for: 'pe-notes' },
        h('span', { class: 'field__label' }, 'Notes (optional)'),
        h('textarea', { class: 'input input--area', id: 'pe-notes', rows: 3, maxlength: LIMITS.maxNotesLength, placeholder: 'Cues, seat height, grip…', onInput: (e) => (draft.notes = e.target.value) }, draft.notes),
      ),
    );
  }

  function guidePanel() {
    if (!pe.instructions) return null;
    return h(
      'details',
      { class: 'panel details' },
      h('summary', null, 'How to do it'),
      h('p', { class: 'details__text' }, pe.instructions),
      h('a', { class: 'details__link', href: `#/program/library/${pe.exerciseId}` }, 'Edit in library'),
    );
  }

      function paint() {
        form.replaceChildren(
          ...[summaryCard(), setsPanel(), weightPanel(), restPanel(), warmupPanel(), notesPanel(), guidePanel()].filter(Boolean),
        );
      }

  // ---- Actions -------------------------------------------------------------

  const dayHref = `/program/day/${pe.weekday}`;

  async function save() {
    saveButton.disabled = true;
    errorBox.hidden = true;
    try {
      const result = await saveProgramExercise(db, id, draft);
      if (!result.ok) {
        errorBox.replaceChildren(...result.errors.map((e) => h('p', null, e)));
        errorBox.hidden = false;
        return;
      }
      showToast('Saved');
      navigate(dayHref);
    } catch (err) {
      console.error('Save program exercise failed', err);
      errorBox.replaceChildren(h('p', null, `Couldn’t save. ${err?.message ?? err}`));
      errorBox.hidden = false;
    } finally {
      saveButton.disabled = false;
    }
  }

  async function remove() {
    const ok = await confirmDialog({
      title: `Remove ${pe.name}?`,
      body: `It will be removed from ${pe.dayName}. Workouts you’ve already logged are not affected.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    await removeProgramExercise(db, id);
    showToast('Exercise removed');
    navigate(dayHref);
  }

  root.append(
    screenHeader({
      eyebrow: weekdayName(pe.weekday),
      title: pe.name,
      backHref: `#${dayHref}`,
      backLabel: pe.dayName,
      onBack: async (href) => {
        if (!isDirty() || (await confirmDiscard())) navigate(href.replace(/^#/, ''));
      },
    }),
    form,
    h('button', { class: 'btn btn--danger-outline btn--block', type: 'button', onClick: remove }, 'Remove from this day'),
    h('div', { class: 'save-bar' }, errorBox, saveButton),
  );
  paint();
}

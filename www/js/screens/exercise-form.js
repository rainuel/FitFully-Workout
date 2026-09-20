import { h } from '../utils/dom.js';
import { loadExercise, removeExercise, saveExercise, EXERCISE_LIMITS, MUSCLE_GROUPS } from '../services/exercise-service.js';
import { addExerciseToDay, loadDayEditor } from '../services/program-service.js';
import { screenHeader } from '../components/screen-header.js';
import { panel } from '../components/panel.js';
import { confirmDialog, confirmDiscard } from '../components/modal.js';
import { showToast } from '../components/toast.js';

/**
 * One screen, three uses:
 *   /program/library/new              create an exercise
 *   /program/library/:id              edit an exercise
 *   /program/day/:weekday/new         create an exercise and add it to that day
 */
export async function renderExerciseForm(root, { db, params, navigate }) {
  const editingId = params.id !== undefined ? Number(params.id) : null;
  const weekday = params.weekday !== undefined ? Number(params.weekday) : null;

  let existing = null;
  if (editingId !== null) {
    existing = Number.isInteger(editingId) ? await loadExercise(db, editingId) : null;
    if (!existing) {
      root.append(
        screenHeader({ title: 'Exercise not found', backHref: '#/program/library', backLabel: 'Library' }),
        h('p', { class: 'muted' }, 'That exercise isn’t in your library.'),
      );
      return;
    }
  }

  const backHref = weekday !== null ? `#/program/day/${weekday}/add` : '#/program/library';
  const draft = {
    name: existing?.name ?? '',
    muscleGroup: existing?.muscleGroup ?? 'Chest',
    instructions: existing?.instructions ?? '',
    notes: existing?.notes ?? '',
  };
  const initial = JSON.stringify(draft);
  const isDirty = () => JSON.stringify(draft) !== initial;

  const errorBox = h('div', { class: 'notice notice--error', role: 'alert', hidden: true });
  const showErrors = (errors) => {
    errorBox.replaceChildren(...errors.map((e) => h('p', null, e)));
    errorBox.hidden = false;
  };

  const groups = MUSCLE_GROUPS.includes(draft.muscleGroup) ? MUSCLE_GROUPS : [...MUSCLE_GROUPS, draft.muscleGroup];
  const select = h(
    'select',
    { class: 'input', id: 'ex-muscle', onChange: (e) => (draft.muscleGroup = e.target.value) },
    ...groups.map((g) => h('option', { value: g, selected: g === draft.muscleGroup }, g)),
  );

  const saveButton = h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: save }, existing ? 'Save changes' : weekday !== null ? 'Create and add' : 'Create exercise');

  async function save() {
    saveButton.disabled = true;
    errorBox.hidden = true;
    try {
      const result = await saveExercise(db, editingId, draft);
      if (!result.ok) return showErrors(result.errors);

      if (weekday !== null) {
        const data = await loadDayEditor(db, weekday);
        const added = await addExerciseToDay(db, data.day.id, result.id);
        if (!added.ok) return showErrors(added.errors);
        showToast('Exercise created and added');
        navigate(`/program/edit/${added.id}`);
        return;
      }
      showToast(existing ? 'Exercise saved' : 'Exercise created');
      navigate('/program/library');
    } catch (err) {
      console.error('Save exercise failed', err);
      showErrors([`Couldn’t save. ${err?.message ?? err}`]);
    } finally {
      saveButton.disabled = false;
    }
  }

  async function remove() {
    const ok = await confirmDialog({
      title: `Delete ${existing.name}?`,
      body: 'If your program uses it, it is hidden from the library but stays in your program. Past workouts always keep their record of it.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const result = await removeExercise(db, existing.id);
    if (!result.ok) return showErrors(result.errors);
    showToast(result.outcome === 'archived' ? 'Hidden from the library' : 'Exercise deleted');
    navigate('/program/library');
  }

  const text = (id, label, prop, { rows = 0, max }) =>
    h(
      'label',
      { class: 'field', for: id },
      h('span', { class: 'field__label' }, label),
      rows
        ? h('textarea', { class: 'input input--area', id, rows, maxlength: max, onInput: (e) => (draft[prop] = e.target.value) }, draft[prop])
        : h('input', { class: 'input', id, type: 'text', maxlength: max, autocomplete: 'off', value: draft[prop], onInput: (e) => (draft[prop] = e.target.value) }),
    );

  root.append(
    screenHeader({
      eyebrow: weekday !== null ? 'New exercise for this day' : existing ? 'Exercise library' : 'Exercise library',
      title: existing ? existing.name : 'New exercise',
      backHref: backHref,
      backLabel: weekday !== null ? 'Choose exercise' : 'Library',
      onBack: async (href) => {
        if (!isDirty() || (await confirmDiscard())) navigate(href.replace(/^#/, ''));
      },
    }),
    existing && !existing.isCustom ? h('p', { class: 'muted small' }, 'Built-in exercise. You can edit its details.') : null,
    panel(
      null,
      text('ex-name', 'Name', 'name', { max: EXERCISE_LIMITS.name }),
      h('label', { class: 'field', for: 'ex-muscle' }, h('span', { class: 'field__label' }, 'Muscle group'), select),
      text('ex-instructions', 'Instructions', 'instructions', { rows: 6, max: EXERCISE_LIMITS.instructions }),
      text('ex-notes', 'Notes (optional)', 'notes', { rows: 3, max: EXERCISE_LIMITS.notes }),
    ),
    existing?.isCustom ? h('button', { class: 'btn btn--danger-outline btn--block', type: 'button', onClick: remove }, 'Delete exercise') : null,
    h('div', { class: 'save-bar' }, errorBox, saveButton),
  );
}

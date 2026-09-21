import { h } from '../utils/dom.js';
import { formatShortDate } from '../utils/dates.js';
import { addSet, completeSet, loadExerciseScreen, removeSet, saveSetValues, uncompleteSet } from '../services/workout-service.js';
import { stepForUnit } from '../services/program-rules.js';
import { formatLoggedSet, setProgress } from '../services/workout-rules.js';
import { commitProgression, commitWorkingWeight, getCommitOffer, keepWeight } from '../services/progression-service.js';
import { formatWeightWithUnit } from '../utils/format.js';
import { confirmDialog } from '../components/modal.js';
import { progressionCard } from '../components/progression-card.js';
import { screenHeader } from '../components/screen-header.js';
import { icon } from '../components/icons.js';
import { announceAchievements } from '../components/achievement-toast.js';
import { setRow } from '../components/set-row.js';
import { showToast } from '../components/toast.js';
import { createWorkoutWidgets } from '../components/workout-widgets.js';

/**
 * One exercise of the workout in progress: what you did last time, warm-up
 * sets, working sets. Every change is saved as it happens.
 * Route: /workout/exercise/:id  (id = the workout's own exercise row, not the plan's).
 */
export async function renderWorkoutExercise(root, { db, params, navigate }) {
  const id = Number(params.id);
  let data = Number.isInteger(id) ? await loadExerciseScreen(db, id) : null;
  if (!data) {
    root.append(
      screenHeader({ title: 'Exercise not found', backHref: '#/workout', backLabel: 'Workout' }),
      h('p', { class: 'muted' }, 'That exercise isn’t part of a workout.'),
    );
    return;
  }

  let widgets = null;
  let offer = null;
  const stopWidgets = () => {
    widgets?.destroy();
    widgets = null;
  };

  async function refresh() {
    data = await loadExerciseScreen(db, id);
    if (!data) return navigate('/workout');
    offer = await getCommitOffer(db, id);
    paint();
  }

  async function act(action) {
    try {
      const result = await action();
      if (result && result.ok === false) showToast(result.errors[0]);
      return result;
    } catch (err) {
      console.error('Workout action failed', err);
      showToast('Something went wrong. Try again.');
      return null;
    }
  }

  // ---- Sections --------------------------------------------------------------

  function previousCard() {
    if (!data.previous) {
      return h('p', { class: 'prev-card prev-card--empty' }, 'First time logging this one. Nothing to compare with yet.');
    }
    return h(
      'section',
      { class: 'prev-card', 'aria-label': 'Previous workout' },
      h('p', { class: 'prev-card__title' }, `Last time · ${formatShortDate(data.previous.date)}`),
      h('ul', { class: 'prev-card__sets' }, ...data.previous.sets.map((s) => h('li', null, formatLoggedSet(s)))),
    );
  }

  function setsSection(kind, { canEdit }) {
    const { exercise, previous, defaults } = data;
    const sets = exercise.sets.filter((s) => s.kind === kind);
    if (sets.length === 0) return null;
    const step = stepForUnit(exercise.unit, defaults);
    const workingCount = exercise.sets.filter((s) => s.kind === 'working').length;

    const rows = sets.map((set, i) =>
      setRow({
        set,
        label: String(i + 1),
        step,
        previousSet: kind === 'working' ? (previous?.sets[i] ?? null) : null,
        removable: canEdit && (kind === 'warmup' || workingCount > 1),
        onSave: (values) => act(() => saveSetValues(db, set.id, values)),
        onRemove: async () => {
          const result = await act(() => removeSet(db, set.id));
          if (result?.ok) await refresh();
        },
        onToggle: async (values, wantDone) => {
          const result = await act(() => (wantDone ? completeSet(db, set.id, values) : uncompleteSet(db, set.id)));
          if (!result?.ok) return;
          await refresh();
          if (wantDone && result.workoutComplete) showToast('All sets done. Finish your workout when you’re ready.');
          else if (wantDone && result.breakSeconds > 0) showToast(`Exercise complete. Take a ${result.breakSeconds / 60} min break before the next one.`);
          else if (wantDone && result.exerciseCompleted) showToast('Exercise complete');
        },
      }),
    );

    const { done, total } = setProgress(exercise);
    return h(
      'section',
      { class: 'stack', 'aria-label': kind === 'warmup' ? 'Warm-up sets' : 'Working sets' },
      h('h2', { class: 'section-title' }, kind === 'warmup' ? 'Warm-up' : `Working sets · ${done}/${total}`),
      h('ul', { class: 'log-sets' }, ...rows),
    );
  }

  function progressionSection() {
    const { exercise, progression } = data;
    if (exercise.status !== 'completed' && progression.state !== 'kept' && progression.state !== 'committed') return null;
    return progressionCard({
      name: exercise.name,
      progression,
      onKeep: async () => {
        const r = await act(() => keepWeight(db, id));
        if (r?.ok) await refresh();
      },
      onCommit: async () => {
        const r = await act(() => commitProgression(db, id));
        if (r?.ok) {
          await announceAchievements(db, `Working weight is now ${formatWeightWithUnit(r.to, r.unit)}`);
          await refresh();
        }
      },
    });
  }

  // Logging a different weight is history only. Changing the program takes this explicit action.
  function commitOfferSection() {
    if (!offer || data.progression.state === 'eligible') return null;
    const label = formatWeightWithUnit(offer.weight, offer.unit);
    return h(
      'section',
      { class: 'commit-offer', 'aria-label': 'Working weight' },
      h('p', { class: 'muted' }, `Program working weight: ${formatWeightWithUnit(offer.currentWeight, offer.unit)}. You lifted ${label}. Your program stays as it is unless you commit.`),
      h(
        'button',
        {
          class: 'btn btn--secondary btn--block',
          type: 'button',
          onClick: async () => {
            const ok = await confirmDialog({
              title: `Commit ${label}?`,
              body: `${data.exercise.name} will use ${label} in your program from now on. Past workouts are not changed.`,
              confirmLabel: 'Commit',
            });
            if (!ok) return;
            const r = await act(() => commitWorkingWeight(db, id, offer.weight));
            if (r?.ok) {
              await announceAchievements(db, 'Working weight updated');
              await refresh();
            }
          },
        },
        `Commit ${label} as new working weight`,
      ),
    );
  }

  function navRow() {
    const { previousExerciseId, nextExerciseId, exercise } = data;
    const next = nextExerciseId
      ? h('a', { class: `btn ${exercise.status === 'completed' ? 'btn--primary' : 'btn--secondary'}`, href: `#/workout/exercise/${nextExerciseId}` }, 'Next exercise', icon('chevron'))
      : h('a', { class: `btn ${exercise.status === 'completed' ? 'btn--primary' : 'btn--secondary'}`, href: '#/workout' }, 'Back to workout');
    return h(
      'nav',
      { class: 'exercise-nav', 'aria-label': 'Exercises in this workout' },
      previousExerciseId
        ? h('a', { class: 'btn btn--secondary', href: `#/workout/exercise/${previousExerciseId}` }, icon('back'), 'Previous')
        : h('span'),
      next,
    );
  }

  // ---- Paint -----------------------------------------------------------------

  function paint() {
    stopWidgets();
    const { session, exercise, index, total, instructions } = data;
    const inProgress = session.status === 'in_progress';
    const paused = session.pausedAt !== null;
    const canEdit = inProgress && !paused;

    if (inProgress) widgets = createWorkoutWidgets({ db, session, onPauseChange: refresh });
    root.classList.toggle('screen--dock', inProgress);

    const content = [
      screenHeader({
        eyebrow: `Exercise ${index + 1} of ${total}`,
        title: exercise.name,
        backHref: '#/workout',
        backLabel: session.dayName,
      }),
      inProgress ? widgets.bar.element : h('p', { class: 'notice' }, 'This workout is finished, so its sets are read-only.'),
      paused ? h('p', { class: 'notice notice--paused', role: 'status' }, 'Paused. Resume to keep logging.') : null,
      previousCard(),
      h(
        'div',
        { class: `stack${canEdit ? '' : ' is-locked'}` },
        setsSection('warmup', { canEdit }),
        setsSection('working', { canEdit }),
        inProgress
          ? h(
              'button',
              {
                class: 'btn btn--secondary btn--block',
                type: 'button',
                onClick: async () => {
                  const result = await act(() => addSet(db, id));
                  if (result?.ok) await refresh();
                },
              },
              icon('plus', { strokeWidth: 2.5 }),
              'Add set',
            )
          : null,
      ),
      progressionSection(),
      commitOfferSection(),
      instructions
        ? h('details', { class: 'panel details' }, h('summary', null, 'How to do it'), h('p', { class: 'details__text' }, instructions))
        : null,
      navRow(),
      inProgress ? widgets.timer.element : null,
    ];
    root.replaceChildren(...content.filter(Boolean));
  }

  offer = await getCommitOffer(db, id);
  paint();
  return stopWidgets;
}
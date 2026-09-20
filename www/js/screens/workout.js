import { h, pluralize } from '../utils/dom.js';
import {
  discardWorkout,
  finishWorkout,
  loadWorkoutHome,
  startWorkout,
} from '../services/workout-service.js';
import { commitProgression, getSessionProgression, keepWeight } from '../services/progression-service.js';
import { loadStreaks } from '../services/streak-service.js';
import { describeTargets, formatDurationWords, setProgress, summarizeSession } from '../services/workout-rules.js';
import { summarizeSets } from '../services/program-rules.js';
import { formatWeightWithUnit } from '../utils/format.js';
import { plate } from '../components/plate.js';
import { announceAchievements } from '../components/achievement-toast.js';
import { restDayPanel } from '../components/rest-day.js';
import { icon } from '../components/icons.js';
import { confirmDialog } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { progressionCard } from '../components/progression-card.js';
import { createWorkoutWidgets } from '../components/workout-widgets.js';

export async function renderWorkout(root, { db }) {
  let widgets = null;
  const stopWidgets = () => {
    widgets?.destroy();
    widgets = null;
  };

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

  function todayCard(today, sub) {
    return h(
      'div',
      { class: 'today-card' },
      plate({ plateIndex: today.plateIndex, isToday: true, large: true }),
      h('div', null, h('h2', { class: 'today-card__name' }, today.name), h('p', { class: 'muted' }, sub)),
    );
  }

  function exerciseLink(ex) {
    const { done, total } = setProgress(ex);
    return h(
      'li',
      null,
      h(
        'a',
        { class: `ex-list__item${ex.status === 'completed' ? ' is-done' : ''}`, href: `#/workout/exercise/${ex.id}` },
        h('span', { class: 'ex-list__body' }, h('span', { class: 'ex-list__name' }, ex.name), h('span', { class: 'ex-list__meta' }, `${describeTargets(ex)} · ${formatWeightWithUnit(ex.targetWeight, ex.unit)}`)),
        h('span', { class: 'ex-list__meta' }, `${done}/${total}`),
        icon('chevron'),
      ),
    );
  }

  async function progressionSection(sessionId) {
    const items = await getSessionProgression(db, sessionId);
    if (items.length === 0) return null;
    return h(
      'section',
      { class: 'stack', 'aria-label': 'Progression' },
      h('h2', { class: 'section-title' }, 'Progression'),
      ...items
        .map(({ exercise, progression }) =>
          progressionCard({
            name: exercise.name,
            progression,
            onKeep: async () => {
              const r = await act(() => keepWeight(db, exercise.id));
              if (r?.ok) await paint();
            },
            onCommit: async () => {
              const r = await act(() => commitProgression(db, exercise.id));
              if (r?.ok) {
                await announceAchievements(db, `${exercise.name}: working weight is now ${formatWeightWithUnit(r.to, r.unit)}`);
                await paint();
              }
            },
          }),
        )
        .filter(Boolean),
    );
  }

  async function finish(session, exercises) {
    const done = exercises.filter((e) => e.status === 'completed').length;
    const early = done < exercises.length;
    const ok = await confirmDialog({
      title: early ? 'Finish workout early?' : 'Finish workout?',
      body: early
        ? `${done} / ${exercises.length} exercises completed. The rest won’t be marked done, and this still counts as a workout.`
        : 'Nice work. Every exercise is done.',
      confirmLabel: 'Finish',
    });
    if (!ok) return;
    const result = await act(() => finishWorkout(db, session.id));
    if (!result?.ok) return;
    if (result.discarded) showToast('No sets were logged, so nothing was saved.');
    else await announceAchievements(db);
    await paint();
  }

  async function discard(session) {
    const ok = await confirmDialog({
      title: 'Discard this workout?',
      body: 'Everything logged in it will be deleted. This can’t be undone.',
      confirmLabel: 'Discard',
      danger: true,
    });
    if (!ok) return;
    const result = await act(() => discardWorkout(db, session.id));
    if (result?.ok) await paint();
  }

  // Skips absent sections (null) instead of printing them as the word "null".
  const show = (...nodes) => root.replaceChildren(...nodes.filter(Boolean));

  async function paint() {
    stopWidgets();
    const data = await loadWorkoutHome(db);
    root.classList.toggle('screen--dock', data.kind === 'active');
    const title = h('h1', { class: 'screen-title' }, 'Workout');

    if (data.kind === 'rest') {
      show(
        title,
        h('div', { class: 'today-card' }, plate({ isRest: true, large: true }), h('div', null, h('h2', { class: 'today-card__name' }, 'Rest day'), h('p', { class: 'muted' }, 'No workout scheduled today.'))),
        restDayPanel(),
      );
      return;
    }

    if (data.kind === 'empty') {
      show(
        title,
        todayCard(data.today, 'No exercises in this day yet.'),
        h('a', { class: 'btn btn--primary btn--block', href: `#/program/day/${data.today.weekday}` }, 'Add exercises'),
      );
      return;
    }

    if (data.kind === 'ready') {
      show(
        title,
        todayCard(data.today, pluralize(data.plan.length, 'exercise')),
        h(
          'ul',
          { class: 'ex-list' },
          ...data.plan.map((pe) =>
            h('li', null, h('div', { class: 'ex-list__item' }, h('span', { class: 'ex-list__body' }, h('span', { class: 'ex-list__name' }, pe.name), h('span', { class: 'ex-list__meta' }, `${summarizeSets(pe.workingSets)} · ${formatWeightWithUnit(pe.workingWeight, pe.weightUnit)}`)))),
          ),
        ),
        h(
          'button',
          {
            class: 'btn btn--primary btn--block',
            type: 'button',
            onClick: async () => {
              const r = await act(() => startWorkout(db));
              if (r?.ok) await paint();
            },
          },
          'Start workout',
        ),
      );
      return;
    }

    if (data.kind === 'done') {
      const summary = summarizeSession(data.session, data.exercises, Date.now());
      const streaks = await loadStreaks(db);
      show(
        title,
        h(
          'section',
          { class: 'panel' },
          h('h2', { class: 'section-title' }, `${data.session.dayName} · done`),
          h('p', null, 'You showed up today. Another workout in the books.'),
          h('p', { class: 'muted' }, `${summary.exercisesDone} / ${summary.exercisesPlanned} exercises completed · ${pluralize(summary.workingSets, 'set')} · ${formatDurationWords(summary.durationMs)}`),
          streaks.current > 0 ? h('p', { class: 'streak-line' }, icon('flame'), `${streaks.current} workout streak`) : null,
          h('a', { class: 'text-link', href: `#/progress/workout/${data.session.id}` }, 'View this workout in your history'),
        ),
        await progressionSection(data.session.id),
        h('ul', { class: 'ex-list' }, ...data.exercises.map(exerciseLink)),
      );
      return;
    }

    // active
    const { session, exercises } = data;
    widgets = createWorkoutWidgets({ db, session, onPauseChange: paint });
    show(
      title,
      widgets.bar.element,
      session.pausedAt !== null ? h('p', { class: 'notice notice--paused', role: 'status' }, 'Paused. Resume to keep logging.') : null,
      h('p', { class: 'muted' }, `${session.dayName} · ${exercises.filter((e) => e.status === 'completed').length} / ${exercises.length} exercises done`),
      h('ul', { class: 'ex-list' }, ...exercises.map(exerciseLink)),
      h(
        'div',
        { class: 'workout-actions' },
        h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: () => finish(session, exercises) }, 'Finish workout'),
        h('button', { class: 'btn btn--danger-outline btn--block', type: 'button', onClick: () => discard(session) }, 'Discard workout'),
      ),
      widgets.timer.element,
    );
  }

  await paint();
  return stopWidgets;
}

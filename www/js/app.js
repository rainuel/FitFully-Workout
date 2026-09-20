import { Capacitor } from '@capacitor/core';
import { openDatabase } from './db/database.js';
import { openBrowserDatabase } from './db/browser-database.js';
import { runMigrations } from './db/migrations.js';
import { seedIfNeeded } from './db/seed.js';
import { recordLaunch } from './models/settings.js';
import { createNativeNotifier } from './services/notification-adapter.js';
import { syncReminders, useNotifier } from './services/notification-service.js';
import { createRouter } from './router.js';
import { createBottomNav } from './components/bottom-nav.js';
import { h } from './utils/dom.js';
import { showToast } from './components/toast.js';
import {
  installBackButton,
  installErrorHandlers,
  installKeyboardHandling,
  installRoutePersistence,
  readRouteToRestore,
} from './services/lifecycle-service.js';

// Screens load on first visit, so the app opens with only the shell parsed.
const lazy = (load, name) => async (root, ctx) => (await load())[name](root, ctx);

const ROUTES = [
  { path: '/home', tab: 'home', render: lazy(() => import('./screens/home.js'), 'renderHome') },
  { path: '/workout', tab: 'workout', render: lazy(() => import('./screens/workout.js'), 'renderWorkout') },
  { path: '/workout/exercise/:id', tab: 'workout', render: lazy(() => import('./screens/workout-exercise.js'), 'renderWorkoutExercise') },
  { path: '/progress', tab: 'progress', render: lazy(() => import('./screens/progress.js'), 'renderProgress') },
  { path: '/progress/history', tab: 'progress', render: lazy(() => import('./screens/history.js'), 'renderHistory') },
  { path: '/progress/workout/:id', tab: 'progress', render: lazy(() => import('./screens/workout-detail.js'), 'renderWorkoutDetail') },
  { path: '/progress/exercise/:id', tab: 'progress', render: lazy(() => import('./screens/exercise-history.js'), 'renderExerciseHistory') },
  { path: '/program', tab: 'program', render: lazy(() => import('./screens/program.js'), 'renderProgram') },
  { path: '/program/day/:weekday', tab: 'program', render: lazy(() => import('./screens/program-day.js'), 'renderProgramDay') },
  { path: '/program/day/:weekday/add', tab: 'program', render: lazy(() => import('./screens/exercise-picker.js'), 'renderExercisePicker') },
  { path: '/program/day/:weekday/new', tab: 'program', render: lazy(() => import('./screens/exercise-form.js'), 'renderExerciseForm') },
  { path: '/program/edit/:id', tab: 'program', render: lazy(() => import('./screens/program-exercise.js'), 'renderProgramExercise') },
  { path: '/program/library', tab: 'program', render: lazy(() => import('./screens/library.js'), 'renderLibrary') },
  { path: '/program/library/new', tab: 'program', render: lazy(() => import('./screens/exercise-form.js'), 'renderExerciseForm') },
  { path: '/program/library/:id', tab: 'program', render: lazy(() => import('./screens/exercise-form.js'), 'renderExerciseForm') },
  { path: '/profile', tab: 'profile', render: lazy(() => import('./screens/profile.js'), 'renderProfile') },
];

const root = document.getElementById('app');

function showMessage({ title, body, detail, action }) {
  root.replaceChildren(
    h(
      'main',
      { class: 'message', role: 'alert' },
      h('h1', { class: 'message__title' }, title),
      h('p', null, body),
      detail ? h('pre', { class: 'message__detail' }, detail) : null,
      action ? h('button', { class: 'btn btn--primary', type: 'button', onClick: action.onClick }, action.label) : null,
    ),
  );
}

function mountShell(db) {
  const outlet = h('main', { class: 'outlet', id: 'outlet' });
  const nav = createBottomNav();
  root.replaceChildren(outlet, nav.element);

  // Cold start with no link: reopen the screen the app was on when it closed.
  if (!window.location.hash) {
    const restored = readRouteToRestore();
    if (restored) window.history.replaceState(null, '', `#${restored}`);
  }

  const router = createRouter({
    routes: ROUTES,
    outlet,
    context: { db },
    onRouteChange: (route) => nav.setActive(route.tab),
  });
  return router.start();
}

let remindersStarted = false;

// Keeps the phone's scheduled reminders in step with the settings and program.
// Runs after the screen is up so it never delays opening the app, and again
// whenever the app comes back to the foreground.
function startReminders(db) {
  if (remindersStarted) return;
  remindersStarted = true;
  useNotifier(createNativeNotifier());
  const sync = () => syncReminders(db).catch((err) => console.error('Reminder sync failed', err));
  sync();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sync();
  });
}

installErrorHandlers(showToast);
installKeyboardHandling();
installRoutePersistence();
installBackButton();

async function boot() {
  try {
    // Native Android uses Capacitor SQLite. The browser uses sql.js backed by
    // IndexedDB, so the same app can be developed and tested without an emulator.
    const db = Capacitor.isNativePlatform()
      ? await openDatabase()
      : await openBrowserDatabase();
    await runMigrations(db);
    await seedIfNeeded(db);
    await recordLaunch(db);
    await mountShell(db);
    startReminders(db);
  } catch (err) {
    console.error('Fit Fully failed to start', err);
    showMessage({
      title: 'Fit Fully couldn’t open its database',
      body: 'Your workout data stays on this device. Close the app and open it again. If this keeps happening, note the message below.',
      detail: String(err?.message ?? err),
      action: { label: 'Try again', onClick: boot },
    });
  }
}

boot();

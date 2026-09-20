// Pure rules for the Android back button, reopening where you left off, and
// detecting the on-screen keyboard. No DOM, no Capacitor: tested in Node.

export const TAB_ROOTS = ['/home', '/workout', '/progress', '/program', '/profile'];

// How long a saved screen is offered again after the app was closed.
export const RESTORE_MAX_AGE_MS = 3 * 60 * 60 * 1000;

const RESTORABLE = [
  /^\/(home|workout|progress|program|profile)$/,
  /^\/workout\/exercise\/[^/]+$/,
  /^\/progress\/history$/,
  /^\/progress\/(workout|exercise)\/[^/]+$/,
  /^\/program\/day\/[1-7]$/,
  /^\/program\/library$/,
];

/**
 * The screen to reopen for a saved path, or null. Editing screens (forms whose
 * unsaved draft is gone after a restart) reopen their parent list instead.
 */
export function restorableRoute(path) {
  if (typeof path !== 'string') return null;
  if (RESTORABLE.some((re) => re.test(path))) return path;
  const day = /^\/program\/day\/([1-7])\/(add|new)$/.exec(path);
  if (day) return `/program/day/${day[1]}`;
  if (/^\/program\/library\/.+/.test(path)) return '/program/library';
  if (/^\/program\/edit\/.+/.test(path)) return '/program';
  return null;
}

/** saved = { path, at } as stored on pause. Returns the path to open, or null. */
export function routeToRestore(saved, now) {
  if (!saved || typeof saved !== 'object' || typeof saved.at !== 'number') return null;
  const age = now - saved.at;
  if (age < 0 || age > RESTORE_MAX_AGE_MS) return null;
  return restorableRoute(saved.path);
}

/**
 * What the Android back button should do, in priority order:
 * close an open dialog, follow the screen's own back link (which also asks
 * about unsaved changes), return to Home from another tab, and only from Home
 * send the app to the background.
 */
export function decideBackAction({ dialogOpen, hasBackLink, path }) {
  if (dialogOpen) return 'close-dialog';
  if (hasBackLink) return 'back-link';
  if (path === '/home') return 'minimize';
  return 'go-home';
}

/** The keyboard is open when the window is much shorter than it has been. */
export function isKeyboardOpen(baselineHeight, currentHeight, threshold = 150) {
  return baselineHeight - currentHeight > threshold;
}

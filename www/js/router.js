// Minimal hash router. No framework.
//
// A route is { path, tab, render }. `path` may contain :params (used from
// Phase 2 on, e.g. '/program/day/:weekday'). `render(container, ctx)` fills the
// container and may return a cleanup function (clear timers/listeners); the
// router calls it before showing the next screen.

function compile(path) {
  const names = [];
  const pattern = path.replace(/:([A-Za-z0-9_]+)/g, (_, name) => {
    names.push(name);
    return '([^/]+)';
  });
  return { regex: new RegExp(`^${pattern}$`), names };
}

// Moves keyboard/screen-reader focus to the new screen's title so TalkBack
// announces where you are. preventScroll keeps the view at the top.
function focusTitle(screen) {
  const title = screen.querySelector('h1');
  if (!title) return;
  title.tabIndex = -1;
  title.focus({ preventScroll: true });
}

export function createRouter({ routes, outlet, context = {}, defaultPath = '/home', onRouteChange = () => {} }) {
  const compiled = routes.map((route) => ({ route, ...compile(route.path) }));
  let cleanup = null;
  let navigationId = 0;

  function currentPath() {
    return decodeURI(window.location.hash.replace(/^#/, '')) || defaultPath;
  }

  function match(path) {
    for (const entry of compiled) {
      const m = entry.regex.exec(path);
      if (m) {
        const params = {};
        entry.names.forEach((name, i) => (params[name] = decodeURIComponent(m[i + 1])));
        return { route: entry.route, params };
      }
    }
    return null;
  }

  async function runCleanup() {
    if (!cleanup) return;
    const fn = cleanup;
    cleanup = null;
    try {
      await fn();
    } catch (err) {
      console.error('Screen cleanup failed', err);
    }
  }

  async function handleRoute() {
    const path = currentPath();
    const found = match(path);
    if (!found) {
      window.location.replace(`#${defaultPath}`);
      return;
    }

    const id = ++navigationId;
    await runCleanup();
    if (id !== navigationId) return; // a newer navigation started meanwhile

    const screen = document.createElement('div');
    screen.className = 'screen';
    outlet.replaceChildren(screen);
    outlet.scrollTop = 0;
    onRouteChange(found.route, found.params);

    try {
      const result = await found.route.render(screen, { ...context, params: found.params, navigate });
      if (typeof result === 'function') {
        if (id === navigationId) cleanup = result;
        else result(); // screen was replaced while it was rendering
      }
      if (id === navigationId) focusTitle(screen);
    } catch (err) {
      console.error(`Screen "${found.route.path}" failed`, err);
      if (id === navigationId) {
        const box = document.createElement('div');
        box.className = 'notice notice--error';
        box.setAttribute('role', 'alert');
        box.textContent = `This screen could not load. ${err?.message ?? err}`;
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'btn btn--secondary';
        retry.textContent = 'Try again';
        retry.addEventListener('click', handleRoute);
        const wrap = document.createElement('div');
        wrap.className = 'screen-error';
        wrap.append(box, retry);
        screen.replaceChildren(wrap);
      }
    }
  }

  function navigate(path) {
    window.location.hash = path;
  }

  return {
    start() {
      // Normalise an empty URL to the default route without adding a history
      // entry (and without firing a second render).
      if (!window.location.hash) {
        window.history.replaceState(null, '', `#${defaultPath}`);
      }
      window.addEventListener('hashchange', handleRoute);
      return handleRoute();
    },
    navigate,
  };
}

import { h, pluralize } from '../utils/dom.js';
import { emptyState } from '../components/empty-state.js';
import { formatMonthYear } from '../utils/dates.js';
import { loadHistoryPage, PAGE_SIZE } from '../services/history-service.js';
import { screenHeader } from '../components/screen-header.js';
import { sessionList } from '../components/session-list.js';

/** Every finished workout, newest first, grouped by month. Route: /progress/history */
export async function renderHistory(root, { db }) {
  const list = h('div', { class: 'stack' });
  const more = h('button', { class: 'btn btn--secondary btn--block', type: 'button', hidden: true }, 'Show more');
  const count = h('p', { class: 'muted' });
  let offset = 0;
  let lastMonth = null;
  let busy = false;

  async function loadMore() {
    if (busy) return;
    busy = true;
    try {
      const page = await loadHistoryPage(db, { limit: PAGE_SIZE, offset });
      count.textContent = pluralize(page.total, 'workout');

      // A month's heading and list continue across pages, so group as we go.
      let run = [];
      const flush = () => {
        if (run.length > 0) list.append(sessionList(run));
        run = [];
      };
      for (const session of page.sessions) {
        const month = session.date.slice(0, 7);
        if (month !== lastMonth) {
          flush();
          list.append(h('h2', { class: 'group-title' }, formatMonthYear(session.date)));
          lastMonth = month;
        }
        run.push(session);
      }
      flush();

      offset += page.sessions.length;
      more.hidden = !page.hasMore;
    } finally {
      busy = false;
    }
  }

  root.append(
    screenHeader({ title: 'History', backHref: '#/progress', backLabel: 'Progress' }),
    count,
    list,
    more,
  );
  more.addEventListener('click', loadMore);
  await loadMore();

  if (offset === 0) {
    list.replaceChildren(emptyState({ title: 'No finished workouts yet', body: 'Finished workouts are listed here, newest first.', action: { href: '#/workout', label: 'Go to workout' } }));
  }
}

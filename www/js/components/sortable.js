// Drag-to-reorder for a vertical list, using pointer events so it works with a
// finger, a stylus, and a mouse. Only the grip handle starts a drag; the rest of
// the row still scrolls the page normally. Handles are also keyboard-operable
// (Arrow Up / Arrow Down) for accessibility.
//
//   makeSortable(listEl, { onReorder(ids), announce(text) })
//
// Rows are direct children of `listEl` with data-sort-id; the handle inside a
// row has data-sort-handle. `onReorder` receives the new id order (strings).

const ITEM = '[data-sort-id]';
const HANDLE = '[data-sort-handle]';
const EDGE_ZONE = 72; // px from the scroller's edge where auto-scroll kicks in

export function makeSortable(list, { onReorder, announce = () => {} }) {
  const rows = () => [...list.children].filter((el) => el.matches(ITEM));
  const order = () => rows().map((el) => el.dataset.sortId);
  const midY = (el) => {
    const r = el.getBoundingClientRect();
    return r.top + r.height / 2;
  };

  list.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest(HANDLE);
    if (!handle || !list.contains(handle)) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    startDrag(handle.closest(ITEM), handle, event);
  });

  list.addEventListener('keydown', (event) => {
    const handle = event.target.closest(HANDLE);
    if (!handle || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    const row = handle.closest(ITEM);
    const target = event.key === 'ArrowUp' ? row.previousElementSibling : row.nextElementSibling;
    if (!target) return;
    if (event.key === 'ArrowUp') list.insertBefore(row, target);
    else list.insertBefore(target, row);
    handle.focus();
    announce(`Moved to position ${rows().indexOf(row) + 1} of ${rows().length}`);
    onReorder(order());
  });

  function startDrag(row, handle, startEvent) {
    const before = order();
    const scroller = list.closest('.outlet');
    const grabOffset = startEvent.clientY - row.getBoundingClientRect().top;
    let pointerY = startEvent.clientY;
    let frame = 0;
    let active = true;

    row.classList.add('is-dragging');
    list.classList.add('is-sorting');
    handle.setPointerCapture(startEvent.pointerId);

    // Keep the row under the finger, and swap it with a neighbour once its
    // centre passes that neighbour's centre. Positions are re-measured after
    // every swap because the row's natural position changes.
    function update() {
      for (let guard = 0; guard <= rows().length; guard++) {
        row.style.transform = '';
        const natural = row.getBoundingClientRect();
        const wantedTop = pointerY - grabOffset;
        const centre = wantedTop + natural.height / 2;
        const previous = row.previousElementSibling;
        const next = row.nextElementSibling;
        if (previous && centre < midY(previous)) {
          list.insertBefore(row, previous);
          continue;
        }
        if (next && centre > midY(next)) {
          list.insertBefore(next, row);
          continue;
        }
        row.style.transform = `translateY(${wantedTop - natural.top}px)`;
        return;
      }
    }

    function autoScroll() {
      if (!active) return;
      if (scroller) {
        const box = scroller.getBoundingClientRect();
        let delta = 0;
        if (pointerY < box.top + EDGE_ZONE) delta = -Math.ceil((box.top + EDGE_ZONE - pointerY) / 5);
        else if (pointerY > box.bottom - EDGE_ZONE) delta = Math.ceil((pointerY - (box.bottom - EDGE_ZONE)) / 5);
        if (delta !== 0) {
          scroller.scrollTop += delta;
          update();
        }
      }
      frame = requestAnimationFrame(autoScroll);
    }

    // Listen on the document for this pointer only. Moving the row in the DOM
    // can release pointer capture, so we must not depend on the handle receiving events.
    function onMove(event) {
      if (event.pointerId !== startEvent.pointerId) return;
      pointerY = event.clientY;
      update();
    }

    function onEnd(event) {
      if (event.pointerId === startEvent.pointerId) finish();
    }

    function finish() {
      if (!active) return;
      active = false;
      cancelAnimationFrame(frame);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onEnd);
      document.removeEventListener('pointercancel', onEnd);
      row.style.transform = '';
      row.classList.remove('is-dragging');
      list.classList.remove('is-sorting');
      const after = order();
      if (after.join() !== before.join()) {
        announce(`Moved to position ${after.indexOf(row.dataset.sortId) + 1} of ${after.length}`);
        onReorder(after);
      }
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onEnd);
    document.addEventListener('pointercancel', onEnd);
    frame = requestAnimationFrame(autoScroll);
    update();
  }
}

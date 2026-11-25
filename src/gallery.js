/** @type {[number, string, string][]} */
export const photographs = [
  [8, 'The market street', 'A tree-lined retail street opens onto the courtyard in the evening light.'],
  [10, 'Courtyard from above', 'An elevated view shows the shaded arcades and the internal driveway around the courtyard.'],
  [12, 'The central plaza', 'A compass mosaic fills the plaza between trees and two levels of shops.'],
  [1, 'The courtyard pavilion', 'A two-storey pavilion stands beyond a sunburst mosaic in the central courtyard.'],
  [3, 'Along the arcade', 'Shoppers walk between curved stretches of covered shopfronts.'],
  [2, 'Through the gallery', 'Glass shopfronts open onto a sheltered passage through the retail galleries.'],
  [6, 'At the corner', 'A rounded corner building faces the internal drive and a row of trees.'],
  [5, 'Street entrance', 'The central building divides two routes leading into the shopping galleries.'],
  [7, 'Street-facing shops', 'Two storeys of shops line the drive beside an open stair to the upper floor.'],
  [9, 'The internal driveway', 'An aerial view follows the curved driveway toward the plaza.'],
  [11, 'The plaza mosaic', 'The compass design in the paving sits at the heart of the courtyard.'],
  [13, 'Courtyard and arcades', 'An oblique aerial view links the market entrance to the tree-lined central court.'],
  [14, 'The market approach', 'The entrance drive leads between the long white façades of the market.'],
  [15, 'Overhead view', 'A top-down architectural render traces the building outlines and open spaces.'],
  [16, 'The retail wings', 'An aerial view shows the curved shopping galleries framing the open plaza.'],
  [17, 'The full site', 'The two-storey market and its landscaped open spaces are seen from above.']
];

/** @type {[number, string, string, number][]} */
export const chapters = [
  [0, 'The approach', 'Arrive above the market and follow the internal drive.', 14],
  [8, 'Shopfronts & arcades', 'Explore the street-facing shops and covered walkways.', 7],
  [16, 'The courtyard', 'Step into the central plaza and its open-air galleries.', 12],
  [24, 'Above the market', 'See how the retail wings fit together from above.', 10]
];

/** @param {number} id */
export const renderPath = (id, small = false) =>
  '/media/render-' + String(id).padStart(2, '0') + (small ? '-small' : '') + '.webp';

const symbols = {
  previous: '<path d="m14.5 5.5-6.5 6.5 6.5 6.5"/>',
  next: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
};
function icon(name) {
  return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + symbols[name] + '</svg>';
}

/**
 * @param {HTMLElement} container
 * @param {number} start
 * @param {HTMLElement} trigger
 */
export function openPhotograph(container, start, trigger) {
  const dialog = document.createElement('dialog');
  dialog.className = 'nb-media-lightbox';
  dialog.setAttribute('aria-label', 'Architectural render viewer');
  dialog.innerHTML = `
    <div class="nb-lightbox-content">
      <div class="nb-lightbox-top">
        <span data-count></span>
        <button type="button" data-close aria-label="Close viewer" autofocus>${icon('close')}</button>
      </div>
      <div class="nb-lightbox-frame"><img alt=""></div>
      <div class="nb-lightbox-controls">
        <strong data-title aria-live="polite" aria-atomic="true"></strong>
        <div class="nb-lightbox-paging">
          <button type="button" data-previous aria-label="Previous render">${icon('previous')}</button>
          <button type="button" data-next aria-label="Next render">${icon('next')}</button>
        </div>
      </div>
    </div>`;
  let index = start;
  const photo = dialog.querySelector('img');
  function display(next) {
    index = (next + photographs.length) % photographs.length;
    const [id, title, description] = photographs[index];
    photo.src = renderPath(id);
    photo.alt = description;
    dialog.querySelector('[data-count]').textContent = 'Photo ' + (index + 1) + ' of ' + photographs.length;
    dialog.querySelector('[data-title]').textContent = title;
  }
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-previous]').addEventListener('click', () => display(index - 1));
  dialog.querySelector('[data-next]').addEventListener('click', () => display(index + 1));
  const frame = dialog.querySelector('.nb-lightbox-frame');
  let swipe = null;
  frame.addEventListener('touchstart', (event) => {
    swipe = event.touches.length === 1 ? event.touches[0] : null;
  }, {passive: true});
  frame.addEventListener('touchcancel', () => { swipe = null; }, {passive: true});
  frame.addEventListener('touchend', (event) => {
    const end = event.changedTouches[0];
    if (swipe && end.identifier === swipe.identifier && (window.visualViewport?.scale ?? 1) <= 1) {
      const dx = end.clientX - swipe.clientX;
      if (Math.abs(dx) > 48 && Math.abs(dx) > 1.5 * Math.abs(end.clientY - swipe.clientY)) {
        display(index + (dx < 0 ? 1 : -1));
      }
    }
    swipe = null;
  }, {passive: true});
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    display(index + (event.key === 'ArrowRight' ? 1 : -1));
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (trigger.isConnected) trigger.focus({preventScroll: true});
  }, {once: true});
  display(start);
  container.append(dialog);
  dialog.showModal();
}

const photographs = [
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

const chapters = [
  [0, 'The approach', 'Arrive above the market and follow the internal drive.', 14],
  [8, 'Shopfronts & arcades', 'Explore the street-facing shops and covered walkways.', 7],
  [16, 'The courtyard', 'Step into the central plaza and its open-air galleries.', 12],
  [24, 'Above the market', 'See how the retail wings fit together from above.', 10]
];

const renderPath = (id, small = false) =>
  '/media/render-' + String(id).padStart(2, '0') + (small ? '-small' : '') + '.webp';

const symbols = {
  previous: '<path d="m14.5 5.5-6.5 6.5 6.5 6.5"/>',
  next: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  expand: '<path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.2"/><path d="m4 17 5-5 4 4 3-3 5 5"/>',
  film: '<rect x="2.7" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3"/>'
};
function icon(name) {
  return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + symbols[name] + '</svg>';
}

function openPhotograph(container, start, trigger) {
  const dialog = document.createElement('dialog');
  dialog.className = 'nb-media-lightbox';
  dialog.setAttribute('aria-label', 'Architectural render viewer');
  dialog.innerHTML = `
    <div class="nb-lightbox-content">
      <div class="nb-lightbox-top">
        <span>Naya Baazar <span class="nb-lightbox-divider">/</span> Architectural renders</span>
        <button type="button" data-close aria-label="Close viewer" autofocus>${icon('close')}</button>
      </div>
      <div class="nb-lightbox-frame"><img alt=""></div>
      <div class="nb-lightbox-controls">
        <div aria-live="polite" aria-atomic="true"><span data-count></span><strong data-title></strong></div>
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
    dialog.querySelector('[data-count]').textContent = (index + 1) + ' / ' + photographs.length;
    dialog.querySelector('[data-title]').textContent = title;
  }
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-previous]').addEventListener('click', () => display(index - 1));
  dialog.querySelector('[data-next]').addEventListener('click', () => display(index + 1));
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

function player() {
  return `<video class="nb-tour-player" controls playsinline preload="metadata" poster="${renderPath(14)}" aria-label="Naya Baazar architectural render walkthrough">
    <source src="/media/walkthrough.mp4?v=steady-2" type="video/mp4">
    <track src="/media/chapters.vtt" kind="chapters" srclang="en" label="Walkthrough chapters">
    <a href="/media/walkthrough.mp4?v=steady-2">Open the walkthrough video</a>
  </video>`;
}

function photoGrid(container, panel) {
  panel.innerHTML = '<div class="nb-photo-grid">' + photographs.map(([id, title], index) =>
    `<button type="button" class="nb-photo-card" data-index="${index}" aria-label="Enlarge ${title.toLowerCase()}">
      <span class="nb-photo-frame">
        <img src="${renderPath(id, true)}" loading="${index < 2 ? 'eager' : 'lazy'}" alt="" width="640" height="400">
        <span aria-hidden="true" class="nb-photo-expand">${icon('expand')}</span>
      </span>
      <span class="nb-photo-title">${title}</span>
    </button>`
  ).join('') + '</div>';
  panel.querySelector('.nb-photo-grid').addEventListener('click', (event) => {
    const card = event.target.closest('[data-index]');
    if (card) openPhotograph(container, Number(card.dataset.index), card);
  });
}

export function mountGallery(container) {
  container.innerHTML = `<section class="nb-media-section" aria-label="Project gallery">
    <header class="nb-media-heading">
      <div><p class="nb-media-eyebrow">Naya Baazar</p><h1>Photos &amp; videos</h1></div>
      <p>Explore the market through its architectural renders.</p>
    </header>
    <div class="nb-gallery-filters" role="group" aria-label="Media type">
      <button type="button" data-kind="photos" aria-pressed="true">${icon('image')} Photos <span>16</span></button>
      <button type="button" data-kind="videos" aria-pressed="false">${icon('film')} Videos <span>1</span></button>
    </div>
    <div class="nb-gallery-panel"></div>
  </section>`;
  const buttons = [...container.querySelectorAll('[data-kind]')];
  const panel = container.querySelector('.nb-gallery-panel');
  buttons.forEach((button) => button.addEventListener('click', () => {
    if (button.getAttribute('aria-pressed') === 'true') return;
    for (const control of buttons) control.setAttribute('aria-pressed', String(control === button));
    if (button.dataset.kind === 'photos') {
      photoGrid(container, panel);
    } else {
      panel.innerHTML = `<figure class="nb-gallery-film">${player()}<figcaption><strong>Market walkthrough</strong><span>Architectural render film · 33 seconds</span></figcaption></figure>`;
    }
  }));
  photoGrid(container, panel);
}

export function mountWalkthrough(container) {
  container.innerHTML = `<section class="nb-media-section" aria-label="Project walkthrough">
    <header class="nb-media-heading">
      <div><p class="nb-media-eyebrow">Naya Baazar</p><h1>Market walkthrough</h1></div>
      <p>A journey through the proposed market, assembled from the project’s architectural renders.</p>
    </header>
    <div class="nb-tour-layout">
      <div class="nb-tour-screen">
        ${player()}
        <div class="nb-tour-meta"><span>Architectural render film</span><span>33 seconds</span></div>
      </div>
      <aside class="nb-tour-chapters" aria-label="Video chapters">
        <h2>In this walkthrough</h2>
        <div class="nb-chapters-list">${chapters.map(([time, title, description, id], i) => `
          <button type="button" data-time="${time}" aria-label="Play ${title} from ${time} seconds" ${i === 0 ? 'aria-current="true"' : ''}>
            <img src="${renderPath(id, true)}" loading="lazy" width="88" height="64" alt="">
            <span><strong>${title}</strong><small>0:${String(time).padStart(2,'0')}</small></span>
          </button>`).join('')}
        </div>
        <p class="nb-tour-description" aria-live="off">${chapters[0][2]}</p>
      </aside>
    </div>
  </section>`;
  const video = container.querySelector('video');
  const controls = [...container.querySelectorAll('[data-time]')];
  const description = container.querySelector('.nb-tour-description');
  let current = 0;
  function updateChapter() {
    const t = video.currentTime;
    const next = chapters.reduce((selected, [time], index) => time <= t ? index : selected, 0);
    if (next === current) return;
    controls[current].removeAttribute('aria-current');
    controls[next].setAttribute('aria-current', 'true');
    current = next;
    description.textContent = chapters[next][2];
  }
  video.addEventListener('timeupdate', updateChapter);
  controls.forEach((button) => button.addEventListener('click', () => {
    video.currentTime = Number(button.dataset.time);
    video.play().catch(() => video.focus());
    updateChapter();
  }));
}

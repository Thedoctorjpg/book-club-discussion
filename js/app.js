const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const state = {
  books: [],
  curatedLists: [],
  discussions: { clubs: [], meetings: [], threads: [] },
  activeLetter: 'A',
  searchQuery: '',
  genreFilter: '',
  audienceFilter: '',
  selectedBookId: null,
  threadBookFilter: '',
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

async function loadData() {
  const [booksRes, curatedRes, discussRes] = await Promise.all([
    fetch('/data/books.json'),
    fetch('/data/curated-lists.json'),
    fetch('/api/discussions'),
  ]);
  const booksData = await booksRes.json();
  state.books = booksData.books;
  const curatedData = await curatedRes.json();
  state.curatedLists = curatedData.lists;
  state.discussions = await discussRes.json();
}

function bookById(id) {
  return state.books.find((b) => b.id === id);
}

function getMemberName() {
  const stored = localStorage.getItem('bcc-member-name');
  const input = $('#member-name');
  if (stored && input) input.value = stored;
  return input?.value.trim() || 'Anonymous';
}

function saveMemberName() {
  const name = $('#member-name').value.trim();
  if (name) localStorage.setItem('bcc-member-name', name);
}

function countPrompts(book) {
  const p = book.prompts || {};
  return (p.themes?.length || 0) + (p.characters?.length || 0) +
    (p.symbols?.length || 0) + (p.quotes?.length || 0);
}

function filteredBooks() {
  const q = state.searchQuery.toLowerCase();
  return state.books.filter((b) => {
    if (state.activeLetter && !q && !state.genreFilter && !state.audienceFilter) {
      if (b.letter !== state.activeLetter) return false;
    }
    if (q && !b.title.toLowerCase().includes(q) && !b.author.toLowerCase().includes(q)) return false;
    if (state.genreFilter && b.genre !== state.genreFilter) return false;
    if (state.audienceFilter && b.audience !== state.audienceFilter) return false;
    if (!q && (state.genreFilter || state.audienceFilter) && b.letter !== state.activeLetter) return false;
    return true;
  });
}

function booksByLetter() {
  const map = {};
  for (const l of LETTERS) map[l] = [];
  for (const b of state.books) {
    if (map[b.letter]) map[b.letter].push(b);
  }
  return map;
}

function renderStats() {
  $('#stat-total').textContent = state.books.length;
  $('#stat-fiction').textContent = state.books.filter((b) => b.genre === 'Fiction').length;
  $('#stat-nonfiction').textContent = state.books.filter((b) => b.genre === 'Nonfiction').length;
}

function renderAlphaNav() {
  const byLetter = booksByLetter();
  const nav = $('#alpha-nav');
  nav.innerHTML = LETTERS.map((l) => {
    const count = byLetter[l].length;
    const active = l === state.activeLetter ? 'active' : '';
    const disabled = count === 0 ? 'disabled' : '';
    return `<button class="alpha-btn ${active}" data-letter="${l}" ${disabled} title="${count} titles">${l}</button>`;
  }).join('');

  nav.querySelectorAll('.alpha-btn:not(:disabled)').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeLetter = btn.dataset.letter;
      renderAlphaNav();
      renderBookGrid();
    });
  });
}

function renderBookGrid() {
  const books = filteredBooks();
  const grid = $('#book-grid');
  const empty = $('#library-empty');

  if (books.length === 0) {
    grid.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  grid.innerHTML = books.map((b) => `
    <article class="book-card" data-id="${b.id}" tabindex="0" role="button" aria-label="Open ${b.title}">
      <h3>${escapeHtml(b.title)}</h3>
      <p class="book-author">${escapeHtml(b.author)}</p>
      <div class="book-meta">
        <span class="meta-tag ${b.genre.toLowerCase()}">${escapeHtml(b.genre)}</span>
        <span class="meta-tag">${escapeHtml(b.type)}</span>
        <span class="meta-tag">${escapeHtml(b.audience)}</span>
      </div>
      <span class="book-prompt-count">${countPrompts(b)} discussion prompts</span>
    </article>
  `).join('');

  grid.querySelectorAll('.book-card').forEach((card) => {
    const open = () => openBookDetail(card.dataset.id);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function formatYear(year) {
  if (year < 0) return `${Math.abs(year)} BCE`;
  return String(year);
}

function openBookDetail(bookId) {
  const book = state.books.find((b) => b.id === bookId);
  if (!book) return;
  state.selectedBookId = bookId;

  $('#detail-header').innerHTML = `
    <h2>${escapeHtml(book.title)}</h2>
    <p class="book-author">${escapeHtml(book.author)}</p>
    <div class="book-meta">
      <span class="meta-tag ${book.genre.toLowerCase()}">${escapeHtml(book.genre)}</span>
      <span class="meta-tag">${escapeHtml(book.type)}</span>
      <span class="meta-tag">${escapeHtml(book.audience)}</span>
      <span class="meta-tag">${formatYear(book.year)}</span>
    </div>
  `;
  $('#detail-synopsis').textContent = book.synopsis;

  const categories = [
    { key: 'themes', label: 'Themes' },
    { key: 'characters', label: 'Characters' },
    { key: 'symbols', label: 'Symbols' },
    { key: 'quotes', label: 'Quotes' },
  ];

  $('#detail-prompts').innerHTML = categories.map((cat) => {
    const prompts = book.prompts?.[cat.key] || [];
    if (!prompts.length) return '';
    return `
      <div class="prompt-category">
        <h4><span class="cat-dot ${cat.key}"></span> ${cat.label}</h4>
        ${prompts.map((p) => `
          <button class="prompt-btn" data-category="${cat.key}" data-prompt="${escapeAttr(p)}">${escapeHtml(p)}</button>
        `).join('')}
      </div>
    `;
  }).join('');

  $('#detail-prompts').querySelectorAll('.prompt-btn').forEach((btn) => {
    btn.addEventListener('click', () => startThreadFromPrompt(bookId, btn.dataset.category, btn.dataset.prompt));
  });

  $('#book-detail').hidden = false;
  document.body.style.overflow = 'hidden';
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function closeBookDetail() {
  $('#book-detail').hidden = true;
  document.body.style.overflow = '';
}

async function startThreadFromPrompt(bookId, category, prompt) {
  const author = getMemberName();
  saveMemberName();

  const res = await fetch('/api/threads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookId, promptCategory: category, prompt, author }),
  });

  if (res.ok) {
    const thread = await res.json();
    state.discussions.threads.unshift(thread);
    closeBookDetail();
    switchView('discuss');
    renderThreads();
  }
}

function switchView(viewId) {
  $$('.view-tab').forEach((tab) => {
    const isActive = tab.id === `tab-${viewId}`;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive);
  });
  $$('.view').forEach((v) => {
    const isActive = v.id === `view-${viewId}`;
    v.classList.toggle('active', isActive);
    v.hidden = !isActive;
  });
}

function bookTitle(bookId) {
  return state.books.find((b) => b.id === bookId)?.title || 'Unknown book';
}

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function renderThreads() {
  let threads = state.discussions.threads || [];
  if (state.threadBookFilter) {
    threads = threads.filter((t) => t.bookId === state.threadBookFilter);
  }

  const list = $('#thread-list');
  const empty = $('#discuss-empty');

  if (threads.length === 0) {
    list.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  list.innerHTML = threads.map((t) => `
    <article class="thread-card" data-id="${t.id}">
      <div class="thread-header">
        <span class="thread-book-label">${escapeHtml(bookTitle(t.bookId))}</span>
        <span class="thread-category-badge ${t.promptCategory}">${escapeHtml(t.promptCategory)}</span>
      </div>
      <p class="thread-prompt">${escapeHtml(t.prompt)}</p>
      <p class="thread-meta">Started by ${escapeHtml(t.author)} · ${formatDate(t.createdAt)}</p>
      <div class="replies">
        ${(t.replies || []).map((r) => `
          <div class="reply">
            <div class="reply-author">${escapeHtml(r.author)}</div>
            <div class="reply-text">${escapeHtml(r.text)}</div>
          </div>
        `).join('')}
        <form class="reply-form" data-thread="${t.id}">
          <input type="text" placeholder="Add your thoughts..." required aria-label="Reply text">
          <button type="submit" class="btn btn-secondary">Reply</button>
        </form>
      </div>
    </article>
  `).join('');

  list.querySelectorAll('.reply-form').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = form.querySelector('input');
      const text = input.value.trim();
      if (!text) return;

      saveMemberName();
      const threadId = form.dataset.thread;
      const res = await fetch(`/api/threads/${threadId}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: getMemberName(), text }),
      });

      if (res.ok) {
        const reply = await res.json();
        const thread = state.discussions.threads.find((t) => t.id === threadId);
        if (thread) thread.replies.push(reply);
        renderThreads();
      }
    });
  });
}

function populateBookSelects() {
  const options = state.books
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((b) => `<option value="${b.id}">${escapeHtml(b.title)}</option>`)
    .join('');

  for (const sel of ['#thread-book', '#meeting-book', '#thread-book-filter']) {
    const el = $(sel);
    if (!el) continue;
    const extra = sel === '#thread-book-filter' ? '<option value="">All books</option>' : '';
    el.innerHTML = extra + options;
  }
}

function renderClub() {
  const club = state.discussions.clubs?.[0];
  if (!club) return;

  $('#club-name').textContent = club.name;
  $('#club-description').textContent = club.description;
  $('#members-row').innerHTML = (club.members || [])
    .map((m) => `<span class="member-badge">${escapeHtml(m)}</span>`)
    .join('');

  const meetings = (state.discussions.meetings || []).filter((m) => m.clubId === club.id);
  const list = $('#meeting-list');
  const empty = $('#meetings-empty');

  if (meetings.length === 0) {
    list.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  list.innerHTML = meetings.map((m) => `
    <div class="meeting-card">
      <h4>${escapeHtml(bookTitle(m.bookId))}</h4>
      <p class="meeting-date">${formatDate(m.date)}</p>
      ${m.location ? `<p class="meeting-location">📍 ${escapeHtml(m.location)}</p>` : ''}
      ${m.notes ? `<p class="meeting-notes">${escapeHtml(m.notes)}</p>` : ''}
    </div>
  `).join('');
}

function openThreadModal(prefill = {}) {
  const modal = $('#thread-modal');
  if (prefill.bookId) $('#thread-book').value = prefill.bookId;
  if (prefill.category) $('#thread-category').value = prefill.category;
  if (prefill.prompt) $('#thread-prompt').value = prefill.prompt;
  modal.showModal();
}

function collectionBadge(collection) {
  const cls = collection === 'Fine Arts' ? 'fine-arts' : collection === 'Classics' ? 'classics' : 'both';
  return `<span class="collection-badge ${cls}">${escapeHtml(collection)}</span>`;
}

function renderCuratedList(list) {
  const totalBooks = new Set(list.sections.flatMap((s) => s.bookIds)).size;

  const sectionsHtml = list.sections.map((section) => {
    const books = section.bookIds.map((id) => bookById(id)).filter(Boolean);
    if (!books.length) return '';

    return `
      <section class="curated-section" id="section-${section.id}">
        <div class="curated-section-header">
          <div>
            <h3>${escapeHtml(section.title)}</h3>
            <p>${escapeHtml(section.description)}</p>
          </div>
          ${collectionBadge(section.collection)}
        </div>
        <div class="curated-book-row">
          ${books.map((b) => `
            <article class="curated-book-card" data-id="${b.id}" tabindex="0" role="button">
              <h4>${escapeHtml(b.title)}</h4>
              <p class="book-author">${escapeHtml(b.author)}</p>
              <span class="meta-tag">${escapeHtml(b.type)}</span>
            </article>
          `).join('')}
        </div>
      </section>
    `;
  }).join('');

  return `
    <div class="curated-hero">
      <p class="hero-eyebrow">${escapeHtml(list.institution)}</p>
      <h1>${escapeHtml(list.title)}</h1>
      <p class="hero-sub">${escapeHtml(list.description)}</p>
      <div class="curated-meta">
        <span>📍 ${escapeHtml(list.location)}</span>
        <span>🕐 ${escapeHtml(list.hours)}</span>
        <span>📚 ${totalBooks} titles in this list</span>
      </div>
      <a href="${escapeHtml(list.sourceUrl)}" class="curated-source-link" target="_blank" rel="noopener">Visit the Art History/Classics Library →</a>
    </div>

    <div class="curated-layout">
      <div class="curated-main">
        <h2 class="curated-part-title">Reading path</h2>
        ${sectionsHtml}
      </div>
      <aside class="curated-sidebar">
        <div class="sidebar-card">
          <h3>Collections</h3>
          ${list.collections.map((c) => `
            <div class="collection-block">
              <a href="${escapeHtml(c.url)}" target="_blank" rel="noopener"><strong>${escapeHtml(c.name)}</strong></a>
              <p>${escapeHtml(c.focus)}</p>
            </div>
          `).join('')}
        </div>
        <div class="sidebar-card">
          <h3>Library resources</h3>
          <ul class="resource-list">
            ${list.resources.map((r) => `
              <li><a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${escapeHtml(r.label)}</a></li>
            `).join('')}
          </ul>
        </div>
        <div class="sidebar-card">
          <h3>Subject librarians</h3>
          ${list.librarians.map((l) => `
            <div class="librarian-block">
              <strong>${escapeHtml(l.name)}</strong>
              <span>${escapeHtml(l.role)}</span>
              <a href="mailto:${escapeHtml(l.email)}">${escapeHtml(l.email)}</a>
            </div>
          `).join('')}
          <p class="contact-line">${escapeHtml(list.contact)}</p>
        </div>
      </aside>
    </div>
  `;
}

function renderCurated() {
  const container = $('#curated-content');
  if (!container || !state.curatedLists.length) return;

  container.innerHTML = state.curatedLists.map(renderCuratedList).join('');

  container.querySelectorAll('.curated-book-card').forEach((card) => {
    const open = () => openBookDetail(card.dataset.id);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
}

function openMeetingModal(bookId) {
  const modal = $('#meeting-modal');
  if (bookId) $('#meeting-book').value = bookId;
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  nextWeek.setHours(19, 0, 0, 0);
  $('#meeting-date').value = nextWeek.toISOString().slice(0, 16);
  modal.showModal();
}

function bindEvents() {
  $$('.view-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const view = tab.id.replace('tab-', '');
      switchView(view);
      if (view === 'curated') renderCurated();
      if (view === 'discuss') renderThreads();
      if (view === 'club') renderClub();
    });
  });

  $('#logo-home')?.addEventListener('click', (e) => {
    e.preventDefault();
    switchView('library');
  });

  $('#search-input').addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    $('#search-clear').hidden = !state.searchQuery;
    renderBookGrid();
  });

  $('#search-clear').addEventListener('click', () => {
    state.searchQuery = '';
    $('#search-input').value = '';
    $('#search-clear').hidden = true;
    renderBookGrid();
  });

  $('#filter-genre').addEventListener('change', (e) => {
    state.genreFilter = e.target.value;
    renderBookGrid();
  });

  $('#filter-audience').addEventListener('change', (e) => {
    state.audienceFilter = e.target.value;
    renderBookGrid();
  });

  $('#detail-close').addEventListener('click', closeBookDetail);
  $('#detail-backdrop').addEventListener('click', closeBookDetail);

  $('#btn-schedule-meeting').addEventListener('click', () => {
    openMeetingModal(state.selectedBookId);
  });

  $('#btn-view-threads').addEventListener('click', () => {
    if (state.selectedBookId) state.threadBookFilter = state.selectedBookId;
    $('#thread-book-filter').value = state.threadBookFilter;
    closeBookDetail();
    switchView('discuss');
    renderThreads();
  });

  $('#btn-new-thread').addEventListener('click', () => openThreadModal());

  $('#thread-book-filter').addEventListener('change', (e) => {
    state.threadBookFilter = e.target.value;
    renderThreads();
  });

  $('#thread-cancel').addEventListener('click', () => $('#thread-modal').close());

  $('#thread-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    saveMemberName();
    const res = await fetch('/api/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookId: $('#thread-book').value,
        promptCategory: $('#thread-category').value,
        prompt: $('#thread-prompt').value.trim(),
        author: getMemberName(),
      }),
    });
    if (res.ok) {
      state.discussions.threads.unshift(await res.json());
      $('#thread-modal').close();
      $('#thread-form').reset();
      renderThreads();
    }
  });

  $('#meeting-cancel').addEventListener('click', () => $('#meeting-modal').close());

  $('#meeting-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = await fetch('/api/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookId: $('#meeting-book').value,
        date: new Date($('#meeting-date').value).toISOString(),
        location: $('#meeting-location').value.trim(),
        notes: $('#meeting-notes').value.trim(),
      }),
    });
    if (res.ok) {
      state.discussions.meetings.unshift(await res.json());
      $('#meeting-modal').close();
      $('#meeting-form').reset();
      renderClub();
    }
  });

  $('#member-name').addEventListener('blur', saveMemberName);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#book-detail').hidden) closeBookDetail();
  });
}

async function init() {
  await loadData();
  getMemberName();
  renderStats();
  renderAlphaNav();
  renderBookGrid();
  populateBookSelects();
  renderCurated();
  renderClub();
  bindEvents();
}

init();
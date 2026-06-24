const PROGRESS_KEY = 'bcc-reading-progress';
const DEVICES_KEY = 'bcc-reading-devices';

let epubBook = null;
let epubRendition = null;
let currentBookId = null;
let readingRefresh = null;

function loadDevices() {
  try {
    return JSON.parse(localStorage.getItem(DEVICES_KEY)) || {
      kindleEmail: '',
      koboEmail: '',
      preferredDevice: 'browser',
    };
  } catch {
    return { kindleEmail: '', koboEmail: '', preferredDevice: 'browser' };
  }
}

function saveDevices(devices) {
  localStorage.setItem(DEVICES_KEY, JSON.stringify(devices));
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveProgress(bookId, location) {
  const all = loadProgress();
  all[bookId] = { location, updatedAt: new Date().toISOString() };
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
}

function getProgress(bookId) {
  return loadProgress()[bookId]?.location || null;
}

function gutenbergEpubUrl(gutenbergId) {
  return `https://www.gutenberg.org/ebooks/${gutenbergId}.epub.noimages`;
}

function buildReadingLinks(book, sources) {
  const meta = sources?.books?.[book.id];
  const q = encodeURIComponent(`${book.title} ${book.author}`);
  const gutenbergId = meta?.gutenbergId;

  return {
    gutenbergId,
    gutenbergPage: gutenbergId ? `https://www.gutenberg.org/ebooks/${gutenbergId}` : null,
    epubUrl: gutenbergId ? gutenbergEpubUrl(gutenbergId) : null,
    kindleStore: `https://www.amazon.com/s?k=${q}&i=digital-text`,
    koboStore: `https://www.kobo.com/us/en/search?query=${q}`,
    appleBooks: `https://books.apple.com/us/search?term=${q}`,
    googlePlay: `https://play.google.com/store/search?q=${q}&c=books`,
    openLibrary: `https://openlibrary.org/search?q=${q}`,
    libby: `https://libbyapp.com/search/ncdl/search/query-${q}`,
    archive: `https://archive.org/search?query=${q}`,
  };
}

function renderReadingSection(book, sources, container) {
  readingRefresh = { book, sources, container };
  const links = buildReadingLinks(book, sources);
  const devices = loadDevices();
  const progress = getProgress(book.id);
  const hasEpub = Boolean(links.epubUrl);

  container.innerHTML = `
    <div class="reading-options">
      ${hasEpub ? `
        <button type="button" class="reading-btn primary" data-action="read-browser">
          <span class="reading-btn-icon">📱</span>
          <span><strong>Read in browser</strong><small>Free EPUB via Project Gutenberg</small></span>
        </button>
      ` : ''}
      <a class="reading-btn" href="${links.kindleStore}" target="_blank" rel="noopener">
        <span class="reading-btn-icon">📚</span>
        <span><strong>Find on Kindle</strong><small>Amazon Kindle Store</small></span>
      </a>
      <a class="reading-btn" href="${links.koboStore}" target="_blank" rel="noopener">
        <span class="reading-btn-icon">📖</span>
        <span><strong>Find on Kobo</strong><small>Kobo eBook store</small></span>
      </a>
      <a class="reading-btn" href="${links.appleBooks}" target="_blank" rel="noopener">
        <span class="reading-btn-icon">🍎</span>
        <span><strong>Apple Books</strong><small>iPhone, iPad, Mac</small></span>
      </a>
      <a class="reading-btn" href="${links.googlePlay}" target="_blank" rel="noopener">
        <span class="reading-btn-icon">▶</span>
        <span><strong>Google Play Books</strong><small>Android &amp; web</small></span>
      </a>
      <a class="reading-btn" href="${links.libby}" target="_blank" rel="noopener">
        <span class="reading-btn-icon">🏛</span>
        <span><strong>Borrow on Libby</strong><small>Library eBooks &amp; audiobooks</small></span>
      </a>
      <a class="reading-btn" href="${links.openLibrary}" target="_blank" rel="noopener">
        <span class="reading-btn-icon">🌐</span>
        <span><strong>Open Library</strong><small>Borrow or preview free</small></span>
      </a>
      ${links.gutenbergPage ? `
        <a class="reading-btn" href="${links.gutenbergPage}" target="_blank" rel="noopener">
          <span class="reading-btn-icon">📜</span>
          <span><strong>Project Gutenberg</strong><small>Download EPUB, Kindle, HTML</small></span>
        </a>
      ` : ''}
      <a class="reading-btn" href="${links.archive}" target="_blank" rel="noopener">
        <span class="reading-btn-icon">🗄</span>
        <span><strong>Internet Archive</strong><small>Scanned &amp; lending copies</small></span>
      </a>
      <label class="reading-btn upload-btn">
        <span class="reading-btn-icon">📂</span>
        <span><strong>Open local EPUB</strong><small>Upload from your device</small></span>
        <input type="file" accept=".epub,application/epub+zip" data-action="upload-epub" hidden>
      </label>
    </div>
    ${devices.kindleEmail && hasEpub ? `
      <p class="kindle-hint">Send EPUB to Kindle at <code>${escapeHtml(devices.kindleEmail)}</code> via <a href="${sources?.defaults?.kindleSetupUrl || 'https://www.amazon.com/sendtokindle/email'}" target="_blank" rel="noopener">Send to Kindle</a>, or download from Gutenberg and email the file as an attachment.</p>
    ` : ''}
    ${progress ? `<p class="reading-progress-hint">Saved reading position available — resume when you open in browser.</p>` : ''}
    <button type="button" class="btn btn-ghost btn-sm" data-action="device-settings">⚙ E-reader settings (Kindle, Kobo…)</button>
  `;

  container.querySelector('[data-action="read-browser"]')?.addEventListener('click', () => {
    openReader(book.id, book.title, links.epubUrl);
  });

  container.querySelector('[data-action="upload-epub"]')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) openReaderFromFile(book.id, book.title, file);
    e.target.value = '';
  });

  container.querySelector('[data-action="device-settings"]')?.addEventListener('click', () => {
    openDeviceSettings(sources);
  });
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

async function ensureEpubJs() {
  if (window.ePub) return window.ePub;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return window.ePub;
}

async function openReader(bookId, title, epubUrl) {
  const overlay = document.getElementById('reader-overlay');
  const viewer = document.getElementById('reader-viewer');
  const titleEl = document.getElementById('reader-title');
  const statusEl = document.getElementById('reader-status');

  if (!overlay || !viewer) return;

  currentBookId = bookId;
  titleEl.textContent = title;
  statusEl.textContent = 'Loading…';
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  viewer.innerHTML = '';

  try {
    await ensureEpubJs();
    if (epubRendition) {
      epubRendition.destroy();
      epubRendition = null;
    }
    if (epubBook) {
      epubBook.destroy();
      epubBook = null;
    }

    const proxyUrl = `/api/epub-proxy?url=${encodeURIComponent(epubUrl)}`;
    epubBook = window.ePub(proxyUrl);
    epubRendition = epubBook.renderTo(viewer, {
      width: '100%',
      height: '100%',
      spread: 'none',
    });

    epubRendition.on('relocated', (location) => {
      if (location?.start?.cfi) {
        saveProgress(bookId, location.start.cfi);
        statusEl.textContent = `Location saved`;
      }
    });

    const saved = getProgress(bookId);
    if (saved) {
      await epubRendition.display(saved);
      statusEl.textContent = 'Resumed';
    } else {
      await epubRendition.display();
      statusEl.textContent = '';
    }

    epubRendition.themes.fontSize('105%');
  } catch (err) {
    statusEl.textContent = 'Could not load EPUB. Try Project Gutenberg or upload a local file.';
    console.error(err);
  }
}

async function openReaderFromFile(bookId, title, file) {
  const overlay = document.getElementById('reader-overlay');
  const viewer = document.getElementById('reader-viewer');
  const titleEl = document.getElementById('reader-title');
  const statusEl = document.getElementById('reader-status');

  if (!overlay || !viewer) return;

  currentBookId = bookId;
  titleEl.textContent = title;
  statusEl.textContent = 'Loading…';
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  viewer.innerHTML = '';

  try {
    await ensureEpubJs();
    if (epubRendition) epubRendition.destroy();
    if (epubBook) epubBook.destroy();

    const arrayBuffer = await file.arrayBuffer();
    epubBook = window.ePub(arrayBuffer);
    epubRendition = epubBook.renderTo(viewer, { width: '100%', height: '100%', spread: 'none' });

    epubRendition.on('relocated', (location) => {
      if (location?.start?.cfi) saveProgress(bookId, location.start.cfi);
    });

    const saved = getProgress(bookId);
    await epubRendition.display(saved || undefined);
    statusEl.textContent = saved ? 'Resumed' : '';
    epubRendition.themes.fontSize('105%');
  } catch (err) {
    statusEl.textContent = 'Invalid or unsupported EPUB file.';
    console.error(err);
  }
}

function closeReader() {
  const overlay = document.getElementById('reader-overlay');
  if (overlay) overlay.hidden = true;
  document.body.style.overflow = '';
  if (epubRendition) {
    epubRendition.destroy();
    epubRendition = null;
  }
  if (epubBook) {
    epubBook.destroy();
    epubBook = null;
  }
  currentBookId = null;
}

function readerNext() {
  epubRendition?.next();
}

function readerPrev() {
  epubRendition?.prev();
}

function readerFontSize(delta) {
  if (!epubRendition) return;
  const current = parseInt(epubRendition.themes.fontSize(), 10) || 100;
  epubRendition.themes.fontSize(`${Math.max(80, Math.min(160, current + delta))}%`);
}

function openDeviceSettings(sources) {
  const modal = document.getElementById('device-modal');
  const devices = loadDevices();
  if (!modal) return;

  document.getElementById('kindle-email').value = devices.kindleEmail || '';
  document.getElementById('kobo-email').value = devices.koboEmail || '';
  document.getElementById('preferred-device').value = devices.preferredDevice || 'browser';

  const help = document.getElementById('device-help');
  if (help) {
    help.innerHTML = `
      <p><strong>Kindle:</strong> Find your Send-to-Kindle email at
        <a href="${sources?.defaults?.kindleSetupUrl || 'https://www.amazon.com/sendtokindle/email'}" target="_blank" rel="noopener">amazon.com/sendtokindle</a>.
        Email EPUB/MOBI attachments or use the Send to Kindle desktop app.</p>
      <p><strong>Kobo:</strong> Download from
        <a href="${sources?.defaults?.koboUrl || 'https://www.kobo.com/p/en/apps'}" target="_blank" rel="noopener">Kobo apps</a>
        and sideload EPUBs via USB or cloud.</p>
      <p><strong>Libby:</strong> Borrow library eBooks at
        <a href="${sources?.defaults?.libbyUrl || 'https://www.overdrive.com/apps/libby/'}" target="_blank" rel="noopener">libbyapp.com</a>.</p>
    `;
  }

  modal.showModal();
}

function saveDeviceSettings() {
  saveDevices({
    kindleEmail: document.getElementById('kindle-email').value.trim(),
    koboEmail: document.getElementById('kobo-email').value.trim(),
    preferredDevice: document.getElementById('preferred-device').value,
  });
  document.getElementById('device-modal')?.close();
  if (readingRefresh) {
    renderReadingSection(readingRefresh.book, readingRefresh.sources, readingRefresh.container);
  }
}

function bindReaderEvents() {
  document.getElementById('reader-close')?.addEventListener('click', closeReader);
  document.getElementById('reader-prev')?.addEventListener('click', readerPrev);
  document.getElementById('reader-next')?.addEventListener('click', readerNext);
  document.getElementById('reader-font-up')?.addEventListener('click', () => readerFontSize(10));
  document.getElementById('reader-font-down')?.addEventListener('click', () => readerFontSize(-10));

  document.getElementById('device-cancel')?.addEventListener('click', () => {
    document.getElementById('device-modal')?.close();
  });

  document.getElementById('device-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    saveDeviceSettings();
    if (currentBookId) {
      const detailReading = document.getElementById('detail-reading');
      const book = window.__bccBooks?.find((b) => b.id === currentBookId);
      if (detailReading && book && window.__bccReadingSources) {
        renderReadingSection(book, window.__bccReadingSources, detailReading);
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('reader-overlay');
    if (overlay?.hidden) return;
    if (e.key === 'Escape') closeReader();
    if (e.key === 'ArrowRight') readerNext();
    if (e.key === 'ArrowLeft') readerPrev();
  });
}

export {
  renderReadingSection,
  bindReaderEvents,
  openDeviceSettings,
  buildReadingLinks,
};
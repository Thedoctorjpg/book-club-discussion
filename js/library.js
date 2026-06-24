function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function normalizeSystems(branches) {
  const seen = new Map();
  for (const branch of branches || []) {
    for (const system of branch.systems || []) {
      if (!system.fulfillmentId || seen.has(system.id)) continue;
      const digital = (system.links || []).find((l) => l.name === 'DigitalLibraryUrl');
      const card = (system.links || []).find((l) => l.name === 'LibraryCardAquisitionUrl');
      const main = (system.links || []).find((l) => l.name === 'MainLibraryUrl');
      seen.set(system.id, {
        systemId: system.id,
        branchId: branch.id,
        name: system.name,
        branchName: branch.name,
        city: branch.city,
        region: branch.region,
        fulfillmentId: system.fulfillmentId,
        digitalHost: digital?.url || `${system.fulfillmentId}.overdrive.com`,
        cardUrl: card?.url || main?.url || null,
        instantCard: system.isInstantAccessEnabled,
      });
    }
  }
  return [...seen.values()];
}

async function searchLibraries({ zip, query, countryCode = 'US' }) {
  const body = {
    filters: { platforms: ['libby'], countryCode },
    limit: 12,
    include: ['systems'],
  };

  if (zip) {
    body.query = { location: { postalCode: zip.trim(), radius: 30 } };
  } else if (query) {
    body.query = { q: query.trim() };
  } else {
    throw new Error('Enter a zip code or library name');
  }

  const res = await fetch('/api/library-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Library search failed');
  return data.libraries || [];
}

function overdriveHost(library) {
  const host = library?.digitalHost || '';
  if (host.startsWith('http')) return host.replace(/\/$/, '');
  return `https://${host.replace(/\/$/, '')}`;
}

function buildLibraryBorrowLinks(book, library) {
  const titleQ = encodeURIComponent(book.title);
  const fullQ = encodeURIComponent(`${book.title} ${book.author}`);
  const libbyQ = encodeURIComponent(book.title.trim().replace(/\s+/g, '-'));

  const links = {
    libby: `https://libbyapp.com/search/ncdl/search/query-${libbyQ}`,
    libbyOpen: `https://libbyapp.com/open/search/query-${libbyQ}`,
    overdriveEbook: `https://www.overdrive.com/search?query=${fullQ}`,
    overdriveAudio: `https://www.overdrive.com/search?query=${fullQ}&mediaType=audiobook`,
    openLibrary: `https://openlibrary.org/search?q=${fullQ}`,
    openLibraryBorrow: `https://openlibrary.org/search?q=${fullQ}&has_fulltext=true`,
    archiveLending: `https://archive.org/search?query=${fullQ}&and[]=lending%3A%22lending%22`,
    libraryFinder: 'https://www.overdrive.com/apps/libby/',
    getCard: null,
    libraryEbook: null,
    libraryAudio: null,
    libraryPage: null,
  };

  if (library?.fulfillmentId) {
    const base = overdriveHost(library);
    links.libraryEbook = `${base}/search?query=${titleQ}`;
    links.libraryAudio = `${base}/search?query=${titleQ}&mediaType=audiobook`;
    links.libraryPage = base;
    links.getCard = library.cardUrl;
  }

  return links;
}

function renderLibraryBorrowBlock(book, library, sources) {
  const links = buildLibraryBorrowLinks(book, library);
  const hasLibrary = Boolean(library?.name);

  return `
    <div class="library-borrow-block">
      <div class="library-borrow-header">
        <h4>Public library borrow</h4>
        ${hasLibrary ? `<span class="library-saved-badge">${escapeHtml(library.name)}</span>` : ''}
      </div>
      ${hasLibrary ? `
        <p class="library-borrow-lead">Search <strong>${escapeHtml(library.name)}</strong> via Libby &amp; OverDrive.</p>
        <div class="library-borrow-primary">
          <a class="reading-btn libby-btn" href="${links.libraryEbook}" target="_blank" rel="noopener">
            <span class="reading-btn-icon">📗</span>
            <span><strong>Borrow eBook</strong><small>At your library via Libby</small></span>
          </a>
          <a class="reading-btn libby-btn" href="${links.libraryAudio}" target="_blank" rel="noopener">
            <span class="reading-btn-icon">🎧</span>
            <span><strong>Borrow audiobook</strong><small>Listen on Libby</small></span>
          </a>
          <a class="reading-btn libby-btn" href="${links.libbyOpen}" target="_blank" rel="noopener">
            <span class="reading-btn-icon">📲</span>
            <span><strong>Open in Libby app</strong><small>Phone or tablet</small></span>
          </a>
        </div>
        ${links.getCard ? `
          <p class="library-card-hint">
            Need a card?
            <a href="${links.getCard}" target="_blank" rel="noopener">Get a library card</a>
            ${library.instantCard ? ' · instant digital card available' : ''}
          </p>
        ` : ''}
      ` : `
        <p class="library-borrow-lead">Connect your public library to search Libby borrow links for this title.</p>
        <button type="button" class="btn btn-secondary btn-sm" data-action="library-settings">Find my library</button>
      `}
      <details class="library-more" ${hasLibrary ? '' : 'open'}>
        <summary>More borrow options</summary>
        <div class="library-borrow-grid">
          <a class="reading-btn" href="${links.libby}" target="_blank" rel="noopener">
            <span class="reading-btn-icon">🏛</span>
            <span><strong>Libby (all libraries)</strong><small>Search every library on your card</small></span>
          </a>
          <a class="reading-btn" href="${links.overdriveEbook}" target="_blank" rel="noopener">
            <span class="reading-btn-icon">📘</span>
            <span><strong>OverDrive eBooks</strong><small>Global catalog search</small></span>
          </a>
          <a class="reading-btn" href="${links.overdriveAudio}" target="_blank" rel="noopener">
            <span class="reading-btn-icon">🔊</span>
            <span><strong>OverDrive audiobooks</strong><small>Global audio search</small></span>
          </a>
          <a class="reading-btn" href="${links.openLibraryBorrow}" target="_blank" rel="noopener">
            <span class="reading-btn-icon">🌐</span>
            <span><strong>Open Library</strong><small>Free digital lending</small></span>
          </a>
          <a class="reading-btn" href="${links.archiveLending}" target="_blank" rel="noopener">
            <span class="reading-btn-icon">🗄</span>
            <span><strong>Internet Archive</strong><small>Borrow scanned editions</small></span>
          </a>
          <a class="reading-btn" href="${sources?.defaults?.libbySetupUrl || 'https://www.overdrive.com/apps/libby/'}" target="_blank" rel="noopener">
            <span class="reading-btn-icon">⬇</span>
            <span><strong>Get Libby app</strong><small>iOS, Android, Kindle Fire</small></span>
          </a>
        </div>
      </details>
      ${hasLibrary ? `<button type="button" class="btn btn-ghost btn-sm" data-action="library-settings">Change library</button>` : ''}
    </div>
  `;
}

async function renderLibrarySearchResults(container, zip, query) {
  container.innerHTML = '<p class="library-search-status">Searching libraries…</p>';
  try {
    const libraries = await searchLibraries({ zip, query });
    if (!libraries.length) {
      container.innerHTML = '<p class="library-search-status">No Libby libraries found. Try a different zip or name.</p>';
      return;
    }
    container.innerHTML = `
      <p class="library-search-status">${libraries.length} Libby library${libraries.length === 1 ? '' : 'ies'} found — pick yours:</p>
      <ul class="library-results">
        ${libraries.map((lib) => `
          <li>
            <button type="button" class="library-pick-btn" data-system-id="${lib.systemId}">
              <strong>${escapeHtml(lib.name)}</strong>
              <span>${escapeHtml(lib.branchName)} · ${escapeHtml(lib.city)}, ${escapeHtml(lib.region)}</span>
            </button>
          </li>
        `).join('')}
      </ul>
    `;
    return libraries;
  } catch (err) {
    container.innerHTML = `<p class="library-search-status error">${escapeHtml(err.message)}</p>`;
    return [];
  }
}

export {
  normalizeSystems,
  searchLibraries,
  buildLibraryBorrowLinks,
  renderLibraryBorrowBlock,
  renderLibrarySearchResults,
};
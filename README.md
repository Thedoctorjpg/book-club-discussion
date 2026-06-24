# Chapter & Verse — Book Club Discussion

A lightweight web app for book clubs to browse a curated literary library, spark conversations with study-guide-style prompts, and manage reading meetings.

Inspired by [SuperSummary](https://www.supersummary.com/all-study-guides/A/) study guides and the [UC Berkeley Art History/Classics Library](https://www.lib.berkeley.edu/visit/art-history-classics).

**Repository:** [github.com/Thedoctorjpg/book-club-discussion](https://github.com/Thedoctorjpg/book-club-discussion)

---

## Features

- **Library** — Browse 55+ titles A–Z with search and filters (genre, audience)
- **Discussion prompts** — Scholar-style questions on themes, characters, symbols, and quotes
- **Curated reading lists** — Themed paths, including Berkeley Art History & Classics (epic, drama, philosophy, art theory, archaeology)
- **Discussion threads** — Start threads from prompts and reply in-thread
- **Book club tools** — Club profile, member list, and meeting scheduler
- **Persistent storage** — Discussions and meetings saved to `data/discussions.json`
- **EPUB reader** — Read public-domain titles in-browser (Project Gutenberg via epub.js)
- **E-reader connections** — Quick links to Kindle, Kobo, Apple Books, Google Play, Libby, and Open Library; upload local EPUBs; save Send-to-Kindle email

No database required. Runs on Node.js with static files and a small REST API.

---

## Quick start

### Requirements

- [Node.js](https://nodejs.org/) 18+ (no npm dependencies)

### Run locally

**Windows (batch):**

```bat
serve.bat
```

**Windows (PowerShell):**

```powershell
.\serve.ps1
```

**Any platform:**

```bash
node server.js
```

Open **http://localhost:3860** in your browser.

Enter your name in the header before posting — it is stored in `localStorage`.

---

## Views

| Tab | Description |
|-----|-------------|
| **Library** | Alphabetical browse, search, book detail panel with prompts |
| **Curated** | Reading paths with section groupings and external library links |
| **Discuss** | Thread list, replies, filter by book |
| **My Club** | Club info, members, upcoming meetings |

Click the **📚** header button to configure Kindle/Kobo emails and preferred device.

---

## EPUB & e-readers

Each book detail panel includes a **Read** section:

| Option | Description |
|--------|-------------|
| **Read in browser** | Free EPUB from Project Gutenberg (public-domain titles) |
| **Kindle / Kobo / Apple / Google Play** | Store search links for eBook editions |
| **Libby / public library** | Link your library by zip — one-click eBook & audiobook borrow at your branch |
| **Open Library / Archive** | Free borrow or scanned copies |

### Libby & public library borrow

1. Open **E-reader settings** (📚) or **Find my library** on any book.
2. Search by **zip code** or library name (uses OverDrive Library Finder).
3. Select your library — borrow links target your catalog directly.

Per-book **Public library borrow** panel includes:
- Borrow eBook / audiobook at your linked library
- Open in Libby app
- Get a library card link (when available)
- Fallback: Libby global search, OverDrive, Open Library, Internet Archive lending
| **Open local EPUB** | Upload any `.epub` from your device |

Reading position is saved in `localStorage` per book. Use arrow keys (← →) in the reader.

### Send to Kindle

1. Open **E-reader settings** (📚 in header or book detail).
2. Add your `@kindle.com` address from [amazon.com/sendtokindle](https://www.amazon.com/sendtokindle/email).
3. Download EPUB from Gutenberg and email it as an attachment, or use Amazon's Send to Kindle app.

Gutenberg EPUBs are proxied through `/api/epub-proxy` to avoid browser CORS limits.

---

## Curated list: Art History & Classics

Aligned with the UC Berkeley [Art History/Classics Library](https://www.lib.berkeley.edu/visit/art-history-classics) collections:

| Section | Focus |
|---------|--------|
| Epic Foundations | Homer, Virgil |
| Greek Drama & Tragedy | Aeschylus, Sophocles, Aristophanes |
| Classical Philosophy | Plato, Marcus Aurelius, MacIntyre |
| Ancient Historians | Herodotus, Thucydides, Tacitus, Mary Beard |
| Myth & Literary Reception | Ovid, Miller, Calasso, Graves |
| Art History & Visual Theory | Berger, Gombrich, Benjamin, Sontag |
| Artists, Patrons & Lives | Vasari, Stone, Chevalier |
| Archaeology & Material Culture | Harris, Holland, Hearst Collection |
| Modern Encounters with Antiquity | Joyce, Albee, Sontag |

Edit sections and book IDs in `data/curated-lists.json`.

---

## Project structure

```
book-club-discussion/
├── index.html              # App shell
├── server.js               # Static file server + REST API (port 3860)
├── serve.bat / serve.ps1   # Start scripts
├── css/
│   └── styles.css          # Literary burgundy/cream theme
├── js/
│   └── app.js              # Browse, curated lists, discussions, meetings
└── data/
    ├── books.json          # Catalog + discussion prompts
    ├── curated-lists.json  # Themed reading paths
    ├── reading-sources.json # Gutenberg IDs + e-reader defaults
    └── discussions.json    # Clubs, meetings, threads (runtime data)
```

---

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/discussions` | Fetch clubs, meetings, and threads |
| `POST` | `/api/threads` | Create a discussion thread |
| `POST` | `/api/threads/:id/replies` | Add a reply to a thread |
| `POST` | `/api/meetings` | Schedule a club meeting |
| `POST` | `/api/clubs` | Create a book club |
| `GET` | `/api/epub-proxy?url=` | Proxy EPUB from Gutenberg (CORS bypass) |
| `POST` | `/api/library-search` | Search Libby-enabled libraries (OverDrive API) |

### Example: create a thread

```bash
curl -X POST http://localhost:3860/api/threads \
  -H "Content-Type: application/json" \
  -d '{"bookId":"gatsby","promptCategory":"themes","prompt":"Is the American Dream destructive?","author":"Alex"}'
```

---

## Adding books

Add an entry to `data/books.json`:

```json
{
  "id": "my-book",
  "title": "My Book",
  "author": "Author Name",
  "genre": "Fiction",
  "type": "Novel",
  "audience": "Adult",
  "year": 2020,
  "letter": "M",
  "collections": ["classics"],
  "synopsis": "One-paragraph summary.",
  "prompts": {
    "themes": ["Question about big ideas?"],
    "characters": ["Question about a character?"],
    "symbols": ["Question about imagery?"],
    "quotes": ["Discuss: 'memorable line'"]
  }
}
```

Reference the book `id` in `data/curated-lists.json` to include it in a curated path.

---

## Configuration

| Setting | Location | Default |
|---------|----------|---------|
| Port | `server.js` → `PORT` | `3860` |
| Discussions file | `server.js` → `DISCUSSIONS_PATH` | `data/discussions.json` |

---

## Tech stack

- Vanilla HTML, CSS, JavaScript (ES modules)
- Node.js `http` module — no frameworks or npm packages
- JSON file persistence for discussions
- Google Fonts: Cormorant Garamond, Source Sans 3

---

## Acknowledgements

- Study-guide prompt structure inspired by [SuperSummary](https://www.supersummary.com/)
- Art History & Classics curated list inspired by the [UC Berkeley Library](https://www.lib.berkeley.edu/visit/art-history-classics) Fine Arts and Classics collections

---

## License

MIT License — see [LICENSE](LICENSE).
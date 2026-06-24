const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3860;
const ROOT = __dirname;
const DISCUSSIONS_PATH = path.join(ROOT, 'data', 'discussions.json');

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
};

const ALLOWED_EPUB_HOSTS = new Set([
  'www.gutenberg.org',
  'gutenberg.org',
  'standardebooks.org',
  'archive.org',
]);

function readDiscussions() {
  try {
    return JSON.parse(fs.readFileSync(DISCUSSIONS_PATH, 'utf8'));
  } catch {
    return { clubs: [], meetings: [], threads: [] };
  }
}

function writeDiscussions(data) {
  fs.writeFileSync(DISCUSSIONS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, urlPath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];

  if (urlPath === '/api/discussions' && req.method === 'GET') {
    return sendJson(res, 200, readDiscussions());
  }

  if (urlPath === '/api/threads' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const data = readDiscussions();
      const thread = {
        id: `thread-${Date.now()}`,
        bookId: body.bookId,
        clubId: body.clubId || 'default-club',
        promptCategory: body.promptCategory || 'themes',
        prompt: body.prompt || '',
        author: body.author || 'Anonymous',
        createdAt: new Date().toISOString(),
        replies: [],
      };
      data.threads.unshift(thread);
      writeDiscussions(data);
      return sendJson(res, 201, thread);
    } catch {
      return sendJson(res, 400, { error: 'Invalid request body' });
    }
  }

  if (urlPath.startsWith('/api/threads/') && urlPath.endsWith('/replies') && req.method === 'POST') {
    try {
      const threadId = urlPath.split('/')[3];
      const body = await parseBody(req);
      const data = readDiscussions();
      const thread = data.threads.find((t) => t.id === threadId);
      if (!thread) return sendJson(res, 404, { error: 'Thread not found' });

      const reply = {
        id: `reply-${Date.now()}`,
        author: body.author || 'Anonymous',
        text: body.text || '',
        createdAt: new Date().toISOString(),
      };
      thread.replies.push(reply);
      writeDiscussions(data);
      return sendJson(res, 201, reply);
    } catch {
      return sendJson(res, 400, { error: 'Invalid request body' });
    }
  }

  if (urlPath === '/api/meetings' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const data = readDiscussions();
      const meeting = {
        id: `meeting-${Date.now()}`,
        clubId: body.clubId || 'default-club',
        bookId: body.bookId,
        date: body.date,
        location: body.location || '',
        notes: body.notes || '',
      };
      data.meetings.unshift(meeting);
      writeDiscussions(data);
      return sendJson(res, 201, meeting);
    } catch {
      return sendJson(res, 400, { error: 'Invalid request body' });
    }
  }

  if (urlPath === '/api/library-search' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const upstream = await fetch('https://libraryfinder.api.overdrive.com/v2/Branches/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });

      if (!upstream.ok) {
        return sendJson(res, upstream.status, { error: 'Library finder request failed' });
      }

      const data = await upstream.json();
      const seen = new Map();

      for (const branch of data.branches || []) {
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
            instantCard: Boolean(system.isInstantAccessEnabled),
          });
        }
      }

      return sendJson(res, 200, { libraries: [...seen.values()] });
    } catch {
      return sendJson(res, 500, { error: 'Library search error' });
    }
  }

  if (urlPath === '/api/epub-proxy' && req.method === 'GET') {
    try {
      const target = new URL(req.url, 'http://localhost').searchParams.get('url');
      if (!target) return sendJson(res, 400, { error: 'Missing url parameter' });

      const parsed = new URL(target);
      if (!ALLOWED_EPUB_HOSTS.has(parsed.hostname)) {
        return sendJson(res, 403, { error: 'Host not allowed' });
      }

      const upstream = await fetch(target);
      if (!upstream.ok) {
        return sendJson(res, upstream.status, { error: 'Upstream fetch failed' });
      }

      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(200, {
        'Content-Type': 'application/epub+zip',
        'Content-Length': buffer.length,
        'Cache-Control': 'public, max-age=86400',
      });
      return res.end(buffer);
    } catch {
      return sendJson(res, 500, { error: 'EPUB proxy error' });
    }
  }

  if (urlPath === '/api/clubs' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const data = readDiscussions();
      const club = {
        id: `club-${Date.now()}`,
        name: body.name || 'New Book Club',
        description: body.description || '',
        createdAt: new Date().toISOString(),
        members: body.members || [],
      };
      data.clubs.push(club);
      writeDiscussions(data);
      return sendJson(res, 201, club);
    } catch {
      return sendJson(res, 400, { error: 'Invalid request body' });
    }
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Book Club Discussion app → http://localhost:${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use — app may already be running at http://localhost:${PORT}`);
    process.exit(1);
  }
  throw err;
});
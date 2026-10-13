const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');
const resultCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_PARALLEL_ARTISTS = 3;

for (const file of ['.env.local', '.env']) {
  const full = path.join(__dirname, file);
  if (!fs.existsSync(full)) continue;
  for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][\w]*)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 100000) reject(new Error('Request too large')); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Invalid request')); } });
    req.on('error', reject);
  });
}

function cleanArtists(value) {
  return Array.isArray(value) ? value.map(v => String(v).trim()).filter(Boolean).slice(0, 8) : [];
}

function discoveryGoal(artist, research) {
  return `You are the verification engine for a London concert alert product. Find a maximum of 3 currently announced, upcoming London concerts for ONLY this artist: ${artist}.

Search and page extracts have already been collected below. Start with them, then use the live page only to verify missing or dynamic facts. Prefer speed over broad exploration. Check official artist/venue pages and the UK pages of Ticketmaster, AXS, and DICE. Look specifically for public presale information or codes posted by official sources. Never invent an event, price, code, or availability.

PRE-COLLECTED RESEARCH:
${research || 'No readable page extracts were available; verify from the starting page.'}

Return ONLY valid JSON with this shape:
{
  "checkedAt": "ISO timestamp",
  "events": [{
    "id": "stable short slug",
    "artist": "artist",
    "title": "tour/show name",
    "venue": "London venue",
    "date": "human-readable date and time or Not announced",
    "dateISO": "ISO date if known or empty string",
    "presaleDate": "date/time or Not found",
    "generalSaleDate": "date/time or Not found",
    "status": "presale|on-sale|announced|sold-out|unknown",
    "price": "verified price/range including currency, or Not shown",
    "availability": "concise verified availability or Unable to verify",
    "seller": "Ticketmaster|AXS|DICE|Official venue|Other official",
    "purchaseUrl": "direct official ticket URL",
    "sourceUrl": "URL supporting event facts",
    "presale": {"published": true, "code": "public official code or empty", "instructions": "official signup/eligibility instructions or empty", "url": "official source URL or empty"}
  }],
  "sources": [{"title":"source title","url":"https://..."}],
  "notes": ["short verification limitation only when relevant"]
}

Rules: London means Greater London. Exclude past events and unofficial resale marketplaces. Prefer direct event pages. If no event is verified for an artist, do not create one. A presale code may be returned only if publicly posted by an artist, promoter, venue, or official seller. Do not return markdown.`;
}

function writeEvent(res, value) {
  if (!res.writableEnded) res.write(JSON.stringify(value) + '\n');
}

function parseAgentResult(raw) {
  if (raw && typeof raw === 'object') return raw;
  const text = String(raw || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(text); } catch { return { events: [], sources: [], notes: ['TinyFish returned an unreadable result.'] }; }
}

async function searchArtist(artist, key) {
  const params = new URLSearchParams({
    query: `${artist} London concert tickets 2026 2027 Ticketmaster AXS DICE official`,
    purpose: `Find official upcoming London concert and ticket pages for ${artist}`,
    location: 'GB',
    language: 'en'
  });
  const response = await fetch(`https://api.search.tinyfish.ai?${params}`, {
    headers: { 'X-API-Key': key },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`Search returned ${response.status}`);
  const data = await response.json();
  return Array.isArray(data.results) ? data.results.slice(0, 6) : [];
}

function rankCandidate(result) {
  const url = String(result.url || '');
  const preferred = ['ticketmaster.co.uk', 'axs.com', 'dice.fm', 'livenation.co.uk', 'theo2.co.uk', 'wembleystadium.com'];
  const index = preferred.findIndex(domain => url.includes(domain));
  return index < 0 ? 0 : 100 - index;
}

async function fetchCandidates(results, key) {
  const urls = [...new Set(results.slice().sort((a, b) => rankCandidate(b) - rankCandidate(a)).map(item => item.url).filter(Boolean))].slice(0, 5);
  if (!urls.length) return [];
  const response = await fetch('https://api.fetch.tinyfish.ai', {
    method: 'POST',
    headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls, purpose: 'Extract London event dates, venues, sale dates, public presale details, prices and availability.', format: 'markdown', links: false, image_links: false, ttl: 300, per_url_timeout_ms: 20000 }),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`Fetch returned ${response.status}`);
  const data = await response.json();
  return Array.isArray(data.results) ? data.results : [];
}

function researchSummary(searchResults, pages) {
  const snippets = searchResults.slice(0, 6).map((item, i) => `[Search ${i + 1}] ${item.title || ''}\n${item.snippet || ''}\n${item.url || ''}`);
  const extracts = pages.slice(0, 5).map((page, i) => `[Page ${i + 1}] ${page.title || ''}\n${String(page.text || '').slice(0, 2200)}\n${page.final_url || page.url || ''}`);
  return [...snippets, ...extracts].join('\n\n').slice(0, 13000);
}

async function verifyArtist(artist, searchResults, pages, key, onProgress, onStream) {
  const best = searchResults.slice().sort((a, b) => rankCandidate(b) - rankCandidate(a))[0];
  const query = encodeURIComponent(`${artist} London concert tickets official`);
  const upstream = await fetch('https://agent.tinyfish.ai/v1/automation/run-sse', {
    method: 'POST',
    headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: best?.url || `https://www.google.com/search?q=${query}`,
      goal: discoveryGoal(artist, researchSummary(searchResults, pages)),
      browser_profile: 'lite',
      proxy_config: { enabled: true, type: 'tetra', country_code: 'GB' }
    }),
    signal: AbortSignal.timeout(180000)
  });
  if (!upstream.ok || !upstream.body) throw new Error(`Agent could not start (${upstream.status})`);

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const raw of lines) {
      if (!raw.startsWith('data:')) continue;
      try {
        const event = JSON.parse(raw.slice(5).trim());
        if (event.type === 'STREAMING_URL') onStream(event.streamingUrl);
        if (event.type === 'PROGRESS') onProgress(event.purpose || 'Verifying official ticket pages…');
        if (event.type === 'COMPLETE') result = parseAgentResult(event.resultJson ?? event.result);
        if (event.type === 'ERROR' || event.status === 'FAILED') throw new Error(event.error || 'Agent could not complete verification.');
      } catch (error) {
        if (error.message?.includes('verification')) throw error;
      }
    }
    if (done) break;
  }
  if (!result) throw new Error('Agent ended before returning results.');
  return result;
}

async function scanArtist(artist, key, res, index, total) {
  const cacheKey = artist.toLowerCase();
  const cached = resultCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
    writeEvent(res, { type: 'artist_complete', artist, index, total, cached: true, data: cached.data });
    return cached.data;
  }

  writeEvent(res, { type: 'artist_started', artist, index, total });
  let searchResults = [];
  let pages = [];
  try {
    writeEvent(res, { type: 'progress', artist, index, total, message: `Finding official pages for ${artist}…` });
    searchResults = await searchArtist(artist, key);
    writeEvent(res, { type: 'progress', artist, index, total, message: `Reading the best ticket pages for ${artist}…` });
    pages = await fetchCandidates(searchResults, key);
  } catch (error) {
    writeEvent(res, { type: 'progress', artist, index, total, message: `Verifying ${artist} directly…` });
  }

  const data = await verifyArtist(
    artist,
    searchResults,
    pages,
    key,
    message => writeEvent(res, { type: 'progress', artist, index, total, message: `${artist}: ${message}` }),
    url => writeEvent(res, { type: 'stream', artist, url })
  );
  resultCache.set(cacheKey, { savedAt: Date.now(), data });
  writeEvent(res, { type: 'artist_complete', artist, index, total, cached: false, data });
  return data;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      try { results[index] = await worker(items[index], index); }
      catch (error) { results[index] = { events: [], sources: [], notes: [`${items[index]}: ${error.message}`] }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function discover(req, res) {
  try {
    const { artists: rawArtists } = await readBody(req);
    const artists = cleanArtists(rawArtists);
    if (!artists.length) return json(res, 400, { error: 'Choose at least one artist.' });
    const key = process.env.TINYFISH_API_KEY;
    if (!key) return json(res, 500, { error: 'Add TINYFISH_API_KEY to .env.local, then restart the app.' });

    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    const results = await mapWithConcurrency(artists, MAX_PARALLEL_ARTISTS, (artist, index) => scanArtist(artist, key, res, index + 1, artists.length));
    const combined = {
      checkedAt: new Date().toISOString(),
      events: results.flatMap(result => Array.isArray(result?.events) ? result.events : []),
      sources: results.flatMap(result => Array.isArray(result?.sources) ? result.sources : []),
      notes: results.flatMap(result => Array.isArray(result?.notes) ? result.notes : [])
    };
    writeEvent(res, { type: 'complete', data: combined });
    res.end();
  } catch (error) {
    if (!res.headersSent) json(res, 500, { error: error.message || 'Concert search failed.' });
    else { res.write(JSON.stringify({ type: 'error', message: error.message || 'Concert search failed.' }) + '\n'); res.end(); }
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/discover') return discover(req, res);
  const rawPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const filePath = path.resolve(publicDir, '.' + rawPath);
  if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return json(res, 404, { error: 'Not found' });
  const ext = path.extname(filePath);
  const types = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.svg':'image/svg+xml' };
  res.writeHead(200, { 'Content-Type': `${types[ext] || 'application/octet-stream'}; charset=utf-8` });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => console.log(`TicketRadar is ready at http://localhost:${PORT}`));

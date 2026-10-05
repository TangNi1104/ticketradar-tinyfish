const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');

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

function discoveryGoal(artists) {
  return `You are the live-web research engine for a London concert alert product. Find currently announced, upcoming London concerts for ONLY these artists: ${artists.join(', ')}.

Investigate official artist/venue pages and the UK pages of Ticketmaster, AXS, and DICE. Verify facts on the live web. Look specifically for public presale information or codes posted by official sources. Never invent an event, price, code, or availability. Return ONLY valid JSON with this shape:
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

async function discover(req, res) {
  try {
    const { artists: rawArtists } = await readBody(req);
    const artists = cleanArtists(rawArtists);
    if (!artists.length) return json(res, 400, { error: 'Choose at least one artist.' });
    const key = process.env.TINYFISH_API_KEY;
    if (!key) return json(res, 500, { error: 'Add TINYFISH_API_KEY to .env.local, then restart the app.' });

    const query = encodeURIComponent(`${artists.join(' OR ')} London concert tickets Ticketmaster AXS DICE`);
    const upstream = await fetch('https://agent.tinyfish.ai/v1/automation/run-sse', {
      method: 'POST',
      headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `https://www.google.com/search?q=${query}`,
        goal: discoveryGoal(artists),
        browser_profile: 'lite',
        proxy_config: { enabled: true, type: 'tetra', country_code: 'GB' }
      }),
      // Multi-source ticket checks can include dynamic seller pages and queues.
      // Allow enough time for TinyFish to finish rather than returning partial data.
      signal: AbortSignal.timeout(300000)
    });
    if (!upstream.ok || !upstream.body) throw new Error(`TinyFish could not start (${upstream.status}).`);

    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const raw of lines) {
        if (!raw.startsWith('data:')) continue;
        try {
          const event = JSON.parse(raw.slice(5).trim());
          if (event.type === 'STREAMING_URL') res.write(JSON.stringify({ type: 'stream', url: event.streamingUrl }) + '\n');
          if (event.type === 'PROGRESS') res.write(JSON.stringify({ type: 'progress', message: event.purpose || 'Checking official ticket sites…' }) + '\n');
          if (event.type === 'COMPLETE') res.write(JSON.stringify({ type: 'complete', data: event.resultJson ?? event.result }) + '\n');
          if (event.type === 'ERROR' || event.status === 'FAILED') res.write(JSON.stringify({ type: 'error', message: event.error || 'TinyFish could not complete the search.' }) + '\n');
        } catch {}
      }
      if (done) break;
    }
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

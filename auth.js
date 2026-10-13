const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const dataDir = process.env.TICKETRADAR_DATA_DIR || path.join(__dirname, '.data');
const usersFile = path.join(dataDir, 'users.json');
const sessions = new Map();

function loadUsers() {
  try { return JSON.parse(fs.readFileSync(usersFile, 'utf8')); } catch { return {}; }
}

function saveUsers(users) {
  fs.mkdirSync(dataDir, { recursive: true });
  const temporary = `${usersFile}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(users, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, usersFile);
}

function normalizedEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function normalizedUsername(value) {
  const username = String(value || '').trim().toLowerCase();
  return /^[a-z0-9_]{3,24}$/.test(username) ? username : '';
}

function cleanProfile(value) {
  const source = value && typeof value === 'object' ? value : {};
  const artists = Array.isArray(source.artists) ? source.artists.map(v => String(v).trim()).filter(Boolean).slice(0, 8) : [];
  const watches = source.watches && typeof source.watches === 'object' && !Array.isArray(source.watches) ? Object.fromEntries(Object.entries(source.watches).slice(0, 100)) : {};
  return { artists, watches, notificationEmail: normalizedEmail(source.notificationEmail) };
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(part => part.trim().split('=').map(decodeURIComponent)).filter(parts => parts.length === 2));
}

function currentUsername(req) {
  const token = cookies(req).tr_session;
  const session = token && sessions.get(token);
  if (!session || session.expiresAt < Date.now()) { if (token) sessions.delete(token); return ''; }
  return session.username;
}

function startSession(res, username) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  res.setHeader('Set-Cookie', `tr_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);
}

async function handleAuth(req, res, pathname, readBody, json) {
  if (!pathname.startsWith('/api/auth/') && pathname !== '/api/profile') return false;
  const users = loadUsers();

  if (req.method === 'POST' && pathname === '/api/auth/signup') {
    const body = await readBody(req);
    const username = normalizedUsername(body.username);
    const password = String(body.password || '');
    if (!username) return json(res, 400, { error: 'Username must be 3–24 letters, numbers, or underscores.' }), true;
    if (password.length < 8) return json(res, 400, { error: 'Password must be at least 8 characters.' }), true;
    if (users[username]) return json(res, 409, { error: 'That username is taken. Choose another one.' }), true;
    const salt = crypto.randomBytes(16).toString('hex');
    users[username] = { salt, hash: hashPassword(password, salt), profile: cleanProfile(body.profile) };
    saveUsers(users); startSession(res, username);
    return json(res, 201, { username, profile: users[username].profile }), true;
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const body = await readBody(req);
    const username = normalizedUsername(body.username);
    const password = String(body.password || '');
    const user = users[username];
    const supplied = user ? Buffer.from(hashPassword(password, user.salt), 'hex') : Buffer.alloc(64);
    const expected = user ? Buffer.from(user.hash, 'hex') : crypto.randomBytes(64);
    if (!user || !crypto.timingSafeEqual(supplied, expected)) return json(res, 401, { error: 'Username or password is incorrect.' }), true;
    startSession(res, username);
    return json(res, 200, { username, profile: cleanProfile(user.profile) }), true;
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    const token = cookies(req).tr_session;
    if (token) sessions.delete(token);
    res.setHeader('Set-Cookie', 'tr_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    return json(res, 200, { ok: true }), true;
  }

  const username = currentUsername(req);
  if (req.method === 'GET' && pathname === '/api/auth/me') {
    if (!username || !users[username]) return json(res, 401, { error: 'Not logged in.' }), true;
    return json(res, 200, { username, profile: cleanProfile(users[username].profile) }), true;
  }

  if (req.method === 'PUT' && pathname === '/api/profile') {
    if (!username || !users[username]) return json(res, 401, { error: 'Log in to sync preferences.' }), true;
    const body = await readBody(req);
    users[username].profile = cleanProfile(body);
    saveUsers(users);
    return json(res, 200, { username, profile: users[username].profile }), true;
  }

  json(res, 405, { error: 'Method not allowed' });
  return true;
}

module.exports = { handleAuth };

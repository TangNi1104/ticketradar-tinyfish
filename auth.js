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

function cleanProfile(value, email) {
  const source = value && typeof value === 'object' ? value : {};
  const artists = Array.isArray(source.artists) ? source.artists.map(v => String(v).trim()).filter(Boolean).slice(0, 8) : [];
  const watches = source.watches && typeof source.watches === 'object' && !Array.isArray(source.watches) ? Object.fromEntries(Object.entries(source.watches).slice(0, 100)) : {};
  return { artists, watches, notificationEmail: normalizedEmail(source.notificationEmail) || email };
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(part => part.trim().split('=').map(decodeURIComponent)).filter(parts => parts.length === 2));
}

function currentEmail(req) {
  const token = cookies(req).tr_session;
  const session = token && sessions.get(token);
  if (!session || session.expiresAt < Date.now()) { if (token) sessions.delete(token); return ''; }
  return session.email;
}

function startSession(res, email) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { email, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  res.setHeader('Set-Cookie', `tr_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);
}

async function handleAuth(req, res, pathname, readBody, json) {
  if (!pathname.startsWith('/api/auth/') && pathname !== '/api/profile') return false;
  const users = loadUsers();

  if (req.method === 'POST' && pathname === '/api/auth/signup') {
    const body = await readBody(req);
    const email = normalizedEmail(body.email);
    const password = String(body.password || '');
    if (!email) return json(res, 400, { error: 'Enter a valid email address.' }), true;
    if (password.length < 8) return json(res, 400, { error: 'Password must be at least 8 characters.' }), true;
    if (users[email]) return json(res, 409, { error: 'An account already exists. Log in instead.' }), true;
    const salt = crypto.randomBytes(16).toString('hex');
    users[email] = { salt, hash: hashPassword(password, salt), profile: cleanProfile(body.profile, email) };
    saveUsers(users); startSession(res, email);
    return json(res, 201, { email, profile: users[email].profile }), true;
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const body = await readBody(req);
    const email = normalizedEmail(body.email);
    const password = String(body.password || '');
    const user = users[email];
    const supplied = user ? Buffer.from(hashPassword(password, user.salt), 'hex') : Buffer.alloc(64);
    const expected = user ? Buffer.from(user.hash, 'hex') : crypto.randomBytes(64);
    if (!user || !crypto.timingSafeEqual(supplied, expected)) return json(res, 401, { error: 'Email or password is incorrect.' }), true;
    startSession(res, email);
    return json(res, 200, { email, profile: cleanProfile(user.profile, email) }), true;
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    const token = cookies(req).tr_session;
    if (token) sessions.delete(token);
    res.setHeader('Set-Cookie', 'tr_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    return json(res, 200, { ok: true }), true;
  }

  const email = currentEmail(req);
  if (req.method === 'GET' && pathname === '/api/auth/me') {
    if (!email || !users[email]) return json(res, 401, { error: 'Not logged in.' }), true;
    return json(res, 200, { email, profile: cleanProfile(users[email].profile, email) }), true;
  }

  if (req.method === 'PUT' && pathname === '/api/profile') {
    if (!email || !users[email]) return json(res, 401, { error: 'Log in to sync preferences.' }), true;
    const body = await readBody(req);
    users[email].profile = cleanProfile(body, email);
    saveUsers(users);
    return json(res, 200, { email, profile: users[email].profile }), true;
  }

  json(res, 405, { error: 'Method not allowed' });
  return true;
}

module.exports = { handleAuth };

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { GoogleAuth } = require('google-auth-library');
const { aggregateDay } = require('./lib/production');

const PORT = Number(process.env.PORT) || 3000;
const SHEET_ID = process.env.SHEET_ID || '1YVvXDVkLQmjQ8zgWlC_Ax-qiP9u8uh2wQfALA53KhOc';
const SHEET_NAME = process.env.SHEET_NAME || 'Production Sheet';
const TIMEZONE = process.env.TIMEZONE || 'America/Los_Angeles';
const CACHE_SECONDS = Number(process.env.CACHE_SECONDS) || 60;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || '';
const DEMO = process.env.DEMO_MODE === '1';

const INDEX_HTML = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));

// ---------- Google Sheets ----------

function loadCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return JSON.parse(text);
}

let auth = null;
function getAuth() {
  if (!auth) {
    const credentials = loadCredentials();
    if (!credentials) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
    auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
  }
  return auth;
}

let cache = { at: 0, rows: null, pending: null };

async function fetchRows() {
  if (DEMO) return require('./test/fixture').rows;
  const fresh = cache.rows && Date.now() - cache.at < CACHE_SECONDS * 1000;
  if (fresh) return cache.rows;
  if (cache.pending) return cache.pending;

  cache.pending = (async () => {
    const client = await getAuth().getClient();
    const range = encodeURIComponent(`'${SHEET_NAME}'`);
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}` +
      `?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`;
    const res = await client.request({ url });
    cache = { at: Date.now(), rows: res.data.values || [], pending: null };
    return cache.rows;
  })().catch((err) => {
    cache.pending = null;
    throw err;
  });
  return cache.pending;
}

function todayIso() {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
}

// ---------- HTTP ----------

function checkAuth(req, res) {
  if (!DASHBOARD_PASSWORD) return true;
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const pass = Buffer.from(encoded, 'base64').toString('utf8').split(':').slice(1).join(':');
    const a = Buffer.from(pass);
    const b = Buffer.from(DASHBOARD_PASSWORD);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Daily Sales"' });
  res.end('Authentication required');
  return false;
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true });
  if (!checkAuth(req, res)) return;

  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(INDEX_HTML);
  }

  if (url.pathname === '/api/production') {
    const today = DEMO ? require('./test/fixture').today : todayIso();
    const date = url.searchParams.get('date') || today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return sendJson(res, 400, { error: 'date must be YYYY-MM-DD' });
    try {
      const rows = await fetchRows();
      const data = aggregateDay(rows, date);
      return sendJson(res, 200, { ...data, today, updatedAt: new Date(cache.at || Date.now()).toISOString() });
    } catch (err) {
      console.error('production error:', err.message);
      return sendJson(res, 502, { error: 'Could not read the production sheet. Check server logs.' });
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Daily sales dashboard listening on :${PORT}${DEMO ? ' (demo mode)' : ''}`);
});

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { aggregateDay } = require('./production');

const INDEX_HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'));

/**
 * Builds the dashboard HTTP server.
 *
 * Live updates: while at least one browser is connected to /api/events, a
 * single poller re-reads the sheet every `pollSeconds`. When the rows change
 * it broadcasts an `update` event and every open dashboard refetches.
 *
 * @param {object} o
 * @param {() => Promise<string[][]>} o.loadRows   reads the sheet (uncached)
 * @param {() => string} o.today                   'YYYY-MM-DD' for "today"
 * @param {number} [o.pollSeconds=15]
 * @param {number} [o.keepAliveSeconds=25]
 */
function createApp({ loadRows, today, pollSeconds = 15, keepAliveSeconds = 25, log = console }) {
  const state = { rows: null, at: 0, version: '', pending: null };
  const clients = new Set();
  let pollTimer = null;
  let keepAliveTimer = null;

  function digest(rows) {
    return crypto.createHash('sha1').update(JSON.stringify(rows)).digest('hex').slice(0, 12);
  }

  /** Reads the sheet (deduped) and returns true if its contents changed. */
  function refresh() {
    if (state.pending) return state.pending;
    state.pending = (async () => {
      const rows = await loadRows();
      const version = digest(rows);
      const changed = version !== state.version;
      Object.assign(state, { rows, version, at: Date.now() });
      return changed;
    })().finally(() => { state.pending = null; });
    return state.pending;
  }

  async function getRows() {
    const fresh = state.rows && Date.now() - state.at < pollSeconds * 1000;
    if (!fresh) await refresh();
    return state.rows;
  }

  function broadcast(event, data) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(msg);
  }

  let lastPollError = '';
  async function poll() {
    try {
      const before = state.version;
      const changed = await refresh();
      if (lastPollError) { log.error('poll recovered'); lastPollError = ''; }
      if (changed && before) broadcast('update', { version: state.version });
    } catch (err) {
      // Log each distinct failure once instead of every POLL_SECONDS.
      if (err.message !== lastPollError) log.error('poll error:', err.message);
      lastPollError = err.message;
    }
  }

  function startTimers() {
    if (!pollTimer) pollTimer = setInterval(poll, pollSeconds * 1000);
    if (!keepAliveTimer) {
      // Comment frames keep proxies (Railway's included) from closing idle streams.
      keepAliveTimer = setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, keepAliveSeconds * 1000);
    }
  }
  function stopTimersIfIdle() {
    if (clients.size) return;
    clearInterval(pollTimer); pollTimer = null;
    clearInterval(keepAliveTimer); keepAliveTimer = null;
  }

  function sendJson(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true });

    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(INDEX_HTML);
    }

    if (url.pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(`retry: 5000\nevent: hello\ndata: ${JSON.stringify({ version: state.version, pollSeconds })}\n\n`);
      clients.add(res);
      startTimers();
      req.on('close', () => { clients.delete(res); stopTimersIfIdle(); });
      return;
    }

    if (url.pathname === '/api/production') {
      const t = today();
      const date = url.searchParams.get('date') || t;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return sendJson(res, 400, { error: 'date must be YYYY-MM-DD' });
      try {
        const rows = await getRows();
        const data = aggregateDay(rows, date);
        return sendJson(res, 200, {
          ...data,
          today: t,
          version: state.version,
          updatedAt: new Date(state.at).toISOString(),
        });
      } catch (err) {
        log.error('production error:', err.message);
        // Setup problems are safe and useful to show; anything else stays in the logs.
        const msg = err.code === 'CONFIG'
          ? err.message
          : 'Could not read the production sheet. Check the server logs.';
        return sendJson(res, err.code === 'CONFIG' ? 503 : 502, { error: msg });
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  server.on('close', () => {
    for (const res of clients) res.end();
    clients.clear();
    stopTimersIfIdle();
  });

  return server;
}

module.exports = { createApp };

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../lib/app');
const fixture = require('./fixture');

function start(opts) {
  const app = createApp({ log: { error() {} }, ...opts });
  return new Promise((resolve) => app.listen(0, () => resolve({ app, base: `http://127.0.0.1:${app.address().port}` })));
}

/** Reads SSE events from a fetch stream; resolves when `name` arrives. */
function sseReader(body) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  return async function next(name, timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const i = buf.indexOf('\n\n');
      if (i >= 0) {
        const frame = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = /^event: (.+)$/m.exec(frame);
        if (ev && ev[1] === name) return JSON.parse(/^data: (.+)$/m.exec(frame)[1]);
        continue;
      }
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${name}`);
      const { value, done } = await reader.read();
      if (done) throw new Error('stream closed');
      buf += dec.decode(value, { stream: true });
    }
  };
}

test('pushes an update to open dashboards when the sheet changes', async () => {
  let rows = fixture.rows.slice();
  const { app, base } = await start({ loadRows: async () => rows, today: () => fixture.today, pollSeconds: 0.1 });
  try {
    const before = await (await fetch(`${base}/api/production`)).json();
    assert.equal(before.total.apps, 5);

    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/events`, { signal: ctrl.signal });
    assert.equal(res.headers.get('content-type'), 'text/event-stream');
    const next = sseReader(res.body);
    await next('hello');

    // Someone adds a policy to the sheet.
    rows = [...rows, ['x@example.com', 'Sean', 'New Client', 'Aetna', 'CA', 'CHS', '$100.00', '$1,000.00', '', '', '', '11/5/26']];
    const evt = await next('update');
    assert.ok(evt.version);

    const after = await (await fetch(`${base}/api/production`)).json();
    assert.equal(after.total.apps, 6);
    assert.equal(after.total.revenue, 3695.29);
    assert.equal(after.version, evt.version);
    ctrl.abort();
  } finally {
    app.close(); app.closeAllConnections();
  }
});

test('does not push when nothing changed', async () => {
  const { app, base } = await start({ loadRows: async () => fixture.rows, today: () => fixture.today, pollSeconds: 0.05 });
  try {
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/events`, { signal: ctrl.signal });
    const next = sseReader(res.body);
    await next('hello');
    await assert.rejects(next('update', 400), /timed out/);
    ctrl.abort();
  } finally {
    app.close(); app.closeAllConnections();
  }
});

test('sheet read failures return a 502 without leaking details', async () => {
  const { app, base } = await start({ loadRows: async () => { throw new Error('secret detail'); }, today: () => fixture.today });
  try {
    const res = await fetch(`${base}/api/production`);
    assert.equal(res.status, 502);
    assert.doesNotMatch(await res.text(), /secret/);
  } finally {
    app.close(); app.closeAllConnections();
  }
});

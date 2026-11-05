'use strict';

const { GoogleAuth } = require('google-auth-library');
const { createApp } = require('./lib/app');

const PORT = Number(process.env.PORT) || 3000;
const SHEET_ID = process.env.SHEET_ID || '1YVvXDVkLQmjQ8zgWlC_Ax-qiP9u8uh2wQfALA53KhOc';
const SHEET_NAME = process.env.SHEET_NAME || 'Production Sheet';
const TIMEZONE = process.env.TIMEZONE || 'America/Los_Angeles';
const POLL_SECONDS = Number(process.env.POLL_SECONDS) || 15;
const DEMO = process.env.DEMO_MODE === '1';

function loadCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return JSON.parse(text);
}

let auth = null;
async function loadSheetRows() {
  if (!auth) {
    auth = new GoogleAuth({
      credentials: loadCredentials(),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
  }
  const client = await auth.getClient();
  const range = encodeURIComponent(`'${SHEET_NAME}'`);
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}` +
    `?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`;
  const res = await client.request({ url });
  return res.data.values || [];
}

function todayIso() {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
}

const fixture = DEMO ? require('./test/fixture') : null;
const app = createApp({
  loadRows: DEMO ? async () => fixture.rows : loadSheetRows,
  today: DEMO ? () => fixture.today : todayIso,
  pollSeconds: POLL_SECONDS,
});

app.listen(PORT, () => {
  console.log(`Daily sales dashboard listening on :${PORT}${DEMO ? ' (demo mode)' : ''}`);
});

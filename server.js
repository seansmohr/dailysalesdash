'use strict';

const { GoogleAuth } = require('google-auth-library');
const { createApp } = require('./lib/app');

const PORT = Number(process.env.PORT) || 3000;
const SHEET_ID = process.env.SHEET_ID || '1YVvXDVkLQmjQ8zgWlC_Ax-qiP9u8uh2wQfALA53KhOc';
const SHEET_NAME = process.env.SHEET_NAME || 'Production Sheet';
const TIMEZONE = process.env.TIMEZONE || 'America/Los_Angeles';
const POLL_SECONDS = Number(process.env.POLL_SECONDS) || 15;
const DEMO = process.env.DEMO_MODE === '1';

function configError(message) {
  return Object.assign(new Error(message), { code: 'CONFIG' });
}

function loadCredentials() {
  const raw = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) {
    throw configError('Setup needed: add the GOOGLE_SERVICE_ACCOUNT_JSON variable in Railway (see README).');
  }
  try {
    const text = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const creds = JSON.parse(text);
    if (!creds.client_email || !creds.private_key) throw new Error('missing fields');
    return creds;
  } catch {
    throw configError('GOOGLE_SERVICE_ACCOUNT_JSON is not a valid service account key. Paste the whole .json key file contents.');
  }
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
  try {
    const res = await client.request({ url });
    return res.data.values || [];
  } catch (err) {
    const status = err.response && err.response.status;
    if (status === 403 || status === 404) {
      throw configError(
        `The service account can't open the sheet. Share the Master Production Sheet with ` +
        `${auth.jsonContent ? auth.jsonContent.client_email : 'the service account email'} as a Viewer, ` +
        `and make sure the Google Sheets API is enabled.`,
      );
    }
    if (status === 400) throw configError(`Tab "${SHEET_NAME}" was not found in the sheet. Check SHEET_NAME.`);
    throw err;
  }
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
  if (!DEMO && !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    console.warn('WARNING: GOOGLE_SERVICE_ACCOUNT_JSON is not set. The dashboard cannot read the sheet until it is.');
  }
});

// Railway sends SIGTERM when replacing a deployment; exit cleanly.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    app.close();
    app.closeAllConnections();
    process.exit(0);
  });
}

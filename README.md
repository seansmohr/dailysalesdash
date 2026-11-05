# Daily Sales Dashboard

A clean, live dashboard of each agent's daily production. It reads the
**Production Sheet** tab of the **Master Production Sheet** in Google Sheets.

- Two headline numbers at the top: **total produced** and **policies written**, plus monthly premium, agents producing and top producer
- A bar chart of each agent's production for the day, sorted highest first, with each agent's policy count
- Switch between **Revenue** (Projected Rev), **Premium**, and **Policies**
- Change days with ‹ › or the date picker (← → keys work too)
- **Updates live**: about 15 seconds after anyone edits the sheet, every open dashboard
  refreshes by itself, with no reload. Changed totals briefly highlight.
- Only per-agent totals reach the browser. Client names, phone numbers and
  Medicare numbers stay in the sheet.

Production is grouped by **App Date**. Agents with an app in the last 45 days
still appear on days they wrote nothing, so a $0 shows up on the board.

## Deploy on Railway

### 1. Create a Google service account (one time)

1. In [Google Cloud Console](https://console.cloud.google.com/), create or pick a project.
2. **APIs & Services → Library** → turn on the **Google Sheets API**.
3. **IAM & Admin → Service Accounts → Create service account** (it needs no roles).
4. Open the account → **Keys → Add key → JSON**. A `.json` file downloads.
5. Open the **Master Production Sheet** → **Share**. Add the service account's
   email (`...@...iam.gserviceaccount.com`) as a **Viewer**.

### 2. Deploy

1. In Railway: **New Project → Deploy from GitHub repo** → pick this repo.
2. Under **Variables**, add:

| Variable | Required | Value |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | yes | The whole contents of the key `.json` file (raw JSON or base64) |
| `SHEET_ID` | no | Defaults to the Master Production Sheet |
| `SHEET_NAME` | no | Defaults to `Production Sheet` |
| `TIMEZONE` | no | Sets which day counts as "today". Defaults to `America/Los_Angeles` |
| `POLL_SECONDS` | no | How often the server checks the sheet for changes. Defaults to `15` |

3. **Settings → Networking → Generate Domain**. Open the URL. No login is needed: anyone with the link can view it.

Railway sets `PORT` itself. The health check is at `/healthz`.

## Run locally

```bash
npm install
```

```bash
DEMO_MODE=1 npm start
```

Demo mode uses made-up data from `test/fixture.js`. To use the real sheet, set
`GOOGLE_SERVICE_ACCOUNT_JSON` instead. Then open http://localhost:3000.

```bash
npm test
```

## How live updates work

While anyone has the dashboard open, the server reads the sheet every
`POLL_SECONDS`. It does this once, however many screens are open. When the
data changes, it sends a message over `/api/events` (Server-Sent Events) and
every open page fetches the new totals. When nobody is watching, the server
stops checking. If the connection drops, the page reconnects by itself and
refreshes once a minute as a backup.

At the default 15 seconds that's about 4 sheet reads a minute, well under
Google's free limit of 300 a minute.

## Sheet assumptions

The server finds columns by their header text in row 1: `Agent`, `Premium`,
`Projected Rev` and `App Date`. You can move them around. If you rename them,
update `DEFAULT_COLS` in `lib/production.js`. Dates in `m/d/yy`, `m/d/yyyy`
or `yyyy-mm-dd` form all work.

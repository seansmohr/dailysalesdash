'use strict';

/**
 * Pure aggregation over the "Production Sheet" rows (formatted values).
 * Returns per-agent totals for one app date. Only aggregates leave this
 * module; client names, phones and Medicare numbers are never exposed.
 */

const DEFAULT_COLS = {
  agent: 'Agent',
  premium: 'Premium',
  revenue: 'Projected Rev',
  appDate: 'App Date',
};

/** Accepts m/d/yy, m/d/yyyy, yyyy-mm-dd. Returns 'YYYY-MM-DD' or null. */
function parseDate(v) {
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${pad(m[1])}-${pad(m[2])}`;
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  return null;
}

function parseMoney(v) {
  let s = String(v ?? '').replace(/[$,\s]/g, '');
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()\-]/g, '');
  const n = parseFloat(s);
  if (Number.isNaN(n)) return 0;
  return neg ? -n : n;
}

function shiftIso(iso, days) {
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/** Normalize an agent name so "James " and "james" merge into "James". */
function normalizeAgent(v) {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return '';
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * @param {string[][]} rows     sheet values including header row
 * @param {string} date         'YYYY-MM-DD'
 * @param {object} [opts]       { cols, rosterDays }
 */
function aggregateDay(rows, date, opts = {}) {
  const cols = { ...DEFAULT_COLS, ...(opts.cols || {}) };
  const rosterDays = opts.rosterDays ?? 45;
  if (!rows || !rows.length) throw new Error('Sheet is empty');

  const header = rows[0].map((h) => String(h).trim().toLowerCase());
  const idx = {};
  for (const [k, name] of Object.entries(cols)) {
    idx[k] = header.indexOf(name.toLowerCase());
    if (idx[k] < 0) throw new Error(`Column "${name}" not found in header`);
  }

  const rosterCutoff = shiftIso(date, -rosterDays);
  const byAgent = new Map();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const agent = normalizeAgent(row[idx.agent]);
    const appDate = parseDate(row[idx.appDate]);
    if (!agent || !appDate) continue;

    // Recently active agents appear on the board even with a $0 day.
    if (appDate > rosterCutoff && appDate <= date && !byAgent.has(agent)) {
      byAgent.set(agent, { agent, revenue: 0, premium: 0, apps: 0 });
    }
    if (appDate !== date) continue;
    const a = byAgent.get(agent);
    a.revenue += parseMoney(row[idx.revenue]);
    a.premium += parseMoney(row[idx.premium]);
    a.apps += 1;
  }

  const agents = [...byAgent.values()].map((a) => ({
    ...a,
    revenue: round2(a.revenue),
    premium: round2(a.premium),
  }));
  const total = agents.reduce(
    (t, a) => ({
      revenue: round2(t.revenue + a.revenue),
      premium: round2(t.premium + a.premium),
      apps: t.apps + a.apps,
    }),
    { revenue: 0, premium: 0, apps: 0 },
  );
  return { date, agents, total };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { aggregateDay, parseDate, parseMoney, shiftIso, normalizeAgent };

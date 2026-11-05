'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregateDay, parseDate, parseMoney } = require('../lib/production');
const { rows } = require('./fixture');

test('parseDate handles sheet formats', () => {
  assert.equal(parseDate('11/2/26'), '2026-11-02');
  assert.equal(parseDate('10/30/2026'), '2026-10-30');
  assert.equal(parseDate('2026-11-05'), '2026-11-05');
  assert.equal(parseDate(''), null);
  assert.equal(parseDate('N/A'), null);
});

test('parseMoney handles currency strings', () => {
  assert.equal(parseMoney('$1,147.80'), 1147.8);
  assert.equal(parseMoney('($25.00)'), -25);
  assert.equal(parseMoney('-$5'), -5);
  assert.equal(parseMoney(''), 0);
});

test('aggregates one day per agent and merges name variants', () => {
  const d = aggregateDay(rows, '2026-11-05');
  const by = Object.fromEntries(d.agents.map((a) => [a.agent, a]));
  assert.deepEqual(by.Sai, { agent: 'Sai', revenue: 1730.11, premium: 230.32, apps: 2 });
  assert.deepEqual(by.Sean, { agent: 'Sean', revenue: 810.2, premium: 65.38, apps: 2 });
  assert.deepEqual(by.James, { agent: 'James', revenue: 154.98, premium: 184.5, apps: 1 });
  assert.deepEqual(d.total, { revenue: 2695.29, premium: 480.2, apps: 5 });
});

test('recently active agents show with zero on a quiet day; mixed year formats count', () => {
  const d = aggregateDay(rows, '2026-11-03');
  const by = Object.fromEntries(d.agents.map((a) => [a.agent, a]));
  assert.equal(by.Sai.apps, 2);
  assert.equal(by.Sai.revenue, 1497.75);
  assert.equal(by.James.apps, 0);
  assert.equal(d.total.revenue, 3315.75);
});

test('future-only agents are not on past rosters', () => {
  const d = aggregateDay(rows, '2026-11-01');
  assert.deepEqual(d.agents.map((a) => a.agent).sort(), ['James']);
});

test('missing column throws a clear error', () => {
  assert.throws(() => aggregateDay([['Agent', 'Premium']], '2026-11-05'), /Projected Rev/);
});

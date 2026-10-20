// Tests für die App-API-Anbindung von Hockeyweb (ohne Netzwerk).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const app = require('../api/_hockeyapp');
const handler = require('../api/hockey');

const SCHEDULE = {
  status: 'ok',
  schedule: {
    teams: [{ teamId: 1, teamName: 'Eisbären Berlin' }, { teamId: 6, teamName: 'Kölner Haie' }, { teamId: 9, teamName: 'Adler Mannheim' }, { teamId: 33, teamName: 'EHC Red Bull München' }],
    matches: {
      a: { matchId: 1, dateTime: '2026-10-18 19:30:00', finished: 1, currentPeriod: 5, hasOvertime: 1, hasPenalty: 1, homeTeamId: 1, awayTeamId: 33, homeScore: 4, awayScore: 3, goalHome1: 1, goalAway1: 0, goalHome2: 1, goalAway2: 2, goalHome3: 1, goalAway3: 1 },
      b: { matchId: 2, dateTime: '2026-10-20 19:30:00', finished: 0, currentPeriod: 2, homeTeamId: 6, awayTeamId: 9, homeScore: 1, awayScore: 1, goalHome1: 1, goalAway1: 0, goalHome2: 0, goalAway2: 1, goalHome3: 0, goalAway3: 0 },
      c: { matchId: 3, dateTime: '2026-10-23 19:30:00', finished: 0, currentPeriod: 0, homeTeamId: 1, awayTeamId: 6, homeScore: 0, awayScore: 0 },
      d: { matchId: 4, dateTime: '2026-10-19 19:30:00', finished: 1, currentPeriod: 3, homeTeamId: 9, awayTeamId: 1, homeScore: 2, awayScore: 0, goalHome1: 1, goalAway1: 0, goalHome2: 1, goalAway2: 0, goalHome3: 0, goalAway3: 0, isDeleted: 1 },
    },
  },
};

test('sign: HMAC-SHA256 über die URL inkl. time, URL-Base64 mit Komma', () => {
  const out = app.sign('https://appdb.hockeyweb.de/v2/x?a=1', 'k', 1700000000);
  const input = 'https://appdb.hockeyweb.de/v2/x?a=1&time=1700000000';
  const h = createHmac('sha256', 'k').update(input).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ',');
  assert.equal(out, `${input}&apiKey=${h}`);
  assert.ok(!/[+/=]/.test(out.split('&apiKey=')[1]));
});

test('mapSchedule: beendet (n.P.), live, geplant, gelöschtes Spiel entfällt', () => {
  const g = app.mapSchedule(SCHEDULE, 'https://x');
  assert.deepEqual(g.map((x) => x.id), ['1', '2', '3']);
  assert.equal(g[0].played, true);
  assert.equal(g[0].ot, 'PSO');
  assert.deepEqual(g[0].periods, [[1, 0], [1, 2], [1, 1]]);
  assert.equal(g[0].home.name, 'Eisbären Berlin');
  assert.equal(g[1].live, true);
  assert.equal(g[1].status, '2. Drittel');
  assert.equal(g[1].time, '19:30');
  assert.equal(g[2].live, false);
  assert.deepEqual(g[2].periods, []);
});

test('computeTable: 3-2-1-0 Punkte', () => {
  const t = app.computeTable(app.mapSchedule(SCHEDULE, 'x'), 'DEL')[0].table;
  assert.equal(t[0].team, 'Eisbären Berlin');
  assert.equal(t[0].points, 2);
  assert.equal(t[1].team, 'EHC Red Bull München');
  assert.equal(t[1].points, 1);
  assert.equal(t[1].otl, 1);
});

test('mapTable: erkennt Feldnamen, sonst null', () => {
  const ok = { table: { tableTeamIds: [6, 1], teams: SCHEDULE.schedule.teams, table: [
    { teamId: 1, games: 10, wins: 5, lossesOT: 1, losses: 4, goalsPlus: 30, goalsMinus: 25, points: 20 },
    { teamId: 6, games: 10, wins: 7, losses: 3, goalsPlus: 35, goalsMinus: 20, points: 22 },
  ] } };
  const g = app.mapTable(ok, 'DEL')[0].table;
  assert.equal(g[0].team, 'Kölner Haie');
  assert.equal(g[0].rank, 1);
  assert.equal(g[1].diff, 5);
  assert.equal(app.mapTable({ table: { table: [{ teamId: 1, foo: 1 }] } }, 'DEL'), null);
});

test('Handler: App-API liefert Spiele des Tages + alle Spieltage; ohne Key Rückfall-Fehlermeldung', async () => {
  const realFetch = global.fetch;
  const urls = [];
  process.env.HOCKEYWEB_APP_KEY = 'testkey';
  global.fetch = async (url) => { urls.push(url); return { ok: true, status: 200, json: async () => SCHEDULE }; };
  handler._clearCache();
  const run = async (query) => { let code = 200; let body; await handler({ query }, { setHeader() {}, status(c) { code = c; return this; }, json(b) { body = b; } }); return { code, body }; };
  let r = await run({ league: 'del', type: 'games', date: '2026-10-20' });
  assert.equal(r.code, 200);
  assert.equal(r.body.source, 'app');
  assert.deepEqual(r.body.games.map((x) => x.id), ['2']);
  assert.deepEqual(r.body.days, ['2026-10-18', '2026-10-20', '2026-10-23']);
  assert.ok(urls[0].startsWith('https://appdb.hockeyweb.de/v2/get/index.php?requests=schedule&roundId=1&seasonId=15') && /&apiKey=[\w,-]+$/.test(urls[0]));
  r = await run({ league: 'obs', type: 'standings' });
  assert.equal(r.code, 200);
  assert.equal(r.body.source, 'berechnet');
  delete process.env.HOCKEYWEB_APP_KEY;
  global.fetch = async () => ({ ok: false, status: 403, text: async () => '' });
  handler._clearCache();
  r = await run({ league: 'del', type: 'games', date: '2026-10-20' });
  assert.equal(r.code, 502);
  assert.match(r.body.error, /HOCKEYWEB_APP_KEY nicht gesetzt/);
  global.fetch = realFetch;
});

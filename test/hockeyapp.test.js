// Tests für die App-API-Anbindung von Hockeyweb (ohne Netzwerk).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const app = require('../api/_hockeyapp');
const handler = require('../api/hockey');

const SCHEDULE = {
  status: 'ok',
  schedule: {
    teams: [{ teamId: 1, teamName: 'Eisbären Berlin', teamColors: '0x2e3350;0xa92412;0xffffff' }, { teamId: 6, teamName: 'Kölner Haie', teamColors: '0xff0000;0xffffff;0x000000' }, { teamId: 9, teamName: 'Adler Mannheim' }, { teamId: 33, teamName: 'EHC Red Bull München' }],
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
    { teamId: 1, matches: 10, wins: 5, winsOT: 1, winsPSO: 1, lossesOT: 1, lossesPSO: 0, losses: 2, goals: 30, goalsReceived: 25, points: 20 },
    { teamId: 6, matches: 10, wins: 7, losses: 3, goals: 35, goalsReceived: 20, points: 22 },
  ] } };
  const g = app.mapTable(ok, 'DEL')[0].table;
  assert.equal(g[0].team, 'Kölner Haie');
  assert.equal(g[0].rank, 1);
  assert.equal(g[1].diff, 5);
  assert.equal(g[1].otw, 2);
  assert.equal(g[1].otl, 1);
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
  const sched = urls.find((u) => u.includes('requests=schedule'));
  assert.ok(sched.startsWith('https://appdb.hockeyweb.de/v2/get/index.php?requests=schedule&roundId=1&seasonId=15') && /&apiKey=[\w,-]+$/.test(sched));
  assert.equal(r.body.round, 1);
  assert.deepEqual(r.body.rounds.map((x) => x.id), [1]);
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

test('Teamfarben (primär/sekundär) und Logos je Team', () => {
  assert.deepEqual(app.parseColors('0x2e3350;0xa92412;0xffffff'), { color: '2e3350', alt: 'a92412' });
  assert.deepEqual(app.parseColors(''), { color: null, alt: null });
  const g = app.mapSchedule(SCHEDULE, 'x')[0];
  assert.equal(g.home.color, '2e3350');
  assert.equal(g.home.alt, 'a92412');
  assert.match(g.home.logo, /^https:\/\/media\.hockeyweb\.de\/v\/eisbaeren-berlin-logo-svg-ls\.webp$/);
  assert.equal(g.home.id, 1);
  assert.equal(g.away.logo, require('../api/_hockeylogos').logoFor('EHC Red Bull München'));
});

test('Logo-Zuordnung ignoriert Umlaute, Groß-/Kleinschreibung und Sonderzeichen', () => {
  const { logoFor } = require('../api/_hockeylogos');
  assert.equal(logoFor('Nuernberg Ice Tigers'), logoFor('Nürnberg Ice Tigers'));
  assert.equal(logoFor('KOELNER HAIE'), logoFor('Kölner Haie'));
  assert.equal(logoFor('Unbekannter Verein'), null);
});

test('mapRounds: Runden je Liga', () => {
  const r = app.mapRounds({ roundsForSeason: { leagues: [{ id: 1, rounds: [{ id: 1, name: 'DEL Hauptrunde', type: 'table' }, { id: 90, name: 'DEL Playoffs', type: 'playoff' }] }] } });
  assert.deepEqual(r[1].map((x) => [x.id, x.type]), [[1, 'table'], [90, 'playoff']]);
});

test('mapEvents: Tore mit Zwischenstand, Strafen, gelöschte Ereignisse entfallen', () => {
  const ev = { matchEvents: { events: [
    { id: 3, type: 'Goal', teamId: 2, playerName: 'B', period: 2, time: 65 },
    { id: 1, type: 'Goal', teamId: 1, playerName: 'A', assistOnePlayerName: 'X', assistTwoPlayerName: 'Y', period: 1, time: 722 },
    { id: 2, type: 'Penalty', teamId: 2, playerName: 'C', severity: 'Kleine Strafe', reason: 'Hoher Stock', minutes: 2, period: 1, time: 835 },
    { id: 4, type: 'Goal', teamId: 1, playerName: 'Z', period: 1, time: 10, isDeleted: 1 },
    { id: 5, type: 'Goal', teamId: 1, playerName: 'D', period: 3, time: 1 },
  ] } };
  const out = app.mapEvents(ev, 1, 2);
  assert.deepEqual(out.map((e) => `${e.type}:${e.period}:${e.clock}`), ['goal:1:12:02', 'penalty:1:13:55', 'goal:2:01:05', 'goal:3:00:01']);
  assert.deepEqual(out[0].assists, ['X', 'Y']);
  assert.deepEqual(out[0].score, [1, 0]);
  assert.deepEqual(out[2].score, [1, 1]);
  assert.deepEqual(out[3].score, [2, 1]);
  assert.equal(out[1].minutes, 2);
});

test('mapLineup: Torhüter, Reihen, Ersatzbank', () => {
  const p = (nr, pos, positionName, type, last) => ({ shirtNumber: nr, firstName: 'V', lastName: last, position: pos, positionName, type, 'alpha-2': 'DE' });
  const l = app.mapLineup({ matchTeamPlayer: { teamPlayer: [
    p(31, 11, 'TW', 14, 'Tor'), p(5, 22, 'RV', 14, 'R1'), p(6, 23, 'LV', 14, 'L1'), p(7, 24, 'RS', 14, 'S1r'), p(8, 25, 'MS', 14, 'S1m'), p(9, 26, 'LS', 14, 'S1l'),
    p(15, 32, 'RV', 14, 'R2'), p(77, 0, '', 5, 'Bank'),
  ] } });
  assert.equal(l.goalies[0].name, 'V Tor');
  assert.equal(l.goalies[0].last, 'Tor');
  assert.equal(l.lines.length, 2);
  assert.deepEqual(l.lines[0].defense.map((x) => x.pos), ['LV', 'RV']);
  assert.deepEqual(l.lines[0].forwards.map((x) => x.pos), ['LS', 'MS', 'RS']);
  assert.equal(l.bench[0].nr, 77);
});

test('mapNews: ohne Fremd-HTML, nur Hockeyweb-Links, Kategorie-Filter', () => {
  const payload = { news: { news: [
    { id: 1, title: 'A', subTitle: 'S', description: 'D', date: 1792424456, category: 'NL', text: '<div>Werbung</div>', link: 'https://www.hockeyweb.de/nl/a', imageBig: 'https://appdb.hockeyweb.de/db/x.jpg' },
    { id: 2, title: 'B', date: 1792424000, category: 'DEL', link: 'https://evil.example/x', imageBig: 'https://evil.example/i.jpg' },
  ] } };
  const all = app.mapNews(payload, { });
  assert.equal(all.length, 2);
  assert.ok(!('text' in all[0]));
  assert.equal(all[1].link, '');
  assert.equal(all[1].image, '');
  assert.deepEqual(app.mapNews(payload, { category: /^NL$/ }).map((n) => n.id), ['1']);
});

test('Heim-/Auswärtsbilanz in der Tabelle', () => {
  const t = app.mapTable({ table: { teams: SCHEDULE.schedule.teams, table: [
    { teamId: 1, place: 1, matches: 4, points: 8, goals: 10, goalsReceived: 5, wins: 2, winsOT: 1, winsPSO: 0, losses: 1, lossesOT: 0, lossesPSO: 0,
      homeWins: 1, homeWinsOtPso: 1, homeLosesOtPso: 0, homeLoses: 0, awayWins: 1, awayWinsOtPso: 0, awayLosesOtPso: 0, awayLoses: 1 },
  ] } }, 'DEL')[0].table[0];
  assert.deepEqual(t.home, { played: 2, won: 1, otw: 1, otl: 0, lost: 0, points: 5 });
  assert.deepEqual(t.away, { played: 2, won: 1, otw: 0, otl: 0, lost: 1, points: 3 });
  assert.equal(t.color, '2e3350');
});

test('Handler: Spieldetails und News', async () => {
  const realFetch = global.fetch;
  process.env.HOCKEYWEB_APP_KEY = 'testkey';
  global.fetch = async (url) => {
    const rq = /requests=(\w+)/.exec(url)[1];
    const body = rq === 'matchEvents' ? { status: 'ok', matchEvents: { events: [{ id: 1, type: 'Goal', teamId: 1, playerName: 'A', period: 1, time: 5 }] } }
      : rq === 'matchTeamPlayer' ? { status: 'ok', matchTeamPlayer: { teamPlayer: [] } }
      : rq === 'matchStats' ? { status: 'ok', matchStats: { matches: [], table: {} } }
      : { status: 'ok', news: { news: [{ id: 9, title: 'N', date: 1792424456, category: 'DEL' }] } };
    return { ok: true, status: 200, json: async () => body };
  };
  handler._clearCache();
  const run = async (query) => { let code = 200; let body; await handler({ query }, { setHeader() {}, status(c) { code = c; return this; }, json(b) { body = b; } }); return { code, body }; };
  let r = await run({ league: 'del', type: 'match', match: '5', home: '1', away: '2' });
  assert.equal(r.code, 200);
  assert.equal(r.body.events[0].player, 'A');
  r = await run({ league: 'del', type: 'match', match: 'x', home: '1', away: '2' });
  assert.equal(r.code, 400);
  r = await run({ league: 'del', type: 'news' });
  assert.equal(r.body.news[0].title, 'N');
  r = await run({ league: 'nope', type: 'news' });
  assert.equal(r.code, 400);
  delete process.env.HOCKEYWEB_APP_KEY;
  global.fetch = realFetch;
});

test('liveMinute: Minute wie im Hockeyweb-Liveticker (Drittel + Minuten im Drittel)', () => {
  const m = (currentPeriod, currentGameTime, modus = '20-20-20-OT5-PSO') => ({ currentPeriod, currentGameTime, modus });
  assert.equal(app.liveMinute(m(1, 60)), 1);
  assert.equal(app.liveMinute(m(1, 359)), 5);
  assert.equal(app.liveMinute(m(1, 360)), 6);
  assert.equal(app.liveMinute(m(2, 900)), 35); // Graz–Ferencváros: 15 min im 2. Drittel
  assert.equal(app.liveMinute(m(2, 960)), 36);
  assert.equal(app.liveMinute(m(3, 1300)), 60); // nie über das Drittelende hinaus
  assert.equal(app.liveMinute(m(4, 125)), 62); // Verlängerung: 60 + 2
  assert.equal(app.liveMinute(m(4, 125, '20-20-20-OT20-PSO')), 62);
  assert.equal(app.liveMinute(m(2, 60, '15-15-15')), 16); // andere Drittellängen aus "modus"
  assert.equal(app.liveMinute(m(2, 60, '')), 21); // ohne modus: 20-20-20-OT5
  assert.equal(app.liveMinute(m(5, 30)), null); // Penaltyschießen: keine Minute
  assert.equal(app.liveMinute({ currentPeriod: 2 }), null); // keine Zeit geliefert
});

test('mapSchedule: laufendes Spiel mit Minute, geplantes/beendetes ohne', () => {
  const p = { schedule: { teams: [], matches: [
    { matchId: 10, dateTime: '2026-10-28 19:30:00', finished: 0, currentPeriod: 2, currentGameTime: 960, modus: '20-20-20-OT5-PSO', homeTeamId: 1, awayTeamId: 2, homeScore: 2, awayScore: 0 },
    { matchId: 11, dateTime: '2026-10-28 20:30:00', finished: 0, currentPeriod: 0, homeTeamId: 1, awayTeamId: 2 },
    { matchId: 12, dateTime: '2026-10-27 19:30:00', finished: 1, currentPeriod: 3, currentGameTime: 1200, homeTeamId: 1, awayTeamId: 2, homeScore: 1, awayScore: 0 },
  ] } };
  const g = Object.fromEntries(app.mapSchedule(p, 'https://x').map((x) => [x.id, x]));
  assert.equal(g['10'].minute, 36);
  assert.equal('minute' in g['11'], false);
  assert.equal('minute' in g['12'], false);
});

// Anbindung an die App-API von Hockeyweb (appdb.hockeyweb.de/v2), die auch die Hockeyweb-App nutzt.
// Beschreibung der Schnittstelle: Reverse-Engineering-Doku "Hockeyweb appdb" (openapi.yaml).
//
// Jede Anfrage braucht &time=<Unix-Sekunden> und &apiKey=<HMAC-SHA256 der kompletten URL inkl. time,
// Base64 mit - statt +, _ statt / und , statt =>. Der Signierschlüssel steht NICHT im Repo (öffentlich),
// sondern in der Vercel-Umgebungsvariable HOCKEYWEB_APP_KEY.
//
// Genutzte Abfragen:
//   schedule (roundId, seasonId)   alle Spiele einer Runde inkl. Live-Stand; enthält die Teams mit Farben
//   table (roundId, seasonId)      Tabelle inkl. Heim-/Auswärtsbilanz
//   roundsForSeason (seasonId)     alle Runden je Liga (Hauptrunde, später Playoffs …)
//   matchEvents / matchStats / matchTeamPlayer (matchId[, teamId])   Spieldetails
//   news (newsGroupId)             Meldungen
// Dateien mit Unterstrich-Präfix werden von Vercel nicht als eigene Function veröffentlicht.

const { createHmac } = require('node:crypto');
const { logoFor } = require('./_hockeylogos');

const API = 'https://appdb.hockeyweb.de/v2/get/index.php';
const SITE = 'https://www.hockeyweb.de';
const SEASON_ID = 15; // 2026/27 – bei neuer Saison anpassen (requests=seasons liefert die IDs)

// Je Liga: round = Hauptrunde (roundId laut App-Menü, Saison 2026/27), api = Liga-ID in roundsForSeason,
// news = newsGroupId (Top-Meldungen = 4, dort nach category gefiltert, wenn es keine eigene Gruppe gibt),
// path = Seite auf hockeyweb.de. Nur diese Ligen sind abrufbar.
const LEAGUES = {
  del: { name: 'DEL', round: 1, api: 1, news: 1, path: 'del' },
  del2: { name: 'DEL2', round: 2, api: 2, news: 2, path: 'del2' },
  obn: { name: 'Oberliga Nord', round: 8, api: 30, news: 5, path: 'oberliga' },
  obs: { name: 'Oberliga Süd', round: 9, api: 31, news: 6, path: 'oberliga' },
  nl: { name: 'NL', round: 33, api: 44, news: 4, category: /^NL$|national league/i, path: 'nl' },
  icehl: { name: 'ICEHL', round: 47, api: 40, news: 4, category: /icehl|ice hockey league/i, path: 'icehl' },
  chl: { name: 'CHL', round: 62, api: 4, news: 9, path: 'chl' },
  shl: { name: 'SHL', round: 46, api: 45, news: 4, category: /shl|svenska/i, path: 'shl' },
  dcup: { name: 'Deutschland-Cup', round: 20, api: 5, news: 10, path: 'deutschland-cup' },
};
const ROUNDS = Object.fromEntries(Object.entries(LEAGUES).map(([k, v]) => [k, v.round]));

function sign(url, key, nowSec = Math.round(Date.now() / 1000)) {
  const input = `${url}&time=${nowSec}`;
  const hash = createHmac('sha256', key).update(input).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ',');
  return `${input}&apiKey=${hash}`;
}

// params: nur Ganzzahlen (kein offener Proxy)
function apiUrl(request, params, key, nowSec) {
  const q = Object.entries(params).filter(([, v]) => /^\d+$/.test(String(v))).map(([k, v]) => `${k}=${v}`).join('&');
  const base = `${API}?requests=${request}${q ? `&${q}` : ''}&appVersion=203&linkVersion=2&android=1`;
  return sign(base, key, nowSec);
}

const asList = (x) => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.values(x) : []);

// "0x2e3350;0xa92412;0xffffff" → { color: '2e3350', alt: 'a92412' } (Primär-/Sekundärfarbe)
function parseColors(s) {
  const parts = String(s || '').split(';').map((c) => c.trim().replace(/^0x/i, '').replace(/^#/, '')).filter((c) => /^[0-9a-f]{6}$/i.test(c));
  return { color: parts[0] || null, alt: parts[1] || null };
}

// teamId → { name, short, color, alt, logo }
function teamMap(block) {
  const map = new Map();
  const add = (t) => {
    if (!t) return;
    const id = Number(t.teamId ?? t.id);
    if (!Number.isFinite(id) || map.has(id)) return;
    const name = t.teamName || t.shortTeamName || t.teamShortName || t.name || `Team ${id}`;
    const { color, alt } = parseColors(t.teamColors || t.colors);
    map.set(id, { id, name, short: t.teamShortName || t.shortTeamName || name, color, alt, logo: logoFor(name) || logoFor(t.teamShortName || t.shortTeamName) });
  };
  asList(block?.teams).forEach(add);
  return map;
}

// "2026-10-20 19:30:00" (deutsche Zeit) → { date, time }
function splitDateTime(s) {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(String(s || ''));
  return m ? { date: m[1], time: m[2] } : { date: null, time: null };
}

const PERIOD_LABEL = { 1: '1. Drittel', 2: '2. Drittel', 3: '3. Drittel', 4: 'Verlängerung', 5: 'Penaltyschießen' };
const num = (x) => Number(x) || 0;

function teamSide(map, id, score) {
  const t = map.get(Number(id));
  return { id: Number(id), name: t?.name || `Team ${id}`, logo: t?.logo || null, color: t?.color || null, alt: t?.alt || null, score };
}

// Ein Spiel der App-API → Format des Frontends
function mapMatch(m, map, lgUrl) {
  if (!m || m.isDeleted) return null;
  const { date, time } = splitDateTime(m.dateTime);
  if (!date) return null;
  const finished = !!m.finished;
  const live = !finished && Number(m.currentPeriod) > 0;
  const g = {
    id: String(m.matchId ?? m.id),
    roundId: m.roundId,
    url: lgUrl,
    date,
    time,
    played: finished,
    live,
    home: teamSide(map, m.homeTeamId, num(m.homeScore)),
    away: teamSide(map, m.awayTeamId, num(m.awayScore)),
    periods: finished || live
      ? [[m.goalHome1, m.goalAway1], [m.goalHome2, m.goalAway2], [m.goalHome3, m.goalAway3]].map(([a, b]) => [num(a), num(b)])
      : [],
  };
  if (finished && (m.hasPenalty || m.hasOvertime)) g.ot = m.hasPenalty ? 'PSO' : 'OT';
  if (live) g.status = PERIOD_LABEL[Number(m.currentPeriod)] || 'Läuft';
  return g;
}

// Antwort von requests=schedule → Spieleliste
function mapSchedule(payload, lgUrl) {
  const block = payload?.schedule || {};
  const map = teamMap(block);
  return asList(block.matches).map((m) => mapMatch(m, map, lgUrl)).filter(Boolean)
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
}

// Rohdaten laufender Spiele (nur zur Feldsuche über ?debug=1; keine Zugangsdaten)
function liveRaw(payload) {
  return asList(payload?.schedule?.matches).filter((m) => m && !m.isDeleted && !m.finished && Number(m.currentPeriod) > 0).slice(0, 3);
}

// Wert aus einem Objekt über mehrere mögliche Feldnamen
function pick(o, names) {
  for (const n of names) if (o && o[n] != null && o[n] !== '') return Number(o[n]);
  return undefined;
}

// Heim-/Auswärtsbilanz (nur Siege, Siege n.V./n.P., Niederlagen n.V./n.P., Niederlagen – Tore gibt die API nicht her)
function splitOf(r, side) {
  const p = side === 'home' ? 'home' : 'away';
  const w = pick(r, [`${p}Wins`]);
  const otw = pick(r, [`${p}WinsOtPso`]);
  const otl = pick(r, [`${p}LosesOtPso`]);
  const l = pick(r, [`${p}Loses`]);
  if ([w, otw, otl, l].some((v) => v == null)) return null;
  return { played: w + otw + otl + l, won: w, otw, otl, lost: l, points: 3 * w + 2 * otw + otl };
}

// Antwort von requests=table → Gruppen im Format des Frontends; null, wenn die Zeilen nicht lesbar sind
// (der Aufrufer rechnet dann aus dem Spielplan nach).
function mapTable(payload, groupName) {
  const block = payload?.table || {};
  const map = teamMap(block);
  const order = asList(block.tableTeamIds).map(Number);
  const rows = asList(block.table).filter((r) => r && typeof r === 'object');
  if (!rows.length) return null;
  const out = rows.map((r, i) => {
    const teamId = Number(r.teamId ?? r.id);
    const t = map.get(teamId);
    const played = pick(r, ['matches', 'games', 'gamesPlayed', 'played']);
    const points = pick(r, ['points', 'pts']);
    const gf = pick(r, ['goals', 'goalsFor']);
    const ga = pick(r, ['goalsReceived', 'goalsAgainst']);
    const rank = pick(r, ['place', 'rank', 'position']) ?? (order.length ? order.indexOf(teamId) + 1 || i + 1 : i + 1);
    return {
      rank, team: t?.name || r.teamName || `Team ${teamId}`, teamId, logo: t?.logo || null, color: t?.color || null, alt: t?.alt || null,
      played, won: pick(r, ['wins']) ?? 0, otw: (pick(r, ['winsOT']) ?? 0) + (pick(r, ['winsPSO']) ?? 0),
      otl: (pick(r, ['lossesOT']) ?? 0) + (pick(r, ['lossesPSO']) ?? 0), lost: pick(r, ['losses']) ?? 0,
      gf, ga, diff: gf != null && ga != null ? gf - ga : 0, points,
      home: splitOf(r, 'home'), away: splitOf(r, 'away'),
    };
  });
  if (out.some((r) => r.played == null || r.points == null || r.gf == null || r.ga == null)) return null;
  out.sort((a, b) => a.rank - b.rank);
  return [{ name: groupName, table: out }];
}

// Notlösung: Tabelle aus den beendeten Spielen (3 Pkt. Sieg, 2 Sieg n.V./n.P., 1 Niederlage n.V./n.P.)
function computeTable(games, groupName) {
  const t = new Map();
  const row = (side) => {
    if (!t.has(side.name)) t.set(side.name, { team: side.name, teamId: side.id, logo: side.logo || null, color: side.color || null, alt: side.alt || null, played: 0, won: 0, otw: 0, otl: 0, lost: 0, gf: 0, ga: 0, points: 0 });
    return t.get(side.name);
  };
  for (const g of games) {
    if (!g.played) continue;
    const h = row(g.home);
    const a = row(g.away);
    h.played++; a.played++;
    h.gf += g.home.score; h.ga += g.away.score;
    a.gf += g.away.score; a.ga += g.home.score;
    const [w, l] = g.home.score > g.away.score ? [h, a] : [a, h];
    if (g.ot) { w.otw++; w.points += 2; l.otl++; l.points += 1; } else { w.won++; w.points += 3; l.lost++; }
  }
  const rows = [...t.values()].map((r) => ({ ...r, diff: r.gf - r.ga }))
    .sort((a, b) => b.points - a.points || a.played - b.played || b.diff - a.diff || b.gf - a.gf || a.team.localeCompare(b.team));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows.length ? [{ name: groupName, table: rows }] : [];
}

// ---------- Runden (Hauptrunde, Playoffs …) ----------
// roundsForSeason → { [apiLeagueId]: [{ id, name, type }] }
function mapRounds(payload) {
  const out = {};
  for (const l of asList(payload?.roundsForSeason?.leagues)) {
    out[l.id] = asList(l.rounds).map((r) => ({ id: Number(r.id), name: String(r.name || `Runde ${r.id}`), type: String(r.type || '') }));
  }
  return out;
}

// ---------- Spieldetails ----------
const secToClock = (s) => `${String(Math.floor(num(s) / 60)).padStart(2, '0')}:${String(num(s) % 60).padStart(2, '0')}`;

// matchEvents → Tore (mit Zwischenstand) und Strafen, nach Drittel/Zeit sortiert
function mapEvents(payload, homeId, awayId) {
  const events = asList(payload?.matchEvents?.events).filter((e) => e && !e.isDeleted);
  events.sort((a, b) => num(a.period) - num(b.period) || num(a.time) - num(b.time) || num(a.id) - num(b.id));
  let h = 0;
  let a = 0;
  const out = [];
  for (const e of events) {
    const side = Number(e.teamId) === Number(homeId) ? 'home' : Number(e.teamId) === Number(awayId) ? 'away' : null;
    if (e.type === 'Goal') {
      if (side === 'home') h++; else if (side === 'away') a++;
      out.push({ type: 'goal', side, period: num(e.period), clock: secToClock(e.time), player: e.playerName || '', assists: [e.assistOnePlayerName, e.assistTwoPlayerName].filter(Boolean), score: [h, a] });
    } else if (e.type === 'Penalty') {
      out.push({ type: 'penalty', side, period: num(e.period), clock: secToClock(e.time), player: e.playerName || '', minutes: num(e.minutes), severity: e.severity || '', reason: e.reason || '' });
    }
  }
  return out;
}

// matchTeamPlayer → Aufstellung: Torhüter, Reihen (Verteidiger/Sturm), Ersatzbank
function mapLineup(payload) {
  const list = asList(payload?.matchTeamPlayer?.teamPlayer);
  const p = (x) => ({ nr: x.shirtNumber ?? '', name: `${x.firstName || ''} ${x.lastName || ''}`.trim(), last: String(x.lastName || x.firstName || '').trim(), pos: x.positionName || '', nation: x['alpha-2'] || '' });
  const field = list.filter((x) => Number(x.type) === 14);
  const bench = list.filter((x) => Number(x.type) !== 14).map(p);
  const goalies = field.filter((x) => Number(x.position) === 11).map(p);
  const lines = new Map();
  for (const x of field) {
    const pos = Number(x.position);
    if (pos < 20) continue;
    const n = Math.floor(pos / 10) - 1; // 2x = 1. Reihe, 3x = 2. Reihe …
    if (!lines.has(n)) lines.set(n, { line: n, defense: [], forwards: [] });
    const target = ['RV', 'LV'].includes(x.positionName) ? 'defense' : 'forwards';
    lines.get(n)[target].push(p(x));
  }
  const order = { LV: 0, RV: 1, LS: 0, MS: 1, RS: 2 };
  const sorted = [...lines.values()].sort((a, b) => a.line - b.line);
  for (const l of sorted) { l.defense.sort((a, b) => order[a.pos] - order[b.pos]); l.forwards.sort((a, b) => order[a.pos] - order[b.pos]); }
  return { goalies, lines: sorted, bench };
}

// matchStats → Direktvergleich und Tabellenstand beider Teams
function mapStats(payload, homeId, awayId) {
  const st = payload?.matchStats || {};
  const meetings = asList(st.matches).map((m) => ({
    id: String(m.id), ...splitDateTime(m.dateTime), home: m.homeTeamName, away: m.awayTeamName,
    homeScore: num(m.homeScore), awayScore: num(m.awayScore), ot: m.hasPenalty ? 'PSO' : m.hasOvertime ? 'OT' : '', finished: !!m.finished,
  })).filter((m) => m.finished && m.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const row = (r) => (r ? {
    place: pick(r, ['place']), played: pick(r, ['matches']), points: pick(r, ['points']), gf: pick(r, ['goals']), ga: pick(r, ['goalsReceived']),
    won: pick(r, ['wins']), lost: pick(r, ['losses']),
  } : null);
  void homeId; void awayId;
  return { meetings, home: row(st.table?.home), away: row(st.table?.away) };
}

// ---------- News ----------
function mapNews(payload, lg) {
  const items = asList(payload?.news?.news);
  const out = [];
  for (const n of items) {
    if (!n?.title) continue;
    if (lg.category && !lg.category.test(String(n.category || ''))) continue;
    const link = String(n.link || '');
    out.push({
      id: String(n.id),
      title: String(n.title),
      subTitle: n.subTitle ? String(n.subTitle) : '',
      description: n.description ? String(n.description) : '',
      published: Number(n.date) ? new Date(Number(n.date) * 1000).toISOString() : null,
      category: n.category ? String(n.category) : '',
      image: /^https:\/\/appdb\.hockeyweb\.de\//.test(String(n.imageBig || n.imageThumb2x || '')) ? String(n.imageBig || n.imageThumb2x) : '',
      link: /^https:\/\/www\.hockeyweb\.de\//.test(link) ? link : '',
    });
  }
  return out.sort((a, b) => String(b.published).localeCompare(String(a.published))).slice(0, 30);
}

module.exports = {
  LEAGUES, ROUNDS, SEASON_ID, SITE, sign, apiUrl, parseColors, mapSchedule, mapMatch, teamMap, mapTable, computeTable,
  liveRaw, mapRounds, mapEvents, mapLineup, mapStats, mapNews, splitDateTime,
};

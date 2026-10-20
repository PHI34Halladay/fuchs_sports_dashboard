// Anbindung an die App-API von Hockeyweb (appdb.hockeyweb.de/v2), die auch die Hockeyweb-App nutzt.
// Beschreibung der Schnittstelle: Reverse-Engineering-Doku "Hockeyweb appdb" (openapi.yaml).
//
// Jede Anfrage braucht &time=<Unix-Sekunden> und &apiKey=<HMAC-SHA256 der kompletten URL inkl. time,
// Base64 mit - statt +, _ statt / und , statt =>. Der Signierschlüssel steht NICHT im Repo (öffentlich),
// sondern in der Vercel-Umgebungsvariable HOCKEYWEB_APP_KEY.
//
// Genutzte Abfragen (je Liga eine Runde = roundId):
//   requests=schedule&roundId=…&seasonId=…   alle Spiele der Saison inkl. Live-Stand
//   requests=table&roundId=…&seasonId=…      Tabelle
// Dateien mit Unterstrich-Präfix werden von Vercel nicht als eigene Function veröffentlicht.

const { createHmac } = require('node:crypto');

const API = 'https://appdb.hockeyweb.de/v2/get/index.php';
const SITE = 'https://www.hockeyweb.de';
const SEASON_ID = 15; // 2026/27 – bei neuer Saison anpassen (requests=seasons liefert die IDs)

// roundId laut App-Menü (Saison 2026/27)
const ROUNDS = { del: 1, del2: 2, obn: 8, obs: 9, nl: 33, icehl: 47, chl: 62 };

function sign(url, key, nowSec = Math.round(Date.now() / 1000)) {
  const input = `${url}&time=${nowSec}`;
  const hash = createHmac('sha256', key).update(input).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ',');
  return `${input}&apiKey=${hash}`;
}

function apiUrl(request, roundId, key, nowSec) {
  const base = `${API}?requests=${request}&roundId=${Number(roundId)}&seasonId=${SEASON_ID}&appVersion=203&linkVersion=2&android=1`;
  return sign(base, key, nowSec);
}

const asList = (x) => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.values(x) : []);

function teamMap(block) {
  const map = new Map();
  for (const t of asList(block?.teams)) map.set(Number(t.teamId), t.teamName || t.teamShortName || `Team ${t.teamId}`);
  return map;
}

// "2026-10-20 19:30:00" (deutsche Zeit) → { date, time }
function splitDateTime(s) {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(String(s || ''));
  return m ? { date: m[1], time: m[2] } : { date: null, time: null };
}

const PERIOD_LABEL = { 1: '1. Drittel', 2: '2. Drittel', 3: '3. Drittel', 4: 'Verlängerung', 5: 'Penaltyschießen' };

// Antwort von requests=schedule → Spieleliste im Format des Frontends
function mapSchedule(payload, lgUrl) {
  const block = payload?.schedule || {};
  const names = teamMap(block);
  const games = [];
  for (const m of asList(block.matches)) {
    if (!m || m.isDeleted) continue;
    const { date, time } = splitDateTime(m.dateTime);
    if (!date) continue;
    const finished = !!m.finished;
    const live = !finished && Number(m.currentPeriod) > 0;
    const home = names.get(Number(m.homeTeamId)) || `Team ${m.homeTeamId}`;
    const away = names.get(Number(m.awayTeamId)) || `Team ${m.awayTeamId}`;
    const ot = finished ? (m.hasPenalty ? 'PSO' : m.hasOvertime ? 'OT' : undefined) : undefined;
    const g = {
      id: String(m.matchId ?? m.id),
      url: lgUrl,
      date,
      time,
      played: finished,
      live,
      home: { name: home, logo: null, score: Number(m.homeScore) || 0 },
      away: { name: away, logo: null, score: Number(m.awayScore) || 0 },
      periods: finished || live
        ? [[m.goalHome1, m.goalAway1], [m.goalHome2, m.goalAway2], [m.goalHome3, m.goalAway3]].map(([a, b]) => [Number(a) || 0, Number(b) || 0])
        : [],
    };
    if (ot) g.ot = ot;
    if (live) g.status = PERIOD_LABEL[Number(m.currentPeriod)] || 'Läuft';
    games.push(g);
  }
  return games.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
}

// Wert aus einem Objekt über mehrere mögliche Feldnamen
function pick(o, names) {
  for (const n of names) if (o && o[n] != null && o[n] !== '') return Number(o[n]);
  return undefined;
}

// Antwort von requests=table → Gruppen im Format des Frontends. Feldnamen der Tabellenzeilen sind nicht
// dokumentiert; es werden gängige Namen probiert. Fehlt etwas Wesentliches, gibt die Funktion null zurück
// (der Aufrufer rechnet dann aus dem Spielplan nach).
function mapTable(payload, groupName) {
  const block = payload?.table || {};
  const names = teamMap(block);
  let rows = asList(block.table);
  const order = asList(block.tableTeamIds).map(Number);
  rows = rows.filter((r) => r && typeof r === 'object');
  if (!rows.length) return null;
  const out = rows.map((r, i) => {
    const teamId = Number(r.teamId ?? r.id);
    const played = pick(r, ['matches', 'games', 'gamesPlayed', 'played', 'gp', 'sp']);
    const points = pick(r, ['points', 'pts', 'score']);
    const won = pick(r, ['wins', 'won', 'win', 'w']);
    const lost = pick(r, ['losses', 'lost', 'loss', 'l']);
    const gf = pick(r, ['goals', 'goalsFor', 'goalsPlus', 'goalsScored', 'gf', 'scored']);
    const ga = pick(r, ['goalsReceived', 'goalsAgainst', 'goalsMinus', 'goalsConceded', 'ga', 'conceded']);
    const otw = (pick(r, ['winsOT']) ?? 0) + (pick(r, ['winsPSO']) ?? 0);
    const otl = (pick(r, ['lossesOT']) ?? 0) + (pick(r, ['lossesPSO']) ?? 0);
    const rank = pick(r, ['place', 'rank', 'position', 'pos']) ?? (order.length ? order.indexOf(teamId) + 1 || i + 1 : i + 1);
    return { rank, team: names.get(teamId) || r.teamName || `Team ${teamId}`, logo: null, played, won, otw, otl, lost, gf, ga, diff: gf != null && ga != null ? gf - ga : 0, points };
  });
  if (out.some((r) => r.played == null || r.points == null || r.gf == null || r.ga == null)) return null;
  out.sort((a, b) => a.rank - b.rank);
  return [{ name: groupName, table: out }];
}

// Notlösung: Tabelle aus den beendeten Spielen (3 Pkt. Sieg, 2 Sieg n.V./n.P., 1 Niederlage n.V./n.P.)
function computeTable(games, groupName) {
  const t = new Map();
  const row = (name) => {
    if (!t.has(name)) t.set(name, { team: name, logo: null, played: 0, won: 0, otw: 0, otl: 0, lost: 0, gf: 0, ga: 0, points: 0 });
    return t.get(name);
  };
  for (const g of games) {
    if (!g.played) continue;
    const h = row(g.home.name);
    const a = row(g.away.name);
    h.played++; a.played++;
    h.gf += g.home.score; h.ga += g.away.score;
    a.gf += g.away.score; a.ga += g.home.score;
    const homeWon = g.home.score > g.away.score;
    const [w, l] = homeWon ? [h, a] : [a, h];
    if (g.ot) { w.otw++; w.points += 2; l.otl++; l.points += 1; } else { w.won++; w.points += 3; l.lost++; }
  }
  const rows = [...t.values()].map((r) => ({ ...r, diff: r.gf - r.ga }))
    .sort((a, b) => b.points - a.points || a.played - b.played || b.diff - a.diff || b.gf - a.gf || a.team.localeCompare(b.team));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows.length ? [{ name: groupName, table: rows }] : [];
}

module.exports = { ROUNDS, SEASON_ID, SITE, sign, apiUrl, mapSchedule, mapTable, computeTable, splitDateTime };

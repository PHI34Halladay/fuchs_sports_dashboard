// Vercel Serverless Function: liest Spiele und Tabellen der Eishockey-Ligen von Hockeyweb.de.
//   /api/hockey?league=del&type=games&date=2026-10-20   Spiele der Spielwoche(n), die das Datum enthalten
//   /api/hockey?league=del&type=standings               Tabelle
// Quelle 1: App-API von Hockeyweb (_hockeyapp.js, braucht HOCKEYWEB_APP_KEY, liefert Live-Stand).
// Quelle 2 (Rückfall, falls die App-API fehlt/scheitert): die HTML-Seiten von Hockeyweb (_hockeyweb.js).
// Erlaubt sind nur die Ligen aus LEAGUES (_hockeyweb.js) – kein offener Proxy.
//
// "games" liefert alle Spiele der Spielwoche zum Datum (gespielte aus "Ergebnisse", kommende aus
// "Spielplan") sowie den Spielwochen-Kalender der Saison, damit das Frontend von Spieltag zu
// Spieltag springen kann. Antworten werden kurz im Edge-Netz gecacht, damit Hockeyweb geschont wird.

const { LEAGUES, pageUrl, tableUrl, publicUrl, parseGames, parseWeeks, parseStandings } = require('./_hockeyweb');
const app = require('./_hockeyapp');

const UA = 'Mozilla/5.0 (compatible; sport-dashboard/1.12; privates Hobbyprojekt)';
const TTL_GAMES = 60;
const TTL_LIVE = 20;
const TTL_TABLE = 600;
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Kleiner Zwischenspeicher je Function-Instanz (schont Hockeyweb bei schnellem Tagewechsel)
const memo = new Map();
async function get(url, ttlSec) {
  const hit = memo.get(url);
  if (hit && Date.now() - hit.t < ttlSec * 1000) return hit.html;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,*/*', 'Accept-Language': 'de-DE,de;q=0.9' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Hockeyweb antwortet mit ${res.status}`);
  const html = await res.text();
  memo.set(url, { t: Date.now(), html });
  if (memo.size > 80) memo.delete(memo.keys().next().value);
  return html;
}

// Antwort der App-API (JSON) kurz zwischenspeichern; die Signatur ändert sich je Anfrage
async function getApp(request, params, ttlSec) {
  const key = process.env.HOCKEYWEB_APP_KEY;
  if (!key) throw new Error('HOCKEYWEB_APP_KEY nicht gesetzt');
  const ck = `app:${request}:${JSON.stringify(params)}`;
  const hit = memo.get(ck);
  if (hit && Date.now() - hit.t < ttlSec * 1000) return hit.json;
  let res;
  for (let i = 0; i < 2; i++) {
    try {
      res = await fetch(app.apiUrl(request, params, key), { // jeder Versuch neu signiert (Zeitstempel)
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
    } catch (e) { res = null; if (i === 1) { if (hit) return hit.json; throw e; } continue; }
    if (res.status < 500) break;
    if (i === 1) { if (hit) return hit.json; throw new Error(`App-API antwortet mit ${res.status}`); }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!res.ok) throw new Error(`App-API antwortet mit ${res.status}`);
  const json = await res.json();
  if (json?.status && json.status !== 'ok') throw new Error('App-API: ' + json.status);
  memo.set(ck, { t: Date.now(), json });
  if (memo.size > 120) memo.delete(memo.keys().next().value);
  return json;
}

const siteUrl = (al, kind) => `${app.SITE}/${al.path}/${kind}`;
const cacheHeader = (res, ttl) => res.setHeader('Cache-Control', `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 3}`);

// Runden der Liga (Hauptrunde, Playoffs …); Fehler hier dürfen die Spiele nicht verhindern
async function leagueRounds(al) {
  try {
    const all = app.mapRounds(await getApp('roundsForSeason', { seasonId: app.SEASON_ID }, 3600));
    const list = all[al.api] || [];
    return list.some((r) => r.id === al.round) ? list : [{ id: al.round, name: 'Hauptrunde', type: 'table' }, ...list];
  } catch { return [{ id: al.round, name: 'Hauptrunde', type: 'table' }]; }
}

// gewünschte Runde (?round=) nur zulassen, wenn sie zur Liga gehört
function pickRound(al, rounds, q) {
  const want = Number(q.round);
  return Number.isInteger(want) && rounds.some((r) => r.id === want) ? want : al.round;
}

async function handleGamesApp(al, key, date, q, res) {
  const rounds = await leagueRounds(al);
  const round = pickRound(al, rounds, q);
  const all = app.mapSchedule(await getApp('schedule', { roundId: round, seasonId: app.SEASON_ID }, TTL_LIVE), siteUrl(al, 'spielplan'));
  if (!all.length) throw new Error('App-API ohne Spiele');
  const games = all.filter((g) => g.date === date);
  const ttl = games.some((g) => g.live) ? TTL_LIVE : TTL_GAMES;
  cacheHeader(res, ttl);
  res.status(200).json({
    league: { key, name: al.name, url: siteUrl(al, 'spielplan') },
    date,
    games,
    days: [...new Set(all.map((g) => g.date))].sort(),
    calendar: [],
    rounds,
    round,
    errors: [],
    source: 'app',
    fetchedAt: new Date().toISOString(),
  });
}

async function handleStandingsApp(al, key, q, res) {
  const rounds = await leagueRounds(al);
  const round = pickRound(al, rounds, q);
  const payload = await getApp('table', { roundId: round, seasonId: app.SEASON_ID }, TTL_TABLE);
  let groups = app.mapTable(payload, al.name);
  let how = 'app';
  if (!groups) {
    const all = app.mapSchedule(await getApp('schedule', { roundId: round, seasonId: app.SEASON_ID }, TTL_LIVE), siteUrl(al, 'spielplan'));
    groups = app.computeTable(all, al.name);
    how = 'berechnet';
  }
  if (!groups.length) throw new Error('App-API ohne Tabelle');
  cacheHeader(res, TTL_TABLE);
  const body = { league: { key, name: al.name, url: siteUrl(al, 'tabelle') }, groups, rounds, round, source: how, fetchedAt: new Date().toISOString() };
  if (q.debug) { // nur Aufbau zeigen (Feldnamen), keine Zugangsdaten
    const t = payload?.table || {};
    const rows = Array.isArray(t.table) ? t.table : Object.values(t.table || {});
    body.debug = { tableKeys: Object.keys(t), isArray: Array.isArray(t.table), rowCount: rows.length, firstRow: rows[0] || null };
  }
  res.status(200).json(body);
}

// Spieldetails: Tore/Strafen, Aufstellungen, Direktvergleich (?match=ID&home=TeamID&away=TeamID)
async function handleMatchApp(al, key, q, res) {
  const [m, h, a] = ['match', 'home', 'away'].map((k) => (/^\d{1,9}$/.test(String(q[k] || '')) ? Number(q[k]) : null));
  if (!m || !h || !a) { res.status(400).json({ error: 'Ungültiges Spiel' }); return; }
  const settled = await Promise.allSettled([
    getApp('matchEvents', { matchId: m }, TTL_LIVE),
    getApp('matchTeamPlayer', { matchId: m, teamId: h }, 600),
    getApp('matchTeamPlayer', { matchId: m, teamId: a }, 600),
    getApp('matchStats', { matchId: m }, 600),
  ]);
  const val = (i) => (settled[i].status === 'fulfilled' ? settled[i].value : null);
  if (settled.every((s) => s.status === 'rejected')) throw settled[0].reason;
  const errors = [];
  if (!val(0)) errors.push('Spielverlauf');
  cacheHeader(res, TTL_LIVE);
  res.status(200).json({
    league: { key, name: al.name },
    match: m,
    events: val(0) ? app.mapEvents(val(0), h, a) : [],
    lineups: { home: val(1) ? app.mapLineup(val(1)) : null, away: val(2) ? app.mapLineup(val(2)) : null },
    stats: val(3) ? app.mapStats(val(3), h, a) : null,
    errors,
    fetchedAt: new Date().toISOString(),
  });
}

async function handleNewsApp(al, key, res) {
  const json = await getApp('news', { newsGroupId: al.news }, 300);
  cacheHeader(res, 300);
  res.status(200).json({ league: { key, name: al.name }, news: app.mapNews(json, al), fetchedAt: new Date().toISOString() });
}

function todayBerlin() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return p; // en-CA liefert YYYY-MM-DD
}

// Lädt für eine Quelle ("ergebnisse" | "spielplan") die Spielwoche zum Datum.
// Die Startseite (ohne ?page) wird immer geladen: sie liefert den Kalender und – falls das
// Datum in ihrer Woche liegt – gleich die Spiele; sonst wird die passende Woche nachgeladen.
async function loadSource(lg, kind, date) {
  const first = await get(pageUrl(lg, kind), TTL_GAMES);
  const weeks = parseWeeks(first);
  let games = parseGames(first);
  if (weeks.length) {
    // Datum außerhalb jeder Spielwoche (Spielpause): keine Spiele, sonst würde die Standardseite
    // fälschlich als Ersatz dienen. Ohne lesbaren Kalender bleibt die Standardseite stehen.
    const wk = weeks.find((w) => w.from <= date && date <= w.to);
    if (!wk) games = [];
    else if (!wk.selected) games = parseGames(await get(pageUrl(lg, kind, wk.page), TTL_GAMES));
  }
  return { weeks, games };
}

async function handleGames(lg, key, date, res, hint = '') {
  const errors = [];
  const settled = await Promise.allSettled([loadSource(lg, 'ergebnisse', date), loadSource(lg, 'spielplan', date)]);
  const names = ['Ergebnisse', 'Spielplan'];
  const parts = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') parts.push(r.value);
    else errors.push(`${names[i]}: ${r.reason?.message || 'nicht erreichbar'}`);
  });
  if (!parts.length) {
    res.status(502).json({ error: (errors.join(' · ') || 'Hockeyweb nicht erreichbar') + hint });
    return;
  }

  // Zusammenführen; bei doppelten Spielen zählt der Eintrag mit Ergebnis
  const byId = new Map();
  for (const g of parts.flatMap((p) => p.games)) {
    const old = byId.get(g.id);
    if (!old || (g.played && !old.played)) byId.set(g.id, g);
  }
  const games = [...byId.values()].sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`));

  const seen = new Set();
  const calendar = parts.flatMap((p) => p.weeks)
    .filter((w) => { const k = `${w.from}|${w.to}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .map(({ from, to }) => ({ from, to }))
    .sort((a, b) => a.from.localeCompare(b.from));

  res.setHeader('Cache-Control', `public, s-maxage=${TTL_GAMES}, stale-while-revalidate=${TTL_GAMES * 4}`);
  res.status(200).json({
    league: { key, name: lg.name, url: publicUrl(lg, 'spielplan') },
    date,
    games,
    days: [...new Set(games.map((g) => g.date))].sort(),
    calendar,
    errors,
    fetchedAt: new Date().toISOString(),
  });
}

async function handleStandings(lg, key, res) {
  const html = await get(tableUrl(lg), TTL_TABLE);
  const groups = parseStandings(html, lg.sub);
  if (!groups.length) {
    res.status(502).json({ error: 'Tabelle konnte nicht gelesen werden' });
    return;
  }
  res.setHeader('Cache-Control', `public, s-maxage=${TTL_TABLE}, stale-while-revalidate=${TTL_TABLE * 3}`);
  res.status(200).json({
    league: { key, name: lg.name, url: tableUrl(lg) },
    groups,
    fetchedAt: new Date().toISOString(),
  });
}

async function handler(req, res) {
  let appError = null;
  const q = req.query || {};
  const key = String(q.league || '');
  const has = (o) => Object.prototype.hasOwnProperty.call(o, key);
  const al = has(app.LEAGUES) ? app.LEAGUES[key] : null; // Liga über die App-API
  const lg = has(LEAGUES) ? LEAGUES[key] : null; // Liga über die Hockeyweb-Seiten (Rückfall)
  if (!al) {
    res.status(400).json({ error: 'Unbekannte Liga' });
    return;
  }
  const date = q.date ? String(q.date) : todayBerlin();
  if (!RE_DATE.test(date)) {
    res.status(400).json({ error: 'Ungültiges Datum' });
    return;
  }
  try {
    if (q.debug === 'rounds') { // Diagnose: alle Runden der Saison (keine Zugangsdaten)
      const all = app.mapRounds(await getApp('roundsForSeason', { seasonId: app.SEASON_ID }, 60));
      res.status(200).json({ api: al.api, mine: all[al.api] || null, all });
      return;
    }
    if (q.debug === 'probe') { // Diagnose: welche Abfragen liefern Spiele außerhalb der Hauptrunde?
      const tries = [
        ['schedule', { leagueId: al.api, seasonId: app.SEASON_ID }],
        ['schedule', { seasonId: app.SEASON_ID, leagueId: al.api, roundId: 0 }],
        ['schedule', { roundId: 61, seasonId: app.SEASON_ID }],
        ['schedule', { roundId: 64, seasonId: app.SEASON_ID }],
        ['schedule', { roundId: 65, seasonId: app.SEASON_ID }],
        ['schedule', { roundId: 66, seasonId: app.SEASON_ID }],
        ['schedule', { roundId: 67, seasonId: app.SEASON_ID }],
        ['schedule', { roundId: 68, seasonId: app.SEASON_ID }],
        ['schedule', { roundId: 69, seasonId: app.SEASON_ID }],
        ['schedule', { roundId: 62 }],
      ];
      const out = [];
      for (const [r, p] of tries) {
        try {
          const j = await getApp(r, p, 30);
          const ms = Object.values(j?.schedule?.matches || {});
          const dates = ms.map((m) => String(m.dateTime || '').slice(0, 10)).sort();
          const rid = [...new Set(ms.map((m) => m.roundId))];
          out.push({ r, p, keys: Object.keys(j || {}), n: ms.length, from: dates[0], to: dates[dates.length - 1], rid, nov10: ms.filter((m) => String(m.dateTime).startsWith('2026-11-1')).length });
        } catch (e) { out.push({ r, p, err: String(e.message) }); }
      }
      res.status(200).json(out);
      return;
    }
    if (q.src === 'web' && lg) { await handleGames(lg, key, date, res); return; } // Diagnose: Hockeyweb-Seiten statt App-API
    if (q.type === 'match' || q.type === 'news') {
      if (q.type === 'match') await handleMatchApp(al, key, q, res); else await handleNewsApp(al, key, res);
      return;
    }
    if (q.type === 'standings') {
      try { await handleStandingsApp(al, key, q, res); return; } catch (e) { appError = e; }
      if (!lg) throw appError;
      await handleStandings(lg, key, res);
    } else {
      try { await handleGamesApp(al, key, date, q, res); return; } catch (e) { appError = e; }
      if (!lg) throw appError;
      await handleGames(lg, key, date, res, appError ? ` (App-API: ${appError.message})` : '');
    }
  } catch (e) {
    const why = appError && e !== appError ? ` (App-API: ${appError.message})` : '';
    res.status(502).json({ error: `${e?.message || 'Hockeyweb nicht erreichbar'}${why}` });
  }
}

module.exports = handler;
module.exports._clearCache = () => memo.clear(); // nur für Tests

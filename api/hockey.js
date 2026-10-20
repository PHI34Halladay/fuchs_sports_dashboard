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

// Antwort der App-API (JSON) je Runde kurz zwischenspeichern; die Signatur ändert sich je Anfrage
async function getApp(request, roundId, ttlSec) {
  const key = process.env.HOCKEYWEB_APP_KEY;
  if (!key) throw new Error('HOCKEYWEB_APP_KEY nicht gesetzt');
  const ck = `app:${request}:${roundId}`;
  const hit = memo.get(ck);
  if (hit && Date.now() - hit.t < ttlSec * 1000) return hit.json;
  const res = await fetch(app.apiUrl(request, roundId, key), {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`App-API antwortet mit ${res.status}`);
  const json = await res.json();
  if (json?.status && json.status !== 'ok') throw new Error('App-API: ' + json.status);
  memo.set(ck, { t: Date.now(), json });
  if (memo.size > 80) memo.delete(memo.keys().next().value);
  return json;
}

async function handleGamesApp(lg, key, date, res) {
  const lgUrl = publicUrl(lg, 'spielplan');
  const all = app.mapSchedule(await getApp('schedule', app.ROUNDS[key], TTL_LIVE), lgUrl);
  if (!all.length) throw new Error('App-API ohne Spiele');
  const games = all.filter((g) => g.date === date);
  const live = games.some((g) => g.live);
  const ttl = live ? TTL_LIVE : TTL_GAMES;
  res.setHeader('Cache-Control', `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 3}`);
  res.status(200).json({
    league: { key, name: lg.name, url: lgUrl },
    date,
    games,
    days: [...new Set(all.map((g) => g.date))].sort(),
    calendar: [],
    errors: [],
    source: 'app',
    fetchedAt: new Date().toISOString(),
  });
}

async function handleStandingsApp(lg, key, q, res) {
  const payload = await getApp('table', app.ROUNDS[key], TTL_TABLE);
  let groups = app.mapTable(payload, lg.name);
  let how = 'app';
  if (!groups) {
    const all = app.mapSchedule(await getApp('schedule', app.ROUNDS[key], TTL_LIVE), publicUrl(lg, 'spielplan'));
    groups = app.computeTable(all, lg.name);
    how = 'berechnet';
  }
  if (!groups.length) throw new Error('App-API ohne Tabelle');
  res.setHeader('Cache-Control', `public, s-maxage=${TTL_TABLE}, stale-while-revalidate=${TTL_TABLE * 3}`);
  const body = { league: { key, name: lg.name, url: tableUrl(lg) }, groups, source: how, fetchedAt: new Date().toISOString() };
  if (q.debug) { // nur Aufbau zeigen (Feldnamen), keine Zugangsdaten
    const t = payload?.table || {};
    const rows = Array.isArray(t.table) ? t.table : Object.values(t.table || {});
    body.debug = { tableKeys: Object.keys(t), isArray: Array.isArray(t.table), rowCount: rows.length, firstRow: rows[0] || null };
  }
  res.status(200).json(body);
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
  const lg = Object.prototype.hasOwnProperty.call(LEAGUES, key) ? LEAGUES[key] : null;
  if (!lg) {
    res.status(400).json({ error: 'Unbekannte Liga' });
    return;
  }
  const date = q.date ? String(q.date) : todayBerlin();
  if (!RE_DATE.test(date)) {
    res.status(400).json({ error: 'Ungültiges Datum' });
    return;
  }
  try {
    const viaApp = Object.prototype.hasOwnProperty.call(app.ROUNDS, key);
    if (q.type === 'standings') {
      if (viaApp) { try { await handleStandingsApp(lg, key, q, res); return; } catch (e) { appError = e; } }
      await handleStandings(lg, key, res);
    } else {
      if (viaApp) { try { await handleGamesApp(lg, key, date, res); return; } catch (e) { appError = e; } }
      await handleGames(lg, key, date, res, appError ? ` (App-API: ${appError.message})` : '');
    }
  } catch (e) {
    const why = appError ? ` (App-API: ${appError.message})` : '';
    res.status(502).json({ error: `${e?.message || 'Hockeyweb nicht erreichbar'}${why}` });
  }
}

module.exports = handler;
module.exports._clearCache = () => memo.clear(); // nur für Tests

// Vercel Serverless Function: liest Tabelle und Spiele einer Amateur-Liga von Fussball.de.
// Aufruf: /api/amateur?team=sgm1   (erlaubt: siehe TEAMS in _fussballde.js)
//
// Liefert die Tabelle (mit Vereinslogos) und ALLE Ligaspiele: dafür werden die Spielpläne
// aller Mannschaften der Tabelle geladen und zusammengeführt. Antwort wird 30 Minuten im
// Edge-Netz gecacht, damit Fussball.de nur selten angefragt wird.

const { TEAMS, urlsFor, teamUrls, parseTable, parseMatches, mergeMatches, leagueGames } = require('./_fussballde');

const UA = 'Mozilla/5.0 (compatible; sport-dashboard/1.10; privates Hobbyprojekt)';
const TTL = 1800;
const CONCURRENCY = 6;

async function get(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,*/*', 'Accept-Language': 'de-DE,de;q=0.9' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Fussball.de antwortet mit ${res.status}`);
  return res.text();
}

// Führt fn für alle Einträge aus, höchstens `limit` gleichzeitig (schont Fussball.de).
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }));
  return out;
}

async function handler(req, res) {
  const key = String((req.query || {}).team || '');
  const team = Object.prototype.hasOwnProperty.call(TEAMS, key) ? TEAMS[key] : null;
  if (!team) {
    res.status(400).json({ error: 'Unbekannte Mannschaft' });
    return;
  }

  const u = urlsFor(team);
  const errors = [];

  let table = [];
  try {
    table = parseTable(await get(u.table));
    if (!table.length) errors.push('Tabelle konnte nicht gelesen werden');
  } catch (e) {
    errors.push(`Tabelle: ${e.message || 'nicht erreichbar'}`);
  }

  // Spielpläne aller Mannschaften der Staffel; fällt auf die eigene Mannschaft zurück.
  const ids = [...new Set(table.map((t) => t.teamId).filter(Boolean))];
  if (!ids.includes(team.teamId)) ids.push(team.teamId);

  let failed = 0;
  const perTeam = await mapLimit(ids, CONCURRENCY, async (id) => {
    const t = teamUrls(id);
    const [n, p] = await Promise.allSettled([get(t.next), get(t.prev)]);
    const lists = [];
    if (n.status === 'fulfilled') lists.push(parseMatches(n.value, team.ownName));
    else failed++;
    if (p.status === 'fulfilled') lists.push(parseMatches(p.value, team.ownName, { forcePlayed: true }));
    else failed++;
    return lists;
  });
  if (failed) errors.push(`${failed} Spielplan-Abrufe fehlgeschlagen`);

  const { upcoming, past } = mergeMatches(...perTeam.flat());
  const logos = Object.fromEntries(table.filter((t) => t.logo).map((t) => [t.team, t.logo]));
  const clean = (list) => leagueGames(list, table);

  const out = { upcoming: clean(upcoming), past: clean(past) };
  if (!table.length && !out.upcoming.length && !out.past.length) {
    res.status(502).json({ error: errors.join(' · ') || 'Fussball.de lieferte keine Daten' });
    return;
  }

  res.setHeader('Cache-Control', `public, s-maxage=${TTL}, stale-while-revalidate=${TTL * 4}`);
  res.status(200).json({
    team: { key, name: team.name, ownName: team.ownName, league: team.league, url: u.page },
    table,
    logos,
    upcoming: out.upcoming,
    past: out.past,
    errors,
    fetchedAt: new Date().toISOString(),
  });
}

module.exports = handler;

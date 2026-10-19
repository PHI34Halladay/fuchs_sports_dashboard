// Vercel Serverless Function: liest Tabelle und Spielplan einer Amateur-Mannschaft von Fussball.de.
// Aufruf: /api/amateur?team=sgm1   (erlaubt: siehe TEAMS in _fussballde.js)
// Antwort wird 15 Minuten im Edge-Netz gecacht, damit Fussball.de nur selten angefragt wird.

const { TEAMS, urlsFor, parseTable, parseMatches, mergeMatches } = require('./_fussballde');

const UA = 'Mozilla/5.0 (compatible; sport-dashboard/1.8; privates Hobbyprojekt)';
const TTL = 900;

async function get(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,*/*', 'Accept-Language': 'de-DE,de;q=0.9' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Fussball.de antwortet mit ${res.status}`);
  return res.text();
}

async function handler(req, res) {
  const key = String((req.query || {}).team || '');
  const team = Object.prototype.hasOwnProperty.call(TEAMS, key) ? TEAMS[key] : null;
  if (!team) {
    res.status(400).json({ error: 'Unbekannte Mannschaft' });
    return;
  }

  const u = urlsFor(team);
  const [tableR, nextR, prevR] = await Promise.allSettled([get(u.table), get(u.next), get(u.prev)]);
  const errors = [];

  let table = [];
  if (tableR.status === 'fulfilled') {
    table = parseTable(tableR.value);
    if (!table.length) errors.push('Tabelle konnte nicht gelesen werden');
  } else errors.push(`Tabelle: ${tableR.reason?.message || 'nicht erreichbar'}`);

  const lists = [];
  if (nextR.status === 'fulfilled') lists.push(parseMatches(nextR.value, team.ownName));
  else errors.push(`Spielplan: ${nextR.reason?.message || 'nicht erreichbar'}`);
  if (prevR.status === 'fulfilled') lists.push(parseMatches(prevR.value, team.ownName, { forcePlayed: true }));
  else errors.push(`Letzte Spiele: ${prevR.reason?.message || 'nicht erreichbar'}`);
  const { upcoming, past } = mergeMatches(...lists);

  if (!table.length && !upcoming.length && !past.length) {
    res.status(502).json({ error: errors.join(' · ') || 'Fussball.de lieferte keine Daten' });
    return;
  }

  res.setHeader('Cache-Control', `public, s-maxage=${TTL}, stale-while-revalidate=${TTL * 4}`);
  res.status(200).json({
    team: { key, name: team.name, ownName: team.ownName, league: team.league, url: u.page },
    table,
    upcoming,
    past,
    errors,
    fetchedAt: new Date().toISOString(),
  });
}

module.exports = handler;

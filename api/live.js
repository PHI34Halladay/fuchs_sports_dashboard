// Vercel Serverless Function: zählt laufende Spiele je ESPN-Liga für die Live-Markierung in der
// Navigation. Aufruf: /api/live?l=nba:20261020,bl1:20261021,…  (Liga-ID:Spieltag, nur bekannte Ligen)
// Antwort: { live: { nba: 3, bl1: 0, … } } – bewusst nur Zahlen, damit der Browser kaum Daten lädt.

const BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const LEAGUES = {
  bl1: 'soccer/ger.1', bl2: 'soccer/ger.2', ucl: 'soccer/uefa.champions', uel: 'soccer/uefa.europa',
  uecl: 'soccer/uefa.europa.conf', epl: 'soccer/eng.1', laliga: 'soccer/esp.1', seriea: 'soccer/ita.1',
  ligue1: 'soccer/fra.1', mls: 'soccer/usa.1', dfbpokal: 'soccer/ger.dfb_pokal',
  nfl: 'football/nfl', cfb: 'football/college-football',
  nba: 'basketball/nba', cbb: 'basketball/mens-college-basketball',
  nhl: 'hockey/nhl', mlb: 'baseball/mlb',
};
const GROUPS = { cfb: '80', cbb: '50' };

module.exports = async function handler(req, res) {
  const spec = String((req.query || {}).l || '').split(',').slice(0, 30)
    .map((x) => x.split(':'))
    .filter(([id, d]) => LEAGUES[id] && /^\d{8}$/.test(d || ''));
  const live = {};
  await Promise.all(spec.map(async ([id, d]) => {
    const p = new URLSearchParams({ dates: d, limit: '300' });
    if (GROUPS[id]) p.set('groups', GROUPS[id]);
    try {
      const r = await fetch(`${BASE}/${LEAGUES[id]}/scoreboard?${p}`, { headers: { 'User-Agent': 'espn-dashboard/2.1', Accept: 'application/json' } });
      if (!r.ok) return;
      const j = await r.json();
      live[id] = (j.events || []).filter((e) => e.status?.type?.state === 'in').length;
    } catch { /* Liga fehlt in der Antwort */ }
  }));
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
  res.status(200).json({ live });
};

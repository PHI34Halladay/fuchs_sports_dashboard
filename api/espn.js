// Vercel Serverless Function: schlanker Proxy für die öffentliche ESPN-API.
// Vorteile: keine CORS-Probleme im Browser, Caching über das Vercel-Edge-Netz,
// und nur erlaubte Endpunkte werden weitergereicht (kein offener Proxy).

const BASE_SITE = 'https://site.api.espn.com/apis/site/v2/sports';
const BASE_V2 = 'https://site.api.espn.com/apis/v2/sports';
const BASE_WEB_COMMON = 'https://site.web.api.espn.com/apis/common/v3/sports';
const BASE_SEARCH = 'https://site.web.api.espn.com/apis/search/v2';

// Cache-Dauer (Sekunden) je Endpunkt
const CACHE = {
  scoreboard: 20,
  summary: 20,
  standings: 300,
  news: 300,
  teams: 86400,
  rankings: 300,
  team: 300,
  athlete: 300,
  // Spieler-Profil: Saisonstatistik + News, Spiel-für-Spiel-Werte, Vereinshistorie
  overview: 300,
  gamelog: 600,
  bio: 86400,
  // Team-Profil: Spielplan und Teamstatistik
  schedule: 300,
  teamstats: 3600,
  roster: 3600,
  search: 600,
  article: 3600,
};

const RE_SPORT = /^[a-z-]{2,30}$/;
const RE_LEAGUE = /^[a-z0-9._-]{2,40}$/;
const RE_DATES = /^\d{8}(-\d{8})?$/;
const RE_NUM = /^\d{1,6}$/;
const RE_ID = /^\d{1,10}$/;
const RE_WEEK = /^\d{1,2}$/;
const RE_SEASONTYPE = /^\d{1}$/;

function buildUrl(q) {
  const { type, sport, league } = q;
  if (!CACHE[type]) throw new Error('Unbekannter Typ');
  // Suche ist ligaübergreifend (Spieler/Teams aller Sportarten) – ohne sport/league
  if (type === 'search') {
    const query = String(q.q || '').trim();
    if (query.length < 2 || query.length > 40 || /[<>"'`\\]/.test(query)) throw new Error('Ungültige Suche');
    const p = new URLSearchParams({ query, limit: '10' });
    return `${BASE_SEARCH}?${p}`;
  }
  if (!RE_SPORT.test(sport || '') || !RE_LEAGUE.test(league || '')) {
    throw new Error('Ungültige Sportart/Liga');
  }

  const params = new URLSearchParams();
  let url;

  switch (type) {
    case 'scoreboard':
      url = `${BASE_SITE}/${sport}/${league}/scoreboard`;
      if (q.dates && RE_DATES.test(q.dates)) params.set('dates', q.dates);
      if (q.groups && RE_NUM.test(q.groups)) params.set('groups', q.groups);
      // week/seasontype: für wochenbasierte Ligen (NFL/NCAAF) die Spieltage einer
      // bestimmten Woche abfragen (Kalender liefert dort nur Wochen-Grenzen, keine Tage).
      if (q.week && RE_WEEK.test(q.week)) params.set('week', q.week);
      if (q.seasontype && RE_SEASONTYPE.test(q.seasontype)) params.set('seasontype', q.seasontype);
      params.set('limit', '300');
      break;
    case 'summary':
      if (!RE_NUM.test(q.event || '') && !/^\d{6,12}$/.test(q.event || '')) {
        throw new Error('Ungültige Event-ID');
      }
      url = `${BASE_SITE}/${sport}/${league}/summary`;
      params.set('event', q.event);
      break;
    case 'standings':
      url = `${BASE_V2}/${sport}/${league}/standings`;
      break;
    case 'rankings':
      url = `${BASE_SITE}/${sport}/${league}/rankings`;
      break;
    case 'news':
      url = `${BASE_SITE}/${sport}/${league}/news`;
      params.set('limit', q.limit && RE_NUM.test(q.limit) ? q.limit : '25');
      // team: nur Meldungen zu einem Team (Team-Profil)
      if (q.team && RE_ID.test(q.team)) params.set('team', q.team);
      break;
    case 'teams':
      url = `${BASE_SITE}/${sport}/${league}/teams`;
      params.set('limit', '1000');
      break;
    case 'team':
      if (!RE_ID.test(q.id || '')) throw new Error('Ungültige Team-ID');
      url = `${BASE_SITE}/${sport}/${league}/teams/${q.id}`;
      params.set('enable', 'nextEvent');
      break;
    case 'schedule':
      if (!RE_ID.test(q.id || '')) throw new Error('Ungültige Team-ID');
      url = `${BASE_SITE}/${sport}/${league}/teams/${q.id}/schedule`;
      break;
    case 'teamstats':
      if (!RE_ID.test(q.id || '')) throw new Error('Ungültige Team-ID');
      url = `${BASE_SITE}/${sport}/${league}/teams/${q.id}/statistics`;
      break;
    case 'roster':
      if (!RE_ID.test(q.id || '')) throw new Error('Ungültige Team-ID');
      url = `${BASE_SITE}/${sport}/${league}/teams/${q.id}/roster`;
      break;
    case 'article':
      // Volltext eines News-Artikels (für den Lesemodus in der App)
      if (!RE_ID.test(q.id || '')) throw new Error('Ungültige Artikel-ID');
      return `https://content.core.api.espn.com/v1/sports/news/${q.id}`;
    case 'athlete':
      if (!RE_ID.test(q.id || '')) throw new Error('Ungültige Athlet-ID');
      url = `${BASE_WEB_COMMON}/${sport}/${league}/athletes/${q.id}`;
      break;
    case 'overview':
    case 'gamelog':
    case 'bio':
      if (!RE_ID.test(q.id || '')) throw new Error('Ungültige Athlet-ID');
      url = `${BASE_WEB_COMMON}/${sport}/${league}/athletes/${q.id}/${type}`;
      break;
  }

  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

// ESPN lehnt Datumsbereiche (dates=von-bis) bei Fußball mit 400 ab, einzelne Tage funktionieren.
// Der Proxy zerlegt Bereiche (höchstens 14 Tage) deshalb selbst in Einzeltage und liefert die Events
// zusammengefasst plus `days` = die abgefragten Tage (YYYYMMDD), an denen es Spiele gibt.
const MAX_RANGE_DAYS = 14;
function expandRange(dates) {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{4})(\d{2})(\d{2})$/.exec(dates || '');
  if (!m) return null;
  const a = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const b = Date.UTC(+m[4], +m[5] - 1, +m[6]);
  if (!(b >= a) || (b - a) / 864e5 + 1 > MAX_RANGE_DAYS) return [];
  const out = [];
  for (let t = a; t <= b; t += 864e5) {
    const d = new Date(t);
    out.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`);
  }
  return out;
}

async function fetchJson(target) {
  const upstream = await fetch(target, {
    headers: { 'User-Agent': 'espn-dashboard/1.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!upstream.ok) throw Object.assign(new Error(`ESPN antwortet mit ${upstream.status}`), { status: upstream.status });
  return upstream.json();
}

async function handleRange(q, res) {
  const days = expandRange(q.dates);
  if (!days || !days.length) { res.status(400).json({ error: 'Ungültiger Datumsbereich (höchstens 14 Tage)' }); return; }
  try {
    const parts = await Promise.all(days.map(async (day) => {
      const data = await fetchJson(buildUrl({ ...q, dates: day }));
      return { day, data };
    }));
    const events = [];
    const seen = new Set();
    const gameDays = [];
    for (const { day, data } of parts) {
      const evs = (data.events || []).filter((e) => e && !seen.has(e.id));
      evs.forEach((e) => seen.add(e.id));
      if (evs.length) gameDays.push(day);
      events.push(...evs);
    }
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
    // daysOnly=1: nur die Spieltage (spart bei Wochenblöcken der Kalender-Abfragen ~250 KB je Antwort)
    if (q.daysOnly) { res.status(200).json({ days: gameDays, range: q.dates }); return; }
    res.status(200).json({ leagues: parts[0].data.leagues, events, days: gameDays, range: q.dates });
  } catch (e) {
    res.status(e.status || 502).json({ error: e.message || 'ESPN nicht erreichbar' });
  }
}

async function handler(req, res) {
  if (req.query && req.query.type === 'scoreboard' && /-/.test(req.query.dates || '')) {
    try { buildUrl({ ...req.query, dates: String(req.query.dates).slice(0, 8) }); } catch (e) { res.status(400).json({ error: e.message }); return; }
    await handleRange(req.query, res);
    return;
  }
  let target;
  try {
    target = buildUrl(req.query || {});
  } catch (e) {
    res.status(400).json({ error: e.message });
    return;
  }

  try {
    const upstream = await fetch(target, {
      headers: { 'User-Agent': 'espn-dashboard/1.0', Accept: 'application/json' },
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `ESPN antwortet mit ${upstream.status}` });
      return;
    }

    let data = await upstream.json();
    // Suche: nur Spieler/Teams weitergeben (ESPN hängt Artikel und Clips an – unnötig groß)
    if (req.query.type === 'search') {
      data = { results: (data.results || []).filter((g) => g.type === 'player' || g.type === 'team') };
    }
    const ttl = CACHE[req.query.type];
    res.setHeader('Cache-Control', `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 3}`);
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: 'ESPN nicht erreichbar' });
  }
}

module.exports = handler;
module.exports.buildUrl = buildUrl;
module.exports.expandRange = expandRange;

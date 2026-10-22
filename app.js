/* Sport Dashboard – Frontend
 * Holt Daten über eigene Proxies: /api/espn (ESPN), /api/amateur (Fussball.de), /api/hockey (Hockeyweb).
 */
(() => {
  'use strict';

  const VERSION = '2.8.0';

  // ---------- Konfiguration ----------
  const FAV_ID = 'fav';

  // Sportarten = obere Navigationsebene; jede Liga gehört genau zu einer (cat).
  const SPORTS = [
    { id: 'fav', icon: '★', label: 'Favoriten' },
    { id: 'soccer', icon: '⚽', label: 'Fußball' },
    { id: 'football', icon: '🏈', label: 'Football' },
    { id: 'basketball', icon: '🏀', label: 'Basketball' },
    { id: 'hockey', icon: '🏒', label: 'Eishockey' },
    { id: 'baseball', icon: '⚾', label: 'Baseball' },
  ];

  // Ligen. sport/league = ESPN-Pfad. amateur: Fussball.de (teams = Schlüssel in api/_fussballde.js),
  // hockey: Hockeyweb (Schlüssel in api/_hockeyweb.js). group = Abschnitt in der Ligaleiste,
  // color = Akzentfarbe der Liga (färbt Kopfbereich, aktive Tabs usw.).
  const LEAGUES = [
    { id: FAV_ID, name: 'Favoriten', cat: 'fav', isFav: true, color: '#f5c542' },

    { id: 'bl1', abbr: 'BL', name: 'Bundesliga', cat: 'soccer', group: 'Deutschland', sport: 'soccer', league: 'ger.1', color: '#e2001a' },
    { id: 'bl2', abbr: '2.BL', name: '2. Bundesliga', cat: 'soccer', group: 'Deutschland', sport: 'soccer', league: 'ger.2', color: '#ff3b4a' },
    { id: 'kreis', abbr: 'KL', name: 'Kreisliga', cat: 'soccer', group: 'Deutschland', amateur: true, teams: ['sgm1', 'sgm2'], color: '#2fbf71' },
    { id: 'ucl', abbr: 'UCL', name: 'Champions League', cat: 'soccer', group: 'Europapokal', sport: 'soccer', league: 'uefa.champions', color: '#3c7bff' },
    { id: 'uel', abbr: 'UEL', name: 'Europa League', cat: 'soccer', group: 'Europapokal', sport: 'soccer', league: 'uefa.europa', color: '#ff7a00' },
    { id: 'uecl', abbr: 'UECL', name: 'Conference League', cat: 'soccer', group: 'Europapokal', sport: 'soccer', league: 'uefa.europa.conf', color: '#22c979' },
    { id: 'epl', abbr: 'PL', name: 'Premier League', cat: 'soccer', group: 'Topligen', sport: 'soccer', league: 'eng.1', color: '#a35cff' },
    { id: 'laliga', abbr: 'LL', name: 'La Liga', cat: 'soccer', group: 'Topligen', sport: 'soccer', league: 'esp.1', color: '#ff4b44' },
    { id: 'seriea', abbr: 'SA', name: 'Serie A', cat: 'soccer', group: 'Topligen', sport: 'soccer', league: 'ita.1', color: '#1e9bff' },
    { id: 'ligue1', abbr: 'L1', name: 'Ligue 1', cat: 'soccer', group: 'Topligen', sport: 'soccer', league: 'fra.1', color: '#cddc39' },
    { id: 'mls', abbr: 'MLS', name: 'MLS', cat: 'soccer', group: 'Amerika', sport: 'soccer', league: 'usa.1', color: '#5a8dee' },

    { id: 'nfl', abbr: 'NFL', name: 'NFL', cat: 'football', group: 'Profis', sport: 'football', league: 'nfl', color: '#3a7bec' },
    { id: 'cfb', abbr: 'CFB', name: 'NCAAF', cat: 'football', group: 'College', sport: 'football', league: 'college-football', groups: '80', color: '#e0483e' },

    { id: 'nba', abbr: 'NBA', name: 'NBA', cat: 'basketball', group: 'Profis', sport: 'basketball', league: 'nba', color: '#f0484e' },
    { id: 'cbb', abbr: 'CBB', name: 'NCAAM', cat: 'basketball', group: 'College', sport: 'basketball', league: 'mens-college-basketball', groups: '50', color: '#ff9f1a' },

    { id: 'nhl', abbr: 'NHL', name: 'NHL', cat: 'hockey', group: 'Nordamerika', sport: 'hockey', league: 'nhl', color: '#b4c0cc' },
    { id: 'del', abbr: 'DEL', name: 'DEL', cat: 'hockey', group: 'Deutschland', hockey: 'del', color: '#2f8cff' },
    { id: 'del2', abbr: 'DEL2', name: 'DEL2', cat: 'hockey', group: 'Deutschland', hockey: 'del2', color: '#22b8e8' },
    { id: 'obs', abbr: 'OL S', name: 'Oberliga Süd', cat: 'hockey', group: 'Deutschland', hockey: 'obs', color: '#7ea6ff' },
    { id: 'obn', abbr: 'OL N', name: 'Oberliga Nord', cat: 'hockey', group: 'Deutschland', hockey: 'obn', color: '#7ea6ff' },
    { id: 'nl', abbr: 'NL', name: 'NL (Schweiz)', cat: 'hockey', group: 'Europa', hockey: 'nl', noNews: true, color: '#ff3b3b' },
    { id: 'icehl', abbr: 'ICE', name: 'ICEHL', cat: 'hockey', group: 'Europa', hockey: 'icehl', color: '#ff6b6b' },
    { id: 'chl', abbr: 'CHL', name: 'CHL', cat: 'hockey', group: 'Europa', hockey: 'chl', color: '#ffb000' },
    { id: 'shl', abbr: 'SHL', name: 'SHL', cat: 'hockey', group: 'Europa', hockey: 'shl', noNews: true, color: '#2fb0ff' },
    { id: 'dcup', abbr: 'DCup', name: 'Deutschland-Cup', cat: 'hockey', group: 'Deutschland', hockey: 'dcup', color: '#e0483e' },

    { id: 'mlb', abbr: 'MLB', name: 'MLB', cat: 'baseball', group: 'Profis', sport: 'baseball', league: 'mlb', color: '#4a83e8' },
  ];
  // Virtuelle Ligen „Live“ je Sportart: alle laufenden Spiele dieser Sportart (erscheint vorne in der Ligaleiste)
  SPORTS.filter((sp) => sp.id !== 'fav').forEach((sp) => LEAGUES.push({ id: `live-${sp.id}`, name: 'Live', cat: sp.id, isLive: true, color: '#ff4757' }));
  const DEFAULT_LEAGUE = { fav: FAV_ID, soccer: 'bl1', football: 'nfl', basketball: 'nba', hockey: 'nhl', baseball: 'mlb' };
  const AMATEUR_LABEL = { sgm1: 'SGM I', sgm2: 'SGM II' };

  // US-Ligen: Spieltag richtet sich nach US-Eastern-Zeit, nicht nach deutscher
  // Kalendergrenze (ein Spiel in der Nacht Sa/So deutscher Zeit gehört noch zum Samstag).
  const US_TZ = 'America/New_York';
  const US_LEAGUE_IDS = new Set(['nfl', 'nba', 'mlb', 'nhl', 'cfb', 'cbb']);
  const leagueTZ = (lg) => (lg && US_LEAGUE_IDS.has(lg.id) ? US_TZ : undefined);
  const COLLEGE_IDS = new Set(['cfb', 'cbb']);

  // Ligen mit eigener Datenquelle (Fussball.de bzw. Hockeyweb) laufen nicht über die ESPN-API
  // und haben keinen News-Tab.
  // Kein News-Tab: Amateurfußball und Hockeyweb-Ligen ohne eigene Meldungsgruppe (NL, SHL)
  function noNewsTab(l) { return !!(l && (l.amateur || l.noNews || l.isLive)); }
  function isOwnSource(l) { return !!(l && (l.amateur || l.hockey)); }
  const isEspn = (l) => !!(l && l.sport && l.league);

  const REFRESH_LIVE_MS = 30_000;
  const LS_FAV = 'sd:favorites';
  const LS_STATE = 'sd:state';
  const LS_PINS = 'sd:pins';
  const LS_LAST = 'sd:lastLeague';

  // ---------- Zustand ----------
  const saved = readJSON(LS_STATE, {});
  // Alte Einzel-Ligen SGM I / SGM II sind jetzt gemeinsam die "Kreisliga"
  if (saved.leagueId === 'sgm1' || saved.leagueId === 'sgm2') saved.leagueId = 'kreis';
  const initialLeagueId = LEAGUES.some((l) => l.id === saved.leagueId) ? saved.leagueId : 'bl1';
  const initialLeague = LEAGUES.find((l) => l.id === initialLeagueId);
  const state = {
    leagueId: initialLeagueId,
    tab: initialLeagueId === FAV_ID ? 'scores' : (['scores', 'standings', 'news'].includes(saved.tab) && !(noNewsTab(initialLeague) && saved.tab === 'news') ? saved.tab : 'scores'),
    date: defaultAnchor(initialLeague),
    top25Only: !!saved.top25Only,
    standingsConf: null, // Tabellen-Ansicht bei NCAAF/NCAAM: 'top25' oder ein Conference-Name
    autoReload: !!saved.autoReload,
    kreisTeam: ['all', 'sgm1', 'sgm2'].includes(saved.kreisTeam) ? saved.kreisTeam : 'all',
    highlight: null, // Team, das nach einer Suche in der Tabelle kurz hervorgehoben wird
  };
  let favorites = new Set(readJSON(LS_FAV, []).map((k) => k.replace(/^sgm[12]:/, 'kreis:')));
  writeJSON(LS_FAV, [...favorites]);
  let pins = readJSON(LS_PINS, []).filter((p) => p && p.key && p.day);
  const lastLeague = readJSON(LS_LAST, {});
  let refreshTimer = null;
  let requestId = 0;
  // Roh-Event-Daten je Liga+ID zwischenspeichern, damit das Gamecast-Popup bei
  // Fußball einen Score/Status-Fallback hat (ESPNs Summary-Endpoint liefert dort
  // kein "header" wie bei NFL/NHL/MLB).
  const eventCache = new Map();
  const pinSnapshots = new Map(); // Kartenschlüssel → Daten zum Merken eines Spiels
  const leagueMeta = new Map(); // Liga-ID → { logo, season } aus dem Scoreboard

  // Gemerkte Spiele älter als 45 Tage automatisch aufräumen
  (() => {
    const cutoff = ymdOf(new Date(Date.now() - 45 * 864e5));
    const before = pins.length;
    pins = pins.filter((p) => p.day >= cutoff);
    if (pins.length !== before) writeJSON(LS_PINS, pins);
  })();

  function todayAnchor() {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d;
  }
  // US-Ligen: Die Spiele der Nacht laufen in deutscher Zeit nach Mitternacht – bis 10 Uhr
  // morgens gilt daher noch der Vortag als "aktueller" Spieltag. Europäische Ligen: Kalendertag.
  function defaultAnchor(lg) {
    const d = todayAnchor();
    if (lg && US_LEAGUE_IDS.has(lg.id) && new Date().getHours() < 10) d.setDate(d.getDate() - 1);
    return d;
  }
  // ESPN-Abfragetag einer Liga für ein Datum der Favoriten-Ansicht ("heute" vor 10 Uhr → US-Vortag)
  function espnDayFor(lg, d) {
    const base = (ymdOf(d) === ymdOf(todayAnchor())) ? defaultAnchor(lg) : d;
    return ymdInTZ(base, leagueTZ(lg));
  }

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const el = {
    sports: $('sports'), leaguebar: $('leaguebar'), tabs: $('tabs'), content: $('content'), status: $('status'),
    heroLogo: $('heroLogo'), heroName: $('heroName'), heroKicker: $('heroKicker'),
    scoreControls: $('scoreControls'), dateText: $('dateText'), dateInput: $('dateInput'),
    prevDay: $('prevDay'), nextDay: $('nextDay'), todayBtn: $('todayBtn'),
    top25Toggle: $('top25Toggle'), top25Only: $('top25Only'), updated: $('updated'), version: $('version'), source: $('source'),
    autoReload: $('autoReload'),
    searchBtn: $('searchBtn'), search: $('search'), searchInput: $('searchInput'), searchResults: $('searchResults'), searchClose: $('searchClose'),
  };

  // ---------- Hilfsfunktionen ----------
  function readJSON(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* egal */ }
  }
  function persist() {
    writeJSON(LS_STATE, { leagueId: state.leagueId, tab: state.tab, top25Only: state.top25Only, autoReload: state.autoReload, kreisTeam: state.kreisTeam });
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const leagueById = (id) => LEAGUES.find((l) => l.id === id);
  const currentLeague = () => leagueById(state.leagueId);
  const favKey = (teamId, leagueId = state.leagueId) => `${leagueId}:${teamId}`;
  const isFav = (teamId, leagueId = state.leagueId) => favorites.has(favKey(teamId, leagueId));
  function toggleFav(teamId, leagueId) {
    const key = favKey(teamId, leagueId);
    if (favorites.has(key)) favorites.delete(key); else favorites.add(key);
    writeJSON(LS_FAV, [...favorites]);
    syncMark(`f:${key}`, favorites.has(key));
  }
  const isPinned = (key) => pins.some((p) => p.key === key);
  function togglePin(key) {
    if (isPinned(key)) { pins = pins.filter((p) => p.key !== key); syncMark(`p:${key}`, false); }
    else {
      const snap = pinSnapshots.get(key);
      if (!snap) return;
      pins.push(snap);
      syncMark(`p:${key}`, true, snap);
    }
    writeJSON(LS_PINS, pins);
  }

  // ---------- Geräte-Sync (Favoriten-Teams + gemerkte Spiele) ----------
  // Jede Änderung wird mit Zeitstempel im "Journal" vermerkt (auch Löschungen). Beim Abgleich
  // mit /api/sync gewinnt je Eintrag der neueste Stand – so gehen Änderungen auf keinem Gerät verloren.
  const LS_SYNC = 'sd:sync';
  const LS_JOURNAL = 'sd:syncItems';
  const syncCfg = readJSON(LS_SYNC, {});
  let journal = readJSON(LS_JOURNAL, null) || {};
  // Bestehende lokale Einträge ohne Journal mit Zeitstempel 0 aufnehmen (verlieren gegen jede echte Änderung)
  favorites.forEach((k) => { if (!journal[`f:${k}`]) journal[`f:${k}`] = { t: 0, on: true }; });
  pins.forEach((p) => { if (!journal[`p:${p.key}`]) journal[`p:${p.key}`] = { t: 0, on: true, data: p }; });
  writeJSON(LS_JOURNAL, journal);
  let syncTimer = null;
  let syncBusy = false;
  let syncError = '';

  function syncMark(key, on, data) {
    journal[key] = { t: Date.now(), on, ...(on && data ? { data } : {}) };
    writeJSON(LS_JOURNAL, journal);
    if (syncCfg.code) { clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(), 1200); }
  }

  function applyJournal(items) {
    const before = JSON.stringify([[...favorites].sort(), pins.map((p) => p.key).sort()]);
    journal = items || {};
    favorites = new Set(Object.keys(journal).filter((k) => k.startsWith('f:') && journal[k].on).map((k) => k.slice(2)));
    const pinCutoff = ymdOf(new Date(Date.now() - 45 * 864e5));
    pins = Object.entries(journal).filter(([k, v]) => k.startsWith('p:') && v.on && v.data?.key && String(v.data.day || '') >= pinCutoff).map(([, v]) => v.data);
    writeJSON(LS_JOURNAL, journal);
    writeJSON(LS_FAV, [...favorites]);
    writeJSON(LS_PINS, pins);
    return JSON.stringify([[...favorites].sort(), pins.map((p) => p.key).sort()]) !== before;
  }

  async function syncNow() {
    if (!syncCfg.code || syncBusy) return false;
    syncBusy = true;
    renderSyncState();
    try {
      const res = await fetch('/api/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: syncCfg.code, items: journal }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
      const changed = applyJournal(data.items);
      syncCfg.last = Date.now();
      writeJSON(LS_SYNC, syncCfg);
      syncError = '';
      if (changed) { renderSports(); renderLeaguebar(); reloadSilently(); }
      return true;
    } catch (e) {
      syncError = e.message;
      return false;
    } finally {
      syncBusy = false;
      renderSyncState();
    }
  }

  const SYNC_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function newSyncCode() {
    const r = new Uint8Array(16);
    crypto.getRandomValues(r);
    return [...r].map((b) => SYNC_ALPHABET[b % 32]).join('');
  }
  const normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const fmtCode = (c) => c.replace(/(.{4})(?=.)/g, '$1-');
  const syncLink = () => `${location.origin}${location.pathname}?sync=${syncCfg.code}`;

  function ymdOf(d) {
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }
  function toISODate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  // Datum eines Zeitpunkts in einer bestimmten Zeitzone als YYYYMMDD (für den ESPN-Request).
  function ymdInTZ(d, tz) {
    if (!tz) return ymdOf(d);
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t).value;
    return `${get('year')}${get('month')}${get('day')}`;
  }
  const ymdToDate = (s) => new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), 12);
  const fmtTime = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
  const fmtShort = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  const fmtChip = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const fmtNews = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  // Tagesüberschrift, optional in einer anderen Zeitzone formatiert (US-Ligen → Eastern Time).
  function fmtDayFor(d, tz) {
    return new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: tz }).format(d);
  }
  function relDay(d) {
    const diff = Math.round((ymdToDate(ymdOf(d)) - todayAnchor()) / 864e5);
    return { '-1': 'Gestern', 0: 'Heute', 1: 'Morgen' }[diff] || null;
  }

  // ---------- Spieltage (für Tagesnavigation: nur Tage mit echten Spielen) ----------
  // ESPNs Scoreboard liefert unter leagues[0].calendar entweder eine flache Liste von
  // Tagen (NBA/NHL/MLB/NCAAM/Fußball) oder – bei NFL/NCAAF – eine Liste von Saisonphasen
  // mit Wochen-Einträgen (nur Wochen-Grenzen, keine einzelnen Spieltage). Für Letztere
  // wird die konkrete Woche (seasontype/week) separat abgefragt.
  const gameDayCache = new Map();

  async function gameDaySet(lg, forDate) {
    if (!isEspn(lg)) return null;
    const tz = leagueTZ(lg);
    const target = forDate instanceof Date ? forDate : state.date;

    const calKey = `${lg.id}:cal`;
    let cal = gameDayCache.get(calKey);
    if (cal === undefined) {
      try {
        const params = {};
        if (lg.groups) params.groups = lg.groups;
        const data = await api('scoreboard', params, lg);
        rememberLeagueMeta(lg, data);
        cal = data?.leagues?.[0]?.calendar || [];
      } catch { cal = []; }
      gameDayCache.set(calKey, cal);
    }
    if (!cal.length) return null;

    if (typeof cal[0] === 'string') {
      const daysKey = `${lg.id}:days`;
      let days = gameDayCache.get(daysKey);
      if (!days) {
        days = new Set(cal.map((iso) => ymdInTZ(new Date(iso), tz)));
        gameDayCache.set(daysKey, days);
      }
      return days;
    }

    // Wochenbasiert (NFL/NCAAF): Vergleich über Kalendertage (ymdInTZ), nicht über rohe Zeitstempel.
    const targetYmd = ymdInTZ(target, tz);
    let group = null, entry = null;
    outer: for (const g of cal) {
      for (const e of g.entries || []) {
        const sYmd = ymdInTZ(new Date(e.startDate), tz);
        const eYmd = ymdInTZ(new Date(e.endDate), tz);
        if (targetYmd >= sYmd && targetYmd <= eYmd) { group = g; entry = e; break outer; }
      }
    }
    if (!entry) return null;
    const weekKey = `${lg.id}:week:${group.value}:${entry.value}`;
    let days = gameDayCache.get(weekKey);
    if (!days) {
      try {
        const params = { seasontype: group.value, week: entry.value };
        if (lg.groups) params.groups = lg.groups;
        const data = await api('scoreboard', params, lg);
        days = new Set((data?.events || []).map((ev) => ymdInTZ(new Date(ev.date), tz)));
      } catch { days = new Set(); }
      gameDayCache.set(weekKey, days);
    }
    return days;
  }

  // Beim Liga-Wechsel: von heute aus vorwärts zum nächsten Tag mit Spiel springen.
  async function snapToGameDay(lg) {
    if (!isEspn(lg)) return;
    let d = defaultAnchor(lg);
    for (let i = 0; i < 60; i++) {
      const days = await gameDaySet(lg, d);
      if (!days || !days.size) return;
      if (days.has(ymdInTZ(d, leagueTZ(lg)))) {
        if (currentLeague()?.id !== lg.id) return;
        state.date = d;
        return;
      }
      d = new Date(d);
      d.setDate(d.getDate() + 1);
    }
  }

  async function api(type, params = {}, leagueOverride) {
    const lg = leagueOverride || currentLeague();
    const qs = new URLSearchParams(type === 'search' ? { type, ...params } : { type, sport: lg.sport, league: lg.league, ...params });
    const res = await fetch(`/api/espn?${qs}`);
    if (!res.ok) {
      let msg = `Fehler ${res.status}`;
      try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
      throw new Error(msg);
    }
    return res.json();
  }

  const pickLeagueLogo = (L) => (L?.logos || []).find((x) => (x.rel || []).includes('dark'))?.href || L?.logos?.[0]?.href || '';
  function rememberLeagueMeta(lg, data) {
    const L = data?.leagues?.[0];
    if (!L || leagueMeta.has(lg.id)) return;
    leagueMeta.set(lg.id, { logo: pickLeagueLogo(L), season: L.season?.displayName || '' });
    if (currentLeague()?.id === lg.id) renderHero();
  }

  // ---------- Liga-Logos ----------
  // Eigene Logos (lg.logo, z. B. 'logos/kreisliga.png') haben Vorrang; sonst ESPN-Ligalogo aus dem
  // Scoreboard (einmal abgefragt mit einem alten Datum = kleine Antwort ohne Spiele, 30 Tage gespeichert).
  const LS_LOGOS = 'sd:leaguelogos';
  const logoStore = readJSON(LS_LOGOS, { t: 0, map: {} });
  const logoFresh = Date.now() - (logoStore.t || 0) < 30 * 864e5;
  const leagueLogos = logoFresh ? (logoStore.map || {}) : {};
  const leagueLogoUrl = (lg) => lg?.logo || leagueLogos[lg?.id] || '';
  function leagueBadge(lg, cls = 'lg-logo') {
    const url = leagueLogoUrl(lg);
    if (url) return `<img class="${cls}" src="${esc(url)}" alt="" loading="lazy">`;
    return `<span class="${cls} lg-abbr" style="--lg:${lg.color}">${esc(lg.abbr || lg.name.slice(0, 3))}</span>`;
  }
  async function loadLeagueLogos() {
    const missing = LEAGUES.filter((l) => isEspn(l) && !l.logo && !leagueLogos[l.id]);
    if (!missing.length) return;
    await Promise.all(missing.map(async (lg) => {
      try {
        const data = await api('scoreboard', { dates: '19990101' }, lg);
        const url = pickLeagueLogo(data?.leagues?.[0]);
        if (url) leagueLogos[lg.id] = url;
      } catch { /* kein Logo */ }
    }));
    writeJSON(LS_LOGOS, { t: logoFresh ? logoStore.t : Date.now(), map: leagueLogos });
    renderLeaguebar();
    renderHero();
  }

  // ---------- Live-Zähler je Liga/Sportart ----------
  // /api/live zählt serverseitig die laufenden Spiele aller ESPN-Ligen (nur Zahlen, kleine Antwort).
  let liveCounts = {};
  let liveTimer = null;
  async function pollLive() {
    clearTimeout(liveTimer);
    if (!document.hidden) {
      const spec = LEAGUES.filter(isEspn).map((lg) => `${lg.id}:${ymdInTZ(defaultAnchor(lg), leagueTZ(lg))}`).join(',');
      try {
        const res = await fetch(`/api/live?l=${encodeURIComponent(spec)}`);
        if (res.ok) { liveCounts = (await res.json()).live || {}; renderSports(); renderLeaguebar(); }
      } catch { /* nächster Versuch */ }
    }
    liveTimer = setTimeout(pollLive, 60_000);
  }
  const liveIn = (pred) => LEAGUES.filter(pred).reduce((n, l) => n + (+liveCounts[l.id] || 0), 0);

  function showStatus(text, isError = false) {
    el.status.hidden = !text;
    el.status.textContent = text || '';
    el.status.classList.toggle('error', isError);
  }
  function setUpdated() {
    el.updated.textContent = `Stand: ${fmtTime.format(new Date())} Uhr`;
  }
  function skeleton(n = 6) {
    el.content.innerHTML = `<div class="games">${'<div class="skeleton"></div>'.repeat(n)}</div>`;
  }

  // ---------- Navigation ----------
  function renderSports() {
    const cat = currentLeague().cat;
    el.sports.innerHTML = SPORTS.map((s) => {
      const badge = s.id === 'fav' && pins.length ? `<span class="sport-badge">${pins.length}</span>` : '';
      const live = s.id === 'fav' ? 0 : liveIn((l) => l.cat === s.id);
      const liveBadge = live ? `<span class="sport-live" title="${live} Spiel${live === 1 ? '' : 'e'} live">${live}</span>` : '';
      return `<button type="button" class="sport-btn${s.id === cat ? ' active' : ''}${s.id === 'fav' ? ' sport-fav' : ''}${live ? ' has-live' : ''}" data-sport="${s.id}" aria-label="${esc(s.label)}" title="${esc(s.label)}" aria-pressed="${s.id === cat}">
        <span class="sport-icon" aria-hidden="true">${s.icon}</span><span class="sport-label">${esc(s.label)}</span>${badge}${liveBadge}
      </button>`;
    }).join('');
    const act = el.sports.querySelector('.sport-btn.active');
    if (act) el.sports.scrollLeft = Math.max(0, act.offsetLeft - 12);
  }

  function renderLeaguebar() {
    const lg = currentLeague();
    if (lg.isFav) {
      const teams = favorites.size, pinned = pins.length;
      el.leaguebar.innerHTML = `<div class="lg-info"><span>★ ${teams} Team${teams === 1 ? '' : 's'}</span><span>🔖 ${pinned} gemerkte${pinned === 1 ? 's' : ''} Spiel${pinned === 1 ? '' : 'e'}</span><span class="muted">Tipp: ★ markiert Teams, 🔖 merkt einzelne Spiele</span></div>`;
      return;
    }
    const members = LEAGUES.filter((l) => l.cat === lg.cat && !l.isLive);
    const liveN = liveIn((l) => l.cat === lg.cat && !l.isLive);
    const liveChip = liveN || lg.isLive
      ? `<button type="button" class="lg-chip live-chip${lg.isLive ? ' active' : ''}" data-league="live-${lg.cat}" style="--lg:#ff4757"><span class="lg-logo live-dot" aria-hidden="true"></span><span>Live</span>${liveN ? `<span class="lg-live">${liveN}</span>` : ''}</button><span class="lg-sep" aria-hidden="true"></span>`
      : '';
    el.leaguebar.innerHTML = liveChip + members.map((l) => {
      const live = +liveCounts[l.id] || 0;
      return `<button type="button" class="lg-chip${l.id === lg.id ? ' active' : ''}${live ? ' has-live' : ''}" data-league="${l.id}" style="--lg:${l.color}">
        ${leagueBadge(l)}<span>${esc(l.name)}</span>${live ? `<span class="lg-live" title="${live} live">${live}</span>` : ''}
      </button>`;
    }).join('');
    el.leaguebar.querySelector('.lg-chip.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function renderHero() {
    const lg = currentLeague();
    const sport = SPORTS.find((s) => s.id === lg.cat);
    document.documentElement.style.setProperty('--accent', lg.color || '#e5484d');
    const meta = leagueMeta.get(lg.id);
    const hl = lg.isFav ? '' : leagueLogoUrl(lg) || meta?.logo;
    el.heroLogo.innerHTML = hl ? `<img src="${esc(hl)}" alt="">` : lg.abbr ? `<b class="hero-abbr">${esc(lg.abbr)}</b>` : `<span>${sport?.icon || '★'}</span>`;
    if (lg.isLive) el.heroLogo.innerHTML = '<span class="hero-live" aria-hidden="true"></span>';
    el.heroName.textContent = lg.isFav ? 'Meine Favoriten' : lg.isLive ? `Live · ${sport?.label || ''}` : lg.name;
    const kick = lg.isFav ? 'Teams & gemerkte Spiele aus allen Ligen'
      : lg.isLive ? 'Alle laufenden Spiele · nach Liga und Beginn'
      : lg.amateur ? 'Fußball · SGM Gündelbach/Häfnerhaslach'
        : [sport?.label, meta?.season].filter(Boolean).join(' · ');
    el.heroKicker.textContent = kick;
  }

  function renderTabs() {
    const lg = currentLeague();
    const isFavView = !!(lg.isFav || lg.isLive);
    const isCollege = COLLEGE_IDS.has(state.leagueId);
    el.tabs.querySelectorAll('.tab').forEach((b) => {
      const hide = (isFavView && b.dataset.tab !== 'scores') || (noNewsTab(lg) && b.dataset.tab === 'news');
      b.style.display = hide ? 'none' : '';
      const active = b.dataset.tab === state.tab;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active);
    });
    el.tabs.style.display = isFavView ? 'none' : '';
    el.scoreControls.style.display = state.tab === 'scores' && !lg.isLive ? '' : 'none';
    el.source.textContent = lg.amateur
      ? 'Daten: Fussball.de (ausgelesen, ohne Torstände) · Zeiten laut Spielplan'
      : lg.hockey
        ? 'Daten: Hockeyweb (App-Schnittstelle) · Zeiten in deutscher Zeit'
        : 'Daten: ESPN (inoffizielle öffentliche API) · Zeiten in deiner Ortszeit';
    el.top25Toggle.hidden = !isCollege || isFavView;
  }
  function renderDate() {
    const rel = relDay(state.date);
    el.dateText.textContent = rel ? `${rel} · ${fmtChip.format(state.date)}` : fmtShort.format(state.date);
    el.dateInput.value = toISODate(state.date);
    el.todayBtn.hidden = ymdOf(state.date) === ymdOf(defaultAnchor(currentLeague()));
  }
  function renderChrome() {
    renderSports();
    renderLeaguebar();
    renderHero();
  }

  // ---------- Spielkarte (einheitlich für ESPN, Fussball.de, Hockeyweb) ----------
  // Modell: { lgId, eventId?, link?, linkLabel?, state: pre|in|post, mid, statusHtml, note, home, away, extra, meta, pin, showLeague }
  // Seite: { name, teamId?, favId, logoHtml, logoUrl, color, alt, score, sub, rank, dim }
  const BOOKMARK = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z" fill="currentColor"/></svg>';

  function matchCard(m) {
    const [hc0, ac0] = window.TeamColor.pair({ color: m.home.color, alt: m.home.alt }, { color: m.away.color, alt: m.away.alt });
    const hc = hc0 || window.TeamColor.cached(m.home.logoUrl);
    const ac = ac0 || window.TeamColor.cached(m.away.logoUrl);
    const style = [hc ? `--c-home:${hc}` : '', ac ? `--c-away:${ac}` : ''].filter(Boolean).join(';');
    const lc = `${!hc && m.home.logoUrl ? ` data-lc-home="${esc(m.home.logoUrl)}"` : ''}${!ac && m.away.logoUrl ? ` data-lc-away="${esc(m.away.logoUrl)}"` : ''}`;
    const fav = isFav(m.home.favId, m.lgId) || isFav(m.away.favId, m.lgId);
    const pinned = m.pin && isPinned(m.pin.key);
    if (m.pin) pinSnapshots.set(m.pin.key, m.pin);
    const clickable = !!m.eventId;
    const lg = leagueById(m.lgId);

    const team = (t, side) => `
      <div class="mc-team ${side}${t.dim ? ' dim' : ''}">
        <div class="mc-logo">${t.logoHtml || '<span class="mc-logo-ph"></span>'}</div>
        <div class="mc-name-row">
          <button class="mc-star${isFav(t.favId, m.lgId) ? ' on' : ''}" data-fav="${esc(t.favId)}" data-fav-league="${esc(m.lgId)}" title="Team als Favorit markieren" aria-label="${esc(t.name)} als Favorit">★</button>
          <span class="mc-name${t.teamId ? ' gc-link' : ''}"${t.teamId ? ` data-team-id="${esc(t.teamId)}"` : ''}>${t.rank ? `<i class="mc-rank">${esc(t.rank)}</i>` : ''}${esc(t.name).replace(/\//g, '/&#8203;')}</span>
        </div>
        ${t.sub ? `<div class="mc-sub">${esc(t.sub)}</div>` : ''}
      </div>`;

    const showScore = m.state !== 'pre' && m.home.score != null && m.home.score !== '';
    const mid = showScore
      ? `<div class="mc-score"><span class="${m.home.dim ? 'dim' : ''}">${esc(m.home.score)}</span><i>:</i><span class="${m.away.dim ? 'dim' : ''}">${esc(m.away.score)}</span></div>`
      : `<div class="mc-time">${esc(m.mid || '')}</div>`;

    return `
      <article class="mc${m.state === 'in' ? ' live' : ''}${fav ? ' fav' : ''}${pinned ? ' pinned' : ''}${m.own ? ' own' : ''}${clickable ? ' clickable' : ''}"
        style="${style}"${lc} data-league-id="${esc(m.lgId)}"${clickable ? ` data-event="${esc(m.eventId)}" data-link="${esc(m.link || '')}" tabindex="0" role="button" aria-label="${esc(`${m.home.name} gegen ${m.away.name} – Details öffnen`)}"` : ''}>
        <div class="mc-top">
          <span class="mc-tag">${m.showLeague && lg ? `<b style="--lg:${lg.color}">${esc(lg.name)}</b>` : ''}${m.note ? `<span>${esc(m.note)}</span>` : ''}</span>
          ${m.pin ? `<button class="mc-pin${pinned ? ' on' : ''}" data-pin="${esc(m.pin.key)}" title="${pinned ? 'Nicht mehr merken' : 'Spiel merken'}" aria-pressed="${!!pinned}" aria-label="Spiel merken">${BOOKMARK}</button>` : ''}
        </div>
        <div class="mc-main">
          ${team(m.home, 'home')}
          <div class="mc-mid">${mid}<div class="mc-state">${m.statusHtml || ''}</div></div>
          ${team(m.away, 'away')}
        </div>
        ${m.extra ? `<div class="mc-extra">${m.extra}</div>` : ''}
        ${m.meta || (m.link && !isEspnUrl(m.link)) ? `<div class="mc-meta"><span>${esc(m.meta || '')}</span>${m.link && !isEspnUrl(m.link) ? `<a href="${esc(m.link)}" target="_blank" rel="noopener">${esc(m.linkLabel || 'ESPN')} ↗</a>` : ''}</div>` : ''}
      </article>`;
  }

  // ESPN-Links führen auf dem Handy in die ESPN-App → nicht anzeigen, die App hat eigene Ansichten
  const isEspnUrl = (u) => /(^|\.)espn\.(com|go\.com)\b|espn\.com\//i.test(String(u || ''));
  function paintCards() { window.TeamColor.paint(el.content); }

  // ---------- ESPN-Spiele ----------
  function translateStatus(st) {
    const d = st.shortDetail || st.detail || st.description || '';
    const map = { Final: 'Ende', 'Final/OT': 'Ende n.V.', 'Final/SO': 'Ende n.P.', FT: 'Ende', AET: 'Ende n.V.', 'FT-Pens': 'Ende n.E.', Postponed: 'Verschoben', Canceled: 'Abgesagt', HT: 'Halbzeit', Halftime: 'Halbzeit' };
    return map[d] || d;
  }

  function espnModel(ev, lg, showLeague = false) {
    eventCache.set(`${lg.id}:${ev.id}`, ev);
    const comp = ev.competitions?.[0] || {};
    const st = ev.status?.type || comp.status?.type || {};
    const stateName = st.state || 'pre';
    const cs = comp.competitors || [];
    const H = cs.find((c) => c.homeAway === 'home') || cs[0] || {};
    const A = cs.find((c) => c.homeAway === 'away') || cs[1] || {};
    const soccer = lg.sport === 'soccer';
    const anyWinner = cs.some((c) => c.winner);
    const side = (c) => {
      const t = c.team || {};
      const rec = c.records?.find((r) => r.type === 'total' || r.name === 'overall')?.summary;
      const logo = t.logo || t.logos?.[0]?.href || '';
      return {
        name: soccer ? t.shortDisplayName || t.displayName : t.displayName || t.name || '',
        teamId: t.id, favId: t.id,
        logoHtml: logo ? window.LogoPref.img(t.id, logo, 'gc-link', ` data-team-id="${esc(t.id)}"`) : '',
        color: t.color, alt: t.alternateColor,
        score: c.score ?? '',
        sub: rec || '',
        rank: c.curatedRank?.current && c.curatedRank.current <= 25 ? `#${c.curatedRank.current}` : '',
        dim: stateName === 'post' && anyWinner && c.winner === false,
      };
    };
    let statusHtml, mid = '';
    if (stateName === 'in') statusHtml = `<span class="live-badge">${esc(st.shortDetail || 'Live')}</span>`;
    else if (stateName === 'post') statusHtml = `<span class="mc-final">${esc(translateStatus(st))}</span>`;
    else {
      const timeOpen = ev.timeValid === false || comp.timeValid === false;
      mid = timeOpen ? 'offen' : fmtTime.format(new Date(ev.date));
      statusHtml = `<span>${timeOpen ? 'Zeit noch offen' : (showLeague ? fmtChip.format(new Date(ev.date)) : 'Uhr')}</span>`;
      if (['STATUS_POSTPONED', 'STATUS_CANCELED'].includes(st.name)) statusHtml = `<span class="mc-final">${esc(translateStatus(st))}</span>`;
    }
    const venue = comp.venue?.fullName;
    const tv = comp.broadcasts?.flatMap((b) => b.names || []).join(', ');
    const link = (ev.links || []).find((l) => (l.rel || []).includes('summary'))?.href;
    const home = side(H), away = side(A);
    const key = `${lg.id}:${ev.id}`;
    return {
      lgId: lg.id, eventId: ev.id, link, linkLabel: 'ESPN',
      state: stateName, mid, statusHtml,
      note: comp.notes?.[0]?.headline || comp.series?.summary || '',
      home, away,
      extra: stateName !== 'pre' ? leadersHtml(comp) : '',
      meta: [venue, tv].filter(Boolean).join(' · '),
      showLeague,
      pin: { key, lg: lg.id, id: ev.id, day: ymdInTZ(new Date(ev.date), leagueTZ(lg)), date: ev.date, home: home.name, away: away.name },
    };
  }

  function leadersHtml(comp) {
    const list = (comp.leaders || []).slice(0, 3).map((cat) => {
      const l = cat.leaders?.[0];
      if (!l?.athlete) return '';
      return `<span><em>${esc(cat.shortDisplayName || cat.abbreviation)}</em> <b class="gc-link" data-player-id="${esc(l.athlete.id)}">${esc(l.athlete.shortName || l.athlete.displayName)}</b> ${esc(l.displayValue)}</span>`;
    }).filter(Boolean);
    return list.join('');
  }

  async function loadScores({ silent = false } = {}) {
    const id = ++requestId;
    if (!silent) { skeleton(); showStatus(''); }
    const lg = currentLeague();
    const params = { dates: ymdInTZ(state.date, leagueTZ(lg)) };
    if (lg.groups) params.groups = lg.groups;
    try {
      const data = await api('scoreboard', params);
      if (id !== requestId) return;
      rememberLeagueMeta(lg, data);
      renderScores(data, lg);
      setUpdated();
      scheduleRefresh(data);
    } catch (e) {
      if (id !== requestId) return;
      if (!silent) { el.content.innerHTML = ''; showStatus(`Spiele konnten nicht geladen werden: ${e.message}`, true); }
    }
  }

  function scheduleRefresh(data) {
    clearTimeout(refreshTimer);
    const hasLive = (data.events || []).some((ev) => ev.status?.type?.state === 'in');
    if (hasLive && state.tab === 'scores') {
      refreshTimer = setTimeout(() => {
        if (!document.hidden) loadScores({ silent: true });
        else scheduleRefresh(data);
      }, REFRESH_LIVE_MS);
    }
  }

  const isTop25 = (c) => c.curatedRank?.current && c.curatedRank.current <= 25;

  function renderScores(data, lg) {
    let events = (data.events || []).map((ev) => ({ ev, lg }));
    const top25Active = state.top25Only && COLLEGE_IDS.has(lg.id);
    if (top25Active) events = events.filter(({ ev: e }) => (e.competitions?.[0]?.competitors || []).some(isTop25));
    el.content.innerHTML = gameListHtml(events, data.week?.number ? ` · Woche ${data.week.number}` : '', top25Active ? 'Keine Top-25-Spiele an diesem Tag.' : 'Keine Spiele an diesem Tag.');
    paintCards();
  }

  // Liste von {ev, lg}-Paaren, gruppiert nach Spieltag; Live → Favoriten/Gemerkt → Rest
  function gameListHtml(items, label, emptyText, showLeague = false) {
    if (!items.length) return `<div class="empty"><div class="empty-icon">📅</div>${emptyText}</div>`;
    const groups = new Map();
    items.slice().sort((a, b) => new Date(a.ev.date) - new Date(b.ev.date)).forEach(({ ev, lg }) => {
      const day = fmtDayFor(new Date(ev.date), leagueTZ(lg));
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day).push({ ev, lg });
    });
    let html = '';
    let first = true;
    for (const [day, evs] of groups) {
      evs.sort((a, b) => prio(a.ev, a.lg) - prio(b.ev, b.lg));
      const live = evs.filter(({ ev }) => ev.status?.type?.state === 'in').length;
      html += `<h2 class="group-title"><span>${esc(day)}${first ? esc(label) : ''}</span><span class="group-count">${evs.length} Spiel${evs.length === 1 ? '' : 'e'}${live ? ` · <b class="live-text">${live} live</b>` : ''}</span></h2>`;
      html += `<div class="games">${evs.map(({ ev, lg }) => matchCard(espnModel(ev, lg, showLeague))).join('')}</div>`;
      first = false;
    }
    return html;
  }

  function prio(ev, lg) {
    const live = ev.status?.type?.state === 'in';
    const fav = (ev.competitions?.[0]?.competitors || []).some((c) => isFav(c.team?.id, lg?.id)) || isPinned(`${lg?.id}:${ev.id}`);
    return (fav ? 0 : 2) + (live ? 0 : 1);
  }

  // ---------- Favoriten-Ansicht (Teams + gemerkte Spiele, ligaübergreifend) ----------
  function pinsStripHtml() {
    if (!pins.length) return '';
    const today = ymdOf(todayAnchor());
    const sorted = pins.slice().sort((a, b) => (a.day < today) - (b.day < today) || (a.day >= today ? a.day.localeCompare(b.day) : b.day.localeCompare(a.day)));
    const cur = ymdOf(state.date);
    return `<div class="pins">
      <div class="pins-head">🔖 Gemerkte Spiele</div>
      <div class="pins-row">${sorted.map((p) => {
        const lg = leagueById(p.lg);
        const d = ymdToDate(p.day);
        return `<div class="pin-chip${p.day === cur ? ' current' : ''}${p.day < today ? ' past' : ''}" style="--lg:${lg?.color || '#888'}">
          <button type="button" class="pin-go" data-goto-day="${esc(p.day)}">
            <span class="pin-date">${esc(relDay(d) || fmtChip.format(d))}${p.date && p.lg && isEspn(lg) ? ` · ${fmtTime.format(new Date(p.date))}` : p.time ? ` · ${esc(p.time)}` : ''}</span>
            <span class="pin-teams">${esc(p.home)} – ${esc(p.away)}</span>
            <span class="pin-league">${esc(lg?.name || '')}</span>
          </button>
          <button type="button" class="pin-x" data-pin="${esc(p.key)}" aria-label="Nicht mehr merken">×</button>
        </div>`;
      }).join('')}</div>
    </div>`;
  }

  async function loadFavoriteScores({ silent = false } = {}) {
    const id = ++requestId;
    if (!silent) { skeleton(); showStatus(''); }
    const relevant = (lg) => [...favorites].some((k) => k.startsWith(`${lg.id}:`))
      || pins.some((p) => p.lg === lg.id && p.day === (lg.amateur || lg.hockey ? ymdOf(state.date) : espnDayFor(lg, state.date)));
    const targets = LEAGUES.filter((l) => isEspn(l) && relevant(l));
    const amateurLg = LEAGUES.filter((l) => l.amateur && relevant(l));
    const hockeyTargets = LEAGUES.filter((l) => l.hockey && relevant(l));
    if (!favorites.size && !pins.length) {
      el.content.innerHTML = `<div class="empty"><div class="empty-icon">★</div>Markiere Teams mit <b>★</b> oder merke dir einzelne Spiele mit <b>🔖</b> – sie erscheinen dann hier gesammelt aus allen Ligen.<br><button type="button" class="empty-btn" data-open-search>Team suchen</button></div>`;
      setUpdated();
      return;
    }
    try {
      const results = await Promise.all(targets.map(async (lg) => {
        const params = { dates: espnDayFor(lg, state.date) };
        if (lg.groups) params.groups = lg.groups;
        try { return { lg, data: await api('scoreboard', params, lg) }; }
        catch { return { lg, data: { events: [] } }; }
      }));
      const day = toISODate(state.date);
      const own = [];
      for (const lg of amateurLg) {
        for (const tk of lg.teams) {
          try {
            const data = await amateurData(tk);
            amateurGames(data).filter((m) => m.date === day).forEach((m) => {
              const mdl = amateurModel(m, lg, data.logos, true);
              if (isFav(mdl.home.favId, lg.id) || isFav(mdl.away.favId, lg.id) || isPinned(mdl.pin.key)) own.push(mdl);
            });
          } catch { /* einzelne Quelle fehlt */ }
        }
      }
      await Promise.all(hockeyTargets.map(async (lg) => {
        try {
          const data = await hockeyGames(lg, day);
          (data.games || []).filter((g) => g.date === day).forEach((g) => {
            const mdl = hockeyModel(g, lg, true);
            if (isFav(mdl.home.favId, lg.id) || isFav(mdl.away.favId, lg.id) || isPinned(mdl.pin.key)) own.push(mdl);
          });
        } catch { /* Hockeyweb nicht erreichbar */ }
      }));
      if (id !== requestId) return;
      const items = [];
      results.forEach(({ lg, data }) => {
        (data.events || []).forEach((ev) => {
          const favTeam = (ev.competitions?.[0]?.competitors || []).some((c) => isFav(c.team?.id, lg.id));
          if (favTeam || isPinned(`${lg.id}:${ev.id}`)) items.push({ ev, lg });
        });
      });
      let html = pinsStripHtml();
      if (!items.length && !own.length) html += '<div class="empty"><div class="empty-icon">📅</div>Keine Spiele deiner Favoriten an diesem Tag.</div>';
      else {
        if (items.length) html += gameListHtml(items, '', '', true);
        if (own.length) html += `<h2 class="group-title"><span>Amateur & Eishockey Europa</span></h2><div class="games">${own.map(matchCard).join('')}</div>`;
      }
      el.content.innerHTML = html;
      paintCards();
      setUpdated();
      clearTimeout(refreshTimer);
      const hasLive = items.some(({ ev }) => ev.status?.type?.state === 'in');
      if (hasLive) refreshTimer = setTimeout(() => { if (!document.hidden && state.leagueId === FAV_ID) loadFavoriteScores({ silent: true }); }, REFRESH_LIVE_MS);
    } catch (e) {
      if (id !== requestId) return;
      if (!silent) { el.content.innerHTML = ''; showStatus(`Spiele konnten nicht geladen werden: ${e.message}`, true); }
    }
  }

  // ---------- Tabelle ----------
  const COLUMNS = {
    soccer: [
      ['gamesPlayed', 'Sp'], ['wins', 'S'], ['ties', 'U'], ['losses', 'N'],
      ['__goals', 'Tore'], ['pointDifferential', 'Diff'], ['points', 'Pkt', true],
    ],
    hockey: [
      ['gamesPlayed', 'GP'], ['wins', 'W'], ['losses', 'L'], ['otLosses', 'OTL'],
      ['points', 'PTS', true], ['pointsFor', 'GF'], ['pointsAgainst', 'GA'], ['streak', 'Serie'],
    ],
    default: [
      ['wins', 'W'], ['losses', 'L'], ['ties', 'T'], ['winPercent', 'PCT', true],
      ['gamesBehind', 'GB'], ['pointsFor', 'PF'], ['pointsAgainst', 'PA'], ['streak', 'Serie'],
    ],
  };

  let lastStandings = null; // { data, rankings } – für Neurendern bei Conference-Wechsel ohne Reload

  async function loadStandings() {
    const id = ++requestId;
    clearTimeout(refreshTimer);
    skeleton(3); showStatus('');
    const wantsRankings = COLLEGE_IDS.has(state.leagueId);
    try {
      const [data, rankings] = await Promise.all([
        api('standings'),
        wantsRankings ? api('rankings').catch(() => null) : Promise.resolve(null),
      ]);
      if (id !== requestId) return;
      lastStandings = { data, rankings };
      renderStandings(data, rankings);
      setUpdated();
    } catch (e) {
      if (id !== requestId) return;
      el.content.innerHTML = '';
      showStatus(`Tabelle konnte nicht geladen werden: ${e.message}`, true);
    }
  }

  function starCell(teamId, lgId) {
    return `<button class="mc-star tbl-star${isFav(teamId, lgId) ? ' on' : ''}" data-fav="${esc(teamId)}" data-fav-league="${esc(lgId)}" aria-label="Favorit umschalten">★</button>`;
  }

  // AP Top 25 (NCAAF/NCAAM) als eigene Liste oben in der Tabelle
  function top25Html(rankings) {
    const poll = (rankings?.rankings || []).find((r) => r.name === 'AP Top 25') || rankings?.rankings?.[0];
    const ranks = poll?.ranks || [];
    if (!ranks.length) return '';
    const rows = ranks.map((r) => {
      const t = r.team || {};
      const logo = t.logos?.[0]?.href || t.logo;
      const name = t.displayName || [t.location, t.name].filter(Boolean).join(' ') || t.nickname || t.abbreviation || '';
      const trend = r.trend === '-' || !r.trend ? '' : /^\+/.test(r.trend) ? `<span class="rank-up">▲ ${esc(r.trend.slice(1))}</span>` : r.trend === 'NR' ? '' : `<span class="rank-down">▼ ${esc(r.trend.slice(1))}</span>`;
      return `<tr class="${isFav(t.id) ? 'fav' : ''}">
        <td>${esc(r.current)}</td>
        <td class="team-cell">${starCell(t.id, state.leagueId)}<span class="gc-link team-link" data-team-id="${esc(t.id)}">${logo ? window.LogoPref.img(t.id, logo) : ''}<span>${esc(name)}</span></span></td>
        <td>${esc(r.recordSummary || '')}</td>
        <td>${esc(r.points ?? '')}</td>
        <td>${trend}</td>
      </tr>`;
    }).join('');
    return `
      <div class="standings-group top25">
        <h2 class="group-title"><span>${esc(poll?.name || 'AP Top 25')}</span></h2>
        <div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Team</th><th>Bilanz</th><th>Punkte</th><th>Trend</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>`;
  }

  function collectGroups(node, out = []) {
    if (node?.standings?.entries?.length) out.push({ name: node.name, entries: node.standings.entries });
    (node?.children || []).forEach((c) => collectGroups(c, out));
    return out;
  }

  const stat = (entry, name) => entry.stats?.find((s) => s.name === name);
  const statVal = (entry, name) => stat(entry, name)?.value;

  function groupHtml(g, showTitle, sport, baseCols) {
    const entries = sortEntries(g.entries);
    const sample = entries[0];
    const cols = baseCols.filter(([key]) => {
      if (key === '__goals') return stat(sample, 'pointsFor') && stat(sample, 'pointsAgainst');
      if (!stat(sample, key)) return false;
      if (key === 'ties' && sport !== 'soccer') return entries.some((e) => statVal(e, 'ties') > 0);
      return true;
    });

    const notes = new Map();
    const rows = entries.map((e, i) => {
      const t = e.team || {};
      const logo = t.logos?.[0]?.href;
      const mark = e.note?.color ? `<span class="rank-mark" style="background:${esc(e.note.color)}"></span>` : '';
      if (e.note?.color && e.note.description) notes.set(e.note.color, e.note.description);
      const cells = cols.map(([key, , strong]) => {
        let v;
        if (key === '__goals') v = `${stat(e, 'pointsFor').displayValue}:${stat(e, 'pointsAgainst').displayValue}`;
        else v = stat(e, key)?.displayValue ?? '';
        return `<td class="${strong ? 'strong' : ''}">${esc(v)}</td>`;
      }).join('');
      return `<tr class="${isFav(t.id) ? 'fav' : ''}">
        <td>${mark}${i + 1}</td>
        <td class="team-cell">${starCell(t.id, state.leagueId)}<span class="gc-link team-link" data-team-id="${esc(t.id)}">${logo ? window.LogoPref.img(t.id, logo) : ''}<span>${esc(sport === 'soccer' ? t.shortDisplayName || t.displayName : t.displayName)}</span></span></td>
        ${cells}
      </tr>`;
    }).join('');

    const legend = notes.size
      ? `<div class="legend">${[...notes].map(([c, d]) => `<span><span class="rank-mark" style="background:${esc(c)}"></span>${esc(d)}</span>`).join('')}</div>`
      : '';

    return `
      <div class="standings-group">
        ${showTitle ? `<h2 class="group-title"><span>${esc(g.name)}</span></h2>` : ''}
        <div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Team</th>${cols.map(([, label]) => `<th>${esc(label)}</th>`).join('')}</tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        ${legend}
      </div>`;
  }

  function renderStandings(data, rankings) {
    const groups = collectGroups(data);
    const top25 = rankings ? top25Html(rankings) : '';
    const isCollege = COLLEGE_IDS.has(state.leagueId);

    if (!groups.length) {
      el.content.innerHTML = top25 || '<div class="empty">Für diese Liga ist aktuell keine Tabelle verfügbar.</div>';
      return;
    }
    const sport = currentLeague().sport;
    const baseCols = COLUMNS[sport] || COLUMNS.default;

    if (isCollege) {
      const hasTop25 = !!top25;
      const valid = (v) => v === 'top25' ? hasTop25 : groups.some((g) => g.name === v);
      const selected = valid(state.standingsConf) ? state.standingsConf : (hasTop25 ? 'top25' : groups[0]?.name);
      state.standingsConf = selected;
      const options = [
        hasTop25 ? `<option value="top25"${selected === 'top25' ? ' selected' : ''}>Top 25</option>` : '',
        ...groups.map((g) => `<option value="${esc(g.name)}"${selected === g.name ? ' selected' : ''}>${esc(g.name)}</option>`),
      ].join('');
      const picker = `<div class="conf-picker"><select id="confSelect" aria-label="Conference wählen">${options}</select></div>`;
      const body = selected === 'top25' ? top25 : groupHtml(groups.find((g) => g.name === selected), true, sport, baseCols);
      el.content.innerHTML = picker + body;
      return;
    }
    el.content.innerHTML = top25 + groups.map((g) => groupHtml(g, groups.length > 1, sport, baseCols)).join('');
  }

  function sortEntries(entries) {
    const list = entries.slice();
    const has = (n) => list.every((e) => statVal(e, n) != null);
    if (has('rank') && list.some((e) => statVal(e, 'rank') > 0)) return list.sort((a, b) => statVal(a, 'rank') - statVal(b, 'rank'));
    if (has('playoffSeed') && list.some((e) => statVal(e, 'playoffSeed') > 0)) return list.sort((a, b) => statVal(a, 'playoffSeed') - statVal(b, 'playoffSeed'));
    if (has('points') && currentLeague().sport === 'hockey') return list.sort((a, b) => statVal(b, 'points') - statVal(a, 'points'));
    if (has('winPercent')) return list.sort((a, b) => statVal(b, 'winPercent') - statVal(a, 'winPercent'));
    return list;
  }

  // ---------- News ----------
  async function loadNews() {
    const id = ++requestId;
    clearTimeout(refreshTimer);
    skeleton(6); showStatus('');
    try {
      const data = await api('news', { limit: '30' });
      if (id !== requestId) return;
      renderNews(data);
      setUpdated();
    } catch (e) {
      if (id !== requestId) return;
      el.content.innerHTML = '';
      showStatus(`News konnten nicht geladen werden: ${e.message}`, true);
    }
  }

  // News: Artikel öffnen im Lesemodus der App (nicht espn.com / ESPN-App); Überschriften auf Knopfdruck deutsch
  let newsList = [];
  const newsTr = { state: 'en', de: null, err: '' };
  function renderNews(data) {
    if (data) { newsList = (data.articles || []).filter((a) => a.headline && a.id); newsTr.state = 'en'; newsTr.de = null; }
    if (!newsList.length) {
      el.content.innerHTML = '<div class="empty">Keine News verfügbar.</div>';
      return;
    }
    const de = newsTr.state === 'de' && newsTr.de;
    el.content.innerHTML = `<div class="tr-bar news-tr">${window.Translate.button(newsTr.state, newsTr.err).replace('data-tr="toggle"', 'data-tr="news"').replace('Auf Deutsch übersetzen', 'Überschriften auf Deutsch')}</div>
      <div class="news">${newsList.map((a, i) => {
      const img = a.images?.find((x) => x.url)?.url;
      const head = de ? de[i * 2] : a.headline;
      const d = de ? de[i * 2 + 1] : a.description;
      const desc = d && d !== head ? `<p>${esc(d)}</p>` : '';
      const time = a.published ? `<time datetime="${esc(a.published)}">${fmtNews.format(new Date(a.published))} Uhr${a.type === 'Media' ? ' · ▶ Video' : ''}</time>` : '';
      return `<button type="button" class="article${i === 0 ? ' lead' : ''}" data-article="${i}">
        ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ''}
        <div class="article-body">${time}<h3>${esc(head)}</h3>${desc}</div>
      </button>`;
    }).join('')}</div>`;
  }
  async function toggleNewsTranslation() {
    if (newsTr.state === 'loading') return;
    if (newsTr.state === 'de') { newsTr.state = 'en'; renderNews(); return; }
    if (newsTr.de) { newsTr.state = 'de'; renderNews(); return; }
    const list = newsList;
    newsTr.state = 'loading'; renderNews();
    try {
      newsTr.de = await window.Translate.translate(list.flatMap((a) => [a.headline, a.description || '']), `newslist:${state.leagueId}:${list.map((a) => a.id).join(',')}`);
      newsTr.state = 'de';
    } catch (e) { newsTr.state = 'error'; newsTr.err = e.message; }
    if (list === newsList && state.tab === 'news') renderNews();
  }

  // ---------- Kreisliga (Fussball.de über /api/amateur) ----------
  // Fussball.de verschleiert Torstände bewusst – gespielte Spiele erscheinen daher ohne
  // Ergebnis, mit Link zum Spielbericht auf Fussball.de.
  const AMATEUR_TTL_MS = 5 * 60_000;
  const amateurCache = new Map(); // teamKey → { t, data }

  async function amateurData(teamKey) {
    const hit = amateurCache.get(teamKey);
    if (hit && Date.now() - hit.t < AMATEUR_TTL_MS) return hit.data;
    const res = await fetch(`/api/amateur?${new URLSearchParams({ team: teamKey })}`);
    if (!res.ok) {
      let msg = `Fehler ${res.status}`;
      try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
      throw new Error(msg);
    }
    const data = await res.json();
    amateurCache.set(teamKey, { t: Date.now(), data });
    return data;
  }

  const kreisTeams = (lg) => (state.kreisTeam === 'all' ? lg.teams : [state.kreisTeam]);
  const parseYMD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };

  // Vereinslogo vom Fussball.de-Logodienst (Hotlink; nur diese Quelle ist erlaubt)
  const amLogoOk = (url) => !!url && String(url).startsWith('https://www.fussball.de/export.media/');
  const amLogo = (url) => (amLogoOk(url) ? `<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '');

  // Team-ID für Favoriten: Mannschaftsname in Kurzform (Fussball.de liefert keine IDs im HTML)
  const amTeamId = (name) => String(name).toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, '');

  async function amateurGameDays(lg) {
    const all = await Promise.all(kreisTeams(lg).map((t) => amateurData(t).catch(() => null)));
    return [...new Set(all.filter(Boolean).flatMap((d) => [...(d.upcoming || []), ...(d.past || [])].map((m) => m.date)))].sort();
  }

  async function snapAmateur(lg) {
    try {
      const days = await amateurGameDays(lg);
      const today = toISODate(todayAnchor());
      const target = days.find((d) => d >= today) || days[days.length - 1];
      if (target && currentLeague()?.id === lg.id) state.date = parseYMD(target);
    } catch { /* Fehler zeigt loadAmateur an */ }
  }

  const amateurGameCache = new Map(); // "liga:spielId" → { Spiel, Logos } (für das Detail-Popup)

  function amateurModel(m, lg, logos = {}, showLeague = false) {
    const own = m.venue === 'H' ? m.home : m.venue === 'A' ? m.away : null;
    const side = (name) => ({
      name, favId: amTeamId(name),
      logoHtml: amLogo(logos[name]), logoUrl: amLogoOk(logos[name]) ? logos[name] : '',
      score: null, sub: name === own ? 'SGM' : '',
    });
    const key = `${lg.id}:${m.matchNo || amTeamId(`${m.date}-${m.home}-${m.away}`)}`;
    // Klick auf die Karte öffnet das Popup (nur mit Spielseite auf Fussball.de)
    const eventId = m.url ? (m.matchNo || amTeamId(`${m.date}-${m.home}-${m.away}`)) : null;
    if (eventId) amateurGameCache.set(`${lg.id}:${eventId}`, { m, logos });
    return {
      lgId: lg.id, eventId, state: m.played ? 'post' : 'pre',
      mid: m.played ? '✓' : (m.time || 'offen'),
      statusHtml: m.played ? '<span class="mc-final">Beendet</span>' : `<span>${m.time ? 'Uhr' : 'Zeit offen'}</span>`,
      note: [m.note, own ? (m.venue === 'H' ? 'Heimspiel' : 'Auswärtsspiel') : ''].filter(Boolean).join(' · '),
      home: side(m.home), away: side(m.away),
      own: !!own,
      meta: m.competition || '',
      link: m.url, linkLabel: m.played ? 'Ergebnis' : 'Fussball.de',
      showLeague,
      pin: { key, lg: lg.id, day: m.date.replace(/-/g, ''), time: m.time || '', home: m.home, away: m.away },
    };
  }

  async function loadAmateur({ silent = false } = {}) {
    const id = ++requestId;
    clearTimeout(refreshTimer);
    if (!silent) { skeleton(state.tab === 'standings' ? 3 : 6); showStatus(''); }
    const lg = currentLeague();
    try {
      const keys = kreisTeams(lg);
      const datas = await Promise.all(keys.map((k) => amateurData(k)));
      if (id !== requestId) return;
      const picker = `<div class="seg" role="group" aria-label="Mannschaft">${[['all', 'Beide'], ...lg.teams.map((k) => [k, AMATEUR_LABEL[k] || k])]
        .map(([v, l]) => `<button type="button" class="seg-btn${state.kreisTeam === v ? ' active' : ''}" data-kreis="${v}">${esc(l)}</button>`).join('')}</div>`;
      const body = datas.map((data, i) => (state.tab === 'standings' ? amateurTableHtml(data, lg) : amateurDayHtml(data, lg, keys[i]))).join('');
      const anyGames = state.tab !== 'scores' || /class="mc/.test(body);
      el.content.innerHTML = picker + (anyGames ? body : '<div class="empty"><div class="empty-icon">📅</div>Keine Ligaspiele an diesem Tag.</div>')
        + (state.tab === 'scores' && /mc-final/.test(body) ? '<div class="empty small">Torstände zeigt Fussball.de nur verschleiert an – das Ergebnis steht im Spielbericht (Link „Ergebnis ↗“).</div>' : '');
      paintCards();
      flashHighlight();
      setUpdated();
    } catch (e) {
      if (id !== requestId) return;
      el.content.innerHTML = '';
      showStatus(`Daten von Fussball.de konnten nicht geladen werden: ${e.message}`, true);
    }
  }

  function amateurHead(data, key) {
    const warn = (data.errors || []).length ? `<div class="empty small">Teilweise nicht verfügbar: ${esc(data.errors.join(' · '))}</div>` : '';
    return `<h2 class="group-title"><span>${esc(AMATEUR_LABEL[key] || data.team.name)} · ${esc(data.team.league)}</span><a class="group-link" href="${esc(data.team.url)}" target="_blank" rel="noopener">Fussball.de ↗</a></h2>${warn}`;
  }

  function amateurTableHtml(data, lg) {
    const key = data.team.key;
    if (!data.table.length) return amateurHead(data, key) + '<div class="empty">Keine Tabelle verfügbar.</div>';
    const rows = data.table.map((r) => {
      const rankCls = r.rank === 1 ? ' class="rank-1"' : r.rank === 2 ? ' class="rank-2"' : '';
      const tid = amTeamId(r.team);
      return `<tr class="${r.own || isFav(tid, lg.id) ? 'fav' : ''}" data-hl="${esc(tid)}">
        <td${rankCls}>${esc(r.rank)}.</td>
        <td class="team-cell">${starCell(tid, lg.id)}<span class="team-link">${amLogo(r.logo)}<span>${esc(r.team).replace(/\//g, '/&#8203;')}</span></span></td>
        <td>${esc(r.played)}</td><td>${esc(r.won)}</td><td>${esc(r.drawn)}</td><td>${esc(r.lost)}</td>
        <td>${esc(r.gf)}:${esc(r.ga)}</td><td>${esc(r.diff > 0 ? `+${r.diff}` : r.diff)}</td>
        <td class="strong">${esc(r.points)}</td>
      </tr>`;
    }).join('');
    return `${amateurHead(data, key)}<div class="standings-group"><div class="table-wrap"><table>
        <thead><tr><th>#</th><th>Team</th><th>Sp</th><th>S</th><th>U</th><th>N</th><th>Tore</th><th>Diff</th><th>Pkt</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div></div>`;
  }

  const amateurGames = (data) => [...(data.upcoming || []), ...(data.past || [])];
  const byTime = (a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`);

  function amateurDayHtml(data, lg, key) {
    const day = toISODate(state.date);
    const games = amateurGames(data).filter((m) => m.date === day).sort(byTime);
    if (!games.length) return '';
    const rank = (m) => (isFav(amTeamId(m.home), lg.id) || isFav(amTeamId(m.away), lg.id) ? 0 : m.venue ? 1 : 2);
    games.sort((a, b) => rank(a) - rank(b));
    return `${amateurHead(data, key)}<div class="games">${games.map((m) => matchCard(amateurModel(m, lg, data.logos))).join('')}</div>`;
  }

  // ---------- Eishockey (Hockeyweb.de über /api/hockey) ----------
  const HOCKEY_TTL_MS = 20_000;
  const hockeyCache = new Map();

  async function hockeyFetch(params) {
    const qs = new URLSearchParams(params).toString();
    const hit = hockeyCache.get(qs);
    if (hit && Date.now() - hit.t < HOCKEY_TTL_MS) return hit.data;
    const res = await fetch(`/api/hockey?${qs}`);
    if (!res.ok) {
      let msg = `Fehler ${res.status}`;
      try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
      throw new Error(msg);
    }
    const data = await res.json();
    hockeyCache.set(qs, { t: Date.now(), data });
    return data;
  }
  // gewählte Runde je Liga (Hauptrunde, Playoffs …); leer = Hauptrunde
  const hockeyRound = {};
  let hockeyView = 'all'; // Tabelle: all | home | away
  const withRound = (lg, p) => (hockeyRound[lg.id] ? { ...p, round: hockeyRound[lg.id] } : p);
  const hockeyGames = (lg, ymd) => hockeyFetch(withRound(lg, { league: lg.hockey, type: 'games', date: ymd }));
  const hockeyStandings = (lg) => hockeyFetch(withRound(lg, { league: lg.hockey, type: 'standings' }));
  const hockeyNews = (lg) => hockeyFetch({ league: lg.hockey, type: 'news' });
  const hockeyGameCache = new Map(); // "liga:spielId" → Spiel (für das Detail-Popup)

  const hwLogoOk = (url) => !!url && String(url).startsWith('https://media.hockeyweb.de/');
  const hwLogo = (url) => (hwLogoOk(url) ? `<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '');

  async function loadHockey({ silent = false } = {}) {
    const id = ++requestId;
    clearTimeout(refreshTimer);
    if (!silent) { skeleton(state.tab === 'standings' ? 3 : 6); showStatus(''); }
    const lg = currentLeague();
    try {
      if (state.tab === 'news') {
        const data = await hockeyNews(lg);
        if (id !== requestId) return;
        el.content.innerHTML = hockeyNewsHtml(data);
      } else if (state.tab === 'standings') {
        const data = await hockeyStandings(lg);
        if (id !== requestId) return;
        el.content.innerHTML = hockeyTableHtml(lg, data);
        flashHighlight();
      } else {
        const data = await hockeyGames(lg, toISODate(state.date));
        if (id !== requestId) return;
        el.content.innerHTML = hockeyDayHtml(lg, data);
        paintCards();
        scheduleHockeyRefresh(data);
      }
      setUpdated();
    } catch (e) {
      if (id !== requestId) return;
      el.content.innerHTML = '';
      showStatus(`Daten von Hockeyweb konnten nicht geladen werden: ${e.message}`, true);
    }
  }

  function scheduleHockeyRefresh(data) {
    clearTimeout(refreshTimer);
    if (state.tab !== 'scores' || state.leagueId === FAV_ID) return;
    const today = toISODate(todayAnchor());
    if (toISODate(state.date) !== today) return;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const running = (data.games || []).some((g) => {
      if (g.live) return true; // App-API meldet laufende Spiele direkt
      if (data.source === 'app') return false;
      if (g.date !== today || g.played || !g.time) return false;
      const [h, m] = g.time.split(':').map(Number);
      const diff = nowMin - (h * 60 + m);
      return diff >= 0 && diff <= 240;
    });
    if (!running) return;
    refreshTimer = setTimeout(() => {
      if (!document.hidden) loadHockey({ silent: true });
      else scheduleHockeyRefresh(data);
    }, data.source === 'app' ? 30_000 : 60_000);
  }

  function hockeyModel(g, lg, showLeague = false) {
    const side = (t, dim) => ({
      name: t.name, favId: amTeamId(t.name),
      logoHtml: hwLogo(t.logo), logoUrl: hwLogoOk(t.logo) ? t.logo : '',
      color: t.color, alt: t.alt,
      score: g.played || g.live ? t.score : null, dim,
    });
    const key = `${lg.id}:${amTeamId(`${g.date}-${g.home.name}-${g.away.name}`)}`;
    const detail = g.id && g.home.id && g.away.id;
    if (detail) hockeyGameCache.set(`${lg.id}:${g.id}`, g);
    return {
      eventId: detail ? g.id : undefined,
      lgId: lg.id, state: g.played ? 'post' : g.live ? 'in' : 'pre',
      mid: g.time || 'offen',
      statusHtml: g.played ? `<span class="mc-final">${g.ot === 'PSO' ? 'Ende n.P.' : g.ot === 'OT' ? 'Ende n.V.' : 'Ende'}</span>` : g.live ? `<span class="live-badge">${esc(g.status || 'Live')}</span>` : `<span>${g.time ? 'Uhr' : 'Zeit offen'}</span>`,
      home: side(g.home, g.played && g.home.score < g.away.score),
      away: side(g.away, g.played && g.away.score < g.home.score),
      extra: (g.played || g.live) && g.periods?.length ? `<span><em>Drittel</em> ${g.periods.map(([a, b]) => `${esc(a)}:${esc(b)}`).join(' · ')}</span>` : '',
      link: g.url, linkLabel: g.played ? 'Spielbericht' : 'Hockeyweb',
      showLeague,
      pin: { key, lg: lg.id, day: g.date.replace(/-/g, ''), time: g.time || '', home: g.home.name, away: g.away.name },
    };
  }

  // Rundenwahl (Hauptrunde, Playoffs …) – nur, wenn die Liga mehrere Runden hat
  function hockeyRoundChips(lg, data, onlyTables) {
    const rounds = (data.rounds || []).filter((r) => !onlyTables || r.type === 'table');
    if (rounds.length < 2) return '';
    return `<div class="hk-chips" role="group" aria-label="Runde">${rounds.map((r) => `<button type="button" class="hk-chip${r.id === data.round ? ' active' : ''}" data-hround="${esc(r.id)}">${esc(r.name.replace(new RegExp(`^${lg.name}\\s*`, 'i'), '') || r.name)}</button>`).join('')}</div>`;
  }

  function hockeyNewsHtml(data) {
    const items = data.news || [];
    if (!items.length) return '<div class="empty"><div class="empty-icon">📰</div>Keine News verfügbar.</div>';
    const fmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `<div class="news">${items.map((n, i) => `
      <a class="article${i === 0 ? ' lead' : ''}" href="${esc(n.link || '#')}" target="_blank" rel="noopener">
        ${n.image ? `<img src="${esc(n.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
        <div class="article-body">${n.published ? `<time datetime="${esc(n.published)}">${esc(fmt.format(new Date(n.published)))} Uhr${n.category ? ` · ${esc(n.category)}` : ''}</time>` : ''}<h3>${esc(n.title)}</h3>${n.subTitle ? `<p><b>${esc(n.subTitle)}</b></p>` : ''}${n.description ? `<p>${esc(n.description)}</p>` : ''}</div>
      </a>`).join('')}</div>`;
  }

  function hockeyDayHtml(lg, data) {
    const day = toISODate(state.date);
    const chips = hockeyRoundChips(lg, data, false);
    const warn = (data.errors || []).length ? `<div class="empty small">Teilweise nicht verfügbar: ${esc(data.errors.join(' · '))}</div>` : '';
    const games = (data.games || []).filter((g) => g.date === day).sort(byTime);
    if (!games.length) return `${chips}${warn}<div class="empty"><div class="empty-icon">📅</div>Keine Spiele an diesem Tag.</div>`;
    const rank = (g) => (isFav(amTeamId(g.home.name), lg.id) || isFav(amTeamId(g.away.name), lg.id) ? 0 : 1);
    games.sort((a, b) => rank(a) - rank(b));
    return `${chips}${warn}<h2 class="group-title"><span>${esc(fmtDayFor(state.date))}</span><a class="group-link" href="${esc(data.league.url)}" target="_blank" rel="noopener">Hockeyweb ↗</a></h2><div class="games">${games.map((g) => matchCard(hockeyModel(g, lg))).join('')}</div>`;
  }

  const HOCKEY_MARKS = {
    del: [[1, 6, '#3ddc84', 'Direkt in die Playoffs'], [7, 10, '#f5b942', 'Pre-Playoffs'], [14, 14, '#ff6b6b', 'Playdowns gegen den DEL2-Meister']],
    del2: [[1, 6, '#3ddc84', 'Direkt in die Playoffs'], [7, 10, '#f5b942', 'Pre-Playoffs'], [11, 14, '#ff6b6b', 'Playdowns']],
  };

  function hockeyTableHtml(lg, data) {
    const view = data.groups.some((g) => g.table.some((r) => r.home && r.away)) ? hockeyView : 'all';
    const marks = view === 'all' ? HOCKEY_MARKS[lg.hockey] || [] : [];
    const toggle = data.groups.some((g) => g.table.some((r) => r.home && r.away))
      ? `<div class="hk-chips" role="group" aria-label="Ansicht">${[['all', 'Gesamt'], ['home', 'Heim'], ['away', 'Auswärts']].map(([v, l]) => `<button type="button" class="hk-chip${v === view ? ' active' : ''}" data-hview="${v}">${l}</button>`).join('')}</div>` : '';
    return hockeyRoundChips(lg, data, true) + toggle + data.groups.map((g, i) => {
      const used = new Map();
      let list = g.table;
      if (view !== 'all') {
        list = g.table.filter((r) => r[view]).map((r) => ({ ...r, ...r[view] }))
          .sort((a, b) => b.points - a.points || b.won - a.won || a.team.localeCompare(b.team));
        list.forEach((r, n) => { r.rank = n + 1; });
      }
      const rows = list.map((r) => {
        const mk = marks.find(([from, to]) => r.rank >= from && r.rank <= to);
        if (mk) used.set(mk[2], mk[3]);
        const tid = amTeamId(r.team);
        return `<tr class="${isFav(tid, lg.id) ? 'fav' : ''}" data-hl="${esc(tid)}">
          <td>${mk ? `<span class="rank-mark" style="background:${mk[2]}"></span>` : ''}${esc(r.rank)}</td>
          <td class="team-cell">${starCell(tid, lg.id)}<span class="team-link">${hwLogo(r.logo)}<span>${esc(r.team)}</span></span></td>
          <td>${esc(r.played)}</td><td>${esc(r.won)}</td><td>${esc(r.otw)}</td><td>${esc(r.otl)}</td><td>${esc(r.lost)}</td>
          ${view === 'all' ? `<td>${esc(r.gf)}:${esc(r.ga)}</td><td>${esc(r.diff > 0 ? `+${r.diff}` : r.diff)}</td>` : ''}
          <td class="strong">${esc(r.points)}</td>
        </tr>`;
      }).join('');
      const legend = [...used].map(([c, d]) => `<span><span class="rank-mark" style="background:${c}"></span>${esc(d)}</span>`).join('')
        + '<span>OTS/OTN: Overtime-Siege/-Niederlagen</span>';
      const title = g.name && !lg.name.endsWith(g.name) ? `${lg.name} · ${g.name}` : lg.name;
      return `
        <div class="standings-group">
          <h2 class="group-title"><span>${esc(title)}</span>${i === 0 ? `<a class="group-link" href="${esc(data.league.url)}" target="_blank" rel="noopener">Hockeyweb ↗</a>` : ''}</h2>
          <div class="table-wrap"><table>
            <thead><tr><th>#</th><th>Team</th><th>Sp</th><th>S</th><th>OTS</th><th>OTN</th><th>N</th>${view === 'all' ? '<th>Tore</th><th>Diff</th>' : ''}<th>Pkt</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>
          <div class="legend">${legend}</div>
        </div>`;
    }).join('');
  }

  async function hockeyStep(lg, fromYmd, delta) {
    const data = await hockeyGames(lg, fromYmd);
    const days = data.days || [];
    const near = delta > 0 ? days.find((d) => d > fromYmd) : [...days].reverse().find((d) => d < fromYmd);
    if (near) return near;
    const cal = data.calendar || [];
    const wk = delta > 0 ? cal.find((w) => w.from > fromYmd) : [...cal].reverse().find((w) => w.to < fromYmd);
    if (!wk) return null;
    const probe = delta > 0 ? wk.from : wk.to;
    const inWeek = ((await hockeyGames(lg, probe)).days || []).filter((d) => d >= wk.from && d <= wk.to);
    return (delta > 0 ? inWeek[0] : inWeek[inWeek.length - 1]) || probe;
  }

  async function snapHockey(lg) {
    try {
      const today = toISODate(todayAnchor());
      const data = await hockeyGames(lg, today);
      const day = (data.days || []).includes(today) ? today
        : (await hockeyStep(lg, today, 1)) || (await hockeyStep(lg, today, -1));
      if (day && currentLeague()?.id === lg.id) state.date = parseYMD(day);
    } catch { /* Fehler zeigt loadHockey an */ }
  }

  // Nach einer Suche: Teamzeile in der Tabelle kurz hervorheben und hinscrollen
  function flashHighlight() {
    if (!state.highlight) return;
    const row = el.content.querySelector(`[data-hl="${CSS.escape(state.highlight)}"]`);
    state.highlight = null;
    if (!row) return;
    row.classList.add('hl');
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(() => row.classList.remove('hl'), 2600);
  }

  // ---------- Live-Ansicht je Sportart ----------
  // Alle laufenden Spiele der Sportart (ESPN-Ligen + Hockeyweb), gruppiert nach Liga (Reihenfolge
  // wie in der Ligaleiste), innerhalb der Liga nach Anstoß/Beginn sortiert. Aktualisiert alle 30 s.
  async function loadLive({ silent = false } = {}) {
    const id = ++requestId;
    clearTimeout(refreshTimer);
    if (!silent) { skeleton(4); showStatus(''); }
    const cat = currentLeague().cat;
    const known = Object.keys(liveCounts).length > 0;
    const espn = LEAGUES.filter((l) => l.cat === cat && isEspn(l) && (!known || +liveCounts[l.id] > 0));
    const hock = LEAGUES.filter((l) => l.cat === cat && l.hockey);
    const groups = [];
    await Promise.all([
      ...espn.map(async (lg) => {
        try {
          const params = { dates: ymdInTZ(defaultAnchor(lg), leagueTZ(lg)) };
          if (lg.groups) params.groups = lg.groups;
          const data = await api('scoreboard', params, lg);
          const evs = (data.events || []).filter((e) => e.status?.type?.state === 'in').sort((a, b) => new Date(a.date) - new Date(b.date));
          liveCounts[lg.id] = evs.length;
          if (evs.length) groups.push({ lg, cards: evs.map((ev) => matchCard(espnModel(ev, lg))) });
        } catch { /* Liga nicht erreichbar */ }
      }),
      ...hock.map(async (lg) => {
        try {
          const data = await hockeyGames(lg, toISODate(todayAnchor()));
          const games = (data.games || []).filter((g) => g.live).sort(byTime);
          if (games.length) groups.push({ lg, cards: games.map((g) => matchCard(hockeyModel(g, lg))) });
        } catch { /* Hockeyweb nicht erreichbar */ }
      }),
    ]);
    if (id !== requestId) return;
    groups.sort((a, b) => LEAGUES.indexOf(a.lg) - LEAGUES.indexOf(b.lg));
    el.content.innerHTML = groups.length
      ? groups.map((g) => `<h2 class="group-title"><span class="live-group">${leagueBadge(g.lg)}${esc(g.lg.name)}</span><span class="group-count"><b class="live-text">${g.cards.length} live</b></span></h2><div class="games">${g.cards.join('')}</div>`).join('')
      : '<div class="empty"><div class="empty-icon">📺</div>Gerade läuft in dieser Sportart kein Spiel.</div>';
    paintCards();
    setUpdated();
    renderSports();
    renderLeaguebar();
    refreshTimer = setTimeout(() => { if (!document.hidden && currentLeague().isLive) loadLive({ silent: true }); }, REFRESH_LIVE_MS);
  }

  // ---------- Steuerung ----------
  function load() {
    renderTabs();
    renderDate();
    const lg = currentLeague();
    if (lg.isFav) { loadFavoriteScores(); return; }
    if (lg.isLive) { loadLive(); return; }
    if (lg.hockey) { loadHockey(); return; }
    if (lg.amateur) { loadAmateur(); return; }
    if (state.tab === 'scores') loadScores();
    else if (state.tab === 'standings') loadStandings();
    else loadNews();
  }

  function reloadSilently() {
    const lg = currentLeague();
    if (lg.isFav) loadFavoriteScores({ silent: true });
    else if (lg.isLive) loadLive({ silent: true });
    else if (lg.hockey) loadHockey({ silent: true });
    else if (lg.amateur) loadAmateur({ silent: true });
    else if (state.tab === 'scores') loadScores({ silent: true });
    else if (state.tab === 'standings' && lastStandings) renderStandings(lastStandings.data, lastStandings.rankings);
  }

  async function shiftDay(delta) {
    const lg = currentLeague();
    const plain = new Date(state.date);
    plain.setDate(plain.getDate() + delta);

    if (lg.hockey) {
      try {
        const target = await hockeyStep(lg, toISODate(state.date), delta);
        if (currentLeague()?.id !== lg.id) return;
        if (target) state.date = parseYMD(target);
      } catch { /* load() zeigt den Fehler */ }
      load();
      return;
    }

    if (lg.amateur) {
      try {
        const days = await amateurGameDays(lg);
        const cur = toISODate(state.date);
        const target = delta > 0 ? days.find((d) => d > cur) : [...days].reverse().find((d) => d < cur);
        if (currentLeague()?.id !== lg.id) return;
        if (target) state.date = parseYMD(target);
      } catch { /* load() zeigt den Fehler */ }
      load();
      return;
    }

    if (!lg.isFav) {
      let d = new Date(plain);
      let found = false;
      for (let i = 0; i < 60; i++) {
        const days = await gameDaySet(lg, d);
        if (!days || !days.size) { found = true; break; }
        if (days.has(ymdInTZ(d, leagueTZ(lg)))) { found = true; break; }
        d.setDate(d.getDate() + delta);
      }
      if (currentLeague()?.id !== lg.id) return;
      state.date = found ? d : plain;
      load();
      return;
    }
    state.date = plain;
    load();
  }

  function selectLeague(id, { tab, date } = {}) {
    const lg = leagueById(id);
    if (!lg) return;
    const changed = id !== state.leagueId;
    state.leagueId = id;
    if (tab) state.tab = tab;
    if (lg.isFav || lg.isLive) state.tab = 'scores';
    if (noNewsTab(lg) && state.tab === 'news') state.tab = 'scores';
    if (changed) { state.standingsConf = null; lastStandings = null; }
    if (lg.cat !== 'fav' && !lg.isLive) { lastLeague[lg.cat] = id; writeJSON(LS_LAST, lastLeague); }
    persist();
    renderChrome();
    if (date) { state.date = date; load(); return; }
    if (!changed && !tab) { load(); return; }
    state.date = defaultAnchor(lg);
    if (lg.hockey || lg.amateur) {
      renderTabs(); renderDate(); skeleton(); showStatus('');
      (lg.hockey ? snapHockey(lg) : snapAmateur(lg)).then(() => { if (currentLeague()?.id === lg.id) load(); });
      return;
    }
    load();
    // Direkt mit "heute" laden; sobald bekannt ist, ob heute ein Spieltag ist, ggf. vorspulen.
    snapToGameDay(lg).then(() => {
      if (currentLeague()?.id !== lg.id) return;
      renderDate();
      if (state.tab === 'scores' && ymdOf(state.date) !== ymdOf(defaultAnchor(currentLeague()))) load();
    });
  }

  el.sports.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sport]');
    if (!b) return;
    const cat = b.dataset.sport;
    if (cat === currentLeague().cat) return;
    const target = cat === 'fav' ? FAV_ID : (leagueById(lastLeague[cat])?.cat === cat ? lastLeague[cat] : DEFAULT_LEAGUE[cat]);
    selectLeague(target);
  });
  el.leaguebar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-league]');
    if (!b || b.dataset.league === state.leagueId) return;
    selectLeague(b.dataset.league);
  });

  el.tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn || btn.dataset.tab === state.tab) return;
    state.tab = btn.dataset.tab;
    persist();
    load();
  });

  el.prevDay.addEventListener('click', () => shiftDay(-1));
  el.nextDay.addEventListener('click', () => shiftDay(1));
  el.todayBtn.addEventListener('click', () => {
    const lg = currentLeague();
    state.date = defaultAnchor(lg);
    if (lg.hockey) { skeleton(); snapHockey(lg).then(load); return; }
    if (lg.amateur) { skeleton(); snapAmateur(lg).then(load); return; }
    load();
  });
  el.dateInput.addEventListener('change', () => {
    if (!el.dateInput.value) return;
    const [y, m, d] = el.dateInput.value.split('-').map(Number);
    state.date = new Date(y, m - 1, d, 12);
    load();
  });
  el.top25Only.checked = state.top25Only;
  el.top25Only.addEventListener('change', () => {
    state.top25Only = el.top25Only.checked;
    persist();
    loadScores();
  });

  // Auto-Reload: aktualisiert alle 30 s nur die Ergebnisse (ohne die Seite neu zu laden) (z. B. für einen dauerhaft angezeigten Bildschirm)
  let autoReloadTimer = null;
  function setAutoReload(on) {
    clearInterval(autoReloadTimer);
    autoReloadTimer = on ? setInterval(() => { if (!document.hidden && !document.querySelector('dialog[open]')) reloadSilently(); }, 30_000) : null;
  }
  el.autoReload.checked = state.autoReload;
  setAutoReload(state.autoReload);
  el.autoReload.addEventListener('change', () => {
    state.autoReload = el.autoReload.checked;
    persist();
    setAutoReload(state.autoReload);
  });

  // Klicks im Inhalt (Event-Delegation)
  el.content.addEventListener('click', (e) => {
    const star = e.target.closest('[data-fav]');
    if (star) {
      e.stopPropagation();
      toggleFav(star.dataset.fav, star.dataset.favLeague || state.leagueId);
      if (state.leagueId === FAV_ID) renderLeaguebar();
      reloadSilently();
      return;
    }
    const pin = e.target.closest('[data-pin]');
    if (pin) {
      e.stopPropagation();
      togglePin(pin.dataset.pin);
      renderSports();
      if (state.leagueId === FAV_ID) { renderLeaguebar(); loadFavoriteScores({ silent: true }); }
      else {
        const on = isPinned(pin.dataset.pin);
        pin.classList.toggle('on', on);
        pin.closest('.mc')?.classList.toggle('pinned', on);
        pin.setAttribute('aria-pressed', on);
        pin.title = on ? 'Nicht mehr merken' : 'Spiel merken';
      }
      return;
    }
    const hr = e.target.closest('[data-hround]');
    if (hr) { const lgH = currentLeague(); hockeyRound[lgH.id] = Number(hr.dataset.hround); snapHockey(lgH).then(() => { renderDate(); load(); }); return; }
    const hv = e.target.closest('[data-hview]');
    if (hv) { hockeyView = hv.dataset.hview; load(); return; }
    const go = e.target.closest('[data-goto-day]');
    if (go) { state.date = ymdToDate(go.dataset.gotoDay); load(); return; }
    const kreis = e.target.closest('[data-kreis]');
    if (kreis) { state.kreisTeam = kreis.dataset.kreis; persist(); loadAmateur(); return; }
    if (e.target.closest('[data-open-search]')) { openSearch(); return; }
    if (e.target.closest('[data-tr="news"]')) { toggleNewsTranslation(); return; }
    const art = e.target.closest('[data-article]');
    if (art) { const lg = currentLeague(); window.Reader.open(newsList[+art.dataset.article], { sport: lg.sport, league: lg.league, name: lg.name }); return; }
    const teamEl = e.target.closest('[data-team-id]');
    if (teamEl) { window.Profile.openTeam(teamEl.dataset.teamId, cardLeague(teamEl)); return; }
    const playerEl = e.target.closest('[data-player-id]');
    if (playerEl) { window.Profile.openPlayer(playerEl.dataset.playerId, cardLeague(playerEl)); return; }
    if (e.target.closest('a')) return;
    const card = e.target.closest('.mc[data-event]');
    if (card) openGame(card);
  });
  el.content.addEventListener('change', (e) => {
    const sel = e.target.closest('#confSelect');
    if (sel && lastStandings) {
      state.standingsConf = sel.value;
      renderStandings(lastStandings.data, lastStandings.rankings);
    }
  });
  el.content.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest?.('.mc[data-event]');
    if (card && e.target === card) { e.preventDefault(); openGame(card); }
  });

  function openGame(card) {
    const lg = leagueById(card.dataset.leagueId) || currentLeague();
    if (lg.amateur) {
      const hit = amateurGameCache.get(`${lg.id}:${card.dataset.event}`);
      if (hit) window.AmateurDetail.open(hit.m, lg, { ...(hit.logos || {}) });
      return;
    }
    if (lg.hockey) {
      const g = hockeyGameCache.get(`${lg.id}:${card.dataset.event}`);
      if (g) window.HockeyDetail.open(g, lg);
      return;
    }
    const event = eventCache.get(`${card.dataset.leagueId}:${card.dataset.event}`) || null;
    window.Gamecast.open(card.dataset.event, { link: card.dataset.link || null, league: { sport: lg.sport, league: lg.league, id: lg.id }, event });
  }

  // Liga-Kontext für einen Team-/Spieler-Klick (wichtig in der Favoriten-Ansicht mit gemischten Ligen)
  function cardLeague(elm) {
    const lgId = elm.closest('[data-league-id]')?.dataset.leagueId;
    const lg = leagueById(lgId) || currentLeague();
    return { sport: lg.sport, league: lg.league };
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden || state.tab !== 'scores') return;
    if (currentLeague().amateur) return;
    reloadSilently();
  });

  // ---------- Suche (Teams, Spieler, Ligen) ----------
  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
  let teamIndex = [];
  let indexing = null;
  let searchItems = [];
  let searchSel = 0;
  let searchTimer = null;
  let searchSeq = 0;
  let remoteResults = [];

  function addTeam(t) {
    if (!t.name || teamIndex.some((x) => x.lg === t.lg && x.id === t.id)) return;
    t.key = fold(`${t.name} ${t.abbr || ''} ${t.alias || ''}`);
    teamIndex.push(t);
  }

  function buildIndex() {
    if (indexing) return indexing;
    const espn = LEAGUES.filter(isEspn).map(async (lg) => {
      try {
        const data = await api('teams', {}, lg);
        const list = data?.sports?.[0]?.leagues?.[0]?.teams || [];
        list.forEach(({ team: t }) => {
          if (!t) return;
          const logo = (t.logos || []).find((x) => (x.rel || []).includes('dark'))?.href || t.logos?.[0]?.href || '';
          addTeam({ kind: 'espn', id: String(t.id), lg: lg.id, name: t.displayName, abbr: t.abbreviation, alias: `${t.shortDisplayName || ''} ${t.location || ''} ${t.nickname || ''}`, logo, color: t.color });
        });
      } catch { /* Liga ohne Teamliste */ }
      if (el.search.open) runSearch(false);
    });
    const amateur = LEAGUES.filter((l) => l.amateur).flatMap((lg) => lg.teams.map(async (k) => {
      try {
        const d = await amateurData(k);
        d.table.forEach((r) => addTeam({ kind: 'own', id: amTeamId(r.team), lg: lg.id, name: r.team, logo: amLogoOk(r.logo) ? r.logo : '', sub: `${AMATEUR_LABEL[k]} · ${d.team.league}` }));
      } catch { /* egal */ }
      if (el.search.open) runSearch(false);
    }));
    const hockey = LEAGUES.filter((l) => l.hockey).map(async (lg) => {
      try {
        const d = await hockeyStandings(lg);
        d.groups.forEach((g) => g.table.forEach((r) => addTeam({ kind: 'own', id: amTeamId(r.team), lg: lg.id, name: r.team, logo: hwLogoOk(r.logo) ? r.logo : '' })));
      } catch { /* Hockeyweb nicht erreichbar */ }
      if (el.search.open) runSearch(false);
    });
    indexing = Promise.all([...espn, ...amateur, ...hockey]);
    return indexing;
  }

  function scoreMatch(key, q) {
    if (!q) return 0;
    if (key.startsWith(q)) return 3;
    if (key.includes(` ${q}`)) return 2;
    if (key.includes(q)) return 1;
    return 0;
  }

  function openSearch() {
    if (!el.search.open) el.search.showModal();
    el.searchInput.value = '';
    buildIndex();
    runSearch(false);
    setTimeout(() => el.searchInput.focus(), 0);
  }
  function closeSearch() { if (el.search.open) el.search.close(); }

  function runSearch(remote = true) {
    const raw = el.searchInput.value.trim();
    const q = fold(raw);
    const items = [];
    if (!q) {
      // Schnellzugriff: alle Ligen
      LEAGUES.filter((l) => !l.isFav && !l.isLive).forEach((l) => items.push({ type: 'league', lg: l.id, name: l.name, sub: SPORTS.find((s) => s.id === l.cat)?.label }));
    } else {
      LEAGUES.filter((l) => !l.isFav && !l.isLive && scoreMatch(fold(l.name), q)).forEach((l) => items.push({ type: 'league', lg: l.id, name: l.name, sub: SPORTS.find((s) => s.id === l.cat)?.label }));
      const teams = teamIndex.map((t) => ({ t, s: scoreMatch(t.key, q) + (isFav(t.id, t.lg) ? 0.5 : 0) })).filter((x) => x.s >= 1)
        .sort((a, b) => b.s - a.s || a.t.name.localeCompare(b.t.name)).slice(0, 10);
      teams.forEach(({ t }) => items.push({ type: 'team', ...t, sub: t.sub || leagueById(t.lg)?.name }));
      remoteResults.forEach((r) => {
        if (r.type === 'team' && items.some((x) => x.type === 'team' && x.id === r.id && x.lg === r.lg)) return;
        items.push(r);
      });
    }
    searchItems = items;
    searchSel = 0;
    renderSearch(raw, remote && q.length >= 2);
    if (remote) {
      clearTimeout(searchTimer);
      if (q.length >= 2) searchTimer = setTimeout(() => remoteSearch(raw), 280);
      else remoteResults = [];
    }
  }

  async function remoteSearch(raw) {
    const seq = ++searchSeq;
    try {
      const data = await api('search', { q: raw });
      if (seq !== searchSeq) return;
      const out = [];
      (data.results || []).forEach((grp) => (grp.contents || []).forEach((c) => {
        if (c.type !== 'player' && c.type !== 'team') return;
        const m = /~[at]:(\d+)/.exec(c.uid || '');
        const slug = c.defaultLeagueSlug;
        if (!m || !c.sport || !slug || !/^[a-z0-9.-]{2,40}$/.test(slug)) return;
        if (!['football', 'basketball', 'baseball', 'hockey', 'soccer'].includes(c.sport)) return;
        const lg = LEAGUES.find((l) => l.sport === c.sport && l.league === slug);
        out.push({
          type: c.type === 'player' ? 'player' : 'team', kind: 'espn', id: m[1], lg: lg?.id || null,
          sport: c.sport, league: slug, name: c.displayName,
          sub: [c.subtitle, c.description].filter(Boolean).join(' · ') || lg?.name || slug,
          logo: c.image?.defaultDark || c.image?.default || '',
        });
      }));
      remoteResults = out;
      if (el.search.open && fold(el.searchInput.value.trim()) === fold(raw)) runSearch(false);
    } catch {
      if (seq === searchSeq) { remoteResults = []; if (el.search.open) runSearch(false); }
    }
  }

  function renderSearch(raw, loading) {
    const sections = [['league', 'Ligen'], ['team', 'Teams'], ['player', 'Spieler']];
    let i = 0;
    let html = '';
    sections.forEach(([type, label]) => {
      const list = searchItems.filter((x) => x.type === type);
      if (!list.length) return;
      html += `<div class="sr-sec">${label}</div>`;
      list.forEach((it) => {
        const idx = searchItems.indexOf(it);
        const lgc = it.lg ? leagueById(it.lg)?.color : null;
        const icon = it.type === 'league'
          ? `<span class="sr-icon" style="--lg:${lgc}">${SPORTS.find((s) => s.id === leagueById(it.lg)?.cat)?.icon || ''}</span>`
          : it.logo ? `<img class="sr-img${it.type === 'player' ? ' round' : ''}" src="${esc(it.logo)}" alt="" loading="lazy"${it.kind === 'own' ? ' referrerpolicy="no-referrer"' : ''}>` : '<span class="sr-icon"></span>';
        const star = it.type === 'team' && it.lg ? `<span class="sr-star${isFav(it.id, it.lg) ? ' on' : ''}" data-sr-fav="${idx}" role="button" title="Favorit umschalten">★</span>` : '';
        html += `<button type="button" class="sr-row${idx === searchSel ? ' sel' : ''}" data-sr="${idx}">${icon}<span class="sr-text"><b>${esc(it.name)}</b><small>${esc(it.sub || '')}</small></span>${star}</button>`;
        i++;
      });
    });
    if (!i) html = `<div class="sr-empty">${raw ? (loading ? 'Suche läuft …' : `Nichts gefunden für „${esc(raw)}“.`) : ''}</div>`;
    else if (loading) html += '<div class="sr-empty small">Suche Spieler bei ESPN …</div>';
    el.searchResults.innerHTML = html;
    el.searchResults.querySelector('.sr-row.sel')?.scrollIntoView({ block: 'nearest' });
  }

  function chooseSearch(idx) {
    const it = searchItems[idx];
    if (!it) return;
    closeSearch();
    if (it.type === 'league') { selectLeague(it.lg); return; }
    if (it.type === 'player') { window.Profile.openPlayer(it.id, { sport: it.sport, league: it.league }); return; }
    if (it.kind === 'own') {
      state.highlight = it.id;
      selectLeague(it.lg, { tab: 'standings' });
      return;
    }
    const lg = leagueById(it.lg);
    window.Profile.openTeam(it.id, lg ? { sport: lg.sport, league: lg.league } : { sport: it.sport, league: it.league });
  }

  el.searchBtn.addEventListener('click', openSearch);
  el.searchClose.addEventListener('click', closeSearch);
  el.search.addEventListener('click', (e) => {
    if (e.target === el.search) { closeSearch(); return; }
    const f = e.target.closest('[data-sr-fav]');
    if (f) {
      e.stopPropagation();
      const it = searchItems[+f.dataset.srFav];
      toggleFav(it.id, it.lg);
      f.classList.toggle('on', isFav(it.id, it.lg));
      reloadSilently();
      return;
    }
    const row = e.target.closest('[data-sr]');
    if (row) chooseSearch(+row.dataset.sr);
  });
  el.searchInput.addEventListener('input', () => runSearch(true));
  el.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!searchItems.length) return;
      searchSel = (searchSel + (e.key === 'ArrowDown' ? 1 : -1) + searchItems.length) % searchItems.length;
      renderSearch(el.searchInput.value.trim(), false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      chooseSearch(searchSel);
    }
  });
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) {
      if (document.querySelector('dialog[open]:not(#search)')) return;
      e.preventDefault();
      openSearch();
    }
  });

  // ---------- Sync-Dialog ----------
  const syncDlg = $('syncDlg');
  const syncBody = $('syncBody');
  const syncDot = $('syncDot');
  const fmtSyncTime = (t) => (t ? new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(t)) : '–');

  function renderSyncState() {
    syncDot.className = `sync-dot${syncCfg.code ? (syncError ? ' err' : syncBusy ? ' busy' : ' on') : ''}`;
    $('syncBtn').title = syncCfg.code ? (syncError ? `Sync-Fehler: ${syncError}` : `Synchronisiert · zuletzt ${fmtSyncTime(syncCfg.last)}`) : 'Teams & gemerkte Spiele auf allen Geräten';
    if (syncDlg.open) renderSyncDialog();
  }

  function renderSyncDialog() {
    const counts = `<b>${favorites.size}</b> Team${favorites.size === 1 ? '' : 's'} · <b>${pins.length}</b> gemerkte${pins.length === 1 ? 's' : ''} Spiel${pins.length === 1 ? '' : 'e'}`;
    if (!syncCfg.code) {
      syncBody.innerHTML = `
        <h2>Auf allen Geräten</h2>
        <p class="muted">Deine ★-Teams und 🔖 gemerkten Spiele werden online gespeichert und mit deinen anderen Geräten abgeglichen. Verknüpft wird über einen persönlichen Sync-Code – ohne Konto.</p>
        <div class="sync-card">
          <div class="sync-step">Erstes Gerät</div>
          <p>Aktuell auf diesem Gerät: ${counts}</p>
          <button type="button" class="sync-primary" data-sync="create">Sync starten</button>
        </div>
        <div class="sync-card">
          <div class="sync-step">Weiteres Gerät</div>
          <p>Code vom anderen Gerät eingeben (oder dort den Link öffnen):</p>
          <div class="sync-join"><input id="syncCodeInput" placeholder="XXXX-XXXX-XXXX-XXXX" autocomplete="off" spellcheck="false" maxlength="22"><button type="button" class="sync-primary" data-sync="join">Verbinden</button></div>
        </div>
        ${syncError ? `<div class="status error">${esc(syncError)}</div>` : ''}`;
      return;
    }
    syncBody.innerHTML = `
      <h2>Sync aktiv <span class="sync-ok">●</span></h2>
      <p>${counts} · zuletzt abgeglichen ${esc(fmtSyncTime(syncCfg.last))}${syncBusy ? ' · <i>läuft …</i>' : ''}</p>
      ${syncError ? `<div class="status error">${esc(syncError)}</div>` : ''}
      <div class="sync-card">
        <div class="sync-step">Dein Sync-Code</div>
        <div class="sync-code">${esc(fmtCode(syncCfg.code))}</div>
        <div class="sync-actions">
          <button type="button" data-sync="copylink">Link kopieren</button>
          <button type="button" data-sync="copycode">Code kopieren</button>
          ${navigator.share ? '<button type="button" data-sync="share">Teilen …</button>' : ''}
        </div>
        <p class="muted small">Auf dem anderen Gerät den Link öffnen oder den Code unter ☁︎ eingeben. Behandle den Code wie ein Passwort – wer ihn kennt, sieht und ändert deine Favoriten.</p>
      </div>
      <div class="sync-actions">
        <button type="button" data-sync="now">Jetzt abgleichen</button>
        <button type="button" class="danger" data-sync="leave">Dieses Gerät trennen</button>
      </div>`;
  }

  function openSync() {
    renderSyncDialog();
    if (!syncDlg.open) syncDlg.showModal();
  }

  async function connectSync(code) {
    syncCfg.code = code;
    writeJSON(LS_SYNC, syncCfg);
    const ok = await syncNow();
    if (!ok) { delete syncCfg.code; writeJSON(LS_SYNC, syncCfg); }
    renderSyncState();
    return ok;
  }

  async function copyText(txt, btn) {
    try { await navigator.clipboard.writeText(txt); btn.textContent = 'Kopiert ✓'; }
    catch { window.prompt('Kopieren:', txt); }
  }

  $('syncBtn').addEventListener('click', openSync);
  $('syncClose').addEventListener('click', () => syncDlg.close());
  syncDlg.addEventListener('click', async (e) => {
    if (e.target === syncDlg) { syncDlg.close(); return; }
    const b = e.target.closest('[data-sync]');
    if (!b) return;
    const act = b.dataset.sync;
    if (act === 'create') { b.disabled = true; await connectSync(newSyncCode()); }
    else if (act === 'join') {
      const code = normCode($('syncCodeInput').value);
      if (!/^[A-Z2-9]{16}$/.test(code)) { syncError = 'Der Code hat 16 Zeichen (Buchstaben/Ziffern).'; renderSyncDialog(); return; }
      b.disabled = true;
      await connectSync(code);
    } else if (act === 'copylink') copyText(syncLink(), b);
    else if (act === 'copycode') copyText(fmtCode(syncCfg.code), b);
    else if (act === 'share') navigator.share({ title: 'Sport Dashboard – Sync', text: 'Favoriten auf diesem Gerät übernehmen', url: syncLink() }).catch(() => {});
    else if (act === 'now') syncNow();
    else if (act === 'leave') {
      delete syncCfg.code; delete syncCfg.last; syncError = '';
      writeJSON(LS_SYNC, syncCfg);
      renderSyncState();
      renderSyncDialog();
    }
  });
  syncDlg.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'syncCodeInput') { e.preventDefault(); syncDlg.querySelector('[data-sync="join"]')?.click(); }
  });

  // Link mit ?sync=CODE verknüpft dieses Gerät direkt
  (() => {
    const p = new URLSearchParams(location.search);
    const code = normCode(p.get('sync'));
    if (!p.has('sync')) return;
    p.delete('sync');
    history.replaceState(null, '', `${location.pathname}${p.toString() ? `?${p}` : ''}${location.hash}`);
    if (/^[A-Z2-9]{16}$/.test(code) && code !== syncCfg.code) connectSync(code).then(() => openSync());
  })();
  // Regelmäßig abgleichen: beim Start, beim Zurückkehren zur Seite und alle 2 Minuten
  if (syncCfg.code) syncNow();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && syncCfg.code) syncNow(); });
  setInterval(() => { if (!document.hidden && syncCfg.code) syncNow(); }, 120_000);
  renderSyncState();

  // ---------- Start ----------
  // Liga-Kontext (sport/league) → eigene Liga-ID, damit das Team-Profil den Favoriten-Stern kennt
  const leagueIdFor = (ctx) => LEAGUES.find((l) => l.sport === ctx?.sport && l.league === ctx?.league)?.id || null;
  window.Gamecast.init({ api, esc, league: currentLeague, isFav });
  window.Reader.init({ api, esc });
  window.Profile.init({
    api, esc,
    fav: {
      get: (teamId, ctx) => { const id = leagueIdFor(ctx); return id ? isFav(teamId, id) : null; },
      toggle: (teamId, ctx) => {
        const id = leagueIdFor(ctx);
        if (!id) return null;
        toggleFav(teamId, id);
        reloadSilently();
        return isFav(teamId, id);
      },
    },
  });
  el.version.textContent = VERSION;
  renderChrome();
  loadLeagueLogos();
  pollLive();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pollLive(); });
  if (initialLeague.hockey || initialLeague.amateur) {
    renderTabs(); renderDate(); skeleton();
    (initialLeague.hockey ? snapHockey(initialLeague) : snapAmateur(initialLeague)).then(() => { if (currentLeague()?.id === initialLeague.id) load(); });
  } else {
    load();
    if (isEspn(initialLeague)) {
      snapToGameDay(initialLeague).then(() => {
        if (currentLeague()?.id !== initialLeague.id) return;
        renderDate();
        if (state.tab === 'scores' && ymdOf(state.date) !== ymdOf(defaultAnchor(currentLeague()))) load();
      });
    }
  }
})();

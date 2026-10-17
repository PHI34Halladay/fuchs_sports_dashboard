/* Sport Dashboard – Frontend
 * Holt Daten über den eigenen Proxy (/api/espn) von der öffentlichen ESPN-API.
 */
(() => {
  'use strict';

  const VERSION = '1.6.1';

  // ---------- Konfiguration ----------
  const FAV_ID = 'fav';
  // Weitere Ligen einfach hier ergänzen (sport/league = ESPN-Pfad).
  const LEAGUES = [
    { id: FAV_ID, name: '★', sport: null, league: null, isFav: true },
    { id: 'nfl', name: 'NFL', sport: 'football', league: 'nfl' },
    { id: 'nba', name: 'NBA', sport: 'basketball', league: 'nba' },
    { id: 'mlb', name: 'MLB', sport: 'baseball', league: 'mlb' },
    { id: 'nhl', name: 'NHL', sport: 'hockey', league: 'nhl' },
    { id: 'cfb', name: 'NCAAF', sport: 'football', league: 'college-football', groups: '80' },
    { id: 'cbb', name: 'NCAAM', sport: 'basketball', league: 'mens-college-basketball', groups: '50' },
    { id: 'bl1', name: 'Bundesliga', sport: 'soccer', league: 'ger.1' },
    { id: 'bl2', name: '2. Bundesliga', sport: 'soccer', league: 'ger.2' },
    { id: 'epl', name: 'Premier League', sport: 'soccer', league: 'eng.1' },
    { id: 'laliga', name: 'La Liga', sport: 'soccer', league: 'esp.1' },
    { id: 'ligue1', name: 'Ligue 1', sport: 'soccer', league: 'fra.1' },
    { id: 'seriea', name: 'Serie A', sport: 'soccer', league: 'ita.1' },
    { id: 'mls', name: 'MLS', sport: 'soccer', league: 'usa.1' },
    { id: 'ucl', name: 'Champions League', sport: 'soccer', league: 'uefa.champions' },
    { id: 'uel', name: 'Europa League', sport: 'soccer', league: 'uefa.europa' },
    { id: 'uecl', name: 'Conference League', sport: 'soccer', league: 'uefa.europa.conf' },
  ];

  // US-Ligen: Spieltag richtet sich nach US-Eastern-Zeit, nicht nach deutscher
  // Kalendergrenze (ein Spiel in der Nacht Sa/So deutscher Zeit gehört noch zum Samstag).
  const US_TZ = 'America/New_York';
  const US_LEAGUE_IDS = new Set(['nfl', 'nba', 'mlb', 'nhl', 'cfb', 'cbb']);
  const leagueTZ = (lg) => (lg && US_LEAGUE_IDS.has(lg.id) ? US_TZ : undefined);
  const COLLEGE_IDS = new Set(['cfb', 'cbb']);

  const REFRESH_LIVE_MS = 30_000;
  const LS_FAV = 'sd:favorites';
  const LS_STATE = 'sd:state';

  // ---------- Zustand ----------
  const saved = readJSON(LS_STATE, {});
  const initialLeagueId = LEAGUES.some((l) => l.id === saved.leagueId) ? saved.leagueId : LEAGUES[1].id;
  const state = {
    leagueId: initialLeagueId,
    tab: initialLeagueId === FAV_ID ? 'scores' : (['scores', 'standings', 'news'].includes(saved.tab) ? saved.tab : 'scores'),
    date: todayAnchor(),
    top25Only: !!saved.top25Only,
    standingsConf: null, // Tabellen-Ansicht bei NCAAF/NCAAM: 'top25' oder ein Conference-Name
  };
  let favorites = new Set(readJSON(LS_FAV, []));
  let refreshTimer = null;
  let requestId = 0;
  // Roh-Event-Daten je Liga+ID zwischenspeichern, damit das Gamecast-Popup bei
  // Fußball einen Score/Status-Fallback hat (ESPNs Summary-Endpoint liefert dort
  // kein "header" wie bei NFL/NHL/MLB).
  const eventCache = new Map();

  function todayAnchor() {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d;
  }

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const el = {
    leagues: $('leagues'), tabs: $('tabs'), content: $('content'), status: $('status'),
    scoreControls: $('scoreControls'), dateText: $('dateText'), dateInput: $('dateInput'),
    prevDay: $('prevDay'), nextDay: $('nextDay'),
    top25Toggle: $('top25Toggle'), top25Only: $('top25Only'), updated: $('updated'), version: $('version'),
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
    writeJSON(LS_STATE, { leagueId: state.leagueId, tab: state.tab, top25Only: state.top25Only });
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const currentLeague = () => LEAGUES.find((l) => l.id === state.leagueId);
  const favKey = (teamId, leagueId = state.leagueId) => `${leagueId}:${teamId}`;
  const isFav = (teamId, leagueId = state.leagueId) => favorites.has(favKey(teamId, leagueId));

  function toYMD(d) {
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }
  function toISODate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  // Datum eines Zeitpunkts in einer bestimmten Zeitzone als YYYYMMDD (für den ESPN-Request).
  function ymdInTZ(d, tz) {
    if (!tz) return toYMD(d);
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t).value;
    return `${get('year')}${get('month')}${get('day')}`;
  }
  const fmtTime = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
  const fmtShort = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  const fmtNews = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  // Tagesüberschrift, optional in einer anderen Zeitzone formatiert (US-Ligen → Eastern Time).
  function fmtDayFor(d, tz) {
    return new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: tz }).format(d);
  }

  // ---------- Spieltage (für Tagesnavigation: nur Tage mit echten Spielen) ----------
  // ESPNs Scoreboard liefert unter leagues[0].calendar entweder eine flache Liste von
  // Tagen (NBA/NHL/MLB/NCAAM/Fußball) oder – bei NFL/NCAAF – eine Liste von Saisonphasen
  // mit Wochen-Einträgen (nur Wochen-Grenzen, keine einzelnen Spieltage). Für Letztere
  // wird die konkrete Woche (seasontype/week) separat abgefragt, um die echten Spieltage
  // aus den events dieser Woche zu ermitteln.
  const gameDayCache = new Map();

  async function gameDaySet(lg, forDate) {
    if (!lg || lg.isFav) return null;
    const tz = leagueTZ(lg);
    const target = forDate instanceof Date ? forDate : state.date;

    const calKey = `${lg.id}:cal`;
    let cal = gameDayCache.get(calKey);
    if (cal === undefined) {
      try {
        const params = {};
        if (lg.groups) params.groups = lg.groups;
        const data = await api('scoreboard', params, lg);
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

    // Wochenbasiert (NFL/NCAAF): passende Saisonphase + Woche für "target" suchen.
    // Vergleich über Kalendertage (ymdInTZ), nicht über rohe Zeitstempel: der
    // Mittags-Anker von "target" kann in UTC sonst knapp außerhalb einer Wochengrenze
    // liegen (Wochen enden laut ESPN z. B. um 06:59Z, Mittag Berlin = 10:00Z).
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

  // Beim Liga-Wechsel: von heute aus vorwärts zum nächsten Tag mit Spiel springen
  // (heute selbst, falls dort schon ein Spiel stattfindet).
  async function snapToGameDay(lg) {
    if (!lg || lg.isFav) return;
    let d = todayAnchor();
    for (let i = 0; i < 60; i++) {
      const days = await gameDaySet(lg, d);
      if (!days || !days.size) return;
      if (days.has(ymdInTZ(d, leagueTZ(lg)))) {
        if (currentLeague()?.id !== lg.id) return; // Liga wurde inzwischen gewechselt
        state.date = d;
        return;
      }
      d = new Date(d);
      d.setDate(d.getDate() + 1);
    }
  }

  async function api(type, params = {}, leagueOverride) {
    const lg = leagueOverride || currentLeague();
    const qs = new URLSearchParams({ type, sport: lg.sport, league: lg.league, ...params });
    const res = await fetch(`/api/espn?${qs}`);
    if (!res.ok) {
      let msg = `Fehler ${res.status}`;
      try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
      throw new Error(msg);
    }
    return res.json();
  }

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

  // ---------- UI-Aufbau ----------
  const SOCCER_LEAGUES = LEAGUES.filter((l) => l.sport === 'soccer');

  function renderLeagueButtons() {
    const activeSoccer = SOCCER_LEAGUES.find((l) => l.id === state.leagueId);
    let html = '';
    let soccerDone = false;
    LEAGUES.forEach((l) => {
      if (l.sport === 'soccer') {
        if (soccerDone) return;
        soccerDone = true;
        html += `
          <div class="league-dd${activeSoccer ? ' active' : ''}" id="soccerDD">
            <button type="button" class="league-btn league-dd-trigger" data-dd-toggle="soccer" aria-haspopup="listbox" aria-expanded="false">
              ⚽ ${esc(activeSoccer ? activeSoccer.name : 'Fußball')} <span class="dd-caret">▾</span>
            </button>
            <div class="league-dd-menu" role="listbox">
              ${SOCCER_LEAGUES.map((s) => `<button type="button" class="league-dd-item${s.id === state.leagueId ? ' active' : ''}" data-league="${s.id}" role="option">${esc(s.name)}</button>`).join('')}
            </div>
          </div>`;
        return;
      }
      html += `<button type="button" class="league-btn${l.id === state.leagueId ? ' active' : ''}${l.isFav ? ' league-fav' : ''}" data-league="${l.id}" title="${l.isFav ? 'Favoriten' : esc(l.name)}">${l.isFav ? '★' : esc(l.name)}</button>`;
    });
    el.leagues.innerHTML = html;
  }
  function renderTabs() {
    const isFavView = state.leagueId === FAV_ID;
    const isCollege = COLLEGE_IDS.has(state.leagueId);
    el.tabs.querySelectorAll('.tab').forEach((b) => {
      const hide = isFavView && b.dataset.tab !== 'scores';
      b.style.display = hide ? 'none' : '';
      const active = b.dataset.tab === state.tab;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active);
    });
    el.scoreControls.style.display = state.tab === 'scores' ? '' : 'none';
    // Top-25-Filter nur bei den College-Ligen (NCAAF/NCAAM); die Datumsanzeige
    // bleibt dabei bei allen Sportarten gleich groß.
    el.top25Toggle.hidden = !isCollege || isFavView;
  }
  function renderDate() {
    el.dateText.textContent = fmtShort.format(state.date);
    el.dateInput.value = toISODate(state.date);
  }

  // ---------- Spiele ----------
  async function loadScores({ silent = false } = {}) {
    const id = ++requestId;
    if (!silent) { skeleton(); showStatus(''); }
    const lg = currentLeague();
    const params = { dates: ymdInTZ(state.date, leagueTZ(lg)) };
    if (lg.groups) params.groups = lg.groups;

    try {
      const data = await api('scoreboard', params);
      if (id !== requestId) return;
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
    if (top25Active) {
      events = events.filter(({ ev: e }) => (e.competitions?.[0]?.competitors || []).some(isTop25));
    }
    renderGameList(events, data.week?.number ? ` · Woche ${data.week.number}` : '', top25Active ? 'Keine Top-25-Spiele in diesem Zeitraum.' : 'Keine Spiele in diesem Zeitraum.');
  }

  // Gemeinsames Rendering für Einzelliga- und Favoriten-Ansicht: Liste von {ev, lg}-Paaren,
  // gruppiert nach Spieltag (zeitzonenbewusst je Liga).
  function renderGameList(items, label, emptyText) {
    if (!items.length) {
      el.content.innerHTML = `<div class="empty">${emptyText}</div>`;
      return;
    }
    const groups = new Map();
    items
      .slice()
      .sort((a, b) => new Date(a.ev.date) - new Date(b.ev.date))
      .forEach(({ ev, lg }) => {
        const day = fmtDayFor(new Date(ev.date), leagueTZ(lg));
        if (!groups.has(day)) groups.set(day, []);
        groups.get(day).push({ ev, lg });
      });

    let html = '';
    let first = true;
    for (const [day, evs] of groups) {
      // Favoriten-Spiele innerhalb des Tages nach oben
      evs.sort((a, b) => favScore(b.ev, b.lg) - favScore(a.ev, a.lg));
      html += `<h2 class="group-title">${esc(day)}${first ? esc(label) : ''}</h2>`;
      html += `<div class="games">${evs.map(({ ev, lg }) => gameCard(ev, lg)).join('')}</div>`;
      first = false;
    }
    el.content.innerHTML = html;
  }

  // ---------- Favoriten-Ansicht (kombiniert über alle Ligen) ----------
  async function loadFavoriteScores({ silent = false } = {}) {
    const id = ++requestId;
    if (!silent) { skeleton(); showStatus(''); }
    const favLeagueIds = new Set([...favorites].map((k) => k.split(':')[0]));
    const targets = LEAGUES.filter((l) => !l.isFav && favLeagueIds.has(l.id));
    if (!targets.length) {
      el.content.innerHTML = '<div class="empty">Markiere zuerst Teams als Favorit (★ auf einer Spielkarte), um sie hier gesammelt zu sehen.</div>';
      setUpdated();
      return;
    }
    try {
      const results = await Promise.all(targets.map(async (lg) => {
        const params = { dates: ymdInTZ(state.date, leagueTZ(lg)) };
        if (lg.groups) params.groups = lg.groups;
        try { return { lg, data: await api('scoreboard', params, lg) }; }
        catch { return { lg, data: { events: [] } }; }
      }));
      if (id !== requestId) return;
      const items = [];
      results.forEach(({ lg, data }) => {
        (data.events || []).forEach((ev) => {
          if ((ev.competitions?.[0]?.competitors || []).some((c) => isFav(c.team?.id, lg.id))) items.push({ ev, lg });
        });
      });
      renderGameList(items, '', 'Keine Spiele deiner Favoriten an diesem Tag.');
      setUpdated();
      clearTimeout(refreshTimer);
      const hasLive = items.some(({ ev }) => ev.status?.type?.state === 'in');
      if (hasLive && state.tab === 'scores') refreshTimer = setTimeout(() => { if (!document.hidden) loadFavoriteScores({ silent: true }); }, REFRESH_LIVE_MS);
    } catch (e) {
      if (id !== requestId) return;
      if (!silent) { el.content.innerHTML = ''; showStatus(`Spiele konnten nicht geladen werden: ${e.message}`, true); }
    }
  }

  function favScore(ev, lg) {
    return (ev.competitions?.[0]?.competitors || []).some((c) => isFav(c.team?.id, lg?.id)) ? 1 : 0;
  }

  function gameCard(ev, lg) {
    eventCache.set(`${lg.id}:${ev.id}`, ev);
    const comp = ev.competitions?.[0] || {};
    const st = ev.status?.type || comp.status?.type || {};
    const stateName = st.state; // pre | in | post
    const competitors = (comp.competitors || []).slice();
    // Auswärts oben, Heim unten (US-Konvention); Fußball: Heim oben
    const soccer = lg.sport === 'soccer';
    competitors.sort((a, b) => {
      const order = soccer ? { home: 0, away: 1 } : { away: 0, home: 1 };
      return (order[a.homeAway] ?? 0) - (order[b.homeAway] ?? 0);
    });

    let statusHtml;
    if (stateName === 'in') {
      statusHtml = `<span class="live-badge">${esc(st.shortDetail || 'Live')}</span>`;
    } else if (stateName === 'post') {
      statusHtml = `<span>${esc(translateStatus(st))}</span>`;
    } else {
      statusHtml = `<span>${ev.timeValid === false || comp.timeValid === false ? 'Zeit offen' : fmtTime.format(new Date(ev.date)) + ' Uhr'}</span>`;
    }

    const note = comp.notes?.[0]?.headline;
    const fav = competitors.some((c) => isFav(c.team?.id, lg.id));
    const showScore = stateName !== 'pre';

    const rows = competitors.map((c) => {
      const t = c.team || {};
      const rec = c.records?.find((r) => r.type === 'total' || r.name === 'overall')?.summary;
      const rank = c.curatedRank?.current && c.curatedRank.current <= 25 ? `<span class="team-rec">#${c.curatedRank.current}</span> ` : '';
      const loser = stateName === 'post' && c.winner === false && competitors.some((o) => o.winner);
      return `
        <div class="team-row${loser ? ' loser' : ''}">
          <button class="star${isFav(t.id, lg.id) ? ' on' : ''}" data-fav="${esc(t.id)}" data-fav-league="${esc(lg.id)}" title="Favorit umschalten" aria-label="${esc(t.displayName)} als Favorit">★</button>
          ${t.logo ? window.LogoPref.img(t.id, t.logo, 'gc-link', ` data-team-id="${esc(t.id)}"`) : '<span></span>'}
          <div class="team-name gc-link" data-team-id="${esc(t.id)}">${rank}${esc(soccer ? t.shortDisplayName || t.displayName : t.displayName)}${rec ? `<span class="team-rec">${esc(rec)}</span>` : ''}</div>
          <div class="score">${showScore ? esc(c.score ?? '') : ''}</div>
        </div>`;
    }).join('');

    const leaders = stateName === 'post' || stateName === 'in' ? leadersHtml(comp) : '';
    const venue = comp.venue?.fullName;
    const tv = comp.broadcasts?.flatMap((b) => b.names || []).join(', ');
    const link = (ev.links || []).find((l) => l.rel?.includes('summary'))?.href;

    return `
      <article class="game${fav ? ' fav' : ''}${stateName === 'in' ? ' live' : ''}" data-event="${esc(ev.id)}" data-link="${esc(link || '')}" data-league-id="${esc(lg.id)}" tabindex="0" role="button" aria-label="${esc(ev.name || ev.shortName || 'Spiel')} – Details öffnen">
        <div class="game-status">${statusHtml}${note ? `<span class="note">${esc(note)}</span>` : ''}</div>
        ${rows}
        ${leaders}
        <div class="game-meta">
          <span>${esc([venue, tv].filter(Boolean).join(' · '))}</span>
          ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">ESPN ↗</a>` : ''}
        </div>
      </article>`;
  }

  function leadersHtml(comp) {
    const list = (comp.leaders || []).slice(0, 3).map((cat) => {
      const l = cat.leaders?.[0];
      if (!l?.athlete) return '';
      return `<div>${esc(cat.shortDisplayName || cat.abbreviation)}: <b class="gc-link" data-player-id="${esc(l.athlete.id)}">${esc(l.athlete.shortName || l.athlete.displayName)}</b> ${esc(l.displayValue)}</div>`;
    }).filter(Boolean);
    return list.length ? `<div class="leaders">${list.join('')}</div>` : '';
  }

  function translateStatus(st) {
    const d = st.shortDetail || st.detail || st.description || '';
    const map = { Final: 'Ende', 'Final/OT': 'Ende n.V.', 'Final/SO': 'Ende n.P.', FT: 'Ende', Postponed: 'Verschoben', Canceled: 'Abgesagt' };
    return map[d] || d;
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

  const RANKED_LEAGUES = new Set(['cfb', 'cbb']);
  let lastStandings = null; // { data, rankings } – für Neurendern bei Conference-Wechsel ohne Reload

  async function loadStandings() {
    const id = ++requestId;
    clearTimeout(refreshTimer);
    skeleton(3); showStatus('');
    const wantsRankings = RANKED_LEAGUES.has(state.leagueId);
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
        <td class="team-cell gc-link" data-team-id="${esc(t.id)}">${logo ? window.LogoPref.img(t.id, logo) : ''}<span>${esc(name)}</span></td>
        <td>${esc(r.recordSummary || '')}</td>
        <td>${esc(r.points ?? '')}</td>
        <td>${trend}</td>
      </tr>`;
    }).join('');
    return `
      <div class="standings-group top25">
        <h2 class="group-title">${esc(poll?.name || 'AP Top 25')}</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Team</th><th>Bilanz</th><th>Punkte</th><th>Trend</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>`;
  }

  // Sammelt alle Gruppen mit Einträgen (Ligen sind unterschiedlich tief verschachtelt)
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
    // Nur Spalten zeigen, die es gibt (und "T" nur, wenn es Unentschieden gibt)
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
        <td class="team-cell gc-link" data-team-id="${esc(t.id)}">${logo ? window.LogoPref.img(t.id, logo) : ''}<span>${esc(sport === 'soccer' ? t.shortDisplayName || t.displayName : t.displayName)}</span></td>
        ${cells}
      </tr>`;
    }).join('');

    const legend = notes.size
      ? `<div class="legend">${[...notes].map(([c, d]) => `<span><span class="rank-mark" style="background:${esc(c)}"></span>${esc(d)}</span>`).join('')}</div>`
      : '';

    return `
      <div class="standings-group">
        ${showTitle ? `<h2 class="group-title">${esc(g.name)}</h2>` : ''}
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

    // Bei NCAAF/NCAAM gibt es zu viele Conferences, um sie alle gleichzeitig zu
    // zeigen: stattdessen per Dropdown eine auswählen (vorbelegt mit "Top 25").
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

    const html = groups.map((g) => groupHtml(g, groups.length > 1, sport, baseCols)).join('');
    el.content.innerHTML = top25 + html;
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

  function renderNews(data) {
    const articles = (data.articles || []).filter((a) => a.headline);
    if (!articles.length) {
      el.content.innerHTML = '<div class="empty">Keine News verfügbar.</div>';
      return;
    }
    el.content.innerHTML = `<div class="news">${articles.map((a) => {
      const img = a.images?.find((i) => i.url)?.url;
      const href = a.links?.web?.href || '#';
      const desc = a.description && a.description !== a.headline ? `<p>${esc(a.description)}</p>` : '';
      const time = a.published ? `<time datetime="${esc(a.published)}">${fmtNews.format(new Date(a.published))} Uhr${a.type === 'Media' ? ' · Video' : ''}</time>` : '';
      return `<a class="article" href="${esc(href)}" target="_blank" rel="noopener">
        ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ''}
        <div class="article-body">${time}<h3>${esc(a.headline)}</h3>${desc}</div>
      </a>`;
    }).join('')}</div>`;
  }

  // ---------- Steuerung ----------
  function load() {
    renderTabs();
    renderDate();
    if (state.leagueId === FAV_ID) { loadFavoriteScores(); return; }
    if (state.tab === 'scores') loadScores();
    else if (state.tab === 'standings') loadStandings();
    else loadNews();
  }

  async function shiftDay(delta) {
    const lg = currentLeague();
    const plain = new Date(state.date);
    plain.setDate(plain.getDate() + delta);

    if (!lg.isFav) {
      let d = new Date(plain);
      let found = false;
      for (let i = 0; i < 60; i++) {
        const days = await gameDaySet(lg, d);
        if (!days || !days.size) { found = true; break; } // keine Kalenderdaten → normale ±1-Navigation
        if (days.has(ymdInTZ(d, leagueTZ(lg)))) { found = true; break; }
        d.setDate(d.getDate() + delta);
      }
      if (currentLeague()?.id !== lg.id) return; // Liga wurde inzwischen gewechselt
      state.date = found ? d : plain;
      load();
      return;
    }
    state.date = plain;
    load();
  }

  function closeLeagueDropdown() {
    el.leagues.querySelector('.league-dd.open')?.classList.remove('open');
  }

  el.leagues.addEventListener('click', (e) => {
    const ddToggle = e.target.closest('[data-dd-toggle]');
    if (ddToggle) {
      const dd = ddToggle.closest('.league-dd');
      const willOpen = !dd.classList.contains('open');
      closeLeagueDropdown();
      dd.classList.toggle('open', willOpen);
      ddToggle.setAttribute('aria-expanded', String(willOpen));
      if (willOpen) {
        // .leagues scrollt horizontal (overflow-x: auto) und schneidet damit ein
        // absolut positioniertes Menü darunter ab → Position fix, aus der Trigger-
        // Position im Viewport berechnet, statt relativ zum (scrollenden) Elternelement.
        // Erst "open" setzen (macht das Menü sichtbar), dann messen – offsetWidth
        // wäre bei display:none sonst 0.
        const menu = dd.querySelector('.league-dd-menu');
        const r = ddToggle.getBoundingClientRect();
        menu.style.top = `${Math.round(r.bottom + 6)}px`;
        menu.style.left = `${Math.round(Math.min(r.left, window.innerWidth - menu.offsetWidth - 10))}px`;
      }
      return;
    }
    const btn = e.target.closest('[data-league]');
    if (!btn) return;
    closeLeagueDropdown();
    if (btn.dataset.league === state.leagueId) return;
    state.leagueId = btn.dataset.league;
    state.date = todayAnchor();
    state.standingsConf = null;
    if (state.leagueId === FAV_ID) state.tab = 'scores';
    persist();
    renderLeagueButtons();
    btn.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    load();
    // Direkt mit "heute" laden, damit die UI nicht wartet; sobald bekannt ist, ob
    // heute ein Spieltag ist, ggf. auf den nächsten Spieltag vorspulen und neu laden.
    const lg = currentLeague();
    snapToGameDay(lg).then(() => {
      if (currentLeague()?.id !== lg.id) return;
      renderDate();
      if (state.tab === 'scores') load();
    });
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.league-dd')) closeLeagueDropdown();
  });
  window.addEventListener('resize', closeLeagueDropdown);

  el.tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn || btn.dataset.tab === state.tab) return;
    state.tab = btn.dataset.tab;
    persist();
    load();
  });

  el.prevDay.addEventListener('click', () => shiftDay(-1));
  el.nextDay.addEventListener('click', () => shiftDay(1));
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

  // Favoriten-Stern und Spielkarte (Event-Delegation)
  el.content.addEventListener('click', (e) => {
    const teamEl = e.target.closest('[data-team-id]');
    if (teamEl) { window.Profile.openTeam(teamEl.dataset.teamId, cardLeague(teamEl)); return; }
    const playerEl = e.target.closest('[data-player-id]');
    if (playerEl) { window.Profile.openPlayer(playerEl.dataset.playerId, cardLeague(playerEl)); return; }
    const star = e.target.closest('[data-fav]');
    if (star) {
      const key = favKey(star.dataset.fav, star.dataset.favLeague || state.leagueId);
      if (favorites.has(key)) favorites.delete(key); else favorites.add(key);
      writeJSON(LS_FAV, [...favorites]);
      if (state.leagueId === FAV_ID) loadFavoriteScores({ silent: true });
      else loadScores({ silent: true });
      return;
    }
    if (e.target.closest('a')) return; // ESPN-Link normal öffnen
    const card = e.target.closest('.game[data-event]');
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
    const card = e.target.closest?.('.game[data-event]');
    if (card && e.target === card) { e.preventDefault(); openGame(card); }
  });

  function openGame(card) {
    const lg = LEAGUES.find((l) => l.id === card.dataset.leagueId) || currentLeague();
    const event = eventCache.get(`${card.dataset.leagueId}:${card.dataset.event}`) || null;
    window.Gamecast.open(card.dataset.event, { link: card.dataset.link || null, league: { sport: lg.sport, league: lg.league, id: lg.id }, event });
  }

  // Liga-Kontext für einen Team-/Spieler-Klick ermitteln: aus der umschließenden Spielkarte
  // (wichtig in der Favoriten-Ansicht, wo mehrere Ligen gemischt angezeigt werden), sonst aktuelle Liga.
  function cardLeague(elm) {
    const lgId = elm.closest('[data-league-id]')?.dataset.leagueId;
    const lg = LEAGUES.find((l) => l.id === lgId) || currentLeague();
    return { sport: lg.sport, league: lg.league };
  }

  // Beim Zurückkehren zum Tab sofort aktualisieren, falls auf "Spiele"
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || state.tab !== 'scores') return;
    if (state.leagueId === FAV_ID) loadFavoriteScores({ silent: true });
    else loadScores({ silent: true });
  });

  // ---------- Start ----------
  window.Gamecast.init({ api, esc, league: currentLeague, isFav });
  window.Profile.init({ api, esc });
  el.version.textContent = VERSION;
  renderLeagueButtons();
  load();
})();

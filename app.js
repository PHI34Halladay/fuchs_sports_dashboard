/* Sport Dashboard – Frontend
 * Holt Daten über den eigenen Proxy (/api/espn) von der öffentlichen ESPN-API.
 */
(() => {
  'use strict';

  const VERSION = '1.3.0';

  // ---------- Konfiguration ----------
  // Weitere Ligen einfach hier ergänzen (sport/league = ESPN-Pfad).
  const LEAGUES = [
    { id: 'nfl', name: 'NFL', sport: 'football', league: 'nfl' },
    { id: 'nba', name: 'NBA', sport: 'basketball', league: 'nba' },
    { id: 'mlb', name: 'MLB', sport: 'baseball', league: 'mlb' },
    { id: 'nhl', name: 'NHL', sport: 'hockey', league: 'nhl' },
    { id: 'cfb', name: 'NCAAF', sport: 'football', league: 'college-football', groups: '80' },
    { id: 'cbb', name: 'NCAAM', sport: 'basketball', league: 'mens-college-basketball', groups: '50' },
    { id: 'bl1', name: 'Bundesliga', sport: 'soccer', league: 'ger.1' },
    { id: 'bl2', name: '2. Bundesliga', sport: 'soccer', league: 'ger.2' },
  ];

  const REFRESH_LIVE_MS = 30_000;
  const LS_FAV = 'sd:favorites';
  const LS_STATE = 'sd:state';

  // ---------- Zustand ----------
  const saved = readJSON(LS_STATE, {});
  const state = {
    leagueId: LEAGUES.some((l) => l.id === saved.leagueId) ? saved.leagueId : LEAGUES[0].id,
    tab: ['scores', 'standings', 'news'].includes(saved.tab) ? saved.tab : 'scores',
    date: null, // null = "Aktuell" (ESPN-Standard: heutiger Spieltag / aktuelle Woche)
    favOnly: !!saved.favOnly,
  };
  let favorites = new Set(readJSON(LS_FAV, []));
  let refreshTimer = null;
  let requestId = 0;

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const el = {
    leagues: $('leagues'), tabs: $('tabs'), content: $('content'), status: $('status'),
    scoreControls: $('scoreControls'), dateText: $('dateText'), dateInput: $('dateInput'),
    prevDay: $('prevDay'), nextDay: $('nextDay'), todayBtn: $('todayBtn'),
    favOnly: $('favOnly'), refreshBtn: $('refreshBtn'), updated: $('updated'), version: $('version'),
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
    writeJSON(LS_STATE, { leagueId: state.leagueId, tab: state.tab, favOnly: state.favOnly });
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const currentLeague = () => LEAGUES.find((l) => l.id === state.leagueId);
  const favKey = (teamId) => `${state.leagueId}:${teamId}`;
  const isFav = (teamId) => favorites.has(favKey(teamId));

  function toYMD(d) {
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }
  function toISODate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const fmtTime = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
  const fmtDay = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' });
  const fmtShort = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  const fmtNews = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  async function api(type, params = {}) {
    const lg = currentLeague();
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
  function renderLeagueButtons() {
    el.leagues.innerHTML = LEAGUES.map((l) =>
      `<button class="league-btn${l.id === state.leagueId ? ' active' : ''}" data-league="${l.id}">${esc(l.name)}</button>`
    ).join('');
  }
  function renderTabs() {
    el.tabs.querySelectorAll('.tab').forEach((b) => {
      const active = b.dataset.tab === state.tab;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active);
    });
    el.scoreControls.style.display = state.tab === 'scores' ? '' : 'none';
  }
  function renderDate() {
    el.dateText.textContent = state.date ? fmtShort.format(state.date) : 'Aktuell';
    el.dateInput.value = toISODate(state.date || new Date());
    el.todayBtn.style.display = state.date ? '' : 'none';
  }

  // ---------- Spiele ----------
  async function loadScores({ silent = false } = {}) {
    const id = ++requestId;
    if (!silent) { skeleton(); showStatus(''); }
    const lg = currentLeague();
    const params = {};
    if (state.date) params.dates = toYMD(state.date);
    if (lg.groups) params.groups = lg.groups;

    try {
      const data = await api('scoreboard', params);
      if (id !== requestId) return;
      renderScores(data);
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

  function renderScores(data) {
    let events = data.events || [];
    if (state.favOnly) {
      events = events.filter((ev) => (ev.competitions?.[0]?.competitors || []).some((c) => isFav(c.team?.id)));
    }

    if (!events.length) {
      el.content.innerHTML = `<div class="empty">${state.favOnly ? 'Keine Spiele deiner Favoriten in diesem Zeitraum.' : 'Keine Spiele in diesem Zeitraum.'}</div>`;
      return;
    }

    // Gruppieren nach Kalendertag (Ortszeit)
    const groups = new Map();
    events
      .slice()
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .forEach((ev) => {
        const day = fmtDay.format(new Date(ev.date));
        if (!groups.has(day)) groups.set(day, []);
        groups.get(day).push(ev);
      });

    let html = '';
    const label = data.week?.number ? ` · Woche ${data.week.number}` : '';
    let first = true;
    for (const [day, evs] of groups) {
      // Favoriten-Spiele innerhalb des Tages nach oben
      evs.sort((a, b) => favScore(b) - favScore(a));
      html += `<h2 class="group-title">${esc(day)}${first ? esc(label) : ''}</h2>`;
      html += `<div class="games">${evs.map(gameCard).join('')}</div>`;
      first = false;
    }
    el.content.innerHTML = html;
  }

  function favScore(ev) {
    return (ev.competitions?.[0]?.competitors || []).some((c) => isFav(c.team?.id)) ? 1 : 0;
  }

  function gameCard(ev) {
    const comp = ev.competitions?.[0] || {};
    const st = ev.status?.type || comp.status?.type || {};
    const stateName = st.state; // pre | in | post
    const competitors = (comp.competitors || []).slice();
    // Auswärts oben, Heim unten (US-Konvention); Fußball: Heim oben
    const soccer = currentLeague().sport === 'soccer';
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
    const fav = competitors.some((c) => isFav(c.team?.id));
    const showScore = stateName !== 'pre';

    const rows = competitors.map((c) => {
      const t = c.team || {};
      const rec = c.records?.find((r) => r.type === 'total' || r.name === 'overall')?.summary;
      const rank = c.curatedRank?.current && c.curatedRank.current <= 25 ? `<span class="team-rec">#${c.curatedRank.current}</span> ` : '';
      const loser = stateName === 'post' && c.winner === false && competitors.some((o) => o.winner);
      return `
        <div class="team-row${loser ? ' loser' : ''}">
          <button class="star${isFav(t.id) ? ' on' : ''}" data-fav="${esc(t.id)}" title="Favorit umschalten" aria-label="${esc(t.displayName)} als Favorit">★</button>
          ${t.logo ? `<img src="${esc(t.logo)}" alt="" loading="lazy">` : '<span></span>'}
          <div class="team-name">${rank}${esc(soccer ? t.shortDisplayName || t.displayName : t.displayName)}${rec ? `<span class="team-rec">${esc(rec)}</span>` : ''}</div>
          <div class="score">${showScore ? esc(c.score ?? '') : ''}</div>
        </div>`;
    }).join('');

    const leaders = stateName === 'post' || stateName === 'in' ? leadersHtml(comp) : '';
    const venue = comp.venue?.fullName;
    const tv = comp.broadcasts?.flatMap((b) => b.names || []).join(', ');
    const link = (ev.links || []).find((l) => l.rel?.includes('summary'))?.href;

    return `
      <article class="game${fav ? ' fav' : ''}${stateName === 'in' ? ' live' : ''}" data-event="${esc(ev.id)}" data-link="${esc(link || '')}" tabindex="0" role="button" aria-label="${esc(ev.name || ev.shortName || 'Spiel')} – Details öffnen">
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
      return `<div>${esc(cat.shortDisplayName || cat.abbreviation)}: <b>${esc(l.athlete.shortName || l.athlete.displayName)}</b> ${esc(l.displayValue)}</div>`;
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
        <td class="team-cell">${logo ? `<img src="${esc(logo)}" alt="" loading="lazy">` : ''}<span>${esc(name)}</span></td>
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

  function renderStandings(data, rankings) {
    const groups = collectGroups(data);
    const top25 = rankings ? top25Html(rankings) : '';
    if (!groups.length) {
      el.content.innerHTML = top25 || '<div class="empty">Für diese Liga ist aktuell keine Tabelle verfügbar.</div>';
      return;
    }
    const sport = currentLeague().sport;
    const baseCols = COLUMNS[sport] || COLUMNS.default;

    const html = groups.map((g) => {
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
          <td class="team-cell">${logo ? `<img src="${esc(logo)}" alt="" loading="lazy">` : ''}<span>${esc(sport === 'soccer' ? t.shortDisplayName || t.displayName : t.displayName)}</span></td>
          ${cells}
        </tr>`;
      }).join('');

      const legend = notes.size
        ? `<div class="legend">${[...notes].map(([c, d]) => `<span><span class="rank-mark" style="background:${esc(c)}"></span>${esc(d)}</span>`).join('')}</div>`
        : '';

      return `
        <div class="standings-group">
          ${groups.length > 1 ? `<h2 class="group-title">${esc(g.name)}</h2>` : ''}
          <div class="table-wrap"><table>
            <thead><tr><th>#</th><th>Team</th>${cols.map(([, label]) => `<th>${esc(label)}</th>`).join('')}</tr></thead>
            <tbody>${rows}</tbody>
          </table></div>
          ${legend}
        </div>`;
    }).join('');

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
    if (state.tab === 'scores') loadScores();
    else if (state.tab === 'standings') loadStandings();
    else loadNews();
  }

  function shiftDay(delta) {
    const d = new Date(state.date || new Date());
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + delta);
    state.date = d;
    load();
  }

  el.leagues.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-league]');
    if (!btn || btn.dataset.league === state.leagueId) return;
    state.leagueId = btn.dataset.league;
    state.date = null;
    persist();
    renderLeagueButtons();
    btn.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    load();
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
  el.todayBtn.addEventListener('click', () => { state.date = null; load(); });
  el.dateInput.addEventListener('change', () => {
    if (!el.dateInput.value) return;
    const [y, m, d] = el.dateInput.value.split('-').map(Number);
    state.date = new Date(y, m - 1, d, 12);
    load();
  });
  el.favOnly.checked = state.favOnly;
  el.favOnly.addEventListener('change', () => {
    state.favOnly = el.favOnly.checked;
    persist();
    loadScores();
  });
  el.refreshBtn.addEventListener('click', () => load());

  // Favoriten-Stern und Spielkarte (Event-Delegation)
  el.content.addEventListener('click', (e) => {
    const star = e.target.closest('[data-fav]');
    if (star) {
      const key = favKey(star.dataset.fav);
      if (favorites.has(key)) favorites.delete(key); else favorites.add(key);
      writeJSON(LS_FAV, [...favorites]);
      loadScores({ silent: true });
      return;
    }
    if (e.target.closest('a')) return; // ESPN-Link normal öffnen
    const card = e.target.closest('.game[data-event]');
    if (card) openGame(card);
  });
  el.content.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest?.('.game[data-event]');
    if (card && e.target === card) { e.preventDefault(); openGame(card); }
  });

  function openGame(card) {
    window.Gamecast.open(card.dataset.event, { link: card.dataset.link || null });
  }

  // Beim Zurückkehren zum Tab sofort aktualisieren, falls auf "Spiele"
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.tab === 'scores') loadScores({ silent: true });
  });

  // ---------- Start ----------
  window.Gamecast.init({ api, esc, league: currentLeague, isFav });
  el.version.textContent = VERSION;
  renderLeagueButtons();
  load();
})();

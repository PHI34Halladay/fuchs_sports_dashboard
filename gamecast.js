/* Sport Dashboard – Spiel-Popup (Gamecast / Boxscore / Bericht)
 * NHL hat eine eigene, ausführliche Darstellung. Alle anderen Ligen
 * bekommen eine allgemeine Ansicht (Linescore, Teamstatistik, Bericht).
 */
(() => {
  'use strict';

  const REFRESH_MS = 30_000;

  let ctx = null;          // { api, esc, league, isFav }
  let current = null;      // { eventId, link, data, tab, period, filter }
  let timer = null;
  let reqId = 0;

  const dlg = document.createElement('dialog');
  dlg.className = 'gc';
  dlg.innerHTML = `
    <div class="gc-shell">
      <button class="gc-close" aria-label="Schließen">×</button>
      <div class="gc-scroll" id="gcScroll">
        <div class="gc-head" id="gcHead"></div>
        <nav class="gc-tabs" id="gcTabs" role="tablist"></nav>
        <div class="gc-body" id="gcBody"></div>
      </div>
    </div>`;
  document.body.appendChild(dlg);
  const $head = dlg.querySelector('#gcHead');
  const $tabs = dlg.querySelector('#gcTabs');
  const $body = dlg.querySelector('#gcBody');
  const $scroll = dlg.querySelector('#gcScroll');

  // ---------- Öffnen / Schließen ----------
  function open(eventId, opts = {}) {
    current = { eventId, link: opts.link, league: opts.league || ctx.league(), event: opts.event || null, data: null, tab: null, period: 'all', filter: 'key', preview: opts.preview };
    $head.innerHTML = opts.preview || '';
    $tabs.innerHTML = '';
    $scroll.scrollTop = 0;
    $body.innerHTML = '<div class="gc-loading"><div class="skeleton"></div><div class="skeleton"></div></div>';
    if (!dlg.open) dlg.showModal();
    document.body.classList.add('modal-open');
    load();
  }

  function close() {
    clearTimeout(timer);
    reqId++;
    current = null;
    if (dlg.open) dlg.close();
    document.body.classList.remove('modal-open');
  }

  dlg.addEventListener('close', () => { clearTimeout(timer); current = null; document.body.classList.remove('modal-open'); });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) close(); // Klick auf den Hintergrund
    if (e.target.closest('.gc-close')) close();
  });

  async function load({ silent = false } = {}) {
    if (!current) return;
    const id = ++reqId;
    try {
      const data = await ctx.api('summary', { event: current.eventId }, current.league);
      if (id !== reqId || !current) return;
      current.data = data;
      render(silent);
      schedule();
    } catch (e) {
      if (id !== reqId || !current) return;
      if (!silent) $body.innerHTML = `<div class="status error">Spieldaten konnten nicht geladen werden: ${ctx.esc(e.message)}</div>`;
      else schedule();
    }
  }

  function schedule() {
    clearTimeout(timer);
    if (current && gameState(current.data) === 'in') {
      timer = setTimeout(() => load({ silent: true }), REFRESH_MS);
    }
  }

  // ---------- Datenaufbereitung ----------
  // Fußball liefert über den Summary-Endpunkt kein "header" (anders als
  // NFL/NHL/MLB) → auf das beim Öffnen übergebene Scoreboard-Event zurückfallen.
  const comp = (d) => d?.header?.competitions?.[0] || current?.event?.competitions?.[0] || {};
  const gameState = (d) => comp(d).status?.type?.state || 'pre';
  const isNHL = () => current?.league?.league === 'nhl';
  const isMLB = () => current?.league?.league === 'mlb';
  const isFootball = () => current?.league?.sport === 'football';
  const isSoccer = () => current?.league?.sport === 'soccer';

  function teamInfo(c) {
    const t = c.team || {};
    const logo = (t.logos || []).find((l) => (l.rel || []).includes('dark'))?.href || t.logos?.[0]?.href || t.logo || '';
    return {
      id: String(t.id ?? c.id),
      abbr: t.abbreviation || '',
      name: t.displayName || t.name || '',
      short: t.shortDisplayName || t.nickname || t.name || t.displayName || '',
      logo,
      color: pickColor(t.color, t.alternateColor),
      score: c.score ?? '',
      winner: c.winner,
      homeAway: c.homeAway,
      linescores: (c.linescores || []).map((l) => l.displayValue ?? l.value ?? ''),
      record: (c.record || c.records || []).find((r) => r.type === 'total')?.summary || '',
      hits: c.hits ?? null,
      errors: c.errors ?? null,
      rank: c.curatedRank?.current && c.curatedRank.current <= 25 ? c.curatedRank.current : null,
    };
  }

  function teams(d) {
    const list = (comp(d).competitors || []).map(teamInfo);
    const home = list.find((t) => t.homeAway === 'home') || list[0];
    const away = list.find((t) => t.homeAway === 'away') || list[1];
    if (home && away && colorDistance(home.color, away.color) < 90) away.color = '#e6edf3';
    return { home, away, byId: Object.fromEntries(list.map((t) => [t.id, t])) };
  }

  // Dunkle Teamfarben sind auf dunklem Hintergrund unsichtbar → hellere Variante wählen
  function pickColor(c1, c2) {
    for (const c of [c1, c2]) {
      if (c && /^[0-9a-f]{6}$/i.test(c) && luminance(c) > 0.12) return `#${c}`;
    }
    return '#8b96a5';
  }
  function luminance(hex) {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function colorDistance(a, b) {
    if (!a || !b || a[0] !== '#' || b[0] !== '#') return 999;
    const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [x, y] = [p(a), p(b)];
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  }

  // Periodenbezeichnungen (1, 2, 3, OT, SO …)
  function periodLabels(d, count) {
    const fromPlays = {};
    (d.plays || []).forEach((p) => { if (p.period?.number) fromPlays[p.period.number] = p.period.displayValue; });
    const reg = d.format?.regulation?.periods || (isNHL() ? 3 : isSoccer() ? 2 : isMLB() ? 9 : 4);
    return Array.from({ length: count }, (_, i) => {
      const n = i + 1;
      if (n <= reg || isMLB()) return String(n);
      const pl = fromPlays[n];
      if (pl && !/^\d/.test(pl)) return pl.toUpperCase();
      return n - reg === 1 ? 'OT' : `${n - reg}OT`;
    });
  }
  function periodName(p) {
    if (isMLB()) {
      const half = p?.type === 'Top' ? ' (oben)' : p?.type === 'Bottom' ? ' (unten)' : '';
      return p?.number ? `${p.number}. Inning${half}` : 'Inning';
    }
    if (isFootball()) {
      const n = p?.number;
      if (!n) return 'Viertel';
      if (n <= 4) return `${n}. Viertel`;
      return n - 4 === 1 ? 'OT' : `${n - 4}. OT`;
    }
    const v = p?.displayValue || '';
    if (/^\d/.test(v)) return `${parseInt(v, 10)}. Drittel`;
    if (v === 'OT') return 'Verlängerung';
    if (v === 'SO') return 'Penaltyschießen';
    return v || `Periode ${p?.number}`;
  }

  const statOf = (list, name) => (list || []).find((s) => s.name === name);

  // ---------- Klickbare Spieler/Teams (öffnen Profile-Popup) ----------
  function teamIdAttr(id) { return id != null && id !== '' ? ` data-team-id="${ctx.esc(String(id))}"` : ''; }
  function playerLink(id, label) { return id != null && id !== '' ? `<span class="gc-link" data-player-id="${ctx.esc(String(id))}">${label}</span>` : label; }

  // ---------- Rendering: Rahmen ----------
  function render(keepScroll) {
    const d = current.data;
    const st = gameState(d);
    const tabs = availableTabs(d, st);
    if (!tabs.some((t) => t.id === current.tab)) current.tab = tabs[0].id;

    renderHead(d);
    $tabs.innerHTML = tabs.length > 1
      ? tabs.map((t) => `<button role="tab" class="gc-tab${t.id === current.tab ? ' active' : ''}" data-gctab="${t.id}">${t.label}</button>`).join('')
      : '';
    const prev = $scroll.scrollTop;
    renderBody();
    // Beim Tabwechsel oben beim Tab-Menü bleiben, sonst Position halten (z. B. Live-Refresh)
    $scroll.scrollTop = keepScroll ? prev : Math.min(prev, $head.offsetHeight);
  }

  function availableTabs(d, st) {
    const t = [];
    if (st === 'pre') {
      t.push({ id: 'preview', label: 'Vorschau' });
    } else if (isNHL() || isMLB() || isFootball()) {
      t.push({ id: 'gamecast', label: 'Gamecast' });
      const hasPbp = isFootball() ? (d.drives?.previous || []).length : (d.plays || []).length;
      if (hasPbp) t.push({ id: 'pbp', label: isFootball() ? 'Drives' : 'Play-by-Play' });
      if ((d.boxscore?.players || []).length) t.push({ id: 'box', label: 'Boxscore' });
    } else if (isSoccer()) {
      t.push({ id: 'gamecast', label: 'Spielbericht' });
      if ((d.rosters || []).length) t.push({ id: 'lineups', label: 'Aufstellungen' });
    } else {
      t.push({ id: 'overview', label: 'Übersicht' });
    }
    if (d.article?.story || d.article?.headline) t.push({ id: 'recap', label: st === 'post' ? 'Spielbericht' : 'Bericht' });
    return t;
  }

  function renderHead(d) {
    const { home, away } = teams(d);
    if (!home || !away) return;
    const c = comp(d);
    const st = c.status?.type || {};
    const left = isSoccer() ? home : away;
    const right = isSoccer() ? away : home;
    const showScore = st.state !== 'pre';

    let statusText;
    if (st.state === 'in') statusText = `<span class="live-badge">${ctx.esc(st.shortDetail || 'Live')}</span>`;
    else if (st.state === 'post') statusText = ctx.esc(translate(st.shortDetail || st.detail));
    else {
      const dt = c.date ? new Date(c.date) : null;
      statusText = dt && !isNaN(dt) ? `${new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(dt)} Uhr` : '';
    }

    const side = (t) => `
      <div class="gc-team gc-link${st.state === 'post' && t.winner === false ? ' lost' : ''}"${teamIdAttr(t.id)}>
        ${t.logo ? `<img src="${ctx.esc(t.logo)}" alt="">` : ''}
        <div class="gc-team-name">${t.rank ? `#${t.rank} ` : ''}${ctx.esc(isSoccer() ? t.short : t.name)}</div>
        <div class="gc-team-rec">${ctx.esc(t.record)}</div>
      </div>`;

    const series = c.series?.summary ? `<div class="gc-series">${ctx.esc(c.series.summary)}</div>` : '';

    $head.innerHTML = `
      <div class="gc-score">
        ${side(left)}
        <div class="gc-center">
          ${showScore ? `<div class="gc-big"><span>${ctx.esc(left.score)}</span><span class="gc-dash">–</span><span>${ctx.esc(right.score)}</span></div>` : '<div class="gc-big gc-vs">vs</div>'}
          <div class="gc-status">${statusText}</div>
          ${series}
        </div>
        ${side(right)}
      </div>
      ${showScore ? linescoreTable(d, left, right) : ''}`;
  }

  function linescoreTable(d, left, right) {
    const n = Math.max(left.linescores.length, right.linescores.length);
    if (!n) return '';
    const labels = periodLabels(d, n);

    let shotsRow = '';
    if (isNHL() && (d.plays || []).length) {
      const sog = (teamId) => labels.map((lab, i) => {
        if (lab === 'SO') return '–';
        return d.plays.filter((p) => p.period?.number === i + 1 && p.team?.id === teamId && isOnGoal(p)).length;
      });
      const total = (t) => statOf(boxTeam(d, t.id)?.statistics, 'shotsTotal')?.displayValue
        ?? sog(t.id).filter((x) => x !== '–').reduce((a, b) => a + b, 0);
      shotsRow = `<tr class="gc-ls-sub"><td colspan="${n + 2}">Torschüsse</td></tr>` + [left, right].map((t) =>
        `<tr class="gc-ls-shots"><td>${ctx.esc(t.abbr)}</td>${sog(t.id).map((v) => `<td>${v}</td>`).join('')}<td>${ctx.esc(total(t))}</td></tr>`
      ).join('');
    }

    const mlbExtra = isMLB();
    const row = (t) => `<tr><td>${ctx.esc(t.abbr)}</td>${Array.from({ length: n }, (_, i) => `<td>${ctx.esc(t.linescores[i] ?? '')}</td>`).join('')}<td class="gc-ls-total">${ctx.esc(t.score)}</td>${mlbExtra ? `<td>${ctx.esc(t.hits ?? '')}</td><td>${ctx.esc(t.errors ?? '')}</td>` : ''}</tr>`;
    return `
      <div class="gc-ls-wrap"><table class="gc-ls">
        <thead><tr><th></th>${labels.map((l) => `<th>${l}</th>`).join('')}<th>${mlbExtra ? 'R' : 'T'}</th>${mlbExtra ? '<th>H</th><th>E</th>' : ''}</tr></thead>
        <tbody>${row(left)}${row(right)}${shotsRow}</tbody>
      </table></div>`;
  }

  function translate(s) {
    const map = { Final: 'Ende', 'Final/OT': 'Ende n.V.', 'Final/SO': 'Ende n.P.', FT: 'Ende', 'Final/2OT': 'Ende n.2V.', Postponed: 'Verschoben', Canceled: 'Abgesagt' };
    return map[s] || s || '';
  }

  const boxTeam = (d, id) => (d.boxscore?.teams || []).find((t) => String(t.team?.id) === String(id));
  const isOnGoal = (p) => p.type?.text === 'Goal' || p.type?.abbreviation === 'shot-on-goal' || p.type?.text === 'Shot';
  const isPenalty = (p) => !!p.type?.penaltyMinutes;

  function renderBody() {
    const d = current.data;
    switch (current.tab) {
      case 'gamecast': $body.innerHTML = isMLB() ? mlbGamecast(d) : isFootball() ? footballGamecast(d) : isSoccer() ? soccerGamecast(d) : nhlGamecast(d); break;
      case 'pbp': $body.innerHTML = isMLB() ? mlbPlayByPlay(d) : isFootball() ? footballDrives(d) : nhlPlayByPlay(d); break;
      case 'box': $body.innerHTML = isMLB() ? mlbBoxscore(d) : isFootball() ? footballBoxscore(d) : nhlBoxscore(d); break;
      case 'lineups': $body.innerHTML = soccerLineups(d); break;
      case 'recap': $body.innerHTML = recap(d); break;
      case 'preview': $body.innerHTML = preview(d); break;
      default: $body.innerHTML = genericOverview(d);
    }
    if (current.link) {
      $body.insertAdjacentHTML('beforeend', `<div class="gc-foot"><a href="${ctx.esc(current.link)}" target="_blank" rel="noopener">Auf ESPN öffnen ↗</a></div>`);
    }
  }

  // ---------- NHL: Gamecast ----------
  function nhlGamecast(d) {
    return [stars(d), scoringSummary(d), shotChart(d), teamStatsCompare(d, NHL_TEAM_STATS), penaltySummary(d), videoHighlights(d), gameInfo(d)]
      .filter(Boolean).join('');
  }

  function stars(d) {
    const fa = comp(d).status?.featuredAthletes || [];
    const order = [['firstStar', '1. Star'], ['secondStar', '2. Star'], ['thirdStar', '3. Star']];
    const list = order.map(([key, label]) => ({ label, f: fa.find((x) => x.name === key) })).filter((x) => x.f?.athlete);
    if (!list.length) return '';
    const { byId } = teams(d);
    const line = playerLines(d);
    return section('Three Stars', `<div class="gc-stars">${list.map(({ label, f }) => {
      const a = f.athlete;
      const t = byId[String(f.team?.id)];
      return `<div class="gc-star">
        <div class="gc-star-img gc-link" data-player-id="${ctx.esc(a.id)}">${a.headshot?.href ? `<img src="${ctx.esc(a.headshot.href)}" alt="" loading="lazy">` : ''}${t?.logo ? `<img class="gc-star-logo gc-link" src="${ctx.esc(t.logo)}" alt=""${teamIdAttr(t.id)}>` : ''}</div>
        <div class="gc-star-label">${label}</div>
        <div class="gc-star-name">${playerLink(a.id, ctx.esc(a.displayName))}</div>
        <div class="gc-star-line">${ctx.esc(line[a.id] || '')}</div>
      </div>`;
    }).join('')}</div>`);
  }

  // Kurze Statistikzeile pro Spieler aus dem Boxscore (für Three Stars)
  function playerLines(d) {
    const out = {};
    (d.boxscore?.players || []).forEach((team) => (team.statistics || []).forEach((g) => {
      const idx = (k) => (g.keys || []).indexOf(k);
      (g.athletes || []).forEach((a) => {
        const s = a.stats || [];
        const v = (k) => (idx(k) >= 0 ? s[idx(k)] : null);
        if (g.name === 'goalies') {
          out[a.athlete?.id] = `${v('saves') ?? '–'} Saves · ${v('savePct') ?? ''} SV%`;
        } else if (g.name === 'pitching') {
          out[a.athlete?.id] = `${v('fullInnings.partInnings') ?? '–'} IP · ${v('strikeouts') ?? 0} K · ${v('earnedRuns') ?? 0} ER`;
        } else if (g.name === 'batting') {
          out[a.athlete?.id] = `${v('hits-atBats') ?? ''} · ${v('RBIs') ?? 0} RBI${+v('homeRuns') > 0 ? ` · ${v('homeRuns')} HR` : ''}`;
        } else {
          const gl = +v('goals') || 0, as = +v('assists') || 0;
          out[a.athlete?.id] = `${gl} T · ${as} A · ${v('shotsTotal') ?? 0} S`;
        }
      });
    }));
    return out;
  }

  function strengthBadge(p) {
    const a = p.strength?.abbreviation || '';
    const parts = [];
    if (a.startsWith('power')) parts.push('<span class="gc-badge pp">PP</span>');
    if (a.startsWith('short')) parts.push('<span class="gc-badge sh">SH</span>');
    if (/empty net/i.test(p.text || '') || p.shotInfo?.abbreviation === 'empty-net') parts.push('<span class="gc-badge en">EN</span>');
    return parts.join('');
  }

  function scoringSummary(d) {
    const goals = (d.plays || []).filter((p) => p.scoringPlay);
    if (!goals.length) return section('Tore', '<div class="gc-empty">Noch keine Tore.</div>');
    const { byId } = teams(d);
    return section('Tore', groupByPeriod(goals).map(([per, list]) => `
      <div class="gc-period">${ctx.esc(periodName(per))}</div>
      ${list.map((p) => {
        const t = byId[String(p.team?.id)];
        const scorer = p.participants?.find((x) => x.type === 'scorer') || p.participants?.[0];
        const assists = (p.participants || []).filter((x) => x.type === 'assister');
        const head = scorer?.athlete?.headshot?.href;
        return `<div class="gc-goal">
          <div class="gc-time">${ctx.esc(p.clock?.displayValue || '')}</div>
          <div class="gc-goal-img gc-link" data-player-id="${ctx.esc(scorer?.athlete?.id)}">${head ? `<img src="${ctx.esc(head)}" alt="" loading="lazy">` : ''}${t?.logo ? `<img class="gc-goal-logo gc-link" src="${ctx.esc(t.logo)}" alt=""${teamIdAttr(t.id)}>` : ''}</div>
          <div class="gc-goal-txt">
            <div><b>${playerLink(scorer?.athlete?.id, ctx.esc(scorer?.athlete?.displayName || ''))}</b>${scorer?.ytdGoals ? ` <span class="muted">(${scorer.ytdGoals})</span>` : ''} ${strengthBadge(p)}</div>
            <div class="muted">${assists.length ? 'Assists: ' + assists.map((a) => playerLink(a.athlete?.id, ctx.esc(a.athlete?.shortName || a.athlete?.displayName))).join(', ') : 'ohne Assist'}</div>
          </div>
          <div class="gc-goal-score">${ctx.esc(scoreAfter(d, p))}</div>
        </div>`;
      }).join('')}`).join(''));
  }

  function scoreAfter(d, p) {
    const { home, away } = teams(d);
    return isSoccer() ? `${p.homeScore}:${p.awayScore}` : `${away.abbr} ${p.awayScore} – ${p.homeScore} ${home.abbr}`;
  }

  function penaltySummary(d) {
    const pens = (d.plays || []).filter(isPenalty);
    if (!pens.length) return '';
    const { byId } = teams(d);
    return section('Strafen', groupByPeriod(pens).map(([per, list]) => `
      <div class="gc-period">${ctx.esc(periodName(per))}</div>
      ${list.map((p) => {
        const t = byId[String(p.team?.id)];
        const who = p.participants?.[0]?.athlete;
        return `<div class="gc-pen">
          <div class="gc-time">${ctx.esc(p.clock?.displayValue || '')}</div>
          ${t?.logo ? `<img class="gc-link" src="${ctx.esc(t.logo)}" alt=""${teamIdAttr(t.id)}>` : '<span></span>'}
          <div><b>${playerLink(who?.id, ctx.esc(who?.displayName || ''))}</b> <span class="muted">${ctx.esc(p.type.text)}</span></div>
          <div class="gc-pim">${ctx.esc(p.type.penaltyMinutes)} Min.${p.type.penaltyType && p.type.penaltyType !== 'Minor' ? ` <span class="muted">${ctx.esc(p.type.penaltyType)}</span>` : ''}</div>
        </div>`;
      }).join('')}`).join(''));
  }

  function groupByPeriod(plays) {
    const m = new Map();
    plays.forEach((p) => {
      const k = p.period?.number ?? 0;
      if (!m.has(k)) m.set(k, [p.period, []]);
      m.get(k)[1].push(p);
    });
    return [...m.values()];
  }

  // ---------- NHL: Shot Chart ----------
  function shotChart(d) {
    const plays = (d.plays || []).filter((p) => p.coordinate && ['Shot', 'Goal', 'Missed'].includes(p.type?.text) && p.period?.displayValue !== 'SO');
    if (!plays.length) return '';
    const { home, away } = teams(d);
    const periods = [...new Set(plays.map((p) => p.period.number))].sort();
    const labels = periodLabels(d, Math.max(...periods));
    const sel = current.period;

    const dots = plays
      .filter((p) => sel === 'all' || String(p.period.number) === sel)
      .map((p) => {
        let { x, y } = p.coordinate;
        const isHome = String(p.team?.id) === home.id;
        // Heimteam greift immer nach rechts an, Gastteam nach links
        if ((isHome && x < 0) || (!isHome && x > 0)) { x = -x; y = -y; }
        const color = isHome ? home.color : away.color;
        const kind = p.type.text;
        const shooter = p.participants?.[0]?.athlete?.shortName || '';
        const title = `${periodName(p.period)} ${p.clock?.displayValue || ''} – ${shooter}: ${kind === 'Goal' ? 'TOR' : kind === 'Shot' ? 'Schuss' : 'daneben'}`;
        if (kind === 'Goal') return `<circle cx="${x}" cy="${-y}" r="3.2" fill="${color}" stroke="#fff" stroke-width="0.8"><title>${ctx.esc(title)}</title></circle>`;
        if (kind === 'Shot') return `<circle cx="${x}" cy="${-y}" r="2" fill="none" stroke="${color}" stroke-width="0.9"><title>${ctx.esc(title)}</title></circle>`;
        return `<g opacity=".45"><path d="M${x - 1.4} ${-y - 1.4}L${x + 1.4} ${-y + 1.4}M${x - 1.4} ${-y + 1.4}L${x + 1.4} ${-y - 1.4}" stroke="${color}" stroke-width=".8"/><title>${ctx.esc(title)}</title></g>`;
      }).join('');

    const chips = [['all', 'Alle'], ...periods.map((n) => [String(n), labels[n - 1]])]
      .map(([v, l]) => `<button class="gc-chip${sel === v ? ' active' : ''}" data-period="${v}">${l}</button>`).join('');

    return section('Shot Chart', `
      <div class="gc-chips">${chips}</div>
      <div class="gc-rink-wrap">
        <div class="gc-rink-team left gc-link"${teamIdAttr(away.id)}>${away.logo ? `<img src="${ctx.esc(away.logo)}" alt="">` : ''}${ctx.esc(away.abbr)} →</div>
        <svg class="gc-rink" viewBox="-101 -43.5 202 87" role="img" aria-label="Schusskarte">
          ${RINK}
          ${dots}
        </svg>
        <div class="gc-rink-team right gc-link"${teamIdAttr(home.id)}>← ${ctx.esc(home.abbr)}${home.logo ? `<img src="${ctx.esc(home.logo)}" alt="">` : ''}</div>
      </div>
      <div class="gc-legend">
        <span><svg width="12" height="12" viewBox="-6 -6 12 12"><circle r="4.5" fill="#e6edf3"/></svg>Tor</span>
        <span><svg width="12" height="12" viewBox="-6 -6 12 12"><circle r="4" fill="none" stroke="#e6edf3" stroke-width="1.5"/></svg>Schuss aufs Tor</span>
        <span><svg width="12" height="12" viewBox="-6 -6 12 12"><path d="M-3 -3L3 3M-3 3L3 -3" stroke="#e6edf3" stroke-width="1.5" opacity=".6"/></svg>Daneben</span>
        <span><i style="background:${away.color}"></i>${ctx.esc(away.abbr)}</span>
        <span><i style="background:${home.color}"></i>${ctx.esc(home.abbr)}</span>
      </div>`);
  }

  // NHL-Spielfeld 200 × 85 ft (Koordinatensystem wie ESPN: Mitte = 0/0)
  const RINK = `
    <rect x="-100" y="-42.5" width="200" height="85" rx="28" fill="#18202a" stroke="#3a4452" stroke-width=".8"/>
    <line x1="0" y1="-42.5" x2="0" y2="42.5" stroke="#b8434a" stroke-width="1"/>
    <line x1="-25" y1="-42.5" x2="-25" y2="42.5" stroke="#3d6fc4" stroke-width="1"/>
    <line x1="25" y1="-42.5" x2="25" y2="42.5" stroke="#3d6fc4" stroke-width="1"/>
    <line x1="-89" y1="-40" x2="-89" y2="40" stroke="#b8434a" stroke-width=".4"/>
    <line x1="89" y1="-40" x2="89" y2="40" stroke="#b8434a" stroke-width=".4"/>
    <circle r="15" fill="none" stroke="#3d6fc4" stroke-width=".4"/>
    <circle r=".8" fill="#3d6fc4"/>
    ${[[-69, -22], [-69, 22], [69, -22], [69, 22]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="15" fill="none" stroke="#b8434a" stroke-width=".4"/><circle cx="${x}" cy="${y}" r=".9" fill="#b8434a"/>`).join('')}
    ${[[-20, -22], [-20, 22], [20, -22], [20, 22]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".9" fill="#b8434a"/>`).join('')}
    <path d="M-89 -4 A6 6 0 0 0 -83 0 A6 6 0 0 0 -89 4 Z" fill="rgba(80,140,220,.28)" stroke="#b8434a" stroke-width=".3"/>
    <path d="M89 -4 A6 6 0 0 1 83 0 A6 6 0 0 1 89 4 Z" fill="rgba(80,140,220,.28)" stroke="#b8434a" stroke-width=".3"/>
    <rect x="-92.3" y="-3" width="3.3" height="6" fill="none" stroke="#8b96a5" stroke-width=".4"/>
    <rect x="89" y="-3" width="3.3" height="6" fill="none" stroke="#8b96a5" stroke-width=".4"/>`;

  // ---------- Teamstatistik-Vergleich ----------
  const NHL_TEAM_STATS = [
    ['shotsTotal', 'Torschüsse'],
    ['faceoffPercent', 'Bullys gewonnen', '%'],
    ['__pp', 'Powerplay'],
    ['hits', 'Checks'],
    ['blockedShots', 'Geblockte Schüsse'],
    ['penaltyMinutes', 'Strafminuten'],
    ['takeaways', 'Puckgewinne'],
    ['giveaways', 'Puckverluste'],
  ];

  function teamStatsCompare(d, spec) {
    const { home, away } = teams(d);
    const L = boxTeam(d, away.id)?.statistics, R = boxTeam(d, home.id)?.statistics;
    if (!L || !R) return '';
    const rows = spec.map(([key, label, suffix = '']) => {
      let lv, rv, ln, rn;
      if (key === '__pp') {
        const f = (s) => `${statOf(s, 'powerPlayGoals')?.displayValue ?? 0}/${statOf(s, 'powerPlayOpportunities')?.displayValue ?? 0}`;
        lv = f(L); rv = f(R);
        ln = +(statOf(L, 'powerPlayGoals')?.displayValue || 0); rn = +(statOf(R, 'powerPlayGoals')?.displayValue || 0);
      } else {
        const a = statOf(L, key), b = statOf(R, key);
        if (!a || !b) return '';
        lv = a.displayValue + suffix; rv = b.displayValue + suffix;
        ln = parseFloat(a.displayValue) || 0; rn = parseFloat(b.displayValue) || 0;
      }
      const sum = ln + rn;
      const lp = sum ? (ln / sum) * 100 : 50;
      return `<div class="gc-cmp">
        <div class="gc-cmp-top"><span>${ctx.esc(lv)}</span><span class="muted">${ctx.esc(label)}</span><span>${ctx.esc(rv)}</span></div>
        <div class="gc-cmp-bar"><i style="width:${lp}%;background:${away.color}"></i><i style="width:${100 - lp}%;background:${home.color}"></i></div>
      </div>`;
    }).join('');
    return section('Teamstatistik', `<div class="gc-cmp-head"><span class="gc-link"${teamIdAttr(away.id)}>${ctx.esc(away.abbr)}</span><span class="gc-link"${teamIdAttr(home.id)}>${ctx.esc(home.abbr)}</span></div>${rows}`);
  }

  function gameInfo(d) {
    const gi = d.gameInfo || {};
    const parts = [];
    if (gi.venue?.fullName) parts.push(['Halle', [gi.venue.fullName, gi.venue.address?.city].filter(Boolean).join(', ')]);
    if (gi.attendance) parts.push(['Zuschauer', new Intl.NumberFormat('de-DE').format(gi.attendance)]);
    const refs = (gi.officials || []).map((o) => o.displayName || o.fullName).filter(Boolean);
    if (refs.length) parts.push(['Schiedsrichter', refs.join(', ')]);
    const fa = comp(d).status?.featuredAthletes || [];
    const wg = fa.find((f) => f.name === 'winningGoalie')?.athlete?.displayName;
    const lg = fa.find((f) => f.name === 'losingGoalie')?.athlete?.displayName;
    if (wg) parts.push(['Siegtorhüter', wg]);
    if (lg) parts.push(['Verlierer-Torhüter', lg]);
    if (!parts.length) return '';
    return section('Spielinfo', `<dl class="gc-info">${parts.map(([k, v]) => `<dt>${k}</dt><dd>${ctx.esc(v)}</dd>`).join('')}</dl>`);
  }

  // ---------- NHL: Play-by-Play ----------
  function nhlPlayByPlay(d) {
    const { byId } = teams(d);
    const all = d.plays || [];
    const periods = [...new Set(all.map((p) => p.period?.number).filter(Boolean))].sort();
    const labels = periodLabels(d, Math.max(0, ...periods));
    const sel = current.period;
    const keyTypes = /^(Goal|Shot|Period Start|Period End|End of Game|Shootout)$/;

    let list = all.filter((p) => sel === 'all' || String(p.period?.number) === sel);
    if (current.filter === 'key') list = list.filter((p) => p.scoringPlay || isPenalty(p) || keyTypes.test(p.type?.text || ''));
    if (gameState(d) === 'in') list = list.slice().reverse();

    const chips = [['all', 'Alle'], ...periods.map((n) => [String(n), labels[n - 1]])]
      .map(([v, l]) => `<button class="gc-chip${sel === v ? ' active' : ''}" data-period="${v}">${l}</button>`).join('');
    const filter = `
      <button class="gc-chip${current.filter === 'key' ? ' active' : ''}" data-filter="key">Wichtige</button>
      <button class="gc-chip${current.filter === 'all' ? ' active' : ''}" data-filter="all">Alle Aktionen</button>`;

    let lastPeriod = null;
    const rows = list.map((p) => {
      let head = '';
      if (sel === 'all' && p.period?.number !== lastPeriod) {
        lastPeriod = p.period?.number;
        head = `<div class="gc-period">${ctx.esc(periodName(p.period))}</div>`;
      }
      const t = byId[String(p.team?.id)];
      const cls = p.scoringPlay ? ' goal' : isPenalty(p) ? ' pen' : '';
      return `${head}<div class="gc-play${cls}">
        <div class="gc-time">${ctx.esc(p.clock?.displayValue || '')}</div>
        ${t?.logo ? `<img class="gc-link" src="${ctx.esc(t.logo)}" alt=""${teamIdAttr(t.id)}>` : '<span></span>'}
        <div>${p.scoringPlay ? '<b>TOR</b> ' : ''}${ctx.esc(p.text || p.type?.text || '')} ${p.scoringPlay ? strengthBadge(p) : ''}</div>
        <div class="gc-play-score">${p.scoringPlay ? ctx.esc(`${p.awayScore}–${p.homeScore}`) : ''}</div>
      </div>`;
    }).join('');

    return `<div class="gc-chips">${chips}<span class="gc-chip-sep"></span>${filter}</div>
      <div class="gc-plays">${rows || '<div class="gc-empty">Keine Aktionen.</div>'}</div>`;
  }

  // ---------- NHL: Boxscore ----------
  const SKATER_COLS = [
    ['goals', 'T'], ['assists', 'A'], ['__pts', 'P'], ['plusMinus', '+/-'], ['shotsTotal', 'S'],
    ['hits', 'HT'], ['blockedShots', 'BS'], ['penaltyMinutes', 'PIM'], ['faceoffPercent', 'FO%'], ['timeOnIce', 'TOI'],
  ];
  const GOALIE_COLS = [
    ['shotsAgainst', 'SA'], ['goalsAgainst', 'GA'], ['saves', 'SV'], ['savePct', 'SV%'], ['timeOnIce', 'TOI'], ['penaltyMinutes', 'PIM'],
  ];
  const GROUP_NAMES = {
    forwards: 'Stürmer', defenses: 'Verteidiger', skaters: 'Feldspieler', goalies: 'Torhüter',
    batting: 'Schlagleute', pitching: 'Pitcher',
    passing: 'Passing', rushing: 'Rushing', receiving: 'Receiving', defensive: 'Defense', kicking: 'Kicking',
  };

  function nhlBoxscore(d) {
    const { home, away } = teams(d);
    const order = [away, home];
    return order.map((t) => {
      const team = (d.boxscore.players || []).find((p) => String(p.team?.id) === t.id);
      if (!team) return '';
      const groups = (team.statistics || []).filter((g) => (g.athletes || []).length);
      return section(`<span class="gc-sec-team gc-link"${teamIdAttr(t.id)}>${t.logo ? `<img src="${ctx.esc(t.logo)}" alt="">` : ''}${ctx.esc(t.name)}</span>`, groups.map((g) => {
        const cols = g.name === 'goalies' ? GOALIE_COLS : SKATER_COLS;
        const idx = (k) => (g.keys || []).indexOf(k);
        const val = (a, k) => {
          if (k === '__pts') return (+val(a, 'goals') || 0) + (+val(a, 'assists') || 0);
          const i = idx(k);
          return i >= 0 ? a.stats?.[i] ?? '' : '';
        };
        const usable = cols.filter(([k]) => k === '__pts' || idx(k) >= 0);
        const rows = g.athletes.map((a) => {
          const pts = g.name !== 'goalies' && val(a, '__pts') > 0;
          return `<tr${a.athlete?.scratched ? ' class="muted"' : ''}>
            <td class="gc-box-name"><span class="muted">${ctx.esc(a.athlete?.jersey || '')}</span> ${playerLink(a.athlete?.id, ctx.esc(a.athlete?.shortName || a.athlete?.displayName || ''))}</td>
            ${usable.map(([k]) => `<td class="${k === '__pts' && pts ? 'strong' : ''}">${ctx.esc(val(a, k))}</td>`).join('')}
          </tr>`;
        }).join('');
        return `<div class="gc-box-group">${GROUP_NAMES[g.name] || ctx.esc(g.name)}</div>
          <div class="table-wrap"><table class="gc-box">
            <thead><tr><th>Spieler</th>${usable.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead>
            <tbody>${rows}</tbody>
          </table></div>`;
      }).join(''));
    }).join('') + '<div class="gc-note">T = Tore · A = Assists · P = Punkte · S = Schüsse · HT = Checks · BS = geblockte Schüsse · PIM = Strafminuten · FO% = Bullyquote · TOI = Eiszeit · SA = Schüsse gegen · GA = Gegentore · SV = Paraden</div>';
  }

  // ---------- American Football (NFL/NCAAF): Gamecast ----------
  const FOOTBALL_TEAM_STATS = [
    ['totalYards', 'Yards gesamt'],
    ['netPassingYards', 'Passyards'],
    ['rushingYards', 'Laufyards'],
    ['thirdDownEff', '3rd-Down-Versuche'],
    ['turnovers', 'Turnover'],
    ['totalPenaltiesYards', 'Strafen'],
    ['possessionTime', 'Ballbesitz'],
  ];

  function footballGamecast(d) {
    return [footballScoringSummary(d), teamStatsCompare(d, FOOTBALL_TEAM_STATS), footballLeaders(d), videoHighlights(d), gameInfo(d)]
      .filter(Boolean).join('');
  }

  function footballScoringSummary(d) {
    const scores = d.scoringPlays || [];
    if (!scores.length) return section('Spielstand-Verlauf', '<div class="gc-empty">Noch keine Punkte.</div>');
    const { byId } = teams(d);
    return section('Spielstand-Verlauf', groupByPeriod(scores).map(([per, list]) => `
      <div class="gc-period">${ctx.esc(periodName(per))}</div>
      ${list.map((p) => {
        const t = byId[String(p.team?.id)];
        return `<div class="gc-goal">
          <div class="gc-time">${ctx.esc(p.scoringType?.abbreviation || '')}</div>
          <div class="gc-goal-img">${t?.logo ? `<img class="gc-goal-logo gc-link" src="${ctx.esc(t.logo)}" alt=""${teamIdAttr(t.id)}>` : ''}</div>
          <div class="gc-goal-txt"><div>${ctx.esc((p.text || '').trim())}</div></div>
          <div class="gc-goal-score">${ctx.esc(scoreAfter(d, p))}</div>
        </div>`;
      }).join('')}`).join(''));
  }

  function footballLeaders(d) {
    const leaders = (d.leaders || []).filter((t) => (t.leaders || []).length);
    if (!leaders.length) return '';
    const { byId } = teams(d);
    const wanted = ['passingYards', 'rushingYards', 'receivingYards'];
    return section('Topspieler', `<div class="gc-leaders">${leaders.map((t) => {
      const ti = byId[String(t.team?.id)];
      const cats = (t.leaders || []).filter((c) => wanted.includes(c.name));
      return `<div><div class="gc-leaders-team gc-link"${teamIdAttr(ti?.id)}>${ti?.logo ? `<img src="${ctx.esc(ti.logo)}" alt="">` : ''}${ctx.esc(ti?.name || '')}</div>
        ${cats.map((cat) => {
          const l = cat.leaders?.[0];
          if (!l) return '';
          return `<div class="gc-row"><span class="muted">${ctx.esc(cat.displayName)}</span><span>${playerLink(l.athlete?.id, ctx.esc(l.athlete?.shortName || l.athlete?.displayName || ''))}</span><span><b>${ctx.esc(l.displayValue)}</b></span></div>`;
        }).join('')}</div>`;
    }).join('')}</div>`);
  }

  // ---------- Football: Drives ----------
  function footballDrives(d) {
    const drives = d.drives?.previous || [];
    if (!drives.length) return '<div class="gc-empty">Keine Drive-Daten.</div>';
    const withPeriod = drives.map((dr) => ({ ...dr, _period: dr.plays?.[0]?.period?.number || 0 }));
    const periods = [...new Set(withPeriod.map((dr) => dr._period).filter(Boolean))].sort((a, b) => a - b);
    const labels = periodLabels(d, Math.max(0, ...periods));
    const sel = current.period;

    let list = withPeriod.filter((dr) => sel === 'all' || String(dr._period) === sel);
    if (gameState(d) === 'in') list = list.slice().reverse();

    const chips = [['all', 'Alle'], ...periods.map((n) => [String(n), labels[n - 1]])]
      .map(([v, l]) => `<button class="gc-chip${sel === v ? ' active' : ''}" data-period="${v}">${l}</button>`).join('');
    const filter = `
      <button class="gc-chip${current.filter === 'key' ? ' active' : ''}" data-filter="key">Nur Drive-Ergebnis</button>
      <button class="gc-chip${current.filter === 'all' ? ' active' : ''}" data-filter="all">Mit allen Spielzügen</button>`;

    const { byId } = teams(d);
    const rows = list.map((dr) => {
      const t = byId[String(dr.team?.id)];
      const plays = current.filter === 'all' ? (dr.plays || []).map((p) => `
        <div class="gc-drive-play"><span class="muted">${ctx.esc(p.start?.downDistanceText || '')}</span> ${ctx.esc(p.text || '')}</div>`).join('') : '';
      return `<div class="gc-drive${dr.isScore ? ' score' : ''}">
        <div class="gc-drive-head">
          ${t?.logo ? `<img class="gc-link" src="${ctx.esc(t.logo)}" alt=""${teamIdAttr(t.id)}>` : '<span></span>'}
          <div class="gc-drive-desc"><b class="gc-link"${teamIdAttr(t?.id)}>${ctx.esc(t?.abbr || '')}</b> ${ctx.esc(dr.description || '')}</div>
          <div class="gc-drive-result${dr.isScore ? ' strong' : ''}">${ctx.esc(dr.shortDisplayResult || dr.result || '')}</div>
        </div>
        ${plays ? `<div class="gc-drive-plays">${plays}</div>` : ''}
      </div>`;
    }).join('');

    return `<div class="gc-chips">${chips}<span class="gc-chip-sep"></span>${filter}</div>
      <div class="gc-drives">${rows || '<div class="gc-empty">Keine Drives in diesem Abschnitt.</div>'}</div>`;
  }

  // ---------- Football: Boxscore ----------
  const FOOTBALL_PASSING_COLS = [['completions/passingAttempts', 'C/ATT'], ['passingYards', 'YDS'], ['yardsPerPassAttempt', 'AVG'], ['passingTouchdowns', 'TD'], ['interceptions', 'INT'], ['sacks-sackYardsLost', 'SACKS'], ['QBRating', 'RTG']];
  const FOOTBALL_RUSHING_COLS = [['rushingAttempts', 'ATT'], ['rushingYards', 'YDS'], ['yardsPerRushAttempt', 'AVG'], ['rushingTouchdowns', 'TD'], ['longRushing', 'LONG']];
  const FOOTBALL_RECEIVING_COLS = [['receptions', 'REC'], ['receivingYards', 'YDS'], ['yardsPerReception', 'AVG'], ['receivingTouchdowns', 'TD'], ['longReception', 'LONG']];
  const FOOTBALL_DEFENSIVE_COLS = [['totalTackles', 'TOT'], ['soloTackles', 'SOLO'], ['sacks', 'SACK'], ['tacklesForLoss', 'TFL'], ['passesDefended', 'PD'], ['QBHits', 'QBH']];
  const FOOTBALL_KICKING_COLS = [['fieldGoalsMade/fieldGoalAttempts', 'FG'], ['longFieldGoalMade', 'LONG'], ['extraPointsMade/extraPointAttempts', 'XP'], ['totalKickingPoints', 'PTS']];
  const FOOTBALL_COLS = { passing: FOOTBALL_PASSING_COLS, rushing: FOOTBALL_RUSHING_COLS, receiving: FOOTBALL_RECEIVING_COLS, defensive: FOOTBALL_DEFENSIVE_COLS, kicking: FOOTBALL_KICKING_COLS };

  function footballBoxscore(d) {
    const { home, away } = teams(d);
    const order = [away, home];
    return order.map((t) => {
      const team = (d.boxscore.players || []).find((p) => String(p.team?.id) === t.id);
      if (!team) return '';
      const groups = (team.statistics || []).filter((g) => FOOTBALL_COLS[g.name] && (g.athletes || []).length);
      return section(`<span class="gc-sec-team gc-link"${teamIdAttr(t.id)}>${t.logo ? `<img src="${ctx.esc(t.logo)}" alt="">` : ''}${ctx.esc(t.name)}</span>`, groups.map((g) => {
        const cols = FOOTBALL_COLS[g.name];
        const idx = (k) => (g.keys || []).indexOf(k);
        const val = (a, k) => { const i = idx(k); return i >= 0 ? a.stats?.[i] ?? '' : ''; };
        const usable = cols.filter(([k]) => idx(k) >= 0);
        const rows = g.athletes.map((a) => `<tr>
            <td class="gc-box-name">${playerLink(a.athlete?.id, ctx.esc(a.athlete?.shortName || a.athlete?.displayName || ''))}</td>
            ${usable.map(([k]) => `<td>${ctx.esc(val(a, k))}</td>`).join('')}
          </tr>`).join('');
        return `<div class="gc-box-group">${GROUP_NAMES[g.name] || ctx.esc(g.name)}</div>
          <div class="table-wrap"><table class="gc-box">
            <thead><tr><th>Spieler</th>${usable.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead>
            <tbody>${rows}</tbody>
          </table></div>`;
      }).join(''));
    }).join('') + '<div class="gc-note">C/ATT = Pässe · YDS = Yards · TD = Touchdowns · INT = Interceptions · RTG = Passer Rating · ATT = Läufe · REC = Catches · TOT = Tackles gesamt · TFL = Tackles for Loss · PD = Pässe verteidigt · QBH = QB Hits · FG = Field Goals · XP = Extra Points</div>';
  }

  // ---------- Fußball (Soccer): Gamecast ----------
  const SOCCER_TEAM_STATS = [
    ['possessionPct', 'Ballbesitz', '%'],
    ['totalShots', 'Schüsse'],
    ['shotsOnTarget', 'Davon aufs Tor'],
    ['wonCorners', 'Eckbälle'],
    ['totalPasses', 'Pässe'],
    ['passPct', 'Passquote', '%'],
    ['totalCrosses', 'Flanken'],
    ['totalLongBalls', 'Lange Bälle'],
    ['totalTackles', 'Zweikämpfe'],
    ['foulsCommitted', 'Fouls'],
    ['offsides', 'Abseits'],
    ['yellowCards', 'Gelbe Karten'],
    ['redCards', 'Rote Karten'],
  ];

  function soccerGamecast(d) {
    return [soccerScoringSummary(d), teamStatsCompare(d, SOCCER_TEAM_STATS), videoHighlights(d), gameInfo(d)]
      .filter(Boolean).join('');
  }

  const rosterStat = (stats, name) => statOf(stats, name)?.displayValue;

  // ESPNs Soccer-Summary liefert keine Torereignisse mit Minute – die Torschützen
  // werden daher aus den Aufstellungsstatistiken (rosters[].roster[].stats) ermittelt.
  function soccerScoringSummary(d) {
    const rosters = d.rosters || [];
    if (!rosters.length) return '';
    const { byId } = teams(d);
    const rows = [];
    rosters.forEach((r) => {
      const t = byId[String(r.team?.id)];
      (r.roster || []).forEach((p) => {
        const goals = +rosterStat(p.stats, 'totalGoals') || 0;
        const og = +rosterStat(p.stats, 'ownGoals') || 0;
        if (goals || og) rows.push({ t, p, goals, og });
      });
    });
    if (!rows.length) return section('Torschützen', '<div class="gc-empty">Keine Tore erfasst.</div>');
    return section('Torschützen', rows.map(({ t, p, goals, og }) => `
      <div class="gc-goal">
        <div class="gc-goal-img">${t?.logo ? `<img class="gc-goal-logo gc-link" src="${ctx.esc(t.logo)}" alt=""${teamIdAttr(t.id)}>` : ''}</div>
        <div class="gc-goal-txt">
          <div><b>${playerLink(p.athlete?.id, ctx.esc(p.athlete?.displayName || p.athlete?.fullName || ''))}</b>${goals > 1 ? ` <span class="muted">×${goals}</span>` : ''}${og ? ' <span class="muted">(Eigentor)</span>' : ''}</div>
        </div>
      </div>`).join(''));
  }

  const SOCCER_POS_ORDER = { G: 0, D: 1, M: 2, F: 3 };

  function soccerLineups(d) {
    const rosters = d.rosters || [];
    if (!rosters.length) return '<div class="gc-empty">Keine Aufstellung verfügbar.</div>';
    const { byId } = teams(d);

    const row = (p) => {
      const goals = +rosterStat(p.stats, 'totalGoals') || 0;
      const assists = +rosterStat(p.stats, 'goalAssists') || 0;
      const yc = +rosterStat(p.stats, 'yellowCards') || 0;
      const rc = +rosterStat(p.stats, 'redCards') || 0;
      const badges = [];
      if (goals) badges.push(`<span class="gc-badge pp" title="Tore">⚽${goals > 1 ? `×${goals}` : ''}</span>`);
      if (assists) badges.push(`<span class="gc-badge" title="Vorlagen">🅰${assists > 1 ? `×${assists}` : ''}</span>`);
      if (yc) badges.push(`<span class="gc-badge yc" title="Gelbe Karte">${yc > 1 ? '2×🟨' : '🟨'}</span>`);
      if (rc) badges.push(`<span class="gc-badge rc" title="Rote Karte">🟥</span>`);
      const subInfo = p.subbedIn ? ' <span class="muted">(ein)</span>' : p.subbedOut ? ' <span class="muted">(aus)</span>' : '';
      return `<div class="gc-lineup-row${p.subbedOut ? ' subbed-out' : ''}">
        <span class="gc-lineup-num muted">${ctx.esc(p.jersey || '')}</span>
        <span class="gc-lineup-pos muted">${ctx.esc(p.position?.abbreviation || '')}</span>
        <span class="gc-lineup-name">${playerLink(p.athlete?.id, ctx.esc(p.athlete?.displayName || p.athlete?.fullName || ''))}${subInfo}</span>
        <span class="gc-lineup-badges">${badges.join('')}</span>
      </div>`;
    };

    const posRank = (p) => SOCCER_POS_ORDER[p.position?.abbreviation?.[0]] ?? 9;
    return rosters.map((r) => {
      const t = byId[String(r.team?.id)] || { id: r.team?.id, name: r.team?.displayName, logo: (r.team?.logos || [])[0]?.href };
      const starters = (r.roster || []).filter((p) => p.starter).sort((a, b) => posRank(a) - posRank(b));
      const bench = (r.roster || []).filter((p) => !p.starter).sort((a, b) => posRank(a) - posRank(b));
      return section(`<span class="gc-sec-team gc-link"${teamIdAttr(t.id)}>${t.logo ? `<img src="${ctx.esc(t.logo)}" alt="">` : ''}${ctx.esc(t.name)}</span>`,
        `<div class="gc-lineup-group">Startelf</div>${starters.map(row).join('') || '<div class="gc-empty">Keine Daten.</div>'}` +
        (bench.length ? `<div class="gc-lineup-group">Ersatzbank</div>${bench.map(row).join('')}` : ''));
    }).join('');
  }

  // ---------- MLB: Gamecast ----------
  function mlbGamecast(d) {
    return [decisions(d), mlbScoringSummary(d), mlbTeamStatsCompare(d), videoHighlights(d), gameInfo(d)]
      .filter(Boolean).join('');
  }

  function decisions(d) {
    const fa = comp(d).status?.featuredAthletes || [];
    const order = [['winningPitcher', 'Gewinner'], ['savingPitcher', 'Save'], ['losingPitcher', 'Verlierer']];
    const list = order.map(([key, label]) => ({ key, label, f: fa.find((x) => x.name === key) })).filter((x) => x.f?.athlete);
    if (!list.length) return '';
    const { byId } = teams(d);
    const line = playerLines(d);
    return section('Pitching-Entscheidung', `<div class="gc-stars">${list.map(({ key, label, f }) => {
      const a = f.athlete;
      const t = byId[String(f.team?.id)];
      const rec = a.record ? `${a.record}${key === 'savingPitcher' && +a.saves > 0 ? `, ${a.saves} SV` : ''}` : '';
      return `<div class="gc-star">
        <div class="gc-star-img gc-link" data-player-id="${ctx.esc(a.id)}">${a.headshot?.href ? `<img src="${ctx.esc(a.headshot.href)}" alt="" loading="lazy">` : ''}${t?.logo ? `<img class="gc-star-logo gc-link" src="${ctx.esc(t.logo)}" alt=""${teamIdAttr(t.id)}>` : ''}</div>
        <div class="gc-star-label">${label}</div>
        <div class="gc-star-name">${playerLink(a.id, ctx.esc(a.displayName))}</div>
        <div class="gc-star-line">${[rec, line[a.id]].filter(Boolean).join(' · ')}</div>
      </div>`;
    }).join('')}</div>`);
  }

  function mlbScoringSummary(d) {
    const scoring = (d.plays || []).filter((p) => p.scoringPlay);
    if (!scoring.length) return section('Punkte', '<div class="gc-empty">Noch keine Punkte.</div>');
    const { byId } = teams(d);
    return section('Punkte', groupByPeriod(scoring).map(([per, list]) => `
      <div class="gc-period">${ctx.esc(periodName(per))}</div>
      ${list.map((p) => {
        const t = byId[String(p.team?.id)];
        const isHR = p.alternativeType?.type === 'home-run';
        return `<div class="gc-goal">
          <div class="gc-time">${p.period?.type === 'Top' ? '▲' : '▼'}</div>
          <div class="gc-goal-img">${t?.logo ? `<img class="gc-goal-logo gc-link" src="${ctx.esc(t.logo)}" alt=""${teamIdAttr(t.id)}>` : ''}</div>
          <div class="gc-goal-txt">
            <div>${ctx.esc(p.text || '')} ${isHR ? '<span class="gc-badge pp">HR</span>' : ''}</div>
          </div>
          <div class="gc-goal-score">${ctx.esc(scoreAfter(d, p))}</div>
        </div>`;
      }).join('')}`).join(''));
  }

  const MLB_TEAM_STATS = [
    ['batting', 'hits', 'Hits'],
    ['batting', 'homeRuns', 'Home Runs'],
    ['batting', 'walks', 'Walks'],
    ['pitching', 'strikeouts', 'Strikeouts (Pitcher)'],
    ['pitching', 'walks', 'Walks (Pitcher)'],
    ['pitching', 'earnedRuns', 'Earned Runs'],
    ['fielding', 'errors', 'Fehler'],
  ];

  function mlbTeamStatsCompare(d) {
    const { home, away } = teams(d);
    const L = boxTeam(d, away.id)?.statistics, R = boxTeam(d, home.id)?.statistics;
    if (!L || !R) return '';
    const find = (groups, group, name) => groups.find((g) => g.name === group)?.stats?.find((s) => s.name === name);
    const rows = MLB_TEAM_STATS.map(([group, key, label]) => {
      const a = find(L, group, key), b = find(R, group, key);
      if (!a || !b) return '';
      const ln = parseFloat(a.displayValue) || 0, rn = parseFloat(b.displayValue) || 0;
      const sum = ln + rn;
      const lp = sum ? (ln / sum) * 100 : 50;
      return `<div class="gc-cmp">
        <div class="gc-cmp-top"><span>${ctx.esc(a.displayValue)}</span><span class="muted">${ctx.esc(label)}</span><span>${ctx.esc(b.displayValue)}</span></div>
        <div class="gc-cmp-bar"><i style="width:${lp}%;background:${away.color}"></i><i style="width:${100 - lp}%;background:${home.color}"></i></div>
      </div>`;
    }).join('');
    return section('Teamstatistik', `<div class="gc-cmp-head"><span class="gc-link"${teamIdAttr(away.id)}>${ctx.esc(away.abbr)}</span><span class="gc-link"${teamIdAttr(home.id)}>${ctx.esc(home.abbr)}</span></div>${rows}`);
  }

  // ---------- MLB: Play-by-Play ----------
  function mlbPlayByPlay(d) {
    const { byId } = teams(d);
    const all = d.plays || [];
    const periods = [...new Set(all.map((p) => p.period?.number).filter(Boolean))].sort((a, b) => a - b);
    const labels = periodLabels(d, Math.max(0, ...periods));
    const sel = current.period;

    let list = all.filter((p) => sel === 'all' || String(p.period?.number) === sel);
    if (current.filter === 'key') list = list.filter((p) => p.type?.type === 'play-result');
    if (gameState(d) === 'in') list = list.slice().reverse();

    const chips = [['all', 'Alle'], ...periods.map((n) => [String(n), labels[n - 1]])]
      .map(([v, l]) => `<button class="gc-chip${sel === v ? ' active' : ''}" data-period="${v}">${l}</button>`).join('');
    const filter = `
      <button class="gc-chip${current.filter === 'key' ? ' active' : ''}" data-filter="key">Wichtige</button>
      <button class="gc-chip${current.filter === 'all' ? ' active' : ''}" data-filter="all">Alle Aktionen (jeder Pitch)</button>`;

    let lastPeriod = null;
    const rows = list.map((p) => {
      let head = '';
      if (sel === 'all' && p.period?.number !== lastPeriod) {
        lastPeriod = p.period?.number;
        head = `<div class="gc-period">${ctx.esc(periodName(p.period))}</div>`;
      }
      const t = byId[String(p.team?.id)];
      const cls = p.scoringPlay ? ' goal' : '';
      return `${head}<div class="gc-play${cls}">
        <div class="gc-time">${p.period?.type === 'Top' ? '▲' : p.period?.type === 'Bottom' ? '▼' : ''}</div>
        ${t?.logo ? `<img class="gc-link" src="${ctx.esc(t.logo)}" alt=""${teamIdAttr(t.id)}>` : '<span></span>'}
        <div>${p.scoringPlay ? '<b>PUNKT</b> ' : ''}${ctx.esc(p.text || p.type?.text || '')}</div>
        <div class="gc-play-score">${p.scoringPlay ? ctx.esc(`${p.awayScore}–${p.homeScore}`) : ''}</div>
      </div>`;
    }).join('');

    return `<div class="gc-chips">${chips}<span class="gc-chip-sep"></span>${filter}</div>
      <div class="gc-plays">${rows || '<div class="gc-empty">Keine Aktionen.</div>'}</div>`;
  }

  // ---------- MLB: Boxscore ----------
  const MLB_BATTING_COLS = [
    ['hits-atBats', 'H-AB'], ['runs', 'R'], ['RBIs', 'RBI'], ['homeRuns', 'HR'], ['walks', 'BB'], ['strikeouts', 'SO'], ['avg', 'AVG'],
  ];
  const MLB_PITCHING_COLS = [
    ['fullInnings.partInnings', 'IP'], ['hits', 'H'], ['runs', 'R'], ['earnedRuns', 'ER'], ['walks', 'BB'], ['strikeouts', 'K'], ['homeRuns', 'HR'], ['ERA', 'ERA'],
  ];

  function mlbBoxscore(d) {
    const { home, away } = teams(d);
    const order = [away, home];
    return order.map((t) => {
      const team = (d.boxscore.players || []).find((p) => String(p.team?.id) === t.id);
      if (!team) return '';
      const groups = (team.statistics || []).filter((g) => (g.athletes || []).length);
      return section(`<span class="gc-sec-team gc-link"${teamIdAttr(t.id)}>${t.logo ? `<img src="${ctx.esc(t.logo)}" alt="">` : ''}${ctx.esc(t.name)}</span>`, groups.map((g) => {
        const cols = g.name === 'pitching' ? MLB_PITCHING_COLS : MLB_BATTING_COLS;
        const idx = (k) => (g.keys || []).indexOf(k);
        const val = (a, k) => { const i = idx(k); return i >= 0 ? a.stats?.[i] ?? '' : ''; };
        const usable = cols.filter(([k]) => idx(k) >= 0);
        const rows = g.athletes.map((a) => `<tr>
            <td class="gc-box-name"><span class="muted">${ctx.esc(a.athlete?.position?.abbreviation || '')}</span> ${playerLink(a.athlete?.id, ctx.esc(a.athlete?.shortName || a.athlete?.displayName || ''))}</td>
            ${usable.map(([k]) => `<td>${ctx.esc(val(a, k))}</td>`).join('')}
          </tr>`).join('');
        return `<div class="gc-box-group">${GROUP_NAMES[g.name] || ctx.esc(g.name)}</div>
          <div class="table-wrap"><table class="gc-box">
            <thead><tr><th>Spieler</th>${usable.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead>
            <tbody>${rows}</tbody>
          </table></div>`;
      }).join(''));
    }).join('') + '<div class="gc-note">H-AB = Hits-At Bats · R = Runs · RBI = Runs Batted In · HR = Home Runs · BB = Walks · SO = Strikeouts · AVG = Batting Average · IP = Innings Pitched · ER = Earned Runs · K = Strikeouts · ERA = Earned Run Average</div>';
  }

  // ---------- Videos (alle Sportarten) ----------
  function videoHighlights(d) {
    const vids = (d.videos || []).filter((v) => v.headline).slice(0, 6);
    if (!vids.length) return '';
    return section('Videos', `<div class="gc-videos">${vids.map((v) => {
      const mp4 = v.links?.source?.href || v.links?.source?.HD?.href || '';
      const web = v.links?.web?.href || '';
      const dur = v.duration ? `${Math.floor(v.duration / 60)}:${String(v.duration % 60).padStart(2, '0')}` : '';
      return `<div class="gc-video">
        <div class="gc-video-frame"${mp4 ? ` data-video-src="${ctx.esc(mp4)}"` : ''}>
          ${v.thumbnail ? `<img src="${ctx.esc(v.thumbnail)}" alt="" loading="lazy">` : ''}
          ${mp4 ? '<span class="gc-video-play">▶</span>' : ''}
          ${dur ? `<span class="gc-video-dur">${dur}</span>` : ''}
        </div>
        <div class="gc-video-title">${ctx.esc(v.headline)}</div>
        ${!mp4 && web ? `<a class="gc-video-link" href="${ctx.esc(web)}" target="_blank" rel="noopener">Auf ESPN ansehen ↗</a>` : ''}
      </div>`;
    }).join('')}</div>`);
  }

  // ---------- Bericht (alle Sportarten) ----------
  function recap(d) {
    const a = d.article || {};
    const img = a.images?.find((i) => i.url)?.url;
    const paragraphs = storyParagraphs(a.story || '');
    const byline = [a.byline, a.source, a.published && new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(a.published))].filter(Boolean).join(' · ');
    return `<article class="gc-article">
      ${img ? `<img src="${ctx.esc(img)}" alt="" loading="lazy">` : ''}
      <h2>${ctx.esc(a.headline || '')}</h2>
      ${byline ? `<div class="muted">${ctx.esc(byline)}</div>` : ''}
      ${paragraphs.map((p) => `<p>${ctx.esc(p)}</p>`).join('')}
      <div class="gc-note">Originaltext von ESPN / AP (englisch).</div>
    </article>`;
  }

  // Story ist HTML von ESPN → nur reinen Text übernehmen (kein fremdes HTML einschleusen)
  function storyParagraphs(html) {
    if (!html) return [];
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,iframe,aside,figure,photo,video,inline').forEach((n) => n.remove());
    const blocks = [...doc.body.querySelectorAll('p,h2,h3,li')].map((n) => n.textContent.trim()).filter(Boolean);
    const list = blocks.length ? blocks : doc.body.textContent.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    return list.map((s) => s.replace(/^\s*—\s*/, '').replace(/--\s*—\s*/, '-- '));
  }

  // ---------- Vorschau (vor Spielbeginn, alle Sportarten) ----------
  function preview(d) {
    const { home, away, byId } = teams(d);
    const out = [];

    const ser = d.seasonseries?.[0];
    if (ser?.events?.length) {
      out.push(section(`Saisonduell${ser.summary ? ` <span class="muted">· ${ctx.esc(ser.summary)}</span>` : ''}`, ser.events.map((ev) => {
        const cs = ev.competitors || [];
        const st = ev.statusType || ev.status?.type || {};
        const fmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(ev.date));
        const txt = cs.map((c) => `${c.team?.abbreviation || ''}${st.state === 'post' ? ' ' + (c.score ?? '') : ''}`).join(st.state === 'post' ? ' – ' : ' vs ');
        return `<div class="gc-row"><span class="muted">${fmt}</span><span>${ctx.esc(txt)}</span><span class="muted">${ctx.esc(st.state === 'post' ? translate(st.shortDetail) : '')}</span></div>`;
      }).join('')));
    }

    const lastFive = d.lastFiveGames || [];
    if (lastFive.length) {
      out.push(section('Form (letzte 5)', lastFive.map((t) => {
        const ti = byId[String(t.team?.id)];
        return `<div class="gc-form"><span class="gc-form-team gc-link"${teamIdAttr(ti?.id)}>${ti?.logo ? `<img src="${ctx.esc(ti.logo)}" alt="">` : ''}${ctx.esc(t.team?.abbreviation || '')}</span>
          ${(t.events || []).map((e) => `<span class="gc-res ${ctx.esc((e.gameResult || '').toLowerCase())}" title="${ctx.esc(`${e.atVs || ''} ${e.opponent?.abbreviation || ''} ${e.score || ''}`)}">${ctx.esc(e.gameResult || '–')}</span>`).join('')}
        </div>`;
      }).join('')));
    }

    const goalies = d.goalies;
    if (goalies?.homeTeam || goalies?.awayTeam) {
      const g = (side, t) => (goalies[side]?.athletes || []).slice(0, 1).map((a) =>
        `<div class="gc-row"><span class="gc-link"${teamIdAttr(t.id)}>${ctx.esc(t.abbr)}</span><span><b>${playerLink(a.id, ctx.esc(a.displayName))}</b></span><span class="muted">${ctx.esc((a.statistics || []).filter((s) => s.abbreviation).slice(0, 3).map((s) => `${s.abbreviation} ${s.displayValue}`).join(' · '))}</span></div>`).join('');
      const html = g('awayTeam', away) + g('homeTeam', home);
      if (html) out.push(section('Voraussichtliche Torhüter', html));
    }

    const leaders = d.leaders || [];
    if (leaders.length) {
      out.push(section('Topspieler der Saison', `<div class="gc-leaders">${leaders.map((t) => {
        const ti = byId[String(t.team?.id)];
        return `<div><div class="gc-leaders-team gc-link"${teamIdAttr(ti?.id)}>${ti?.logo ? `<img src="${ctx.esc(ti.logo)}" alt="">` : ''}${ctx.esc(ti?.name || t.team?.displayName || '')}</div>
          ${(t.leaders || []).slice(0, 3).map((cat) => {
            const l = cat.leaders?.[0];
            if (!l) return '';
            return `<div class="gc-row"><span class="muted">${ctx.esc(cat.displayName)}</span><span>${playerLink(l.athlete?.id, ctx.esc(l.athlete?.displayName || ''))}</span><span><b>${ctx.esc(l.displayValue)}</b></span></div>`;
          }).join('')}</div>`;
      }).join('')}</div>`));
    }

    const inj = (d.injuries || []).filter((t) => (t.injuries || []).length);
    if (inj.length) {
      out.push(section('Ausfälle', inj.map((t) => `<div class="gc-box-group gc-link"${teamIdAttr(t.team?.id)}>${ctx.esc(t.team?.displayName || '')}</div>` +
        t.injuries.slice(0, 8).map((i) => `<div class="gc-row"><span>${playerLink(i.athlete?.id, ctx.esc(i.athlete?.displayName || ''))}</span><span class="muted">${ctx.esc(i.details?.type || i.type?.description || '')}</span><span class="muted">${ctx.esc(i.status || '')}</span></div>`).join('')
      ).join('')));
    }

    const venue = gameInfo(d);
    if (venue) out.push(venue);
    return out.join('') || '<div class="gc-empty">Für dieses Spiel liegen noch keine Vorschaudaten vor.</div>';
  }

  // ---------- Allgemeine Übersicht (andere Sportarten, bis eigene Ansichten folgen) ----------
  function genericOverview(d) {
    const { home, away } = teams(d);
    const L = boxTeam(d, away.id)?.statistics || [], R = boxTeam(d, home.id)?.statistics || [];
    const left = isSoccer() ? R : L, right = isSoccer() ? L : R;
    const lt = isSoccer() ? home : away, rt = isSoccer() ? away : home;
    const rows = left.slice(0, 16).map((s) => {
      const o = statOf(right, s.name);
      return `<div class="gc-row gc-row-3"><span>${ctx.esc(s.displayValue)}</span><span class="muted">${ctx.esc(s.label || s.name)}</span><span>${ctx.esc(o?.displayValue ?? '')}</span></div>`;
    }).join('');
    const stats = rows ? section('Teamstatistik', `<div class="gc-cmp-head"><span class="gc-link"${teamIdAttr(lt.id)}>${ctx.esc(lt.abbr)}</span><span class="gc-link"${teamIdAttr(rt.id)}>${ctx.esc(rt.abbr)}</span></div>${rows}`) : '';
    const videos = videoHighlights(d);
    const info = gameInfo(d);
    return (stats + videos + info) || '<div class="gc-empty">Ausführliche Ansicht für diese Liga folgt.</div>';
  }

  // ---------- Bausteine ----------
  function section(title, html) {
    return `<section class="gc-sec"><h3>${title}</h3>${html}</section>`;
  }

  // ---------- Interaktion im Popup ----------
  dlg.addEventListener('click', (e) => {
    if (!current?.data) return;
    const teamEl = e.target.closest('[data-team-id]');
    if (teamEl) { e.stopPropagation(); window.Profile?.openTeam(teamEl.dataset.teamId, current.league); return; }
    const playerEl = e.target.closest('[data-player-id]');
    if (playerEl) { e.stopPropagation(); window.Profile?.openPlayer(playerEl.dataset.playerId, current.league); return; }
    const tab = e.target.closest('[data-gctab]');
    if (tab) { current.tab = tab.dataset.gctab; current.period = 'all'; render(false); return; }
    const per = e.target.closest('[data-period]');
    if (per) { current.period = per.dataset.period; render(true); return; }
    const f = e.target.closest('[data-filter]');
    if (f) { current.filter = f.dataset.filter; render(true); return; }
    const vf = e.target.closest('.gc-video-frame[data-video-src]');
    if (vf) {
      const src = vf.dataset.videoSrc;
      vf.outerHTML = `<div class="gc-video-frame gc-video-playing"><video controls autoplay playsinline src="${ctx.esc(src)}"></video></div>`;
    }
  });

  window.Gamecast = {
    init(c) { ctx = c; },
    open,
    close,
  };
})();

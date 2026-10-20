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
    current = { eventId, link: opts.link, league: opts.league || ctx.league(), event: opts.event || null, data: null, tab: null, period: 'all', filter: 'key', shotTeam: 'all', flow: 'diff', boxTeam: null, preview: opts.preview };
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
  const isBasketball = () => current?.league?.sport === 'basketball';

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
      rawColor: t.color || '', rawAlt: t.alternateColor || '',
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
    if (home && away && colorDistance(home.color, away.color) < 90) {
      const alt = away.rawAlt && pickColor(away.rawAlt);
      away.color = alt && colorDistance(home.color, alt) >= 90 ? alt : '#e6edf3';
    }
    return { home, away, byId: Object.fromEntries(list.map((t) => [t.id, t])) };
  }

  // Dunkle Teamfarben sind auf dunklem Hintergrund kaum sichtbar → Primärfarbe so weit
  // aufhellen, bis sie sich abhebt (Farbton bleibt erhalten); reines Schwarz/Weiß → Alternativfarbe
  function pickColor(c1, c2) {
    const ok = (c) => c && /^[0-9a-f]{6}$/i.test(c);
    const grey = (c) => { const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16)); return Math.max(r, g, b) - Math.min(r, g, b) < 28; };
    const base = [c1, c2].find((c) => ok(c) && !grey(c)) || [c1, c2].find(ok);
    if (!base) return '#8b96a5';
    let hex = base.toLowerCase();
    for (let i = 0; i < 8 && luminance(hex) < 0.12; i++) {
      hex = [0, 2, 4].map((j) => { const v = parseInt(hex.slice(j, j + 2), 16); return Math.round(v + (255 - v) * 0.16).toString(16).padStart(2, '0'); }).join('');
    }
    return `#${hex}`;
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
    if (isBasketball()) {
      const n = p?.number;
      const reg = current?.data?.format?.regulation?.periods || 4;
      if (!n) return reg === 2 ? 'Halbzeit' : 'Viertel';
      if (n <= reg) return reg === 2 ? `${n}. Halbzeit` : `${n}. Viertel`;
      return n - reg === 1 ? 'Verlängerung' : `${n - reg}. Verlängerung`;
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
  const logoImg = (id, url, cls, extra) => (url ? window.LogoPref.img(id, url, cls, extra) : '');

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
      if (isSoccer() && (d.rosters || []).some((r) => (r.roster || []).length)) t.push({ id: 'lineups', label: 'Aufstellungen' });
    } else if (isNHL() || isMLB() || isFootball()) {
      t.push({ id: 'gamecast', label: 'Gamecast' });
      const hasPbp = isFootball() ? (d.drives?.previous || []).length : (d.plays || []).length;
      if (hasPbp) t.push({ id: 'pbp', label: isFootball() ? 'Drives' : 'Play-by-Play' });
      if ((d.boxscore?.players || []).length) t.push({ id: 'box', label: 'Boxscore' });
    } else if (isBasketball()) {
      t.push({ id: 'gamecast', label: 'Gamecast' });
      if ((d.plays || []).length) t.push({ id: 'pbp', label: 'Play-by-Play' });
      if ((d.boxscore?.players || []).length) t.push({ id: 'box', label: 'Boxscore' });
    } else if (isSoccer()) {
      t.push({ id: 'gamecast', label: 'Spielverlauf' });
      if ((d.rosters || []).length) t.push({ id: 'lineups', label: 'Aufstellungen' });
      if ((d.commentary || []).length) t.push({ id: 'ticker', label: 'Liveticker' });
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
        ${logoImg(t.id, t.logo)}
        <div class="gc-team-name">${t.rank ? `#${t.rank} ` : ''}${ctx.esc(isSoccer() ? t.short : t.name)}</div>
        <div class="gc-team-rec">${ctx.esc(t.record)}</div>
      </div>`;

    const series = c.series?.summary ? `<div class="gc-series">${ctx.esc(c.series.summary)}</div>` : '';

    const [lc, rc] = window.TeamColor.pair({ color: left.rawColor, alt: left.rawAlt }, { color: right.rawColor, alt: right.rawAlt });
    $head.style.setProperty('--c-home', lc || '#2a2f38');
    $head.style.setProperty('--c-away', rc || '#2a2f38');
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
      case 'gamecast': $body.innerHTML = isMLB() ? mlbGamecast(d) : isFootball() ? footballGamecast(d) : isSoccer() ? soccerGamecast(d) : isBasketball() ? bbGamecast(d) : nhlGamecast(d); break;
      case 'pbp': $body.innerHTML = isMLB() ? mlbPlayByPlay(d) : isFootball() ? footballDrives(d) : isBasketball() ? bbPlayByPlay(d) : nhlPlayByPlay(d); break;
      case 'box': $body.innerHTML = boxSwitch(d) + (isMLB() ? mlbBoxscore(d) : isFootball() ? footballBoxscore(d) : isBasketball() ? bbBoxscore(d) : nhlBoxscore(d)); break;
      case 'lineups': $body.innerHTML = soccerLineups(d); break;
      case 'ticker': $body.innerHTML = soccerTicker(d); break;
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
    return [lastPlays(d), stars(d), leaderCards(d), flowChart(d), scoringSummary(d), shotChart(d), teamStatsCompare(d, NHL_TEAM_STATS), penaltySummary(d), videoHighlights(d), oddsSection(d), miniStandings(d), gameInfo(d)]
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
        <div class="gc-star-img gc-link" data-player-id="${ctx.esc(a.id)}">${a.headshot?.href ? `<img src="${ctx.esc(a.headshot.href)}" alt="" loading="lazy">` : ''}${t?.logo ? logoImg(t.id, t.logo, 'gc-star-logo gc-link', teamIdAttr(t.id)) : ''}</div>
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
          <div class="gc-goal-img gc-link" data-player-id="${ctx.esc(scorer?.athlete?.id)}">${head ? `<img src="${ctx.esc(head)}" alt="" loading="lazy">` : ''}${t?.logo ? logoImg(t.id, t.logo, 'gc-goal-logo gc-link', teamIdAttr(t.id)) : ''}</div>
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
          ${t?.logo ? logoImg(t.id, t.logo, 'gc-link', teamIdAttr(t.id)) : '<span></span>'}
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
        <div class="gc-rink-team left gc-link"${teamIdAttr(away.id)}>${logoImg(away.id, away.logo)}${ctx.esc(away.abbr)} →</div>
        <svg class="gc-rink" viewBox="-101 -43.5 202 87" role="img" aria-label="Schusskarte">
          ${RINK}
          ${dots}
        </svg>
        <div class="gc-rink-team right gc-link"${teamIdAttr(home.id)}>← ${ctx.esc(home.abbr)}${logoImg(home.id, home.logo)}</div>
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
    const tm = teams(d);
    // Reihenfolge wie im Kopfbereich: Fußball Heim links, US-Sport Gast links
    const away = isSoccer() ? tm.home : tm.away;
    const home = isSoccer() ? tm.away : tm.home;
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
        if (key === 'possessionPct' && !/%$/.test(lv)) { lv = `${a.displayValue}%`; rv = `${b.displayValue}%`; }
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
        ${t?.logo ? logoImg(t.id, t.logo, 'gc-link', teamIdAttr(t.id)) : '<span></span>'}
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
    const order = [boxSel(d)];
    return order.map((t) => {
      const team = (d.boxscore.players || []).find((p) => String(p.team?.id) === t.id);
      if (!team) return '';
      const groups = (team.statistics || []).filter((g) => (g.athletes || []).length);
      return section(`<span class="gc-sec-team gc-link"${teamIdAttr(t.id)}>${logoImg(t.id, t.logo)}${ctx.esc(t.name)}</span>`, groups.map((g) => {
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
    return [lastPlays(d), leaderCards(d, ['passingYards', 'rushingYards', 'receivingYards']) || footballLeaders(d), flowChart(d), footballScoringSummary(d), teamStatsCompare(d, FOOTBALL_TEAM_STATS), videoHighlights(d), oddsSection(d), miniStandings(d), gameInfo(d)]
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
          <div class="gc-goal-img">${t?.logo ? logoImg(t.id, t.logo, 'gc-goal-logo gc-link', teamIdAttr(t.id)) : ''}</div>
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
      return `<div><div class="gc-leaders-team gc-link"${teamIdAttr(ti?.id)}>${logoImg(ti?.id, ti?.logo)}${ctx.esc(ti?.name || '')}</div>
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
          ${t?.logo ? logoImg(t.id, t.logo, 'gc-link', teamIdAttr(t.id)) : '<span></span>'}
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
    const order = [boxSel(d)];
    return order.map((t) => {
      const team = (d.boxscore.players || []).find((p) => String(p.team?.id) === t.id);
      if (!team) return '';
      const groups = (team.statistics || []).filter((g) => FOOTBALL_COLS[g.name] && (g.athletes || []).length);
      return section(`<span class="gc-sec-team gc-link"${teamIdAttr(t.id)}>${logoImg(t.id, t.logo)}${ctx.esc(t.name)}</span>`, groups.map((g) => {
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
    const timeline = soccerTimeline(d);
    return [leaderCards(d), flowChart(d), timeline || soccerScoringSummary(d), teamStatsCompare(d, SOCCER_TEAM_STATS), videoHighlights(d), oddsSection(d), miniStandings(d), gameInfo(d)]
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
        <div class="gc-goal-img">${t?.logo ? logoImg(t.id, t.logo, 'gc-goal-logo gc-link', teamIdAttr(t.id)) : ''}</div>
        <div class="gc-goal-txt">
          <div><b>${playerLink(p.athlete?.id, ctx.esc(p.athlete?.displayName || p.athlete?.fullName || ''))}</b>${goals > 1 ? ` <span class="muted">×${goals}</span>` : ''}${og ? ' <span class="muted">(Eigentor)</span>' : ''}</div>
        </div>
      </div>`).join(''));
  }

  // ---------- Fußball: Spielverlauf (keyEvents mit Minute) ----------
  const KE_ICON = { goal: '⚽', 'own-goal': '⚽', penalty: '⚽', yellow: '🟨', red: '🟥', sub: '⇄' };
  function keKind(e) {
    const t = `${e.type?.type || ''} ${e.type?.text || ''}`.toLowerCase();
    if (/own/.test(t) && /goal/.test(t)) return 'own-goal';
    if (e.scoringPlay || /goal|penalty---scored/.test(t)) return /penalty/.test(t) ? 'penalty' : 'goal';
    if (/second yellow|red/.test(t)) return 'red';
    if (/yellow/.test(t)) return 'yellow';
    if (/substitution/.test(t)) return 'sub';
    if (/halftime/.test(t)) return 'ht';
    if (/end-regular-time|full.?time|end of game|end-extra-time/.test(t)) return 'ft';
    return null;
  }

  function soccerTimeline(d) {
    const evs = (d.keyEvents || []).map((e) => ({ e, k: keKind(e) })).filter((x) => x.k);
    if (!evs.some((x) => !['ht', 'ft'].includes(x.k))) return '';
    const { home, away } = teams(d);
    let hs = 0, as = 0;
    const rows = evs.map(({ e, k }) => {
      const min = ctx.esc(e.clock?.displayValue || '');
      if (k === 'ht' || k === 'ft') return `<div class="tl-mark"><span>${k === 'ht' ? 'Halbzeit' : 'Abpfiff'} · ${hs}:${as}</span></div>`;
      const isHome = String(e.team?.id) === home.id;
      const p = e.participants || [];
      const a1 = p[0]?.athlete, a2 = p[1]?.athlete;
      let body = '';
      if (k === 'goal' || k === 'penalty' || k === 'own-goal') {
        if (isHome) hs++; else as++;
        body = `<b>${playerLink(a1?.id, ctx.esc(a1?.displayName || 'Tor'))}</b>${k === 'penalty' ? ' <span class="gc-badge pp">Elfmeter</span>' : ''}${k === 'own-goal' ? ' <span class="gc-badge en">Eigentor</span>' : ''}
          ${a2 && k === 'goal' ? `<div class="muted">Vorlage: ${playerLink(a2.id, ctx.esc(a2.displayName))}</div>` : ''}<div class="tl-score">${hs}:${as}</div>`;
      } else if (k === 'sub') {
        body = `<span class="tl-in">▲ ${playerLink(a1?.id, ctx.esc(a1?.displayName || ''))}</span><span class="tl-out">▼ ${playerLink(a2?.id, ctx.esc(a2?.displayName || ''))}</span>`;
      } else {
        body = `<b>${playerLink(a1?.id, ctx.esc(a1?.displayName || ''))}</b>${k === 'red' && /yellow/i.test(e.type?.text || '') ? ' <span class="muted">(Gelb-Rot)</span>' : ''}`;
      }
      const cell = `<div class="tl-ev tl-${k}"><span class="tl-icon">${KE_ICON[k]}</span><div class="tl-txt">${body}</div></div>`;
      return `<div class="tl-row${k === 'goal' || k === 'penalty' || k === 'own-goal' ? ' is-goal' : ''}">
        <div class="tl-side home">${isHome ? cell : ''}</div><div class="tl-min">${min}</div><div class="tl-side away">${isHome ? '' : cell}</div>
      </div>`;
    }).join('');
    return section('Ereignisse', `<div class="tl" style="--c-l:${home.color};--c-r:${away.color}">
      <div class="tl-head"><span class="gc-link"${teamIdAttr(home.id)}>${logoImg(home.id, home.logo)}${ctx.esc(home.short)}</span><span class="gc-link"${teamIdAttr(away.id)}>${ctx.esc(away.short)}${logoImg(away.id, away.logo)}</span></div>
      ${rows}</div>`);
  }

  // Liveticker (ESPN-Kommentar, englisch), neueste Einträge oben
  function soccerTicker(d) {
    const list = (d.commentary || []).filter((c) => c.text).slice().reverse();
    if (!list.length) return '<div class="gc-empty">Kein Liveticker verfügbar.</div>';
    return `<div class="ticker">${list.map((c) => {
      const t = c.text || '';
      const cls = /^goal!/i.test(t) ? ' goal' : /yellow card|red card/i.test(t) ? ' card' : /^substitution/i.test(t) ? ' sub' : '';
      return `<div class="tk-row${cls}"><span class="tk-min">${ctx.esc(c.time?.displayValue || '')}</span><span>${ctx.esc(t)}</span></div>`;
    }).join('')}</div><div class="gc-note">Kommentar von ESPN (englisch).</div>`;
  }

  // ---------- Fußball: Aufstellung als Spielfeld (wie bei ESPN) ----------
  // ESPN liefert je Spieler eine Positionskürzel (z. B. RB, CD-L, DM, AM-R, F) und je Team die
  // Formation (z. B. "4-2-3-1"). Spieler werden nach Tiefe sortiert, in Formationsreihen
  // aufgeteilt und innerhalb einer Reihe von links nach rechts angeordnet.
  function posDepth(abbr) {
    const a = String(abbr || '').toUpperCase();
    if (a === 'G' || a === 'GK') return 0;
    if (/^(SW|RB|LB|CD|CB|D|RWB|LWB)/.test(a)) return /WB/.test(a) ? 1.5 : 1;
    if (/^DM/.test(a)) return 2;
    if (/^(CM|M|LM|RM)/.test(a)) return 3;
    if (/^(AM|RW|LW)/.test(a)) return 4;
    if (/^(F|CF|ST|S|RF|LF)/.test(a)) return 5;
    return 3;
  }
  function posSide(abbr) {
    const a = String(abbr || '').toUpperCase();
    if (/-L$/.test(a)) return -1;
    if (/-R$/.test(a)) return 1;
    if (/^L/.test(a)) return -2;
    if (/^R/.test(a)) return 2;
    return 0;
  }

  function lineupLines(r) {
    const starters = (r.roster || []).filter((p) => p.starter);
    if (starters.length < 7) return null;
    const sorted = starters.slice().sort((a, b) => posDepth(a.position?.abbreviation) - posDepth(b.position?.abbreviation)
      || (+a.formationPlace || 0) - (+b.formationPlace || 0));
    const gk = sorted.find((p) => posDepth(p.position?.abbreviation) === 0) || sorted[0];
    const field = sorted.filter((p) => p !== gk);
    let counts = String(r.formation || '').split('-').map(Number).filter((n) => n > 0);
    if (counts.reduce((a, b) => a + b, 0) !== field.length) {
      // ohne (passende) Formation: nach Positionstiefe gruppieren
      const m = new Map();
      field.forEach((p) => { const k = Math.round(posDepth(p.position?.abbreviation)); m.set(k, (m.get(k) || 0) + 1); });
      counts = [...m.keys()].sort().map((k) => m.get(k));
    }
    const lines = [[gk]];
    let i = 0;
    counts.forEach((n) => {
      lines.push(field.slice(i, i + n).sort((a, b) => posSide(a.position?.abbreviation) - posSide(b.position?.abbreviation) || (+a.formationPlace || 0) - (+b.formationPlace || 0)));
      i += n;
    });
    return lines;
  }

  function lineupEvents(d) {
    const out = {}; // athleteId → { goals, og, yc, rc, out, in }
    const get = (id) => (out[id] = out[id] || { goals: 0, og: 0, yc: 0, rc: 0 });
    (d.keyEvents || []).forEach((e) => {
      const k = keKind(e);
      const p = e.participants || [];
      const min = e.clock?.displayValue || '';
      if (!k || !p[0]?.athlete?.id) return;
      if (k === 'goal' || k === 'penalty') get(p[0].athlete.id).goals++;
      if (k === 'own-goal') get(p[0].athlete.id).og++;
      if (k === 'yellow') get(p[0].athlete.id).yc++;
      if (k === 'red') get(p[0].athlete.id).rc++;
      if (k === 'sub') { get(p[0].athlete.id).in = min; if (p[1]?.athlete?.id) get(p[1].athlete.id).out = min; }
    });
    return out;
  }

  function soccerLineups(d) {
    const rosters = d.rosters || [];
    if (!rosters.length) return '<div class="gc-empty">Keine Aufstellung verfügbar.</div>';
    const { byId, home, away } = teams(d);
    const evs = lineupEvents(d);
    const hasKe = (d.keyEvents || []).length > 0;
    const R = { home: rosters.find((r) => r.homeAway === 'home') || rosters[0], away: rosters.find((r) => r.homeAway === 'away') || rosters[1] };

    const badgesFor = (p) => {
      const id = p.athlete?.id;
      const e = evs[id] || {};
      const goals = hasKe ? e.goals : +rosterStat(p.stats, 'totalGoals') || 0;
      const yc = hasKe ? e.yc : +rosterStat(p.stats, 'yellowCards') || 0;
      const rc = hasKe ? e.rc : +rosterStat(p.stats, 'redCards') || 0;
      const b = [];
      if (goals) b.push(`<i class="pt-b goal">⚽${goals > 1 ? goals : ''}</i>`);
      if (e.og) b.push('<i class="pt-b og">ET</i>');
      if (yc) b.push('<i class="pt-b yc"></i>');
      if (rc) b.push('<i class="pt-b rc"></i>');
      return { html: b.join(''), out: !!(e.out || p.subbedOut), outMin: e.out ? String(e.out).replace(/'$/, '') : '', in: e.in };
    };
    const lastName = (a) => {
      const n = a?.lastName || a?.shortName?.replace(/^[A-ZÀ-Ž]\.\s*/, '') || a?.displayName || '';
      return n.length > 14 ? `${n.slice(0, 13)}…` : n;
    };

    const tokens = (side) => {
      const r = R[side];
      const t = side === 'home' ? home : away;
      const lines = r && lineupLines(r);
      if (!lines) return '';
      const light = luminance(t.color.slice(1)) > 0.42;
      const L = lines.length - 1;
      return lines.map((line, li) => line.map((p, j) => {
        const along = li === 0 ? 0.045 : 0.14 + (L > 1 ? (li - 1) * (0.27 / (L - 1)) : 0.14);
        const across = 0.1 + 0.8 * ((j + 0.5) / line.length);
        const x = side === 'home' ? along : 1 - along;
        const y = side === 'home' ? across : 1 - across;
        const bd = badgesFor(p);
        return `<button type="button" class="pt ${side}${li === 0 ? ' gk' : ''}${light ? ' light' : ''}" style="--x:${x.toFixed(3)};--y:${y.toFixed(3)};--tc:${t.color}" data-player-id="${ctx.esc(p.athlete?.id || '')}" title="${ctx.esc(`${p.athlete?.displayName || ''} · ${p.position?.displayName || ''}`)}">
          <span class="pt-num">${ctx.esc(p.jersey || '')}</span>
          <span class="pt-name">${ctx.esc(lastName(p.athlete))}</span>
          ${bd.html || bd.out ? `<span class="pt-badges">${bd.html}${bd.out ? `<i class="pt-b out">▼${ctx.esc(bd.outMin)}</i>` : ''}</span>` : ''}
        </button>`;
      }).join('')).join('');
    };

    const fm = (side) => {
      const t = side === 'home' ? home : away;
      return `<div class="pitch-team ${side}"><span class="gc-link"${teamIdAttr(t.id)}>${logoImg(t.id, t.logo)}${ctx.esc(t.short)}</span><b>${ctx.esc(R[side]?.formation || '')}</b></div>`;
    };

    const pitch = `
      <div class="pitch-wrap">
        <div class="pitch-heads">${fm('home')}${fm('away')}</div>
        ${fm('away')}
        <div class="pitch">
          <div class="pitch-lines" aria-hidden="true"><i class="pl-half"></i><i class="pl-circle"></i><i class="pl-box a"></i><i class="pl-box b"></i><i class="pl-six a"></i><i class="pl-six b"></i><i class="pl-spot"></i></div>
          ${tokens('home')}${tokens('away')}
        </div>
        ${fm('home')}
      </div>`;

    const bench = (side) => {
      const r = R[side];
      const t = byId[String(r?.team?.id)] || (side === 'home' ? home : away);
      const list = (r?.roster || []).filter((p) => !p.starter);
      if (!list.length) return '';
      list.sort((a, b) => (b.subbedIn ? 1 : 0) - (a.subbedIn ? 1 : 0));
      return `<div class="bench"><div class="bench-head gc-link"${teamIdAttr(t.id)}>${logoImg(t.id, t.logo)}${ctx.esc(t.short)} · Bank</div>
        ${list.map((p) => {
          const e = evs[p.athlete?.id] || {};
          const forName = p.subbedInFor?.athlete?.displayName || p.subbedInFor?.athlete?.shortName;
          const bd = badgesFor(p);
          return `<div class="bench-row${p.subbedIn ? ' in' : ''}">
            <span class="bench-num" style="--tc:${t.color}">${ctx.esc(p.jersey || '')}</span>
            <span class="bench-name">${playerLink(p.athlete?.id, ctx.esc(p.athlete?.displayName || ''))}
              ${p.subbedIn ? `<small>▲ ${ctx.esc(e.in || '')}${forName ? ` für ${ctx.esc(forName)}` : ''}</small>` : ''}</span>
            <span class="bench-b">${bd.html}</span>
          </div>`;
        }).join('')}</div>`;
    };

    const hasPitch = lineupLines(R.home || {}) || lineupLines(R.away || {});
    return (hasPitch ? section('Aufstellung', pitch) : '')
      + `<div class="bench-grid">${bench('home')}${bench('away')}</div>`
      + (hasPitch ? '<div class="gc-note">Positionen nach ESPN-Formation · ⚽ Tor · ET Eigentor · ▼ ausgewechselt (Minute) · ▲ eingewechselt · Spieler antippen für Profil</div>' : '');
  }

  // ---------- Tabelle im Spiel-Popup (Division/Gruppe beider Teams) ----------
  function miniStandings(d) {
    const groups = (d.standings?.groups || []).filter((g) => g.standings?.entries?.length);
    if (!groups.length) return '';
    const ids = new Set((comp(d).competitors || []).map((c) => String(c.team?.id ?? c.id)));
    return groups.map((g) => {
      const entries = g.standings.entries;
      const cols = (entries[0].stats || []).filter((s) => s.abbreviation || s.shortDisplayName).slice(0, 6);
      const rows = entries.map((e, i) => {
        const logo = (e.logo || []).find((l) => !(l.rel || []).includes('scoreboard'))?.href || e.logo?.[0]?.href || '';
        return `<tr class="${ids.has(String(e.id)) ? 'fav' : ''}"><td>${i + 1}</td>
          <td class="team-cell"><span class="team-link gc-link"${teamIdAttr(e.id)}>${logo ? logoImg(e.id, logo) : ''}<span>${ctx.esc(e.team || '')}</span></span></td>
          ${cols.map((c) => `<td>${ctx.esc((e.stats || []).find((s) => s.name === c.name)?.displayValue ?? '')}</td>`).join('')}</tr>`;
      }).join('');
      return section(ctx.esc(g.header || d.standings.header || 'Tabelle'), `<div class="table-wrap"><table class="gc-mini">
        <thead><tr><th>#</th><th>Team</th>${cols.map((c) => `<th>${ctx.esc(c.abbreviation || c.shortDisplayName)}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody></table></div>`);
    }).join('');
  }

  // ---------- Quoten & ESPN-Prognose ----------
  function oddsSection(d) {
    const pc = (d.pickcenter || [])[0];
    const pred = d.predictor;
    const rows = [];
    const { home, away } = teams(d);
    if (pred?.homeTeam?.gameProjection) {
      const hp = parseFloat(pred.homeTeam.gameProjection), ap = parseFloat(pred.awayTeam?.gameProjection) || (100 - hp);
      rows.push(`<div class="gc-cmp"><div class="gc-cmp-top"><span>${ap.toFixed(1)} %</span><span class="muted">ESPN-Siegchance</span><span>${hp.toFixed(1)} %</span></div>
        <div class="gc-cmp-bar"><i style="width:${ap}%;background:${away.color}"></i><i style="width:${100 - ap}%;background:${home.color}"></i></div></div>`);
    }
    if (pc) {
      const info = [];
      if (pc.details) info.push(['Linie', pc.details]);
      if (pc.overUnder != null) info.push(['Over/Under', pc.overUnder]);
      const ml = (o) => (o?.moneyLine != null ? (o.moneyLine > 0 ? `+${o.moneyLine}` : o.moneyLine) : null);
      if (ml(pc.awayTeamOdds) != null && ml(pc.homeTeamOdds) != null) info.push(['Moneyline', `${away.abbr} ${ml(pc.awayTeamOdds)} · ${home.abbr} ${ml(pc.homeTeamOdds)}`]);
      if (pc.drawOdds?.moneyLine != null) info.push(['Remis', pc.drawOdds.moneyLine > 0 ? `+${pc.drawOdds.moneyLine}` : pc.drawOdds.moneyLine]);
      if (info.length) rows.push(`<dl class="gc-info">${info.map(([k, v]) => `<dt>${k}</dt><dd>${ctx.esc(v)}</dd>`).join('')}</dl><div class="gc-note">Quoten: ${ctx.esc(pc.provider?.name || 'Buchmacher')} (US-Markt), nur zur Information.</div>`);
    }
    return rows.length ? section('Prognose & Quoten', rows.join('')) : '';
  }

  // ---------- Basketball (NBA/NCAAM): Gamecast ----------
  const BB_TEAM_STATS = [
    ['fieldGoalsMade-fieldGoalsAttempted', 'Würfe (FG)'],
    ['fieldGoalPct', 'Wurfquote', '%'],
    ['threePointFieldGoalsMade-threePointFieldGoalsAttempted', 'Dreier'],
    ['threePointFieldGoalPct', 'Dreierquote', '%'],
    ['freeThrowsMade-freeThrowsAttempted', 'Freiwürfe'],
    ['freeThrowPct', 'Freiwurfquote', '%'],
    ['totalRebounds', 'Rebounds'],
    ['offensiveRebounds', 'Offensiv-Rebounds'],
    ['assists', 'Assists'],
    ['steals', 'Steals'],
    ['blocks', 'Blocks'],
    ['turnovers', 'Ballverluste'],
    ['fastBreakPoints', 'Fastbreak-Punkte'],
    ['pointsInPaint', 'Punkte in der Zone'],
    ['fouls', 'Fouls'],
    ['largestLead', 'Größte Führung'],
  ];

  function bbGamecast(d) {
    return [lastPlays(d), leaderCards(d), flowChart(d), bbShotChart(d), teamStatsCompare(d, BB_TEAM_STATS), videoHighlights(d), oddsSection(d), miniStandings(d), gameInfo(d)]
      .filter(Boolean).join('');
  }

  // ---------- Gemeinsame Gamecast-Bausteine (alle Sportarten) ----------
  // Reihenfolge wie im Kopfbereich: Fußball Heim links, US-Sport Gast links
  function sides(d) {
    const tm = teams(d);
    return isSoccer() ? { left: tm.home, right: tm.away, ...tm } : { left: tm.away, right: tm.home, ...tm };
  }

  // Alle Spielzüge mit Spielstand (Football: aus den Drives)
  function allPlays(d) {
    if (isFootball()) return [...(d.drives?.previous || []), ...(d.drives?.current ? [d.drives.current] : [])].flatMap((dr) => dr.plays || []);
    return d.plays || [];
  }

  function lastPlays(d) {
    if (gameState(d) !== 'in') return '';
    const plays = allPlays(d).filter((p) => p.text).slice(-6).reverse();
    if (!plays.length) return '';
    const { byId } = teams(d);
    return section('Letzte Aktionen', plays.map((p) => {
      const t = byId[String(p.team?.id ?? p.start?.team?.id)];
      const when = isMLB() ? (p.period?.type === 'Top' ? '▲' : '▼') + (p.period?.number || '') : p.clock?.displayValue || '';
      return `<div class="gc-play${p.scoringPlay ? ' goal' : ''}"><div class="gc-time">${ctx.esc(when)}</div>${t?.logo ? logoImg(t.id, t.logo) : '<span></span>'}<div>${ctx.esc(p.text || '')}</div><div class="gc-play-score">${p.scoringPlay && p.homeScore != null ? ctx.esc(`${p.awayScore}–${p.homeScore}`) : ''}</div></div>`;
    }).join(''));
  }

  // Topspieler als Karten mit Foto und großer Kennzahl (ESPN "leaders" je Team)
  const LEADER_DE = {
    points: 'Punkte', rebounds: 'Rebounds', assists: 'Assists',
    passingYards: 'Passing', rushingYards: 'Rushing', receivingYards: 'Receiving',
    goals: 'Tore', goalAssists: 'Vorlagen', totalShots: 'Schüsse', shotsOnTarget: 'Torschüsse', saves: 'Paraden',
    points_hockey: 'Punkte', plusMinus: '+/-', avg: 'Schnitt', homeRuns: 'Home Runs', RBIs: 'RBI', ERA: 'ERA', strikeouts: 'Strikeouts',
  };
  function leaderValue(l, cat) {
    if (l.mainStat?.value != null) return [l.mainStat.value, l.mainStat.label || ''];
    const dv = String(l.displayValue ?? '');
    const m = /(-?\d+(?:\.\d+)?)\s*(YDS|PTS|REB|AST|G|A|SV)\b/i.exec(dv);
    if (m) return [m[1], m[2].toUpperCase()];
    if (/^-?\d+(\.\d+)?%?$/.test(dv)) return [dv, cat.shortDisplayName || cat.abbreviation || ''];
    return [null, ''];
  }
  function leaderCards(d, wanted) {
    const tl = (d.leaders || []).filter((t) => (t.leaders || []).length);
    if (!tl.length) return '';
    const { left, right, byId } = sides(d);
    const ordered = [left, right].map((t) => tl.find((x) => String(x.team?.id) === t.id)).filter(Boolean);
    if (!ordered.length) return '';
    const html = ordered.map((t) => {
      const ti = byId[String(t.team?.id)] || {};
      const cats = (t.leaders || []).filter((c) => !wanted || wanted.includes(c.name)).slice(0, 3);
      const rows = cats.map((cat) => {
        const l = cat.leaders?.[0];
        if (!l?.athlete) return '';
        const a = l.athlete;
        const [val, lab] = leaderValue(l, cat);
        const sub = l.summary || (val == null ? l.displayValue : '') || '';
        return `<div class="bb-lead gc-link" data-player-id="${ctx.esc(a.id)}">
          ${a.headshot?.href ? `<img src="${ctx.esc(a.headshot.href)}" alt="" loading="lazy">` : '<span class="bb-ph"></span>'}
          <div class="bb-lead-txt"><small>${ctx.esc(LEADER_DE[cat.name] || cat.displayName || '')}</small><b>${ctx.esc(a.shortName || a.displayName || '')}</b><span class="muted">${ctx.esc(sub)}</span></div>
          ${val != null ? `<div class="bb-lead-val">${ctx.esc(val)}<small>${ctx.esc(lab)}</small></div>` : '<span></span>'}
        </div>`;
      }).join('');
      if (!rows.trim()) return '';
      return `<div class="bb-lcol" style="--tc:${ti.color}">
        <div class="gc-leaders-team gc-link"${teamIdAttr(ti.id)}>${logoImg(ti.id, ti.logo)}${ctx.esc(ti.name || '')}</div>${rows}</div>`;
    }).join('');
    return html.trim() ? section(gameState(d) === 'pre' ? 'Topspieler der Saison' : 'Topspieler', `<div class="bb-leaders">${html}</div>`) : '';
  }

  // Zeitachse je Sportart: Sekunden seit Spielbeginn (Uhr läuft rückwärts) bzw. Spielzug-Index (MLB)
  function clockSec(s) {
    const str = String(s || '0');
    if (str.includes(':')) { const [m, sec] = str.split(':'); return (+m || 0) * 60 + (parseFloat(sec) || 0); }
    return parseFloat(str) || 0;
  }
  function timing(d, plays) {
    const reg = d.format?.regulation?.periods || (isNHL() ? 3 : 4);
    const len = isBasketball() ? (reg === 2 ? 1200 : 720) : isNHL() ? 1200 : 900;
    const maxP = Math.max(reg, ...plays.map((p) => p.period?.number || 0));
    const otLen = isBasketball() ? 300 : isNHL() ? (maxP > reg + 1 ? 1200 : 300) : 600;
    const startOf = (n) => (n <= reg ? (n - 1) * len : reg * len + (n - reg - 1) * otLen);
    const lenOf = (n) => (n <= reg ? len : otLen);
    const elapsed = (p) => { const n = p.period?.number || 1; return startOf(n) + Math.max(0, lenOf(n) - clockSec(p.clock?.displayValue)); };
    return { reg, maxP, startOf, lenOf, elapsed, total: startOf(maxP) + lenOf(maxP) };
  }

  // Liefert { pts: [[t, Heim−Gast]], wp: [[t, Heim-Siegchance−50]] | null, total, seps, labels }
  function flowSeries(d) {
    if (isSoccer()) {
      const mins = (s) => { const m = String(s || '').match(/(\d+)'(?:\+(\d+))?/); return m ? Math.min(+m[1], 120) + (m[2] ? Math.min(+m[2], 9) * 0.1 : 0) : null; };
      const { home } = teams(d);
      let hs = 0, as = 0;
      const pts = [[0, 0]];
      let maxMin = 90;
      (d.keyEvents || []).forEach((e) => {
        const k = keKind(e); const t = mins(e.clock?.displayValue);
        if (t != null && t >= 91) maxMin = 120; // Verlängerung (Nachspielzeit ist 90'+x = 90,x)
        if (!['goal', 'penalty', 'own-goal'].includes(k) || t == null) return;
        if (String(e.team?.id) === home.id) hs++; else as++;
        pts.push([t, hs - as]);
      });
      const st = comp(d).status || {};
      const now = gameState(d) === 'post' ? maxMin : gameState(d) === 'in' ? (mins(st.displayClock || st.type?.shortDetail) ?? pts[pts.length - 1][0]) : 0;
      if (now) pts.push([now, hs - as]);
      const seps = maxMin > 90 ? [45, 90, 105] : [45];
      const labels = maxMin > 90 ? [[22.5, '1. HZ'], [67.5, '2. HZ'], [97.5, 'V1'], [112.5, 'V2']] : [[22.5, '1. Halbzeit'], [67.5, '2. Halbzeit']];
      return { pts, wp: null, total: maxMin, seps, labels, unit: 'Tore' };
    }
    const plays = allPlays(d).filter((p) => p.period?.number && !/^SO$|shootout/i.test(p.period?.displayValue || p.period?.type || ''));
    if (plays.length < 5) return null;
    let at, total, seps = [], labels = [];
    if (isMLB()) {
      at = new Map(plays.map((p, i) => [p, i]));
      total = plays.length;
      const firsts = new Map();
      plays.forEach((p, i) => { if (!firsts.has(p.period.number)) firsts.set(p.period.number, i); });
      const inn = [...firsts.entries()];
      seps = inn.slice(1).map(([, i]) => i);
      labels = inn.map(([n, i], k) => [(i + (inn[k + 1]?.[1] ?? total)) / 2, String(n)]);
    } else {
      const T = timing(d, plays);
      at = new Map(plays.map((p) => [p, T.elapsed(p)]));
      total = T.total;
      seps = Array.from({ length: T.maxP - 1 }, (_, i) => T.startOf(i + 2));
      labels = periodLabels(d, T.maxP).map((l, i) => [T.startOf(i + 1) + T.lenOf(i + 1) / 2, l]);
    }
    const pts = [[0, 0]];
    plays.forEach((p) => { if (p.homeScore != null && p.awayScore != null) pts.push([at.get(p), p.homeScore - p.awayScore]); });
    const byId = new Map(plays.map((p) => [String(p.id), p]));
    const wp = (d.winprobability || []).map((w) => { const p = byId.get(String(w.playId)); return p ? [at.get(p), (w.homeWinPercentage - 0.5) * 100] : null; }).filter(Boolean);
    return { pts, wp: wp.length > 3 ? wp : null, total, seps, labels, unit: isBasketball() ? 'Punkte' : isNHL() ? 'Tore' : isMLB() ? 'Runs' : 'Punkte' };
  }

  function flowChart(d) {
    const S = flowSeries(d);
    if (!S || S.pts.length < 2 || !S.total) return '';
    const { home, away } = teams(d);
    const W = 600, H = 170, M = H / 2;
    const mode = current.flow === 'wp' && S.wp ? 'wp' : 'diff';
    const pts = mode === 'wp' ? S.wp : S.pts;
    const maxAbs = mode === 'wp' ? 50 : Math.max(isBasketball() || isFootball() ? 5 : 2, ...pts.map(([, v]) => Math.abs(v)));
    const sx = (t) => Math.min(W, (t / S.total) * W);
    const sy = (v) => M - (v / maxAbs) * (M - 10);
    let path = `M0 ${sy(pts[0][1]).toFixed(1)}`;
    pts.forEach(([t, v], i) => {
      if (mode === 'diff') path += `${i ? `H${sx(t).toFixed(1)}` : ''}V${sy(v).toFixed(1)}`;
      else path += `L${sx(t).toFixed(1)} ${sy(v).toFixed(1)}`;
    });
    const lastX = sx(pts[pts.length - 1][0]).toFixed(1);
    const area = `${path}V${M}H0Z`;
    const seps = S.seps.map((t) => `<line x1="${sx(t)}" x2="${sx(t)}" y1="0" y2="${H}" class="fl-sep"/>`).join('');
    const labels = S.labels.map(([t, l]) => `<text x="${sx(t)}" y="${H - 4}" class="fl-lab">${ctx.esc(l)}</text>`).join('');
    const grid = mode === 'diff'
      ? [maxAbs, -maxAbs].map((v) => `<text x="4" y="${sy(v) + (v > 0 ? 10 : -3)}" class="fl-axis">${v > 0 ? '+' : '−'}${Math.abs(v)}</text>`).join('')
      : `<text x="4" y="14" class="fl-axis">100 %</text><text x="4" y="${H - 16}" class="fl-axis">100 %</text>`;
    const uid = `fl${current.eventId}`;
    const chips = S.wp ? `<div class="gc-chips">
      <button class="gc-chip${mode === 'diff' ? ' active' : ''}" data-flow="diff">${ctx.esc(S.unit)}-Differenz</button>
      <button class="gc-chip${mode === 'wp' ? ' active' : ''}" data-flow="wp">Siegwahrscheinlichkeit</button></div>` : '';
    const lead = pts[pts.length - 1][1];
    const nm = (t) => ctx.esc(isSoccer() ? t.short : t.abbr);
    return section('Spielverlauf', `${chips}
      <div class="flow">
        <div class="fl-tag top" style="--tc:${home.color}">${logoImg(home.id, home.logo)}${nm(home)} ${mode === 'diff' ? 'führt' : 'gewinnt'}</div>
        <svg viewBox="0 0 ${W} ${H}" class="fl-svg" preserveAspectRatio="none" role="img" aria-label="Spielverlauf">
          <defs><clipPath id="${uid}t"><rect x="0" y="0" width="${W}" height="${M}"/></clipPath><clipPath id="${uid}b"><rect x="0" y="${M}" width="${W}" height="${M}"/></clipPath></defs>
          ${seps}
          <line x1="0" x2="${W}" y1="${M}" y2="${M}" class="fl-zero"/>
          <path d="${area}" fill="${home.color}" opacity=".35" clip-path="url(#${uid}t)"/>
          <path d="${area}" fill="${away.color}" opacity=".35" clip-path="url(#${uid}b)"/>
          <path d="${path}" fill="none" stroke="#e8edf3" stroke-width="1.4" vector-effect="non-scaling-stroke"/>
          <line x1="${lastX}" x2="${lastX}" y1="0" y2="${H}" class="fl-now"/>
          ${grid}${labels}
        </svg>
        <div class="fl-tag bottom" style="--tc:${away.color}">${logoImg(away.id, away.logo)}${nm(away)} ${mode === 'diff' ? 'führt' : 'gewinnt'}</div>
      </div>
      <div class="gc-note">${mode === 'diff' ? `${gameState(d) === 'post' ? 'Endstand' : 'Aktuell'}: ${lead === 0 ? 'Gleichstand' : `${lead > 0 ? nm(home) : nm(away)} +${Math.abs(lead)}`}` : `Aktuell: ${nm(home)} ${(lead + 50).toFixed(1)} % Siegchance (ESPN-Modell)`}</div>`);
  }

  // ---------- Boxscore: Umschalter zwischen den Teams ----------
  function boxSel(d) {
    const { left, right } = sides(d);
    return [left, right].find((t) => t.id === current.boxTeam) || left;
  }
  function boxSwitch(d) {
    const { left, right } = sides(d);
    const sel = boxSel(d);
    return `<div class="box-switch" role="tablist">${[left, right].map((t) => `
      <button type="button" class="box-sw${t.id === sel.id ? ' active' : ''}" data-boxteam="${ctx.esc(t.id)}" style="--tc:${t.color}" role="tab" aria-selected="${t.id === sel.id}">
        ${logoImg(t.id, t.logo)}<span>${ctx.esc(t.name)}</span>
      </button>`).join('')}</div>`;
  }

  // Wurfkarte: ESPN-Koordinaten in Fuß, x = 0–50 (Seitenlinie zu Seitenlinie), y = Abstand
  // vom Korb Richtung Mittellinie (Korb bei x 25 / y 0). Heim wirft auf den rechten Korb.
  const COURT = `
    <rect x="0" y="0" width="94" height="50" rx="1" class="ct-floor"/>
    <line x1="47" y1="0" x2="47" y2="50" class="ct-l"/><circle cx="47" cy="25" r="6" class="ct-l"/>
    <rect x="0" y="17" width="19" height="16" class="ct-key"/><rect x="75" y="17" width="19" height="16" class="ct-key"/>
    <circle cx="19" cy="25" r="6" class="ct-l"/><circle cx="75" cy="25" r="6" class="ct-l"/>
    <path d="M0 3H14A23.75 23.75 0 0 1 14 47H0" class="ct-l"/><path d="M94 3H80A23.75 23.75 0 0 0 80 47H94" class="ct-l"/>
    <line x1="4" y1="22" x2="4" y2="28" class="ct-rim"/><line x1="90" y1="22" x2="90" y2="28" class="ct-rim"/>
    <circle cx="5.25" cy="25" r=".75" class="ct-rim"/><circle cx="88.75" cy="25" r=".75" class="ct-rim"/>
    <path d="M5.25 21A4 4 0 0 1 5.25 29" class="ct-l"/><path d="M88.75 21A4 4 0 0 0 88.75 29" class="ct-l"/>`;

  function bbShotChart(d) {
    const all = (d.plays || []).filter((p) => p.shootingPlay && p.coordinate && Math.abs(p.coordinate.x) < 200 && Math.abs(p.coordinate.y) < 200 && (p.pointsAttempted || 2) >= 2 && !/free throw/i.test(p.type?.text || ''));
    if (!all.length) return '';
    const { home, away } = teams(d);
    const periods = [...new Set(all.map((p) => p.period?.number).filter(Boolean))].sort((a, b) => a - b);
    const labels = periodLabels(d, Math.max(...periods));
    const sel = current.period;
    const team = current.shotTeam || 'all';
    const list = all.filter((p) => (sel === 'all' || String(p.period?.number) === sel) && (team === 'all' || String(p.team?.id) === team));
    const dots = list.map((p) => {
      const isHome = String(p.team?.id) === home.id;
      const { x, y } = p.coordinate;
      const X = isHome ? 88.75 - y : 5.25 + y;
      const Y = isHome ? x : 50 - x;
      const col = isHome ? home.color : away.color;
      const title = ctx.esc(`${periodName(p.period)} ${p.clock?.displayValue || ''} – ${p.text || ''}`);
      return p.scoringPlay
        ? `<circle cx="${X.toFixed(1)}" cy="${Y.toFixed(1)}" r=".72" fill="${col}" stroke="#fff" stroke-width=".18"><title>${title}</title></circle>`
        : `<g opacity=".6"><path d="M${(X - 0.5).toFixed(1)} ${(Y - 0.5).toFixed(1)}l1 1m0 -1l-1 1" stroke="${col}" stroke-width=".28"/><title>${title}</title></g>`;
    }).join('');
    const tally = (t) => {
      const s = list.filter((p) => String(p.team?.id) === t.id);
      const m = s.filter((p) => p.scoringPlay).length;
      const s3 = s.filter((p) => (p.pointsAttempted || 0) === 3);
      return s.length ? `${ctx.esc(t.abbr)} ${m}/${s.length} (${Math.round((m / s.length) * 100)} %) · 3er ${s3.filter((p) => p.scoringPlay).length}/${s3.length}` : '';
    };
    const pchips = [['all', 'Alle'], ...periods.map((n) => [String(n), labels[n - 1]])]
      .map(([v, l]) => `<button class="gc-chip${sel === v ? ' active' : ''}" data-period="${v}">${l}</button>`).join('');
    const tchips = [['all', 'Beide'], [away.id, away.abbr], [home.id, home.abbr]]
      .map(([v, l]) => `<button class="gc-chip${team === v ? ' active' : ''}" data-shotteam="${ctx.esc(v)}">${ctx.esc(l)}</button>`).join('');
    return section('Wurfkarte', `
      <div class="gc-chips">${pchips}<span class="gc-chip-sep"></span>${tchips}</div>
      <div class="gc-rink-wrap">
        <div class="gc-rink-team left gc-link"${teamIdAttr(away.id)}>${logoImg(away.id, away.logo)}${ctx.esc(away.abbr)}</div>
        <svg class="court" viewBox="-1 -1 96 52" role="img" aria-label="Wurfkarte">${COURT}${dots}</svg>
        <div class="gc-rink-team right gc-link"${teamIdAttr(home.id)}>${ctx.esc(home.abbr)}${logoImg(home.id, home.logo)}</div>
      </div>
      <div class="gc-legend">
        <span><svg width="12" height="12" viewBox="-6 -6 12 12"><circle r="4.5" fill="#e6edf3"/></svg>Treffer</span>
        <span><svg width="12" height="12" viewBox="-6 -6 12 12"><path d="M-3 -3L3 3M-3 3L3 -3" stroke="#e6edf3" stroke-width="1.5" opacity=".7"/></svg>Fehlwurf</span>
        <span><i style="background:${away.color}"></i>${tally(away) || ctx.esc(away.abbr)}</span>
        <span><i style="background:${home.color}"></i>${tally(home) || ctx.esc(home.abbr)}</span>
      </div>`);
  }

  // ---------- Basketball: Play-by-Play ----------
  function bbPlayByPlay(d) {
    const { byId } = teams(d);
    const all = d.plays || [];
    const periods = [...new Set(all.map((p) => p.period?.number).filter(Boolean))].sort((a, b) => a - b);
    const labels = periodLabels(d, Math.max(0, ...periods));
    const sel = current.period;
    let list = all.filter((p) => sel === 'all' || String(p.period?.number) === sel);
    if (current.filter === 'key') list = list.filter((p) => p.scoringPlay || /end of|timeout|technical|flagrant|ejected/i.test(p.type?.text || p.text || ''));
    if (gameState(d) === 'in') list = list.slice().reverse();
    const chips = [['all', 'Alle'], ...periods.map((n) => [String(n), labels[n - 1]])]
      .map(([v, l]) => `<button class="gc-chip${sel === v ? ' active' : ''}" data-period="${v}">${l}</button>`).join('');
    const filter = `
      <button class="gc-chip${current.filter === 'key' ? ' active' : ''}" data-filter="key">Punkte & Wichtiges</button>
      <button class="gc-chip${current.filter === 'all' ? ' active' : ''}" data-filter="all">Alle Aktionen</button>`;
    let lastPeriod = null;
    const rows = list.map((p) => {
      let head = '';
      if (sel === 'all' && p.period?.number !== lastPeriod) {
        lastPeriod = p.period?.number;
        head = `<div class="gc-period">${ctx.esc(periodName(p.period))}</div>`;
      }
      const t = byId[String(p.team?.id)];
      const three = p.scoringPlay && p.scoreValue === 3;
      return `${head}<div class="gc-play${p.scoringPlay ? ' goal' : ''}">
        <div class="gc-time">${ctx.esc(p.clock?.displayValue || '')}</div>
        ${t?.logo ? logoImg(t.id, t.logo, 'gc-link', teamIdAttr(t.id)) : '<span></span>'}
        <div>${ctx.esc(p.text || p.type?.text || '')}${three ? ' <span class="gc-badge pp">3PT</span>' : ''}</div>
        <div class="gc-play-score">${p.scoringPlay ? ctx.esc(`${p.awayScore}–${p.homeScore}`) : ''}</div>
      </div>`;
    }).join('');
    return `<div class="gc-chips">${chips}<span class="gc-chip-sep"></span>${filter}</div>
      <div class="gc-plays">${rows || '<div class="gc-empty">Keine Aktionen.</div>'}</div>`;
  }

  // ---------- Basketball: Boxscore ----------
  function bbBoxscore(d) {
    const { home, away } = teams(d);
    return [boxSel(d)].map((t) => {
      const team = (d.boxscore.players || []).find((p) => String(p.team?.id) === t.id);
      const g = team?.statistics?.[0];
      if (!g) return '';
      const labels = g.labels || g.names || [];
      const keys = g.keys || [];
      const ptsIdx = keys.indexOf('points');
      const pmIdx = keys.indexOf('plusMinus');
      const row = (a) => {
        const name = `<td class="gc-box-name"><span class="muted">${ctx.esc(a.athlete?.jersey || '')}</span> ${playerLink(a.athlete?.id, ctx.esc(a.athlete?.shortName || a.athlete?.displayName || ''))} <span class="muted">${ctx.esc(a.athlete?.position?.abbreviation || '')}</span></td>`;
        if (a.didNotPlay || !(a.stats || []).length) return `<tr class="muted">${name}<td colspan="${labels.length}" class="dnp">${ctx.esc(a.reason ? a.reason.toLowerCase().replace(/^./, (c) => c.toUpperCase()) : 'Nicht eingesetzt')}</td></tr>`;
        return `<tr>${name}${a.stats.map((v, i) => {
          let cls = '';
          if (i === ptsIdx) cls = +v >= 20 ? 'strong hot' : 'strong';
          if (i === pmIdx) cls = /^\+/.test(v) && v !== '+0' ? 'pos' : /^-/.test(v) ? 'neg' : '';
          return `<td class="${cls}">${ctx.esc(v)}</td>`;
        }).join('')}</tr>`;
      };
      const starters = (g.athletes || []).filter((a) => a.starter);
      const bench = (g.athletes || []).filter((a) => !a.starter);
      const head = `<thead><tr><th>Spieler</th>${labels.map((l) => `<th>${ctx.esc(l)}</th>`).join('')}</tr></thead>`;
      const totals = (g.totals || []).some((v) => v !== '') ? `<tr class="tot"><td class="gc-box-name">Team gesamt</td>${g.totals.map((v) => `<td>${ctx.esc(v)}</td>`).join('')}</tr>` : '';
      return section(`<span class="gc-sec-team gc-link"${teamIdAttr(t.id)}>${logoImg(t.id, t.logo)}${ctx.esc(t.name)}</span>`, `
        <div class="table-wrap"><table class="gc-box bb-box">${head}<tbody>
          <tr class="grp"><td colspan="${labels.length + 1}">Starting Five</td></tr>${starters.map(row).join('')}
          ${bench.length ? `<tr class="grp"><td colspan="${labels.length + 1}">Bank</td></tr>${bench.map(row).join('')}` : ''}
          ${totals}
        </tbody></table></div>`);
    }).join('') + '<div class="gc-note">MIN = Minuten · PTS = Punkte · FG = Würfe getroffen-versucht · 3PT = Dreier · FT = Freiwürfe · REB = Rebounds · AST = Assists · TO = Ballverluste · STL = Steals · BLK = Blocks · OREB/DREB = Offensiv-/Defensiv-Rebounds · PF = Fouls · +/- = Plus/Minus</div>';
  }

  // ---------- MLB: Gamecast ----------
  function mlbGamecast(d) {
    return [lastPlays(d), decisions(d), leaderCards(d), flowChart(d), mlbScoringSummary(d), mlbTeamStatsCompare(d), videoHighlights(d), oddsSection(d), miniStandings(d), gameInfo(d)]
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
        <div class="gc-star-img gc-link" data-player-id="${ctx.esc(a.id)}">${a.headshot?.href ? `<img src="${ctx.esc(a.headshot.href)}" alt="" loading="lazy">` : ''}${t?.logo ? logoImg(t.id, t.logo, 'gc-star-logo gc-link', teamIdAttr(t.id)) : ''}</div>
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
          <div class="gc-goal-img">${t?.logo ? logoImg(t.id, t.logo, 'gc-goal-logo gc-link', teamIdAttr(t.id)) : ''}</div>
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
        ${t?.logo ? logoImg(t.id, t.logo, 'gc-link', teamIdAttr(t.id)) : '<span></span>'}
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
    const order = [boxSel(d)];
    return order.map((t) => {
      const team = (d.boxscore.players || []).find((p) => String(p.team?.id) === t.id);
      if (!team) return '';
      const groups = (team.statistics || []).filter((g) => (g.athletes || []).length);
      return section(`<span class="gc-sec-team gc-link"${teamIdAttr(t.id)}>${logoImg(t.id, t.logo)}${ctx.esc(t.name)}</span>`, groups.map((g) => {
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
        return `<div class="gc-form"><span class="gc-form-team gc-link"${teamIdAttr(ti?.id)}>${logoImg(ti?.id, ti?.logo)}${ctx.esc(t.team?.abbreviation || '')}</span>
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
        return `<div><div class="gc-leaders-team gc-link"${teamIdAttr(ti?.id)}>${logoImg(ti?.id, ti?.logo)}${ctx.esc(ti?.name || t.team?.displayName || '')}</div>
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

    const odds = oddsSection(d);
    if (odds) out.push(odds);
    const table = miniStandings(d);
    if (table) out.push(table);
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
    const bt = e.target.closest('[data-boxteam]');
    if (bt) { current.boxTeam = bt.dataset.boxteam; render(true); return; }
    const sf = e.target.closest('[data-shotteam]');
    if (sf) { current.shotTeam = sf.dataset.shotteam; render(true); return; }
    const fl = e.target.closest('[data-flow]');
    if (fl) { current.flow = fl.dataset.flow; render(true); return; }
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

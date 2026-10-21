/* Sport Dashboard – Spiel-Popup für Hockeyweb-Ligen (DEL, DEL2, Oberligen, NL, ICEHL, CHL …)
 * Daten über /api/hockey?type=match: Spielverlauf (Tore, Strafen), Aufstellungen, Direktvergleich.
 * Nutzt dieselben Stilklassen wie das ESPN-Popup (gamecast.js).
 */
(() => {
  'use strict';

  const REFRESH_MS = 20_000;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const logoOk = (u) => !!u && String(u).startsWith('https://media.hockeyweb.de/');
  const logo = (u) => (logoOk(u) ? `<img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="hd-nologo"></span>');
  const PERIOD = { 1: '1. Drittel', 2: '2. Drittel', 3: '3. Drittel', 4: 'Verlängerung', 5: 'Penaltyschießen' };

  let cur = null; // { game, lg, data, tab }
  let timer = null;
  let reqId = 0;

  const dlg = document.createElement('dialog');
  dlg.className = 'gc hd';
  dlg.innerHTML = `
    <div class="gc-shell">
      <button class="gc-close" aria-label="Schließen">×</button>
      <div class="gc-scroll">
        <div class="gc-head"></div>
        <nav class="gc-tabs" role="tablist"></nav>
        <div class="gc-body"></div>
      </div>
    </div>`;
  document.body.appendChild(dlg);
  const $head = dlg.querySelector('.gc-head');
  const $tabs = dlg.querySelector('.gc-tabs');
  const $body = dlg.querySelector('.gc-body');
  const $scroll = dlg.querySelector('.gc-scroll');

  function close() {
    clearTimeout(timer);
    reqId++;
    cur = null;
    if (dlg.open) dlg.close();
    document.body.classList.remove('modal-open');
  }
  dlg.addEventListener('close', () => { clearTimeout(timer); cur = null; document.body.classList.remove('modal-open'); });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('.gc-close')) { close(); return; }
    const tab = e.target.closest('[data-hdtab]');
    if (tab && cur) { cur.tab = tab.dataset.hdtab; render(false); return; }
    const vw = e.target.closest('[data-hdview]');
    if (vw && cur) { cur.view = vw.dataset.hdview; render(true); return; }
    const ln = e.target.closest('[data-hdline]');
    if (ln && cur) { cur.line = Number(ln.dataset.hdline); render(true); }
  });

  function open(game, lg) {
    cur = { game, lg, data: null, tab: 'verlauf', view: 'ice', line: 1 };
    $scroll.scrollTop = 0;
    $tabs.innerHTML = '';
    renderHead();
    $body.innerHTML = '<div class="gc-loading"><div class="skeleton"></div><div class="skeleton"></div></div>';
    if (!dlg.open) dlg.showModal();
    document.body.classList.add('modal-open');
    load();
  }

  async function load(silent = false) {
    if (!cur) return;
    const id = ++reqId;
    const { game, lg } = cur;
    try {
      const qs = new URLSearchParams({ league: lg.hockey, type: 'match', match: game.id, home: game.home.id, away: game.away.id });
      const res = await fetch(`/api/hockey?${qs}`);
      if (!res.ok) {
        let msg = `Fehler ${res.status}`;
        try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
        throw new Error(msg);
      }
      const data = await res.json();
      if (id !== reqId || !cur) return;
      cur.data = data;
      render(silent);
      clearTimeout(timer);
      if (game.live) timer = setTimeout(() => load(true), REFRESH_MS);
    } catch (e) {
      if (id !== reqId || !cur) return;
      if (!silent) $body.innerHTML = `<div class="status error">Spieldaten konnten nicht geladen werden: ${esc(e.message)}</div>`;
    }
  }

  // ---------- Kopf ----------
  function renderHead() {
    const { game: g } = cur;
    const showScore = g.played || g.live;
    const [hc, ac] = window.TeamColor
      ? window.TeamColor.pair({ color: g.home.color, alt: g.home.alt }, { color: g.away.color, alt: g.away.alt }) : [null, null];
    $head.style.setProperty('--c-home', hc || '#2a2f38');
    $head.style.setProperty('--c-away', ac || '#2a2f38');
    let status;
    if (g.live) status = `<span class="live-badge">${esc(g.status || 'Live')}</span>`;
    else if (g.played) status = g.ot === 'PSO' ? 'Ende n.P.' : g.ot === 'OT' ? 'Ende n.V.' : 'Ende';
    else status = `${esc(fmtDate(g.date))}${g.time ? `, ${esc(g.time)} Uhr` : ''}`;
    const side = (t) => `
      <div class="gc-team">
        ${logo(t.logo)}
        <div class="gc-team-name">${esc(t.name)}</div>
      </div>`;
    const per = (g.played || g.live) && g.periods?.length
      ? `<div class="gc-series">${g.periods.map(([a, b]) => `${a}:${b}`).join(' · ')}</div>` : '';
    $head.innerHTML = `
      <div class="gc-score">
        ${side(g.home)}
        <div class="gc-center">
          ${showScore ? `<div class="gc-big"><span>${esc(g.home.score)}</span><span class="gc-dash">–</span><span>${esc(g.away.score)}</span></div>` : '<div class="gc-big gc-vs">vs</div>'}
          <div class="gc-status">${status}</div>
          ${per}
        </div>
        ${side(g.away)}
      </div>`;
  }

  function fmtDate(ymd) {
    const [y, m, d] = String(ymd).split('-').map(Number);
    if (!y) return '';
    return new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(y, m - 1, d));
  }

  // ---------- Inhalt ----------
  const section = (title, html) => `<section class="gc-sec"><h3>${esc(title)}</h3>${html}</section>`;
  const teamOf = (side) => (side === 'home' ? cur.game.home : side === 'away' ? cur.game.away : null);

  function groupByPeriod(list) {
    const m = new Map();
    for (const e of list) { if (!m.has(e.period)) m.set(e.period, []); m.get(e.period).push(e); }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }

  function verlauf(d) {
    const goals = d.events.filter((e) => e.type === 'goal');
    const pens = d.events.filter((e) => e.type === 'penalty');
    const g = cur.game;
    const goalHtml = goals.length
      ? groupByPeriod(goals).map(([per, list]) => `
        <div class="gc-period">${esc(PERIOD[per] || `Abschnitt ${per}`)}</div>
        ${list.map((e) => {
          const t = teamOf(e.side);
          return `<div class="gc-goal hd-goal">
            <div class="gc-time">${esc(e.clock)}</div>
            <div class="hd-tl">${t ? logo(t.logo) : ''}</div>
            <div class="gc-goal-txt">
              <div><b>${esc(e.player)}</b></div>
              <div class="muted">${e.assists.length ? `Assists: ${e.assists.map(esc).join(', ')}` : 'ohne Assist'}</div>
            </div>
            <div class="gc-goal-score">${e.score[0]}:${e.score[1]}</div>
          </div>`;
        }).join('')}`).join('')
      : `<div class="gc-empty">${g.played || g.live ? 'Keine Torfolge erfasst.' : 'Noch keine Tore.'}</div>`;
    const penHtml = pens.length
      ? section('Strafen', groupByPeriod(pens).map(([per, list]) => `
        <div class="gc-period">${esc(PERIOD[per] || `Abschnitt ${per}`)}</div>
        ${list.map((e) => {
          const t = teamOf(e.side);
          return `<div class="gc-pen">
            <div class="gc-time">${esc(e.clock)}</div>
            <div class="hd-tl">${t ? logo(t.logo) : ''}</div>
            <div><b>${esc(e.player)}</b> <span class="muted">${esc(e.reason)}</span></div>
            <div class="gc-pim">${esc(e.minutes)} Min.${e.severity && !/klein/i.test(e.severity) ? ` <span class="muted">${esc(e.severity)}</span>` : ''}</div>
          </div>`;
        }).join('')}`).join(''))
      : '';
    return section('Tore', goalHtml) + penHtml;
  }

  const pl = (p) => `<li><i>${esc(p.nr)}</i><span>${esc(p.name)}</span></li>`;

  function lineupOf(team, lu) {
    if (!lu || (!lu.goalies.length && !lu.lines.length && !lu.bench.length)) return '';
    const lines = lu.lines.map((l) => `
      <div class="hd-line"><b>${l.line}. Reihe</b>
        <ul class="hd-pl">${l.defense.map(pl).join('')}</ul>
        <ul class="hd-pl">${l.forwards.map(pl).join('')}</ul>
      </div>`).join('');
    return `
      <section class="gc-sec"><h3 class="gc-sec-team">${logo(team.logo)}${esc(team.name)}</h3>
        ${lu.goalies.length ? `<div class="hd-line"><b>Torhüter</b><ul class="hd-pl">${lu.goalies.map(pl).join('')}</ul></div>` : ''}
        ${lines}
        ${lu.bench.length ? `<div class="hd-line"><b>Ersatzbank</b><ul class="hd-pl">${lu.bench.map(pl).join('')}</ul></div>` : ''}
      </section>`;
  }

  function hasLineups(d) {
    const ok = (l) => l && (l.goalies.length || l.lines.length || l.bench.length);
    return ok(d.lineups?.home) || ok(d.lineups?.away);
  }

  function cmpRow(label, a, b, lowerBetter) {
    if (a == null || b == null) return '';
    const sum = a + b;
    let lp = sum ? (a / sum) * 100 : 50;
    if (lowerBetter && sum) lp = (b / sum) * 100;
    return `<div class="gc-cmp">
      <div class="gc-cmp-top"><span>${esc(a)}</span><span class="muted">${esc(label)}</span><span>${esc(b)}</span></div>
      <div class="gc-cmp-bar"><i style="width:${lp}%;background:var(--c-home)"></i><i style="width:${100 - lp}%;background:var(--c-away)"></i></div>
    </div>`;
  }

  function vergleich(d) {
    const s = d.stats;
    const g = cur.game;
    let html = '';
    if (s?.home && s?.away) {
      const rows = [
        cmpRow('Tabellenplatz', s.home.place, s.away.place, true),
        cmpRow('Punkte', s.home.points, s.away.points),
        cmpRow('Spiele', s.home.played, s.away.played),
        cmpRow('Siege', s.home.won, s.away.won),
        cmpRow('Tore', s.home.gf, s.away.gf),
        cmpRow('Gegentore', s.home.ga, s.away.ga, true),
      ].join('');
      html += section('Tabelle im Vergleich', `<div class="gc-cmp-head"><span>${esc(g.home.name)}</span><span>${esc(g.away.name)}</span></div>${rows}`);
    }
    if (s?.meetings?.length) {
      html += section('Letzte Duelle', s.meetings.map((m) => `
        <div class="hd-meet">
          <span class="gc-time">${esc(fmtDate(m.date))}</span>
          <span>${esc(m.home)} <b>${m.homeScore}:${m.awayScore}</b> ${esc(m.away)}${m.ot ? ` <span class="muted">${m.ot === 'PSO' ? 'n.P.' : 'n.V.'}</span>` : ''}</span>
        </div>`).join(''));
    }
    return html;
  }

  // ---------- Eisfläche: so stehen die Reihen auf dem Eis ----------
  const hexOk = (c) => /^#[0-9a-f]{6}$/i.test(c || '');
  function textOn(bg) {
    const n = parseInt(bg.slice(1), 16);
    const l = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
    return l > 0.6 ? '#10141a' : '#ffffff';
  }
  const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

  // Heim spielt oben (Blick nach unten, links/rechts spiegelt sich), Gast unten (Blick nach oben)
  const SPOT = {
    home: { goalie: [50, 26], LV: [68, 52], RV: [32, 52], LS: [78, 73], MS: [50, 80], RS: [22, 73] },
    away: { goalie: [50, 164], LV: [32, 138], RV: [68, 138], LS: [22, 117], MS: [50, 110], RS: [78, 117] },
  };

  function token(p, [x, y], fill, stroke, goalie, delay) {
    const ink = textOn(fill);
    const nm = String(p.last); const w = Math.min(40, Math.max(14, nm.length * 1.9 + 5)); const tl = nm.length * 1.9 + 5 > 40 ? ` textLength="${w - 5}" lengthAdjust="spacingAndGlyphs"` : '';
    return `<g class="hd-tok" style="animation-delay:${delay}ms" transform="translate(${x} ${y})">
      <circle r="4.8" cy="0" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>
      <text y="1.9" text-anchor="middle" font-size="3.9" font-weight="800" fill="${ink}">${esc(p.nr)}</text>
      <rect x="${-w / 2}" y="6" width="${w}" height="5.2" rx="2.6" fill="rgba(10,14,20,.82)"/>
      <text y="9.7" text-anchor="middle" font-size="3" font-weight="700" fill="#fff"${tl}>${esc(nm)}</text>
    </g>`;
  }

  function sideTokens(side, lu, line, fill, stroke) {
    const spot = SPOT[side];
    const out = [];
    const l = lu?.lines.find((x) => x.line === line);
    if (lu?.goalies[0]) out.push(token(lu.goalies[0], spot.goalie, fill, stroke, true, 0));
    let i = 1;
    for (const p of [...(l?.defense || []), ...(l?.forwards || [])]) {
      if (spot[p.pos]) out.push(token(p, spot[p.pos], fill, stroke, false, i++ * 45));
    }
    return out.join('');
  }

  function rinkSvg(d) {
    const g = cur.game;
    const [hc, ac] = window.TeamColor
      ? window.TeamColor.pair({ color: g.home.color, alt: g.home.alt }, { color: g.away.color, alt: g.away.alt }) : [null, null];
    const hf = hexOk(hc) ? hc : '#3a7bd5';
    const af = hexOk(ac) ? ac : '#d5503a';
    const hs = hexOk(`#${g.home.alt || ''}`) && textOn(hf) === '#ffffff' ? `#${g.home.alt}` : '#ffffff';
    const as = hexOk(`#${g.away.alt || ''}`) && textOn(af) === '#ffffff' ? `#${g.away.alt}` : '#ffffff';
    const faceoff = (x, y) => `<circle cx="${x}" cy="${y}" r="10" fill="none" stroke="#d6453d" stroke-width=".55"/><circle cx="${x}" cy="${y}" r="1.1" fill="#d6453d"/>`;
    return `
    <svg class="hd-rink" viewBox="0 0 100 190" role="img" aria-label="Aufstellung auf dem Eis">
      <defs>
        <linearGradient id="hdIce" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2f8fc"/><stop offset=".5" stop-color="#e3eef6"/><stop offset="1" stop-color="#f2f8fc"/></linearGradient>
      </defs>
      <rect x="3" y="3" width="94" height="184" rx="26" fill="url(#hdIce)" stroke="#2b3a49" stroke-width="2"/>
      <g stroke-linecap="round">
        <line x1="3.6" y1="20" x2="96.4" y2="20" stroke="#d6453d" stroke-width=".5"/>
        <line x1="3.6" y1="170" x2="96.4" y2="170" stroke="#d6453d" stroke-width=".5"/>
        <rect x="3.6" y="64.2" width="92.8" height="1.8" fill="#2a6fbf" opacity=".85"/>
        <rect x="3.6" y="124" width="92.8" height="1.8" fill="#2a6fbf" opacity=".85"/>
        <rect x="3.6" y="94.1" width="92.8" height="1.8" fill="#d6453d" opacity=".9"/>
      </g>
      <circle cx="50" cy="95" r="14" fill="none" stroke="#2a6fbf" stroke-width=".6"/><circle cx="50" cy="95" r="1.4" fill="#2a6fbf"/>
      ${faceoff(28, 40)}${faceoff(72, 40)}${faceoff(28, 150)}${faceoff(72, 150)}
      <circle cx="30" cy="76" r="1" fill="#d6453d"/><circle cx="70" cy="76" r="1" fill="#d6453d"/><circle cx="30" cy="114" r="1" fill="#d6453d"/><circle cx="70" cy="114" r="1" fill="#d6453d"/>
      <path d="M42 20 A8 8 0 0 0 58 20 Z" fill="#a9d3f0" stroke="#d6453d" stroke-width=".5"/>
      <path d="M42 170 A8 8 0 0 1 58 170 Z" fill="#a9d3f0" stroke="#d6453d" stroke-width=".5"/>
      <rect x="45" y="15.8" width="10" height="4.2" rx="1" fill="none" stroke="#5b6672" stroke-width=".8"/>
      <rect x="45" y="170" width="10" height="4.2" rx="1" fill="none" stroke="#5b6672" stroke-width=".8"/>
      ${sideTokens('home', d.lineups?.home, cur.line, hf, hs)}
      ${sideTokens('away', d.lineups?.away, cur.line, af, as)}
    </svg>`;
  }

  function iceView(d) {
    const g = cur.game;
    const n = Math.max(d.lineups?.home?.lines.length || 0, d.lineups?.away?.lines.length || 0, 1);
    if (cur.line > n) cur.line = 1;
    const chips = `<div class="hk-chips" role="group" aria-label="Reihe">${Array.from({ length: n }, (_, i) => `<button type="button" class="hk-chip${cur.line === i + 1 ? ' active' : ''}" data-hdline="${i + 1}">${i + 1}. Reihe</button>`).join('')}</div>`;
    const head = (t) => `<div class="hd-rink-team">${logo(t.logo)}<b>${esc(t.name)}</b></div>`;
    return `${chips}<div class="hd-rink-wrap">${head(g.home)}${rinkSvg(d)}${head(g.away)}</div>`;
  }

  function viewToggle() {
    return `<div class="hk-chips" role="group" aria-label="Ansicht">${[['ice', 'Eisfläche'], ['list', 'Liste']].map(([v, l]) => `<button type="button" class="hk-chip${cur.view === v ? ' active' : ''}" data-hdview="${v}">${l}</button>`).join('')}</div>`;
  }


  function availableTabs(d) {
    const tabs = [['verlauf', 'Spielverlauf']];
    if (hasLineups(d)) tabs.push(['lineup', 'Aufstellung']);
    if (d.stats && (d.stats.home || d.stats.meetings?.length)) tabs.push(['vergleich', 'Vergleich']);
    return tabs;
  }

  function render(keepScroll) {
    if (!cur?.data) return;
    const d = cur.data;
    const tabs = availableTabs(d);
    if (!tabs.some(([id]) => id === cur.tab)) cur.tab = tabs[0][0];
    $tabs.innerHTML = tabs.length > 1
      ? tabs.map(([id, label]) => `<button role="tab" class="gc-tab${id === cur.tab ? ' active' : ''}" data-hdtab="${id}">${label}</button>`).join('') : '';
    const prev = $scroll.scrollTop;
    let html = '';
    if (cur.tab === 'verlauf') html = verlauf(d);
    else if (cur.tab === 'lineup') {
      const lists = lineupOf(cur.game.home, d.lineups.home) + lineupOf(cur.game.away, d.lineups.away);
      html = viewToggle() + (cur.view === 'ice' ? iceView(d) : lists);
    }
    else html = vergleich(d);
    const err = (d.errors || []).length ? `<div class="gc-note">Teilweise nicht verfügbar: ${esc(d.errors.join(', '))}</div>` : '';
    $body.innerHTML = `${html}${err}<div class="gc-foot"><a href="${esc(cur.game.url)}" target="_blank" rel="noopener">Auf Hockeyweb ansehen ↗</a></div>`;
    $scroll.scrollTop = keepScroll ? prev : Math.min(prev, $head.offsetHeight);
  }

  window.HockeyDetail = { open, close };
})();

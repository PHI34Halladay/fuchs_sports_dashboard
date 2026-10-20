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
    if (tab && cur) { cur.tab = tab.dataset.hdtab; render(false); }
  });

  function open(game, lg) {
    cur = { game, lg, data: null, tab: 'verlauf' };
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
    else if (cur.tab === 'lineup') html = lineupOf(cur.game.home, d.lineups.home) + lineupOf(cur.game.away, d.lineups.away);
    else html = vergleich(d);
    const err = (d.errors || []).length ? `<div class="gc-note">Teilweise nicht verfügbar: ${esc(d.errors.join(', '))}</div>` : '';
    $body.innerHTML = `${html}${err}<div class="gc-foot"><a href="${esc(cur.game.url)}" target="_blank" rel="noopener">Auf Hockeyweb ansehen ↗</a></div>`;
    $scroll.scrollTop = keepScroll ? prev : Math.min(prev, $head.offsetHeight);
  }

  window.HockeyDetail = { open, close };
})();

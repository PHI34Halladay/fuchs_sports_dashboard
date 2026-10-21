/* Sport Dashboard – Profile-Popup (Spieler- und Teamseite)
 * Öffnet sich über Gamecast oder der Hauptansicht (Spiele/Tabelle) und zeigt
 * ESPN-ähnliche Detaildaten zu einem Spieler oder Team. Team-Popups werden mit
 * den Vereinsfarben des jeweiligen Teams als Akzentfarbe eingefärbt.
 */
(() => {
  'use strict';

  let ctx = null; // { api, esc, fav: { get(teamId, league), toggle(teamId, league) } }
  let reqId = 0;
  let activeLeague = null; // { sport, league } – Kontext für verschachtelte Klicks (Team-Chip, nächstes Spiel)

  const dlg = document.createElement('dialog');
  dlg.className = 'pf';
  dlg.innerHTML = `
    <div class="pf-shell">
      <button class="pf-close" aria-label="Schließen">×</button>
      <div class="pf-scroll" id="pfScroll">
        <div class="pf-head" id="pfHead"></div>
        <div class="pf-body" id="pfBody"></div>
      </div>
    </div>`;
  document.body.appendChild(dlg);
  const $head = dlg.querySelector('#pfHead');
  const $body = dlg.querySelector('#pfBody');
  const $scroll = dlg.querySelector('#pfScroll');

  function close() {
    reqId++;
    if (dlg.open) dlg.close();
  }
  dlg.addEventListener('close', () => { reqId++; });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) { close(); return; }
    if (e.target.closest('.pf-close')) { close(); return; }
    const fs = e.target.closest('[data-pf-fav]');
    if (fs) {
      e.stopPropagation();
      const on = ctx.fav?.toggle(fs.dataset.pfFav, activeLeague);
      if (on != null) { fs.classList.toggle('on', on); fs.textContent = on ? '★ Favorit' : '☆ Als Favorit'; }
      return;
    }
    const t = e.target.closest('[data-team-id]');
    if (t) { e.stopPropagation(); openTeam(t.dataset.teamId); return; }
    const p = e.target.closest('[data-player-id]');
    if (p) { e.stopPropagation(); openPlayer(p.dataset.playerId); }
  });

  // ---------- Teamfarben als Akzent ----------
  const hexOk = (c) => !!c && /^[0-9a-f]{6}$/i.test(c);
  function luminance(hex) {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function pickBright(c1, c2) {
    for (const c of [c1, c2]) if (hexOk(c) && luminance(c) > 0.16) return c.toLowerCase();
    return '7c8794';
  }
  function pickBrand(c1, c2) {
    for (const c of [c1, c2]) if (hexOk(c)) return c.toLowerCase();
    return '30363d';
  }
  function hexToRgb(hex) {
    const n = parseInt(hex, 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  }
  function setAccent(c1, c2) {
    const bright = pickBright(c1, c2);
    const brand = pickBrand(c1, c2);
    dlg.style.setProperty('--pf-accent', `#${bright}`);
    dlg.style.setProperty('--pf-brand-rgb', hexToRgb(brand));
  }

  // ---------- Öffnen / Laden ----------
  function startLoad() {
    const id = ++reqId;
    $head.innerHTML = '';
    $body.innerHTML = '<div class="gc-loading"><div class="skeleton"></div><div class="skeleton"></div></div>';
    $scroll.scrollTop = 0;
    dlg.style.removeProperty('--pf-accent');
    dlg.style.removeProperty('--pf-brand-rgb');
    if (!dlg.open) dlg.showModal();
    return id;
  }

  async function openPlayer(id, league) {
    if (!ctx || !id) return;
    if (league) activeLeague = league;
    const myId = startLoad();
    try {
      const data = await ctx.api('athlete', { id }, activeLeague);
      if (myId !== reqId) return;
      renderPlayer(data.athlete || {});
    } catch (e) {
      if (myId !== reqId) return;
      $body.innerHTML = `<div class="status error">Spielerdaten konnten nicht geladen werden: ${ctx.esc(e.message)}</div>`;
    }
  }

  async function openTeam(id, league) {
    if (!ctx || !id) return;
    if (league) activeLeague = league;
    const myId = startLoad();
    try {
      const [data, roster] = await Promise.all([
        ctx.api('team', { id }, activeLeague),
        ctx.api('roster', { id }, activeLeague).catch(() => null),
      ]);
      if (myId !== reqId) return;
      renderTeam(data.team || {}, roster);
    } catch (e) {
      if (myId !== reqId) return;
      $body.innerHTML = `<div class="status error">Teamdaten konnten nicht geladen werden: ${ctx.esc(e.message)}</div>`;
    }
  }

  function bestLogo(logos, fallback) {
    return (logos || []).find((l) => (l.rel || []).includes('dark'))?.href || logos?.[0]?.href || fallback || '';
  }

  function section(title, html) {
    return `<section class="pf-sec"><h3>${title}</h3>${html}</section>`;
  }

  // ---------- Spieler-Ansicht ----------
  function renderPlayer(a) {
    setAccent(a.team?.color, a.team?.alternateColor);
    const pos = a.position?.displayName || '';
    const teamName = a.team?.displayName || a.team?.name || '';
    const teamLogo = bestLogo(a.team?.logos, a.team?.logo);
    const statusActive = !a.status || a.status.type === 'active';

    $head.innerHTML = `
      <div class="pf-player-head">
        ${a.headshot?.href ? `<img class="pf-headshot" src="${ctx.esc(a.headshot.href)}" alt="">` : '<div class="pf-headshot pf-headshot-ph"></div>'}
        <div class="pf-info">
          <div class="pf-name">${ctx.esc(a.displayName || '')}</div>
          <div class="pf-sub">${a.jersey ? `#${ctx.esc(a.jersey)} · ` : ''}${ctx.esc(pos)}${!statusActive ? ` · <span class="pf-status">${ctx.esc(a.status?.name || '')}</span>` : ''}</div>
          ${a.team?.id ? `<button type="button" class="pf-team-chip" data-team-id="${ctx.esc(a.team.id)}">${window.LogoPref.img(a.team.id, teamLogo)}${ctx.esc(teamName)}</button>` : ''}
        </div>
      </div>`;

    const bio = [
      ['Größe', a.displayHeight], ['Gewicht', a.displayWeight], ['Alter', a.age],
      ['Geburtsort', a.displayBirthPlace], ['Erfahrung', a.displayExperience],
      ['Draft', a.displayDraft], ['Hand', a.hand?.displayValue], ['College', a.collegeAthlete?.school || a.college?.name],
    ].filter(([, v]) => v !== undefined && v !== null && v !== '');
    const bioHtml = bio.length ? section('Profil', `<dl class="gc-info pf-bio">${bio.map(([k, v]) => `<dt>${ctx.esc(k)}</dt><dd>${ctx.esc(v)}</dd>`).join('')}</dl>`) : '';

    const stats = a.statsSummary?.statistics || [];
    const statsHtml = stats.length
      ? section(ctx.esc(a.statsSummary.displayName || 'Statistik'), `<div class="pf-stats">${stats.map((s) => `
          <div class="pf-stat"><div class="pf-stat-val">${ctx.esc(s.displayValue)}</div><div class="pf-stat-label">${ctx.esc(s.shortDisplayName || s.abbreviation || s.displayName)}</div></div>`).join('')}</div>`)
      : '';

    const injuries = (a.injuries || []).filter((i) => i.status || i.details);
    const injHtml = injuries.length
      ? section('Verletzung', injuries.map((i) => `<div class="gc-row"><span>${ctx.esc(i.status || '')}</span><span class="muted">${ctx.esc(i.details?.type || i.longComment || i.shortComment || '')}</span></div>`).join(''))
      : '';

    $body.innerHTML = (bioHtml + statsHtml + injHtml) || '<div class="gc-empty">Für diesen Spieler liegen keine weiteren Daten vor.</div>';

  }

  // ---------- Team-Ansicht ----------
  const RECORD_LABELS = { total: 'Gesamt', home: 'Heim', road: 'Auswärts', away: 'Auswärts' };

  function renderTeam(t, roster) {
    setAccent(t.color, t.alternateColor);
    const logo = bestLogo(t.logos, t.logo);
    const favOn = ctx.fav?.get(t.id, activeLeague);
    const favBtn = favOn == null ? '' : `<button type="button" class="pf-fav${favOn ? ' on' : ''}" data-pf-fav="${ctx.esc(t.id)}">${favOn ? '★ Favorit' : '☆ Als Favorit'}</button>`;

    $head.innerHTML = `
      <div class="pf-team-head">
        ${window.LogoPref.img(t.id, logo, 'pf-team-logo')}
        <div class="pf-info">
          <div class="pf-name">${ctx.esc(t.displayName || t.name || '')}</div>
          <div class="pf-sub">${ctx.esc(t.standingSummary || '')}</div>
          ${favBtn}
        </div>
      </div>`;

    const recRows = (t.record?.items || []).map((i) => [RECORD_LABELS[i.type] || i.type, i.summary]).filter(([, v]) => v);
    const recHtml = recRows.length ? section('Bilanz', `<dl class="gc-info pf-bio">${recRows.map(([k, v]) => `<dt>${ctx.esc(k)}</dt><dd>${ctx.esc(v)}</dd>`).join('')}</dl>`) : '';

    const next = (t.nextEvent || [])[0];
    let nextHtml = '';
    if (next) {
      const nc = next.competitions?.[0];
      const home = (nc?.competitors || []).find((c) => c.homeAway === 'home');
      const away = (nc?.competitors || []).find((c) => c.homeAway === 'away');
      const fmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(next.date));
      const homeId = home?.team?.id || home?.id, awayId = away?.team?.id || away?.id;
      nextHtml = section('Nächstes Spiel', `<div class="gc-row">
        <span>${ctx.esc(fmt)} Uhr</span>
        <span>${awayId ? `<span class="gc-link" data-team-id="${ctx.esc(awayId)}">${ctx.esc(away?.team?.abbreviation || away?.abbreviation || '')}</span>` : ''} @ ${homeId ? `<span class="gc-link" data-team-id="${ctx.esc(homeId)}">${ctx.esc(home?.team?.abbreviation || home?.abbreviation || '')}</span>` : ''}</span>
      </div>`);
    }

    $body.innerHTML = (recHtml + nextHtml + rosterHtml(roster)) || '<div class="gc-empty">Für dieses Team liegen keine weiteren Daten vor.</div>';

  }

  // Kader: ESPN liefert entweder eine flache Spielerliste (NBA, Fußball) oder nach
  // Positionsgruppen geordnet (NFL, NHL, MLB: [{ position, items: [...] }])
  const GROUP_DE = { offense: 'Offense', defense: 'Defense', specialTeam: 'Special Teams', centers: 'Center', forwards: 'Stürmer', defensemen: 'Verteidiger', goalies: 'Torhüter', pitchers: 'Pitcher', catchers: 'Catcher', infielders: 'Infield', outfielders: 'Outfield', designatedHitter: 'Designated Hitter' };
  function rosterHtml(r) {
    const raw = r?.athletes || [];
    if (!raw.length) return '';
    const groups = raw[0]?.items ? raw.map((g) => ({ name: GROUP_DE[g.position] || g.position || '', list: g.items || [] })) : [{ name: '', list: raw }];
    const posOrder = { G: 0, GK: 0, D: 1, M: 2, F: 3 };
    const body = groups.map((g) => {
      const list = g.list.slice().sort((a, b) => (posOrder[a.position?.abbreviation] ?? 5) - (posOrder[b.position?.abbreviation] ?? 5) || (+a.jersey || 99) - (+b.jersey || 99));
      return `${g.name ? `<div class="gc-box-group">${ctx.esc(g.name)}</div>` : ''}<div class="pf-roster">${list.map((a) => `
        <button type="button" class="pf-rp" data-player-id="${ctx.esc(a.id)}">
          ${a.headshot?.href ? `<img src="${ctx.esc(a.headshot.href)}" alt="" loading="lazy">` : '<span class="pf-rp-ph"></span>'}
          <span class="pf-rp-num">${ctx.esc(a.jersey || '')}</span>
          <span class="pf-rp-name">${ctx.esc(a.displayName || a.fullName || '')}<small>${ctx.esc(a.position?.abbreviation || '')}</small></span>
        </button>`).join('')}</div>`;
    }).join('');
    return section(`Kader <span class="muted">· ${groups.reduce((n, g) => n + g.list.length, 0)} Spieler</span>`, body);
  }

  window.Profile = {
    init(c) { ctx = c; },
    openPlayer,
    openTeam,
    close,
  };
})();

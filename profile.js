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
  let pl = null; // aktuell geöffneter Spieler: { a, raw, ov, gl, bio, news, leagueName, loadingExtras }

  const dlg = document.createElement('dialog');
  dlg.className = 'pf';
  dlg.innerHTML = `
    <div class="pf-shell">
      <button class="pf-close" aria-label="Schließen">×</button>
      <div class="pf-scroll" id="pfScroll">
        <div class="pf-head" id="pfHead"></div>
        <div class="pf-tabs" id="pfTabs" role="tablist"></div>
        <div class="pf-body" id="pfBody"></div>
      </div>
    </div>`;
  document.body.appendChild(dlg);
  const $head = dlg.querySelector('#pfHead');
  const $body = dlg.querySelector('#pfBody');
  const $tabs = dlg.querySelector('#pfTabs');
  let reopening = false; // Dialog neu öffnen, um ihn über andere Popups (Spiel) zu holen
  const $scroll = dlg.querySelector('#pfScroll');

  function close() {
    reqId++;
    if (dlg.open) dlg.close();
  }
  dlg.addEventListener('close', () => { dlg.querySelectorAll('video').forEach((v) => v.pause()); if (reopening) { reopening = false; return; } reqId++; });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) { close(); return; }
    if (e.target.closest('.pf-close')) { close(); return; }
    // Tabs im Spielerprofil
    const tabBtn = e.target.closest('[data-pf-tab]');
    if (tabBtn) {
      e.stopPropagation();
      if (pl) { pl.tab = tabBtn.dataset.pfTab; renderPlayer(); $scroll.scrollTop = Math.min($scroll.scrollTop, $head.offsetHeight); }
      return;
    }
    // Video im Profil: Vorschaubild antippen → Abspielen direkt in der App
    const vf = e.target.closest('.gc-video-frame[data-video-src]');
    if (vf) {
      vf.outerHTML = `<div class="gc-video-frame gc-video-playing"><video controls autoplay playsinline src="${ctx.esc(vf.dataset.videoSrc)}"></video></div>`;
      return;
    }
    // News zum Spieler: Lesemodus der App
    const nw = e.target.closest('[data-pf-news]');
    if (nw) {
      e.stopPropagation();
      const item = pl?.news?.[+nw.dataset.pfNews];
      if (item && window.Reader) window.Reader.open(item, { ...activeLeague, name: pl.leagueName });
      return;
    }
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
    if (p) { e.stopPropagation(); openPlayer(p.dataset.playerId); return; }
    // Spiel antippen → Spiel-Popup (Gamecast)
    const g = e.target.closest('[data-pf-game]');
    if (g) { e.stopPropagation(); openGame(g.dataset.pfGame, g.dataset.pfLeague); }
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
    $tabs.innerHTML = '';
    $body.innerHTML = '<div class="gc-loading"><div class="skeleton"></div><div class="skeleton"></div></div>';
    $scroll.scrollTop = 0;
    dlg.style.removeProperty('--pf-accent');
    dlg.style.removeProperty('--pf-brand-rgb');
    // Läuft das Profil schon (z. B. Klick auf einen Spieler im Spiel-Popup), nach oben holen
    if (dlg.open) { reopening = true; dlg.close(); }
    dlg.showModal();
    return id;
  }

  const RE_SLUG = /^[a-z0-9._-]{2,40}$/;
  // Spiel aus dem Profil öffnen: das Spiel-Popup legt sich über das Profil, beim Schließen ist man wieder dort
  function openGame(eventId, slug) {
    if (!window.Gamecast || !eventId || !activeLeague) return;
    const league = { sport: activeLeague.sport, league: RE_SLUG.test(slug || '') ? slug : activeLeague.league };
    league.id = ctx.leagueId?.(league) || undefined;
    window.Gamecast.open(eventId, { link: null, league });
  }

  async function openPlayer(id, league) {
    if (!ctx || !id) return;
    if (league) activeLeague = league;
    const myId = startLoad();
    pl = null;
    try {
      const data = await ctx.api('athlete', { id }, activeLeague);
      if (myId !== reqId) return;
      // Grunddaten sofort zeigen, die Zusatzdaten (Statistik, Spielverlauf, News …) kommen danach dazu
      pl = { a: data.athlete || {}, raw: data, ov: null, gl: null, bio: null, news: [], leagueName: data.league?.name || data.league?.shortName || '', loadingExtras: true };
      renderPlayer();
      const extra = (type) => ctx.api(type, { id }, activeLeague).catch(() => null);
      const [ov, gl, bio] = await Promise.all([extra('overview'), extra('gamelog'), extra('bio')]);
      if (myId !== reqId) return;
      pl.ov = ov; pl.gl = gl; pl.bio = bio;
      pl.news = (ov?.news || []).filter((n) => n.headline && n.id).slice(0, 6);
      pl.loadingExtras = false;
      renderPlayer();
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
  const POS_DE = { Goalkeeper: 'Torwart', Defender: 'Abwehr', Midfielder: 'Mittelfeld', Forward: 'Sturm', Attacker: 'Sturm', 'Center Back': 'Innenverteidiger', 'Centre Back': 'Innenverteidiger', 'Right Back': 'Rechtsverteidiger', 'Left Back': 'Linksverteidiger', 'Defensive Midfielder': 'Defensives Mittelfeld', 'Central Midfielder': 'Zentrales Mittelfeld', 'Attacking Midfielder': 'Offensives Mittelfeld', 'Left Winger': 'Linksaußen', 'Right Winger': 'Rechtsaußen', Striker: 'Stürmer' };
  // Fußball-Kürzel von ESPN ins Deutsche (US-Sport-Kürzel wie PTS, REB, AST bleiben)
  const SOCCER_LABELS = { STRT: 'Start', APP: 'Einsätze', SUB: 'Einw.', G: 'Tore', A: 'Vorl.', SHOT: 'Schüsse', SOG: 'aufs Tor', FC: 'Fouls', FA: 'Gefoult', OF: 'Abseits', YC: 'Gelb', RC: 'Rot', SV: 'Paraden', GA: 'Gegentore', CS: 'Zu Null' };
  const SPLIT_DE = [[/regular season/i, 'Hauptrunde'], [/preseason/i, 'Vorbereitung'], [/postseason|playoffs?/i, 'Playoffs'], [/career/i, 'Karriere'], [/german bundesliga/i, 'Bundesliga'], [/champions league/i, 'Champions League'], [/international friendly/i, 'Freundschaftsspiele'], [/nations league/i, 'Nations League'], [/world cup/i, 'Weltmeisterschaft']];
  function splitName(n) {
    let s = String(n || '');
    for (const [re, de] of SPLIT_DE) s = s.replace(re, de);
    return s;
  }
  const RES_DE = { W: ['S', 'win'], D: ['U', 'draw'], T: ['U', 'draw'], L: ['N', 'loss'] };
  const fmtDate = (iso, opts) => { const d = new Date(iso); return Number.isNaN(+d) ? '' : new Intl.DateTimeFormat('de-DE', opts).format(d); };

  // ESPN liefert Größe/Gewicht in US-Einheiten – für die Anzeige auf cm/kg umrechnen
  function metric(a) {
    const out = {};
    const hm = /^(\d+)'\s*(\d+)?/.exec(a.displayHeight || '');
    if (hm) out.height = `${Math.round((+hm[1] * 12 + (+hm[2] || 0)) * 2.54)} cm`;
    const wm = /^(\d+)\s*lbs?/i.exec(a.displayWeight || '');
    if (wm) out.weight = `${Math.round(+wm[1] * 0.45359237)} kg`;
    return out;
  }

  function parseGamelog(gl) {
    if (!gl) return null;
    const evMap = gl.events || {};
    const rows = new Map();
    for (const st of gl.seasonTypes || []) {
      for (const cat of st.categories || []) {
        for (const e of cat.events || []) {
          if (!e?.eventId || !Array.isArray(e.stats) || rows.has(e.eventId) || !evMap[e.eventId]) continue;
          rows.set(e.eventId, { id: String(e.eventId), meta: evMap[e.eventId], stats: e.stats });
        }
      }
    }
    const list = [...rows.values()].sort((x, y) => new Date(y.meta.gameDate) - new Date(x.meta.gameDate)).slice(0, 15);
    return list.length ? { labels: gl.labels || [], names: gl.displayNames || [], list } : null;
  }

  const lbl = (soccer, l) => (soccer && SOCCER_LABELS[l]) || l;

  function statTables(ov, soccer) {
    const raw = ov?.statistics;
    const tables = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((t) => (t.labels || []).length && (t.splits || []).length);
    return tables.map((t) => {
      let splits = t.splits.filter((s) => Array.isArray(s.stats));
      // Wettbewerbe ohne einen einzigen Wert (z. B. Nations League ohne Einsatz) ausblenden
      const used = splits.filter((s) => s.stats.some((v) => v && v !== '0' && v !== '--' && v !== '0.0'));
      if (used.length) splits = used;
      const head = t.labels.map((l, i) => `<th title="${ctx.esc(t.displayNames?.[i] || '')}">${ctx.esc(lbl(soccer, l))}</th>`).join('');
      const body = splits.map((s) => `<tr><td>${ctx.esc(splitName(s.displayName))}</td>${t.labels.map((_, i) => `<td>${ctx.esc(s.stats[i] ?? '–')}</td>`).join('')}</tr>`).join('');
      const legend = t.labels.map((l, i) => `<span><b>${ctx.esc(lbl(soccer, l))}</b> ${ctx.esc(t.displayNames?.[i] || '')}</span>`).join('');
      return `<div class="table-wrap"><table class="pf-tbl"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div>
        <details class="pf-legend"><summary>Was bedeuten die Spalten?</summary><div>${legend}</div></details>`;
    }).join('');
  }

  const resBadge = (r) => { const m = RES_DE[r]; return m ? `<span class="pf-res pf-res-${m[1]}">${m[0]}</span>` : '<span class="pf-res"></span>'; };
  function gameScore(m) {
    const hs = m.homeTeamScore, as = m.awayTeamScore;
    return hs !== undefined && hs !== '' && as !== undefined && as !== '' ? `${hs}:${as}` : String(m.score || '');
  }
  const gameAttrs = (r) => `data-pf-game="${ctx.esc(r.id)}"${r.meta.leagueSlug ? ` data-pf-league="${ctx.esc(r.meta.leagueSlug)}"` : ''}`;

  // Kompakte, antippbare Spielzeile (Übersicht)
  function gameLine(r) {
    const m = r.meta, opp = m.opponent || {};
    return `<button type="button" class="pf-gl-line" ${gameAttrs(r)}>
      <span class="pf-gl-date">${ctx.esc(fmtDate(m.gameDate, { day: '2-digit', month: '2-digit' }))}</span>
      ${resBadge(m.gameResult)}
      <span class="pf-gl-opp"><span class="muted">${ctx.esc(m.atVs || '')}</span> ${opp.logo ? `<img src="${ctx.esc(opp.logo)}" alt="" loading="lazy">` : ''}${ctx.esc(opp.displayName || opp.abbreviation || '')}</span>
      <span class="pf-gl-score">${ctx.esc(gameScore(m))}</span><span class="pf-chev">›</span>
    </button>`;
  }

  function formStrip(g) {
    return `<div class="pf-form">${g.list.slice(0, 5).map((r) => resBadge(r.meta.gameResult)).join('')}<span class="muted">Form (neueste zuerst)</span></div>`;
  }

  function gamelogTable(g, soccer) {
    const head = g.labels.map((l, i) => `<th title="${ctx.esc(g.names[i] || '')}">${ctx.esc(lbl(soccer, l))}</th>`).join('');
    const body = g.list.map((r) => {
      const m = r.meta, opp = m.opponent || {};
      const oppName = ctx.esc(opp.abbreviation || opp.displayName || '');
      const oppEl = opp.id ? `<span class="gc-link" data-team-id="${ctx.esc(opp.id)}">${oppName}</span>` : oppName;
      return `<tr class="pf-gl-row" ${gameAttrs(r)}>
        <td><div class="pf-gl-game">
          <span class="pf-gl-date">${ctx.esc(fmtDate(m.gameDate, { day: '2-digit', month: '2-digit' }))}</span>
          ${resBadge(m.gameResult)}
          <span class="muted">${ctx.esc(m.atVs || '')}</span>
          ${opp.logo ? `<img src="${ctx.esc(opp.logo)}" alt="" loading="lazy">` : ''}${oppEl}
          <span class="pf-gl-score">${ctx.esc(gameScore(m))}</span>
        </div></td>
        ${g.labels.map((_, i) => `<td>${ctx.esc(r.stats[i] ?? '–')}</td>`).join('')}<td class="pf-chev">›</td></tr>`;
    }).join('');
    return `<div class="table-wrap"><table class="pf-tbl pf-gl"><thead><tr><th>Spiel</th>${head}<th></th></tr></thead><tbody>${body}</tbody></table></div>
      <div class="gc-note">Spiel antippen für Aufstellung, Verlauf und Boxscore · Gegner antippen für das Teamprofil</div>`;
  }

  const newsRow = (n, i) => {
    const img = (n.images || []).find((x) => x.url)?.url;
    const when = fmtDate(n.published, { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<button type="button" class="pf-news" data-pf-news="${i}">
      ${img ? `<img src="${ctx.esc(img)}" alt="" loading="lazy">` : '<span class="pf-news-ph"></span>'}
      <span class="pf-news-t">${ctx.esc(n.headline)}<small>${n.type === 'Media' ? '▶ Video · ' : ''}${ctx.esc(when)}</small></span>
    </button>`;
  };

  const TAB_ORDER = ['ueb', 'stat', 'spiele', 'medien', 'karriere', 'kader'];

  function renderPlayer() {
    const { a, raw, ov, gl, bio } = pl;
    const soccer = activeLeague?.sport === 'soccer';
    setAccent(a.team?.color, a.team?.alternateColor);
    const posName = a.position?.displayName || a.position?.name || '';
    const pos = POS_DE[posName] || posName;
    const teamName = a.team?.displayName || a.team?.name || '';
    const teamLogo = bestLogo(a.team?.logos, a.team?.logo);
    const statusActive = !a.status || a.status.type === 'active';
    const nation = a.citizenship || a.birthCountry?.displayName || '';

    $head.innerHTML = `
      <div class="pf-player-head">
        ${a.headshot?.href ? `<img class="pf-headshot" src="${ctx.esc(a.headshot.href)}" alt="">` : '<div class="pf-headshot pf-headshot-ph"></div>'}
        <div class="pf-info">
          <div class="pf-name">${ctx.esc(a.displayName || '')}</div>
          <div class="pf-sub">${a.jersey ? `#${ctx.esc(a.jersey)} · ` : ''}${ctx.esc(pos)}${!statusActive ? ` · <span class="pf-status">${ctx.esc(a.status?.name || '')}</span>` : ''}</div>
          ${nation ? `<div class="pf-sub pf-nation">${a.flag?.href ? `<img src="${ctx.esc(a.flag.href)}" alt="">` : ''}${ctx.esc(nation)}</div>` : ''}
          ${a.team?.id ? `<button type="button" class="pf-team-chip" data-team-id="${ctx.esc(a.team.id)}">${window.LogoPref.img(a.team.id, teamLogo)}${ctx.esc(teamName)}<span class="pf-chev">›</span></button>` : ''}
        </div>
      </div>`;

    const glData = parseGamelog(gl);

    // ---- Übersicht ----
    const m = metric(a);
    const dob = a.dateOfBirth ? fmtDate(a.dateOfBirth, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }) : (a.displayDOB || '');
    const bioRows = [
      ['Nationalität', nation], ['Geboren', dob], ['Alter', a.age],
      ['Größe', m.height ? `${m.height} (${a.displayHeight})` : a.displayHeight],
      ['Gewicht', m.weight ? `${m.weight} (${a.displayWeight})` : a.displayWeight],
      ['Geburtsort', a.displayBirthPlace], ['Erfahrung', a.displayExperience], ['Debüt', a.debutYear],
      ['Draft', a.displayDraft], ['Hand', a.hand?.displayValue], ['College', a.collegeAthlete?.school || a.college?.name],
      ['Fuß', a.foot?.displayValue || a.preferredFoot?.displayValue],
    ].filter(([, v]) => v !== undefined && v !== null && v !== '');
    const bioHtml = bioRows.length ? section('Steckbrief', `<dl class="gc-info pf-bio">${bioRows.map(([k, v]) => `<dt>${ctx.esc(k)}</dt><dd>${ctx.esc(v)}</dd>`).join('')}</dl>`) : '';

    const stats = a.statsSummary?.statistics || [];
    const statsHtml = stats.length
      ? section(ctx.esc(a.statsSummary.displayName || 'Saison'), `<div class="pf-stats">${stats.map((s) => `
          <div class="pf-stat"><div class="pf-stat-val">${ctx.esc(s.displayValue)}</div><div class="pf-stat-label">${ctx.esc(s.shortDisplayName || s.abbreviation || s.displayName)}</div>${s.rankDisplayValue ? `<div class="pf-stat-rank">${ctx.esc(s.rankDisplayValue)}</div>` : ''}</div>`).join('')}</div>`)
      : '';

    const injuries = (a.injuries || []).filter((i) => i.status || i.details);
    const injHtml = injuries.length
      ? section('Verletzung', injuries.map((i) => `<div class="gc-row"><span>${ctx.esc(i.status || '')}</span><span class="muted">${ctx.esc(i.details?.type || i.longComment || i.shortComment || '')}</span></div>`).join(''))
      : '';

    const recentHtml = glData ? section(`Letzte Spiele <button type="button" class="pf-more" data-pf-tab="spiele">Alle ›</button>`,
      formStrip(glData) + `<div class="pf-gl-lines">${glData.list.slice(0, 3).map(gameLine).join('')}</div>`) : '';
    const newsTeaser = pl.news[0] ? section(`Neueste News <button type="button" class="pf-more" data-pf-tab="medien">Mehr ›</button>`, newsRow(pl.news[0], 0)) : '';
    const loading = pl.loadingExtras ? '<div class="gc-loading"><div class="skeleton"></div><div class="skeleton"></div></div>' : '';

    const tabs = {};
    tabs.ueb = statsHtml + recentHtml + bioHtml + injHtml + newsTeaser + loading;

    // ---- Statistik ----
    const tables = statTables(ov, soccer);
    if (tables) tabs.stat = section('Statistik', tables);

    // ---- Spiele ----
    if (glData) tabs.spiele = section(`Spiele${glData.list[0]?.meta?.leagueShortName ? ` <span class="muted">· ${ctx.esc(glData.list[0].meta.leagueShortName)}</span>` : ''}`, formStrip(glData) + gamelogTable(glData, soccer));

    // ---- Medien ----
    const vids = (raw?.videos || []).map((v) => ({ v, src: v.links?.source?.HD?.href || v.links?.source?.href })).filter((x) => x.src).slice(0, 6);
    const vidHtml = vids.length ? section('Videos', `<div class="pf-vids">${vids.map(({ v, src }) => `
        <div class="pf-vid">
          <div class="gc-video-frame" data-video-src="${ctx.esc(src)}">${v.thumbnail ? `<img src="${ctx.esc(v.thumbnail)}" alt="" loading="lazy">` : ''}<span class="gc-video-play">▶</span></div>
          <div class="pf-vid-t">${ctx.esc(v.headline || v.title || '')}</div>
        </div>`).join('')}</div>`) : '';
    const newsHtml = pl.news.length ? section('News', `<div class="pf-news-list">${pl.news.map(newsRow).join('')}</div>`) : '';
    if (vidHtml || newsHtml) tabs.medien = newsHtml + vidHtml;

    // ---- Karriere ----
    const history = (bio?.teamHistory || []).filter((t) => t.displayName);
    if (history.length) {
      tabs.karriere = section('Stationen', history.map((t) => {
        const seasons = String(t.seasons || '').replace(/-CURRENT/i, ' – heute').replace(/(\d{4})-(\d{4})/g, (_, x, y) => (x === y ? x : `${x}–${y}`));
        return `<div class="gc-row pf-hist">
          <span class="pf-hist-n">${t.logo ? `<img src="${ctx.esc(t.logo)}" alt="" loading="lazy">` : ''}${ctx.esc(t.displayName)}</span>
          <span class="muted">${ctx.esc(seasons)}</span>
          <span class="muted">${t.seasonCount ? `${ctx.esc(t.seasonCount)} Saisons` : ''}</span>
        </div>`;
      }).join(''));
    }

    // ---- Kader ----
    const mates = (raw?.playerSwitcher?.athletes || []).filter((p) => p.id && p.id !== a.id).slice(0, 30);
    if (mates.length) {
      tabs.kader = section(`Kader${teamName ? ` <span class="muted">· ${ctx.esc(teamName)}</span>` : ''}`, `<div class="pf-roster">${mates.map((p) => `
        <button type="button" class="pf-rp" data-player-id="${ctx.esc(p.id)}">
          ${p.headshot?.href ? `<img src="${ctx.esc(p.headshot.href)}" alt="" loading="lazy">` : '<span class="pf-rp-ph"></span>'}
          <span class="pf-rp-num">${ctx.esc(String(p.jersey || p.displayJersey || '').replace('#', ''))}</span>
          <span class="pf-rp-name">${ctx.esc(p.displayName || '')}<small>${ctx.esc(POS_DE[p.position?.displayName] || p.position?.abbreviation || '')}</small></span>
        </button>`).join('')}</div>` + (a.team?.id ? `<button type="button" class="pf-more pf-more-block" data-team-id="${ctx.esc(a.team.id)}">Ganzes Team ansehen ›</button>` : ''));
    }

    const LABELS = { ueb: 'Übersicht', stat: 'Statistik', spiele: 'Spiele', medien: 'Medien', karriere: 'Karriere', kader: 'Kader' };
    const keys = TAB_ORDER.filter((k) => tabs[k]);
    if (!pl.tab || !keys.includes(pl.tab)) pl.tab = 'ueb';
    $tabs.innerHTML = keys.length > 1 ? keys.map((k) => `<button type="button" role="tab" class="gc-tab${k === pl.tab ? ' active' : ''}" aria-selected="${k === pl.tab}" data-pf-tab="${k}">${LABELS[k]}</button>`).join('') : '';
    const html = tabs[pl.tab];
    $body.innerHTML = html && html.replace(loading, '').trim() ? html : (loading || '<div class="gc-empty">Für diesen Spieler liegen keine weiteren Daten vor.</div>');
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
      nextHtml = section('Nächstes Spiel', `<div class="gc-row"${next.id ? ` data-pf-game="${ctx.esc(next.id)}" style="cursor:pointer"` : ''}>
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

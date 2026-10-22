/* Sport Dashboard – Spiel-Popup für Amateurspiele (Fussball.de, SGM I / SGM II und ihre Ligen)
 * Daten über /api/amateurgame: Spielort, Vergleich der Mannschaften, Spielverlauf (Minute, Art, Seite).
 * Torstände zeigt Fussball.de nur verschleiert an; sie werden nicht ausgelesen. Schiedsrichter,
 * Aufstellungen und Spielernamen stehen dort nicht lesbar und fehlen deshalb auch hier.
 * Nutzt dieselben Stilklassen wie das ESPN-/Hockey-Popup.
 */
(() => {
  'use strict';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const logoOk = (u) => !!u && (String(u).startsWith('https://www.fussball.de/export.media/') || String(u).startsWith('logos/kreisliga/'));
  const logo = (u) => (logoOk(u) ? `<img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="hd-nologo"></span>');
  const cache = new Map(); // Spielseite → Antwort (kurz, schont Fussball.de bei erneutem Öffnen)
  const CACHE_MS = 5 * 60_000;

  let cur = null; // { m, lg, logos, data }
  let reqId = 0;

  const dlg = document.createElement('dialog');
  dlg.className = 'gc hd ad';
  dlg.innerHTML = `
    <div class="gc-shell">
      <button class="gc-close" aria-label="Schließen">×</button>
      <div class="gc-scroll">
        <div class="gc-head"></div>
        <div class="gc-body"></div>
      </div>
    </div>`;
  document.body.appendChild(dlg);
  const $head = dlg.querySelector('.gc-head');
  const $body = dlg.querySelector('.gc-body');
  const $scroll = dlg.querySelector('.gc-scroll');

  function close() {
    reqId++;
    cur = null;
    if (dlg.open) dlg.close();
    document.body.classList.remove('modal-open');
  }
  dlg.addEventListener('close', () => { cur = null; document.body.classList.remove('modal-open'); });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('.gc-close')) { close(); return; }
    const art = e.target.closest('[data-article]');
    if (art) { openArticle(art); return; }
    if (e.target.closest('[data-back]') && cur) { cur.view = 'game'; reqId++; render(); $scroll.scrollTop = 0; }
  });

  function open(m, lg, logos = {}) {
    cur = { m, lg, logos, data: null };
    $scroll.scrollTop = 0;
    renderHead();
    if (!m.url) { $body.innerHTML = '<div class="gc-empty">Für dieses Spiel gibt es keine Detailseite.</div>'; }
    else $body.innerHTML = '<div class="gc-loading"><div class="skeleton"></div><div class="skeleton"></div></div>';
    if (!dlg.open) dlg.showModal();
    document.body.classList.add('modal-open');
    if (m.url) load();
  }

  async function load() {
    if (!cur) return;
    const id = ++reqId;
    const { m } = cur;
    try {
      const hit = cache.get(m.url);
      let data = hit && Date.now() - hit.t < CACHE_MS ? hit.data : null;
      if (!data) {
        const res = await fetch(`/api/amateurgame?${new URLSearchParams({ url: m.url })}`);
        if (!res.ok) {
          let msg = `Fehler ${res.status}`;
          try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
          throw new Error(msg);
        }
        data = await res.json();
        cache.set(m.url, { t: Date.now(), data });
      }
      if (id !== reqId || !cur) return;
      cur.data = data;
      render();
    } catch (e) {
      if (id !== reqId || !cur) return;
      $body.innerHTML = `<div class="status error">Spieldaten konnten nicht geladen werden: ${esc(e.message)}</div>${linkHtml()}`;
    }
  }

  function fmtDate(ymd) {
    const [y, mo, d] = String(ymd).split('-').map(Number);
    if (!y) return '';
    return new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(y, mo - 1, d));
  }

  // ---------- Kopf (ohne Torstand) ----------
  function renderHead() {
    const { m, logos } = cur;
    const side = (name) => `<div class="gc-team">${logo(logos[name])}<div class="gc-team-name">${esc(name)}</div></div>`;
    $head.style.setProperty('--c-home', '#2a2f38');
    $head.style.setProperty('--c-away', '#2a2f38');
    $head.innerHTML = `
      <div class="gc-score">
        ${side(m.home)}
        <div class="gc-center">
          <div class="gc-big gc-vs">vs</div>
          <div class="gc-status">${m.played ? 'Beendet' : `${esc(m.time || 'Zeit offen')}${m.time ? ' Uhr' : ''}`}</div>
          <div class="gc-series">${esc(fmtDate(m.date))}</div>
          ${m.competition ? `<div class="gc-series">${esc(m.competition)}</div>` : ''}
        </div>
        ${side(m.away)}
      </div>`;
  }

  // ---------- Inhalt ----------
  const section = (title, html) => `<section class="gc-sec"><h3>${esc(title)}</h3>${html}</section>`;
  const linkHtml = () => (cur.m.url ? `<p class="ad-link"><a href="${esc(cur.m.url)}" target="_blank" rel="noopener noreferrer">${cur.m.played ? 'Spielbericht und Ergebnis' : 'Spielseite'} auf Fussball.de ↗</a></p>` : '');

  function ortHtml(loc, times) {
    const maps = loc ? `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: loc })}` : '';
    const rows = [];
    if (loc) rows.push(`<div class="ad-loc"><span>${esc(loc)}</span><a href="${esc(maps)}" target="_blank" rel="noopener noreferrer">Karte ↗</a></div>`);
    const t = [times?.kickoff ? `Anpfiff ${esc(times.kickoff)} Uhr` : '', times?.final ? `Abpfiff ${esc(times.final)} Uhr` : ''].filter(Boolean);
    if (t.length) rows.push(`<div class="ad-meta">${t.join(' · ')}</div>`);
    const { m } = cur;
    const info = [m.competition, m.matchNo ? `Spiel ${m.matchNo}` : ''].filter(Boolean);
    if (info.length) rows.push(`<div class="ad-meta muted">${info.map(esc).join(' · ')}</div>`);
    return rows.length ? section('Spielort & Zeiten', rows.join('')) : '';
  }

  const FORM = { S: 'Sieg', U: 'Unentschieden', N: 'Niederlage' };
  const formHtml = (f) => (f ? `<span class="ad-form">${f.map((x) => `<i class="f-${x}" title="${FORM[x]}">${x}</i>`).join('')}</span>` : '–');

  // Vergleich als dreispaltiges Raster: Heim | Merkmal | Gast (Zahlenwerte mit Balken darunter)
  function cmpBar(a, b, lowerBetter) {
    const sum = a + b;
    let lp = sum ? (a / sum) * 100 : 50;
    if (lowerBetter && sum) lp = (b / sum) * 100;
    return `<div class="ad-bar"><i class="h" style="width:${lp}%"></i><i class="a" style="width:${100 - lp}%"></i></div>`;
  }
  const cmpRow = (label, a, b, bar) => (a == null && b == null ? '' : `
    <div class="ad-cmp">
      <span class="ad-v l">${a ?? '–'}</span><span class="ad-k">${esc(label)}</span><span class="ad-v r">${b ?? '–'}</span>
      ${bar || ''}
    </div>`);
  const num = (label, a, b, lowerBetter) => (a == null || b == null ? cmpRow(label, a, b) : cmpRow(label, esc(a), esc(b), cmpBar(a, b, lowerBetter)));

  function vergleichHtml(c) {
    if (!c) return '';
    const sc = (p) => (p ? `${esc(p.name)} <span class="muted">(${p.goals})</span>` : null);
    const rows = [
      num('Tabellenplatz', c.home.place, c.away.place, true),
      num('Punkte', c.home.points, c.away.points),
      cmpRow('Torverhältnis', c.home.goals && esc(c.home.goals), c.away.goals && esc(c.away.goals)),
      cmpRow('Bester Torjäger', sc(c.home.scorer), sc(c.away.scorer)),
      cmpRow('Karten (Team/Offiz.)', c.home.cards && esc(c.home.cards), c.away.cards && esc(c.away.cards)),
    ].join('');
    if (!rows) return '';
    const { m, logos } = cur;
    const head = (name, cls) => `<div class="ad-cmp-team ${cls}">${logo(logos[name])}<span>${esc(name)}</span></div>`;
    return section('Mannschaften im Vergleich', `<div class="ad-cmp-head">${head(m.home, 'l')}<span></span>${head(m.away, 'r')}</div>${rows}`);
  }

  function formSection(c) {
    if (!c || (!c.home.form && !c.away.form)) return '';
    const { m, logos } = cur;
    const row = (name, f) => `<div class="ad-formrow"><span class="ad-formteam">${logo(logos[name])}<span>${esc(name)}</span></span>${formHtml(f)}</div>`;
    return section('Form (letzte 5 Spiele)', `${row(m.home, c.home.form)}${row(m.away, c.away.form)}<p class="muted ad-note">Grün = Sieg · Grau = Unentschieden · Rot = Niederlage, in der Reihenfolge von Fussball.de.</p>`);
  }

  // Berichte öffnen direkt in der App (Lesemodus im Popup), nicht auf Fussball.de
  function newsHtml(list) {
    if (!list?.length) return '';
    const fmt = (ymd) => { const [y, mo, d] = String(ymd || '').split('-'); return y ? `${d}.${mo}.${y}` : ''; };
    return section('Berichte & News', list.map((n) => `<button type="button" class="ad-news" data-article="${esc(n.url)}" data-title="${esc(n.title)}" data-kind="${esc(n.kind || '')}" data-date="${esc(n.date || '')}"><span class="muted">${esc(fmt(n.date))}${n.kind ? ` · ${esc(n.kind)}` : ''}</span><span>${esc(n.title)} ›</span></button>`).join(''));
  }

  // ---------- Bericht lesen ----------
  const artCache = new Map();
  async function openArticle(btn) {
    if (!cur) return;
    const url = btn.dataset.article;
    const info = { url, title: btn.dataset.title, kind: btn.dataset.kind, date: btn.dataset.date };
    cur.view = 'article';
    const id = ++reqId;
    $scroll.scrollTop = 0;
    $body.innerHTML = `<button type="button" class="ad-back" data-back>‹ Zurück zum Spiel</button><div class="gc-loading"><div class="skeleton"></div><div class="skeleton"></div></div>`;
    try {
      let a = artCache.get(url);
      if (!a) {
        const res = await fetch(`/api/amateurgame?${new URLSearchParams({ article: url })}`);
        if (!res.ok) {
          let msg = `Fehler ${res.status}`;
          try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
          throw new Error(msg);
        }
        a = await res.json();
        artCache.set(url, a);
      }
      if (id !== reqId || !cur || cur.view !== 'article') return;
      const fmt = (ymd) => { const [y, mo, d] = String(ymd || '').split('-'); return y ? `${d}.${mo}.${y}` : ''; };
      $body.innerHTML = `
        <button type="button" class="ad-back" data-back>‹ Zurück zum Spiel</button>
        <article class="gc-article rd">
          <div class="rd-kicker">${esc([info.kind, fmt(info.date)].filter(Boolean).join(' · '))}</div>
          <h2>${esc(a.title || info.title)}</h2>
          ${a.lead ? `<p class="rd-lead">${esc(a.lead)}</p>` : ''}
          ${a.paras.map((p) => `<p>${esc(p)}</p>`).join('')}
          ${a.meta ? `<div class="gc-note">${esc(a.meta)}</div>` : ''}
          <div class="gc-note">Quelle: Fussball.de</div>
        </article>`;
    } catch (e) {
      if (id !== reqId || !cur || cur.view !== 'article') return;
      $body.innerHTML = `<button type="button" class="ad-back" data-back>‹ Zurück zum Spiel</button><div class="status error">Der Bericht konnte nicht geladen werden: ${esc(e.message)}</div>`;
    }
  }

  const EV = {
    goal: ['⚽', 'Tor'], penalty: ['⚽', 'Elfmetertor'], owngoal: ['⚽', 'Eigentor'],
    yellow: ['🟨', 'Gelbe Karte'], yellowred: ['🟨🟥', 'Gelb-Rote Karte'], red: ['🟥', 'Rote Karte'], sub: ['🔁', 'Auswechslung'],
  };

  function verlaufHtml(events) {
    if (!cur.m.played || !events?.length) return '';
    const { m, logos } = cur;
    const rows = [...events].sort((a, b) => a.minute - b.minute).map((e) => {
      const [ico, label] = EV[e.type] || ['', e.type];
      const name = e.side === 'home' ? m.home : m.away;
      return `<div class="ad-ev"><span class="gc-time">${esc(e.label)}’</span><span class="hd-tl">${logo(logos[name])}</span><span><span class="ad-ico">${ico}</span> ${esc(label)} <span class="muted">${esc(name)}</span></span></div>`;
    }).join('');
    return section('Spielverlauf', `${rows}<p class="muted ad-note">Fussball.de zeigt Spielernamen, Zwischenstände und einen Teil der Ereignisse (z. B. Tore) nicht lesbar an – die Liste ist deshalb unvollständig. Schiedsrichter, Assistenten und Zuschauer sind dort ebenfalls nicht lesbar.</p>`);
  }

  function render() {
    const d = cur.data;
    const html = ortHtml(d.location, d.times) + vergleichHtml(d.compare) + formSection(d.compare) + verlaufHtml(d.events) + newsHtml(d.news);
    $body.innerHTML = (html || '<div class="gc-empty">Zu diesem Spiel gibt es noch keine lesbaren Angaben.</div>') + linkHtml();
    if (d.compare) {
      // Logos aus der Spielseite nur, wenn die Tabelle keine geliefert hat
      for (const [k, name] of [['home', cur.m.home], ['away', cur.m.away]]) {
        if (!cur.logos[name] && d.logos?.[k]) cur.logos[name] = d.logos[k];
      }
      renderHead();
    }
  }

  window.AmateurDetail = { open, close };
})();

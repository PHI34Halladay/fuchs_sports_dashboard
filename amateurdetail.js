/* Sport Dashboard – Spiel-Popup für Amateurspiele (Fussball.de, SGM I / SGM II und ihre Ligen)
 * Daten über /api/amateurgame: Spielort, Vergleich der Mannschaften, Spielverlauf (Minute, Art, Seite).
 * Torstände zeigt Fussball.de nur verschleiert an; sie werden nicht ausgelesen. Schiedsrichter,
 * Aufstellungen und Spielernamen stehen dort nicht lesbar und fehlen deshalb auch hier.
 * Nutzt dieselben Stilklassen wie das ESPN-/Hockey-Popup.
 */
(() => {
  'use strict';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const logoOk = (u) => !!u && String(u).startsWith('https://www.fussball.de/export.media/');
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
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('.gc-close')) close(); });

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

  function ortHtml(loc) {
    if (!loc) return '';
    const maps = `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: loc })}`;
    return section('Spielort', `<div class="ad-loc"><span>${esc(loc)}</span><a href="${esc(maps)}" target="_blank" rel="noopener noreferrer">Karte ↗</a></div>`);
  }

  const FORM = { S: 'Sieg', U: 'Unentschieden', N: 'Niederlage' };
  const formHtml = (f) => (f ? `<span class="ad-form">${f.map((x) => `<i class="f-${x}" title="${FORM[x]}">${x}</i>`).join('')}</span>` : '–');

  function cmpNum(label, a, b, lowerBetter) {
    if (a == null || b == null) return '';
    const sum = a + b;
    let lp = sum ? (a / sum) * 100 : 50;
    if (lowerBetter && sum) lp = (b / sum) * 100;
    return `<div class="gc-cmp">
      <div class="gc-cmp-top"><span>${esc(a)}</span><span class="muted">${esc(label)}</span><span>${esc(b)}</span></div>
      <div class="gc-cmp-bar"><i style="width:${lp}%;background:var(--c-home)"></i><i style="width:${100 - lp}%;background:var(--c-away)"></i></div>
    </div>`;
  }
  const textRow = (label, a, b) => (a == null && b == null ? '' : `<div class="gc-cmp"><div class="gc-cmp-top"><span>${a ?? '–'}</span><span class="muted">${esc(label)}</span><span>${b ?? '–'}</span></div></div>`);

  function vergleichHtml(c) {
    if (!c) return '';
    const sc = (p) => (p ? `${esc(p.name)} <span class="muted">(${p.goals})</span>` : null);
    const rows = [
      cmpNum('Tabellenplatz', c.home.place, c.away.place, true),
      cmpNum('Punkte', c.home.points, c.away.points),
      textRow('Torverhältnis', c.home.goals && esc(c.home.goals), c.away.goals && esc(c.away.goals)),
      textRow('Form', c.home.form ? formHtml(c.home.form) : null, c.away.form ? formHtml(c.away.form) : null),
      textRow('Bester Torjäger', sc(c.home.scorer), sc(c.away.scorer)),
      textRow('Karten (Team/Offiz.)', c.home.cards && esc(c.home.cards), c.away.cards && esc(c.away.cards)),
    ].join('');
    if (!rows) return '';
    const { m } = cur;
    return section('Mannschaften im Vergleich', `<div class="gc-cmp-head"><span>${esc(m.home)}</span><span>${esc(m.away)}</span></div>${rows}`);
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
    return section('Spielverlauf', `${rows}<p class="muted ad-note">Fussball.de zeigt Spielernamen, Zwischenstände und einen Teil der Ereignisse (z. B. Tore) nicht lesbar an – die Liste ist deshalb unvollständig.</p>`);
  }

  function render() {
    const d = cur.data;
    const html = ortHtml(d.location) + vergleichHtml(d.compare) + verlaufHtml(d.events);
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

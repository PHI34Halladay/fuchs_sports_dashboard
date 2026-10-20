/* Sport Dashboard – gemeinsame Logo-Hilfe für app.js / gamecast.js / profile.js
 * Manche ESPN-Logos (z. B. Ohio State) haben eine eigens fürs Dunkelmodus
 * aufbereitete Variante. Per langem Drücken auf ein Logo lässt sich pro Team
 * dauerhaft (localStorage) auf diese Dark-Variante umschalten – überall in
 * der App, wo das Logo dieses Teams auftaucht.
 */
window.LogoPref = (() => {
  'use strict';
  const KEY = 'sd:darklogos';
  let darkSet;
  try { darkSet = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { darkSet = new Set(); }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify([...darkSet])); } catch { /* egal */ }
  }
  const escAttr = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ESPNs normale Logo-URLs: https://a.espncdn.com/i/teamlogos/<liga>/500/<id>.png
  // Dark-Variante über den Bild-Combiner: .../500-dark/<id>.png
  const RE_LOGO = /^(?:https?:)?\/\/a\.espncdn\.com\/i\/teamlogos\/(.+)\/500\/(\d+)\.png(?:\?.*)?$/;
  function toDark(url) {
    const m = RE_LOGO.exec(url || '');
    if (!m) return null;
    return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${m[1]}/500-dark/${m[2]}.png`;
  }

  function isDark(teamId) { return !!teamId && darkSet.has(String(teamId)); }

  function resolve(teamId, url) {
    if (!url || !teamId) return url;
    if (darkSet.has(String(teamId))) {
      const d = toDark(url);
      if (d) return d;
    }
    return url;
  }

  function toggle(teamId) {
    if (!teamId) return;
    const id = String(teamId);
    if (darkSet.has(id)) darkSet.delete(id); else darkSet.add(id);
    save();
    document.querySelectorAll(`img[data-team-logo="${id}"]`).forEach((img) => {
      const orig = img.dataset.logoOrig || img.src;
      img.src = resolve(id, orig);
    });
  }

  // <img>-HTML für ein Team-Logo: berücksichtigt die gespeicherte Dark-Präferenz
  // und markiert das Element für Long-Press-Umschaltung + Live-Update.
  function img(teamId, url, cls, extraAttrs) {
    if (!url) return '';
    const resolved = resolve(teamId, url);
    return `<img${cls ? ` class="${escAttr(cls)}"` : ''} data-team-logo="${escAttr(teamId)}" data-logo-orig="${escAttr(url)}" src="${escAttr(resolved)}" alt="" loading="lazy"${extraAttrs || ''}>`;
  }

  // ---------- Long-Press-Erkennung (zeigerbasiert, touch + Maus) ----------
  const THRESHOLD_MS = 550;
  const MOVE_TOLERANCE = 10;
  let timer = null, firedLongPress = false, startX = 0, startY = 0, activeEl = null;
  const findLogo = (el) => el && el.closest ? el.closest('[data-team-logo]') : null;

  function clear() { clearTimeout(timer); timer = null; activeEl = null; }

  document.addEventListener('pointerdown', (e) => {
    const logoEl = findLogo(e.target);
    if (!logoEl) return;
    firedLongPress = false;
    startX = e.clientX; startY = e.clientY;
    activeEl = logoEl;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!activeEl) return;
      firedLongPress = true;
      toggle(activeEl.dataset.teamLogo);
      if (navigator.vibrate) { try { navigator.vibrate(20); } catch { /* egal */ } }
      activeEl.classList.add('logo-toggled-flash');
      setTimeout(() => activeEl && activeEl.classList.remove('logo-toggled-flash'), 300);
    }, THRESHOLD_MS);
  });
  document.addEventListener('pointerup', clear);
  document.addEventListener('pointercancel', clear);
  document.addEventListener('pointermove', (e) => {
    if (!timer) return;
    if (Math.abs(e.clientX - startX) > MOVE_TOLERANCE || Math.abs(e.clientY - startY) > MOVE_TOLERANCE) clear();
  });
  // Langer Druck löst sonst ggf. einen Klick (Popup öffnen) oder das Kontextmenü
  // (Bild speichern) aus – beides für diesen Fall unterdrücken.
  document.addEventListener('click', (e) => {
    if (firedLongPress) { e.preventDefault(); e.stopPropagation(); firedLongPress = false; }
  }, true);
  document.addEventListener('contextmenu', (e) => { if (findLogo(e.target)) e.preventDefault(); });

  return { resolve, toggle, isDark, img };
})();

/* Teamfarben: ESPN liefert Primär-/Alternativfarbe je Team. Für Fussball.de- und
 * Hockeyweb-Vereine gibt es keine Farben – dort wird die Hauptfarbe aus dem Vereinslogo
 * gelesen (Canvas, Logo über /api/logo unter eigener Domain) und im Browser gespeichert.
 */
window.TeamColor = (() => {
  'use strict';
  const KEY = 'sd:logocolors';
  let cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { cache = {}; }
  const pending = new Map();

  function norm(c) {
    const s = String(c || '').replace(/^#/, '');
    return /^[0-9a-f]{6}$/i.test(s) ? `#${s.toLowerCase()}` : null;
  }
  function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function lum(hex) {
    return rgb(hex).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  }
  function dist(a, b) {
    if (!a || !b) return 999;
    const [x, y] = [rgb(a), rgb(b)];
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  }
  // Primärfarbe bevorzugen; reines Schwarz/Weiß wirkt als Kartenfarbe leer → dann Alternativfarbe
  function pick(primary, alt) {
    const p = norm(primary), a = norm(alt);
    if (p && lum(p) > 0.012 && lum(p) < 0.82) return p;
    if (a && lum(a) > 0.012 && lum(a) < 0.82) return a;
    return p || a || null;
  }
  // Zwei Teams mit (fast) gleicher Farbe: beim Gast auf die Alternativfarbe ausweichen
  function pair(home, away) {
    const h = pick(home?.color, home?.alt);
    let w = pick(away?.color, away?.alt);
    if (h && w && dist(h, w) < 70) {
      const alt = norm(away?.alt);
      w = alt && dist(h, alt) >= 70 ? alt : '#5b6472';
    }
    return [h, w];
  }

  function proxied(url) {
    return /^https:\/\/(www\.fussball\.de\/export\.media|media\.hockeyweb\.de)\//.test(url || '') ? `/api/logo?u=${encodeURIComponent(url)}` : null;
  }

  // Häufigste "bunte" Farbe des Logos (Weiß, Schwarz und Grautöne zählen kaum)
  function extract(img) {
    const N = 40;
    const cv = document.createElement('canvas');
    cv.width = N; cv.height = N;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, N, N);
    const px = g.getImageData(0, 0, N, N).data;
    const buckets = new Map();
    for (let i = 0; i < px.length; i += 4) {
      const [r, gg, b, al] = [px[i], px[i + 1], px[i + 2], px[i + 3]];
      if (al < 200) continue;
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      const sat = mx ? (mx - mn) / mx : 0;
      if (mx > 235 && sat < 0.12) continue; // weiß
      if (mx < 28) continue;                // schwarz
      const w = sat < 0.18 ? 0.15 : 1 + sat;
      const k = `${r >> 5}-${gg >> 5}-${b >> 5}`;
      const e = buckets.get(k) || { w: 0, r: 0, g: 0, b: 0, n: 0 };
      e.w += w; e.r += r; e.g += gg; e.b += b; e.n++;
      buckets.set(k, e);
    }
    let best = null;
    for (const e of buckets.values()) if (!best || e.w > best.w) best = e;
    if (!best || best.n < 6) return null;
    const h = (v) => Math.round(v / best.n).toString(16).padStart(2, '0');
    return `#${h(best.r)}${h(best.g)}${h(best.b)}`;
  }

  function fromLogo(url) {
    if (!url) return Promise.resolve(null);
    if (url in cache) return Promise.resolve(cache[url]);
    const src = proxied(url);
    if (!src) return Promise.resolve(null);
    if (pending.has(url)) return pending.get(url);
    const p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let c = null;
        try { c = extract(img); } catch { c = null; }
        cache[url] = c;
        try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* egal */ }
        resolve(c);
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
    pending.set(url, p);
    return p;
  }

  // Karten ohne bekannte Farbe (data-lc-home/-away = Logo-URL) nachträglich einfärben
  function paint(root) {
    (root || document).querySelectorAll('[data-lc-home],[data-lc-away]').forEach((el) => {
      ['home', 'away'].forEach((side) => {
        const url = el.getAttribute(`data-lc-${side}`);
        if (!url) return;
        el.removeAttribute(`data-lc-${side}`);
        fromLogo(url).then((c) => { if (c) el.style.setProperty(`--c-${side}`, c); });
      });
    });
  }
  const cached = (url) => (url && cache[url]) || null;

  return { norm, pick, pair, lum, dist, fromLogo, paint, cached };
})();

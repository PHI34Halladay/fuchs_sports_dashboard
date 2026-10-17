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

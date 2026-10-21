/* Sport Dashboard – Übersetzen & Lesemodus
 * window.Translate: übersetzt englische ESPN-Texte ins Deutsche. Reihenfolge: DeepL über /api/translate
 * (falls Schlüssel hinterlegt) → Übersetzer des Browsers (Chrome, auf dem Gerät) → /api/translate
 * mit MyMemory. Ergebnisse werden im Browser zwischengespeichert.
 * window.Reader: öffnet ESPN-News-Artikel in der App (statt espn.com / ESPN-App).
 */
window.Translate = (() => {
  'use strict';
  const LS = 'sd:tr';
  let store;
  try { store = JSON.parse(localStorage.getItem(LS) || '{}'); } catch { store = {}; }
  const mem = new Map();
  let provider = null;

  function save(key, texts) {
    mem.set(key, texts);
    store[key] = { t: Date.now(), x: texts };
    const keys = Object.keys(store).sort((a, b) => store[b].t - store[a].t);
    keys.slice(40).forEach((k) => delete store[k]);
    try { localStorage.setItem(LS, JSON.stringify(store)); } catch { /* voll – egal */ }
  }
  function cached(key) {
    if (mem.has(key)) return mem.get(key);
    if (store[key]?.x) { mem.set(key, store[key].x); return store[key].x; }
    return null;
  }

  async function getProvider() {
    if (provider) return provider;
    try { provider = (await (await fetch('/api/translate')).json()).provider || 'mymemory'; } catch { provider = 'mymemory'; }
    return provider;
  }

  async function onDevice(texts) {
    const T = self.Translator;
    if (!T?.create) return null;
    const opts = { sourceLanguage: 'en', targetLanguage: 'de' };
    // Nur nutzen, wenn das Sprachpaket schon auf dem Gerät ist – ein Download kann lange dauern
    if ((await T.availability(opts)) !== 'available') return null;
    const work = (async () => {
      const tr = await T.create(opts);
      const out = [];
      for (const t of texts) out.push(t.trim() ? await tr.translate(t) : t);
      return out;
    })();
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15_000));
    return Promise.race([work, timeout]);
  }

  async function server(texts) {
    const out = [];
    let batch = [];
    let size = 0;
    const flush = async () => {
      if (!batch.length) return;
      const r = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texts: batch }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Fehler ${r.status}`);
      out.push(...j.texts);
      batch = []; size = 0;
    };
    for (const t of texts) {
      if (size + t.length > 12_000 || batch.length >= 100) await flush();
      batch.push(t); size += t.length;
    }
    await flush();
    return out;
  }

  // texts: Array von Strings; key: stabiler Schlüssel für den Zwischenspeicher
  async function translate(texts, key) {
    const k = `${key}:${texts.join('').length}`;
    const hit = cached(k);
    if (hit && hit.length === texts.length) return hit;
    const p = await getProvider();
    let out = null;
    if (p !== 'deepl') { try { out = await onDevice(texts); } catch { out = null; } }
    if (!out) out = await server(texts);
    save(k, out);
    return out;
  }

  // ESPN-Story ist HTML → nur reinen Text übernehmen (kein fremdes HTML einschleusen)
  function paragraphs(html) {
    if (!html) return [];
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,iframe,aside,figure,photo,video,inline,alsosee').forEach((n) => n.remove());
    const blocks = [...doc.body.querySelectorAll('p,h2,h3,li')].map((n) => n.textContent.trim()).filter(Boolean);
    const list = blocks.length ? blocks : doc.body.textContent.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    return list.map((s) => s.replace(/^\s*—\s*/, '').replace(/--\s*—\s*/, '-- ')).filter((s) => !/^(click here|follow|subscribe)/i.test(s));
  }

  // Einheitlicher Knopf: state = 'en' | 'loading' | 'de' | 'error'
  function button(state, err) {
    if (state === 'loading') return '<button type="button" class="tr-btn" disabled><span class="tr-spin"></span>Wird übersetzt …</button>';
    if (state === 'de') return '<button type="button" class="tr-btn on" data-tr="toggle">🇬🇧 Original anzeigen</button><span class="tr-note">Maschinell übersetzt</span>';
    return `<button type="button" class="tr-btn" data-tr="toggle">🇩🇪 Auf Deutsch übersetzen</button>${state === 'error' ? `<span class="tr-note err">${String(err || 'Übersetzung fehlgeschlagen').replace(/[<>&]/g, '')}</span>` : ''}`;
  }

  return { translate, paragraphs, button };
})();

window.Reader = (() => {
  'use strict';
  let ctx = null; // { api, esc }
  let cur = null; // { item, league, data, de, state, err }

  const dlg = document.createElement('dialog');
  dlg.className = 'gc reader';
  dlg.innerHTML = `
    <div class="gc-shell">
      <button class="gc-close" aria-label="Schließen">×</button>
      <div class="gc-scroll" id="rdScroll"><div class="rd-body" id="rdBody"></div></div>
    </div>`;
  document.body.appendChild(dlg);
  const $body = dlg.querySelector('#rdBody');

  function close() { cur = null; if (dlg.open) dlg.close(); document.body.classList.remove('modal-open'); }
  dlg.addEventListener('close', () => { cur = null; document.body.classList.remove('modal-open'); });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('.gc-close')) { close(); return; }
    if (e.target.closest('[data-tr="toggle"]')) { toggle(); return; }
    const vf = e.target.closest('.gc-video-frame[data-video-src]');
    if (vf) vf.outerHTML = `<div class="gc-video-frame gc-video-playing"><video controls autoplay playsinline src="${ctx.esc(vf.dataset.videoSrc)}"></video></div>`;
  });

  // Artikel-Inhalt: Überschrift, Beschreibung, Absätze (aus content.core) oder Fallback aus der Liste
  function texts() {
    const h = cur.data || {};
    const paras = window.Translate.paragraphs(h.story || '');
    return { headline: h.headline || cur.item.headline || '', desc: h.description || cur.item.description || '', paras };
  }

  function render() {
    const esc = ctx.esc;
    const it = cur.item;
    const h = cur.data || {};
    const t = texts();
    const show = cur.state === 'de' && cur.de ? { headline: cur.de[0], desc: cur.de[1], paras: cur.de.slice(2) } : t;
    const img = (h.images || it.images || []).find((x) => x.url && x.type !== 'Media')?.url || (h.images || it.images || []).find((x) => x.url)?.url;
    const vid = (h.video || []).find((v) => v.links?.source?.href);
    const mp4 = vid?.links?.source?.HD?.href || vid?.links?.source?.href;
    const when = (h.published || it.published) ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(h.published || it.published)) : '';
    const by = [h.byline || it.byline, when].filter(Boolean).join(' · ');
    const media = mp4
      ? `<div class="gc-video-frame" data-video-src="${esc(mp4)}">${vid.thumbnail ? `<img src="${esc(vid.thumbnail)}" alt="">` : ''}<span class="gc-video-play">▶</span></div>`
      : img ? `<img class="rd-img" src="${esc(img)}" alt="">` : '';
    const loading = cur.loading ? '<div class="gc-loading"><div class="skeleton"></div><div class="skeleton"></div></div>' : '';
    const body = show.paras.length
      ? show.paras.map((p) => `<p>${esc(p)}</p>`).join('')
      : (!cur.loading ? `<p class="muted">${cur.loadErr ? 'Der Volltext konnte nicht geladen werden.' : 'Zu diesem Beitrag gibt es keinen Text.'}</p>` : '');
    $body.innerHTML = `
      <article class="gc-article rd">
        ${media}
        <div class="rd-kicker">${esc(cur.league || '')}${it.type === 'Media' ? ' · Video' : ''}</div>
        <h2>${esc(show.headline)}</h2>
        ${show.desc && show.desc !== show.headline ? `<p class="rd-lead">${esc(show.desc)}</p>` : ''}
        ${by ? `<div class="muted rd-by">${esc(by)}</div>` : ''}
        ${!cur.loading && (t.paras.length || t.headline) ? `<div class="tr-bar">${window.Translate.button(cur.state, cur.err)}</div>` : ''}
        ${loading}${body}
        <div class="gc-note">${cur.state === 'de' ? 'Maschinell übersetzt aus dem Englischen · ' : ''}Quelle: ESPN</div>
      </article>`;
  }

  async function toggle() {
    if (!cur || cur.state === 'loading') return;
    if (cur.state === 'de') { cur.state = 'en'; render(); return; }
    if (cur.de) { cur.state = 'de'; render(); return; }
    const t = texts();
    cur.state = 'loading'; render();
    const mine = cur;
    try {
      mine.de = await window.Translate.translate([t.headline, t.desc, ...t.paras], `news:${mine.item.id}`);
      mine.state = 'de';
    } catch (e) { mine.state = 'error'; mine.err = e.message; }
    if (cur === mine) render();
  }

  // item: Artikel aus der ESPN-News-Liste; league: { sport, league, name }
  async function open(item, league) {
    cur = { item, league: league?.name, data: null, state: 'en', loading: true };
    const mine = cur;
    render();
    dlg.querySelector('#rdScroll').scrollTop = 0;
    if (!dlg.open) dlg.showModal();
    document.body.classList.add('modal-open');
    try {
      const j = await ctx.api('article', { id: item.id }, league);
      mine.data = (j.headlines || [])[0] || null;
    } catch { mine.loadErr = true; }
    mine.loading = false;
    if (cur === mine) render();
  }

  return { init(c) { ctx = c; }, open, close };
})();

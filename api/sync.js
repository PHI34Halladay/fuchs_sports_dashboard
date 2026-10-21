// Vercel Serverless Function: geräteübergreifende Speicherung von Favoriten-Teams und gemerkten Spielen.
// Geräte werden über einen Sync-Code verknüpft (16 Zeichen, nur im Browser des Nutzers bekannt).
// Gespeichert wird in Vercel Blob unter sync/<SHA-256 des Codes>/… – der Code selbst liegt nirgends.
//
// GET  /api/sync?code=XXXX            → { items }
// POST /api/sync  { code, items }     → führt zusammen (neuester Zeitstempel je Eintrag gewinnt), speichert, → { items }
//
// items: { "f:<liga>:<team>": { t, on }, "p:<spiel>": { t, on, data } }   (on=false = gelöscht, bleibt als Grabstein)

const crypto = require('crypto');
const { put, list, del } = require('@vercel/blob');

const RE_CODE = /^[A-Z2-9]{16}$/;
const MAX_ITEMS = 3000;
const MAX_BODY = 400_000;

const prefixFor = (code) => `sync/${crypto.createHash('sha256').update(`sport-dashboard:${code}`).digest('hex')}/`;

async function load(prefix) {
  const { blobs } = await list({ prefix, limit: 100 });
  if (!blobs.length) return { items: {}, blobs };
  blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  const r = await fetch(blobs[0].url, { cache: 'no-store' });
  const doc = r.ok ? await r.json() : {};
  return { items: doc.items || {}, blobs };
}

function clean(items) {
  const out = {};
  const cutoff = Date.now() - 90 * 864e5;
  for (const [k, v] of Object.entries(items || {})) {
    if (!/^[fp]:[\w:.\-äöüß]{1,160}$/i.test(k) || !v || typeof v.t !== 'number') continue;
    // alte Grabsteine und lange vergangene gemerkte Spiele verwerfen
    if (!v.on && v.t < cutoff) continue;
    const e = { t: v.t, on: !!v.on };
    if (k.startsWith('p:') && v.on && v.data && typeof v.data === 'object') {
      const d = v.data;
      if (d.day && String(d.day) < new Date(cutoff).toISOString().slice(0, 10).replace(/-/g, '')) continue;
      e.data = {
        key: String(d.key || '').slice(0, 160), lg: String(d.lg || '').slice(0, 20), id: d.id != null ? String(d.id).slice(0, 40) : undefined,
        day: String(d.day || '').slice(0, 8), date: d.date ? String(d.date).slice(0, 40) : undefined, time: d.time ? String(d.time).slice(0, 10) : undefined,
        home: String(d.home || '').slice(0, 80), away: String(d.away || '').slice(0, 80),
      };
    }
    out[k] = e;
  }
  return out;
}

function merge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) if (!out[k] || v.t > out[k].t) out[k] = v;
  return out;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.BLOB_READ_WRITE_TOKEN) { res.status(503).json({ error: 'Sync-Speicher ist nicht eingerichtet' }); return; }
  try {
    let body = req.body;
    if (typeof body === 'string') { if (body.length > MAX_BODY) throw new Error('zu groß'); body = JSON.parse(body || '{}'); }
    const code = String((req.method === 'POST' ? body?.code : req.query?.code) || '').toUpperCase();
    if (!RE_CODE.test(code)) { res.status(400).json({ error: 'Ungültiger Sync-Code' }); return; }
    const prefix = prefixFor(code);
    const stored = await load(prefix);

    if (req.method !== 'POST') { res.status(200).json({ items: clean(stored.items) }); return; }

    const incoming = clean(body.items);
    if (Object.keys(incoming).length > MAX_ITEMS) { res.status(413).json({ error: 'Zu viele Einträge' }); return; }
    const merged = merge(clean(stored.items), incoming);
    const changed = JSON.stringify(merged) !== JSON.stringify(clean(stored.items));
    if (changed || !stored.blobs.length) {
      // Jede Version bekommt eine eigene URL (keine veralteten CDN-Kopien); ältere werden gelöscht.
      await put(`${prefix}state.json`, JSON.stringify({ v: 1, items: merged }), {
        access: 'public', addRandomSuffix: true, contentType: 'application/json', cacheControlMaxAge: 60,
      });
      if (stored.blobs.length) await del(stored.blobs.map((b) => b.url)).catch(() => {});
    }
    res.status(200).json({ items: merged });
  } catch (e) {
    res.status(500).json({ error: `Sync fehlgeschlagen: ${e.message}` });
  }
};

// Vercel Serverless Function: übersetzt ESPN-Texte (Spielberichte, News) ins Deutsche.
//
// GET  /api/translate                 → { provider }        (welcher Dienst aktiv ist)
// GET  /api/translate?q=Hello         → { texts, provider } (Kurztest, max. 300 Zeichen)
// POST /api/translate { texts: [...] } → { texts, provider }
//
// Dienst: DeepL, wenn die Umgebungsvariable DEEPL_API_KEY gesetzt ist (kostenloser „DeepL API Free“-
// Schlüssel endet auf ":fx"), sonst MyMemory (kostenlos ohne Schlüssel, aber mit Tageslimit).

const MAX_TEXTS = 120;
const MAX_CHARS = 25_000;
const KEY = process.env.DEEPL_API_KEY || '';
const PROVIDER = KEY ? 'deepl' : 'mymemory';

async function deepl(texts) {
  const host = KEY.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com';
  const r = await fetch(`https://${host}/v2/translate`, {
    method: 'POST',
    headers: { Authorization: `DeepL-Auth-Key ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: texts, source_lang: 'EN', target_lang: 'DE', preserve_formatting: true }),
  });
  if (r.status === 456) throw new Error('DeepL-Kontingent für diesen Monat aufgebraucht');
  if (!r.ok) throw new Error(`DeepL antwortet mit ${r.status}`);
  const j = await r.json();
  return (j.translations || []).map((t) => t.text);
}

// MyMemory: max. ~500 Zeichen pro Anfrage → an Satzgrenzen teilen
function chunks(text, max = 480) {
  if (text.length <= max) return [text];
  const out = [];
  let cur = '';
  for (const s of text.match(/[^.!?]+[.!?]+["'”’)]*\s*|[^.!?]+$/g) || [text]) {
    if ((cur + s).length > max && cur) { out.push(cur); cur = ''; }
    if (s.length > max) { for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max)); continue; }
    cur += s;
  }
  if (cur) out.push(cur);
  return out;
}
const decode = (s) => String(s || '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

async function mymemory(texts) {
  const jobs = [];
  texts.forEach((t, i) => chunks(t).forEach((c, k) => jobs.push({ i, k, c })));
  const res = new Array(jobs.length);
  let next = 0;
  let quota = false;
  async function worker() {
    while (next < jobs.length) {
      const n = next++;
      const { c } = jobs[n];
      if (!c.trim()) { res[n] = c; continue; }
      const r = await fetch(`https://api.mymemory.translated.net/get?${new URLSearchParams({ q: c, langpair: 'en|de' })}`);
      const j = r.ok ? await r.json() : null;
      const t = j?.responseData?.translatedText;
      if (!t || j.responseStatus === 429 || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(t)) { quota = true; res[n] = c; continue; }
      res[n] = decode(t);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  if (quota && res.every((x, n) => x === jobs[n].c)) throw new Error('Kostenloses Übersetzungslimit für heute erreicht');
  const out = texts.map(() => []);
  jobs.forEach((j, n) => { out[j.i][j.k] = res[n]; });
  return out.map((parts) => parts.join(' ').replace(/\s+/g, ' ').trim());
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    let texts;
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body || '{}');
      texts = Array.isArray(body?.texts) ? body.texts.map((t) => String(t ?? '')) : null;
    } else if (req.query?.q) {
      texts = [String(req.query.q).slice(0, 300)];
    } else {
      res.status(200).json({ provider: PROVIDER });
      return;
    }
    if (!texts || !texts.length) { res.status(400).json({ error: 'Kein Text' }); return; }
    if (texts.length > MAX_TEXTS || texts.reduce((n, t) => n + t.length, 0) > MAX_CHARS) { res.status(413).json({ error: 'Text zu lang' }); return; }
    const out = PROVIDER === 'deepl' ? await deepl(texts) : await mymemory(texts);
    res.status(200).json({ texts: out, provider: PROVIDER });
  } catch (e) {
    res.status(502).json({ error: e.message || 'Übersetzung fehlgeschlagen' });
  }
};

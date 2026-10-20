// Vercel Serverless Function: reicht Vereinslogos von Fussball.de / Hockeyweb unter eigener
// Domain durch, damit der Browser die Hauptfarbe per Canvas auslesen kann (fremde Bilder
// ohne CORS-Header lassen sich sonst nicht auswerten). Nur diese beiden Quellen sind erlaubt.

const ALLOWED = [/^https:\/\/www\.fussball\.de\/export\.media\//, /^https:\/\/media\.hockeyweb\.de\//];
const MAX_BYTES = 600_000;

module.exports = async function handler(req, res) {
  const u = String((req.query || {}).u || '');
  if (!ALLOWED.some((re) => re.test(u)) || u.length > 400) {
    res.status(400).json({ error: 'Quelle nicht erlaubt' });
    return;
  }
  try {
    const up = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; sport-dashboard/2.0)', Accept: 'image/*' } });
    const type = up.headers.get('content-type') || '';
    if (!up.ok || !/^image\//.test(type)) { res.status(502).json({ error: `Logo nicht verfügbar (${up.status})` }); return; }
    const buf = Buffer.from(await up.arrayBuffer());
    if (buf.length > MAX_BYTES) { res.status(413).json({ error: 'Logo zu groß' }); return; }
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=2592000');
    res.status(200).send(buf);
  } catch {
    res.status(502).json({ error: 'Logo nicht erreichbar' });
  }
};

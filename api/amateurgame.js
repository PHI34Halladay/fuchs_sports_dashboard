// Vercel Serverless Function: Details zu einem Amateur-Spiel für das Popup.
// Aufruf: /api/amateurgame?url=<Spielseite auf fussball.de>
// Erlaubt sind nur Spielseiten von www.fussball.de (siehe gameId in _fussballde.js) – kein offener Proxy.
//
// Geliefert wird nur, was auf Fussball.de lesbar im HTML steht: Spielort, Vergleich der Mannschaften
// (Platz, Punkte, Tore, Form, Torjäger, Karten), Anpfiff/Abpfiff, Vor-/Spielberichte und der Spielverlauf
// (Minute, Art, Seite). Schiedsrichter, Zuschauer, Aufstellungen, Spielernamen und Zwischenstände sind dort
// verschleiert oder fehlen und werden nicht ausgelesen.

const { gameId, courseUrl, parseGamePage, parseCourse, isArticleUrl, parseArticle } = require('./_fussballde');

const UA = 'Mozilla/5.0 (compatible; sport-dashboard/1.12; privates Hobbyprojekt)';
const TTL = 1800;

async function get(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,*/*', 'Accept-Language': 'de-DE,de;q=0.9' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Fussball.de antwortet mit ${res.status}`);
  return res.text();
}

// /api/amateurgame?article=<Bericht auf fussball.de> liefert den Text eines Vor-/Spielberichts.
async function handleArticle(url, res) {
  if (!isArticleUrl(url)) {
    res.status(400).json({ error: 'Ungültiger Bericht' });
    return;
  }
  try {
    const article = parseArticle(await get(url));
    if (!article) {
      res.status(404).json({ error: 'Der Bericht enthält keinen lesbaren Text' });
      return;
    }
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=14400');
    res.status(200).json({ url, ...article });
  } catch (e) {
    res.status(502).json({ error: e.message || 'Fussball.de nicht erreichbar' });
  }
}

async function handler(req, res) {
  if ((req.query || {}).article) {
    await handleArticle(String(req.query.article), res);
    return;
  }
  const url = String((req.query || {}).url || '');
  const id = gameId(url);
  if (!id) {
    res.status(400).json({ error: 'Ungültige Spielseite' });
    return;
  }

  const [page, course] = await Promise.allSettled([get(url), get(courseUrl(id))]);
  if (page.status !== 'fulfilled') {
    res.status(502).json({ error: page.reason?.message || 'Fussball.de nicht erreichbar' });
    return;
  }
  const info = parseGamePage(page.value);
  const events = course.status === 'fulfilled' ? parseCourse(course.value) : [];

  res.setHeader('Cache-Control', `public, s-maxage=${TTL}, stale-while-revalidate=${TTL * 4}`);
  res.status(200).json({
    id,
    url,
    location: info.location,
    compare: info.compare,
    logos: info.logos,
    times: info.times,
    news: info.news,
    events,
    errors: course.status === 'fulfilled' ? [] : [`Spielverlauf: ${course.reason?.message || 'nicht erreichbar'}`],
    fetchedAt: new Date().toISOString(),
  });
}

module.exports = handler;

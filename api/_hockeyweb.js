// Hockeyweb-Anbindung für den Eishockey-Reiter (DEL, DEL2, Oberliga Süd/Nord, NL, ICEHL, CHL).
//
// Hockeyweb.de hat keine JSON-API. Ergebnisse, Spielplan und Tabellen sind serverseitig gerenderte
// HTML-Seiten (robots.txt erlaubt den Abruf), die hier ausgelesen werden:
//   /{liga}/ergebnisse[/{staffel}][?page=N]   gespielte Spiele, eine Seite = eine Spielwoche
//   /{liga}/spielplan[/{staffel}][?page=N]    kommende Spiele, eine Seite = eine Spielwoche
//   /{liga}/tabelle                           Tabelle (Oberliga: Süd und Nord auf einer Seite)
// Ohne ?page zeigt "Ergebnisse" die letzte, "Spielplan" die erste Spielwoche. Die Auswahlliste der
// Spielwochen ("15. Okt - 18. Okt") dient hier als Kalender, um die Seite zu einem Datum zu finden.
//
// Dateien mit Unterstrich-Präfix werden von Vercel nicht als eigene Function veröffentlicht.

const BASE = 'https://www.hockeyweb.de';
const LOGO_HOST = 'https://media.hockeyweb.de/';

// Nur diese Ligen sind abrufbar (kein offener Proxy). sub = Staffel-Pfad (Oberliga).
const LEAGUES = {
  del: { name: 'DEL', path: 'del' },
  del2: { name: 'DEL2', path: 'del2' },
  obs: { name: 'Oberliga Süd', path: 'oberliga', sub: 'süd' },
  obn: { name: 'Oberliga Nord', path: 'oberliga', sub: 'nord' },
  nl: { name: 'NL', path: 'nl' },
  icehl: { name: 'ICEHL', path: 'icehl' },
  chl: { name: 'CHL', path: 'chl' },
};

function pageUrl(lg, kind, page) {
  const sub = lg.sub ? `/${encodeURIComponent(lg.sub)}` : '';
  const qs = page ? `?page=${Number(page)}` : '';
  return `${BASE}/${lg.path}/${kind}${sub}${qs}`;
}
const tableUrl = (lg) => `${BASE}/${lg.path}/tabelle`;
const publicUrl = (lg, kind) => `${BASE}/${lg.path}/${kind}${lg.sub ? `/${encodeURIComponent(lg.sub)}` : ''}`;

// ---------- kleine HTML-Helfer (ohne Abhängigkeiten) ----------
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
};

function decode(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? m;
  });
}

const text = (html) => decode(String(html ?? '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

function attr(tag, name) {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? decode(m[1] ?? m[2]) : null;
}

// Logo nur akzeptieren, wenn es vom Hockeyweb-Medienserver stammt.
function safeLogo(src) {
  if (!src) return null;
  const u = src.startsWith('//') ? `https:${src}` : src;
  return u.startsWith(LOGO_HOST) ? u : null;
}

const imgsOf = (html) => [...String(html).matchAll(/<img\b[^>]*>/gi)]
  .map((m) => ({ src: safeLogo(attr(m[0], 'src')), alt: attr(m[0], 'alt') || '' }))
  .filter((i) => i.src);

const teamName = (alt) => alt.replace(/\s+Logo$/i, '').trim();

const pad = (n) => String(n).padStart(2, '0');

// Zeitpunkt → { date: 'YYYY-MM-DD', time: 'HH:MM' } in deutscher Zeit
function berlin(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const g = (t) => parts.find((p) => p.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
}

// ---------- Spiele (Ergebnisse + Spielplan haben dieselben Spielkarten) ----------
// Jede Karte hat class="gamePlanGame", einen Link /{liga}/spiele/{heim}-{gast}-{JJJJMMTT}-{id},
// zwei Vereinslogos (alt="<Verein> Logo"), bei gespielten Spielen den Endstand als
// <span>2</span><span>:</span><span>1</span>, danach die Drittel und ggf. "OT"/"PSO".
function parseGames(html) {
  const chunks = String(html || '').split(/class="[^"]*\bgamePlanGame\b[^"]*"/i).slice(1);
  const out = [];
  for (let chunk of chunks) {
    // Karte endet spätestens an der nächsten Tagesüberschrift bzw. am Seitenende
    const cut = chunk.search(/<h[1-6]\b|<\/main>|<footer\b/i);
    if (cut >= 0) chunk = chunk.slice(0, cut);

    // Slug kann Umlaute prozent-kodiert enthalten (z. B. berlin-m%C3%BCnchen-20261016-16761)
    const link = /href="(\/[a-z0-9-]+\/spiele\/[^"\/?#]+?-(\d{4})(\d{2})(\d{2})-(\d+))"/i.exec(chunk);
    if (!link) continue;
    const imgs = imgsOf(chunk);
    if (imgs.length < 2) continue;

    // Ohne Sponsor-/Wettlinks auswerten
    const body = chunk.replace(/<a\b[^>]*\bsponsored\b[\s\S]*?<\/a>/gi, '');

    const pairs = [...body.matchAll(/<span\b[^>]*>\s*(\d{1,2})\s*<\/span>\s*<span\b[^>]*>\s*:\s*<\/span>\s*<span\b[^>]*>\s*(\d{1,2})\s*<\/span>/g)]
      .map((m) => [Number(m[1]), Number(m[2])]);
    const plain = text(body);
    if (!pairs.length) {
      // Fallback: Stand als Text "2 : 1" (mit Leerzeichen, damit Uhrzeiten wie 19:30 nicht passen)
      const m = /(?:^|\s)(\d{1,2}) : (\d{1,2})(?:\s|$)/.exec(plain);
      if (m) pairs.push([Number(m[1]), Number(m[2])]);
    }
    const marker = /(?:>|\s)(OT|PSO)(?:<|\s|$)/.exec(body);

    let date = `${link[2]}-${link[3]}-${link[4]}`;
    let time = null;
    const dt = /<time\b[^>]*\bdatetime="([^"]+)"/i.exec(body);
    if (dt) {
      const b = berlin(new Date(decode(dt[1])));
      if (b) { date = b.date; time = b.time; }
    }
    if (!time) {
      const t = /(?:^|[^\d:])([01]\d|2[0-3]):([0-5]\d)(?![\d:])/.exec(plain);
      if (t) time = `${t[1]}:${t[2]}`;
    }

    const played = pairs.length > 0;
    out.push({
      id: link[5],
      url: `${BASE}${link[1]}`,
      date,
      time,
      played,
      ot: played && marker ? marker[1] : null,
      home: { name: teamName(imgs[0].alt), logo: imgs[0].src, score: played ? pairs[0][0] : null },
      away: { name: teamName(imgs[1].alt), logo: imgs[1].src, score: played ? pairs[0][1] : null },
      periods: pairs.slice(1),
    });
  }
  return out;
}

// ---------- Spielwochen-Kalender ----------
const MONTHS = { jan: 1, feb: 2, mär: 3, mar: 3, mrz: 3, apr: 4, mai: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dez: 12 };
const monthNo = (s) => MONTHS[String(s).toLowerCase().replace(/\./g, '').slice(0, 3)] || null;

// Saison aus dem Seitentitel ("... 2026/2027 ...") → Startjahr
function seasonStartYear(html) {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const m = /(\d{4})\s*\/\s*(\d{4})/.exec(title ? title[1] : html);
  return m ? Number(m[1]) : null;
}

// Liefert [{ page, from, to, selected }] aus der Spielwochen-Auswahl ("15. Okt - 18. Okt").
// Monate ab Juli gehören zum Startjahr der Saison, davor zum Folgejahr.
function parseWeeks(html) {
  const start = seasonStartYear(html);
  if (!start) return [];
  const yearOf = (month) => (month >= 7 ? start : start + 1);
  const weeks = [];
  for (const m of String(html).matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)) {
    const value = attr(`<o ${m[1]}>`, 'value') || '';
    const pg = /[?&]page=(\d+)/.exec(value);
    const range = /^(\d{1,2})\.\s*([A-Za-zäÄ]+)\.?\s*[-–]\s*(\d{1,2})\.\s*([A-Za-zäÄ]+)\.?$/.exec(text(m[2]));
    if (!pg || !range) continue;
    const m1 = monthNo(range[2]);
    const m2 = monthNo(range[4]);
    if (!m1 || !m2) continue;
    weeks.push({
      page: Number(pg[1]),
      from: `${yearOf(m1)}-${pad(m1)}-${pad(Number(range[1]))}`,
      to: `${yearOf(m2)}-${pad(m2)}-${pad(Number(range[3]))}`,
      selected: /\bselected\b/i.test(m[1]),
    });
  }
  return weeks.sort((a, b) => a.page - b.page);
}

// ---------- Tabelle ----------
const rowsOf = (html) => String(html || '').match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
const toInt = (s) => {
  const n = parseInt(String(s).replace(/[−–]/g, '-').replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};

// Eine Tabellenzeile: <th> (Platz, Logo, Name) + 8 <td>: Pt., Sp., S, OTS, OTN, N, T, G
function parseRow(row) {
  const th = /<th\b[^>]*>([\s\S]*?)<\/th>/i.exec(row);
  const tds = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => toInt(text(m[1])));
  if (!th || tds.length < 8 || tds.slice(0, 8).some((n) => n == null)) return null;
  const rank = /<span\b[^>]*>\s*(\d{1,2})\s*<\/span>/i.exec(th[1]);
  const img = imgsOf(th[1])[0];
  if (!rank || !img || !teamName(img.alt)) return null;
  const [points, played, won, otw, otl, lost, gf, ga] = tds;
  return { rank: Number(rank[1]), team: teamName(img.alt), logo: img.src, played, won, otw, otl, lost, gf, ga, diff: gf - ga, points };
}

// Gruppen anhand der <h2>-Überschriften ("Süd", "Nord", "Hauptrunde" …); ohne Überschrift eine Gruppe.
function parseStandings(html, sub) {
  const src = String(html || '');
  const heads = [...src.matchAll(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi)];
  let groups;
  if (!heads.length) {
    groups = [{ name: '', body: src }];
  } else {
    groups = heads.map((h, i) => ({
      name: text(h[2]),
      id: attr(`<h ${h[1]}>`, 'id') || '',
      body: src.slice(h.index + h[0].length, i + 1 < heads.length ? heads[i + 1].index : undefined),
    }));
  }
  let out = groups
    .map((g) => ({ name: g.name, table: rowsOf(g.body).map(parseRow).filter(Boolean), id: g.id }))
    .filter((g) => g.table.length);
  if (sub) {
    const want = sub === 'süd' ? /s(ü|ue)d/i : new RegExp(sub, 'i');
    out = out.filter((g) => want.test(g.id) || want.test(g.name));
  }
  return out.map(({ name, table }) => ({ name, table }));
}

module.exports = { LEAGUES, pageUrl, tableUrl, publicUrl, parseGames, parseWeeks, parseStandings, seasonStartYear };

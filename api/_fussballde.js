// Fussball.de-Anbindung für die Amateurfußball-Ansicht (SGM I / SGM II).
//
// Fussball.de hat keine offene API. Die Mannschaftsseiten laden Tabelle und Spielplan
// aber als HTML-Fragmente (ajax.team.*), die hier ausgelesen werden.
//
// WICHTIG: Torstände zeigt Fussball.de nur verschleiert an (jede Ziffer ist ein Sonderzeichen,
// lesbar nur mit einer seitenspezifischen Schriftart). Das wird bewusst NICHT umgangen –
// gespielte Spiele erscheinen daher ohne Ergebnis, mit Link zum Spielbericht.
//
// Dateien mit Unterstrich-Präfix werden von Vercel nicht als eigene Function veröffentlicht.

const BASE = 'https://www.fussball.de';

// Nur diese Mannschaften sind abrufbar (kein offener Proxy). Neue Saison: saison/staffelId anpassen.
const TEAMS = {
  sgm1: {
    name: 'SGM I',
    ownName: 'SGM FC Gündelbach/TSV Häfnerhaslach',
    league: 'Kreisliga B6 · Bezirk Enz/Murr',
    saison: '2627',
    teamId: '011MIFCO1C000000VTVG0001VTR8C1K7',
    staffelId: '031C3RL15S000008VS5489BUVUR5FS5A-G',
    slug: 'sgm-fc-guendelbach-tsv-haefnerhaslach-fc-guendelbach-wuerttemberg',
  },
  sgm2: {
    name: 'SGM II',
    ownName: 'SGM FC Gündelbach/TSV Häfnerhaslach II',
    league: 'Kreisliga B8 · Bezirk Enz/Murr',
    saison: '2627',
    teamId: '030VA0MFKC000000VS5489BSVVHO3SPG',
    staffelId: '031C3RL1G0000007VS5489BUVUR5FS5A-G',
    slug: 'sgm-fc-guendelbach-tsv-haefnerhaslach-ii-fc-guendelbach-wuerttemberg',
  },
};

// Spielpläne beliebiger Mannschaften (für die Liga-Gesamtansicht)
function teamUrls(teamId) {
  return {
    next: `${BASE}/ajax.team.matchplan/-/mode/PAGE/team-id/${teamId}`,
    prev: `${BASE}/ajax.team.prev.games/-/mode/PAGE/team-id/${teamId}`,
  };
}

function urlsFor(t) {
  return {
    page: `${BASE}/mannschaft/${t.slug}/-/saison/${t.saison}/team-id/${t.teamId}`,
    table: `${BASE}/ajax.team.table/-/saison/${t.saison}/staffel/${t.staffelId}/team-id/${t.teamId}`,
    next: `${BASE}/ajax.team.matchplan/-/mode/PAGE/team-id/${t.teamId}`,
    prev: `${BASE}/ajax.team.prev.games/-/mode/PAGE/team-id/${t.teamId}`,
  };
}

// ---------- kleine HTML-Helfer (ohne Abhängigkeiten) ----------
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
};

function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? m;
  });
}

function text(html) {
  return decode(String(html ?? '').replace(/<[^>]*>/g, ' '))
    .replace(/​/g, '') // Zero-Width-Spaces in Mannschaftsnamen
    .replace(/\s+/g, ' ')
    .trim();
}

const rowsOf = (html) => String(html || '').match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
const classOf = (row) => (/<tr\b[^>]*\bclass="([^"]*)"/i.exec(row) || [, ''])[1];
const cellsOf = (row) => [...row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)].map((m) => ({ attrs: m[1], html: m[2], text: text(m[2]) }));
const clubNames = (row) => [...row.matchAll(/class="club-name"[^>]*>([\s\S]*?)<\/div>/gi)].map((m) => text(m[1]));
const toInt = (s) => {
  const n = parseInt(String(s).replace(/[−–]/g, '-').replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};

// ---------- Tabelle ----------
// Logo-URL nur akzeptieren, wenn sie vom Fussball.de-Logodienst stammt.
function logoUrl(row) {
  const m = /<img\b[^>]*\bsrc="([^"]+)"/i.exec(row);
  if (!m) return null;
  const u = decode(m[1]);
  const abs = u.startsWith('//') ? `https:${u}` : u;
  if (!abs.startsWith('https://www.fussball.de/export.media/')) return null;
  // Der Logodienst liefert je nach "format" andere Größen (0 = 80 px, 9 = 200 px): immer die große nehmen.
  return abs.replace(/\/format\/\d+\//, '/format/9/');
}

function parseTable(html) {
  const out = [];
  for (const row of rowsOf(html)) {
    if (!/column-rank/.test(row)) continue;
    const cells = cellsOf(row);
    const clubIdx = cells.findIndex((c) => /column-club/.test(c.attrs));
    const rankCell = cells.find((c) => /column-rank/.test(c.attrs));
    if (clubIdx < 0 || !rankCell) continue;
    const s = cells.slice(clubIdx + 1).map((c) => c.text);
    if (s.length < 7) continue;
    const goals = /(\d+)\s*:\s*(\d+)/.exec(s[4]);
    out.push({
      rank: toInt(rankCell.text),
      team: clubNames(row)[0] || cells[clubIdx].text,
      played: toInt(s[0]),
      won: toInt(s[1]),
      drawn: toInt(s[2]),
      lost: toInt(s[3]),
      gf: goals ? Number(goals[1]) : null,
      ga: goals ? Number(goals[2]) : null,
      diff: toInt(s[5]),
      points: toInt(s[6]),
      own: /\bown\b/.test(classOf(row)),
      teamId: ((/\/team-id\/([0-9A-Za-z]+)/.exec(row) || [])[1]) || null,
      logo: logoUrl(row),
    });
  }
  return out;
}

// ---------- Spiele ----------
function absUrl(href) {
  const h = decode(href);
  if (h.startsWith('https://www.fussball.de/')) return h;
  if (h.startsWith('/') && !h.startsWith('//')) return BASE + h;
  return null;
}

// Verschleierte Torstände erkennt man an nicht-leerem Inhalt in .score-left/.score-right
// (Private-Use-Zeichen). Gelesen wird er nicht – nur "es gibt einen Spielstand".
function hasHiddenScore(row) {
  const m = /<span[^>]*class="score-left"[^>]*>([^<]*)<\/span>/i.exec(row);
  // Nur Private-Use-Zeichen zählen; Leerraum/&nbsp; in noch nicht gespielten Spielen nicht.
  return !!m && /[-]/.test(decode(m[1]));
}

// Aktueller Zeitpunkt in Berlin als "YYYY-MM-DDTHH:MM" (lexikografisch mit Spielterminen vergleichbar).
function berlinNow() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

function parseMatches(html, ownName, { forcePlayed = false, now = berlinNow() } = {}) {
  const own = text(ownName);
  const out = [];
  let ctx = null;
  for (const row of rowsOf(html)) {
    const cls = classOf(row);

    if (/\brow-headline\b/.test(cls)) {
      const t = text(row);
      const d = /(\d{2})\.(\d{2})\.(\d{4})/.exec(t);
      const tm = /(\d{1,2}):(\d{2})/.exec(t);
      const comp = t.includes('|') ? t.split('|').pop().trim() : '';
      ctx = d
        ? { date: `${d[3]}-${d[2]}-${d[1]}`, time: tm ? `${tm[1].padStart(2, '0')}:${tm[2]}` : null, competition: comp, matchNo: null, compFull: null }
        : null;
      continue;
    }

    if (/\brow-competition\b/.test(cls)) {
      if (ctx) {
        const t = text(row);
        const no = /\b(\d{6,})\b/.exec(t);
        if (no) ctx.matchNo = no[1];
        const cf = /\d{1,2}:\d{2}\s+(.+?)\s*\|\s*\d{6,}/.exec(t);
        if (cf) ctx.compFull = cf[1];
      }
      continue;
    }

    const names = clubNames(row);
    if (names.length < 2 || !ctx) continue;
    const [home, away] = names;
    const link = [...row.matchAll(/href="([^"]+)"/gi)].map((m) => absUrl(m[1])).find((u) => u && /\/spiel\//.test(u));
    const info = (/class="info-text"[^>]*>([\s\S]*?)<\/span>/i.exec(row) || [, ''])[1];
    const infoText = text(info);
    out.push({
      date: ctx.date,
      time: ctx.time,
      competition: ctx.compFull || ctx.competition,
      matchNo: ctx.matchNo,
      home,
      away,
      venue: home === own ? 'H' : away === own ? 'A' : null,
      // Ein Spiel in der Zukunft kann nicht gespielt sein, egal was im Ergebnisfeld steht.
      played: forcePlayed || (hasHiddenScore(row) && `${ctx.date}T${ctx.time || '00:00'}` <= now),
      // Hinweis nur, wenn er mehr als eine Datums-/Zeitangabe enthält (z. B. "abgesagt")
      note: infoText && /[a-zäöüß]{3,}/i.test(infoText) ? infoText : null,
      url: link || null,
    });
  }
  return out;
}

function mergeMatches(...lists) {
  const seen = new Map();
  for (const m of lists.flat()) {
    const key = m.matchNo || `${m.date}|${m.home}|${m.away}`;
    const prev = seen.get(key);
    if (!prev || (m.played && !prev.played)) seen.set(key, { ...prev, ...m });
  }
  const all = [...seen.values()];
  const stamp = (m) => `${m.date}T${m.time || '00:00'}`;
  return {
    upcoming: all.filter((m) => !m.played).sort((a, b) => stamp(a).localeCompare(stamp(b))),
    past: all.filter((m) => m.played).sort((a, b) => stamp(b).localeCompare(stamp(a))),
  };
}

// Nur echte Ligaspiele: beide Mannschaften stehen in der Tabelle der Staffel
// (blendet Pokal-/Freundschaftsspiele der anderen Teams aus).
function leagueGames(list, table) {
  const names = new Set(table.map((t) => t.team));
  return names.size ? list.filter((m) => names.has(m.home) && names.has(m.away)) : list;
}

// ---------- Spielseite (Popup) ----------
// Nur Spielseiten von Fussball.de sind erlaubt (kein offener Proxy):
//   https://www.fussball.de/spiel/<slug>/-/spiel/<ID>
const GAME_URL = /^https:\/\/www\.fussball\.de\/spiel\/[a-z0-9-]+\/-\/spiel\/([0-9A-Z]{20,48})$/;
function gameId(url) {
  const m = GAME_URL.exec(String(url || ''));
  return m ? m[1] : null;
}
const courseUrl = (id) => `${BASE}/ajax.match.course/-/mode/PAGE/spiel/${id}`;

const PUA = /[\uE000-\uF8FF]/;
// Zellen mit verschleierten Zeichen werden verworfen (nichts wird entschlüsselt).
const plain = (s) => {
  const t = text(s);
  return t && !PUA.test(t) ? t : null;
};

function formOf(s) {
  const f = String(s || '').split('|').map((x) => x.trim()).filter((x) => /^[SUN]$/.test(x));
  return f.length ? f : null;
}
function scorerOf(s) {
  const m = /^(.+?)\s*\((\d+)\)$/.exec(String(s || ''));
  return m ? { name: m[1].trim(), goals: Number(m[2]) } : null;
}

// Liest Spielort und den Vergleich beider Mannschaften aus der Spielseite.
// Schiedsrichter, Zuschauer und Aufstellung stehen dort nicht lesbar im HTML und werden nicht geliefert.
function parseGamePage(html) {
  const out = { location: null, compare: null, logos: { home: null, away: null }, times: { kickoff: null, final: null }, news: [] };
  const src = String(html || '');

  const head = /class="stage-header"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/i.exec(src);
  const loc = /<a\b[^>]*class="location"[^>]*>([\s\S]*?)<\/a>/i.exec(head ? head[0] : src);
  if (loc) out.location = plain(loc[1]);

  // Anpfiff/Abpfiff stehen als Überschrift mit Uhrzeit im Klartext
  const clock = (label) => {
    const m = new RegExp(`>\\s*${label}\\b[^:]{0,200}?(\\d{1,2}):(\\d{2})`).exec(src);
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
  };
  out.times = { kickoff: clock('Anpfiff'), final: clock('Abpfiff') };

  // Vor-/Spielberichte und News zum Spiel (Datum | Art, Überschrift, Link)
  const tick = /class="ticker-container[\s\S]*?<\/table>/i.exec(src);
  if (tick) {
    let pending = null;
    for (const row of rowsOf(tick[0])) {
      if (/row-headline/.test(classOf(row))) {
        const t = text(row);
        const d = /(\d{2})\.(\d{2})\.(\d{4})/.exec(t);
        pending = d ? { date: `${d[3]}-${d[2]}-${d[1]}`, kind: t.includes('|') ? t.split('|').pop().trim() : '' } : null;
        continue;
      }
      const cell = cellsOf(row).find((c) => /column-name/.test(c.attrs));
      if (!cell) continue;
      const title = plain(cell.html);
      const href = (/href="(https:\/\/www\.fussball\.de\/mgc\.newsdetail\/[^"]+)"/i.exec(row) || [])[1];
      if (title && href) out.news.push({ date: pending?.date || null, kind: pending?.kind || '', title, url: decode(href) });
      pending = null;
    }
  }

  const tables = src.match(/<table\b[\s\S]*?<\/table>/gi) || [];
  const tbl = tables.find((t) => /Aktuelle Platzierung/.test(t));
  if (tbl) {
    const rows = rowsOf(tbl);
    const ths = [...(rows[0] || '').matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => m[1]);
    if (ths.length >= 3) {
      out.logos.home = logoUrl(ths[0]);
      out.logos.away = logoUrl(ths[2]);
    }
    const rec = { place: [null, null], points: [null, null], goals: [null, null], form: [null, null], scorer: [null, null], cards: [null, null] };
    for (const row of rows.slice(1)) {
      const c = cellsOf(row).map((x) => plain(x.html));
      if (c.length < 3 || !c[1]) continue;
      const set = (key, fn) => { rec[key] = [fn(c[0]), fn(c[2])]; };
      if (/Platzierung/i.test(c[1])) set('place', (v) => (v ? toInt(v) : null));
      else if (/Punkt/i.test(c[1])) set('points', (v) => (v ? toInt(v) : null));
      else if (/Torverh/i.test(c[1])) set('goals', (v) => (v && /^\d+\s*:\s*\d+$/.test(v) ? v.replace(/\s+/g, '') : null));
      else if (/Trend/i.test(c[1])) set('form', formOf);
      else if (/Torj/i.test(c[1])) set('scorer', scorerOf);
      else if (/Karten/i.test(c[1])) set('cards', (v) => (v && /^[\d\s/]+$/.test(v) ? v.replace(/\s+/g, '') : null));
    }
    if (Object.values(rec).some((p) => p[0] != null || p[1] != null)) {
      out.compare = {
        home: Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, v[0]])),
        away: Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, v[1]])),
      };
    }
  }
  return out;
}

// Spielverlauf: nur Minute, Art und Seite. Spielernamen und Zwischenstände sind verschleiert
// und werden verworfen.
function parseCourse(html) {
  const events = [];
  const parts = String(html || '').split(/class="row-event\b/).slice(1);
  for (const part of parts) {
    const side = /^[^"]*\bevent-left\b/.test(part) ? 'home' : /^[^"]*\bevent-right\b/.test(part) ? 'away' : null;
    const min = /class="valign-inner">\s*(\d{1,3})(?:\s*\+\s*(\d{1,2}))?\s*(?:[’']|&rsquo;|&#0*(?:8217|39);|&apos;)/.exec(part);
    if (!side || !min) continue;
    const clean = part.replace(/<span\b[^>]*data-obfuscation[^>]*>[\s\S]*?<\/span>/gi, ' ');
    const t = text(clean);
    let type = null;
    if (/Gelb-?\s?Rote/i.test(t)) type = 'yellowred';
    else if (/Rote Karte/i.test(t)) type = 'red';
    else if (/Gelbe Karte/i.test(t)) type = 'yellow';
    else if (/Auswechslung/i.test(t)) type = 'sub';
    else if (/Eigentor/i.test(t)) type = 'owngoal';
    else if (/Strafsto\S*tor|Elfmeter\S*tor/i.test(t)) type = 'penalty';
    else if (/\bTor\b/.test(t)) type = 'goal';
    if (!type) continue;
    events.push({ minute: Number(min[1]) + (min[2] ? Number(min[2]) / 100 : 0), label: `${min[1]}${min[2] ? `+${min[2]}` : ''}`, type, side });
  }
  return events;
}

// ---------- Berichte (Vorbericht/Spielbericht) ----------
// Nur Artikel von Fussball.de sind erlaubt: https://www.fussball.de/mgc.newsdetail/-/article-uuid/<ID>
const ARTICLE_URL = /^https:\/\/www\.fussball\.de\/mgc\.newsdetail\/-\/article-uuid\/[0-9A-Z]{20,48}$/;
const isArticleUrl = (url) => ARTICLE_URL.test(String(url || ''));

// Liest Überschrift, Einleitung, Absätze und Quellenzeile (nur Text, kein fremdes HTML).
function parseArticle(html) {
  const src = String(html || '');
  const title = (/<title>([\s\S]*?)<\/title>/i.exec(src) || [])[1];
  const start = src.search(/class="news-article\b/);
  if (start < 0) return null;
  let block = src.slice(start);
  const metaAt = block.search(/class="article-meta\b/);
  const meta = metaAt >= 0 ? plain((/class="article-meta[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(block) || [])[1]) : null;
  if (metaAt >= 0) block = block.slice(0, metaAt);
  const lead = plain((/<p\b[^>]*class="[^"]*article-lead-text[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(block) || [])[1]);
  const paras = [...block.matchAll(/<p\b(?![^>]*article-lead-text)[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => plain(m[1]))
    .filter((t) => t && t !== 'Anzeige');
  if (!lead && !paras.length) return null;
  return { title: title ? plain(title).replace(/\s*\|.*$/, '') : null, lead, paras, meta };
}

module.exports = { TEAMS, urlsFor, teamUrls, parseTable, parseMatches, mergeMatches, leagueGames, text, gameId, courseUrl, parseGamePage, parseCourse, isArticleUrl, parseArticle };

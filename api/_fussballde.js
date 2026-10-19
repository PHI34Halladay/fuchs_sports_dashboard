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

module.exports = { TEAMS, urlsFor, parseTable, parseMatches, mergeMatches, text };

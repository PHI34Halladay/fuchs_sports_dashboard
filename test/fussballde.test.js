// Tests für den Fussball.de-Parser. Die Fragmente bilden die Struktur der ajax.team.*-Antworten nach.
// Ausführen: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTable, parseMatches, mergeMatches } = require('../api/_fussballde');

const ZW = '​';
const OWN = `SGM FC Gündelbach/${ZW}TSV Häfnerhaslach`;

const tableRow = (cls, rank, name, nums) => `
  <tr class="${cls}">
    <td class="column-icon"><span class="icon-arrow-up-right"></span></td>
    <td class="column-rank"> ${rank}. </td>
    <td class="column-club"><a class="club-wrapper"><div class="club-logo table-image"><img src="x"></div>
      <div class="club-name"> ${name} </div></a></td>
    <td>${nums[0]}</td><td class="hidden-small">${nums[1]}</td><td class="hidden-small">${nums[2]}</td>
    <td class="hidden-small">${nums[3]}</td><td class="no-wrap">${nums[4]}</td>
    <td class="hidden-small">${nums[5]}</td><td class="column-points">${nums[6]}</td>
  </tr>`;

const TABLE_HTML = `<table>
  <tr class="thead"><th>Platz</th><th class="column-large">Mannschaft</th><th>Spiele</th></tr>
  ${tableRow('row-promotion', 1, 'SGM Riexingen', [5, 4, 1, 0, '21 : 4', '17', 13])}
  ${tableRow('row-promotion-playoff odd own', 2, `SGM FC Gündelbach/${ZW}TSV Häfnerhaslach`, [5, 4, 1, 0, '15 : 7', '8', 13])}
  ${tableRow('odd', 3, 'SV M&uuml;ller &amp; Co', [5, 0, 0, 5, '5 : 31', '-26', 0])}
</table>`;

test('Tabelle wird gelesen', () => {
  const t = parseTable(TABLE_HTML);
  assert.equal(t.length, 3);
  assert.deepEqual(t[0], { rank: 1, team: 'SGM Riexingen', played: 5, won: 4, drawn: 1, lost: 0, gf: 21, ga: 4, diff: 17, points: 13, own: false });
  assert.equal(t[1].team, 'SGM FC Gündelbach/TSV Häfnerhaslach'); // ohne Zero-Width-Space
  assert.equal(t[1].own, true);
  assert.equal(t[2].diff, -26);
  assert.equal(t[2].team, 'SV Müller & Co'); // Entities dekodiert
});

const head = (txt) => `<tr class="row-headline visible-small"><td>${txt}</td></tr>`;
const comp = (txt) => `<tr class="odd row-competition hidden-small"><td class="column-date">${txt}</td></tr>`;
const game = (home, away, { score = false, href = '/spiel/abc/-/spiel/XYZ', info = '' } = {}) => `
  <tr>
    <td class="hidden-small"></td>
    <td class="column-club"><a class="club-wrapper"><div class="club-logo table-image"><span></span></div><div class="club-name"> ${home} </div></a></td>
    <td class="column-colon">:</td>
    <td class="column-club no-border"><a class="club-wrapper"><div class="club-name"> ${away} </div></a></td>
    <td class="column-score"><a>${
      score
        ? '<span data-obfuscation="abcd1234" class="score-left"></span><span class="colon">:</span><span data-obfuscation="abcd1234" class="score-right"></span>'
        : '<span data-obfuscation="abcd1234" class="score-left">&nbsp; </span><span class="colon">:</span><span data-obfuscation="abcd1234" class="score-right">&#160;</span>'
    }${info ? `<span class="info-text">${info}</span>` : ''}</a></td>
    <td class="column-detail"><a href="${href}"><span class="icon-angle-right"></span></a></td>
  </tr>`;

const NEXT_HTML = `<table>
  <tr class="thead hidden-small"><th>Datum | Zeit</th></tr>
  ${head('Sonntag, 25.10.2026 - 15:00 Uhr | Kreisliga B')}
  ${comp('So, 25.10.26 | 15:00 Kreisliga B ME | 351402037')}
  ${game(OWN, 'SGM Riexingen')}
  ${head('Donnerstag, 05.11.2026 - 19:30 Uhr | Kreisliga B')}
  ${comp('Do, 05.11.26 | 19:30 Kreisliga B ME | 351402047')}
  ${game('SGM Sachsenheim II', OWN, { info: '05.11.2026 19:30' })}
</table>`;

const PREV_HTML = `<table>
  ${head('Sonntag, 18.10.2026 - 13:00 Uhr | Kreisliga B')}
  ${comp('So, 18.10.26 | 13:00 Kreisliga B ME | 351402031')}
  ${game('TSV Kleinglattbach II', OWN, { score: true, href: 'https://www.fussball.de/spiel/x/-/spiel/Q1' })}
  ${head('Sonntag, 11.10.2026 - 15:00 Uhr | Kreisliga B')}
  ${comp('So, 11.10.26 | 15:00 Kreisliga B ME | 351402023')}
  ${game(OWN, 'SV Iptingen', { score: true, href: 'https://evil.example/spiel/x' })}
</table>`;

test('Kommende Spiele: Datum, Zeit, Heim/Auswärts, Spielnummer', () => {
  const m = parseMatches(NEXT_HTML, 'SGM FC Gündelbach/TSV Häfnerhaslach');
  assert.equal(m.length, 2);
  assert.equal(m[0].date, '2026-10-25');
  assert.equal(m[0].time, '15:00');
  assert.equal(m[0].competition, 'Kreisliga B ME');
  assert.equal(m[0].matchNo, '351402037');
  assert.equal(m[0].home, 'SGM FC Gündelbach/TSV Häfnerhaslach');
  assert.equal(m[0].venue, 'H');
  assert.equal(m[0].played, false);
  assert.equal(m[1].venue, 'A');
  assert.equal(m[1].note, null); // reine Datumsangabe ist kein Hinweis
  assert.equal(m[0].url, 'https://www.fussball.de/spiel/abc/-/spiel/XYZ');
});

test('Gespielte Spiele: kein Ergebnis im Output, fremde Links werden verworfen', () => {
  const m = parseMatches(PREV_HTML, 'SGM FC Gündelbach/TSV Häfnerhaslach', { forcePlayed: true });
  assert.equal(m.length, 2);
  assert.ok(m.every((g) => g.played));
  assert.ok(m.every((g) => !('score' in g) && !JSON.stringify(g).match(/[-]/)));
  assert.equal(m[0].url, 'https://www.fussball.de/spiel/x/-/spiel/Q1');
  assert.equal(m[1].url, null);
});

test('Verschleierter Spielstand markiert Spiel als gespielt, auch ohne forcePlayed', () => {
  const m = parseMatches(PREV_HTML, OWN);
  assert.ok(m.every((g) => g.played));
});

test('Spiel in der Zukunft ist nie "gespielt", auch wenn das Ergebnisfeld Zeichen enthält', () => {
  const future = `<table>${head('Sonntag, 25.10.2026 - 15:00 Uhr | Kreisliga B')}${comp('So, 25.10.26 | 15:00 Kreisliga B ME | 351402037')}${game(OWN, 'SGM Riexingen', { score: true })}</table>`;
  assert.equal(parseMatches(future, OWN, { now: '2026-10-19T13:00' })[0].played, false);
  assert.equal(parseMatches(future, OWN, { now: '2026-10-26T13:00' })[0].played, true);
});

test('Zusammenführen: sortiert, dedupliziert', () => {
  const next = parseMatches(NEXT_HTML, OWN);
  const prev = parseMatches(PREV_HTML, OWN, { forcePlayed: true });
  const { upcoming, past } = mergeMatches(next, prev, next);
  assert.deepEqual(upcoming.map((g) => g.date), ['2026-10-25', '2026-11-05']);
  assert.deepEqual(past.map((g) => g.date), ['2026-10-18', '2026-10-11']);
});

test('Leere/kaputte Eingaben führen nicht zu Fehlern', () => {
  assert.deepEqual(parseTable(''), []);
  assert.deepEqual(parseTable(undefined), []);
  assert.deepEqual(parseMatches('<html>nix</html>', OWN), []);
});

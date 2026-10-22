// Tests für das Spiel-Popup (Spielseite + Spielverlauf). Fixtures bilden die Struktur der Fussball.de-Seiten nach.
const test = require('node:test');
const assert = require('node:assert/strict');
const { gameId, courseUrl, parseGamePage, parseCourse } = require('../api/_fussballde');

const PUA = '';
const LOGO = (id) => `//www.fussball.de/export.media/-/action/getLogo/format/5/id/${id}/verband/V1`;
const cmpRow = (a, label, b) => `<tr><td class="column-stats">${a}</td><td>${label}</td><td class="column-stats">${b}</td></tr>`;

const PAGE = `<div class="stage-header">
  <a href="https://www.fussball.de/spieltag/x" class="competition">Kreisliga B6</a>
  <div class="date"><span data-obfuscation="abc">${PUA}</span></div>
  <div class="result"><span data-obfuscation="abc" class="score-left">${PUA}</span></div>
  <a href="https://www.google.de/maps" class="location"> Rasenplatz, Auf dem Heiligenberg, Heiligenberg, 74343 Sachsenheim <span class="icon-location"></span> </a>
</div></div></div>
<table class="table table-striped table-full-width">
  <thead><tr><th><a href="x"><img src="${LOGO('H1')}" alt="logo"></a></th><th>:</th><th><a href="y"><img src="https://evil.example/a.png" alt="logo"></a></th></tr></thead>
  <tbody>
  ${cmpRow('2', 'Aktuelle Platzierung', '10')}
  ${cmpRow('13', 'Aktuelle Punktzahl', '4')}
  ${cmpRow('15:7', 'Aktuelles Torverhältnis', '8:16')}
  ${cmpRow('S | S | U | S | S', 'Aktueller Trend', 'N | N | U | S | N')}
  ${cmpRow('<a>Juri Grinko (3)</a>', 'Bester Torjäger (Tore)', `<a>Paulo Leite (2)</a>`)}
  ${cmpRow('13 / 00 / 00 / 0', 'Karten (Team/Offiz.)', `9 / 11 / ${PUA} / 1`)}
  </tbody>
</table>`;

test('Spielseite: Ort und Vergleich werden gelesen, Logos nur vom Fussball.de-Logodienst', () => {
  const g = parseGamePage(PAGE);
  assert.equal(g.location, 'Rasenplatz, Auf dem Heiligenberg, Heiligenberg, 74343 Sachsenheim');
  assert.deepEqual(g.compare.home, { place: 2, points: 13, goals: '15:7', form: ['S', 'S', 'U', 'S', 'S'], scorer: { name: 'Juri Grinko', goals: 3 }, cards: '13/00/00/0' });
  assert.equal(g.compare.away.place, 10);
  assert.equal(g.compare.away.goals, '8:16');
  assert.deepEqual(g.compare.away.scorer, { name: 'Paulo Leite', goals: 2 });
  assert.equal(g.logos.home, 'https://www.fussball.de/export.media/-/action/getLogo/format/5/id/H1/verband/V1');
  assert.equal(g.logos.away, null);
});

test('Spielseite: verschleierte Zellen werden verworfen, nichts davon landet im Ergebnis', () => {
  const g = parseGamePage(PAGE);
  assert.equal(g.compare.away.cards, null);
  assert.ok(!JSON.stringify(g).match(/[-]/));
});

test('Spielseite ohne Daten liefert leere Felder statt Fehler', () => {
  assert.deepEqual(parseGamePage(''), { location: null, compare: null, logos: { home: null, away: null } });
  assert.equal(parseGamePage('<html>nix</html>').compare, null);
  assert.equal(parseGamePage(undefined).location, null);
});

const ev = (side, minute, inner) => `<div class="row-event event-${side}">
  <div class="column-time"><div class="hexagon green"><div class="inner"><div class="valign-wrapper"><div class="valign-inner">${minute}${minute % 2 ? '&rsquo;' : '’'}</div></div></div></div></div>
  <div class="column-event"><div class="valign-table"><div class="valign-cell">${inner}</div></div></div></div>`;
const player = `<a href="https://www.fussball.de/spielerprofil/-/player-id/X"><div class="player-name"><span data-obfuscation="p1">${PUA}</span></div></a>`;
const COURSE = [
  ev('left', 0, `<div>Auswechslung</div>${player}`),
  ev('right', 14, `<div class="icon-card yellow-card"></div><div>Gelbe Karte</div>${player}`),
  ev('left', 19, `<div>Strafstoßtor</div><span data-obfuscation="s1" class="score-left">${PUA}</span>`),
  ev('right', 39, `<div>Tor</div>`),
  ev('right', 45, `<div>Gelb-Rote Karte</div>`),
  ev('left', 90, `<div>Eigentor</div>`),
  ev('left', 55, `<div>Unbekannt</div>`),
].join('\n');

test('Spielverlauf: Minute, Art und Seite; Namen und Zwischenstände fehlen', () => {
  const e = parseCourse(COURSE);
  assert.deepEqual(e.map((x) => [x.label, x.type, x.side]), [
    ['0', 'sub', 'home'], ['14', 'yellow', 'away'], ['19', 'penalty', 'home'],
    ['39', 'goal', 'away'], ['45', 'yellowred', 'away'], ['90', 'owngoal', 'home'],
  ]);
  assert.ok(e.every((x) => Object.keys(x).sort().join() === 'label,minute,side,type'));
});

test('Spielverlauf: leere Eingabe', () => {
  assert.deepEqual(parseCourse(''), []);
  assert.deepEqual(parseCourse(undefined), []);
});

test('Nur Spielseiten von Fussball.de sind erlaubt', () => {
  const ok = 'https://www.fussball.de/spiel/sgm-a-sgm-b/-/spiel/031CQOQ93S000000VS5489BUVUR5FS5A';
  assert.equal(gameId(ok), '031CQOQ93S000000VS5489BUVUR5FS5A');
  assert.equal(courseUrl('ID1'), 'https://www.fussball.de/ajax.match.course/-/mode/PAGE/spiel/ID1');
  for (const bad of ['', 'http://www.fussball.de/spiel/a/-/spiel/031CQOQ93S000000VS5489BUVUR5FS5A',
    'https://evil.example/spiel/a/-/spiel/031CQOQ93S000000VS5489BUVUR5FS5A',
    'https://www.fussball.de.evil.example/spiel/a/-/spiel/031CQOQ93S000000VS5489BUVUR5FS5A',
    'https://www.fussball.de/spiel/a/-/spiel/031CQOQ93S000000VS5489BUVUR5FS5A?x=1',
    'https://www.fussball.de/mannschaft/a/-/team-id/031CQOQ93S000000VS5489BUVUR5FS5A']) assert.equal(gameId(bad), null, bad);
});

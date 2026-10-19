// Tests für die Hockeyweb-Anbindung. Die Fragmente bilden die Struktur der echten Seiten nach
// (gamePlanGame-Karten, Spielwochen-Auswahl, Tabellen mit <th>-Vereinszelle).
// Ausführen: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseGames, parseWeeks, parseStandings, pageUrl } = require('../api/_hockeyweb');
const handler = require('../api/hockey');

const LOGO = (slug) => `https://media.hockeyweb.de/v/${slug}-svg-ll.webp`;

// Karte einer Ergebnisseite: Uhrzeit im <time>-Element, Endstand, Drittel, optional Marker
const resultCard = ({ href, iso, h, a, hs, as, periods, marker }) => `
<div class="gamePlanGame relative flex"><a class="absolute left-0 top-0 w-full h-full" href="${href}"></a>
  <div class="flex"><div class="lg:pl-2"><time datetime="${iso}"><span class="font-bold text-xs">x</span></time></div></div>
  <div class="flex"><div class="flex">
    <span class="lg:block hidden">${h}</span> <span class="block lg:hidden">${h.split(' ').pop()}</span><img src="${LOGO(h.toLowerCase().replace(/\W+/g, '-'))}" alt="${h} Logo"></div>
    <div><span>${hs}</span> <span>:</span> <span>${as}</span></div>
    <div><img src="${LOGO(a.toLowerCase().replace(/\W+/g, '-'))}" alt="${a} Logo"><span>${a}</span> <span>${a.split(' ').pop()}</span></div></div>
  <div class="flex">${periods.map(([x, y]) => `<div><span>${x}</span> <span>:</span> <span>${y}</span></div>`).join(' ')} ${marker ? `<div>${marker}</div>` : ''}</div>
</div>`;

// Karte einer Spielplanseite: Uhrzeit als Text, kein Ergebnis, Sponsor-Link
const planCard = ({ href, time, h, a }) => `
<div class="gamePlanGame relative flex"><a class="absolute left-0 top-0 w-full h-full" href="${href}"></a>
  <div> <div></div></div>
  <div><div><span>${h}</span> <span>x</span><img src="${LOGO(h.toLowerCase().replace(/\W+/g, '-'))}" alt="${h} Logo"></div>
    <div>${time}</div>
    <div><img src="${LOGO(a.toLowerCase().replace(/\W+/g, '-'))}" alt="${a} Logo"><span>${a}</span> <span>y</span></div></div>
  <div><a href="https://tracker.example/link?btag=1&amp;x=2" rel="sponsored" target="_blank" data-umami-event="native_ad_click">Jetzt Wetten</a> </div>
</div>`;

const weekOpts = (kind, list) => `<select>${list.map(([p, label, sel]) => `<option value="/del/${kind}?page=${p}"${sel ? ' selected' : ''}>${label}</option>`).join('')}</select>
  <select><option value="/del/${kind}?page=5">Alle Teams</option><option value="/del/${kind}?teams=2&amp;page=5">Adler Mannheim</option></select>`;

const RESULTS_HTML = (page) => `<html><head><title>DEL Ergebnisse &amp; Resultate 2026/2027</title></head><body><main>
  ${weekOpts('ergebnisse', [[1, '17. Sep - 20. Sep'], [2, '22. Sep - 27. Sep'], [4, '8. Okt - 11. Okt', page === 4], [5, '15. Okt - 18. Okt', page !== 4]])}
  ${page === 4
    ? `<h2>Donnerstag, 08.10.2026</h2>${resultCard({ href: '/del/spiele/koeln-berlin-20261008-16700', iso: '2026-10-08T17:30:00Z', h: 'Kölner Haie', a: 'Eisbären Berlin', hs: 1, as: 4, periods: [[0, 2], [1, 1], [0, 1]] })}`
    : `<h2>Donnerstag, 15.10.2026</h2>${resultCard({ href: '/del/spiele/wolfsburg-krefeld-20261015-16737', iso: '2026-10-15T17:30:00Z', h: 'Grizzlys Wolfsburg', a: 'Krefeld Pinguine', hs: 2, as: 1, periods: [[1, 0], [0, 0], [0, 1]], marker: 'PSO' })}
  <h2>Freitag, 16.10.2026</h2>${resultCard({ href: '/del/spiele/berlin-m%C3%BCnchen-20261016-16761', iso: '2026-10-16T17:30:00Z', h: 'Eisbären Berlin', a: 'EHC Red Bull München', hs: 3, as: 4, periods: [[1, 1], [2, 1], [0, 2]], marker: 'OT' })}`}
  </main><footer>Footer 12 : 34</footer></body></html>`;

const PLAN_HTML = `<html><head><title>DEL Spielplan 2026/2027 » Alle Spiele &amp; Termine</title></head><body><main>
  ${weekOpts('spielplan', [[1, '20. Okt - 25. Okt', true], [2, '27. Okt - 1. Nov']])}
  <h2>Dienstag, 20.10.2026</h2>${planCard({ href: '/del/spiele/ingolstadt-wolfsburg-20261020-16758', time: '19:30', h: 'ERC Ingolstadt', a: 'Grizzlys Wolfsburg' })}
  </main></body></html>`;

const OBERLIGA_TABLE = `<html><head><title>Oberliga Tabelle 2026/2027</title></head><body><main><h1>Oberliga Tabelle 2026/2027</h1>
  <h2 id="süd">Süd</h2><table><tr><th><div><span>Platz</span> <span>Verein</span></div></th><th><span>Pt.</span></th></tr>
    <tr><th><div><span></span> <span>1</span><img src="${LOGO('deggendorfer-sc')}" alt="Deggendorfer SC Logo"><span>Deggendorfer SC</span> <span>Deggendorf</span></div></th> <td>27</td> <td>11</td> <td>8</td> <td>1</td> <td>1</td> <td>1</td> <td>50</td> <td>20</td></tr></table>
  <h2 id="nord">Nord</h2><table>
    <tr><th><div><span></span> <span>1</span><img src="${LOGO('tilburg-trappers')}" alt="Tilburg Trappers Logo"><span>Tilburg Trappers</span> <span>Tilburg</span></div></th> <td>28</td> <td>10</td> <td>9</td> <td>1</td> <td>0</td> <td>0</td> <td>55</td> <td>14</td></tr>
    <tr><th><div><span></span> <span>2</span><img src="https://evil.example/x.webp" alt="Hammer Eisbären Logo"><span>Hammer Eisbären</span></div></th> <td>20</td> <td>10</td> <td>6</td> <td>0</td> <td>1</td> <td>3</td> <td>30</td> <td>35</td></tr>
  </table></main></body></html>`;

// ---------- Parser ----------
test('Ergebnisse: Endstand, Drittel, Marker, Uhrzeit und Datum in deutscher Zeit', () => {
  const g = parseGames(RESULTS_HTML(5));
  assert.equal(g.length, 2);
  assert.deepEqual(g[0], {
    id: '16737', url: 'https://www.hockeyweb.de/del/spiele/wolfsburg-krefeld-20261015-16737', date: '2026-10-15', time: '19:30',
    played: true, ot: 'PSO',
    home: { name: 'Grizzlys Wolfsburg', logo: LOGO('grizzlys-wolfsburg'), score: 2 },
    away: { name: 'Krefeld Pinguine', logo: LOGO('krefeld-pinguine'), score: 1 },
    periods: [[1, 0], [0, 0], [0, 1]],
  });
  assert.equal(g[1].ot, 'OT');
  assert.equal(g[1].home.score, 3);
  assert.equal(g[1].away.score, 4);
});

test('Prozent-kodierte Umlaute im Spiel-Link (m%C3%BCnchen) brechen den Parser nicht', () => {
  const g = parseGames(RESULTS_HTML(5));
  assert.equal(g[1].id, '16761');
  assert.equal(g[1].url, 'https://www.hockeyweb.de/del/spiele/berlin-m%C3%BCnchen-20261016-16761');
  assert.equal(g[1].away.name, 'EHC Red Bull München');
});

test('Spielplan: Uhrzeit aus dem Text, Datum aus dem Link, kein Ergebnis, Sponsor-Link ignoriert', () => {
  const g = parseGames(PLAN_HTML);
  assert.equal(g.length, 1);
  assert.equal(g[0].played, false);
  assert.equal(g[0].time, '19:30');
  assert.equal(g[0].date, '2026-10-20');
  assert.equal(g[0].home.score, null);
  assert.equal(g[0].ot, null);
  assert.deepEqual(g[0].periods, []);
  assert.equal(g[0].home.name, 'ERC Ingolstadt');
});

test('Letzte Karte endet an der nächsten Überschrift bzw. am Seitenende (kein Ergebnis aus der Fußzeile)', () => {
  const g = parseGames(PLAN_HTML.replace('</main>', '<h2>Nächste</h2><div>5 : 6</div></main>'));
  assert.equal(g[0].played, false);
});

test('Spielwochen: Zeitraum mit Saisonjahr, Auswahl und Seitennummer; Team-Auswahl wird ignoriert', () => {
  const w = parseWeeks(RESULTS_HTML(5));
  assert.deepEqual(w, [
    { page: 1, from: '2026-09-17', to: '2026-09-20', selected: false },
    { page: 2, from: '2026-09-22', to: '2026-09-27', selected: false },
    { page: 4, from: '2026-10-08', to: '2026-10-11', selected: false },
    { page: 5, from: '2026-10-15', to: '2026-10-18', selected: true },
  ]);
});

test('Spielwochen über den Jahreswechsel gehören ins Folgejahr', () => {
  const html = '<title>DEL Spielplan 2026/2027</title><option value="/del/spielplan?page=9">29. Dez - 3. Jan</option><option value="/del/spielplan?page=10">8. Jan - 10. Jan</option><option value="/del/spielplan?page=11">3. Mär - 6. Mär</option>';
  const w = parseWeeks(html);
  assert.deepEqual(w.map((x) => [x.from, x.to]), [['2026-12-29', '2027-01-03'], ['2027-01-08', '2027-01-10'], ['2027-03-03', '2027-03-06']]);
});

test('Tabelle: Süd und Nord werden getrennt, fremde Logo-Hosts verworfen', () => {
  const south = parseStandings(OBERLIGA_TABLE, 'süd');
  assert.equal(south.length, 1);
  assert.equal(south[0].name, 'Süd');
  assert.deepEqual(south[0].table[0], { rank: 1, team: 'Deggendorfer SC', logo: LOGO('deggendorfer-sc'), played: 11, won: 8, otw: 1, otl: 1, lost: 1, gf: 50, ga: 20, diff: 30, points: 27 });
  const north = parseStandings(OBERLIGA_TABLE, 'nord');
  assert.equal(north[0].table.length, 1); // Zeile mit fremdem Logo-Host wird verworfen
  assert.equal(north[0].table[0].team, 'Tilburg Trappers');
  assert.equal(parseStandings(OBERLIGA_TABLE, null).length, 2);
});

test('Seiten-URLs: Staffel mit Umlaut wird kodiert, page nur als Zahl', () => {
  assert.equal(pageUrl({ path: 'oberliga', sub: 'süd' }, 'ergebnisse', 3), 'https://www.hockeyweb.de/oberliga/ergebnisse/s%C3%BCd?page=3');
  assert.equal(pageUrl({ path: 'del' }, 'spielplan'), 'https://www.hockeyweb.de/del/spielplan');
});

// ---------- Handler (fetch gemockt) ----------
const call = async (query) => {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  await handler({ query }, res);
  return res;
};

function mockFetch(routes) {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    const hit = routes[url];
    if (hit === undefined) return { ok: false, status: 404, text: async () => '' };
    if (hit instanceof Error) throw hit;
    return { ok: true, status: 200, text: async () => hit };
  };
  return calls;
}

const B = 'https://www.hockeyweb.de';
const ROUTES = {
  [`${B}/del/ergebnisse`]: RESULTS_HTML(5),
  [`${B}/del/ergebnisse?page=4`]: RESULTS_HTML(4),
  [`${B}/del/spielplan`]: PLAN_HTML,
  [`${B}/oberliga/tabelle`]: OBERLIGA_TABLE,
};

test('Handler: Datum in der letzten Ergebniswoche → nur die beiden Startseiten, Kalender beider Quellen', async () => {
  handler._clearCache();
  const calls = mockFetch(ROUTES);
  const r = await call({ league: 'del', type: 'games', date: '2026-10-16' });
  assert.equal(r.code, 200);
  assert.equal(calls.length, 2); // nur die beiden Startseiten
  assert.deepEqual(r.body.days, ['2026-10-15', '2026-10-16']); // Spielplanwoche (ab 20.10.) liegt außerhalb
  assert.equal(r.body.games.length, 2);
  assert.deepEqual(r.body.calendar.map((w) => w.from), ['2026-09-17', '2026-09-22', '2026-10-08', '2026-10-15', '2026-10-20', '2026-10-27']);
  assert.match(r.headers['Cache-Control'], /s-maxage=60/);
});

test('Handler: Datum in der ersten Spielplanwoche → kommende Spiele ohne Ergebnis', async () => {
  handler._clearCache();
  mockFetch(ROUTES);
  const r = await call({ league: 'del', type: 'games', date: '2026-10-21' });
  assert.equal(r.code, 200);
  assert.deepEqual(r.body.days, ['2026-10-20']);
  assert.equal(r.body.games[0].played, false);
  assert.equal(r.body.games[0].time, '19:30');
});

test('Handler: Doppelte Spiele aus Ergebnis- und Spielplanseite zählen einmal, der Eintrag mit Ergebnis gewinnt', async () => {
  handler._clearCache();
  const dup = PLAN_HTML.replace('/del/spiele/ingolstadt-wolfsburg-20261020-16758', '/del/spiele/wolfsburg-krefeld-20261015-16737');
  mockFetch({ ...ROUTES, [`${B}/del/spielplan`]: dup.replace('20. Okt - 25. Okt', '14. Okt - 25. Okt') });
  const r = await call({ league: 'del', type: 'games', date: '2026-10-16' });
  const g = r.body.games.filter((x) => x.id === '16737');
  assert.equal(g.length, 1);
  assert.equal(g[0].played, true);
});

test('Handler: Datum in einer älteren Woche lädt genau diese Seite nach', async () => {
  handler._clearCache();
  const calls = mockFetch(ROUTES);
  const r = await call({ league: 'del', type: 'games', date: '2026-10-08' });
  assert.ok(calls.includes(`${B}/del/ergebnisse?page=4`));
  assert.deepEqual(r.body.days, ['2026-10-08']);
  assert.equal(r.body.games[0].home.name, 'Kölner Haie');
});

test('Handler: Datum in einer Spielpause liefert keine Spiele (nicht die Standardseite)', async () => {
  handler._clearCache();
  mockFetch(ROUTES);
  const r = await call({ league: 'del', type: 'games', date: '2026-09-21' });
  assert.equal(r.code, 200);
  assert.deepEqual(r.body.games, []);
  assert.deepEqual(r.body.days, []);
  assert.ok(r.body.calendar.length > 0); // Kalender bleibt für die Navigation erhalten
});

test('Handler: Ist eine Quelle nicht erreichbar, kommt der Rest mit Hinweis', async () => {
  handler._clearCache();
  mockFetch({ ...ROUTES, [`${B}/del/spielplan`]: new Error('timeout') });
  const r = await call({ league: 'del', type: 'games', date: '2026-10-16' });
  assert.equal(r.code, 200);
  assert.equal(r.body.games.length, 2);
  assert.match(r.body.errors[0], /Spielplan/);
});

test('Handler: Sind beide Quellen down → 502', async () => {
  handler._clearCache();
  mockFetch({});
  const r = await call({ league: 'del', type: 'games', date: '2026-10-16' });
  assert.equal(r.code, 502);
});

test('Handler: Tabelle der Oberliga Süd enthält nur die Südstaffel', async () => {
  handler._clearCache();
  mockFetch(ROUTES);
  const r = await call({ league: 'obs', type: 'standings' });
  assert.equal(r.code, 200);
  assert.equal(r.body.groups.length, 1);
  assert.equal(r.body.groups[0].table[0].team, 'Deggendorfer SC');
  assert.match(r.headers['Cache-Control'], /s-maxage=600/);
});

test('Handler: unbekannte Liga und ungültiges Datum werden abgelehnt', async () => {
  mockFetch({});
  assert.equal((await call({ league: 'nhl' })).code, 400);
  assert.equal((await call({ league: '__proto__' })).code, 400);
  assert.equal((await call({ league: 'del', date: '20261016' })).code, 400);
});

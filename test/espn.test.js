const test = require('node:test');
const assert = require('node:assert');
const { buildUrl } = require('../api/espn.js');

test('ESPN-Proxy akzeptiert Ligaschlüssel mit Unterstrich (DFB-Pokal)', () => {
  const url = buildUrl({ type: 'scoreboard', sport: 'soccer', league: 'ger.dfb_pokal', dates: '20261028' });
  assert.match(url, /\/soccer\/ger\.dfb_pokal\/scoreboard\?dates=20261028/);
});

test('ESPN-Proxy akzeptiert Datumsbereiche (Pokal-Runden)', () => {
  const url = buildUrl({ type: 'scoreboard', sport: 'soccer', league: 'ger.dfb_pokal', dates: '20260904-20261030' });
  assert.match(url, /dates=20260904-20261030/);
});

test('ESPN-Proxy lehnt ungültige Ligaschlüssel weiterhin ab', () => {
  assert.throws(() => buildUrl({ type: 'scoreboard', sport: 'soccer', league: '../evil' }));
  assert.throws(() => buildUrl({ type: 'scoreboard', sport: 'soccer', league: 'ger 1' }));
});

test('ESPN-Proxy baut die Spieler-Endpunkte (overview, gamelog, bio)', () => {
  for (const type of ['overview', 'gamelog', 'bio']) {
    const url = buildUrl({ type, sport: 'soccer', league: 'ger.1', id: '303821' });
    assert.match(url, new RegExp(`/soccer/ger\\.1/athletes/303821/${type}$`));
  }
});

test('ESPN-Proxy prüft die Athlet-ID bei den Spieler-Endpunkten', () => {
  for (const type of ['overview', 'gamelog', 'bio']) {
    assert.throws(() => buildUrl({ type, sport: 'soccer', league: 'ger.1', id: '../x' }));
  }
});

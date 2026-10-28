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

const test = require('node:test');
const assert = require('node:assert');
const { buildUrl, expandRange } = require('../api/espn.js');

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

test('ESPN-Proxy zerlegt Datumsbereiche in Einzeltage (ESPN lehnt Bereiche bei Fußball ab)', () => {
  assert.deepStrictEqual(expandRange('20261027-20261029'), ['20261027', '20261028', '20261029']);
  assert.deepStrictEqual(expandRange('20261030-20261102'), ['20261030', '20261031', '20261101', '20261102']);
  assert.strictEqual(expandRange('20261028'), null);
});

test('ESPN-Proxy begrenzt Datumsbereiche auf 14 Tage und lehnt umgekehrte ab', () => {
  assert.strictEqual(expandRange('20261001-20261014').length, 14);
  assert.deepStrictEqual(expandRange('20261001-20261015'), []);
  assert.deepStrictEqual(expandRange('20261030-20261027'), []);
});

test('ESPN-Proxy baut die Team-Endpunkte (schedule, teamstats) und Team-News', () => {
  assert.match(buildUrl({ type: 'schedule', sport: 'soccer', league: 'ger.1', id: '132' }), /\/teams\/132\/schedule$/);
  assert.match(buildUrl({ type: 'teamstats', sport: 'basketball', league: 'nba', id: '13' }), /\/teams\/13\/statistics$/);
  assert.match(buildUrl({ type: 'news', sport: 'soccer', league: 'ger.1', team: '132' }), /news\?.*team=132/);
  assert.throws(() => buildUrl({ type: 'schedule', sport: 'soccer', league: 'ger.1', id: 'x' }));
  // ungültige Team-ID bei News wird ignoriert statt durchgereicht
  assert.doesNotMatch(buildUrl({ type: 'news', sport: 'soccer', league: 'ger.1', team: '../x' }), /team=/);
});

# Sport Dashboard

Browser-App, die Spielstände, Tabellen und News aus der öffentlichen ESPN-API anzeigt.
Gehostet auf Vercel, Code auf GitHub – ohne Build-Schritt, ohne Abhängigkeiten.

## Funktionen (Version 2)

- **Navigation in zwei Ebenen:** oben die Sportarten (★ Favoriten · ⚽ Fußball · 🏈 Football · 🏀 Basketball · 🏒 Eishockey · ⚾ Baseball – auf dem Handy als App-Leiste unten), darunter nur die Ligen der Sportart mit **Liga-Logo** (von ESPN; Ligen ohne ESPN-Logo zeigen ein Kürzel – eigenes Logo über `logo: 'logos/datei.png'` im `LEAGUES`-Eintrag). Jede Liga hat eine Akzentfarbe für Kopfbereich und Tabs; die zuletzt gewählte Liga je Sportart wird gemerkt.
- **Live-Anzeige:** Laufen in einer Sportart Spiele, ist die Sportart-Kachel rot umrandet und zeigt die Anzahl der Live-Spiele; ebenso jede Liga in der Ligaleiste (`/api/live`, jede Minute aktualisiert, ESPN-Ligen).
- **Spieltag bei US-Ligen (NFL, NBA, MLB, NHL, NCAAF, NCAAM):** bis 10 Uhr morgens (deutsche Zeit) wird noch der Vortag angezeigt – also die Spiele der vergangenen Nacht; erst ab 10 Uhr springt die App auf den neuen Tag. Europäische Ligen richten sich nach dem Kalendertag. Der Knopf „Aktuell“ springt zurück zum aktuellen Spieltag.
- **Kreisliga:** SGM I und SGM II (Fussball.de) sind als eine Liga „Kreisliga“ unter Fußball zusammengefasst; Umschalter *Beide / SGM I / SGM II*, Spiele und Tabellen beider Staffeln untereinander.
- **Spielkarten in Teamfarben:** weicher diagonaler Farbverlauf von links oben (Heimteam) nach rechts unten (Gastteam) mit neutraler Mitte, Farben dezent; hat ein Team Schwarz/Weiß (oder Grau) als Primärfarbe, wird die Sekundärfarbe genommen, Heim links / Gast rechts, Ergebnis bzw. Anstoßzeit im neutralen Balken. Bei ESPN kommen die Farben aus der API (zu ähnliche Farben → Alternativfarbe beim Gast); bei Fussball.de und Hockeyweb wird die Hauptfarbe aus dem Vereinslogo gelesen (über `/api/logo`, im Browser gespeichert). Live-Spiele pulsieren rot, Favoriten-Spiele haben einen goldenen Rahmen.
- **Suche** (Lupe oben rechts, Taste `/` oder `Strg+K`): findet Ligen, Teams aller Ligen (ESPN-Teamlisten, Kreisliga- und Hockeyweb-Tabellen) und Spieler über die ESPN-Suche. Teams lassen sich direkt in der Trefferliste per ★ favorisieren; Auswahl öffnet das Team- bzw. Spielerprofil (Kreisliga/Eishockey: Tabelle mit hervorgehobenem Team).
- **Favoriten:** ★ an einem Team (Karte, Tabelle, Suche, Teamprofil) · 🔖 an einer Spielkarte merkt **einzelne Spiele**. Die Favoriten-Ansicht zeigt eine Leiste aller gemerkten Spiele (Antippen springt zum Spieltag, × entfernt) und darunter alle Spiele des Tages mit Favoriten-Teams oder gemerkten Spielen aus allen Ligen. Gemerkte Spiele älter als 45 Tage werden automatisch entfernt.
- **Spiele:** Live-Stände (Auto-Refresh alle 30 s), Anstoßzeiten in Ortszeit, Bilanz, Top-Performer, TV-Sender, Datumsnavigation mit Sprung von Spieltag zu Spieltag (US-Ligen nach US-Ostküstenzeit), „Heute“-Knopf, Top-25-Filter bei NCAAF/NCAAM.
- **Spiel-Popup** (Klick auf eine ESPN-Karte), Kopfbereich ebenfalls in Teamfarben:
  - *Basketball (NBA/NCAAM) – neu:* Gamecast mit Topspielern (Punkte/Rebounds/Assists mit Foto), **Spielverlauf-Diagramm** (Punktedifferenz oder ESPN-Siegwahrscheinlichkeit), **Wurfkarte** auf dem Feld (Treffer/Fehlwürfe je Team, filterbar nach Viertel und Team, Trefferquoten), Teamstatistik (FG, 3er, FT, Rebounds, Assists, Steals, Blocks, Ballverluste, Fastbreak, Zone, größte Führung), letzte Aktionen bei Live-Spielen, Quoten, Divisionstabelle, Spielinfo · Play-by-Play (filterbar) · Boxscore (Starting Five, Bank mit DNP-Grund, Teamsumme, +/-).
  - *Fußball – neu:* **Spielverlauf** mit Minute (Tore mit Vorlage und Zwischenstand, Elfmeter, Eigentore, Karten, Wechsel – Heim links, Gast rechts) · **Aufstellung auf dem Spielfeld** nach ESPN-Formation (z. B. 4-2-3-1) mit Rückennummer in Teamfarbe, Tor-/Karten-/Auswechsel-Markern, Bank mit Einwechselminute (Desktop quer, Handy hochkant) · **Liveticker** (ESPN-Kommentar). Aufstellungen erscheinen auch schon vor Anpfiff, sobald ESPN sie liefert.
  - *NHL, MLB, NFL/NCAAF:* im gleichen Stil wie die NBA: Topspieler-Karten mit Foto, Spielverlauf-Diagramm (Differenz bzw. ESPN-Siegwahrscheinlichkeit, MLB nach Innings), letzte Aktionen bei Live-Spielen, Quoten und Tabelle – dazu wie bisher Torfolge/Shot Chart (NHL), Pitching-Entscheidung (MLB), Drives (Football).
  - *Fußball zusätzlich:* Torverlauf-Diagramm über die Spielminuten.
  - *Boxscore (alle Sportarten):* oben Umschalter zwischen den beiden Teams statt beide untereinander.
  - *Vor Spielbeginn (alle Ligen):* Vorschau mit Saisonduell, Form, Torhütern/Pitchern, Topspielern, Ausfällen, Prognose & Quoten, Tabelle.
- **Spieler- & Team-Popups:** Teamprofil in Vereinsfarben mit ★-Favoritenknopf, Bilanz, nächstem Spiel und **Kader** (Spieler antippen → Spielerprofil).
- **Dunkle Logo-Variante** per langem Druck auf ein Logo (pro Team gespeichert), **Auto-Reload**-Schalter im Footer, Versionsnummer unten.

## Aufbau

```
espn-dashboard/
├── index.html      Seitengerüst
├── styles.css      Design (dunkles Theme, mobil optimiert)
├── app.js          Frontend-Logik
├── gamecast.js     Spiel-Popup (Gamecast, Boxscore, Bericht)
├── profile.js      Spieler-/Team-Popup (Profilseite, Teamfarben als Akzent)
├── logo.js         Logo-Hilfe (Dark-Variante per Long-Press) + Teamfarben (TeamColor, Farbe aus Logo)
├── api/
│   ├── espn.js     Vercel-Function: Proxy zur ESPN-API (CORS + Caching, inkl. Suche & Kader)
│   ├── logo.js     Reicht Fussball.de-/Hockeyweb-Logos durch (für die Farberkennung)
│   ├── amateur.js  Fussball.de (Kreisliga)
│   └── hockey.js   Hockeyweb (Eishockey Europa)
├── vercel.json     Vercel-Einstellungen
└── package.json
```

Der Browser ruft nie direkt ESPN auf, sondern `/api/espn?type=…&sport=…&league=…`.
Die Function prüft die Parameter (kein offener Proxy), holt die Daten und lässt sie
von Vercel cachen (Spielstände 20 s, Tabellen/News 5 min).

Verwendete ESPN-Endpunkte:

| Typ | URL |
|---|---|
| scoreboard | `site.api.espn.com/apis/site/v2/sports/{sport}/{league}/scoreboard?dates=YYYYMMDD` |
| standings | `site.api.espn.com/apis/v2/sports/{sport}/{league}/standings` |
| news | `site.api.espn.com/apis/site/v2/sports/{sport}/{league}/news` |
| summary | `site.api.espn.com/apis/site/v2/sports/{sport}/{league}/summary?event={id}` |
| rankings | `site.api.espn.com/apis/site/v2/sports/{sport}/{league}/rankings` (AP Top 25 für NCAAF/NCAAM) |
| team | `site.api.espn.com/apis/site/v2/sports/{sport}/{league}/teams/{id}` (Team-Popup) |
| athlete | `site.web.api.espn.com/apis/common/v3/sports/{sport}/{league}/athletes/{id}` (Spieler-Popup) |
| roster | `site.api.espn.com/apis/site/v2/sports/{sport}/{league}/teams/{id}/roster` (Kader im Team-Popup) |
| search | `site.web.api.espn.com/apis/search/v2?query=…` (Spieler-/Teamsuche, ligaübergreifend) |

## Kreisliga (SGM I / SGM II)

Zwei Mannschaften der SGM FC Gündelbach/TSV Häfnerhaslach erscheinen gemeinsam als Liga „Kreisliga“ unter Fußball
(Umschalter Beide / SGM I / SGM II; in `LEAGUES` in `app.js`: `teams: ['sgm1', 'sgm2']`). Tab „Spiele“ funktioniert wie bei den ESPN-Ligen (Tagesansicht mit Datumsnavigation,
Sprung zum nächsten Tag mit Spielen; Team-Favoriten per ★, auch in der ★-Ansicht), Tab „Tabelle“ zeigt die Liga-Tabelle
(Platz 1 grün, Platz 2 gelb). Daten von Fussball.de: Die Tagesansicht zeigt alle Spiele der Liga (Spielpläne aller Mannschaften der Tabelle
werden zusammengeführt, 30 Min. Cache); Spiele der eigenen Mannschaft sind markiert. Vereinslogos kommen
vom Fussball.de-Logodienst (Hotlink).

- `api/amateur.js` liest die HTML-Fragmente der Mannschaftsseite (`ajax.team.table`, `ajax.team.matchplan`,
  `ajax.team.prev.games`) und liefert JSON; Antworten werden 15 Minuten im Edge-Netz gecacht.
- `api/_fussballde.js` enthält Mannschaftskonfiguration und Parser (`npm test` prüft ihn).
- **Keine Torstände:** Fussball.de verschleiert Ergebnisse (jede Ziffer ist ein Sonderzeichen einer
  seitenspezifischen Schriftart). Das wird bewusst nicht umgangen; gespielte Spiele verlinken auf den Spielbericht.
- **Neue Saison:** In `TEAMS` (`api/_fussballde.js`) `saison`, `staffelId` und ggf. `league` anpassen
  (Team-ID bleibt gleich, die Staffel-ID steht im Ajax-Link der Mannschaftsseite).
- Ändert Fussball.de sein HTML, liefert die Function einen Fehler bzw. leere Listen – dann den Parser anpassen.

## Eishockey (Hockeyweb)

Unter 🏒 Eishockey stehen neben der NHL (ESPN) die Ligen DEL, DEL2, Oberliga Süd, Oberliga Nord (Gruppe Deutschland) sowie NL (Schweiz), ICEHL und CHL (Gruppe Europa).
Aufbau wie bei den ESPN-Ligen: Tab „Spiele“ (Tagesansicht mit Datumsnavigation, Sprung von Spieltag zu Spieltag, Drittelergebnisse, n.V./n.P.),
Tab „Tabelle“ (DEL/DEL2 mit Playoff-/Playdown-Markierungen) und Favoriten-★ (auch in der ★-Liga). Kein News-Tab.

- **Quelle 1: App-API** (`api/_hockeyapp.js`, appdb.hockeyweb.de) – wie die Hockeyweb-App: ganze Saison pro Aufruf, Live-Stand (Drittel, Zwischenstand). Die Anfragen sind signiert; der Signierschlüssel liegt **nicht im Repo**, sondern in der Vercel-Umgebungsvariable `HOCKEYWEB_APP_KEY` (Project Settings → Environment Variables, danach neu deployen). Rundenkennungen (`ROUNDS`) und `SEASON_ID` gelten für 2026/27 und müssen zur neuen Saison angepasst werden.
- **Quelle 2 (Rückfall):** `api/hockey.js` liest die HTML-Seiten von hockeyweb.de aus (`api/_hockeyweb.js`), falls die App-API fehlt oder scheitert. Hockeyweb sperrt Server-IPs dort teils mit 403.
- Spiele kommen wochenweise (Spielwochen); die Function liefert zusätzlich den Spielwochen-Kalender der Saison.
- Antworten werden kurz im Edge-Netz gecacht (Spiele 60 s, Tabellen 10 min). Live-Stand nur über die App-API; ohne sie erscheinen laufende Spiele erst mit Ergebnis.
- Ändert Hockeyweb sein HTML, liefert die Function einen Fehler bzw. leere Listen – dann den Parser anpassen.

## Deployment

1. Neues Repository auf GitHub anlegen (z. B. `espn-dashboard`) und den Inhalt dieses Ordners hochladen
   (auf GitHub: *Add file → Upload files*, oder per `git push`).
2. Auf [vercel.com](https://vercel.com) → *Add New… → Project* → das Repository importieren.
3. Einstellungen so lassen (Framework Preset: **Other**, kein Build Command, kein Output Directory) → *Deploy*.

Danach deployt Vercel jeden Commit auf `main` automatisch.

## Lokal testen (optional)

```bash
npm i -g vercel
vercel dev
```

Dann `http://localhost:3000` öffnen. (Einfaches Öffnen der `index.html` reicht nicht, weil die API-Function laufen muss.)

## Weitere Ligen hinzufügen

In `app.js` die Liste `LEAGUES` erweitern, z. B.:

```js
{ id: 'por', name: 'Liga Portugal', cat: 'soccer', group: 'Topligen', sport: 'soccer', league: 'por.1', color: '#1fa463' },
{ id: 'wnba', name: 'WNBA', cat: 'basketball', group: 'Profis', sport: 'basketball', league: 'wnba', color: '#ff6f3c' },
```

`cat` bestimmt die Sportart (obere Leiste), `group` den Abschnitt in der Ligaleiste, `color` die Akzentfarbe.

## Hinweis

Die ESPN-API ist öffentlich erreichbar, aber nicht offiziell dokumentiert. ESPN kann Struktur oder
Verfügbarkeit jederzeit ändern. Die App ist ein privates Hobbyprojekt ohne Verbindung zu ESPN.

# Sport Dashboard

Browser-App, die Spielstände, Tabellen und News aus der öffentlichen ESPN-API anzeigt.
Gehostet auf Vercel, Code auf GitHub – ohne Build-Schritt, ohne Abhängigkeiten.

## Funktionen

- **Ligen:** NFL, NBA, MLB, NHL, NCAAF, NCAAM, Bundesliga, 2. Bundesliga, Premier League, La Liga, Ligue 1, Serie A, MLS, Champions League, Europa League, Conference League
  (die zehn Fußball-Wettbewerbe sind in der Navigation unter einem „⚽ Fußball“-Dropdown zusammengefasst, damit die Leiste übersichtlich bleibt)
- **★ Favoriten-Liga:** ganz vorne in der Liga-Leiste; zeigt die Spiele aller favorisierten Teams aus allen Ligen gemeinsam an einem Tag (nur Spiele-Ansicht, da ligaübergreifend – Tabelle/News ergeben hier keinen Sinn)
- **Spiele:** Live-Stände (Auto-Refresh alle 30 s bei laufenden Spielen), Anstoßzeiten in Ortszeit, Bilanz, Top-Performer, TV-Sender, Link zum ESPN-Gamecast
- **Datumsnavigation:** Tag vor/zurück oder Datum wählen; es wird immer ein konkretes Datum angezeigt, standardmäßig der heutige Tag. Bei den US-Ligen (NFL, NBA, MLB, NHL, NCAAF, NCAAM) wird der Spieltag anhand der US-Ostküstenzeit (Eastern Time) bestimmt statt der deutschen Kalendertage, damit ein Spiel in der Nacht von Samstag auf Sonntag (deutscher Zeit) weiterhin korrekt als Samstagsspiel geführt wird. Tag-vor/-zurück überspringt automatisch spielfreie Tage der jeweiligen Liga (z. B. bei der NFL direkt von Spieltag zu Spieltag statt Tag für Tag durch die Woche); beim Wechsel auf eine andere Liga springt das Datum direkt auf den heutigen oder, falls heute kein Spiel stattfindet, den nächsten Spieltag dieser Liga. Die Datumsanzeige ist bei allen Ligen gleich groß
- **Top 25 (nur NCAAF/NCAAM):** Nur bei den College-Ligen erscheint neben der Datumsanzeige ein „Top 25”-Schalter; aktiviert, filtert er die Spiele-Liste auf Partien mit mindestens einem Team aus den aktuellen AP Top 25 (anhand von ESPNs `curatedRank`, ohne zusätzlichen API-Aufruf)
- **Favoriten:** Stern neben einem Team setzen → Spiele werden hervorgehoben und oben einsortiert, zusätzlich in der ★-Liga ligaübergreifend gebündelt
- **Dunkle Logo-Variante:** Manche ESPN-Logos (z. B. Ohio State) sehen in der eigens fürs Dunkelmodus aufbereiteten Variante besser aus. Langer Druck (Touch oder Maus) auf ein Team-Logo schaltet pro Team dauerhaft auf diese Variante um – die Einstellung wird im Browser gespeichert (`localStorage`) und gilt überall in der App, wo das Logo dieses Teams erscheint (Spielkarten, Tabellen, Gamecast, Profil-Popups)
- **Design:** Hintergrund der App komplett schwarz
- **Auto-Reload:** Schalter im Footer – lädt die Seite alle 30 Sekunden automatisch neu, solange sie geöffnet ist (z. B. für einen dauerhaft angezeigten Bildschirm); Einstellung bleibt gespeichert
- **Tabellen:** je Liga passende Spalten, Conferences/Gruppen getrennt, Qualifikations-Markierungen im Fußball. Bei NCAAF/NCAAM (zu viele Conferences für eine gemeinsame Ansicht) per Dropdown wählbar, vorbelegt mit „Top 25“
- **News:** aktuelle Artikel und Videos je Liga
- **Spiel-Popup (Klick auf eine Karte):**
  - *NHL:* Gamecast mit Three Stars, Torfolge (inkl. PP/SH/EN), Shot Chart nach Drittel, Teamstatistik-Vergleich, Strafen, Spielinfo · Play-by-Play (filterbar) · Boxscore (Stürmer, Verteidiger, Torhüter) · Spielbericht
  - *MLB:* Gamecast mit Pitching-Entscheidung (Gewinner/Save/Verlierer), Punktefolge nach Inning, Linescore inkl. Hits/Errors, Teamstatistik-Vergleich · Play-by-Play (filterbar, auch pitch-genau) · Boxscore (Schlagleute, Pitcher) · Spielbericht
  - *NFL/NCAAF:* Gamecast mit Spielstand-Verlauf (TD/FG-Badges), Teamstatistik-Vergleich, Topspielern (Passing/Rushing/Receiving) · Drives (Drive-Ergebnis oder mit allen Spielzügen, filterbar nach Viertel) · Boxscore (Passing, Rushing, Receiving, Defense, Kicking) · Spielbericht; bei NCAAF Ranking-Badge (#Rang) neben Top-25-Teams
  - *Fußball (alle 7 Ligen):* Spielbericht mit Torschützen (inkl. Eigentore), Teamstatistik-Vergleich (Ballbesitz, Schüsse, Pässe, Flanken, Zweikämpfe, Fouls, Karten, Abseits), Spielinfo (Stadion, Zuschauer, Schiedsrichter) · **Aufstellungen**: Startelf und Ersatzbank beider Teams nach Position sortiert, mit Rückennummer, Ein-/Auswechslungs-Hinweis und Tor-/Vorlagen-/Karten-Badges – jeder Spielername verlinkt direkt ins Spieler-Popup. (ESPNs öffentliche API liefert bei Fußball keine minutengenauen Torereignisse wie bei den US-Ligen, daher ohne Spielminute.)
  - *Videos:* Highlight-Clips direkt im Popup abspielbar, wenn ESPN welche zum Spiel anbietet (NHL, MLB, NFL/NCAAF, Fußball und weitere Ligen)
  - *Vor Spielbeginn (alle Ligen):* Vorschau mit Saisonduell, Form, voraussichtlichen Torhütern/Pitchern, Topspielern, Ausfällen
  - *Andere Ligen:* allgemeine Übersicht (Linescore, Teamstatistik, Videos, Spielbericht) – eigene Ansichten folgen
  - Laufende Spiele aktualisieren sich im Popup alle 30 s
- **Spieler- & Team-Popups:** Jeder Spielername (Boxscore, Three Stars/Pitching-Entscheidung, Torfolge, Aufstellung, Topspieler, Vorschau) und jedes Team (Teamname auf der Spielkarte, Gamecast-Kopf, Tabellen, Top 25) ist anklickbar und öffnet ein eigenes Profil-Popup, auch aus der ★-Favoriten-Ansicht heraus mit korrektem Liga-Kontext. Auf der Spielkarte ist nur der Teamname selbst klickbar (nicht die ganze Zeile) – der übrige Platz der Zeile öffnet das Spiel:
  - *Spieler:* Foto, Rückennummer/Position, Status, Körpergröße/-gewicht, Alter, Geburtsort, Erfahrung, Draft, Hand, aktuelle Saisonstatistik, Verletzungsstatus
  - *Team:* Logo, Tabellenplatz, Bilanz (gesamt/Heim/Auswärts), nächstes Spiel – eingefärbt in den Vereinsfarben des Teams (Akzentfarbe & Kopfbereich-Verlauf), damit jedes Team-Popup individuell wirkt
  - Aus dem Spieler-Popup heraus ist das Team ebenfalls anklickbar (verschachteltes Popup)
- Versionsnummer unten auf der Seite

## Aufbau

```
espn-dashboard/
├── index.html      Seitengerüst
├── styles.css      Design (dunkles Theme, mobil optimiert)
├── app.js          Frontend-Logik
├── gamecast.js     Spiel-Popup (Gamecast, Boxscore, Bericht)
├── profile.js      Spieler-/Team-Popup (Profilseite, Teamfarben als Akzent)
├── logo.js         Gemeinsame Logo-Hilfe (Dark-Mode-Präferenz pro Team, Long-Press-Umschaltung)
├── api/
│   └── espn.js     Vercel-Function: Proxy zur ESPN-API (CORS + Caching)
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

## Amateurfußball (SGM I / SGM II)

Zwei Mannschaften der SGM FC Gündelbach/TSV Häfnerhaslach erscheinen als eigene Buttons („SGM I“, „SGM II“)
neben dem Favoriten-Stern. Tab „Spiele“ funktioniert wie bei den ESPN-Ligen (Tagesansicht mit Datumsnavigation,
Sprung zum nächsten Tag mit Spielen; Team-Favoriten per ★, auch in der ★-Ansicht), Tab „Tabelle“ zeigt die Liga-Tabelle
(Platz 1 grün, Platz 2 gelb). Daten von Fussball.de; es werden die Spiele der jeweiligen Mannschaft angezeigt.

- `api/amateur.js` liest die HTML-Fragmente der Mannschaftsseite (`ajax.team.table`, `ajax.team.matchplan`,
  `ajax.team.prev.games`) und liefert JSON; Antworten werden 15 Minuten im Edge-Netz gecacht.
- `api/_fussballde.js` enthält Mannschaftskonfiguration und Parser (`npm test` prüft ihn).
- **Keine Torstände:** Fussball.de verschleiert Ergebnisse (jede Ziffer ist ein Sonderzeichen einer
  seitenspezifischen Schriftart). Das wird bewusst nicht umgangen; gespielte Spiele verlinken auf den Spielbericht.
- **Neue Saison:** In `TEAMS` (`api/_fussballde.js`) `saison`, `staffelId` und ggf. `league` anpassen
  (Team-ID bleibt gleich, die Staffel-ID steht im Ajax-Link der Mannschaftsseite).
- Ändert Fussball.de sein HTML, liefert die Function einen Fehler bzw. leere Listen – dann den Parser anpassen.

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
{ id: 'ucl', name: 'Champions League', sport: 'soccer', league: 'uefa.champions' },
{ id: 'wnba', name: 'WNBA', sport: 'basketball', league: 'wnba' },
```

Jeder Eintrag mit `sport: 'soccer'` erscheint automatisch im „⚽ Fußball“-Dropdown
(`SOCCER_LEAGUES` in `app.js` wird direkt aus `LEAGUES` gefiltert) – für eine weitere
Fußball-Liga reicht also ein zusätzlicher Eintrag wie oben.

## Hinweis

Die ESPN-API ist öffentlich erreichbar, aber nicht offiziell dokumentiert. ESPN kann Struktur oder
Verfügbarkeit jederzeit ändern. Die App ist ein privates Hobbyprojekt ohne Verbindung zu ESPN.

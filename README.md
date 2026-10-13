# Sport Dashboard

Browser-App, die Spielstände, Tabellen und News aus der öffentlichen ESPN-API anzeigt.
Gehostet auf Vercel, Code auf GitHub – ohne Build-Schritt, ohne Abhängigkeiten.

## Funktionen

- **Ligen:** NFL, NBA, MLB, NHL, NCAAF, NCAAM, Bundesliga, 2. Bundesliga
- **Spiele:** Live-Stände (Auto-Refresh alle 30 s bei laufenden Spielen), Anstoßzeiten in Ortszeit, Bilanz, Top-Performer, TV-Sender, Link zum ESPN-Gamecast
- **Datumsnavigation:** Tag vor/zurück oder Datum wählen; „Aktuell“ zeigt den laufenden Spieltag bzw. die aktuelle Woche
- **Favoriten:** Stern neben einem Team setzen → Spiele werden hervorgehoben und oben einsortiert, Filter „Nur Favoriten“ (gespeichert im Browser)
- **Tabellen:** je Liga passende Spalten, Conferences/Gruppen getrennt, Qualifikations-Markierungen im Fußball
- **News:** aktuelle Artikel und Videos je Liga
- Versionsnummer unten auf der Seite

## Aufbau

```
espn-dashboard/
├── index.html      Seitengerüst
├── styles.css      Design (dunkles Theme, mobil optimiert)
├── app.js          Frontend-Logik
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
{ id: 'epl', name: 'Premier League', sport: 'soccer', league: 'eng.1' },
{ id: 'ucl', name: 'Champions League', sport: 'soccer', league: 'uefa.champions' },
{ id: 'wnba', name: 'WNBA', sport: 'basketball', league: 'wnba' },
```

## Hinweis

Die ESPN-API ist öffentlich erreichbar, aber nicht offiziell dokumentiert. ESPN kann Struktur oder
Verfügbarkeit jederzeit ändern. Die App ist ein privates Hobbyprojekt ohne Verbindung zu ESPN.

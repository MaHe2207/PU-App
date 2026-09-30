# PU – Pokémon × Unmatched · v9

v9 ergänzt die PWA um ein persönliches Spieler-Dashboard.

## Neu in v9
- Dashboard ist jetzt die Startseite jedes Spielerlinks
- Trainerstufe 0–13 pro Spieler, im Admin-Bearbeitungsmodus änderbar und in Firebase gespeichert
- aktueller Standort wird automatisch aus der Trainerposition auf der Weltkarte übernommen
- Dex-Fortschritt und Prozentanzeige
- Favoriten als Schnellzugriff
- stärkste gefangene Pokémon nach Level
- Fortschritt nach Pokémon-Typ
- direkter Sprung vom Dashboard zum Standort auf der Karte

## Aktualisierung von v8
Ersetzen:
- `index.html`
- `app.js`
- `styles.css`
- `sw.js`
- `manifest.webmanifest`

Es sind keine neuen Datendateien und keine Änderungen an den Firestore-Regeln nötig.

Beim ersten Öffnen ist die Trainerstufe vorhandener Spieler `0`. Als Admin: Bearbeitungsmodus aktivieren → Dashboard → Trainerstufe einstellen.

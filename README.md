# PU – Pokémon × Unmatched · v11

v11 ergänzt die PWA um eine **Spielleiter-Zentrale**. Sie ist ausschließlich nach der Firebase-Admin-Anmeldung sichtbar.

## Neu in v11
- zentraler Überblick über alle Spieler
- Trainerstufe, aktueller Standort und Dex-Fortschritt pro Spieler
- Favoriten, erfüllte/aktive Ziele und höchstes Pokémon-Level auf einen Blick
- drei stärkste gefangene Pokémon je Spieler als Schnellübersicht
- Kampagnen-Kennzahlen: Spielerzahl, durchschnittlicher Dex-Fortschritt, erfüllte Ziele und gesetzte Kartenpositionen
- Hinweise, wenn Spieler weniger als drei aktive Ziele oder keine Kartenposition haben
- Suche und Sortierung nach Name, Dex-Fortschritt, Trainerstufe oder erfüllten Zielen
- direkter Sprung in das Spieler-Dashboard
- direkter Sprung zur Trainerposition auf der Karte
- manueller Aktualisieren-Button für die Daten aus Firestore

## Öffnen
Als Admin anmelden → ☰ → **Spielleiter-Zentrale**.

## Aktualisierung von v10
Ersetzen:
- `index.html`
- `app.js`
- `styles.css`
- `sw.js`
- `manifest.webmanifest`

Es sind **keine neuen Datendateien**, **keine Änderungen an den Firestore-Regeln** und **kein erneuter Spielerimport** nötig.

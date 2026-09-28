PU v5.0 – Begegnungsmodul

In GitHub ersetzen:
- index.html
- app.js
- styles.css
- sw.js
- manifest.webmanifest

Neu hochladen:
- data/encounters.json

Nicht verändern:
- firebase-config.js
- Firestore
- Spielerstände
- pokemon.json / attacks.json / evolutions.json
- assets/

Der Zufallsgenerator übernimmt die Schrittfolge und Zufallslogik aus
„Zufallsgenerator 3.html“ und die Daten aus „Zufall (1).xlsx“.
Es ist kein Excel-Upload mehr nötig.

Neu:
- Bereich „Begegnung“
- Feld-Code + TS 0–13
- wilde Begegnung / freiwillige Begegnung / Trainerkampf
- sichtbare Schrittfolge 1.0 / W2.0 / W3.0 bzw. T2.0–T6.0
- Ergebnis direkt als Gegner in die Kampfvorbereitung übernehmen

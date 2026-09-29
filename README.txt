PU Dex v6.0 – Weltkarte

In GitHub ersetzen:
- index.html
- app.js
- styles.css
- sw.js
- manifest.webmanifest

Neu ergänzen:
- data/map.json

Firebase-Spielstände bleiben unverändert. Kein erneuter Import nötig.

Neu in v6:
- eigener Bereich „Karte“
- 61 Felder aus 260119 Landkarte.xlsx
- Arenen- und Trainer-Layer
- 74 Pokémon-Vorkommenslayer
- genau ein Pokémon-/Flächenlayer gleichzeitig; erneutes Antippen schaltet aus
- „Alle aus“
- Layer-Suche
- Touch-Pan + Pinch-Zoom + Zentrieren
- Feldinfo mit Name/Beschreibung/Markern
- direkter Übergang Feld → Begegnung, wenn der Feldcode vom Zufallsgenerator unterstützt wird

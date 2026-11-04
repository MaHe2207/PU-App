# PU-Dex v13.6 – Typen- und Werte-Symbole

## Neue Symbole

- Die 15 vom Spiel verwendeten Pokémon-/Attackentypen werden mit den bereitgestellten PNG-Symbolen dargestellt.
- **Stein.png** wurde dem App-Typ **Gestein**, **Drachen.png** dem App-Typ **Drache** zugeordnet. Alle Dateinamen sind für GitHub vereinfacht und liegen unter `assets/ui-icons/`.
- Die vier gelieferten Werte-Symbole werden im einfachen und komplexen Kampfmodus bei **Angriff**, **Verteidigung**, **Genauigkeit** und **Initiative** gezeigt.
- Typen-Symbole erscheinen unter anderem in Dex, Typenfiltern, Pokémon-Details, Attackenlisten, Kartenbibliothek, Typenmodifikatoren und Kampfansicht.

## Einfacher Kampfmodus

- Jedes aktive Pokémon zeigt **Schwächen**, **Resistenzen** und **Immunitäten**, abgeleitet von den vorhandenen `typeModifiers` seiner Charakterkarte.
- Zu jedem betroffenen Typ steht sein Symbol zusammen mit dem wirklichen Kartenwert-Modifikator, etwa `+1`, `−2` oder `×` (immun).
- Gibt es für eine der drei Kategorien keine Einträge, wird ein Strich dargestellt.
- Die Angabe einer Zugreihenfolge und die nummerierten Zugmarkierungen wurden aus dem einfachen Kampfdashboard entfernt. Es bleibt ein Dashboard für aktive Pokémon ohne Spielzug-Tracking.
- Die bisherigen Status-, KP- und Zusatznachzug-Steuerungen bleiben erhalten.

## Aktualisierung

- Keine Änderung an Firestore-Regeln oder Spielständen erforderlich.
- Die neuen PNG-Dateien im Unterordner `assets/ui-icons/` **müssen** zusammen mit den aktualisierten Programmdateien hochgeladen werden.
- Der Service Worker nimmt die neuen Symbole in den Offline-Cache auf.

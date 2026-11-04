# PU-Dex

## v13.6 – Typen- und Werte-Symbole

19 neue Symbole für 15 Pokémon-/Attackentypen und die vier Werte Angriff, Verteidigung, Genauigkeit, Initiative. Im einfachen Kampfdashboard werden Schwächen, Resistenzen und Immunitäten mit Typen-Icons und ihren Kartenwert-Modifikatoren angezeigt. Die Anzeige einer Zugreihenfolge bzw. „wer am Zug ist“ entfällt in diesem Modus. Details: `README-v13.6.md`.

## v13.5 – freie Sicht im Kampf und farbige Zustände

Auf dem Kampfbildschirm verschwinden die untere Navigation und der rote Sprung-zum-Kampf-Hinweis. In den anderen Menüs bleiben Navigation und Kampfsprung erhalten. Alle sechs Zustandssymbole sind nun farbig, und der einfache Modus zeigt die Zusatznachzüge mit Plus-/Minus-Buttons. Siehe `README-v13.5.md`.

## v13.4 – PC- und Handymodus

Im Einstellungsmenü stehen **Automatisch**, **PC** und **Handy** zur Wahl. Die Darstellung gilt für alle Bereiche und wird pro Gerät gespeichert. Zusätzlich zeigt der Einstellungsbereich die installierte Versionsnummer. Details stehen in `README-v13.4.md`.

## v13.2 – einfacher / komplexer Kampfmodus

Neu in v13.2: Die Spielleitung kann global zwischen einem einfachen Kampfdashboard und dem bisherigen komplexen Kampftisch umschalten. Karten-/Session-Pool bleibt unverändert. Details stehen in `README-v13.2.md`.

## v13.1 – geführter Spielablauf

Neu in v13.1: klarer „Nächster Schritt“-Bereich, Session-Fortsetzen auf dem Dashboard, automatische Führung vom Kartenholen über Kampfstart bis zum Aufräumen, weniger Doppelanzeigen und Entfernung technischer Hintergrundinformationen aus der normalen Oberfläche. Details stehen in `README-v13.1.md`.

## v13 – Session-Pool

Neu in v13: sessionbezogene Kartenrelevanz, global gewichtete Wild- und Trainergegner ohne Standort, frei einstellbare Session-Pool-Größe, Kartenfluss zwischen Hauptarchiv / aktuellem Kampf / Session-Pool, dynamische Aufräumempfehlungen und alphabetische Rücksortierliste am Session-Ende. Details stehen in `README-v13.md`.

## v12.6
Erfüllte Ziele sind im Dashboard standardmäßig eingeklappt und können bei Bedarf aufgeklappt werden.

# PU-Dex v12.3 – Kartenliste mit Reserve & 4-Set-Deckel

Dieses Update korrigiert ausschließlich die Kartenlogik der Kampfvorbereitung.

## Kartenlogik
- Alle Pokémon beider Teams zählen zur Kartenliste – auch die Reservebank.
- Pro Seite sind weiterhin bis zu 6 Pokémon möglich.
- Für jede Attacke wird ermittelt, wie viele der bis zu 12 Team-Pokémon diese Attacke auf ihrem gewählten Level beherrschen.
- Physisch werden pro Attacke jedoch höchstens **4 vollständige Kartensets** eingeplant.
- Grund: Maximal 4 Pokémon kämpfen gleichzeitig (2 gegen 2). Wird ein Pokémon besiegt, können dessen Kartensets für ein nachrückendes Reserve-Pokémon wiederverwendet werden.

Beispiel bei Kartensatzgröße x2:
- 1 Pokémon braucht Feuerwirbel → 2 Karten
- 3 Pokémon brauchen Feuerwirbel → 6 Karten
- 4 Pokémon brauchen Feuerwirbel → 8 Karten
- 5, 6 oder mehr Pokémon brauchen Feuerwirbel → weiterhin 8 Karten

Die Anzeige nennt bei mehr als vier Nutzern ausdrücklich, dass auf vier Sets gedeckelt wurde.

## Sonstiges
- Keine Änderung an den Firestore-Regeln nötig.
- Bestehende Spielerstände und laufende Kämpfe bleiben erhalten.
- Die Zugreihenfolge und alle v12.1-Korrekturen bleiben unverändert.

## v12.4 – Zielstatus, Standorte & neue Spieler
- Ziele werden nur noch manuell durch die Spielleitung als **Inaktiv / Aktiv / Erfüllt** gesetzt.
- Dex-Fortschritt markiert ein Ziel nicht mehr automatisch als erfüllt.
- Spieler ohne bisherigen Kartenmarker können erstmalig einen Standort erhalten.
- Neue Spieler lassen sich direkt in der Spielerauswahl anlegen; JSON-Import bleibt für vorhandene Alt-Spielstände erhalten.


## v12.5 – unbegrenzt viele Ziele
- Keine Begrenzung der Zielanzahl mehr.
- Beliebig viele Ziele können `Aktiv` oder `Erfüllt` sein.
- Alle vergebenen Ziele werden im Dashboard angezeigt.
- Keine Änderung an Firebase-Regeln nötig.


## v13.3 – einfaches Kampfdashboard optimiert
Status/Werte direkt auf der Vorderseite; aktive Pokémon auf PC in Zugreihenfolge untereinander. Siehe `README-v13.3.md`.

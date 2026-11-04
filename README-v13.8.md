# PU-Dex v13.8 – Korrektur der abgeschnittenen Querformat-Anzeigen

## Änderungen gegenüber v13.7

- Die Symbolreihen für Schwächen, Resistenzen und Immunitäten sind im Handy-Querformat nicht mehr horizontal scrollbar. Alle Typen-Symbole werden vollständig auf so viele Zeilen umgebrochen, wie der Inhalt benötigt.
- Die Querformat-Gestaltung gilt jetzt bis 1300 px Viewportbreite und 650 px Höhe. Sie ist nicht länger davon abhängig, ob in den Einstellungen `Handy`, `Automatisch` oder `PC` ausgewählt wurde.
- Die zusätzliche Überschrift `Aktive Pokémon` wird im TV-Querformat eingespart. Es bleibt der Kampf-Kopf mit den Schaltflächen `Zur Vorbereitung` und `Kampf beenden`.
- Die Bewegungsinformation wird in dieser Ansicht kurz und vollständig als `Fern · Bew. N` bzw. `Nah · Bew. N` dargestellt.
- Bei höchstens 400 px Bildschirmhöhe werden die Abstände, Symbole und Schaltflächen etwas weiter verdichtet.
- Die vier aktiven Pokémon bleiben im 2×2-Raster. Kachelinhalte werden nicht durch starre Höhen abgeschnitten; bei extrem wenig Bildschirmhöhe kann die Gesamtseite dennoch vertikales Scrollen benötigen.
- Die PC-Ansicht im üblichen großen Desktopfenster, der Hochformat-Modus und die komplexe Kampfsteuerung bleiben unverändert.

## Installation auf GitHub

`PU_App_v13_8_Update_nur_Aenderungen.zip` entpacken und die sieben enthaltenen Dateien in das **Hauptverzeichnis** des bestehenden Repositories kopieren. Die alten Dateien gleichen Namens ersetzen. Die Ordner `assets/` und `data/` sowie Firebase-Spielstände bleiben unberührt.

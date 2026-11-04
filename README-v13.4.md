# PU-Dex v13.4 – PC- und Handymodus

## Neu

- Unter **Einstellungen → Darstellung** gibt es drei Optionen:
  - **Automatisch** (Standard): ab 1100 Pixel Browserbreite PC-Layout, darunter bisheriges responsives Layout.
  - **PC**: breit angelegte Oberfläche mit zusätzlichen Spalten in Dex, Dashboard, Bibliothek und Spielleiter-Zentrale; Kampfvorbereitung und Kampfdashboard nutzen die größere Breite.
  - **Handy**: kompakte, touchfreundliche Darstellung auf maximal 480 Pixel Breite, unabhängig von der Browsergröße.
- Die Einstellung gilt für alle App-Bereiche einschließlich Karte, Begegnungen, Kampf, Bibliothek, Spielerübersicht und Dialoge.
- Die Auswahl wird **nur auf dem jeweiligen Gerät im Browser** gespeichert. PC und Handy können somit unterschiedliche Einstellungen nutzen und beeinflussen nicht die Daten anderer Spieler.
- Die Einstellungen zeigen **PU-App-Version v13.4**.

## Technische Hinweise

- Keine Änderungen an Firestore-Regeln oder an Spielständen nötig.
- Bei einer Änderung des Layouts wird die Kartenansicht bei Bedarf neu an ihre Größe angepasst.
- Wer auf einem sehr schmalen Display ausdrücklich **PC** auswählt, muss möglicherweise horizontal scrollen. Dafür kann jederzeit wieder **Handy** oder **Automatisch** gewählt werden.
- Der PWA-Cache und die Versionsparameter der Programmdateien wurden aktualisiert, damit installierte Apps v13.4 beziehen.

# PU v13.2 – Einfacher / komplexer Kampfmodus

- Basis: v13.1. v14 ist nicht enthalten.
- In den Admin-Einstellungen gibt es den globalen Schalter **Komplexer Kampfmodus**.
- Standard: ausgeschaltet = einfaches Kampfdashboard.
- Einfacher Modus zeigt KP, Zustände, Statuswerte, Statusprüfungen, Feld/Reserve/Besiegt.
- Kartenwahl, Kampfrechner, Zugreihenfolge, Typmodifikator-Detailzeile und Deckzähler werden im einfachen Modus ausgeblendet.
- Komplexer Modus stellt den bisherigen v13.1-Kampftisch wieder her.
- Kampfvorbereitung, benötigte Attackenkarten, Session-Pool, Karten holen und einsortieren bleiben unverändert.
- Die Einstellung wird global in Firestore als `players/pu_app_config` gespeichert und gilt auf allen Geräten.
- Die Firestore-Regeln aus v13.1 reichen aus; keine Regeländerung nötig.

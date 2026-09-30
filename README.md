# PU Dex v10 – Spielerziele

Neu in v10:
- 47 Ziele aus `Aufgaben.pdf` als strukturierte Daten in `data/goals.json`
- pro Spieler bis zu 3 aktive Ziele
- Ziele werden im Admin-Bearbeitungsmodus auf dem Dashboard aktiviert/deaktiviert
- Zielerfüllung wird automatisch aus dem aktuellen Pokédex berechnet
- Fortschrittsanzeige pro Ziel; kein manueller Erledigt-Status nötig
- Speicherung der aktiven Ziele in `profile.activeGoals` des bestehenden Firebase-Spielerdokuments

Es sind keine Änderungen an Firestore-Regeln und kein erneuter Spielerimport nötig.

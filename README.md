# PU Dex Firebase v6.2

Fix für das Speichern von Trainerpositionen.

In v6.1 wurde für die Kartenkonfiguration versehentlich die Firestore-Dokument-ID `__pu_map_config__` verwendet. Firestore reserviert IDs im Muster `__.*__`; deshalb schlug das Speichern fehl. v6.2 verwendet die gültige ID `pu_map_config`.

Keine Änderung an Firestore-Regeln oder Spielerständen nötig.

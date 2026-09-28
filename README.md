# PU Dex – Firebase + GitHub Pages

Diese Version verbindet den mobilen Dex mit Cloud Firestore. GitHub Pages liefert App, Bilder und statische Monsterdaten; Firebase speichert ausschließlich die veränderlichen Spielerstände.

## Bereits eingerichtet

- Firebase-Projekt: `pu-app-5200f`
- Cloud Firestore über `firebase-config.js`
- Admin-Zugriff über die hinterlegte Firebase-UID
- öffentliche Spieleransicht nur über einen zufälligen persönlichen Dokument-Link
- Admin kann nach Anmeldung alle Spieler auflisten und bearbeiten
- Änderungen werden automatisch mit Firestore synchronisiert
- 151 Monsterbilder aus `PU.zip`, nach WebP optimiert
- keine Excel-Datei im laufenden Dex nötig
- Importseite für vorhandene JSON-Spielstände oder direkt `PU.zip`

## 1. Auf GitHub Pages veröffentlichen

1. Neues GitHub-Repository anlegen, z. B. `PU-Dex`.
2. Den kompletten Inhalt dieses Ordners in das Repository hochladen.
3. GitHub: **Settings → Pages**.
4. **Deploy from a branch** wählen.
5. Branch `main`, Ordner `/ (root)` wählen und speichern.
6. Die von GitHub angezeigte Pages-Adresse öffnen.

## 2. Vorhandene Spielstände importieren

Nach Veröffentlichung `admin-import.html` an die GitHub-Pages-Adresse anhängen, z. B.:

`https://DEINNAME.github.io/PU-Dex/admin-import.html`

Dort:

1. Mit dem Firebase-Admin-Konto anmelden.
2. `PU.zip` auswählen. Die sieben Dateien im Ordner `Speicherstände/` werden automatisch erkannt.
3. Zusätzlich `Marcel.json` auswählen.
4. Import starten.
5. Die erzeugten persönlichen Spielerlinks kopieren und an die jeweiligen Spieler geben.

Die Spielstände werden beim Import nicht in GitHub gespeichert. Die Seite liest die ausgewählten lokalen Dateien nur im Browser und schreibt sie direkt nach Firestore.

## 3. Dex verwenden

Spieler öffnen ausschließlich ihren persönlichen Link. Sie können ihren Dex ansehen, aber nichts verändern.

Der Spielleiter öffnet den Dex, tippt auf `☰`, meldet sich an und kann dann die geschützte Spielerliste sowie den Bearbeitungsmodus verwenden. Änderungen werden nach kurzer Verzögerung automatisch gespeichert.

## Sicherheit

Die Firestore-Regeln stehen zusätzlich in `firestore.rules`. Die Web-Konfiguration in `firebase-config.js` ist keine geheime Server-Zugangsdaten-Datei. Niemals Service-Account-Schlüssel oder private Schlüssel in dieses Repository legen.

Das Modell der persönlichen Spielerlinks ist bewusst ein Freigabelink-Modell: Wer die lange zufällige Spieler-ID kennt, kann diesen einen Dex lesen. Die Collection selbst kann anonym nicht aufgelistet werden.

## Nächste Ausbaustufen

Die vorhandenen Tabs `Attacken` und `Entwicklung` sind vorbereitet. Die Daten aus den weiteren PU-Dateien können im nächsten Schritt als statische App-Daten integriert werden, ohne sie in Firestore abzulegen.

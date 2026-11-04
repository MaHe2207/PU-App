# PU-Dex v13.7 – Handy-Querformat für den einfachen Kampfbildschirm

## Ziel

Beim Spiegeln eines Handys auf einen Fernseher sollen bis zu vier gleichzeitig aktive Pokémon ohne vertikales Scrollen gut erkennbar sein.

## Darstellung

- Im einfachen Kampfmodus und im Handy-Querformat (bis 1000 px Breite / 600 px Höhe) erscheint ein 2×2-Raster, sofern vier Pokémon aktiv sind.
- Die Handy-Breitenbegrenzung von 480 px wird nur während dieser Kampfansicht aufgehoben. Die übrigen Bereiche behalten die gewählte PC-/Handyansicht.
- Die vier Kacheln enthalten Pokémon-Bild, Name, Level, Typ, KP samt Plus-/Minus-Steuerung, sechs Zustände, vier veränderbare Werte, Typenschwächen, Resistenzen, Immunitäten und Zusatznachzüge.
- Kompakte Typenprofile sind bei sehr vielen Typenmodifikatoren waagerecht innerhalb ihrer Gruppe scrollbar; die Kacheln selbst bleiben im Raster.
- Die obere App-Leiste und die laufende Ereignismeldung werden ausschließlich in dieser Querformat-Kampfansicht ausgeblendet. Kampf beenden und Zur Vorbereitung bleiben erreichbar.
- Reserve-Pokémon stehen unter den vier aktiven Pokémon und können bei Bedarf durch vertikales Scrollen aufgerufen werden.
- Der Hochformat-Modus und die PC-Ansicht werden nicht verändert. Der komplexe Karten-Kampfmodus bleibt unverändert.

## Aktualisierung auf GitHub Pages

Das ZIP `PU_App_v13_7_Update_nur_Aenderungen.zip` enthält ausschließlich geänderte bzw. neue Dateien. Diese Dateien in das **Hauptverzeichnis des GitHub-Repositories** hochladen und die gleichnamigen alten Dateien ersetzen; `README-v13.7.md` neu ergänzen.

Die vorhandenen Dateien unter `data/` und `assets/`, ebenso Firebase-Daten und Spielstände, bleiben erhalten. Nach dem GitHub-Upload die App auf dem Handy neu laden; der neue Service-Worker-Cache ist `pu-dex-v13-7-landscape-battle-20261104`.

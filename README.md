# Life Tracker

Persönliche Web-App (PWA) im Pixel-Art-Stil: oben der heutige Tag, unten die Tunnel zu den großen Zielen.
Wird am iPhone über Safari → „Zum Home-Bildschirm“ installiert und läuft danach offline.

Alle Daten und Fotos liegen nur im Browser des Geräts (IndexedDB). Es gibt keinen Server und kein Konto.
Sicherung: Zahnrad → „Exportieren“ erzeugt eine ZIP-Datei mit allen Daten und Fotos, „Importieren“ spielt sie zurück.

## Entwickeln

```bash
python3 tools/serve.py
```

Danach http://localhost:5173 öffnen. Lokal ist der Service Worker aus, außer mit `?sw` im Link.

## Veröffentlichen

Vor jeder Veröffentlichung `VERSION` in `sw.js` erhöhen, damit installierte Apps die neuen Dateien laden.
Neue Dateien müssen in die Liste `FILES` in `sw.js`.

Schrift: [Silkscreen](https://github.com/googlefonts/silkscreen) (SIL Open Font License, siehe `fonts/`).

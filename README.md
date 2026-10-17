# RAIM – Reime, die klingen

Web-App für Rap- und Songtexte. Läuft komplett im Browser, ohne Installation und ohne Build.

## Starten

`index.html` (Startseite) oder direkt `app.html` (App) per Doppelklick öffnen.

Nur YouTube-Beats brauchen einen kleinen Webserver, weil YouTube keine lokal geöffneten Dateien abspielt:

```
python3 -m http.server 8000   # dann http://localhost:8000/app.html öffnen
```

## Funktionen

Alles ist in **Projekte** organisiert, ein Projekt pro Song. Jedes Projekt hat drei Bereiche:

- **Text**: Songtext schreiben. Unter dem Text erscheinen Reime auf dein letztes Wort, darunter deine gemerkten Wörter. Antippen fügt sie ein. Dazu **KI-Ideen**: 2 oder 4 neue Zeilen passend zum Song, auf Wunsch auf dein Reimende (Claude von Anthropic, eigener API-Schlüssel in den Einstellungen, Zustimmung ab 18, höchstens 24 Zeilen werden gesendet).
- **Beat**: Beat-Datei hochladen (bleibt im Projekt gespeichert) oder YouTube-Link. Loop-Bereich auf der Wellenform ziehen, Tempo ändern, dich zum Beat aufnehmen. Aufnahmen bleiben im Projekt; Stimme und Beat werden getrennt und sampelgenau aufgezeichnet und erst danach gemischt. Die Verzögerung von Kopfhörer und Mikrofon wird automatisch ausgeglichen („Sync-Ausgleich“) und lässt sich pro Aufnahme nachträglich verschieben. Download als Mix oder nur Stimme (WAV). Dazu die **Lizenz**: Produzent, Lizenzart, BPM, Tonart, Kaufdatum, Notizen und die Lizenzdatei (PDF, Bild …). Nach dem Speichern erscheint sie als schmale Leiste, die per Klick alle Angaben zeigt.
- **Reime**: Reimsuche nach Klang, eigene für jedes Projekt. Oben stehen die Reimenden aus deinem Text, farbig markiert, wenn sie miteinander reimen; antippen sucht Reime darauf. Mit ★ merkst du dir Wörter fürs Projekt, mit ✕ („Passt nicht“) oder Wischen blendest du Reime in diesem Projekt aus. Die letzten Suchen werden pro Projekt gespeichert.

Gelöschte Projekte landen im **Papierkorb** (unten auf der Projektseite) und werden nach 28 Tagen endgültig gelöscht; bis dahin lassen sie sich wiederherstellen.

Unter Einstellungen (Zahnrad) prüft **„Schlüssel testen“**, ob dein API-Schlüssel funktioniert (Format, Gültigkeit, Guthaben).

Alles bleibt lokal im Browser gespeichert (IndexedDB). Unter Einstellungen (Zahnrad) kannst du **alles exportieren**, inklusive Beats, Lizenzen und Aufnahmen, und wieder importieren. Mach das regelmäßig: Wenn du die Browserdaten löschst, sind die Projekte weg.

## Dateien

- `index.html`, `styles.css`, `script.js`: Startseite
- `app.html`, `app.css`: App
- `js/rhyme.js`: Reim-Engine (deutsche Aussprache-Näherung und Bewertung)
- `js/words.js`: Wortliste (239.279 Wörter)
- `js/ai.js`: KI-Ideen über die Claude API
- `js/beats.js`: Beat-Player, Loop, Tempo, Aufnahmen, YouTube
- `js/wav.js`: WAV-Kodierung der Aufnahmen
- `js/db.js`: Projekte und Dateien (IndexedDB)
- `js/store.js`: Einstellungen
- `js/app.js`: Oberfläche

## Wortliste

Aus [davidak/wortliste](https://github.com/davidak/wortliste), erzeugt aus DWDS (CC BY-ND), Leipzig Corpora Collection (CC BY) und DeReWo (CC BY-NC). Für eine kommerzielle Nutzung sollte die Wortliste ersetzt oder die Lizenz geklärt werden.

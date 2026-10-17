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

- **Text**
  - Songtext in Abschnitten (Intro, Hook, Part, Bridge, Outro) als einklappbare Karten; Reihenfolge ändern, umbenennen, löschen. Eine Zeile wie `[Hook]` im Text startet ebenfalls einen Abschnitt.
  - **Hook / Bridge wiederholen**: Ein leerer Abschnitt mit gleichem Namen wiederholt den Text von oben (im Teleprompter und PDF ausgeschrieben). Schreibst du etwas hinein, gilt nur noch dein eigener Text; leerst du ihn wieder, wird wiederholt.
  - Sprache des Songs: **Deutsch** oder **English**.
  - Unten Reime auf dein letztes Wort (rosa = andere Sprache) und deine gemerkten Wörter.
  - **KI-Ideen**: 2 oder 4 neue Zeilen passend zum Song (Claude von Anthropic, eigener API-Schlüssel).
  - **PDF**: Songtext mit Beat- und Lizenzinfos als PDF (lädt beim ersten Mal den PDF-Baustein jsPDF aus dem Netz).
- **Beat**
  - Beat-Datei oder YouTube-Link, Loop, Tempo. Tipp auf die Wellenform setzt die Startstelle.
  - **Teleprompter**: zeigt den Text groß und lässt ihn im Takt mitlaufen (eine Zeile pro Takt), z. B. zum Einsingen in FL Studio. Das Tempo kommt aus den BPM des Beats: eintragen, aus der Lizenz übernehmen oder beim Hochladen automatisch erkennen lassen. Dazu „Takte pro Zeile“ (½, 1, 2, 4) und Einzähler (1 oder 2 Takte); ohne BPM startet er nicht. Unter „Was soll laufen?“ wählst du den ganzen Song oder nur einzelne Abschnitte (z. B. nur Intro, nur Hook, Hook + Part 1). Optional mit dem Beat ab der Startstelle; − / + zum Feinjustieren (wird beim nächsten Start zurückgesetzt), Zeile antippen zum Springen.
  - Aufnahmen aus früheren Versionen bleiben unter „Frühere Aufnahmen“ abspiel- und ladbar; neu aufnehmen kann RAIM nicht mehr.
  - **Lizenz** als schmale Leiste mit allen Angaben und Datei, dazu **Lizenzwarnungen** (fehlende Lizenz, Free/Lease-Grenzen, fehlende Lizenzdatei …; kein Rechtsrat).
- **Reime**
  - Reimsuche nach Klang auf **Deutsch und Englisch**, auch über beide Sprachen hinweg (z. B. „Money“ → honey, funny, Manie). Sprachen per DE/EN an- und ausschalten.
  - Häufige Wörter stehen bei gleich guten Reimen weiter oben.
  - **Synonyme**: Bedeutung eingeben, optional „reimt auf“ – dann nach Reim sortiert. Deutsch offline (OpenThesaurus), Englisch online (Datamuse).
  - Reimenden aus deinem Text (farbig gruppiert), Gemerkt-Liste, Verlauf, „Passt nicht“.

Gelöschte Projekte landen im **Papierkorb** (unten auf der Projektseite) und werden nach 28 Tagen endgültig gelöscht; bis dahin lassen sie sich wiederherstellen.

Unter Einstellungen (Zahnrad) prüft **„Schlüssel testen“**, ob dein API-Schlüssel funktioniert.

Alles bleibt lokal im Browser gespeichert (IndexedDB). Unter Einstellungen kannst du **alles exportieren**, inklusive Beats, Lizenzen und Aufnahmen, und wieder importieren. Mach das regelmäßig: Wenn du die Browserdaten löschst, sind die Projekte weg.

## Dateien

- `index.html`, `styles.css`, `script.js`: Startseite
- `app.html`, `app.css`: App
- `js/rhyme.js`: Reim-Engine (deutsche Aussprache-Näherung und Bewertung)
- `js/words.js`, `js/words-en.js`: Wortlisten Deutsch/Englisch
- `js/thesaurus-de.js`: deutsche Synonyme
- `js/song.js`: Song-Abschnitte
- `js/prompter.js`: Teleprompter
- `js/ai.js`: KI-Ideen über die Claude API
- `js/beats.js`: Beat-Player, Loop, Tempo, Teleprompter-Steuerung, YouTube, frühere Aufnahmen
- `js/wav.js`: WAV-Lesen und -Schreiben für frühere Aufnahmen
- `js/db.js`: Projekte und Dateien (IndexedDB)
- `js/store.js`: Einstellungen
- `js/app.js`: Oberfläche

## Daten und Lizenzen

Die Dateien in `js/words.js`, `js/words-en.js` und `js/thesaurus-de.js` erzeugt `tools/build_data.py` aus:

- Deutsche Wörter: [davidak/wortliste](https://github.com/davidak/wortliste) (DWDS CC BY-ND, Leipzig Corpora CC BY, DeReWo CC BY-NC)
- Worthäufigkeiten: [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) (CC BY-SA 4.0)
- Englische Aussprache: [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict) (BSD-Lizenz)
- Deutsche Synonyme: [OpenThesaurus](https://www.openthesaurus.de) (LGPL)
- Englische Synonyme: [Datamuse API](https://www.datamuse.com/api/) (online)
- PDF: [jsPDF](https://github.com/parallax/jsPDF) (MIT, per CDN)

Wegen DeReWo (nicht-kommerziell) sollte die deutsche Wortliste für eine kommerzielle Nutzung ersetzt oder die Lizenz geklärt werden.

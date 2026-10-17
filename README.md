# RAIM – Reime, die klingen

Web-App für Rap- und Songtexte. Läuft komplett im Browser, ohne Installation und ohne Build.

## Starten

`index.html` (Startseite) oder direkt `app.html` (App) per Doppelklick öffnen.

Nur YouTube-Beats brauchen einen kleinen Webserver, weil YouTube keine lokal geöffneten Dateien abspielt:

```
python3 -m http.server 8000   # dann http://localhost:8000/app.html öffnen
```

## Funktionen

Alles ist in **Projekte** organisiert, ein Projekt pro Song. Jedes Projekt hat vier Bereiche: Text, Beat, Prompter und Reime.

**Neues Projekt:** Vor dem Öffnen fragt RAIM die Grundinfos ab: Name, Beat (oder „Ohne Beat-Datei“, z. B. wenn der Beat nur in FL Studio liegt), **BPM**, **Tonart**, **Genres** und **Sprachen** (Pflicht, jeweils mehrere möglich, z. B. Trap + Drill, Deutsch + Englisch; 18 Sprachen zur Auswahl) und optional das Thema. BPM und Tonart werden aus dem Dateinamen (z. B. „92bpm F#m“) oder per Analyse aus dem Beat erkannt. Die Infos stehen im Text-Bereich oben (antippen zum Ändern), auf der Projektkarte, im PDF, steuern den Teleprompter und fließen in die KI-Ideen ein.

- **Text**
  - Songtext in Abschnitten (Intro, Hook, Part, Bridge, Outro) als einklappbare Karten; ein neuer Song startet mit dem Hinzufügen eines Abschnitts; Reihenfolge ändern, umbenennen, löschen. Eine Zeile wie `[Hook]` im Text startet ebenfalls einen Abschnitt.
  - **Hook / Bridge wiederholen**: Ein leerer Abschnitt mit gleichem Namen wiederholt den Text von oben (im Teleprompter und PDF ausgeschrieben). Schreibst du etwas hinein, gilt nur noch dein eigener Text; leerst du ihn wieder, wird wiederholt.
  - **KI-Ideen** (Claude von Anthropic, eigener API-Schlüssel): erst „Wofür?“ wählen – **Weiterschreiben** (Claude liest den ganzen Song und schreibt an der Cursorstelle weiter, auf Wunsch auf dein Reimende) oder ein neues **Intro, Hook, Part, Bridge oder Outro**, das zum ganzen Song passt und als eigener Abschnitt eingefügt wird. Länge 2–16 Zeilen; es werden bis zu 80 Zeilen des Songs gesendet.
  - **PDF**: Songtext mit BPM und Tonart als PDF (lädt beim ersten Mal den PDF-Baustein jsPDF aus dem Netz).
- **Beat**
  - Beat-Datei oder YouTube-Link, Loop, Tempo. Tipp auf die Wellenform setzt die Startstelle.
  - Aufnahmen aus früheren Versionen bleiben unter „Frühere Aufnahmen“ abspiel- und ladbar; neu aufnehmen kann RAIM nicht mehr.
  - **Lizenz** als schmale Leiste mit allen Angaben und Datei. Beim Hochladen der Lizenzdatei werden Produzent, Lizenzart, BPM, Tonart, Kaufdatum und Bedingungen automatisch ausgelesen: mit API-Schlüssel durch Claude (PDF und Fotos, nach einmaliger Zustimmung), sonst lokal aus PDFs (pdf.js, Mustererkennung). Dazu **Lizenzwarnungen** (fehlende Lizenz, Free/Lease-Grenzen, fehlende Lizenzdatei …; kein Rechtsrat).
- **Prompter**
  - Eigener Bereich für den **Teleprompter**: zeigt den Text groß und lässt ihn gleichmäßig von unten nach oben durchlaufen, ohne Hervorhebung (eine Zeile pro Takt; pausiert lässt er sich von Hand scrollen), z. B. zum Einsingen in FL Studio. Das Tempo kommt aus den BPM des Beats: eintragen, aus der Lizenz übernehmen oder beim Hochladen automatisch erkennen lassen. Dazu „Takte pro Zeile“ (½, 1, 2, 4) und Einzähler (1 oder 2 Takte); ohne BPM startet er nicht. Unter „Was soll laufen?“ wählst du den ganzen Song oder nur einzelne Abschnitte (z. B. nur Intro, nur Hook, Hook + Part 1). Optional mit dem Beat ab der Startstelle; − / + zum Feinjustieren (wird beim nächsten Start zurückgesetzt), Zeile antippen zum Springen.
- **Reime**
  - Reimsuche nach Klang in den Sprachen aus den Song-Infos: nur Deutsch, nur Englisch oder beides – dann auch deutsche Wörter auf englische und umgekehrt, z. B. „Money“ → honey, funny, Manie (für andere Sprachen helfen die KI-Ideen).
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
- `js/ai.js`: KI-Ideen und Lizenz-Auslesen über die Claude API
- `js/license-reader.js`: Lizenz-PDFs ohne KI auslesen
- `js/analyze.js`: BPM- und Tonart-Erkennung
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
- Lizenz-PDFs lesen: [pdf.js](https://github.com/mozilla/pdf.js) (Apache 2.0, per CDN)

Wegen DeReWo (nicht-kommerziell) sollte die deutsche Wortliste für eine kommerzielle Nutzung ersetzt oder die Lizenz geklärt werden.

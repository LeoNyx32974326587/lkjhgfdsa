# Barbook

Web-App für Rap- und Songtexte. Läuft komplett im Browser, ohne Installation und ohne Build.

## Starten

`index.html` (Startseite) oder direkt `app.html` (App) per Doppelklick öffnen.

Nur YouTube-Beats brauchen einen kleinen Webserver, weil YouTube keine lokal geöffneten Dateien abspielt:

```
python3 -m http.server 8000   # dann http://localhost:8000/app.html öffnen
```

## Funktionen

Alles ist in **Projekte** organisiert, ein Projekt pro Song. Jedes Projekt hat vier Bereiche: Text, Beat, Prompter und Reime.

**Neues Projekt:** Vor dem Öffnen fragt Barbook die Grundinfos ab: Name, Beat (oder „Ohne Beat-Datei“, z. B. wenn der Beat nur in FL Studio liegt), **BPM**, **Tonart**, **Genres** und **Sprachen** (Pflicht, jeweils mehrere möglich, z. B. Trap + Drill, Deutsch + Englisch; 18 Sprachen zur Auswahl) und optional das Thema. Die Schreibweise der Tonart ist wählbar: deutsch (Fis-Moll / A-Dur), englisch (F# Minor / A Major) oder kurz (F#m / A); sie gilt überall in der App. BPM und Tonart werden aus dem Dateinamen (z. B. „92bpm F#m“) oder per Analyse aus dem Beat erkannt. Die Infos stehen in jedem Projekt-Bereich oben neben dem Status (antippen zum Ändern), auf der Projektkarte, im PDF, steuern den Teleprompter und fließen in die KI-Ideen ein.

- **Text**
  - Songtext in Abschnitten (Intro, Hook, Part, Bridge, Outro) als einklappbare Karten; ein neuer Song startet mit dem Hinzufügen eines Abschnitts; Reihenfolge ändern, umbenennen, löschen. Eine Zeile wie `[Hook]` im Text startet ebenfalls einen Abschnitt.
  - **Hook / Bridge wiederholen**: Ein leerer Abschnitt mit gleichem Namen wiederholt den Text von oben (im Teleprompter und PDF ausgeschrieben). Schreibst du etwas hinein, gilt nur noch dein eigener Text; leerst du ihn wieder, wird wiederholt.
  - **KI-Ideen** (Claude von Anthropic, eigener API-Schlüssel): erst „Wofür?“ wählen – **Weiterschreiben** (Claude liest den ganzen Song und schreibt an der Cursorstelle weiter, auf Wunsch auf dein Reimende) oder ein neues **Intro, Hook, Part, Bridge oder Outro**, das zum ganzen Song passt und als eigener Abschnitt eingefügt wird. Länge 2–16 Zeilen; es werden bis zu 80 Zeilen des Songs gesendet.
  - **PDF**: Songtext mit BPM und Tonart als PDF (lädt beim ersten Mal den PDF-Baustein jsPDF aus dem Netz).
- **Beat**
  - Beat-Datei oder YouTube-Link, Loop, Tempo. Tipp auf die Wellenform setzt die Startstelle.
  - Aufnahmen aus früheren Versionen bleiben unter „Frühere Aufnahmen“ abspiel- und ladbar; neu aufnehmen kann Barbook nicht mehr.
  - **Lizenz** als schmale Leiste mit allen Angaben und Datei. Beim Hochladen der Lizenzdatei werden Produzent, Lizenzart, BPM, Tonart, Kaufdatum und Bedingungen automatisch ausgelesen: mit API-Schlüssel durch Claude (PDF und Fotos, nach einmaliger Zustimmung), sonst lokal aus PDFs (pdf.js, Mustererkennung). Dazu **Lizenzwarnungen** (fehlende Lizenz, Free/Lease-Grenzen, fehlende Lizenzdatei …; kein Rechtsrat).
- **Prompter**
  - Eigener Bereich für den **Teleprompter**: zeigt den Text groß und lässt ihn gleichmäßig von unten nach oben durchlaufen, ohne Hervorhebung (eine Zeile pro Takt; pausiert lässt er sich von Hand scrollen), z. B. zum Einsingen in FL Studio. Das Tempo kommt aus den BPM des Beats: eintragen, aus der Lizenz übernehmen oder beim Hochladen automatisch erkennen lassen. Dazu „Takte pro Zeile“ (½, 1, 2, 4) und Einzähler (1 oder 2 Takte); ohne BPM startet er nicht. Unter „Was soll laufen?“ wählst du den ganzen Song oder nur einzelne Abschnitte (z. B. nur Intro, nur Hook, Hook + Part 1). Optional mit dem Beat ab der Startstelle; − / + zum Feinjustieren (wird beim nächsten Start zurückgesetzt), Zeile antippen zum Springen.
- **Reime**
  - Reimsuche nach Klang in allen Sprachen aus den Song-Infos (Deutsch, Englisch, Türkisch, Arabisch, Französisch, Spanisch, Italienisch, Portugiesisch, Polnisch, Russisch, Ukrainisch, Albanisch, Kurdisch, Bosnisch/Kroatisch/Serbisch, Griechisch, Rumänisch, Niederländisch, Persisch) – auch über die Sprachen hinweg: jedes Wort reimt auf jede gewählte Sprache, z. B. „Money“ → honey, funny, Manie oder „Leben“ → deben (spanisch). Damit die große deutsche Liste die anderen nicht verdrängt, werden die Sprachen in der Trefferliste gemischt. Die Wörterbücher der weiteren Sprachen laden erst, wenn ein Song sie braucht.
  - Abdeckung: Deutsch und Englisch sind am größten; Kurdisch hat nur gut 2.000 Wörter, Arabisch, Persisch und Griechisch je etwa 5.000–6.500. Für Arabisch und Persisch muss das Wort ohne Vokalzeichen eingegeben werden.
  - **Reimarten** zum Umschalten: alle Reime, reine Reime (ab dem betonten Vokal klingt alles gleich: Nacht – Macht), unreine Reime (ähnlich, nicht gleich: Nacht – genannt), Doppel- und Mehrsilbenreime, **Vokalreime/Assonanz** (gleiche Vokale, andere Konsonanten: Lebensgefahr – Gesellenjahr) und **Alliteration** (gleicher Anfangslaut: Stadt – Stark – Stand). Unreine Treffer sind in der Liste markiert.
  - Häufige Wörter stehen bei gleich guten Reimen weiter oben.
  - **Synonyme**: Bedeutung eingeben, optional „reimt auf“ – dann nach Reim sortiert. Deutsch offline (OpenThesaurus), Englisch online (Datamuse). Synonyme gibt es nur für Deutsch und Englisch.
  - Reimenden aus deinem Text (farbig gruppiert), Gemerkt-Liste, Verlauf, „Passt nicht“.

Jedes Projekt hat einen **Status**: „In Bearbeitung“ oder „Fertig“. Du stellst ihn oben im Projekt um. Die Projektliste ist danach aufgeteilt: oben alles in Bearbeitung, darunter die fertigen Songs (etwas abgedunkelt).

Gelöschte Projekte landen im **Papierkorb** (unten auf der Projektseite) und werden nach 28 Tagen endgültig gelöscht; bis dahin lassen sie sich wiederherstellen.

Unter Einstellungen (Zahnrad) prüft **„Schlüssel testen“**, ob dein API-Schlüssel funktioniert.

Alles bleibt lokal im Browser gespeichert (IndexedDB). Unter Einstellungen kannst du **alles exportieren**, inklusive Beats, Lizenzen und Aufnahmen, und wieder importieren. Mach das regelmäßig: Wenn du die Browserdaten löschst, sind die Projekte weg.

## Dateien

- `index.html`, `styles.css`, `script.js`: Startseite
- `app.html`, `app.css`: App
- `js/rhyme.js`: Reim-Engine (deutsche Aussprache-Näherung, Klang-Codes aller Sprachen und Bewertung)
- `js/words.js`, `js/words-en.js`: Wortlisten Deutsch/Englisch; `js/words-<sprache>.js`: alle weiteren Sprachen (Aussprache als Klang-Code)
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

Die Wortlisten der weiteren Sprachen (`js/words-<sprache>.js`) erzeugt `tools/build_langs.py` aus:

- Aussprache: [WikiPron](https://github.com/CUNY-CL/wikipron) (aus Wiktionary, CC BY-SA); für Türkisch, Albanisch und Rumänisch ergänzt durch Ausspracheregeln aus der Schreibung
- Worthäufigkeiten: [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) (CC BY-SA 4.0), für Bosnisch/Kroatisch/Serbisch aus allen drei Listen

Wegen DeReWo (nicht-kommerziell) sollte die deutsche Wortliste für eine kommerzielle Nutzung ersetzt oder die Lizenz geklärt werden.

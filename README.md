# Barbook

Dein Notizbuch für Rap und Songs: Web-App für Texte, Reime, Beats und Lizenzen. Läuft im Browser, ohne Installation und ohne Build.

## Starten

`index.html` (Startseite) oder direkt `app.html` (App) per Doppelklick öffnen.

## Online stellen und aufs Handy holen

Barbook ist eine installierbare Web-App: online geöffnet lässt sie sich auf dem Handy zum Homescreen hinzufügen (iPhone: Safari → Teilen → „Zum Home-Bildschirm“; Android: Chrome → Menü → „App installieren“) und startet dann wie eine App, auch offline (Texte, Reimsuche, Teleprompter; Synchronisieren, KI und Freunde brauchen Internet).

Kostenlos über **GitHub Pages**: im Repository auf GitHub **Settings → Pages**, bei **Source** „Deploy from a branch“, Branch auswählen (z. B. `claude/nachbau-anfrage-8u6njo`), Ordner `/ (root)` → **Save**. Nach ein, zwei Minuten läuft Barbook unter `https://<name>.github.io/<repository>/` (die Startseite; die App unter `…/app.html`). Danach in Supabase unter **Authentication → URL Configuration** die **Site URL** auf `https://<name>.github.io/<repository>/app.html` setzen und bei **Redirect URLs** `https://<name>.github.io/<repository>/**` eintragen – dann führen Bestätigungs- und „Passwort vergessen“-Mails zurück in die App.

## Accounts

Mit eingerichteten Accounts (Supabase) muss man sich anmelden, bevor die App aufgeht: „App öffnen“ führt dann zuerst auf `login.html` (Anmelden, Registrieren, Passwort vergessen). Projekte, Beats und Lizenzen werden mit dem Account synchronisiert und sind auf jedem Gerät da; offline wird weitergearbeitet und später hochgeladen. Projekte aus der Zeit ohne Account bietet Barbook nach der ersten Anmeldung zur Übernahme an.

**Freunde und Features:** Jeder Account bekommt automatisch eine ID (z. B. `#K7M2QX`), zu sehen im Profil und im Freunde-Bereich (Personen-Knopf oben rechts, mit Zähler für neue Anfragen und Einladungen). Dort sucht man Freunde über ihre ID, schickt Anfragen, nimmt sie an oder lehnt sie ab. In den **Projekteinstellungen** (Zahnrad oben im Projekt) schaltest du **Feature** an und lädst über „+ Freund einladen“ Freunde zu dem Song ein. Der Freund bekommt eine **Einladung** (Hinweis auf seiner Projektseite und im Freunde-Bereich) und muss sie annehmen – erst dann ist der Song in seinen Projekten („von …“). Bei dir steht pro Freund „Eingeladen“ oder „Dabei“. Was er **ändern** darf, legst du pro Freund mit Haken fest: Text, Beat, Lizenz, Song-Infos (Titel, BPM, Tonart, Genre, Sprachen, Thema) und Status – ohne Haken nur ansehen. Die Datenbank setzt das durch. Freunde können einen Song jederzeit verlassen; wer ablehnt oder aussteigt, verschwindet aus deiner Feature-Liste. Feature ausschalten entfernt alle Features des Songs. Gleichzeitiges Schreiben am selben Song wird nicht live zusammengeführt – die zuletzt gespeicherte Fassung gilt; beim Öffnen holt Barbook immer die neueste.

**Profil:** Oben rechts auf der Projektseite sitzt ein Kreis mit deinem Profilbild (ohne Bild: deine Initialen). Ein Klick öffnet das Profil: Bild wählen oder entfernen (wird quadratisch zugeschnitten), Name, Künstlername und Abmelden. Name und Künstlername werden im Account gespeichert, das Bild im Cloud-Speicher – auf jedem Gerät gleich.

Einrichten: Schritt für Schritt in [`SUPABASE.md`](SUPABASE.md) (Supabase-Projekt anlegen, `supabase/setup.sql` ausführen, zwei Werte in `js/config.js` eintragen). Solange `js/config.js` leer ist, läuft Barbook ohne Account nur im Browser.

Nur YouTube-Beats brauchen einen kleinen Webserver, weil YouTube keine lokal geöffneten Dateien abspielt:

```
python3 -m http.server 8000   # dann http://localhost:8000/app.html öffnen
```

## Funktionen

Alles ist in **Projekte** organisiert, ein Projekt pro Song. Jedes Projekt hat vier Bereiche: Text, Beat, Prompter und Reime.

**Neues Projekt:** Vor dem Öffnen fragt Barbook die Grundinfos ab: Name, Beat (oder „Ohne Beat-Datei“, z. B. wenn der Beat nur in FL Studio liegt), **BPM**, **Tonart**, **Genres** und **Sprachen** (Pflicht, jeweils mehrere möglich, z. B. Trap + Drill, Deutsch + Englisch; 18 Sprachen zur Auswahl) und optional das Thema. Die Schreibweise der Tonart ist wählbar: deutsch (Fis-Moll / A-Dur), englisch (F# Minor / A Major) oder kurz (F#m / A); sie gilt überall in der App. BPM und Tonart werden aus dem Dateinamen (z. B. „92bpm F#m“) oder per Analyse aus dem Beat erkannt. Die Infos änderst du über das Zahnrad oben im Projekt (Projekteinstellungen); sie stehen auf der Projektkarte, im PDF, steuern den Teleprompter und fließen in die KI-Ideen ein.

- **Text**
  - Songtext in Abschnitten (Intro, Hook, Part, Bridge, Outro) als einklappbare Karten – beim Öffnen des Text-Bereichs sind alle eingeklappt, ein Tipp auf einen Abschnitt öffnet ihn, ein neuer Abschnitt kommt geöffnet ans Ende; ein neuer Song startet mit dem Hinzufügen eines Abschnitts; Reihenfolge ändern, umbenennen, löschen. Eine Zeile wie `[Hook]` im Text startet ebenfalls einen Abschnitt.
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

Jedes Projekt hat einen **Status**: „In Bearbeitung“ oder „Fertig“. Er steht oben in der Leiste des Projekts; antippen schaltet um. Daneben öffnet das Zahnrad die Projekteinstellungen (Song-Infos und Features). Die Projektliste ist danach aufgeteilt: oben alles in Bearbeitung, darunter die fertigen Songs (etwas abgedunkelt).

Gelöschte Projekte landen im **Papierkorb** (unten auf der Projektseite) und werden nach 28 Tagen endgültig gelöscht; bis dahin lassen sie sich wiederherstellen.

Unter Einstellungen (Zahnrad) prüft **„Schlüssel testen“**, ob dein API-Schlüssel funktioniert.

Mit Account liegen die Projekte in der Cloud und als Kopie im Browser (IndexedDB); ohne Account nur im Browser. Unter Einstellungen kannst du zusätzlich **alles exportieren**, inklusive Beats, Lizenzen und Aufnahmen, und wieder importieren.

## Dateien

- `index.html`, `styles.css`, `script.js`: Startseite
- `login.html`, `js/login.js`: Anmelden und Registrieren
- `app.html`, `app.css`: App
- `js/config.js`: Supabase-Zugang (leer = ohne Accounts); `js/cloud.js`: Accounts und Cloud-Speicher; `supabase/setup.sql`: Tabellen und Regeln
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
- `js/db.js`: Projekte und Dateien (IndexedDB, mit Account synchronisiert)
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
- Accounts: [supabase-js](https://github.com/supabase/supabase-js) (MIT, per CDN)

Die Wortlisten der weiteren Sprachen (`js/words-<sprache>.js`) erzeugt `tools/build_langs.py` aus:

- Aussprache: [WikiPron](https://github.com/CUNY-CL/wikipron) (aus Wiktionary, CC BY-SA); für Türkisch, Albanisch und Rumänisch ergänzt durch Ausspracheregeln aus der Schreibung
- Worthäufigkeiten: [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) (CC BY-SA 4.0), für Bosnisch/Kroatisch/Serbisch aus allen drei Listen

Wegen DeReWo (nicht-kommerziell) sollte die deutsche Wortliste für eine kommerzielle Nutzung ersetzt oder die Lizenz geklärt werden.

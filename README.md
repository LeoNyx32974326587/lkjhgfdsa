# RAIM – Reime, die klingen

Web-App für Rap- und Songtexte. Läuft komplett im Browser, ohne Installation und ohne Build.

## Starten

`index.html` (Startseite) oder direkt `app.html` (App) per Doppelklick öffnen.

Nur YouTube-Beats brauchen einen kleinen Webserver, weil YouTube keine lokal geöffneten Dateien abspielt:

```
python3 -m http.server 8000   # dann http://localhost:8000/app.html öffnen
```

## Funktionen

- **Schreiben**: Songs anlegen, Text schreiben. Unter dem Text erscheinen Reime auf dein letztes Wort. Antippen fügt sie ein.
- **KI-Ideen**: 2 oder 4 neue Zeilen passend zum Song, auf Wunsch auf dein Reimende. Nutzt Claude von Anthropic mit deinem eigenen API-Schlüssel (unter „Mehr“ eintragen). Erst nach Zustimmung (ab 18) werden bis zu 24 Zeilen gesendet.
- **Reimsuche**: Reime nach Klang statt nach Buchstaben, Doppel- und Mehrsilbenreime zuerst, dazu Endungsreime (z. B. „–dienst“). „Passt nicht“ oder nach links wischen blendet einen Reim aus.
- **Beats**: Eigene Audiodatei abspielen, Loop-Bereich auf der Wellenform ziehen, Tempo ändern (ohne Tonhöhe zu verändern), dich zum Beat aufnehmen und den Take herunterladen. YouTube-Beats mit A/B-Loop und Tempo.

Songs, Einstellungen und die „Passt nicht“-Liste werden nur lokal im Browser gespeichert. Unter „Mehr“ kannst du Songs exportieren und importieren.

## Dateien

- `index.html`, `styles.css`, `script.js`: Startseite
- `app.html`, `app.css`: App
- `js/rhyme.js`: Reim-Engine (deutsche Aussprache-Näherung und Bewertung)
- `js/words.js`: Wortliste (239.279 Wörter)
- `js/ai.js`: KI-Ideen über die Claude API
- `js/beats.js`: Player, Loop, Tempo, Aufnahme, YouTube
- `js/store.js`, `js/app.js`: Speicherung und Oberfläche

## Wortliste

Aus [davidak/wortliste](https://github.com/davidak/wortliste), erzeugt aus DWDS (CC BY-ND), Leipzig Corpora Collection (CC BY) und DeReWo (CC BY-NC). Für eine kommerzielle Nutzung sollte die Wortliste ersetzt oder die Lizenz geklärt werden.

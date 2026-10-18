import os
OUT = '/home/user/lkjhgfdsa/'
PAGES = [('impressum.html', 'Impressum'), ('datenschutz.html', 'Datenschutz'),
         ('nutzungsbedingungen.html', 'Nutzungsbedingungen'), ('support.html', 'Support'), ('kuendigen.html', 'Verträge hier kündigen')]

def page(file, title, body, scripts=''):
    nav = '\n'.join('      <a href="%s"%s>%s</a>' % (f, ' aria-current="page"' if f == file else '', t) for f, t in PAGES)
    return '''<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>%(title)s – Barbook</title>
  <meta name="theme-color" content="#07060f">
  <link rel="icon" href="assets/icon.svg" type="image/svg+xml">
  <script src="js/theme.js"></script>
  <link rel="stylesheet" href="assets/fonts/fonts.css">
  <link rel="stylesheet" href="app.css">
</head>
<body class="legal-page">
  <header class="topbar">
    <a class="brand" href="index.html"><img src="assets/icon.svg" alt="" width="30" height="30"><span>Barbook</span></a>
    <a class="legal-back" href="app.html">Zur App</a>
  </header>
  <main class="legal">
    <nav class="legal-nav" aria-label="Rechtliches">
%(nav)s
    </nav>
    <article>
      <h1>%(title)s</h1>
%(body)s
    </article>
  </main>
  <footer class="legal-foot">
    <span>© 2026 <span data-legal="name"></span></span>
    <nav>
%(nav)s
    </nav>
  </footer>
  <script src="js/legal.js"></script>
%(scripts)s</body>
</html>
''' % {'title': title, 'nav': nav, 'body': body, 'scripts': scripts}

ADDR = '''<p class="legal-address">
        <span data-legal="name"></span><br>
        <span data-legal="street"></span><br>
        <span data-legal="city"></span><br>
        <span data-legal="country"></span>
      </p>'''

impressum = '''      <p class="legal-lead">Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG)</p>
      %(addr)s
      <h2>Kontakt</h2>
      <p>E-Mail: <span data-legal="email"></span><span data-optional-row><br>Telefon: <span data-legal="phone" data-optional></span></span></p>
      <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
      <p><span data-legal="name"></span>, Anschrift wie oben.</p>
      <h2>Verbraucherstreitbeilegung</h2>
      <p>Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
      <h2>Haftung für Inhalte</h2>
      <p>Die Inhalte dieser Seiten wurden mit Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität können wir jedoch keine Gewähr übernehmen. Für Songtexte, Beats, Lizenzen und andere Inhalte, die Nutzerinnen und Nutzer in Barbook speichern oder über einen Leselink teilen, sind diese selbst verantwortlich. Werden uns Rechtsverletzungen bekannt, entfernen wir die betroffenen Inhalte umgehend.</p>
      <h2>Haftung für Links</h2>
      <p>Barbook enthält Links zu Seiten Dritter (z. B. YouTube, Anthropic). Auf deren Inhalte haben wir keinen Einfluss; verantwortlich ist der jeweilige Anbieter. Bei Bekanntwerden von Rechtsverletzungen entfernen wir solche Links umgehend.</p>
      <h2>Urheberrecht</h2>
      <p>Das Design, die Texte und der Programmcode von Barbook sind urheberrechtlich geschützt. Die Rechte an deinen eigenen Songs, Texten und Dateien bleiben bei dir.</p>
      <p class="legal-updated">Stand: <span data-legal="updated"></span></p>''' % {'addr': ADDR}

datenschutz = '''      <p class="legal-lead">Kurz gesagt: Barbook zeigt keine Werbung, setzt keine Tracking- oder Analyse-Tools ein und verkauft keine Daten. Wir verarbeiten nur, was nötig ist, damit deine Songs gespeichert, synchronisiert und – wenn du es willst – geteilt werden können.</p>

      <h2>1. Verantwortlicher</h2>
      %(addr)s
      <p>E-Mail: <span data-legal="email"></span></p>

      <h2>2. Aufruf der Website (Hosting)</h2>
      <p>Barbook wird über <strong>GitHub Pages</strong> ausgeliefert (GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA). Beim Aufruf verarbeitet GitHub technisch notwendige Daten wie deine IP-Adresse, Datum und Uhrzeit, die aufgerufene Seite und Browser-Informationen in Server-Logfiles, um die Seite auszuliefern und vor Angriffen zu schützen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einem sicheren, funktionierenden Angebot). Eine Übermittlung in die USA erfolgt auf Grundlage des EU-US Data Privacy Framework, unter dem GitHub zertifiziert ist.</p>
      <p>Schriftarten (Roboto, Michroma) werden von unserem eigenen Server geladen, nicht von Google.</p>

      <h2>3. Account und Cloud-Speicher</h2>
      <p>Für Accounts und das Speichern in der Cloud nutzen wir <strong>Supabase</strong> (Supabase, Inc., USA). Die Daten liegen in einem Rechenzentrum in der Region <span data-legal="region"></span>. Mit Supabase besteht ein Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO; soweit Supabase von außerhalb der EU auf Daten zugreifen kann, erfolgt das auf Grundlage der EU-Standardvertragsklauseln.</p>
      <p>Gespeichert werden:</p>
      <ul>
        <li><strong>Account:</strong> E-Mail-Adresse und Passwort (nur verschlüsselt als Hash), Zeitpunkte von Registrierung und Anmeldung.</li>
        <li><strong>Profil:</strong> Name, Künstlername, Profilbild und deine Barbook-ID.</li>
        <li><strong>Inhalte:</strong> Projekte und Ideen mit Songtexten, Song-Infos, Status, Release-Checkliste, Beat-Markern; Dateien, die du hochlädst (Beats, Lizenzdateien, Aufnahmen, fertige Songs); Bars; Versionsverlauf (bis zu 100 Stände pro Song); Kommentare.</li>
        <li><strong>Freunde und Features:</strong> Freundschaftsanfragen, Freundschaften, Einladungen zu Songs und die vergebenen Rechte, Nachrichten im Freunde-Bereich (z. B. „hat deine Anfrage angenommen“).</li>
        <li><strong>Chat:</strong> Nachrichten zwischen Freunden mit Zeitpunkt und Lesestatus, mitgeschickte Songs und Bars (als Kopie). Lesen können sie nur die beiden Beteiligten.</li>
        <li><strong>Alben:</strong> welche Songs zu welchem Album gehören.</li>
        <li><strong>Benachrichtigungen:</strong> wenn du sie einschaltest, die Push-Adresse deines Geräts.</li>
        <li><strong>Leselinks:</strong> welcher Song über welchen Link lesbar ist.</li>
      </ul>
      <p>Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Erfüllung des Nutzungsvertrags). Deine Inhalte sind nur für dich sichtbar – außer für Freunde, die du zu einem Song einlädst (sie sehen diesen Song und können ihn im Rahmen der vergebenen Rechte bearbeiten), und für alle, denen du einen Leselink gibst (sie sehen Titel, Text, BPM, Tonart, Genre und deinen Künstlernamen). Freunde sehen außerdem deinen Namen, Künstlernamen und dein Profilbild.</p>

      <h2>4. Live-Funktionen und Push-Benachrichtigungen</h2>
      <p>Damit Chat, Nachrichten und gemeinsames Schreiben sofort ankommen, hält die App eine Verbindung zu Supabase Realtime. Beim gemeinsamen Schreiben sehen die Beteiligten eines Songs, wer gerade im Song ist und in welchem Abschnitt er schreibt; diese Angaben werden nicht gespeichert.</p>
      <p>Schaltest du im Profil <strong>Benachrichtigungen</strong> ein, speichern wir die Push-Adresse deines Geräts. Benachrichtigungen (Absender, kurzer Text) laufen über den Push-Dienst deines Browser- bzw. Geräteherstellers (z. B. Google bei Chrome und Android, Apple bei Safari und iPhone, Mozilla bei Firefox); der Inhalt ist dabei verschlüsselt. Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Ausschalten geht jederzeit im Profil oder in den Einstellungen des Geräts.</p>

      <h2>4a. Bezahlung von Barbook Pro (Stripe)</h2>
      <p>Wenn du Barbook Pro kaufst, wickelt <strong>Stripe</strong> (Stripe Payments Europe, Limited, 1 Grand Canal Street Lower, Dublin 2, Irland) die Zahlung ab. Deine Zahlungsdaten (z. B. Kartennummer) gibst du direkt bei Stripe ein; wir sehen und speichern sie nicht. Wir erhalten von Stripe und speichern: eine Kunden- und Abo-Kennung, den Abo-Status, die gewählte Laufzeit und das Ende der bezahlten Zeit. Stripe verarbeitet außerdem deine E-Mail-Adresse, Zahlungs- und Rechnungsdaten sowie Daten zur Betrugsvermeidung, teils als eigener Verantwortlicher; Stripe kann Daten in die USA übermitteln (EU-US Data Privacy Framework, EU-Standardvertragsklauseln). Rechtsgrundlage ist die Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO); Rechnungs- und Buchungsdaten bewahren wir so lange auf, wie es das Steuer- und Handelsrecht verlangt (bis zu zehn Jahre). Kündigungen und Widerrufe, die du über „Verträge hier kündigen“ schickst, speichern wir zur Bearbeitung und als Nachweis.</p>

      <h2>4b. E-Mails</h2>
      <p>Bestätigungs- und „Passwort vergessen“-Mails werden über den Mail-Server von Google (Gmail) verschickt (Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland). Verarbeitet werden deine E-Mail-Adresse und der Inhalt der Mail. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO. Eine Übermittlung an Google LLC in den USA ist möglich; sie erfolgt auf Grundlage des EU-US Data Privacy Framework.</p>

      <h2>5. Speicher auf deinem Gerät</h2>
      <p>Damit Barbook schnell und auch offline funktioniert, speichert die App Daten in deinem Browser (IndexedDB, localStorage, Offline-Cache des Service Workers): deine Projekte, Dateien und Bars, deine Anmeldung, Einstellungen wie Tonart-Schreibweise oder zuletzt geöffneter Reiter sowie die App-Dateien selbst. Das ist für den von dir gewünschten Dienst unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Es werden keine Cookies zu Werbe- oder Analysezwecken gesetzt. Du kannst diese Daten jederzeit über die Browser-Einstellungen löschen; ohne Account gehen deine Projekte dabei verloren.</p>

      <h2>6. Bibliotheken von Content-Delivery-Netzwerken</h2>
      <p>Einige Programmbibliotheken lädt Barbook von öffentlichen Servern, dabei wird deine IP-Adresse an den jeweiligen Anbieter übertragen:</p>
      <ul>
        <li><strong>jsDelivr</strong> (cdn.jsdelivr.net): die Supabase-Bibliothek für Accounts.</li>
        <li><strong>cdnjs</strong> (Cloudflare, Inc., USA): die PDF-Bibliothek – nur, wenn du ein PDF exportierst.</li>
      </ul>
      <p>Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einer zuverlässigen Auslieferung). Nach dem ersten Laden kommen die Bibliotheken aus dem Speicher deines Geräts.</p>

      <h2>7. Funktionen, die du selbst einschaltest</h2>
      <ul>
        <li><strong>YouTube-Beats:</strong> Fügst du einen YouTube-Link ein, wird der YouTube-Player von Google geladen (Google Ireland Limited). Dabei gehen u. a. deine IP-Adresse und Nutzungsdaten an Google; Google kann Cookies setzen. Das passiert erst, wenn du einen Link einfügst (Art. 6 Abs. 1 lit. a DSGVO, Einwilligung durch deine Aktion).</li>
        <li><strong>KI-Ideen und Lizenz-Erkennung:</strong> Nur wenn du sie nutzt und nach deiner ausdrücklichen Bestätigung schickt Barbook bis zu 80 Zeilen des Songs, Song-Infos und deine Anweisung bzw. die Lizenzdatei über unseren Server bei Supabase (Edge Function) an Claude von Anthropic (Anthropic PBC, San Francisco, USA). Dabei wird pro Account und Tag gezählt, wie viele Anfragen gestellt wurden (für das Tages- und Monatslimit; die Zähler werden nach zwei Monaten gelöscht). Inhalte speichern wir dabei nicht. Anthropic verarbeitet die Daten als unser Dienstleister nach seinen kommerziellen Bedingungen und nutzt sie nicht zum Training seiner Modelle; die Übermittlung in die USA erfolgt auf Grundlage der EU-Standardvertragsklauseln. Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO).</li>
        <li><strong>Englische Synonyme:</strong> Bei der Synonymsuche für englische Wörter wird das gesuchte Wort an Datamuse (datamuse.com, USA) geschickt. Reime und deutsche Synonyme werden komplett auf deinem Gerät gesucht.</li>
        <li><strong>Spracheingabe (Mikrofon):</strong> Wenn du das Mikrofon antippst, nimmt die Spracherkennung deines Browsers deine Stimme auf und wandelt sie in Text um. Je nach Browser geschieht das auf Servern des Browser-Herstellers (z. B. Google bei Chrome, Apple bei Safari). Barbook selbst speichert keine Sprachaufnahmen.</li>
        <li><strong>Leselink:</strong> Schaltest du einen Leselink an, kann jede Person mit dem Link den Text des Songs lesen, bis du den Link wieder ausschaltest.</li>
      </ul>

      <h2>8. Speicherdauer</h2>
      <p>Deine Daten speichern wir, solange dein Account besteht. Gelöschte Projekte liegen 28 Tage im Papierkorb und werden dann endgültig gelöscht. Vom Versionsverlauf bleiben die neuesten 100 Stände pro Song. Löschst du deinen Account, werden alle zugehörigen Daten gelöscht. Server-Logfiles von GitHub werden nach deren Vorgaben gelöscht.</p>

      <h2>9. Deine Rechte</h2>
      <p>Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21). Eine Einwilligung kannst du jederzeit für die Zukunft widerrufen. Schreib uns dazu an <span data-legal="email"></span>. Deine Songs kannst du jederzeit selbst als PDF oder Text exportieren.</p>
      <p>Du kannst dich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel bei der Behörde deines Wohnorts.</p>

      <h2>10. Account löschen</h2>
      <p>Du kannst deinen Account jederzeit selbst löschen: in der App oben rechts auf dein Profilbild → „Account löschen“ und mit deinem Passwort bestätigen. Dabei werden sofort alle Projekte, Ideen, Dateien, Bars, Freundschaften, Leselinks und dein Profil gelöscht – in der Cloud und auf dem Gerät. Klappt das nicht, schreib eine E-Mail von der Adresse deines Accounts an <span data-legal="email"></span>.</p>

      <p class="legal-updated">Stand: <span data-legal="updated"></span></p>''' % {'addr': ADDR}

nutzung = '''      <p class="legal-lead">Diese Bedingungen gelten für die Nutzung von Barbook unter dieser Adresse. Mit dem Anlegen eines Accounts erklärst du dich mit ihnen einverstanden.</p>

      <h2>1. Anbieter</h2>
      <p>Barbook wird angeboten von <span data-legal="name"></span> (Kontakt siehe <a href="impressum.html">Impressum</a>).</p>

      <h2>2. Was Barbook ist</h2>
      <p>Barbook ist ein kostenloses Notizbuch für Songtexte mit Reimsuche, Beat-Player, Teleprompter, Lizenz-Übersicht und gemeinsamem Schreiben mit Freunden. Wir bemühen uns um einen zuverlässigen Betrieb, können aber keine ständige Verfügbarkeit zusagen und Funktionen ändern, erweitern oder einstellen. Ein Anspruch auf bestimmte Funktionen besteht nicht.</p>

      <h2>3. Account</h2>
      <ul>
        <li>Du musst mindestens 16 Jahre alt sein oder die Zustimmung deiner Eltern haben.</li>
        <li>Gib eine E-Mail-Adresse an, die dir gehört, und halte dein Passwort geheim. Für Aktivitäten in deinem Account bist du verantwortlich.</li>
        <li>Pro Person ist ein Account vorgesehen. Accounts sind nicht übertragbar.</li>
      </ul>

      <h2>4. Deine Inhalte</h2>
      <ul>
        <li>Alle Rechte an deinen Texten, Ideen, Aufnahmen und Dateien bleiben bei dir. Du räumst uns nur die Rechte ein, die nötig sind, um sie zu speichern, zwischen deinen Geräten abzugleichen und – wenn du es willst – mit Freunden oder über einen Leselink zu teilen.</li>
        <li>Du lädst nur Inhalte hoch, an denen du die nötigen Rechte hast. Für Beats bist du selbst dafür verantwortlich, eine passende Lizenz zu haben. Die Lizenz-Hinweise in Barbook sind eine Hilfe, aber keine Rechtsberatung – maßgeblich ist dein Lizenzvertrag.</li>
        <li>Verboten sind Inhalte, die gegen Gesetze oder Rechte Dritter verstoßen, insbesondere urheberrechtsverletzende, beleidigende, volksverhetzende oder jugendgefährdende Inhalte, sowie Versuche, Barbook oder andere Nutzer anzugreifen oder auszuspähen.</li>
        <li>Bei Verstößen dürfen wir Inhalte entfernen und den Account sperren.</li>
      </ul>

      <h2>5. Gemeinsam schreiben und teilen</h2>
      <p>Lädst du Freunde zu einem Song oder einer Idee ein, sehen sie diesen Song und dürfen ihn im Rahmen der von dir vergebenen Rechte bearbeiten. Wer an einem Song mitschreibt, regelt Credits und Rechte am Song mit den anderen Beteiligten selbst. Ein Leselink macht den Text für jede Person mit dem Link lesbar, bis du ihn ausschaltest.</p>

      <h2>6. KI-Ideen</h2>
      <p>Angemeldete Nutzer bekommen jeden Monat eine Anzahl KI-Ideen kostenlos (derzeit 5); mit Barbook Pro unbegrenzt, mit einem Tageslimit zum Schutz vor Missbrauch. Vorschläge der KI sind ohne Gewähr; prüfe sie, bevor du sie verwendest. Die Rechte an übernommenen Zeilen liegen wie bei deinen anderen Texten bei dir.</p>

      <h2 id="pro">6a. Barbook Pro (kostenpflichtig)</h2>
      <ul>
        <li><strong>Leistung:</strong> unbegrenzt KI-Ideen (mit Tageslimit zum Schutz vor Missbrauch) und das Auslesen von Lizenzen mit Claude. Alle übrigen Funktionen bleiben kostenlos.</li>
        <li><strong>Preise:</strong> 4,99 € im Monat oder 39,99 € im Jahr, jeweils inklusive gesetzlicher Umsatzsteuer, im Voraus zu zahlen. Maßgeblich ist der auf der Bezahlseite angezeigte Preis.</li>
        <li><strong>Vertragsschluss:</strong> Mit dem Klick auf „Weiter zur Bezahlung“ und dem Abschluss der Zahlung auf der Bezahlseite unseres Zahlungsdienstleisters Stripe kommt der Vertrag zustande.</li>
        <li><strong>Laufzeit und Kündigung:</strong> Das Abo verlängert sich automatisch um die gewählte Laufzeit, wenn du nicht vorher kündigst. Du kannst jederzeit zum Ende der laufenden Laufzeit kündigen – über <a href="kuendigen.html">„Verträge hier kündigen“</a>, im Profil unter „Abo verwalten“ oder formlos per E-Mail.</li>
        <li><strong>Zahlung:</strong> über Stripe (Karte, Apple Pay, Google Pay, PayPal und weitere angebotene Verfahren). Schlägt eine Zahlung fehl, kann Pro nach kurzer Zeit enden.</li>
        <li><strong>Preisänderungen</strong> teilen wir dir mindestens sechs Wochen vorher mit; du kannst bis dahin kündigen.</li>
      </ul>

      <h2 id="widerruf">6b. Widerrufsbelehrung</h2>
      <p><strong>Widerrufsrecht:</strong> Du hast das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses. Um dein Widerrufsrecht auszuüben, musst du uns (<span data-legal="name"></span>, <span data-legal="street"></span>, <span data-legal="city"></span>, E-Mail: <span data-legal="email"></span>) mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder eine E-Mail) über deinen Entschluss, diesen Vertrag zu widerrufen, informieren. Du kannst dafür das untenstehende Muster-Widerrufsformular oder die Widerrufsfunktion auf <a href="kuendigen.html">„Verträge hier kündigen“</a> verwenden, was jedoch nicht vorgeschrieben ist. Zur Wahrung der Widerrufsfrist reicht es aus, dass du die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absendest.</p>
      <p><strong>Folgen des Widerrufs:</strong> Wenn du diesen Vertrag widerrufst, haben wir dir alle Zahlungen, die wir von dir erhalten haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über deinen Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das du bei der ursprünglichen Transaktion eingesetzt hast, es sei denn, mit dir wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden dir wegen dieser Rückzahlung Entgelte berechnet. Hast du verlangt, dass die Dienstleistungen während der Widerrufsfrist beginnen sollen, so hast du uns einen angemessenen Betrag zu zahlen, der dem Anteil der bis zu dem Zeitpunkt, zu dem du uns von der Ausübung des Widerrufsrechts hinsichtlich dieses Vertrags unterrichtest, bereits erbrachten Dienstleistungen im Vergleich zum Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen entspricht.</p>
      <p><strong>Muster-Widerrufsformular</strong> (Wenn du den Vertrag widerrufen willst, dann fülle bitte dieses Formular aus und sende es zurück.)</p>
      <p class="legal-form">An <span data-legal="name"></span>, <span data-legal="street"></span>, <span data-legal="city"></span>, E-Mail: <span data-legal="email"></span>:<br>
      Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über die Erbringung der folgenden Dienstleistung: Barbook Pro<br>
      Bestellt am (*)/erhalten am (*):<br>
      Name des/der Verbraucher(s):<br>
      Anschrift des/der Verbraucher(s):<br>
      Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier):<br>
      Datum:<br>
      (*) Unzutreffendes streichen.</p>

      <h2>7. Sicherung deiner Daten</h2>
      <p>Wir speichern deine Daten sorgfältig, können einen Verlust aber nicht völlig ausschließen. Exportiere wichtige Songs regelmäßig im Text-Bereich über „Export“ als PDF oder Text.</p>

      <h2>8. Haftung</h2>
      <p>Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei Verletzung von Leben, Körper oder Gesundheit sowie nach dem Produkthaftungsgesetz. Bei leichter Fahrlässigkeit haften wir nur für die Verletzung wesentlicher Pflichten und begrenzt auf den typischerweise vorhersehbaren Schaden. Im Übrigen ist die Haftung ausgeschlossen, insbesondere für Datenverlust, soweit er durch regelmäßige Sicherung vermeidbar gewesen wäre.</p>

      <h2>9. Kündigung</h2>
      <p>Du kannst Barbook jederzeit nicht mehr nutzen und die Löschung deines Accounts verlangen (siehe <a href="datenschutz.html#account-loeschen">Datenschutz</a>). Wir können die Nutzung mit angemessener Frist beenden, bei schweren Verstößen auch sofort.</p>

      <h2>10. Änderungen</h2>
      <p>Wir können diese Bedingungen ändern, wenn es dafür einen sachlichen Grund gibt (z. B. neue Funktionen oder geänderte Rechtslage). Über wesentliche Änderungen informieren wir dich vorher in der App oder per E-Mail.</p>

      <h2>11. Schlussbestimmungen</h2>
      <p>Es gilt deutsches Recht. Gegenüber Verbrauchern gilt diese Rechtswahl nur, soweit dadurch nicht zwingende Schutzvorschriften des Staates entzogen werden, in dem du deinen gewöhnlichen Aufenthalt hast. Sollte eine Bestimmung unwirksam sein, bleibt der Rest wirksam.</p>

      <p class="legal-updated">Stand: <span data-legal="updated"></span></p>'''
nutzung = nutzung

def faq(q, a):
    return '''      <details class="faq">
        <summary>%s</summary>
        %s
      </details>''' % (q, a)

support = '''      <p class="legal-lead">Hier findest du Antworten auf die häufigsten Fragen. Wenn etwas nicht klappt, schreib uns – am besten mit einem Screenshot und dem Browser bzw. Handy, das du nutzt.</p>
      <div class="support-contact">
        <strong>Kontakt</strong>
        <span data-legal="email"></span>
      </div>

      <h2>Account</h2>
''' + '\n'.join([
    faq('Die Bestätigungs-Mail kommt nicht an.', '<p>Schau im Spam-Ordner nach und warte ein paar Minuten. Kommt nichts, registriere dich nicht neu, sondern schreib uns – wir prüfen den Mail-Versand.</p>'),
    faq('Ich habe mein Passwort vergessen.', '<p>Tippe auf der Anmeldeseite auf „Passwort vergessen?“. Du bekommst eine Mail mit einem Link, über den du ein neues Passwort setzt.</p>'),
    faq('Wie lösche ich meinen Account?', '<p>In der App oben rechts auf dein Profilbild → „Account löschen“ und mit deinem Passwort bestätigen. Das löscht alles endgültig – exportiere vorher die Songs, die du behalten willst (im Text-Bereich über „Export“). Mehr dazu in der <a href="datenschutz.html">Datenschutzerklärung</a>.</p>'),
]) + '''

      <h2>Songs und Daten</h2>
''' + '\n'.join([
    faq('Sind meine Songs auf allen Geräten da?', '<p>Ja, wenn du angemeldet bist. Jede Änderung wird zuerst auf dem Gerät gespeichert und dann hochgeladen. Offline geht alles weiter; hochgeladen wird, sobald du wieder online bist. Beats und Dateien lädt ein neues Gerät beim ersten Öffnen herunter.</p>'),
    faq('Wie sichere ich meine Songs?', '<p>Mit Account liegen deine Songs in der Cloud und auf deinem Gerät. Zusätzlich kannst du jeden Song im Text-Bereich über „Export“ als PDF oder als Text sichern.</p>'),
    faq('Ich habe aus Versehen Text gelöscht.', '<p>Im Text-Bereich unter „Verlauf“ findest du ältere Stände deines Songs und kannst sie wiederherstellen. Gelöschte Projekte liegen 28 Tage im Papierkorb unten auf der Startseite.</p>'),
    faq('Was ist der Unterschied zwischen Projekten und Ideen?', '<p>Ein Projekt ist ein richtiger Song mit BPM, Tonart und Genre. Eine Idee legst du ohne diese Angaben sofort an. Wird ein Song daraus, machst du sie über die gelbe Leiste zum Projekt. Unter „Ideen“ liegen außerdem deine Bars.</p>'),
]) + '''

      <h2>Freunde und Teilen</h2>
''' + '\n'.join([
    faq('Wie füge ich Freunde hinzu?', '<p>Auf der Startseite oben auf das Personen-Symbol. Dort steht deine ID (z. B. #K7M2QX). Gib die ID deines Freundes ein und schick eine Anfrage – sie oder er muss sie annehmen.</p>'),
    faq('Wie schreibe ich mit einem Freund an einem Song?', '<p>Im Song oben auf das Zahnrad → „Feature“ anschalten → „+ Freund einladen“. Lege fest, was der Freund ändern darf, und speichere. Nach dem Annehmen der Einladung erscheint der Song bei ihm.</p>'),
    faq('Wie zeige ich jemandem ohne Account meinen Text?', '<p>Im Song aufs Zahnrad → „Leselink“ anschalten. Der Link wird kopiert und zeigt immer den aktuellen Text. Ausschalten macht ihn ungültig.</p>'),
]) + '''

      <h2>Technik</h2>
''' + '\n'.join([
    faq('Wie installiere ich Barbook als App?', '<p><strong>iPhone:</strong> In Safari auf „Teilen“ → „Zum Home-Bildschirm“. <strong>Android:</strong> In Chrome im Menü (⋮) auf „App installieren“ bzw. „Zum Startbildschirm hinzufügen“. <strong>PC:</strong> In Chrome oder Edge rechts in der Adressleiste auf das Installieren-Symbol.</p>'),
    faq('Das Mikrofon funktioniert nicht.', '<p>Die Spracheingabe geht in Chrome, Edge und Safari, nicht in Firefox, und braucht Internet. Erlaube der Seite den Zugriff aufs Mikrofon (Schloss-Symbol neben der Adresse). Auf dem iPhone muss unter Einstellungen → Allgemein → Tastatur „Diktierfunktion“ an sein.</p>'),
    faq('Nach einem Update sieht etwas komisch aus oder Projekte fehlen.', '<p>Lade die Seite einmal neu (am PC: Strg + Umschalt + R). Als installierte App: ganz schließen und neu öffnen. Deine Daten sind dabei sicher.</p>'),
    faq('Was ist Barbook Pro und wie kündige ich?', '<p>Jeden Monat sind 5 KI-Ideen kostenlos. Barbook Pro (4,99 € im Monat oder 39,99 € im Jahr) bringt unbegrenzt KI-Ideen und das Auslesen von Lizenzen mit Claude. Upgrade und „Abo verwalten“ findest du im Profil. Kündigen geht jederzeit zum Ende der Laufzeit über <a href="kuendigen.html">Verträge hier kündigen</a>.</p>'),
    faq('Die KI-Ideen gehen nicht.', '<p>KI-Ideen gehen nur, wenn du angemeldet und online bist. Pro Account gibt es ein Tageslimit; ist es erreicht, geht es am nächsten Tag weiter.</p>'),
])

kuendigen = '''      <p class="legal-lead">Hier kündigst du dein Barbook-Pro-Abo oder widerrufst es innerhalb von 14 Tagen nach Abschluss.</p>
      <div id="cancelSignedIn" hidden>
        <div class="card cancel-card">
          <p id="cancelPlan"></p>
          <div class="cancel-kind">
            <label class="check"><input type="radio" name="cancelKind" value="cancel" checked> <span><strong>Kündigen</strong> – Pro läuft bis zum Ende der bezahlten Zeit weiter und verlängert sich nicht mehr.</span></label>
            <label class="check"><input type="radio" name="cancelKind" value="withdraw"> <span><strong>Widerrufen</strong> (innerhalb von 14 Tagen nach Abschluss) – Pro endet sofort, du bekommst dein Geld anteilig zurück.</span></label>
          </div>
          <button class="btn btn--danger" type="button" id="cancelNow">jetzt kündigen</button>
        </div>
      </div>
      <form class="card cancel-card" id="cancelForm" hidden novalidate>
        <p id="cancelFormIntro">Du bist nicht angemeldet oder hast kein laufendes Abo in diesem Account. Schick uns die Kündigung hier – wir bestätigen sie per E-Mail.</p>
        <div class="cancel-kind">
          <label class="check"><input type="radio" name="kind" value="kuendigung" checked> <span><strong>Kündigung</strong> zum nächstmöglichen Zeitpunkt</span></label>
          <label class="check"><input type="radio" name="kind" value="widerruf"> <span><strong>Widerruf</strong> (innerhalb von 14 Tagen nach Abschluss)</span></label>
        </div>
        <label class="field">Vertrag<input name="contract" value="Barbook Pro" readonly></label>
        <label class="field">Name<input name="name" autocomplete="name" maxlength="200"></label>
        <label class="field">E-Mail-Adresse deines Accounts<input name="email" type="email" autocomplete="email" maxlength="320" required></label>
        <label class="field">Anmerkung (optional)<textarea name="note" rows="2" maxlength="2000"></textarea></label>
        <p class="form-error" id="cancelError" role="alert" hidden></p>
        <button class="btn btn--danger" type="submit">jetzt kündigen</button>
      </form>
      <div class="card cancel-done" id="cancelDone" hidden>
        <h2>Eingegangen</h2>
        <p id="cancelDoneText"></p>
        <p class="hint">Bitte speichere oder drucke diese Bestätigung.</p>
        <button class="btn" type="button" onclick="print()">Drucken / als PDF speichern</button>
      </div>
      <p class="legal-updated">Fragen? <span data-legal="email"></span></p>'''

for f, title, body in [('impressum.html', 'Impressum', impressum), ('datenschutz.html', 'Datenschutzerklärung', datenschutz),
                       ('nutzungsbedingungen.html', 'Nutzungsbedingungen', nutzung), ('support.html', 'Support', support),
                       ('kuendigen.html', 'Verträge hier kündigen', kuendigen)]:
    scripts = '''  <script src="js/config.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js"></script>
  <script src="js/cloud.js"></script>
  <script src="js/kuendigen.js"></script>
''' if f == 'kuendigen.html' else ''
    html = page(f, title, body, scripts)
    html = html.replace('<h2>10. Account löschen</h2>', '<h2 id="account-loeschen">10. Account löschen</h2>')
    open(OUT + f, 'w').write(html)
print('ok')

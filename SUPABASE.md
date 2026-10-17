# Accounts einrichten (Supabase)

Barbook nutzt [Supabase](https://supabase.com) für Accounts: Anmeldung mit E-Mail und Passwort, Projekte, Beats und Lizenzen liegen in der Cloud und sind auf jedem Gerät da. Der kostenlose Tarif reicht für den Anfang (1 GB Dateien, 50.000 Nutzer im Monat). Einmalig etwa 10 Minuten.

Solange `js/config.js` leer ist, läuft Barbook ohne Account, nur im Browser.

## 1. Supabase-Projekt anlegen

1. Auf [supabase.com](https://supabase.com) kostenlos registrieren (z. B. mit GitHub).
2. **New project** → Name z. B. „barbook“, ein Datenbank-Passwort vergeben (gut aufheben, Barbook braucht es nicht), Region **Central EU (Frankfurt)** → **Create new project**. Ein, zwei Minuten warten.

## 2. Tabellen und Speicher anlegen

1. Links **SQL Editor** → **New query**.
2. Den kompletten Inhalt von `supabase/setup.sql` hineinkopieren → **Run**. Es sollte „Success“ erscheinen.

Damit gibt es die Tabellen für Projekte, Dateien, Profile (mit der ID jedes Accounts), Freundschaften und Features sowie einen privaten Speicher-Bereich „files“. Jede Person sieht nur ihre eigenen Daten – und die Songs, auf denen ein Freund sie als Feature eingetragen hat. Über einen Leselink, den du selbst anschaltest, kann jeder mit dem Link den Text eines Songs lesen – sonst nichts.

**Nach einem Barbook-Update** (z. B. als Freunde, Features, Bars und Leselinks dazukamen): `supabase/setup.sql` einfach noch einmal komplett ausführen. Das Skript ergänzt nur, was fehlt, und erneuert die Regeln – vorhandene Projekte und Accounts bleiben erhalten.

## 3. Schlüssel in Barbook eintragen

1. Links **Project Settings** (Zahnrad) → **API** (bzw. **Data API** und **API Keys**).
2. **Project URL** kopieren, z. B. `https://abcdefgh.supabase.co`.
3. Den **Publishable key** kopieren (beginnt mit `sb_publishable_…`; in älteren Projekten heißt er **anon public** und beginnt mit `eyJ…`). Der darf öffentlich in der Seite stehen; geschützt wird alles über die Regeln aus Schritt 2. Den **Secret key** bzw. **service_role**-Schlüssel niemals eintragen!
4. In `js/config.js` einsetzen:

```js
window.BARBOOK_CONFIG = {
  supabaseUrl: 'https://abcdefgh.supabase.co',
  supabaseAnonKey: 'sb_publishable_…'
};
```

Ab jetzt geht „App öffnen“ zuerst auf die Anmeldeseite.

## 4. E-Mail-Bestätigung

Supabase schickt nach dem Registrieren eine Bestätigungs-Mail. Der Link darin führt zur **Site URL** deines Projekts:

- **Wenn Barbook online ist** (z. B. GitHub Pages, siehe README): unter **Authentication → URL Configuration** die **Site URL** auf deine Adresse setzen (z. B. `https://deinname.github.io/barbook/app.html`) und unter **Redirect URLs** `https://deinname.github.io/barbook/**` eintragen. Dann funktionieren auch die „Passwort vergessen“-Links.
- **Wenn du Barbook nur als Datei öffnest:** Der Bestätigungs-Link bestätigt die E-Mail trotzdem – danach einfach in Barbook anmelden. Alternativ unter **Authentication → Sign In / Providers → Email** „Confirm email“ ausschalten, dann ist man nach dem Registrieren sofort drin. „Passwort vergessen“ braucht eine Online-Adresse.

Tipp: Der eingebaute Mail-Versand von Supabase schafft nur wenige Mails pro Stunde. Für viele Nutzer unter **Authentication → Emails → SMTP Settings** einen eigenen Mail-Anbieter eintragen.

## 5. E-Mails mit Barbook-Namen (optional)

Ohne Anpassung schickt Supabase englische Standard-Mails ohne den Namen Barbook. Unter **Authentication → Emails → Templates**:

- **Confirm signup**: Betreff `Bestätige deine E-Mail für Barbook`, Inhalt aus `supabase/email-templates/confirm-signup.html` (unter „Source“ einfügen)
- **Reset Password**: Betreff `Neues Passwort für Barbook`, Inhalt aus `supabase/email-templates/reset-password.html`

Jeweils **Save** drücken. Der Absender bleibt beim eingebauten Mail-Versand „Supabase Auth“; einen eigenen Absender (z. B. „Barbook“) gibt es nur mit eigenem Mail-Anbieter unter **SMTP Settings**.

## 6. KI-Ideen freischalten (Claude)

Die KI läuft über eine kleine Supabase-Funktion. Der Anthropic-API-Schlüssel liegt dort als Geheimnis und steht nie im Code der Webseite – sonst könnte ihn jeder Besucher auslesen und auf deine Kosten benutzen.

1. **Schlüssel hinterlegen:** links **Edge Functions** → **Secrets** (bzw. Project Settings → Edge Functions) → **Add new secret**: Name `ANTHROPIC_API_KEY`, Wert = dein Schlüssel von [console.anthropic.com](https://console.anthropic.com) → *API Keys* (beginnt mit `sk-ant-api03-…`). Optional ein zweites Secret `AI_DAILY_LIMIT` (Anfragen pro Account und Tag, Standard 50).
2. **Funktion anlegen:** **Edge Functions** → **Deploy a new function** → **Via Editor**. Name genau `claude`. Den kompletten Inhalt von `supabase/functions/claude/index.ts` hineinkopieren → **Deploy function**.
3. In den Einstellungen der Funktion **„Verify JWT“ (Enforce JWT verification) ausschalten** – die Funktion prüft die Anmeldung selbst; mit dem Schalter lehnt Supabase bei neuen Schlüsseln manchmal gültige Anfragen ab.
4. `supabase/setup.sql` noch einmal ausführen (legt den Zähler für das Tageslimit an).

Danach gehen KI-Ideen und das Auslesen von Lizenzen für alle angemeldeten Nutzer, ohne Einstellungen. Die Kosten laufen über dein Anthropic-Konto; dort kannst du unter *Limits* zusätzlich ein Monatslimit setzen.

## 7. Benachrichtigungen aufs Handy (Push)

Damit Chat-Nachrichten, Freundschaftsanfragen und Einladungen auch bei geschlossener App ankommen:

1. **Secrets** (Edge Functions → Secrets → Add new secret):
   - `VAPID_PUBLIC_KEY` = der öffentliche Push-Schlüssel (steht auch in `js/config.js` als `vapidPublicKey`)
   - `VAPID_PRIVATE_KEY` = der private Push-Schlüssel (geheim halten, nie in den Code)
   - optional `VAPID_SUBJECT` = `mailto:deine@adresse.de`
2. **Funktion anlegen:** Edge Functions → Deploy a new function → Via Editor, Name genau `push`, Inhalt von `supabase/functions/push/index.ts` → Deploy. In ihren Einstellungen **„Verify JWT“ ausschalten** (die Datenbank ruft sie ohne Anmeldung auf; die Funktion liest jeden Inhalt selbst aus der Datenbank, deshalb kann niemand falsche Texte verschicken).
3. **Database → Extensions → `pg_net` einschalten** (setup.sql versucht das auch selbst).
4. `supabase/setup.sql` ausführen. Darin steht die Adresse der Funktion (`push_config`); bei einem anderen Supabase-Projekt dort anpassen.

Auf dem iPhone gehen Benachrichtigungen nur, wenn Barbook über „Teilen → Zum Home-Bildschirm“ installiert ist (iOS 16.4 oder neuer). Eingeschaltet werden sie im Profil.

Neue Schlüssel erzeugen (falls nötig): `npx web-push generate-vapid-keys`.

## Wie die Daten laufen

- Jede Änderung wird sofort auf dem Gerät gespeichert und im Hintergrund hochgeladen. Offline geht alles weiter; hochgeladen wird beim nächsten Öffnen mit Internet.
- Beim Öffnen gleicht Barbook ab: Die neuere Version eines Projekts gewinnt.
- Beats und Lizenzen werden auf einem neuen Gerät beim ersten Öffnen heruntergeladen und dann dort zwischengespeichert.
- Projekte, die vor den Accounts nur im Browser lagen, bietet Barbook nach der ersten Anmeldung zur Übernahme an.
- Der API-Schlüssel für die KI-Ideen bleibt weiterhin nur im jeweiligen Browser.

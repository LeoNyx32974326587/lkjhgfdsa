// "Verträge hier kündigen" (§ 312k BGB) and the withdrawal function: signed in with a running Pro subscription
// it ends right here; otherwise the form sends the cancellation to the operator (table cancel_requests).
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  var now = function () { return new Date().toLocaleString('de-DE', { dateStyle: 'long', timeStyle: 'short' }); };
  function done(text) {
    $('cancelSignedIn').hidden = true;
    $('cancelForm').hidden = true;
    $('cancelDoneText').textContent = text;
    $('cancelDone').hidden = false;
    window.scrollTo(0, 0);
  }
  function showForm() { $('cancelForm').hidden = false; }

  if (!window.RaimCloud || !RaimCloud.configured || !RaimCloud.online()) {
    showForm();
    $('cancelFormIntro').textContent = 'Schreib uns deine Kündigung oder deinen Widerruf per E-Mail – die Adresse steht unten. (Gerade keine Verbindung zum Server.)';
    $('cancelForm').querySelector('button[type=submit]').disabled = true;
    return;
  }

  RaimCloud.currentUser().then(function (u) {
    if (!u) { showForm(); return; }
    RaimCloud.setUser(u.id);
    $('cancelForm').elements.email.value = u.email || '';
    return RaimCloud.plan().then(function (p) {
      if (!p || !p.pro || p.cancels) {
        showForm();
        if (p && p.pro && p.cancels) $('cancelFormIntro').textContent = 'Dein Abo ist bereits gekündigt und endet am ' + new Date(p.until).toLocaleDateString('de-DE') + '. Für einen Widerruf nutze das Formular.';
        return;
      }
      $('cancelPlan').textContent = 'Dein Abo: Barbook Pro ' + (p.plan === 'year' ? '(jährlich)' : '(monatlich)') + (p.until ? ', bezahlt bis ' + new Date(p.until).toLocaleDateString('de-DE') : '') + '.';
      $('cancelSignedIn').hidden = false;
    });
  }).catch(showForm);

  $('cancelNow').addEventListener('click', function () {
    var kind = document.querySelector('input[name=cancelKind]:checked').value, btn = $('cancelNow');
    btn.disabled = true;
    btn.textContent = 'Wird gekündigt …';
    RaimCloud.billing(kind).then(function (r) {
      done(kind === 'cancel'
        ? 'Deine Kündigung von Barbook Pro ist am ' + now() + ' eingegangen. Pro läuft bis ' + (r.until ? new Date(r.until).toLocaleDateString('de-DE') : 'zum Ende der bezahlten Zeit') + ' weiter und verlängert sich nicht mehr.'
        : 'Dein Widerruf von Barbook Pro ist am ' + now() + ' eingegangen. Pro ist beendet; den anteiligen Betrag erstatten wir dir innerhalb von 14 Tagen auf dein Zahlungsmittel.');
    }, function () {
      btn.disabled = false;
      btn.textContent = 'jetzt kündigen';
      showForm();
      $('cancelError').textContent = 'Das ging gerade nicht automatisch – schick die Kündigung bitte über das Formular.';
      $('cancelError').hidden = false;
    });
  });

  $('cancelForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, email = f.elements.email.value.trim(), kind = f.querySelector('input[name=kind]:checked').value;
    if (!/^\S+@\S+\.\S+$/.test(email)) { $('cancelError').textContent = 'Bitte gib eine gültige E-Mail-Adresse ein.'; $('cancelError').hidden = false; return; }
    var btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    RaimCloud.cancelRequest({ kind: kind, name: f.elements.name.value.trim(), email: email, note: f.elements.note.value.trim() }).then(function () {
      done((kind === 'widerruf' ? 'Dein Widerruf' : 'Deine Kündigung') + ' von Barbook Pro für ' + email + ' ist am ' + now() + ' eingegangen' +
        (kind === 'widerruf' ? '. Wir beenden Pro und erstatten den anteiligen Betrag.' : ' und gilt zum nächstmöglichen Zeitpunkt.') + ' Wir bestätigen sie dir zusätzlich per E-Mail.');
    }, function () {
      btn.disabled = false;
      $('cancelError').textContent = 'Senden hat nicht geklappt. Schick die Kündigung bitte per E-Mail an die Adresse unten.';
      $('cancelError').hidden = false;
    });
  });
})();

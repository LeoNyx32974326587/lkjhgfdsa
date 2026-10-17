// Login page: sign in, sign up, forgotten password, new password after the e-mail link.
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  var form = $('authForm'), mode = 'in';

  function say(box, text, kind) {
    box.textContent = text;
    box.className = 'login-msg' + (kind ? ' login-msg--' + kind : '');
    box.hidden = !text;
  }

  if (!RaimCloud.configured) { $('notConfigured').hidden = false; return; }
  if (!RaimCloud.online()) {
    form.hidden = false;
    say($('authMsg'), 'Keine Verbindung zum Server. Bist du online? Lade die Seite neu, wenn du wieder Netz hast.', 'error');
    $('authSubmit').disabled = true;
    return;
  }

  function setMode(m) {
    mode = m;
    document.querySelectorAll('[data-mode]').forEach(function (b) { b.classList.toggle('is-on', b.dataset.mode === m); });
    $('authTitle').textContent = m === 'in' ? 'Willkommen zurück' : 'Account erstellen';
    $('authSubmit').textContent = m === 'in' ? 'Anmelden' : 'Registrieren';
    $('password2Field').hidden = m === 'in';
    $('forgot').hidden = m !== 'in';
    form.elements.password.autocomplete = m === 'in' ? 'current-password' : 'new-password';
    say($('authMsg'), '');
  }
  document.querySelectorAll('[data-mode]').forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.mode); });
  });

  // opened from the "reset password" e-mail: ask for the new password
  var recovering = /type=recovery/.test(location.hash);
  RaimCloud.onAuth(function (event) {
    if (event === 'PASSWORD_RECOVERY') { recovering = true; showReset(); }
  });
  function showReset() { form.hidden = true; $('resetForm').hidden = false; }

  RaimCloud.currentUser().then(function (u) {
    if (recovering) showReset();
    else if (u) location.replace('app.html');
    else form.hidden = false;
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = form.elements.email.value.trim(), pw = form.elements.password.value, msg = $('authMsg');
    if (!/^\S+@\S+\.\S+$/.test(email)) return say(msg, 'Bitte gib eine gültige E-Mail-Adresse ein.', 'error');
    if (pw.length < 8) return say(msg, 'Das Passwort braucht mindestens 8 Zeichen.', 'error');
    if (mode === 'up' && pw !== form.elements.password2.value) return say(msg, 'Die beiden Passwörter sind nicht gleich.', 'error');
    $('authSubmit').disabled = true;
    say(msg, mode === 'in' ? 'Melde an …' : 'Erstelle Account …');
    (mode === 'in' ? RaimCloud.signIn(email, pw) : RaimCloud.signUp(email, pw)).then(function (data) {
      if (data && data.session) { location.replace('app.html'); return; }
      // sign-up with e-mail confirmation switched on
      setMode('in');
      say(msg, 'Fast geschafft: Wir haben dir eine E-Mail an ' + email + ' geschickt. Klick auf den Link darin und melde dich dann hier an.', 'ok');
    }).catch(function (err) {
      say(msg, RaimCloud.message(err), 'error');
    }).then(function () { $('authSubmit').disabled = false; });
  });

  $('forgot').addEventListener('click', function () {
    var email = form.elements.email.value.trim(), msg = $('authMsg');
    if (!/^\S+@\S+\.\S+$/.test(email)) return say(msg, 'Trag oben deine E-Mail ein, dann schicken wir dir einen Link zum Zurücksetzen.', 'error');
    RaimCloud.resetPassword(email).then(function () {
      say(msg, 'Wenn es ein Konto mit ' + email + ' gibt, ist jetzt eine E-Mail mit einem Link zum Zurücksetzen unterwegs.', 'ok');
    }, function (err) { say(msg, RaimCloud.message(err), 'error'); });
  });

  $('resetForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var pw = e.target.elements.password.value, msg = $('resetMsg');
    if (pw.length < 8) return say(msg, 'Das Passwort braucht mindestens 8 Zeichen.', 'error');
    RaimCloud.updatePassword(pw).then(function () {
      say(msg, 'Gespeichert. Du wirst angemeldet …', 'ok');
      setTimeout(function () { location.replace('app.html'); }, 900);
    }, function (err) { say(msg, RaimCloud.message(err), 'error'); });
  });
})();

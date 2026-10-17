// Speaking instead of typing: the browser's speech recognition writes into a text field.
// Every pause starts a new line (in multi-line fields); "neue Zeile" does too.
(function (root) {
  'use strict';

  var SR = root.SpeechRecognition || root.webkitSpeechRecognition;
  // project languages (codes from app.js LANGS) -> recognition languages
  var LOCALES = {
    de: 'de-DE', en: 'en-US', tr: 'tr-TR', ar: 'ar-SA', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', pt: 'pt-BR', pl: 'pl-PL',
    ru: 'ru-RU', uk: 'uk-UA', sq: 'sq-AL', ku: 'ku', bks: 'bs-BA', el: 'el-GR', ro: 'ro-RO', nl: 'nl-NL', fa: 'fa-IR'
  };
  var NEW_LINE = /\s*\b(neue zeile|nächste zeile|new line|next line)\b\s*/gi;

  var rec = null, target = null, button = null, wanted = false, heard = false, onError = null, bar = null;

  function supported() { return !!SR; }
  function locale(code) { return LOCALES[code] || (navigator.language || 'de-DE'); }

  function statusBar() {
    if (bar) return bar;
    bar = document.createElement('div');
    bar.className = 'dictate-bar';
    bar.hidden = true;
    bar.setAttribute('role', 'status');
    var dot = document.createElement('span');
    dot.className = 'dictate-dot';
    var text = document.createElement('span');
    text.className = 'dictate-live';
    var stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.className = 'dictate-stop';
    stopBtn.textContent = 'Fertig';
    stopBtn.addEventListener('click', stop);
    bar.append(dot, text, stopBtn);
    document.body.append(bar);
    return bar;
  }
  function live(text) { statusBar().querySelector('.dictate-live').textContent = text; }

  // put the spoken words at the caret: a line of its own in a textarea, after a space in a one-line input
  function insert(words) {
    var multi = target.tagName === 'TEXTAREA';
    words = words.replace(NEW_LINE, multi ? '\n' : ' ').replace(/[ \t]+/g, ' ').trim();
    if (!words) return;
    var cap = function (l) { l = l.trim(); return l.charAt(0).toUpperCase() + l.slice(1); };
    var v = target.value, at = target.selectionStart == null ? v.length : target.selectionStart;
    var end = target.selectionEnd == null ? at : target.selectionEnd;
    var before = v.slice(0, at), after = v.slice(end);
    var glue = !before || /\s$/.test(before) ? '' : multi ? '\n' : ' ';
    if (multi && before && !/\n$/.test(before)) glue = '\n';
    // capital letters only where a line starts
    var lineStart = glue === '\n' || !before.trim() || /\n\s*$/.test(before);
    words = words.split('\n').map(function (l, i) { return i || lineStart ? cap(l) : l.trim(); }).join('\n');
    var text = glue + words;
    target.value = before + text + after;
    target.selectionStart = target.selectionEnd = before.length + text.length;
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function setButton(on) {
    if (!button) return;
    button.classList.toggle('is-listening', on);
    button.setAttribute('aria-pressed', String(on));
  }

  function listen() {
    rec = new SR();
    rec.lang = target.dataset.dictateLang || 'de-DE';
    // one sentence per run, restarted after each pause: avoids the doubled words of continuous mode on Android
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = function (e) {
      if (!target || !document.contains(target)) { stop(); return; }
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var r = e.results[i];
        if (r.isFinal) { insert(r[0].transcript); heard = true; } else interim += r[0].transcript;
      }
      live(interim || 'Sprich jetzt …');
    };
    rec.onerror = function (e) {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      wanted = false;
      var msg = e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'Das Mikrofon ist nicht erlaubt. Erlaube es in den Browser-Einstellungen für diese Seite.'
        : e.error === 'network' ? 'Die Spracheingabe braucht eine Internetverbindung.'
        : e.error === 'language-not-supported' ? 'Diese Sprache kennt die Spracheingabe deines Browsers nicht.'
        : 'Die Spracheingabe hat nicht geklappt (' + e.error + ').';
      if (onError) onError(msg);
    };
    rec.onend = function () {
      if (wanted && target && document.contains(target)) {
        try { listen(); return; } catch (err) { /* fall through and stop */ }
      }
      finish();
    };
    rec.start();
  }

  function finish() {
    wanted = false;
    rec = null;
    setButton(false);
    if (bar) bar.hidden = true;
    if (target && document.contains(target)) target.focus();
    target = button = null;
  }

  // field: textarea or input; btn: the microphone button (shows the listening state)
  function start(field, btn, opts) {
    if (!SR) return false;
    var same = target === field;
    stop();
    if (same) return true;
    opts = opts || {};
    target = field;
    button = btn || null;
    onError = opts.onError || null;
    field.dataset.dictateLang = locale(opts.lang);
    wanted = true;
    heard = false;
    setButton(true);
    // inside an open dialog the bar has to live in the dialog, or it can't be tapped
    (field.closest('dialog') || document.body).append(statusBar());
    statusBar().hidden = false;
    live('Sprich jetzt …');
    try { listen(); } catch (err) { finish(); if (onError) onError('Die Spracheingabe konnte nicht starten.'); return false; }
    return true;
  }

  function stop() {
    if (!rec) { if (target) finish(); return; }
    wanted = false;
    try { rec.stop(); } catch (err) { finish(); }
  }

  function active() { return !!rec; }

  root.RaimDictate = { supported: supported, start: start, stop: stop, active: active, locale: locale };
})(this);

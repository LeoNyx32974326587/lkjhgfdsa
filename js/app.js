(function () {
  'use strict';

  var Store = window.RaimStore;
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }

  // ---------- dictionary ----------
  var index = new RaimRhyme.Index(window.RAIM_WORDS.split('\n'));
  window.RAIM_WORDS = null;
  var blocked = Store.blocked();
  var readyCallbacks = [];
  function whenReady(fn) { if (index.ready) fn(); else readyCallbacks.push(fn); }
  setTimeout(function () {
    index.build(function () {
      $('dictStatus').textContent = index.words.length.toLocaleString('de-DE') + ' Wörter';
      readyCallbacks.splice(0).forEach(function (fn) { fn(); });
    });
  }, 50);

  // ---------- tabs ----------
  function showTab(name) {
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('is-on', t.dataset.tab === name); });
    document.querySelectorAll('.view').forEach(function (v) { v.hidden = v.dataset.view !== name; });
    if (name === 'search') $('searchInput').focus();
    if (name === 'settings') $('blockedCount').textContent = blocked.size;
    try { sessionStorage.setItem('raim.tab', name); } catch (e) { /* private mode */ }
  }
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () { showTab(t.dataset.tab); });
  });

  // ---------- songs ----------
  var songs = Store.songs();
  var current = null;
  var saveTimer = null;

  function renderSongs() {
    var ul = $('songs');
    ul.textContent = '';
    songs.slice().sort(function (a, b) { return b.updated - a.updated; }).forEach(function (s) {
      var li = el('li'), b = el('button');
      b.type = 'button';
      b.append(el('strong', '', s.title || 'Ohne Titel'));
      var first = (s.text || '').split('\n').find(function (l) { return l.trim(); }) || 'Leer';
      b.append(el('span', '', first + ' · ' + new Date(s.updated).toLocaleDateString('de-DE')));
      b.addEventListener('click', function () { openSong(s.id); });
      li.append(b);
      ul.append(li);
    });
    $('songsEmpty').hidden = songs.length > 0;
  }

  function persist() {
    if (!Store.saveSongs(songs)) toast('Speichern fehlgeschlagen – exportier deine Songs unter „Mehr“.');
  }
  function scheduleSave() {
    if (!current) return;
    current.updated = Date.now();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 400);
  }

  function openSong(id) {
    current = songs.find(function (s) { return s.id === id; });
    if (!current) return;
    $('songList').hidden = true;
    $('editor').hidden = false;
    $('songTitle').value = current.title;
    $('songText').value = current.text;
    hideAi();
    updateChips();
    $('songText').focus();
  }
  function closeSong() {
    clearTimeout(saveTimer);
    persist();
    current = null;
    $('editor').hidden = true;
    $('songList').hidden = false;
    renderSongs();
  }

  $('newSong').addEventListener('click', function () {
    var s = { id: Date.now().toString(36), title: '', text: '', updated: Date.now() };
    songs.push(s);
    persist();
    openSong(s.id);
    $('songTitle').focus();
  });
  $('backToList').addEventListener('click', closeSong);
  $('deleteSong').addEventListener('click', function () {
    if (!current || !confirm('„' + (current.title || 'Ohne Titel') + '“ löschen?')) return;
    songs = songs.filter(function (s) { return s !== current; });
    current = null;
    closeSong();
  });
  $('songTitle').addEventListener('input', function (e) { current.title = e.target.value; scheduleSave(); });
  $('songText').addEventListener('input', function (e) { current.text = e.target.value; scheduleSave(); updateChips(); });
  ['click', 'keyup'].forEach(function (ev) { $('songText').addEventListener(ev, updateChips); });
  window.addEventListener('beforeunload', function () { if (current) persist(); });

  // ---------- rhyme chips under the text ----------
  var WORD_RE = /[A-Za-zÄÖÜäöüß]+/g;

  // the last word before the caret; on an empty line, the last word of the line above
  function wordAtCaret() {
    var ta = $('songText'), before = ta.value.slice(0, ta.selectionStart);
    var line = before.split('\n').pop();
    var source = line.trim() ? line : before.replace(/\n[^\n]*$/, '');
    var words = source.match(WORD_RE);
    return words ? words[words.length - 1] : '';
  }

  var chipsFor = null;
  function updateChips() {
    var word = wordAtCaret();
    if (word === chipsFor) return;
    chipsFor = word;
    var box = $('rhymeChips');
    box.textContent = '';
    if (!word || word.length < 2) return;
    whenReady(function () {
      if (chipsFor !== word) return;
      var r = index.search(word, { limit: 24, exclude: blocked });
      box.textContent = '';
      box.append(el('span', 'chip chip--muted', word));
      r.results.forEach(function (h) {
        var c = el('button', 'chip', h.word);
        c.type = 'button';
        c.addEventListener('mousedown', function (e) { e.preventDefault(); });
        c.addEventListener('click', function () { insertAtCaret(h.word); });
        box.append(c);
      });
      if (!r.results.length) box.append(el('span', 'chip chip--muted', 'keine Reime gefunden'));
    });
  }

  function insertAtCaret(text) {
    var ta = $('songText'), s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
    var pre = v.slice(0, s);
    var needSpace = pre && !/[\s(„"]$/.test(pre);
    var ins = (needSpace ? ' ' : '') + text;
    ta.value = pre + ins + v.slice(e);
    ta.selectionStart = ta.selectionEnd = s + ins.length;
    ta.focus();
    current.text = ta.value;
    scheduleSave();
    updateChips();
  }

  // ---------- KI-Ideen ----------
  var aiLineCount = 2, aiProposal = null, aiBusy = false;
  document.querySelectorAll('[data-lines]').forEach(function (b) {
    b.addEventListener('click', function () {
      aiLineCount = parseInt(b.dataset.lines, 10);
      document.querySelectorAll('[data-lines]').forEach(function (x) { x.classList.toggle('is-on', x === b); });
    });
  });

  function hideAi() {
    aiProposal = null;
    $('aiResult').hidden = true;
    $('aiMsg').hidden = true;
  }

  function ensureConsent() {
    return new Promise(function (resolve) {
      if (Store.consent()) return resolve(true);
      var dlg = $('consentDlg');
      $('ageOk').checked = false;
      $('consentYes').disabled = true;
      dlg.returnValue = '';
      dlg.addEventListener('close', function onClose() {
        dlg.removeEventListener('close', onClose);
        var ok = dlg.returnValue === 'yes';
        if (ok) Store.saveConsent(true);
        resolve(ok);
      });
      dlg.showModal();
    });
  }
  $('ageOk').addEventListener('change', function (e) { $('consentYes').disabled = !e.target.checked; });

  // text up to the end of the caret's line: that is what the new lines continue
  function textBeforeInsertPoint() {
    var ta = $('songText'), v = ta.value, nl = v.indexOf('\n', ta.selectionStart);
    return nl < 0 ? v : v.slice(0, nl);
  }

  function runAi() {
    if (aiBusy) return;
    var key = Store.apiKey();
    if (!key) {
      toast('Trag zuerst deinen API-Schlüssel unter „Mehr“ ein.');
      showTab('settings');
      $('apiKey').focus();
      return;
    }
    ensureConsent().then(function (ok) {
      if (!ok) return;
      var text = textBeforeInsertPoint();
      var lines = text.split('\n').filter(function (l) { return l.trim(); });
      var lastLineWords = lines.length ? lines[lines.length - 1].match(WORD_RE) : null;
      var rhymeWord = $('aiRhymeEnd').checked && lastLineWords ? lastLineWords[lastLineWords.length - 1] : '';
      var hints = rhymeWord && index.ready
        ? index.search(rhymeWord, { limit: 15, exclude: blocked }).results.map(function (h) { return h.word; })
        : [];

      aiBusy = true;
      $('aiGo').disabled = true;
      $('aiMsg').hidden = true;
      $('aiResult').hidden = false;
      var box = $('aiLines');
      box.textContent = '';
      box.classList.add('is-loading');
      box.append(el('p', '', 'Claude schreibt …'));
      setAiButtons(false);

      RaimAI.suggest({ apiKey: key, text: text, lineCount: aiLineCount, rhymeWord: rhymeWord, rhymeHints: hints })
        .then(function (out) {
          aiProposal = out;
          box.classList.remove('is-loading');
          box.textContent = '';
          out.forEach(function (l) { var p = el('p'); p.append(el('span', '', l)); box.append(p); });
          setAiButtons(true);
        }, function (err) {
          $('aiResult').hidden = true;
          $('aiMsg').textContent = err.message;
          $('aiMsg').hidden = false;
        })
        .then(function () { aiBusy = false; $('aiGo').disabled = false; });
    });
  }
  function setAiButtons(on) {
    $('aiAccept').disabled = !on;
    $('aiRetry').disabled = !on;
  }

  $('aiGo').addEventListener('click', runAi);
  $('aiRetry').addEventListener('click', runAi);
  $('aiDiscard').addEventListener('click', hideAi);
  $('aiAccept').addEventListener('click', function () {
    if (!aiProposal) return;
    var ta = $('songText'), v = ta.value, nl = v.indexOf('\n', ta.selectionStart);
    var at = nl < 0 ? v.length : nl;
    var ins = (v.slice(0, at).trim() ? '\n' : '') + aiProposal.join('\n');
    ta.value = v.slice(0, at) + ins + v.slice(at);
    ta.selectionStart = ta.selectionEnd = at + ins.length;
    ta.focus();
    current.text = ta.value;
    scheduleSave();
    hideAi();
    updateChips();
  });

  // ---------- Reimsuche ----------
  var filter = 'all', lastResult = null, searchTimer = null;
  document.querySelectorAll('[data-filter]').forEach(function (b) {
    b.addEventListener('click', function () {
      filter = b.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(function (x) { x.classList.toggle('is-on', x === b); });
      renderResults();
    });
  });

  function runSearch() {
    var q = $('searchInput').value.trim();
    if (q.length < 2) { $('searchOut').textContent = ''; lastResult = null; return; }
    var out = $('searchOut');
    if (!index.ready) { out.textContent = ''; out.append(el('p', 'empty', 'Wörterbuch lädt noch …')); }
    whenReady(function () {
      if ($('searchInput').value.trim() !== q) return;
      lastResult = index.search(q, { limit: 120, exclude: blocked });
      renderResults();
    });
  }
  $('searchInput').addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 180);
  });
  $('searchForm').addEventListener('submit', function (e) { e.preventDefault(); clearTimeout(searchTimer); runSearch(); });

  function renderResults() {
    var out = $('searchOut');
    out.textContent = '';
    if (!lastResult) return;
    var r = lastResult;
    var card = el('div', 'result-card');

    if (r.endings.length) {
      var g = el('div', 'group');
      var head = el('button', 'group-head');
      head.type = 'button';
      head.append(el('strong', '', '–' + r.ending), el('em', '', r.endings.length + ' Endungsreime'));
      head.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>');
      var sub = el('p', 'group-sub', r.endings.slice(0, 3).join(', ') + (r.endings.length > 3 ? ', …' : ''));
      head.addEventListener('click', function () {
        var open = g.classList.toggle('is-open');
        sub.textContent = open ? r.endings.join(', ') : r.endings.slice(0, 3).join(', ') + (r.endings.length > 3 ? ', …' : '');
      });
      g.append(head, sub);
      card.append(g);
    }

    var list = r.results.filter(function (h) { return filter === 'all' || h.kind === 'multi'; });
    var ul = el('ul', 'results');
    list.forEach(function (h) {
      var li = el('li');
      var sc = el('span', 'score', h.score.toFixed(2).replace('.', ','));
      sc.style.setProperty('--s', h.score.toFixed(2));
      var w = el('span', 'word', h.word);
      if (h.kind === 'multi') w.append(el('span', 'tag', 'mehrsilbig'));
      w.title = 'Kopieren';
      w.addEventListener('click', function () { copy(h.word); });
      var nope = el('button', 'nope', 'Passt nicht');
      nope.type = 'button';
      nope.addEventListener('click', function () { reject(li, h.word); });
      addSwipe(li, function () { reject(li, h.word); });
      li.append(sc, w, nope);
      ul.append(li);
    });
    card.append(ul);
    if (!list.length) card.append(el('p', 'empty', 'Keine passenden Reime gefunden.'));
    out.append(card);
  }

  function reject(li, word) {
    var key = lastResult.query.toLowerCase().replace(/ /g, '') + '|' + word.toLowerCase();
    blocked.add(key);
    Store.saveBlocked(blocked);
    lastResult.results = lastResult.results.filter(function (h) { return h.word !== word; });
    li.classList.add('is-gone');
    setTimeout(function () { li.remove(); }, 220);
  }

  // swipe a result to the left to dismiss it
  function addSwipe(li, onSwipe) {
    var x0 = null;
    li.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') x0 = e.clientX; });
    li.addEventListener('pointermove', function (e) {
      if (x0 === null) return;
      var dx = Math.min(0, e.clientX - x0);
      li.style.transform = 'translateX(' + dx + 'px)';
    });
    function end(e) {
      if (x0 === null) return;
      var dx = e.clientX - x0;
      x0 = null;
      li.style.transform = '';
      if (dx < -90) onSwipe();
    }
    li.addEventListener('pointerup', end);
    li.addEventListener('pointercancel', end);
  }

  function copy(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () { toast('„' + text + '“ kopiert'); }, function () {});
    }
  }

  // ---------- settings ----------
  $('apiKey').value = Store.apiKey();
  $('saveKey').addEventListener('click', function () {
    Store.saveApiKey($('apiKey').value.trim());
    $('keySaved').hidden = false;
    setTimeout(function () { $('keySaved').hidden = true; }, 2000);
  });
  $('revokeConsent').addEventListener('click', function () {
    Store.saveConsent(false);
    toast('Zustimmung widerrufen.');
  });
  $('clearBlocked').addEventListener('click', function () {
    blocked.clear();
    Store.saveBlocked(blocked);
    $('blockedCount').textContent = '0';
    toast('Liste geleert.');
  });
  $('exportSongs').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(songs, null, 2)], { type: 'application/json' });
    var a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'raim-songs.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  $('importSongs').addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (!f) return;
    f.text().then(function (txt) {
      var data = JSON.parse(txt);
      if (!Array.isArray(data)) throw new Error();
      var ids = new Set(songs.map(function (s) { return s.id; }));
      var added = 0;
      data.forEach(function (s) {
        if (s && typeof s.text === 'string' && !ids.has(s.id)) {
          songs.push({ id: String(s.id || Date.now().toString(36) + added), title: String(s.title || ''), text: s.text, updated: Number(s.updated) || Date.now() });
          added++;
        }
      });
      persist();
      renderSongs();
      toast(added + ' Songs importiert.');
    }).catch(function () { toast('Diese Datei konnte nicht gelesen werden.'); });
    e.target.value = '';
  });

  // ---------- start ----------
  RaimBeats.init(toast);
  renderSongs();
  var startTab = 'write';
  try { startTab = sessionStorage.getItem('raim.tab') || location.hash.slice(1) || 'write'; } catch (e) { /* private mode */ }
  showTab(['write', 'search', 'beats', 'settings'].indexOf(startTab) >= 0 ? startTab : 'write');
})();

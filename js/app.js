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
  var readyCallbacks = [];
  function whenReady(fn) { if (index.ready) fn(); else readyCallbacks.push(fn); }
  setTimeout(function () {
    index.build(function () {
      $('dictStatus').textContent = index.words.length.toLocaleString('de-DE') + ' Wörter';
      readyCallbacks.splice(0).forEach(function (fn) { fn(); });
    });
  }, 50);

  // ---------- projects ----------
  var projects = [];
  var current = null;
  var saveTimer = null;

  function normalize(p) {
    var base = RaimDB.newProject();
    Object.keys(base).forEach(function (k) { if (p[k] === undefined) p[k] = base[k]; });
    Object.keys(base.license).forEach(function (k) { if (p.license[k] === undefined) p.license[k] = base.license[k]; });
    Object.keys(base.rhymes).forEach(function (k) { if (!p.rhymes[k]) p.rhymes[k] = []; });
    return p;
  }

  function saveNow(p) {
    p = p || current;
    if (!p) return Promise.resolve();
    return RaimDB.saveProject(p).catch(function () { toast('Speichern fehlgeschlagen – Speicher voll?'); });
  }
  function scheduleSave() {
    if (!current) return;
    current.updated = Date.now();
    clearTimeout(saveTimer);
    var p = current;
    saveTimer = setTimeout(function () { saveNow(p); }, 400);
  }

  function blockedSet() { return new Set(current ? current.rhymes.blocked : []); }

  function renderProjects() {
    var ul = $('projects');
    ul.textContent = '';
    projects.sort(function (a, b) { return b.updated - a.updated; }).forEach(function (p) {
      var li = el('li'), b = el('button', 'project-card');
      b.type = 'button';
      var top = el('div', 'project-top');
      top.append(el('strong', '', p.title || 'Ohne Titel'));
      if (p.license.type) top.append(el('span', 'badge', p.license.type));
      b.append(top);
      var first = (p.text || '').split('\n').find(function (l) { return l.trim(); });
      b.append(el('p', 'project-line', first || 'Noch kein Text'));
      var meta = [];
      if (p.beat) meta.push('♪ ' + p.beat.name.replace(/\.\w+$/, ''));
      else if (p.youtube) meta.push('♪ YouTube-Beat');
      if (p.license.producer) meta.push(p.license.producer);
      var lines = (p.text || '').split('\n').filter(function (l) { return l.trim(); }).length;
      meta.push(lines + (lines === 1 ? ' Zeile' : ' Zeilen'));
      if (p.takes.length) meta.push(p.takes.length + (p.takes.length === 1 ? ' Aufnahme' : ' Aufnahmen'));
      meta.push(new Date(p.updated).toLocaleDateString('de-DE'));
      b.append(el('span', 'project-meta', meta.join(' · ')));
      b.addEventListener('click', function () { openProject(p); });
      li.append(b);
      ul.append(li);
    });
    $('projectsEmpty').hidden = projects.length > 0;
    $('newProject').hidden = projects.length === 0;
  }

  function createProject() {
    var p = RaimDB.newProject('');
    projects.push(p);
    saveNow(p).then(function () {
      openProject(p);
      $('projectTitle').focus();
    });
  }
  $('newProject').addEventListener('click', createProject);
  document.querySelector('[data-new-project]').addEventListener('click', createProject);

  function openProject(p) {
    current = p;
    $('home').hidden = true;
    $('project').hidden = false;
    $('projectTitle').value = p.title;
    $('songText').value = p.text;
    chipsFor = null;
    hideAi();
    updateChips();
    renderSavedChips();
    updateStats();
    fillLicense();
    $('searchInput').value = '';
    lastResult = null;
    renderResults();
    RaimBeats.open(p);
    showTab('text');
    window.scrollTo(0, 0);
    try { sessionStorage.setItem('raim.project', p.id); } catch (e) { /* private mode */ }
  }

  function closeProject() {
    clearTimeout(saveTimer);
    var p = current;
    RaimBeats.close();
    saveNow(p);
    current = null;
    $('project').hidden = true;
    $('home').hidden = false;
    renderProjects();
    try { sessionStorage.removeItem('raim.project'); } catch (e) { /* private mode */ }
  }
  $('backHome').addEventListener('click', closeProject);

  $('deleteProject').addEventListener('click', function () {
    if (!current || !confirm('Projekt „' + (current.title || 'Ohne Titel') + '“ mit Beat, Lizenz und Aufnahmen löschen?')) return;
    var p = current;
    clearTimeout(saveTimer);
    RaimBeats.close();
    current = null;
    projects = projects.filter(function (x) { return x !== p; });
    RaimDB.deleteProject(p.id).then(function () { toast('Projekt gelöscht.'); });
    $('project').hidden = true;
    $('home').hidden = false;
    renderProjects();
  });

  $('projectTitle').addEventListener('input', function (e) { current.title = e.target.value; scheduleSave(); });
  window.addEventListener('beforeunload', function () { if (current) saveNow(); });

  // ---------- project tabs ----------
  function showTab(name) {
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('is-on', t.dataset.tab === name); });
    document.querySelectorAll('.view').forEach(function (v) { v.hidden = v.dataset.view !== name; });
    if (name !== 'beat') RaimBeats.pause();
    if (name === 'beat') RaimBeats.redraw();
    if (name === 'rhymes') renderRhymeBlocks();
    if (name === 'text') { renderSavedChips(); chipsFor = null; updateChips(); }
  }
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () { showTab(t.dataset.tab); window.scrollTo(0, 0); });
  });

  // ---------- text ----------
  var WORD_RE = /[A-Za-zÄÖÜäöüß]+/g;

  function updateStats() {
    var t = current.text, lines = t.split('\n').filter(function (l) { return l.trim(); }).length;
    var words = (t.match(WORD_RE) || []).length;
    $('textStats').textContent = lines ? lines + ' Zeilen · ' + words + ' Wörter' : '';
  }

  $('songText').addEventListener('input', function (e) {
    current.text = e.target.value;
    scheduleSave();
    updateChips();
    updateStats();
  });
  ['click', 'keyup'].forEach(function (ev) { $('songText').addEventListener(ev, updateChips); });

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
    if (!current) return;
    var word = wordAtCaret();
    if (word === chipsFor) return;
    chipsFor = word;
    var box = $('rhymeChips');
    box.textContent = '';
    if (!word || word.length < 2) return;
    whenReady(function () {
      if (chipsFor !== word || !current) return;
      var r = index.search(word, { limit: 24, exclude: blockedSet() });
      box.textContent = '';
      box.append(el('span', 'chip chip--muted', word));
      r.results.forEach(function (h) { box.append(insertChip(h.word)); });
      if (!r.results.length) box.append(el('span', 'chip chip--muted', 'keine Reime gefunden'));
    });
  }

  function insertChip(word, cls) {
    var c = el('button', 'chip' + (cls ? ' ' + cls : ''), word);
    c.type = 'button';
    c.addEventListener('mousedown', function (e) { e.preventDefault(); });
    c.addEventListener('click', function () { insertAtCaret(word); });
    return c;
  }

  function renderSavedChips() {
    var box = $('savedChips');
    box.textContent = '';
    var saved = current ? current.rhymes.saved : [];
    box.hidden = !saved.length;
    if (!saved.length) return;
    box.append(el('span', 'chip-label', 'Gemerkt'));
    saved.forEach(function (w) { box.append(insertChip(w, 'chip--saved')); });
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
    updateStats();
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
      toast('Trag zuerst deinen API-Schlüssel in den Einstellungen ein.');
      openSettings();
      $('apiKey').focus();
      return;
    }
    ensureConsent().then(function (ok) {
      if (!ok) return;
      var p = current, text = textBeforeInsertPoint();
      var lines = text.split('\n').filter(function (l) { return l.trim(); });
      var lastLineWords = lines.length ? lines[lines.length - 1].match(WORD_RE) : null;
      var rhymeWord = $('aiRhymeEnd').checked && lastLineWords ? lastLineWords[lastLineWords.length - 1] : '';
      var hints = [];
      if (rhymeWord && index.ready) {
        // the project's saved words go first when they rhyme
        var found = index.search(rhymeWord, { limit: 15, exclude: blockedSet() }).results.map(function (h) { return h.word; });
        hints = p.rhymes.saved.filter(function (w) { return found.indexOf(w) >= 0; }).concat(found);
        hints = hints.filter(function (w, i) { return hints.indexOf(w) === i; }).slice(0, 15);
      }

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
          if (current !== p) return;
          aiProposal = out;
          box.classList.remove('is-loading');
          box.textContent = '';
          out.forEach(function (l) { var para = el('p'); para.append(el('span', '', l)); box.append(para); });
          setAiButtons(true);
        }, function (err) {
          if (current !== p) return;
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
    updateStats();
  });

  // ---------- license ----------
  var licenseUrl = null;
  function fillLicense() {
    var f = $('licenseForm'), l = current.license;
    ['producer', 'type', 'bpm', 'key', 'date', 'notes'].forEach(function (k) { f.elements[k].value = l[k] || ''; });
    showLicenseFile();
  }
  function showLicenseFile() {
    var l = current.license;
    if (licenseUrl) { URL.revokeObjectURL(licenseUrl); licenseUrl = null; }
    $('licenseFileLabel').textContent = l.fileId ? l.fileName : 'Lizenz hochladen (PDF, Bild …)';
    $('licenseFileActions').hidden = !l.fileId;
    if (!l.fileId) return;
    var p = current;
    RaimDB.getFile(l.fileId).then(function (rec) {
      if (!rec || current !== p) return;
      licenseUrl = URL.createObjectURL(rec.blob);
      $('licenseOpen').href = licenseUrl;
    });
  }
  $('licenseForm').addEventListener('input', function (e) {
    if (!e.target.name) return;
    current.license[e.target.name] = e.target.value;
    scheduleSave();
  });
  $('licenseForm').addEventListener('submit', function (e) { e.preventDefault(); });
  $('licenseInput').addEventListener('change', function (e) {
    var file = e.target.files[0], p = current;
    e.target.value = '';
    if (!file) return;
    var old = p.license.fileId;
    RaimDB.putFile(p.id, file).then(function (id) {
      p.license.fileId = id;
      p.license.fileName = file.name;
      scheduleSave();
      if (current === p) showLicenseFile();
      toast('Lizenz gespeichert.');
      return RaimDB.deleteFile(old);
    }).catch(function () { toast('Lizenz konnte nicht gespeichert werden.'); });
  });
  $('licenseRemove').addEventListener('click', function () {
    if (!confirm('Lizenzdatei entfernen?')) return;
    RaimDB.deleteFile(current.license.fileId);
    current.license.fileId = null;
    current.license.fileName = '';
    scheduleSave();
    showLicenseFile();
  });

  // ---------- Reime (per project) ----------
  var filter = 'all', lastResult = null, searchTimer = null, shown = 30;
  var GROUP_COLORS = ['#5ee7ff', '#ff7ad9', '#ffd166', '#8fff9f', '#ff9b6b', '#b59bff'];

  document.querySelectorAll('[data-filter]').forEach(function (b) {
    b.addEventListener('click', function () {
      filter = b.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(function (x) { x.classList.toggle('is-on', x === b); });
      renderResults();
    });
  });

  // rhyme key of a word: its last stressed vowel and everything after it
  function rhymeKey(word) {
    var v = RaimRhyme.transcribe(word).v, n = v.length;
    if (!n) return '';
    return 'aeiouöüAYW'.indexOf(v[n - 1]) < 0 && n > 1 ? v[n - 2] + v[n - 1] : v[n - 1];
  }

  function lineEndings() {
    var seen = {}, out = [];
    current.text.split('\n').forEach(function (line) {
      var w = line.match(WORD_RE);
      if (!w) return;
      var last = w[w.length - 1];
      if (last.length < 2 || seen[last.toLowerCase()]) return;
      seen[last.toLowerCase()] = 1;
      out.push(last);
    });
    return out;
  }

  function renderRhymeBlocks() {
    if (!current) return;
    // line endings of the text, colored by rhyme group so the scheme is visible
    var ends = lineEndings(), box = $('endingChips');
    box.textContent = '';
    var groups = {}, color = {}, next = 0;
    ends.forEach(function (w) { var k = rhymeKey(w); groups[k] = (groups[k] || 0) + 1; });
    ends.forEach(function (w) {
      var k = rhymeKey(w), c = el('button', 'chip chip--end', w);
      c.type = 'button';
      if (groups[k] > 1) {
        if (!color[k]) color[k] = GROUP_COLORS[next++ % GROUP_COLORS.length];
        c.style.setProperty('--dot', color[k]);
        c.classList.add('has-dot');
      }
      c.addEventListener('click', function () { search(w); });
      box.append(c);
    });
    $('endingsBlock').hidden = !ends.length;

    var saved = $('savedList');
    saved.textContent = '';
    current.rhymes.saved.forEach(function (w) {
      var c = el('span', 'chip chip--saved');
      var b = el('button', 'chip-main', w);
      b.type = 'button';
      b.addEventListener('click', function () { search(w); });
      var x = el('button', 'chip-x', '×');
      x.type = 'button';
      x.setAttribute('aria-label', w + ' entfernen');
      x.addEventListener('click', function () { toggleSaved(w); renderRhymeBlocks(); });
      c.append(b, x);
      saved.append(c);
    });
    $('savedBlock').hidden = !current.rhymes.saved.length;

    var hist = $('historyChips');
    hist.textContent = '';
    current.rhymes.history.forEach(function (q) {
      var c = el('button', 'chip chip--muted chip--btn', q);
      c.type = 'button';
      c.addEventListener('click', function () { search(q); });
      hist.append(c);
    });
    $('historyBlock').hidden = !current.rhymes.history.length;
  }

  function search(q) {
    $('searchInput').value = q;
    runSearch(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function remember(q) {
    var h = current.rhymes.history.filter(function (x) { return x.toLowerCase() !== q.toLowerCase(); });
    h.unshift(q);
    current.rhymes.history = h.slice(0, 12);
    scheduleSave();
  }

  function runSearch(record) {
    var q = $('searchInput').value.trim();
    if (q.length < 2) { lastResult = null; renderResults(); return; }
    var out = $('searchOut');
    if (!index.ready) { out.textContent = ''; out.append(el('p', 'empty', 'Wörterbuch lädt noch …')); }
    var p = current;
    whenReady(function () {
      if ($('searchInput').value.trim() !== q || current !== p) return;
      lastResult = index.search(q, { limit: 120, exclude: blockedSet() });
      shown = 30;
      if (record) { remember(q); renderRhymeBlocks(); }
      renderResults();
    });
  }
  $('searchInput').addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { runSearch(false); }, 180);
  });
  $('searchInput').addEventListener('change', function () { if (lastResult) remember(lastResult.query); });
  $('searchForm').addEventListener('submit', function (e) {
    e.preventDefault();
    clearTimeout(searchTimer);
    runSearch(true);
    $('searchInput').blur();
  });

  function toggleSaved(word) {
    var s = current.rhymes.saved, i = s.indexOf(word);
    if (i >= 0) s.splice(i, 1); else s.push(word);
    scheduleSave();
    return i < 0;
  }

  function renderResults() {
    var out = $('searchOut');
    out.textContent = '';
    $('filters').hidden = !lastResult;
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
    list.slice(0, shown).forEach(function (h) {
      var li = el('li');
      var sc = el('span', 'score', h.score.toFixed(2).replace('.', ','));
      sc.style.setProperty('--s', h.score.toFixed(2));
      var w = el('span', 'word', h.word);
      if (h.kind === 'multi') w.append(el('span', 'tag', 'mehrsilbig'));
      var star = el('button', 'star', '★');
      star.type = 'button';
      star.setAttribute('aria-label', 'Für dieses Projekt merken');
      star.classList.toggle('is-on', current.rhymes.saved.indexOf(h.word) >= 0);
      star.addEventListener('click', function () {
        var on = toggleSaved(h.word);
        star.classList.toggle('is-on', on);
        toast(on ? '„' + h.word + '“ gemerkt' : '„' + h.word + '“ entfernt');
        renderRhymeBlocks();
      });
      var nope = el('button', 'nope', '✕');
      nope.type = 'button';
      nope.title = 'Passt nicht';
      nope.setAttribute('aria-label', 'Passt nicht – ' + h.word + ' ausblenden');
      nope.addEventListener('click', function () { reject(li, h.word); });
      addSwipe(li, function () { reject(li, h.word); });
      li.append(sc, w, star, nope);
      ul.append(li);
    });
    card.append(ul);
    if (list.length > shown) {
      var more = el('button', 'btn more', 'Mehr anzeigen (' + (list.length - shown) + ')');
      more.type = 'button';
      more.addEventListener('click', function () { shown += 30; renderResults(); });
      card.append(more);
    }
    if (!list.length) card.append(el('p', 'empty', 'Keine passenden Reime gefunden.'));
    out.append(card);
  }

  function reject(li, word) {
    var key = lastResult.query.toLowerCase().replace(/ /g, '') + '|' + word.toLowerCase();
    if (current.rhymes.blocked.indexOf(key) < 0) current.rhymes.blocked.push(key);
    scheduleSave();
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
      li.style.transform = 'translateX(' + Math.min(0, e.clientX - x0) + 'px)';
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

  // ---------- settings ----------
  function openSettings() {
    $('apiKey').value = Store.apiKey();
    $('storageInfo').textContent = '';
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(function (e) {
        $('storageInfo').textContent = 'Belegt: ' + (e.usage / 1048576).toFixed(1) + ' MB von ca. ' + Math.round(e.quota / 1048576) + ' MB';
      });
    }
    $('settingsDlg').showModal();
  }
  $('openSettings').addEventListener('click', openSettings);
  $('closeSettings').addEventListener('click', function () { $('settingsDlg').close(); });
  $('saveKey').addEventListener('click', function () {
    Store.saveApiKey($('apiKey').value.trim());
    $('keySaved').hidden = false;
    setTimeout(function () { $('keySaved').hidden = true; }, 2000);
  });
  $('revokeConsent').addEventListener('click', function () {
    Store.saveConsent(false);
    toast('Zustimmung widerrufen.');
  });

  // export everything, files included, as one JSON file
  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }
  function fileIds(p) {
    var ids = p.takes.map(function (t) { return t.fileId; });
    if (p.beat) ids.push(p.beat.fileId);
    if (p.license.fileId) ids.push(p.license.fileId);
    return ids;
  }
  $('exportAll').addEventListener('click', function () {
    var btn = $('exportAll');
    btn.disabled = true;
    btn.textContent = 'Exportiere …';
    var files = [];
    Promise.all(projects.map(function (p) {
      return Promise.all(fileIds(p).map(function (id) {
        return RaimDB.getFile(id).then(function (rec) {
          if (!rec) return;
          return blobToDataUrl(rec.blob).then(function (data) {
            files.push({ id: rec.id, project: rec.project, name: rec.name, type: rec.type, data: data });
          });
        });
      }));
    })).then(function () {
      var blob = new Blob([JSON.stringify({ app: 'raim', version: 1, projects: projects, files: files })], { type: 'application/json' });
      var a = el('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'RAIM-Sicherung-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    }).catch(function () { toast('Export fehlgeschlagen.'); })
      .then(function () { btn.disabled = false; btn.textContent = 'Alles exportieren'; });
  });

  $('importAll').addEventListener('change', function (e) {
    var f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    f.text().then(function (txt) {
      var data = JSON.parse(txt);
      if (!data || data.app !== 'raim' || !Array.isArray(data.projects)) throw new Error('format');
      var have = new Set(projects.map(function (p) { return p.id; }));
      var incoming = data.projects.filter(function (p) { return p && p.id && !have.has(p.id); });
      var ids = new Set(incoming.map(function (p) { return p.id; }));
      return Promise.all((data.files || []).filter(function (x) { return ids.has(x.project); }).map(function (x) {
        return fetch(x.data).then(function (r) { return r.blob(); }).then(function (blob) {
          return RaimDB.getFile(x.id).then(function (exists) {
            if (exists) return;
            // keep the original id so the project's references stay valid
            return RaimDB.putFileRecord({ id: x.id, project: x.project, name: x.name, type: x.type, blob: blob });
          });
        });
      })).then(function () {
        return Promise.all(incoming.map(function (p) { normalize(p); projects.push(p); return RaimDB.saveProject(p); }));
      }).then(function () {
        renderProjects();
        toast(incoming.length + (incoming.length === 1 ? ' Projekt' : ' Projekte') + ' importiert.');
      });
    }).catch(function () { toast('Diese Datei ist keine RAIM-Sicherung.'); });
  });

  // ---------- start ----------
  RaimBeats.init(toast, {
    project: function () { return current; },
    save: function () { scheduleSave(); }
  });

  // songs from the first version become projects
  function migrate() {
    var old = Store.legacySongs();
    if (!old.length) return Promise.resolve();
    return Promise.all(old.map(function (s) {
      var p = RaimDB.newProject(s.title);
      p.text = s.text || '';
      p.updated = s.updated || Date.now();
      projects.push(p);
      return RaimDB.saveProject(p);
    })).then(function () { Store.clearLegacySongs(); });
  }

  RaimDB.projects().then(function (list) {
    projects = list.map(normalize);
    return migrate();
  }).then(function () {
    renderProjects();
    var openId = null;
    try { openId = sessionStorage.getItem('raim.project'); } catch (e) { /* private mode */ }
    var p = projects.find(function (x) { return x.id === openId; });
    if (p) openProject(p);
  }).catch(function () {
    toast('Speicher nicht verfügbar – ist der private Modus aktiv?');
    renderProjects();
  });
})();

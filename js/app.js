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

  // file name without characters browsers or file systems reject
  function fileName(t) { return t.replace(/[\\/:*?"<>|„“”‚‘’'«»]/g, '').replace(/\s+/g, ' ').trim() || 'Barbook'; }

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }

  // ---------- dictionaries ----------
  // German loads with the page; English (pronunciations) and the thesaurus load on demand.
  var engine = new RaimRhyme.Engine();
  var deData = window.RAIM_WORDS, deWords = deData.words.split('\n');
  window.RAIM_WORDS = null;
  engine.add(new RaimRhyme.Index('de', deWords, deData.ranked, function (i) { return RaimRhyme.transcribe(deWords[i]); }));

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { s.remove(); reject(new Error(src)); };
      document.head.appendChild(s);
    });
  }

  var enPromise = null;
  function loadEnglish() {
    if (!enPromise) {
      enPromise = loadScript('js/words-en.js').then(function () {
        var rows = window.RAIM_WORDS_EN.split('\n');
        window.RAIM_WORDS_EN = null;
        var words = rows.map(function (r) { return r.slice(0, r.indexOf(' ')); });
        var phones = rows.map(function (r) { return r.slice(r.indexOf(' ') + 1); });
        var idx = new RaimRhyme.Index('en', words, words.length, function (i) { return RaimRhyme.fromArpa(phones[i]); });
        return new Promise(function (resolve) { idx.build(function () { engine.add(idx); resolve(); }); });
      });
      enPromise.catch(function () { enPromise = null; });
    }
    return enPromise;
  }

  var dePromise = new Promise(function (resolve) {
    setTimeout(function () { engine.indexes.de.build(resolve); }, 50);
  });

  // every other language: js/words-<code>.js from tools/build_langs.py, loaded when a song needs it
  var langPromises = { de: dePromise };
  function loadLang(code) {
    if (code === 'en') return loadEnglish();
    if (!langPromises[code]) {
      langPromises[code] = loadScript('js/words-' + code + '.js').then(function () {
        var name = 'RAIM_LANG_' + code.toUpperCase(), data = window[name];
        window[name] = null;
        var rows = data.words.split('\n');
        var words = rows.map(function (r) { return r.slice(0, r.indexOf('\t')); });
        var codes = rows.map(function (r) { return r.slice(r.indexOf('\t') + 1); });
        var idx = new RaimRhyme.Index(code, words, data.ranked, function (i) { return RaimRhyme.fromCode(codes[i]); });
        return new Promise(function (resolve) { idx.build(function () { engine.add(idx); resolve(); }); });
      });
      langPromises[code].catch(function () { langPromises[code] = null; });
    }
    return langPromises[code];
  }
  function showDictStatus() {
    var n = Object.keys(engine.indexes).filter(function (l) { return engine.ready(l); }).map(function (l) {
      return l.toUpperCase() + ' ' + engine.indexes[l].words.length.toLocaleString('de-DE');
    });
    $('dictStatus').textContent = n.join(' · ') + ' Wörter';
  }
  // load the dictionaries of these languages (German always), then run fn
  function withLangs(langs, fn) {
    var failed = [];
    var all = ['de'].concat(langs).map(function (l) {
      return loadLang(l).catch(function () { failed.push(langName(l)); });
    });
    Promise.all(all).then(function () {
      showDictStatus();
      if (failed.length) toast('Wörterbuch für ' + failed.join(', ') + ' konnte nicht geladen werden.');
      fn();
    });
  }
  function whenReady(fn) { withLangs(current ? rhymeLangs() : [], fn); }
  dePromise.then(showDictStatus);

  // rhymes come from all the song's languages (song infos), also across them:
  // a Spanish word on a German one works like German on English
  function rhymeLangs() {
    var l = current ? current.langs.filter(function (x) { return x !== 'other'; }) : [];
    return l.length ? l : ['de'];
  }
  function searchRhymes(q, limit, mode) {
    return engine.search(q, { langs: rhymeLangs(), primary: current.lang, limit: limit, exclude: blockedSet(), mode: mode });
  }

  // ---------- projects ----------
  var projects = [];
  var current = null;
  var saveTimer = null;

  function normalize(p) {
    var base = RaimDB.newProject();
    Object.keys(base).forEach(function (k) { if (p[k] === undefined) p[k] = base[k]; });
    Object.keys(base.license).forEach(function (k) { if (p.license[k] === undefined) p.license[k] = base.license[k]; });
    Object.keys(base.rhymes).forEach(function (k) { if (!p.rhymes[k]) p.rhymes[k] = []; });
    // projects from before several genres/languages were possible
    if (p.genre && !p.genres.length) p.genres = [p.genre];
    delete p.genre;
    if (!p.langs || !p.langs.length) p.langs = [p.lang || 'de'];
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

  function activeProjects() { return projects.filter(function (p) { return !p.deletedAt; }); }

  // ---------- status: in Bearbeitung / fertig ----------
  var STATUS = { edit: 'In Bearbeitung', done: 'Fertig' };
  function statusOf(p) { return p.status === 'done' ? 'done' : 'edit'; }
  // one button in the top bar: shows the status, a tap switches it
  function renderStatus() {
    var b = $('statusToggle'), st = statusOf(current);
    b.textContent = STATUS[st];
    b.className = 'status-pill status-pill--' + st;
    b.disabled = !may('status');
    b.setAttribute('aria-label', 'Status: ' + STATUS[st] + (may('status') ? ' – antippen zum Umschalten' : ''));
    renderRelease();
  }

  // ---------- release checklist for finished songs ----------
  var RELEASE = [['recorded', 'Aufgenommen'], ['mixed', 'Gemischt'], ['mastered', 'Gemastert'], ['cover', 'Cover fertig'],
    ['license', 'Lizenz geklärt'], ['uploaded', 'Beim Distributor hochgeladen']];
  var releaseOpen = false;
  function releaseDone(p) { return RELEASE.filter(function (k) { return p.release && p.release[k[0]]; }).length; }
  // "Release 3/6", "Release am 01.12.2026", "Released 01.12.2026"
  function releaseText(p) {
    var r = p.release || {}, n = releaseDone(p);
    if (r.date) {
      var d = new Date(r.date + 'T12:00:00'), when = d.toLocaleDateString('de-DE');
      if (n === RELEASE.length) return d <= new Date() ? 'Released ' + when : 'Release am ' + when + ' ✓';
      return 'Release am ' + when + ' · ' + n + '/' + RELEASE.length;
    }
    return 'Release ' + n + '/' + RELEASE.length;
  }
  function renderRelease() {
    var box = $('releaseBox'), p = current;
    box.hidden = !p || statusOf(p) !== 'done';
    if (box.hidden) return;
    if (!p.release) p.release = {};
    var edit = may('status'), n = releaseDone(p);
    $('releaseSum').textContent = n === RELEASE.length ? 'Alles erledigt' + (p.release.date ? ' · ' + releaseText(p).replace(/^Release(d)? (am )?/, '') : '')
      : n + ' von ' + RELEASE.length + ' erledigt' + (p.release.date ? ' · ' + new Date(p.release.date + 'T12:00:00').toLocaleDateString('de-DE') : '');
    box.classList.toggle('is-done', n === RELEASE.length);
    $('releaseHead').setAttribute('aria-expanded', String(releaseOpen));
    box.classList.toggle('is-open', releaseOpen);
    $('releaseBody').hidden = !releaseOpen;
    var checks = $('releaseChecks');
    checks.textContent = '';
    RELEASE.forEach(function (k) {
      var label = el('label', 'check'), cb = el('input');
      cb.type = 'checkbox';
      cb.checked = !!p.release[k[0]];
      cb.disabled = !edit;
      cb.addEventListener('change', function () {
        p.release[k[0]] = cb.checked;
        scheduleSave();
        renderRelease();
      });
      label.append(cb, document.createTextNode(' ' + k[1]));
      checks.append(label);
    });
    $('releaseDate').value = p.release.date || '';
    $('releaseDate').disabled = !edit;
    var warn = licenseWarnings(p).some(function (w) { return w[0] === 'warn'; });
    $('releaseHint').textContent = warn ? 'Achtung: Bei der Lizenz ist noch etwas offen – schau im Beat-Bereich nach, bevor du veröffentlichst.'
      : !edit ? 'Die Checkliste kann nur ändern, wer den Status ändern darf.' : '';
    $('releaseHint').hidden = !$('releaseHint').textContent;
  }
  $('releaseHead').addEventListener('click', function () { releaseOpen = !releaseOpen; renderRelease(); });
  $('releaseDate').addEventListener('change', function (e) {
    if (!current || !may('status')) return;
    current.release.date = e.target.value;
    scheduleSave();
    renderRelease();
  });
  $('statusToggle').addEventListener('click', function () {
    if (!current || !may('status')) return;
    current.status = statusOf(current) === 'done' ? 'edit' : 'done';
    releaseOpen = current.status === 'done';
    renderStatus();
    scheduleSave();
    toast(current.status === 'done' ? 'Als fertig markiert.' : 'Wieder in Bearbeitung.');
  });
  $('projectSettings').addEventListener('click', function () { if (current) openInfo(current); });

  // projects in progress on top, finished ones below
  function renderProjects() {
    var box = $('projects'), active = activeProjects(), trashed = projects.length - active.length;
    box.textContent = '';
    ['edit', 'done'].forEach(function (status) {
      var list = active.filter(function (p) { return statusOf(p) === status; });
      if (!list.length) return;
      var head = el('h2', 'project-group', STATUS[status]);
      head.append(el('span', '', String(list.length)));
      var ul = el('ul', 'projects projects--' + status);
      list.sort(function (a, b) { return b.updated - a.updated; }).forEach(function (p) { ul.append(projectCard(p)); });
      box.append(head, ul);
    });
    $('projectsEmpty').hidden = active.length > 0;
    $('newProject').hidden = active.length === 0;
    $('homeLinks').hidden = active.length === 0;
    $('libraryWarn').hidden = !libEntries().some(function (e) { return e.warn; });
    $('openTrash').hidden = !trashed;
    $('trashCount').textContent = '(' + trashed + ')';
  }

  function projectCard(p) {
    var li = el('li'), b = el('button', 'project-card');
    b.type = 'button';
    var top = el('div', 'project-top');
    top.append(el('strong', '', p.title || 'Ohne Titel'));
    if (statusOf(p) === 'done') top.append(el('span', 'badge badge--done', 'Fertig'));
    if (p._owner) top.append(el('span', 'badge badge--feat', 'von ' + ownerName(p)));
    if (p.license.type) top.append(el('span', 'badge', p.license.type));
    if (licenseWarnings(p).some(function (w) { return w[0] === 'warn'; })) top.append(el('span', 'badge badge--warn', 'Lizenz prüfen'));
    b.append(top);
    var first = RaimSong.lines(p.text)[0];
    b.append(el('p', 'project-line', first || 'Noch kein Text'));
    var meta = songFacts(p);
    if (p.features.length) meta.unshift('feat. ' + featureNames(p));
    if (statusOf(p) === 'done') meta.unshift(releaseText(p));
    if (p.beat) meta.push('♪ ' + p.beat.name.replace(/\.\w+$/, ''));
    else if (p.youtube) meta.push('♪ YouTube-Beat');
    if (p.license.producer) meta.push(p.license.producer);
    var lines = RaimSong.lines(p.text).length;
    meta.push(lines + (lines === 1 ? ' Zeile' : ' Zeilen'));
    if (p.takes.length) meta.push(p.takes.length + (p.takes.length === 1 ? ' Aufnahme' : ' Aufnahmen'));
    meta.push(new Date(p.updated).toLocaleDateString('de-DE'));
    b.append(el('span', 'project-meta', meta.join(' · ')));
    b.addEventListener('click', function () { openFresh(p); });
    li.append(b);
    return li;
  }

  function createProject() { openInfo(null); }
  $('newProject').addEventListener('click', createProject);
  document.querySelector('[data-new-project]').addEventListener('click', createProject);

  // ---------- what a featured friend may change ----------
  // Own projects: everything. A friend's: only what the owner ticked (the database enforces it too).
  function may(what) { return !current || !current._owner || !!(current._rights && current._rights[what]); }
  function applyRights() {
    var root = $('project');
    ['text', 'beat', 'license', 'info', 'status'].forEach(function (k) { root.classList.toggle('lock-' + k, !may(k)); });
    $('projectTitle').readOnly = !may('info');
    $('bpmInput').readOnly = !may('info');
    $('deleteProject').setAttribute('aria-label', current._owner ? 'Projekt verlassen' : 'Projekt löschen');
    var note = $('rightsNote');
    note.hidden = !current._owner;
    if (current._owner) {
      var allowed = rightsText(current._rights);
      note.textContent = 'Feature bei ' + ownerName(current) + ': ' +
        (allowed ? 'Du darfst ' + allowed + ' ändern, alles andere nur ansehen.' : 'Du darfst den Song ansehen, aber nichts ändern.');
    }
  }

  function openProject(p) {
    current = p;
    openedAs = snapshot(p);
    releaseOpen = false;
    comments = [];
    renderCommentCount();
    applyRights();
    $('home').hidden = true;
    $('project').hidden = false;
    $('projectTitle').value = p.title;
    loadSections();
    promptPick = null;
    renderSongInfo();
    renderStatus();
    hideAi();
    updateStats();
    fillLicense();
    $('searchInput').value = '';
    lastResult = null;
    renderResults();
    renderRhymeLangs();
    setMode('rhymes');
    $('synInput').value = $('synTarget').value = '';
    $('synOut').textContent = $('synInfo').textContent = '';
    RaimBeats.open(p);
    setTextMode('write');
    loadComments();
    showTab('text');
    window.scrollTo(0, 0);
    try { sessionStorage.setItem('raim.project', p.id); } catch (e) { /* private mode */ }
  }

  // the project as it was when opened: closing saves only when something changed, so an
  // unchanged copy never overwrites what a featured friend saved in the meantime
  var openedAs = '';
  function snapshot(p) { return JSON.stringify(p, function (k, v) { return k === '_cloud' ? undefined : v; }); }
  function closeProject() {
    clearTimeout(saveTimer);
    var p = current;
    RaimBeats.close();
    $('miniBar').hidden = true;
    if (snapshot(p) !== openedAs) saveNow(p);
    current = null;
    $('project').hidden = true;
    $('home').hidden = false;
    renderProjects();
    try { sessionStorage.removeItem('raim.project'); } catch (e) { /* private mode */ }
  }
  $('backHome').addEventListener('click', closeProject);

  // ---------- confirm dialog ----------
  function confirmDialog(title, text, yesLabel) {
    return new Promise(function (resolve) {
      var dlg = $('confirmDlg');
      $('confirmTitle').textContent = title;
      $('confirmText').textContent = text;
      $('confirmYes').textContent = yesLabel;
      dlg.returnValue = '';
      dlg.addEventListener('close', function onClose() {
        dlg.removeEventListener('close', onClose);
        resolve(dlg.returnValue === 'yes');
      });
      dlg.showModal();
    });
  }

  // ---------- trash ----------
  var TRASH_DAYS = 28, DAY = 86400000;

  function daysLeft(p) { return Math.max(0, Math.ceil((p.deletedAt + TRASH_DAYS * DAY - Date.now()) / DAY)); }

  $('deleteProject').addEventListener('click', function () {
    var p = current;
    if (!p) return;
    if (p._owner) { leaveProject(p); return; }
    confirmDialog(
      'Projekt löschen?',
      'Bist du sicher, dass du „' + (p.title || 'Ohne Titel') + '“ löschen möchtest? Es wird mit Text, Beat, Lizenz und Aufnahmen in den Papierkorb verschoben und nach ' + TRASH_DAYS + ' Tagen endgültig gelöscht.',
      'In den Papierkorb'
    ).then(function (ok) {
      if (!ok || current !== p) return;
      p.deletedAt = Date.now();
      closeProject();
      toast('In den Papierkorb verschoben.');
    });
  });

  function renderTrash() {
    var ul = $('trashList'), list = projects.filter(function (p) { return p.deletedAt; });
    ul.textContent = '';
    list.sort(function (a, b) { return b.deletedAt - a.deletedAt; }).forEach(function (p) {
      var li = el('li', 'trash-item');
      var info = el('div', 'trash-info');
      info.append(el('strong', '', p.title || 'Ohne Titel'));
      var left = daysLeft(p);
      info.append(el('span', '', 'Gelöscht am ' + new Date(p.deletedAt).toLocaleDateString('de-DE') + ' · ' +
        (left <= 1 ? 'wird morgen endgültig gelöscht' : 'noch ' + left + ' Tage')));
      var restore = el('button', 'btn', 'Wiederherstellen');
      restore.type = 'button';
      restore.addEventListener('click', function () {
        delete p.deletedAt;
        saveNow(p);
        renderTrash();
        toast('„' + (p.title || 'Ohne Titel') + '“ wiederhergestellt.');
      });
      var purge = el('button', 'link-btn link-btn--danger', 'Endgültig löschen');
      purge.type = 'button';
      purge.addEventListener('click', function () {
        confirmDialog('Endgültig löschen?', '„' + (p.title || 'Ohne Titel') + '“ wird mit Beat, Lizenz und Aufnahmen unwiderruflich gelöscht. Das kann nicht rückgängig gemacht werden.', 'Endgültig löschen')
          .then(function (ok) { if (ok) purgeProjects([p]).then(renderTrash); });
      });
      var actions = el('div', 'trash-actions');
      actions.append(restore, purge);
      li.append(info, actions);
      ul.append(li);
    });
    $('trashEmpty').hidden = list.length > 0;
    $('emptyTrash').hidden = !list.length;
  }

  function purgeProjects(list) {
    var ids = list.map(function (p) { return p.id; });
    projects = projects.filter(function (p) { return ids.indexOf(p.id) < 0; });
    return Promise.all(ids.map(function (id) { return RaimDB.deleteProject(id); }))
      .catch(function () { toast('Löschen fehlgeschlagen.'); });
  }

  $('openTrash').addEventListener('click', function () {
    $('home').hidden = true;
    $('trash').hidden = false;
    renderTrash();
    window.scrollTo(0, 0);
  });
  $('closeTrash').addEventListener('click', function () {
    $('trash').hidden = true;
    $('home').hidden = false;
    renderProjects();
  });
  $('emptyTrash').addEventListener('click', function () {
    var list = projects.filter(function (p) { return p.deletedAt; });
    confirmDialog('Papierkorb leeren?', list.length + (list.length === 1 ? ' Projekt wird' : ' Projekte werden') + ' unwiderruflich gelöscht. Das kann nicht rückgängig gemacht werden.', 'Endgültig löschen')
      .then(function (ok) {
        if (!ok) return;
        purgeProjects(list).then(function () { renderTrash(); toast('Papierkorb geleert.'); });
      });
  });

  $('projectTitle').addEventListener('input', function (e) { current.title = e.target.value; scheduleSave(); });
  window.addEventListener('beforeunload', function () { if (current) saveNow(); });

  // ---------- project tabs ----------
  function showTab(name) {
    var wasText = !document.querySelector('.view[data-view="text"]').hidden && document.querySelector('.tab.is-on[data-tab="text"]');
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('is-on', t.dataset.tab === name); });
    document.querySelectorAll('.view').forEach(function (v) { v.hidden = v.dataset.view !== name; });
    if (name !== 'beat') { RaimBeats.pause(); $('miniBar').hidden = true; }
    if (name === 'beat') RaimBeats.redraw();
    if (name === 'text') {
      renderSongInfo();
      if (!wasText) { collapseAll(); renderSections(); }
    }
    if (name === 'prompter') { renderPromptPick(); RaimBeats.refreshPrompter(); }
    if (name === 'rhymes') renderRhymeBlocks();
  }
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () { showTab(t.dataset.tab); window.scrollTo(0, 0); });
  });

  // ---------- text: sections editor ----------
  // Each section ("[Hook]", "[Part 1]" …) is its own collapsible card; together they make up
  // current.text. Text without headers is a single card, like a plain notepad.
  var WORD_RE = /[A-Za-zÄÖÜäöüß']+/g;
  var sections = [], collapsed = new Set(), activeTA = null, activeIdx = 0;

  // the text tab opens with every section folded; a tap on one opens it
  function collapseAll(except) {
    collapsed = new Set();
    sections.forEach(function (s, i) { if (s.name !== null && i !== except) collapsed.add(i); });
  }

  function loadSections() {
    sections = parseSections(current.text);
    collapseAll();
    activeIdx = sections.length - 1;   // nothing tapped yet: new sections go to the end
    renderSections();
  }

  // an empty song has no cards at all: writing starts by adding Intro, Hook, Part …
  function parseSections(text) {
    var secs = RaimSong.parse(text);
    return secs.length === 1 && secs[0].name === null && !secs[0].body.trim() ? [] : secs;
  }

  function syncText() {
    current.text = RaimSong.serialize(sections);
    scheduleSave();
    updateStats();
  }

  function autosize(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.max(ta.scrollHeight, 56) + 'px';
  }

  function sectionMeta(i) {
    var s = sections[i], src = RaimSong.repeatSource(sections, i);
    if (src) return 'wiederholt ' + s.name;
    var n = RaimSong.lines(s.body).length;
    return n ? n + (n === 1 ? ' Zeile' : ' Zeilen') : '';
  }

  function renderSections(focusIndex) {
    var box = $('sections');
    box.textContent = '';
    box.classList.toggle('is-empty', !sections.length);
    $('addSection').classList.toggle('is-first', !sections.length);
    if (!sections.length) box.append(el('p', 'sec-empty', 'Füge einen Abschnitt hinzu, um zu schreiben:'));
    sections.forEach(function (s, i) {
      var card = el('div', 'sec' + (s.name === null ? ' sec--plain' : '') + (sections.length === 1 ? ' sec--only' : '') + (collapsed.has(i) ? ' is-collapsed' : ''));
      card.dataset.i = i;
      if (s.name !== null) {
        var head = el('div', 'sec-head');
        var toggle = el('button', 'sec-toggle');
        toggle.type = 'button';
        toggle.setAttribute('aria-expanded', String(!collapsed.has(i)));
        toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
        toggle.append(el('strong', '', s.name), el('span', 'sec-meta', sectionMeta(i)));
        toggle.addEventListener('click', function () {
          if (collapsed.has(i)) collapsed.delete(i); else collapsed.add(i);
          renderSections();
        });
        var tools = el('span', 'sec-tools');
        [['↑', 'Nach oben', -1], ['↓', 'Nach unten', 1]].forEach(function (m) {
          var b = el('button', 'sec-tool', m[0]);
          b.type = 'button';
          b.title = m[1];
          b.disabled = i + m[2] < 0 || i + m[2] >= sections.length;
          b.addEventListener('click', function () { moveSection(i, m[2]); });
          tools.append(b);
        });
        var ren = el('button', 'sec-tool', '✎');
        ren.type = 'button';
        ren.title = 'Umbenennen';
        ren.addEventListener('click', function () {
          var name = prompt('Name des Abschnitts', s.name);
          if (name === null || !name.trim()) return;
          s.name = name.trim().replace(/[\[\]]/g, '');
          syncText();
          renderSections();
        });
        var del = el('button', 'sec-tool', '✕');
        del.type = 'button';
        del.title = 'Abschnitt entfernen';
        del.addEventListener('click', function () { removeSection(i); });
        tools.append(ren, del);
        head.append(toggle, tools);
        card.append(head);
      }
      // repeated text shows only while this section is empty; typing replaces it
      card.append(el('div', 'sec-repeat'));
      var ta = el('textarea', 'sec-text');
      ta.value = s.body;
      ta.readOnly = !may('text');
      ta.spellcheck = false;
      ta.addEventListener('input', function () {
        s.body = ta.value;
        autosize(ta);
        syncText();
        refreshRepeats();
      });
      // typing a "[Name]" line splits the section into cards
      ta.addEventListener('blur', function () {
        if (ta.value.split('\n').some(RaimSong.isHeader)) { loadSectionsFromText(); }
      });
      ta.addEventListener('focus', function () { activeTA = ta; activeIdx = i; });
      card.append(ta);
      box.append(card);
      if (!collapsed.has(i)) autosize(ta);
    });
    refreshRepeats();
    if (activeIdx >= sections.length) activeIdx = sections.length - 1;
    activeTA = box.querySelectorAll('.sec-text')[activeIdx] || null;
    if (focusIndex !== undefined && focusIndex >= 0) {
      var f = box.querySelectorAll('.sec-text')[focusIndex];
      if (f) f.focus();
    }
    $('collapseAll').hidden = !sections.some(function (s) { return s.name !== null; });
    $('collapseAll').textContent = collapsed.size ? 'Alle ausklappen' : 'Alle einklappen';
  }

  // repeat previews, placeholders, line counts and "wiederholen" buttons follow every edit
  function refreshRepeats() {
    $('sections').querySelectorAll('.sec').forEach(function (card, i) {
      var s = sections[i], cand = RaimSong.repeatCandidate(sections, i);
      var preview = card.querySelector('.sec-repeat'), ta = card.querySelector('.sec-text');
      var repeating = !!cand && !s.body.trim();
      preview.textContent = repeating ? cand.body : '';
      preview.hidden = !repeating || collapsed.has(i);
      ta.placeholder = s.name === null ? ''
        : cand ? 'Leer lassen = ' + s.name + ' von oben wiederholen. Oder eigenen Text schreiben.'
        : 'Text für ' + s.name + ' …';
      var meta = card.querySelector('.sec-meta');
      if (meta) meta.textContent = sectionMeta(i);
    });
    document.querySelectorAll('[data-add^="repeat:"]').forEach(function (b) {
      var name = b.dataset.add.slice(7).toLowerCase();
      b.hidden = !sections.some(function (s) { return (s.name || '').toLowerCase() === name && s.body.trim(); });
    });
  }

  function loadSectionsFromText() {
    current.text = RaimSong.serialize(sections);
    sections = parseSections(current.text);
    collapsed = new Set();
    activeIdx = 0;
    renderSections();
    syncText();
  }

  function activeIndex() { return Math.min(activeIdx, sections.length - 1); }

  function addSection(kind) {
    var repeat = kind.indexOf('repeat:') === 0, name = repeat ? kind.slice(7) : kind;
    if (kind === 'Part') {
      var parts = sections.filter(function (s) { return /^part\b/i.test(s.name || ''); }).length;
      name = 'Part ' + (parts + 1);
    }
    var at = activeIndex() + 1;
    sections.splice(at, 0, { name: name, body: '' });
    activeIdx = at;
    collapseAll(at);
    syncText();
    renderSections(repeat ? -1 : at);
  }
  document.querySelectorAll('[data-add]').forEach(function (b) {
    b.addEventListener('click', function () { addSection(b.dataset.add); });
  });

  function moveSection(i, d) {
    var s = sections.splice(i, 1)[0];
    sections.splice(i + d, 0, s);
    activeIdx = i + d;
    collapseAll(i + d);
    syncText();
    renderSections();
  }

  function removeSection(i) {
    var s = sections[i];
    var go = function () {
      sections.splice(i, 1);
      collapseAll();
      activeIdx = Math.max(0, i - 1);
      syncText();
      renderSections();
    };
    if (!s.body.trim()) return go();
    confirmDialog('Abschnitt entfernen?', '„' + s.name + '“ mit ' + RaimSong.lines(s.body).length + ' Zeilen wird aus dem Song entfernt.', 'Entfernen')
      .then(function (ok) { if (ok) go(); });
  }

  // ---------- reading view: rhyme scheme and comments ----------
  // "Lesen" shows the song with rhyming words in the same colour (line ends and inside the lines)
  // and the end-rhyme scheme (A, B, A, B). With an account, a tap on a line opens its comments.
  var textMode = 'write', comments = [], openThread = null;
  var RHYME_COLORS = ['#5ee7ff', '#ff7ad9', '#ffd166', '#8fff9f', '#ff9b6b', '#b59bff', '#7aa8ff', '#ff6b8a'];
  // small words that rhyme with everything and would only add noise inside lines
  var STOP = new Set(('ich mich dich sich mir dir wir ihr er sie es und oder der die das den dem des ein eine einen einem ' +
    'einer nicht ist bin bist sind hat hab habe zu in im an am auf mit von vom so wie was wo da du man mein meine dein deine ' +
    'sein seine noch nur auch schon doch ja nein the a an i you to and me my is it of on').split(' '));
  var WORD = /([\p{L}'’]+)/u;
  // last stressed vowel(s) and the consonants at the end: "Nacht", "Macht", "lacht" share "a|Xt"
  function soundKey(word) {
    var t = engine.wordT(word, current.lang, rhymeLangs()).t, v = t.v, n = v.length;
    if (!n) return '';
    var k = n - 1;
    if ('aeiouöüAYW'.indexOf(v[k]) < 0 && k > 0) k--;
    return v.slice(k).join('') + '|' + (t.cons[n] || '');
  }

  function setTextMode(m) {
    textMode = m;
    document.querySelectorAll('[data-textmode]').forEach(function (b) { b.classList.toggle('is-on', b.dataset.textmode === m); });
    $('project').classList.toggle('mode-read', m === 'read');
    $('readView').hidden = m !== 'read';
    if (m === 'read') {
      openThread = null;
      renderReadView();
      whenReady(function () { if (textMode === 'read') renderReadView(); });
      loadComments();
    } else {
      renderSections();
    }
  }
  document.querySelectorAll('[data-textmode]').forEach(function (b) {
    b.addEventListener('click', function () { setTextMode(b.dataset.textmode); });
  });

  function renderReadView() {
    var box = $('readView');
    box.textContent = '';
    if (!sections.length) { box.append(el('p', 'empty', 'Noch kein Text – schreib unter „Schreiben“ deinen ersten Abschnitt.')); return; }
    var placed = new Set();
    sections.forEach(function (s, si) {
      var card = el('div', 'read-sec');
      if (s.name !== null) card.append(el('h3', 'read-name', s.name));
      var lines = s.body.split('\n');
      if (!s.body.trim()) {
        card.append(el('p', 'read-repeat', 'wiederholt den Abschnitt „' + s.name + '“ von oben'));
        box.append(card);
        return;
      }
      // rhyme groups of this section. Line ends with the same rhyme vowels form the scheme (A, B …)
      // and share a colour; inside the lines, multi-syllable words with those vowels join that colour,
      // other words that rhyme purely with each other ("Macht", "lacht") get their own colour.
      var tokens = lines.map(function (l) { return l.split(WORD); });
      var endKeys = [], endCount = {}, pure = {};
      tokens.forEach(function (tk, li) {
        var idx = [];
        for (var i = 1; i < tk.length; i += 2) idx.push(i);
        var last = idx.length ? tk[idx[idx.length - 1]] : '';
        endKeys[li] = last ? rhymeKey(last) : '';
        if (endKeys[li]) endCount[endKeys[li]] = (endCount[endKeys[li]] || 0) + 1;
        idx.forEach(function (i, wi) {
          var lw = tk[i].toLowerCase(), end = wi === idx.length - 1;
          if (lw.length < 2 || (!end && (lw.length < 3 || STOP.has(lw)))) return;
          var key = soundKey(tk[i]);
          if (key) (pure[key] = pure[key] || new Set()).add(lw);
        });
      });
      var colorOf = {}, n = 0;
      function pick(k) { return colorOf[k] || (colorOf[k] = RHYME_COLORS[n++ % RHYME_COLORS.length]); }
      var letters = {}, next = 0, endColor = {};
      lines.forEach(function (l, li) {
        var k = endKeys[li];
        if (!l.trim() || !k) return;
        if (!letters[k]) letters[k] = String.fromCharCode(65 + (next++ % 26));
      });
      function wordColor(word, isEnd) {
        var vk = rhymeKey(word);
        if (isEnd && endCount[vk] > 1) return pick('E' + vk);
        if (!isEnd && vk.length > 1 && endCount[vk] > 1) return pick('E' + vk);
        var key = soundKey(word);
        return key && pure[key] && pure[key].size > 1 ? pick('P' + key) : '';
      }
      lines.forEach(function (l, li) {
        if (!l.trim()) { card.append(el('div', 'read-gap')); return; }
        var row = el('div', 'read-line'), text = el('span', 'read-text'), tk = tokens[li];
        var lastIdx = -1;
        for (var i = 1; i < tk.length; i += 2) lastIdx = i;
        tk.forEach(function (part, i) {
          if (i % 2 === 0) { if (part) text.append(document.createTextNode(part)); return; }
          var lw = part.toLowerCase(), end = i === lastIdx;
          var c = (end || (lw.length >= 3 && !STOP.has(lw))) ? wordColor(part, end) : '';
          var span = el('span', 'rw' + (end ? ' is-end' : ''), part);
          if (c) { span.classList.add('is-rhyme'); span.style.setProperty('--c', c); if (end) endColor[li] = c; }
          text.append(span);
        });
        var scheme = el('span', 'read-scheme', letters[endKeys[li]] || '');
        if (endColor[li]) scheme.style.color = endColor[li];
        row.append(text, scheme);
        var mine = commentsAt(s, si, li, lines);
        mine.forEach(function (c) { placed.add(c.id); });
        if (account) {
          var bubble = el('span', 'read-bubble' + (mine.length ? ' has' : ''), mine.length ? String(mine.length) : '+');
          bubble.title = mine.length ? mine.length + (mine.length === 1 ? ' Kommentar' : ' Kommentare') : 'Kommentieren';
          row.append(bubble);
          row.classList.add('can-comment');
          row.addEventListener('click', function () {
            openThread = openThread === si + ':' + li ? null : si + ':' + li;
            renderReadView();
          });
        }
        card.append(row);
        if (openThread === si + ':' + li) card.append(threadBox(s, li, l, mine));
      });
      box.append(card);
    });
    // comments whose line no longer exists
    var lost = comments.filter(function (c) { return !placed.has(c.id); });
    if (lost.length) {
      var old = el('div', 'read-sec read-lost');
      old.append(el('h3', 'read-name', 'Kommentare zu geänderten Zeilen'));
      lost.forEach(function (c) { old.append(commentItem(c, '„' + c.line + '“')); });
      box.append(old);
    }
    if (!account) box.append(el('p', 'hint', 'Mit einem Account kannst du hier Zeilen kommentieren – auch deine Feature-Partner.'));
  }

  // comments of one line: same section and same line text; if the text appears more than once,
  // the line with the original line number (else the first one)
  function commentsAt(s, si, li, lines) {
    var text = lines[li].trim();
    return comments.filter(function (c) {
      if ((c.section || '') !== (s.name || '') || c.line !== text) return false;
      var hits = [];
      lines.forEach(function (l, i) { if (l.trim() === text) hits.push(i); });
      return hits.indexOf(c.line_no) >= 0 ? li === c.line_no : li === hits[0];
    });
  }

  function commentItem(c, quote) {
    var item = el('div', 'comment');
    var head = el('div', 'comment-head');
    head.append(el('strong', '', c.author === (account && account.id) ? 'Du' : c.author_name || 'Jemand'),
      el('span', '', new Date(c.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })));
    if (account && (c.author === account.id || !current._owner)) {
      var del = el('button', 'link-btn', 'Löschen');
      del.type = 'button';
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        RaimCloud.deleteComment(c.id).then(loadComments, function (err) { toast(RaimCloud.message(err)); });
      });
      head.append(del);
    }
    item.append(head);
    if (quote) item.append(el('p', 'comment-quote', quote));
    item.append(el('p', 'comment-body', c.body));
    return item;
  }

  function threadBox(s, li, line, list) {
    var box = el('div', 'thread');
    box.addEventListener('click', function (e) { e.stopPropagation(); });
    list.forEach(function (c) { box.append(commentItem(c)); });
    var form = el('form', 'thread-form'), input = el('input');
    input.placeholder = list.length ? 'Antworten …' : 'Kommentar zu dieser Zeile …';
    input.maxLength = 500;
    var send = el('button', 'btn btn--primary btn--small', 'Senden');
    send.type = 'submit';
    form.append(input, send);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var body = input.value.trim();
      if (!body) return;
      if (!RaimCloud.online()) { toast('Offline – Kommentare gehen nur mit Internet.'); return; }
      send.disabled = true;
      RaimCloud.addComment({
        owner: current._owner || account.id, project_id: current.id, section: s.name || '', line: line.trim(), line_no: li, body: body,
        author_name: profile.artist || profile.name || account.email
      }).then(loadComments, function (err) { send.disabled = false; toast(RaimCloud.message(err)); });
    });
    box.append(form);
    setTimeout(function () { input.focus(); }, 0);
    return box;
  }

  function renderCommentCount() {
    var c = $('commentCount');
    c.textContent = String(comments.length);
    c.hidden = !comments.length;
  }
  function loadComments() {
    if (!account || !current || !RaimCloud.online()) { comments = []; renderCommentCount(); return Promise.resolve(); }
    var p = current;
    return RaimCloud.comments(p._owner || account.id, p.id).then(function (list) {
      if (current !== p) return;
      comments = list.sort(function (a, b) { return a.created_at < b.created_at ? -1 : 1; });
      renderCommentCount();
      if (textMode === 'read') renderReadView();
    }, function () { /* no comments table yet */ });
  }

  $('collapseAll').addEventListener('click', function () {
    if (collapsed.size) collapsed = new Set();
    else sections.forEach(function (s, i) { if (s.name !== null) collapsed.add(i); });
    renderSections();
  });

  function updateStats() {
    var lines = RaimSong.lines(current.text), words = (lines.join(' ').match(WORD_RE) || []).length;
    $('textStats').textContent = lines.length ? lines.length + ' Zeilen · ' + words + ' Wörter' : '';
  }

  // ---------- teleprompter: which sections to show ----------
  // null = whole song, otherwise a Set of section positions
  var promptPick = null;

  function renderPromptPick() {
    var secs = RaimSong.expand(RaimSong.parse(current.text)), box = $('secPick');
    var named = secs.some(function (s) { return s.name !== null; });
    $('secPickBlock').hidden = !named;
    box.textContent = '';
    if (!named) { promptPick = null; return; }
    if (promptPick) {
      promptPick.forEach(function (i) { if (i >= secs.length) promptPick.delete(i); });
      if (!promptPick.size) promptPick = null;
    }
    function chip(label, on, onClick) {
      var c = el('button', 'chip chip--pick' + (on ? ' is-on' : ''), label);
      c.type = 'button';
      c.setAttribute('aria-pressed', String(on));
      c.addEventListener('click', onClick);
      box.append(c);
    }
    chip('Ganzer Song', !promptPick, function () { promptPick = null; renderPromptPick(); });
    // number sections that appear more than once: "Hook 1", "Hook 2"
    var total = {}, seen = {};
    secs.forEach(function (s) { var k = (s.name || '').toLowerCase(); total[k] = (total[k] || 0) + 1; });
    secs.forEach(function (s, i) {
      var k = (s.name || '').toLowerCase();
      seen[k] = (seen[k] || 0) + 1;
      var label = s.name === null ? 'Anfang' : s.name + (total[k] > 1 && !/\d$/.test(s.name) ? ' ' + seen[k] : '');
      if (!RaimSong.lines(s.body).length) label += ' (leer)';
      chip(label, !!promptPick && promptPick.has(i), function () {
        if (!promptPick) promptPick = new Set();
        if (promptPick.has(i)) promptPick.delete(i); else promptPick.add(i);
        if (!promptPick.size) promptPick = null;
        renderPromptPick();
      });
    });
  }

  // ---------- PDF export ----------
  var JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

  // the standard PDF fonts only know Latin-1 plus a few typographic signs
  function pdfSafe(t) {
    return t.replace(/[^\u0000-\u00ff„“”‘’‚–—…€]/g, '').replace(/\t/g, '    ');
  }

  function exportPdf() {
    var p = current;
    $('exportPdf').disabled = true;
    loadScript(JSPDF_URL).then(function () {
      var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
      var W = 210, M = 20, y = 0, maxW = W - 2 * M;
      function page() { y = 22; }
      function need(h) { if (y + h > 280) { doc.addPage(); page(); } }

      // header band
      doc.setFillColor(42, 21, 146);
      doc.rect(0, 0, W, 34, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.text(pdfSafe(p.title || 'Ohne Titel'), M, 17);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(pdfSafe('Songtext · ' + langsText(p) + ' · Stand ' + new Date().toLocaleDateString('de-DE')), M, 26);
      y = 46;

      // song facts only: no beat, producer or license in the PDF
      var info = [];
      if (p.genres.length) info.push([p.genres.length > 1 ? 'Genres' : 'Genre', p.genres.join(', ')]);
      if (songBpm(p)) info.push(['BPM', songBpm(p)]);
      if (songKey(p)) info.push(['Tonart', songKey(p)]);
      if (p.topic) info.push(['Thema', p.topic]);
      if (info.length) {
        doc.setFontSize(10);
        info.forEach(function (row) {
          doc.setTextColor(120, 110, 160);
          doc.text(row[0], M, y);
          doc.setTextColor(30, 25, 60);
          doc.text(doc.splitTextToSize(pdfSafe(String(row[1])), maxW - 30)[0], M + 30, y);
          y += 6;
        });
        doc.setDrawColor(210, 205, 235);
        doc.line(M, y, W - M, y);
        y += 10;
      }

      // lyrics, repeats written out
      RaimSong.expand(RaimSong.parse(p.text)).forEach(function (sec) {
        if (sec.name !== null) {
          need(16);
          y += 3;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(90, 54, 232);
          doc.text(pdfSafe(sec.name.toUpperCase() + (sec.repeated ? '  (WIEDERHOLUNG)' : '')), M, y);
          y += 7;
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12.5);
        doc.setTextColor(20, 16, 40);
        sec.body.split('\n').forEach(function (line) {
          if (!line.trim()) { y += 4; return; }
          doc.splitTextToSize(pdfSafe(line), maxW).forEach(function (part) {
            need(7);
            doc.text(part, M, y);
            y += 6.6;
          });
        });
        y += 5;
      });

      var pages = doc.getNumberOfPages();
      for (var i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(150, 145, 175);
        doc.text('Erstellt mit Barbook', M, 290);
        doc.text('Seite ' + i + ' von ' + pages, W - M, 290, { align: 'right' });
      }
      var a = el('a');
      a.href = URL.createObjectURL(doc.output('blob'));
      a.download = fileName(p.title || 'Songtext') + '.pdf';
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }).catch(function () {
      toast('PDF konnte nicht erstellt werden. Bist du online? (Der PDF-Baustein wird beim ersten Mal geladen.)');
    }).then(function () { $('exportPdf').disabled = false; });
  }
  $('exportPdf').addEventListener('click', exportPdf);

  // ---------- song infos (asked when a project is created, editable from the text tab) ----------
  var LANGS = [
    ['de', 'Deutsch'], ['en', 'Englisch'], ['tr', 'Türkisch'], ['ar', 'Arabisch'], ['fr', 'Französisch'], ['es', 'Spanisch'],
    ['it', 'Italienisch'], ['pt', 'Portugiesisch'], ['pl', 'Polnisch'], ['ru', 'Russisch'], ['uk', 'Ukrainisch'], ['sq', 'Albanisch'],
    ['ku', 'Kurdisch'], ['bks', 'Bosnisch/Kroatisch/Serbisch'], ['el', 'Griechisch'], ['ro', 'Rumänisch'], ['nl', 'Niederländisch'],
    ['fa', 'Persisch'], ['other', 'Andere']
  ];
  var GENRES = ['Deutschrap / Hip-Hop', 'Trap', 'Drill', 'Boom Bap', 'Cloud Rap', 'Emo Rap', 'R&B', 'Pop', 'Afro / Dancehall',
    'Latin / Reggaeton', 'Rock / Punk', 'Elektro', 'Andere'];
  function langName(code) { var x = LANGS.filter(function (l) { return l[0] === code; })[0]; return x ? x[1] : code; }
  // "Deutsch + Englisch"
  function langsText(p) { return p.langs.map(langName).join(' + '); }
  // the song's main language for rhymes: the first one it is in
  function rhymeLang(langs) { return langs.filter(function (l) { return l !== 'other'; })[0] || 'de'; }

  function songBpm(p) { return p.bpm || p.license.bpm || ''; }
  function songKey(p) { return keyName(p.key && p.key !== 'unbekannt' ? p.key : p.license.key || ''); }

  // Keys are stored in German ("Fis-Moll") and shown in the chosen style:
  // de "Fis-Moll", en "F# Minor", short "F#m"
  var keyStyle = 'de';
  try { keyStyle = localStorage.getItem('raim.keyStyle') || 'de'; } catch (e) { /* private mode */ }
  function keyName(k) {
    var de = k && RaimLicenseReader.germanKey(k);
    if (!de) return k || '';
    var m = de.match(/^([A-H])(is|es|s)?-(Moll|Dur)$/), minor = m[3] === 'Moll';
    if (keyStyle === 'de') return de;
    var note = m[1] === 'H' ? 'B' : m[1] === 'B' ? 'Bb' : m[1];
    if (m[2] === 'is') note += '#';
    else if (m[2]) note += 'b';
    if (keyStyle === 'short') return note + (minor ? 'm' : '');
    return note + (minor ? ' Minor' : ' Major');
  }
  function renderKeyStyle() {
    document.querySelectorAll('[data-key-style]').forEach(function (b) { b.classList.toggle('is-on', b.dataset.keyStyle === keyStyle); });
    [].forEach.call($('infoForm').elements.key.options, function (o) {
      if (o.value && o.value !== 'unbekannt') o.textContent = keyName(o.value);
    });
  }
  document.querySelectorAll('[data-key-style]').forEach(function (b) {
    b.addEventListener('click', function () {
      keyStyle = b.dataset.keyStyle;
      try { localStorage.setItem('raim.keyStyle', keyStyle); } catch (e) { /* private mode */ }
      renderKeyStyle();
      if (current) renderSongInfo();
      renderProjects();
    });
  });
  // ["Trap", "140 BPM", "A-Moll"]
  function songFacts(p) {
    var out = [];
    if (p.genres.length) out.push(p.genres.join(' / '));
    if (songBpm(p)) out.push(songBpm(p) + ' BPM');
    if (songKey(p)) out.push(songKey(p));
    return out;
  }
  // one line for the AI prompt
  function songInfoForAi(p) {
    var parts = songFacts(p).slice();
    if (p.topic) parts.push('Thema: ' + p.topic);
    return parts.join(', ');
  }

  // the song facts show as the gear's tooltip ("Projekteinstellungen – Pop · 86 BPM · F-Dur · Deutsch")
  function renderSongInfo() {
    var facts = songFacts(current);
    facts.push(langsText(current));
    $('projectSettings').title = 'Projekteinstellungen – ' + facts.join(' · ');
  }

  // key options: all 24 keys plus "unknown"
  (function () {
    var sel = $('infoForm').elements.key;
    sel.append(new Option('– wählen –', ''));
    RaimAnalyze.KEYS.forEach(function (k) { sel.append(new Option(k, k)); });
    sel.append(new Option('Weiß ich nicht', 'unbekannt'));
    renderKeyStyle();
  })();

  var infoProject = null, infoBeat = null, infoAuto = {}, infoSeq = 0, infoGenres = [], infoLangs = [];

  // multi-select chips for genres and languages
  function renderPicks(boxId, options, picked, onChange) {
    var box = $(boxId);
    box.textContent = '';
    options.forEach(function (o) {
      var value = Array.isArray(o) ? o[0] : o, label = Array.isArray(o) ? o[1] : o;
      var c = el('button', 'chip chip--pick' + (picked.indexOf(value) >= 0 ? ' is-on' : ''), label);
      c.type = 'button';
      c.setAttribute('aria-pressed', String(picked.indexOf(value) >= 0));
      c.addEventListener('click', function () {
        var i = picked.indexOf(value);
        if (i >= 0) picked.splice(i, 1); else picked.push(value);
        $('infoError').hidden = true;
        renderPicks(boxId, options, picked, onChange);
        if (onChange) onChange();
      });
      box.append(c);
    });
  }

  // p = null: new project; otherwise edit that project's infos
  function openInfo(p) {
    infoProject = p;
    infoBeat = null;
    infoAuto = {};
    var f = $('infoForm');
    f.reset();
    $('infoTitle').textContent = p ? 'Projekteinstellungen' : 'Neues Projekt';
    $('infoIntro').hidden = !!p;
    $('infoBeatField').hidden = !!p;
    $('infoSubmit').textContent = p ? 'Speichern' : 'Projekt anlegen';
    $('infoBeatName').textContent = 'Beat hochladen (MP3, WAV, M4A …)';
    $('infoAnalyze').hidden = true;
    $('infoError').hidden = true;
    infoGenres = p ? p.genres.slice() : [];
    infoLangs = p ? p.langs.slice() : ['de'];
    if (p) {
      f.elements.title.value = p.title;
      f.elements.bpm.value = songBpm(p);
      setKeyValue(p.key || p.license.key || '');
      f.elements.topic.value = p.topic || '';
    }
    renderPicks('infoGenres', GENRES, infoGenres);
    renderPicks('infoLangs', LANGS, infoLangs);
    renderInfoFeatures(p);
    var locked = !!(p && p._owner && !(p._rights && p._rights.info));
    [].forEach.call(f.elements, function (x) { if (x.id !== 'infoCancel' && x.id !== 'infoClose') x.disabled = locked; });
    $('infoSubmit').hidden = locked;
    $('infoCancel').textContent = locked ? 'Schließen' : 'Abbrechen';
    $('infoTitle').textContent = locked ? 'Projekteinstellungen (nur ansehen)' : $('infoTitle').textContent;
    $('infoDlg').showModal();
    if (!p) f.elements.title.focus();
  }

  function setKeyValue(k) {
    var sel = $('infoForm').elements.key;
    k = RaimLicenseReader.germanKey(k) || k;
    if (k && ![].some.call(sel.options, function (o) { return o.value === k; })) sel.append(new Option(keyName(k), k));
    sel.value = k;
  }

  function closeInfo() { infoSeq++; $('infoDlg').close(); }
  $('infoClose').addEventListener('click', closeInfo);
  $('infoCancel').addEventListener('click', closeInfo);
  $('infoNoBeat').addEventListener('change', function (e) {
    $('infoDrop').classList.toggle('is-off', e.target.checked);
  });

  // beat chosen: read BPM and key from the file name, otherwise from the audio
  function takeInfoBeat(file) {
    if (!file) return;
    if (!/^audio\//.test(file.type) && !/\.(mp3|wav|m4a|aac|ogg|flac|aiff?)$/i.test(file.name)) { toast('Bitte eine Audiodatei wählen.'); return; }
    infoBeat = file;
    $('infoNoBeat').checked = false;
    $('infoDrop').classList.remove('is-off');
    $('infoBeatName').textContent = file.name;
    var f = $('infoForm'), seq = ++infoSeq;
    if (!f.elements.title.value.trim() || infoAuto.title) {
      f.elements.title.value = file.name.replace(/\.\w+$/, '').replace(/[_]+/g, ' ')
        .replace(/\s*[-–(\[]?\s*\d{2,3}\s*bpm.*$/i, '').replace(/\s*[-–]\s*$/, '').trim();
      infoAuto.title = true;
    }
    var fromName = RaimLicenseReader.fromText('', file.name);
    var setBpm = function (v) { if (v && (!f.elements.bpm.value || infoAuto.bpm)) { f.elements.bpm.value = v; infoAuto.bpm = true; } };
    var setKey = function (v) { if (v && (!f.elements.key.value || infoAuto.key)) { setKeyValue(v); infoAuto.key = true; } };
    setBpm(fromName.bpm);
    setKey(fromName.key);
    if (fromName.bpm && fromName.key) { $('infoAnalyze').textContent = 'BPM und Tonart aus dem Dateinamen übernommen.'; $('infoAnalyze').hidden = false; return; }
    $('infoAnalyze').textContent = 'Analysiere Beat (BPM und Tonart) …';
    $('infoAnalyze').hidden = false;
    var AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    file.arrayBuffer().then(function (buf) {
      return new AC(1, 44100, 44100).decodeAudioData(buf);
    }).then(function (audio) {
      // let the message paint before the heavy analysis
      return new Promise(function (r) { setTimeout(function () { r(audio); }, 30); });
    }).then(function (audio) {
      if (seq !== infoSeq) return;
      if (!fromName.bpm) setBpm(String(RaimAnalyze.bpm(audio)));
      if (!fromName.key) setKey(RaimAnalyze.key(audio));
      $('infoAnalyze').textContent = 'BPM und Tonart aus dem Beat erkannt – bitte kurz prüfen.';
    }).catch(function () {
      if (seq !== infoSeq) return;
      $('infoAnalyze').textContent = 'Der Beat konnte nicht analysiert werden. Trag BPM und Tonart bitte selbst ein.';
    });
  }
  $('infoBeat').addEventListener('change', function (e) { takeInfoBeat(e.target.files[0]); e.target.value = ''; });
  var infoDrop = $('infoDrop');
  infoDrop.addEventListener('dragover', function (e) { e.preventDefault(); infoDrop.classList.add('is-over'); });
  infoDrop.addEventListener('dragleave', function () { infoDrop.classList.remove('is-over'); });
  infoDrop.addEventListener('drop', function (e) { e.preventDefault(); infoDrop.classList.remove('is-over'); takeInfoBeat(e.dataTransfer.files[0]); });
  ['bpm', 'key', 'title'].forEach(function (n) {
    $('infoForm').elements[n].addEventListener('input', function () { infoAuto[n] = false; });
  });
  // the "please fill in" note goes away as soon as something changes
  $('infoForm').addEventListener('input', function () { $('infoError').hidden = true; });
  $('infoForm').addEventListener('change', function () { $('infoError').hidden = true; });

  $('infoForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = $('infoForm'), v = {};
    ['title', 'bpm', 'key', 'topic'].forEach(function (n) { v[n] = f.elements[n].value.trim(); });
    var bpm = parseFloat(v.bpm.replace(',', '.')), missing = [];
    if (!infoProject && !infoBeat && !$('infoNoBeat').checked) missing.push('Beat hochladen (oder „Ohne Beat-Datei“ ankreuzen)');
    if (!(bpm >= 40 && bpm <= 250)) missing.push('BPM (40–250)');
    if (!v.key) missing.push('Tonart');
    if (!infoGenres.length) missing.push('Genre');
    if (!infoLangs.length) missing.push('Sprache');
    if (missing.length) {
      $('infoError').textContent = 'Bitte noch eintragen: ' + missing.join(', ') + '.';
      $('infoError').hidden = false;
      return;
    }
    v.bpm = String(Math.round(bpm * 100) / 100);
    var p = infoProject || RaimDB.newProject('');
    p.title = v.title;
    p.bpm = v.bpm;
    p.key = v.key;
    // keep the order of the lists, not the click order
    p.genres = GENRES.filter(function (g) { return infoGenres.indexOf(g) >= 0; });
    p.langs = LANGS.map(function (l) { return l[0]; }).filter(function (l) { return infoLangs.indexOf(l) >= 0; });
    p.lang = rhymeLang(p.langs);
    p.topic = v.topic;
    p.updated = Date.now();
    var featureChange = applyFeatures(p);
    var beat = infoBeat;
    $('infoSubmit').disabled = true;
    (beat ? RaimDB.putFile(p.id, beat) : Promise.resolve(null)).then(function (fileId) {
      if (fileId) p.beat = { fileId: fileId, name: beat.name };
      return saveNow(p);
    }).then(function () {
      if (featureChange) syncFeatures(p, featureChange);
      $('infoDlg').close();
      if (infoProject) {
        if (current === p) {
          $('projectTitle').value = p.title;
          $('bpmInput').value = p.bpm;
          $('bpmInput').dispatchEvent(new Event('input'));
          renderSongInfo();
          renderRhymeLangs();
          if ($('searchInput').value.trim().length >= 2) runSearch(false);
        }
        toast('Song-Infos gespeichert.');
      } else {
        projects.push(p);
        openProject(p);
      }
    }).catch(function () { toast('Projekt konnte nicht gespeichert werden – Speicher voll?'); })
      .then(function () { $('infoSubmit').disabled = false; });
  });

  // change the active card's text and keep everything in sync
  function setActiveValue(value, caret) {
    var ta = activeTA;
    ta.value = value;
    ta.selectionStart = ta.selectionEnd = caret;
    ta.focus();
    ta.dispatchEvent(new Event('input'));
  }

  // ---------- KI-Ideen ----------
  // First ask what for: continue at the caret, or a new Intro/Hook/Part/Bridge/Outro for the song.
  var AI_LEN = { continue: 2, Intro: 4, Hook: 8, Part: 16, Bridge: 4, Outro: 4 };
  var aiKind = 'continue', aiProposal = null, aiBusy = false, aiReq = null;
  // "eine neue Hook, die … Sie", "einen neuen Part, der … Er", "ein neues Intro, das … Es"
  var AI_GRAMMAR = {
    Intro: ['ein neues Intro', 'das', 'Es'], Hook: ['eine neue Hook', 'die', 'Sie'], Part: ['einen neuen Part', 'der', 'Er'],
    Bridge: ['eine neue Bridge', 'die', 'Sie'], Outro: ['ein neues Outro', 'das', 'Es']
  };

  function sectionLabel(i) {
    var s = sections[i];
    return s ? s.name || 'Text' : '';
  }

  function setAiKind(kind) {
    var canContinue = sections.length > 0;
    if (kind === 'continue' && !canContinue) kind = 'Intro';
    aiKind = kind;
    document.querySelectorAll('[data-kind]').forEach(function (b) {
      b.classList.toggle('is-on', b.dataset.kind === kind);
      b.disabled = b.dataset.kind === 'continue' && !canContinue;
    });
    $('aiLen').value = AI_LEN[kind];
    $('aiRhymeLabel').hidden = kind !== 'continue';
    var here = sectionLabel(activeIndex());
    $('aiKindHint').textContent = kind === 'continue'
      ? 'Claude liest deinen ganzen Text und schreibt an der Stelle deines Cursors im Abschnitt „' + here + '“ weiter.'
      : 'Claude liest deinen ganzen Text und schreibt ' + AI_GRAMMAR[kind][0] + ', ' + AI_GRAMMAR[kind][1] + ' dazu passt. ' +
        AI_GRAMMAR[kind][2] + ' kommt als eigener Abschnitt ' + (sections.length ? 'nach „' + here + '“.' : 'in deinen Song.');
  }
  document.querySelectorAll('[data-kind]').forEach(function (b) {
    b.addEventListener('click', function () { setAiKind(b.dataset.kind); });
  });

  function openAiSetup() {
    hideAi();
    $('aiSetup').hidden = false;
    $('aiGo').hidden = true;
    setAiKind(sections.length ? aiKind : 'Intro');
  }
  function closeAiSetup() {
    $('aiSetup').hidden = true;
    $('aiGo').hidden = false;
  }
  $('aiSetupCancel').addEventListener('click', closeAiSetup);

  function hideAi() {
    closeAiSetup();
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

  // the song split at the end of the caret's line (repeats filled in): what continued lines go between
  function songAroundCaret() {
    if (!sections.length) return { before: '', after: '' };
    var ta = activeTA, i = activeIndex();
    var v = ta ? ta.value : sections[i].body, nl = ta ? v.indexOf('\n', ta.selectionStart) : -1;
    var head = nl < 0 ? v : v.slice(0, nl), tail = nl < 0 ? '' : v.slice(nl + 1);
    var all = RaimSong.expand(sections);
    var before = all.slice(0, i).concat([{ name: sections[i].name, body: head }]);
    var after = (tail.trim() ? [{ name: null, body: tail }] : []).concat(all.slice(i + 1));
    return { before: RaimSong.serialize(before), after: RaimSong.serialize(after) };
  }

  function runAi(again) {
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
      var p = current, req = again && aiReq ? aiReq : null;
      if (!req) {
        req = { kind: aiKind, lineCount: parseInt($('aiLen').value, 10), langs: p.langs.map(langName), info: songInfoForAi(p), apiKey: key };
        if (req.kind === 'continue') {
          var around = songAroundCaret(), lines = RaimSong.lines(around.before);
          var lastWords = lines.length ? lines[lines.length - 1].match(WORD_RE) : null;
          req.before = around.before;
          req.after = around.after;
          req.rhymeWord = $('aiRhymeEnd').checked && lastWords ? lastWords[lastWords.length - 1] : '';
          req.rhymeHints = [];
          if (req.rhymeWord && rhymeLangs().every(function (l) { return engine.ready(l); })) {
            // the project's saved words go first when they rhyme
            var found = searchRhymes(req.rhymeWord, 15).results.map(function (h) { return h.word; });
            var hints = p.rhymes.saved.filter(function (w) { return found.indexOf(w) >= 0; }).concat(found);
            req.rhymeHints = hints.filter(function (w, i) { return hints.indexOf(w) === i; }).slice(0, 15);
          }
        } else {
          req.before = RaimSong.serialize(RaimSong.expand(sections));
        }
        req.at = sections.length ? activeIndex() : -1;
      }
      req.apiKey = key;
      aiReq = req;
      closeAiSetup();

      aiBusy = true;
      $('aiGo').disabled = true;
      $('aiMsg').hidden = true;
      $('aiResult').hidden = false;
      var box = $('aiLines');
      box.textContent = '';
      box.classList.add('is-loading');
      box.append(el('p', '', req.kind === 'continue' ? 'Claude schreibt weiter …' : 'Claude schreibt ' + (req.kind === 'Hook' ? 'eine Hook' : req.kind === 'Part' ? 'einen Part' : req.kind === 'Bridge' ? 'eine Bridge' : 'ein ' + req.kind) + ' …'));
      setAiButtons(false);
      $('aiAccept').lastChild.textContent = req.kind === 'continue' ? 'Übernehmen' : 'Als ' + req.kind + ' einfügen';

      RaimAI.suggest(req)
        .then(function (out) {
          if (current !== p) return;
          aiProposal = out;
          box.classList.remove('is-loading');
          box.textContent = '';
          if (req.kind !== 'continue') box.append(el('h4', 'ai-kind', req.kind));
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

  $('aiGo').addEventListener('click', openAiSetup);
  $('aiStart').addEventListener('click', function () { runAi(false); });
  $('aiRetry').addEventListener('click', function () { runAi(true); });
  $('aiDiscard').addEventListener('click', hideAi);
  $('aiAccept').addEventListener('click', function () {
    if (!aiProposal || !aiReq) return;
    var lines = aiProposal, req = aiReq;
    hideAi();
    if (req.kind !== 'continue') {
      // a new section after the one that was active when asking
      var name = req.kind;
      if (name === 'Part') name = 'Part ' + (sections.filter(function (s) { return /^part\b/i.test(s.name || ''); }).length + 1);
      var at = Math.min(req.at + 1, sections.length);
      sections.splice(at, 0, { name: name, body: lines.join('\n') });
      activeIdx = at;
      collapseAll(at);
      syncText();
      renderSections(at);
      return;
    }
    if (!activeTA) return;
    var ta = activeTA, v = ta.value, nl = v.indexOf('\n', ta.selectionStart);
    var pos = nl < 0 ? v.length : nl;
    var ins = (v.slice(0, pos).trim() ? '\n' : '') + lines.join('\n');
    setActiveValue(v.slice(0, pos) + ins + v.slice(pos), pos + ins.length);
  });

  // ---------- license ----------
  // Saved license shows as a slim bar that expands to the details; editing happens in a form
  // whose changes (fields and file) only apply on "Speichern".
  var LICENSE_FIELDS = ['producer', 'type', 'bpm', 'key', 'date', 'notes'];
  var licenseUrl = null, licenseEditing = false, licenseDraft = null;

  function hasLicense(l) {
    return !!l.fileId || LICENSE_FIELDS.some(function (k) { return (l[k] || '').trim(); });
  }

  function fillLicense() {
    licenseEditing = false;
    renderLicense();
  }

  function renderLicense() {
    var l = current.license, has = hasLicense(l);
    $('licenseForm').hidden = !licenseEditing;
    $('licenseAdd').hidden = licenseEditing || has;
    $('licenseChip').hidden = licenseEditing || !has;
    renderLicenseWarnings();
    if (licenseEditing || !has) return;

    $('licenseTitle').textContent = l.type || 'Lizenz';
    var sub = [];
    if (l.producer) sub.push(l.producer);
    if (l.bpm) sub.push(l.bpm + ' BPM');
    if (l.key) sub.push(l.key);
    $('licenseSub').textContent = sub.join(' · ');
    $('licenseClip').style.display = l.fileId ? '' : 'none';
    setLicenseOpen(false);

    var dl = $('licenseList');
    dl.textContent = '';
    [['Lizenzart', l.type], ['Produzent', l.producer], ['BPM', l.bpm], ['Tonart', l.key],
      ['Gekauft am', l.date ? new Date(l.date + 'T00:00').toLocaleDateString('de-DE') : ''],
      ['Notizen', l.notes], ['Datei', l.fileName]].forEach(function (row) {
      if (!row[1]) return;
      dl.append(el('dt', '', row[0]), el('dd', '', row[1]));
    });

    if (licenseUrl) { URL.revokeObjectURL(licenseUrl); licenseUrl = null; }
    $('licenseOpen').hidden = true;
    if (l.fileId) {
      var p = current;
      RaimDB.getFile(l.fileId).then(function (rec) {
        if (!rec || current !== p) return;
        licenseUrl = URL.createObjectURL(rec.blob);
        $('licenseOpen').href = licenseUrl;
        $('licenseOpen').hidden = false;
      });
    }
  }

  // what to watch out for with this project's beat license (no legal advice)
  function licenseWarnings(p) {
    var l = p.license, out = [], type = l.type, hasBeat = !!(p.beat || p.youtube);
    if (!hasLicense(l)) {
      if (hasBeat) out.push(['warn', 'Für diesen Beat ist keine Lizenz hinterlegt. Ohne Lizenz darfst du den Song nicht veröffentlichen – auch YouTube-Beats nur, wenn die Bedingungen es ausdrücklich erlauben.']);
      return out;
    }
    if (/^Free/.test(type)) out.push(['warn', 'Free-Lizenz: nur nicht-kommerziell. Kein Release mit Einnahmen (Spotify, Apple Music, Verkäufe). Für ein Release brauchst du eine gekaufte Lizenz.']);
    if (/^Lease|^Premium/.test(type)) {
      out.push(['info', 'Lease ist nicht exklusiv: Der Produzent darf den Beat weiter verkaufen. Leases haben meist Grenzen (Streams, Verkäufe, Musikvideos, Laufzeit). Prüf sie vor dem Release.']);
      if (!(l.notes || '').trim()) out.push(['warn', 'Trag die Grenzen deiner Lease in die Notizen ein, z. B. „bis 100.000 Streams, 1 Musikvideo“.']);
    }
    if (type === 'Unlimited') out.push(['info', 'Unlimited: unbegrenzt nutzbar, aber nicht exklusiv – andere Artists können denselben Beat nutzen.']);
    if (type === 'Exklusiv') out.push(['info', 'Exklusiv: Nur du darfst den Beat nutzen. Bewahr den Vertrag gut auf.']);
    if (type === 'Andere' || !type) out.push(['warn', 'Lizenzart nicht angegeben – prüf die Bedingungen genau.']);
    if (type !== 'Eigener Beat') {
      if (!l.fileId) out.push(['warn', 'Lizenzdatei fehlt. Lade Vertrag oder Kaufbeleg hoch – den brauchst du z. B. bei Content-ID-Einsprüchen.']);
      if (!(l.producer || '').trim()) out.push(['info', 'Trag den Produzenten ein. Meist muss er im Songtitel genannt werden (prod. by …).']);
    }
    return out;
  }

  function renderLicenseWarnings() {
    var box = $('licenseWarn'), list = licenseWarnings(current);
    var warn = list.filter(function (w) { return w[0] === 'warn'; }).length;
    $('licenseWarnDot').hidden = !warn;
    box.textContent = '';
    box.hidden = !list.length || licenseEditing;
    box.classList.toggle('is-info', !warn);
    if (!list.length) return;
    var ul = el('ul');
    list.forEach(function (w) { ul.append(el('li', w[0] === 'warn' ? 'is-warn' : '', w[1])); });
    box.append(el('strong', '', warn ? 'Lizenz prüfen' : 'Gut zu wissen'), ul, el('small', '', 'Kein Rechtsrat – im Zweifel gilt dein Lizenzvertrag.'));
  }

  function setLicenseOpen(open) {
    $('licenseDetails').hidden = !open;
    $('licenseBar').setAttribute('aria-expanded', String(open));
    $('licenseChip').classList.toggle('is-open', open);
  }
  $('licenseBar').addEventListener('click', function () { setLicenseOpen($('licenseDetails').hidden); });

  function editLicense() {
    if (!may('license')) return;
    var f = $('licenseForm'), l = current.license;
    readSeq++;
    licenseStatus('');
    LICENSE_FIELDS.forEach(function (k) { f.elements[k].value = l[k] || ''; });
    licenseDraft = { file: null, removeFile: false };
    licenseEditing = true;
    renderLicense();
    showDraftFile();
    $('licenseDelete').hidden = !hasLicense(l);
    f.elements.producer.focus();
  }
  function showDraftFile() {
    var l = current.license, d = licenseDraft;
    var name = d.file ? d.file.name : d.removeFile ? '' : l.fileName;
    $('licenseFileLabel').textContent = name || 'Lizenzdatei hochladen (PDF, Bild …)';
    $('licenseRemove').hidden = !name;
  }
  $('licenseAdd').addEventListener('click', editLicense);
  $('licenseEdit').addEventListener('click', editLicense);

  $('licenseInput').addEventListener('change', function (e) {
    var file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    licenseDraft.file = file;
    licenseDraft.removeFile = false;
    showDraftFile();
    readLicenseFile(file);
  });

  // ---------- fill the license form from the uploaded file ----------
  var LICENSE_LABELS = { producer: 'Produzent', type: 'Lizenzart', bpm: 'BPM', key: 'Tonart', date: 'Kaufdatum', notes: 'Bedingungen' };

  function licenseStatus(text, kind) {
    var r = $('licenseRead');
    r.textContent = text;
    r.className = 'license-read' + (kind ? ' is-' + kind : '');
    r.hidden = !text;
  }

  // with an API key Claude reads the file (also photos), otherwise Barbook reads PDFs itself
  function licenseEngine() {
    if (!Store.apiKey()) return Promise.resolve('local');
    var choice = null;
    try { choice = localStorage.getItem('raim.licenseAi'); } catch (e) { /* private mode */ }
    if (choice) return Promise.resolve(choice === 'yes' ? 'claude' : 'local');
    return confirmDialog('Lizenz mit Claude auslesen?',
      'Die Lizenzdatei wird an Claude von Anthropic geschickt, um Produzent, Lizenzart, BPM, Tonart, Datum und Bedingungen herauszulesen. Ohne Claude liest Barbook nur PDFs selbst aus – das ist ungenauer.',
      'Mit Claude auslesen').then(function (ok) {
      try { localStorage.setItem('raim.licenseAi', ok ? 'yes' : 'no'); } catch (e) { /* private mode */ }
      return ok ? 'claude' : 'local';
    });
  }

  var readSeq = 0;
  function readLicenseFile(file) {
    var seq = ++readSeq, isImage = /^image\//.test(file.type);
    licenseStatus('Lese Lizenz aus …', 'busy');
    licenseEngine().then(function (engine) {
      if (seq !== readSeq) return null;
      if (engine === 'local' && isImage) {
        licenseStatus('Fotos kann Barbook nur mit API-Schlüssel (Claude) auslesen. Trag die Angaben bitte selbst ein.', 'warn');
        return null;
      }
      var job = engine === 'claude' ? RaimAI.readLicense(Store.apiKey(), file) : RaimLicenseReader.read(file);
      return job.then(function (r) { return { r: r, engine: engine }; }, function (err) {
        if (engine !== 'claude' || isImage) throw err;
        // Claude not reachable: fall back to reading the PDF ourselves
        return RaimLicenseReader.read(file).then(function (r) { return { r: r, engine: 'local', note: err.message }; });
      });
    }).then(function (out) {
      if (!out || seq !== readSeq || !licenseEditing) return;
      var f = $('licenseForm'), filled = [];
      Object.keys(LICENSE_LABELS).forEach(function (k) {
        var v = (out.r[k] || '').trim();
        if (!v) return;
        if (k === 'notes' && f.elements.notes.value.trim() && f.elements.notes.value.indexOf(v) < 0) v = f.elements.notes.value.trim() + '\n' + v;
        f.elements[k].value = v;
        f.elements[k].classList.add('is-filled');
        filled.push(LICENSE_LABELS[k]);
      });
      setTimeout(function () { f.querySelectorAll('.is-filled').forEach(function (x) { x.classList.remove('is-filled'); }); }, 2500);
      var prefix = out.note ? out.note + ' Darum ohne Claude gelesen. ' : '';
      if (filled.length) licenseStatus(prefix + 'Aus der Datei übernommen: ' + filled.join(', ') + '. Bitte prüfen und speichern.', 'ok');
      else licenseStatus(prefix + 'In der Datei habe ich keine Angaben gefunden. Trag sie bitte selbst ein.', 'warn');
    }).catch(function (err) {
      if (seq !== readSeq) return;
      licenseStatus((err && err.message && !/pdf\.js/.test(err.message) ? err.message : 'Die Datei konnte nicht gelesen werden.') + ' Trag die Angaben bitte selbst ein.', 'warn');
    });
  }
  $('licenseRemove').addEventListener('click', function () {
    licenseDraft.file = null;
    licenseDraft.removeFile = true;
    showDraftFile();
  });

  $('licenseCancel').addEventListener('click', function () {
    licenseEditing = false;
    licenseDraft = null;
    renderLicense();
  });

  $('licenseForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var p = current, l = p.license, f = $('licenseForm'), d = licenseDraft;
    var values = {};
    LICENSE_FIELDS.forEach(function (k) { values[k] = f.elements[k].value.trim(); });
    var old = l.fileId, step;
    if (d.file) {
      step = RaimDB.putFile(p.id, d.file).then(function (id) {
        return { fileId: id, fileName: d.file.name };
      });
    } else if (d.removeFile) {
      step = Promise.resolve({ fileId: null, fileName: '' });
    } else {
      step = Promise.resolve(null);
    }
    step.then(function (file) {
      LICENSE_FIELDS.forEach(function (k) { l[k] = values[k]; });
      if (values.key && !p.key) p.key = values.key;
      if (values.bpm && !p.bpm) {
        p.bpm = values.bpm;
        if (current === p) { $('bpmInput').value = values.bpm; $('bpmInput').dispatchEvent(new Event('input')); }
      }
      if (file) {
        l.fileId = file.fileId;
        l.fileName = file.fileName;
        RaimDB.deleteFile(old);
      }
      p.updated = Date.now();
      return saveNow(p);
    }).then(function () {
      if (current !== p) return;
      licenseEditing = false;
      licenseDraft = null;
      renderLicense();
      toast(hasLicense(l) ? 'Lizenz gespeichert.' : 'Lizenz entfernt.');
    }).catch(function () { toast('Lizenz konnte nicht gespeichert werden – Speicher voll?'); });
  });

  $('licenseDelete').addEventListener('click', function () {
    if (!confirm('Lizenz mit allen Angaben und der Datei löschen?')) return;
    var p = current, l = p.license;
    RaimDB.deleteFile(l.fileId);
    LICENSE_FIELDS.forEach(function (k) { l[k] = ''; });
    l.fileId = null;
    l.fileName = '';
    p.updated = Date.now();
    saveNow(p);
    licenseEditing = false;
    licenseDraft = null;
    renderLicense();
    toast('Lizenz gelöscht.');
  });

  // ---------- Reime (per project) ----------
  var filter = 'all', lastResult = null, searchTimer = null, shown = 30;
  var GROUP_COLORS = ['#5ee7ff', '#ff7ad9', '#ffd166', '#8fff9f', '#ff9b6b', '#b59bff'];

  // rhyme types: the first four sort the normal search, vowel rhymes and alliteration search anew
  var FILTER_HINT = {
    all: 'Alle Reime nach Klang, die besten zuerst.',
    pure: 'Reine Reime: ab dem betonten Vokal klingt alles gleich (Nacht – Macht).',
    slant: 'Unreine Reime: klingen ähnlich, aber nicht ganz gleich (Nacht – Knast).',
    multi: 'Doppel- und Mehrsilbenreime: zwei oder mehr Silben reimen (Leben – geben).',
    vowel: 'Vokalreime (Assonanz): gleiche Vokale, andere Konsonanten (Leben – Regen, Lebensgefahr – Gesellenjahr).',
    start: 'Alliteration: gleicher Anfangslaut (Stadt – Stark – Stand).'
  };
  function filterMode() { return filter === 'vowel' || filter === 'start' ? filter : 'rhyme'; }
  function renderFilterHint() { $('filterHint').textContent = FILTER_HINT[filter]; }
  renderFilterHint();
  document.querySelectorAll('[data-filter]').forEach(function (b) {
    b.addEventListener('click', function () {
      filter = b.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(function (x) { x.classList.toggle('is-on', x === b); });
      renderFilterHint();
      shown = 30;
      if (lastResult && lastResult.mode !== filterMode()) runSearch(false);
      else renderResults();
    });
  });

  // rhyme key of a word: its last stressed vowel and everything after it
  function rhymeKey(word) {
    var v = engine.wordT(word, current.lang, rhymeLangs()).t.v, n = v.length;
    if (!n) return '';
    return 'aeiouöüAYW'.indexOf(v[n - 1]) < 0 && n > 1 ? v[n - 2] + v[n - 1] : v[n - 1];
  }

  function lineEndings() {
    var seen = {}, out = [];
    RaimSong.lines(current.text).forEach(function (line) {
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
    if (!rhymeLangs().every(function (l) { return engine.ready(l); })) { out.textContent = ''; out.append(el('p', 'empty', 'Wörterbuch lädt noch …')); }
    var p = current;
    whenReady(function () {
      if ($('searchInput').value.trim() !== q || current !== p) return;
      lastResult = searchRhymes(q, 120, filterMode());
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

  // which languages rhymes come from: shown in the rhymes tab, changed in the song infos
  function renderRhymeLangs() {
    var on = rhymeLangs(), names = on.map(langName);
    var note = $('rhymeLangNote'), list = names.length > 1 ? names.slice(0, -1).join(', ') + ' und ' + names[names.length - 1] : names[0];
    var text = on.length > 1 ? 'Reime auf ' + list + ' – auch über die Sprachen hinweg, z. B. ' +
      langName(on[1]) + ' auf ' + langName(on[0]) + '.' : 'Reime auf ' + list + '.';
    if (current.langs.indexOf('other') >= 0) text += ' Für andere Sprachen helfen dir die KI-Ideen.';
    note.textContent = text + ' ';
    var edit = el('button', 'link-btn', 'Sprachen ändern');
    edit.type = 'button';
    edit.addEventListener('click', function () { openInfo(current); });
    note.append(edit);
  }

  // ---------- Reime / Synonyme switch ----------
  function setMode(mode) {
    document.querySelectorAll('[data-mode]').forEach(function (b) { b.classList.toggle('is-on', b.dataset.mode === mode); });
    $('rhymePanel').hidden = mode !== 'rhymes';
    $('synPanel').hidden = mode !== 'syn';
  }
  document.querySelectorAll('[data-mode]').forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.mode); });
  });

  // ---------- Synonyme ----------
  // German from OpenThesaurus (offline), English from Datamuse (online)
  var thesPromise = null;
  function loadThesaurus() {
    if (!thesPromise) {
      thesPromise = loadScript('js/thesaurus-de.js').then(function () {
        var sets = window.RAIM_THES_DE.split('\n').map(function (l) { return l.split(';'); });
        window.RAIM_THES_DE = null;
        var byWord = new Map();
        sets.forEach(function (set, i) {
          set.forEach(function (t) {
            var k = t.toLowerCase();
            if (!byWord.has(k)) byWord.set(k, []);
            byWord.get(k).push(i);
          });
        });
        return { sets: sets, byWord: byWord };
      });
      thesPromise.catch(function () { thesPromise = null; });
    }
    return thesPromise;
  }

  function germanSynonyms(word) {
    return loadThesaurus().then(function (th) {
      var k = word.toLowerCase(), ids = th.byWord.get(k);
      // "Geldes" -> "Geld": try a few inflection endings
      if (!ids) {
        var stem = ['en', 'es', 'er', 'e', 'n', 's'].map(function (e) { return k.endsWith(e) ? k.slice(0, -e.length) : null; })
          .find(function (x) { return x && th.byWord.has(x); });
        ids = stem ? th.byWord.get(stem) : [];
      }
      var out = [], seen = new Set([k]);
      ids.forEach(function (i) {
        th.sets[i].forEach(function (t) {
          if (!seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); out.push(t); }
        });
      });
      return out;
    });
  }

  function englishSynonyms(word) {
    return fetch('https://api.datamuse.com/words?ml=' + encodeURIComponent(word) + '&max=100')
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (list) { return list.map(function (x) { return x.word; }); });
  }

  var synSeq = 0;
  function runSynonyms() {
    var word = $('synInput').value.trim(), target = $('synTarget').value.trim(), out = $('synOut');
    if (word.length < 2) return;
    var seq = ++synSeq, p = current;
    out.textContent = '';
    out.append(el('p', 'empty', 'Suche Synonyme …'));
    // synonyms exist for German and English
    withLangs(['en'].concat(rhymeLangs()), function () {
      var lang = engine.wordT(word, p.lang === 'en' ? 'en' : 'de', ['de', 'en']).lang;
      $('synInfo').textContent = (lang === 'en'
        ? 'Englische Synonyme von Datamuse (braucht Internet).'
        : 'Deutsche Synonyme aus OpenThesaurus.') + (rhymeLangs().some(function (l) { return l !== 'de' && l !== 'en'; })
        ? ' Synonyme gibt es nur auf Deutsch und Englisch.' : '');
      (lang === 'en' ? englishSynonyms(word) : germanSynonyms(word)).then(function (list) {
        if (seq !== synSeq || current !== p) return;
        var rows = list.map(function (w) {
          return { word: w, score: target ? engine.rhymeScore(w, target, p.lang, rhymeLangs()) : null };
        });
        if (target) rows.sort(function (a, b) { return b.score - a.score; });
        renderSynonyms(rows, word, target);
      }, function () {
        if (seq !== synSeq) return;
        out.textContent = '';
        out.append(el('p', 'empty', lang === 'en' ? 'Keine Verbindung zu Datamuse. Bist du online?' : 'Synonyme konnten nicht geladen werden.'));
      });
    });
  }
  $('synForm').addEventListener('submit', function (e) {
    e.preventDefault();
    runSynonyms();
    document.activeElement.blur();
  });

  function renderSynonyms(rows, word, target) {
    var out = $('synOut');
    out.textContent = '';
    if (!rows.length) { out.append(el('p', 'empty', 'Keine Synonyme für „' + word + '“ gefunden.')); return; }
    var card = el('div', 'result-card');
    var head = el('p', 'syn-head', rows.length + ' Synonyme für „' + word + '“' + (target ? ', sortiert nach Reim auf „' + target + '“' : ''));
    card.append(head);
    var ul = el('ul', 'results');
    rows.slice(0, 80).forEach(function (r) {
      var li = el('li');
      if (r.score !== null) {
        var sc = el('span', 'score', r.score.toFixed(2).replace('.', ','));
        sc.style.setProperty('--s', r.score.toFixed(2));
        li.append(sc);
      }
      var w = el('span', 'word', r.word);
      var star = el('button', 'star', '★');
      star.type = 'button';
      star.setAttribute('aria-label', 'Für dieses Projekt merken');
      star.classList.toggle('is-on', current.rhymes.saved.indexOf(r.word) >= 0);
      star.addEventListener('click', function () {
        var on = toggleSaved(r.word);
        star.classList.toggle('is-on', on);
        toast(on ? '„' + r.word + '“ gemerkt' : '„' + r.word + '“ entfernt');
      });
      var rh = el('button', 'nope nope--text', 'Reime');
      rh.type = 'button';
      rh.title = 'Reime auf dieses Wort suchen';
      rh.addEventListener('click', function () { setMode('rhymes'); search(r.word); });
      li.append(w, star, rh);
      ul.append(li);
    });
    card.append(ul);
    out.append(card);
  }

  function renderResults() {
    var out = $('searchOut');
    out.textContent = '';
    if (!lastResult) return;
    var r = lastResult;
    var card = el('div', 'result-card');

    if (r.endings.length && r.mode === 'rhyme') {
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

    var list = r.results.filter(function (h) {
      return filter === 'multi' ? h.kind === 'multi' : filter === 'pure' ? h.pure : filter === 'slant' ? !h.pure : true;
    });
    var ul = el('ul', 'results');
    list.slice(0, shown).forEach(function (h) {
      var li = el('li');
      var sc = el('span', 'score', h.score.toFixed(2).replace('.', ','));
      sc.style.setProperty('--s', h.score.toFixed(2));
      var w = el('span', 'word', h.word);
      var tags = [];
      if (h.kind === 'multi') tags.push('mehrsilbig');
      if (r.mode === 'rhyme' && !h.pure && filter !== 'slant') tags.push('unrein');
      if (h.lang !== current.lang) tags.push(langName(h.lang).toLowerCase());
      if (tags.length) w.append(el('span', 'tag', tags.join(' · ')));
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
    if (!list.length) card.append(el('p', 'empty', filter === 'multi'
      ? 'Keine Mehrsilbenreime gefunden – probier ein längeres Wort oder eine Wortgruppe (z. B. „Rechnung bezahle“).'
      : 'Keine passenden Reime gefunden.'));
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
    keyResult('');
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
  function keyResult(text, ok) {
    var r = $('keyResult');
    r.textContent = text;
    r.className = 'key-result' + (ok === true ? ' is-ok' : ok === false ? ' is-error' : '');
    r.hidden = !text;
  }
  $('saveKey').addEventListener('click', function () {
    Store.saveApiKey($('apiKey').value.trim());
    keyResult('Gespeichert.', true);
  });
  $('testKey').addEventListener('click', function () {
    var key = $('apiKey').value.trim(), btn = $('testKey');
    btn.disabled = true;
    keyResult('Teste Schlüssel …');
    RaimAI.testKey(key).then(function (msg) {
      Store.saveApiKey(key);
      keyResult(msg + ' (gespeichert)', true);
    }, function (err) {
      keyResult(err.message, false);
    }).then(function () { btn.disabled = false; });
  });
  $('revokeConsent').addEventListener('click', function () {
    Store.saveConsent(false);
    try { localStorage.removeItem('raim.licenseAi'); } catch (e) { /* private mode */ }
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
    var ids = [];
    p.takes.forEach(function (t) { [t.fileId, t.voiceId, t.beatId].forEach(function (id) { if (id) ids.push(id); }); });
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
      var blob = new Blob([JSON.stringify({ app: 'barbook', version: 1, projects: projects, files: files })], { type: 'application/json' });
      var a = el('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'Barbook-Sicherung-' + new Date().toISOString().slice(0, 10) + '.json';
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
      if (!data || (data.app !== 'barbook' && data.app !== 'raim') || !Array.isArray(data.projects)) throw new Error('format');
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
    }).catch(function () { toast('Diese Datei ist keine Barbook-Sicherung.'); });
  });

  // ---------- start ----------
  RaimBeats.init(toast, {
    project: function () { return current; },
    save: function () { scheduleSave(); },
    changed: function () { if (current) renderLicenseWarnings(); },
    may: function (what) { return may(what); },
    // lyrics for the teleprompter: section names and lines, repeats filled in
    lyrics: function () {
      var out = [];
      RaimSong.expand(RaimSong.parse(current.text)).forEach(function (s, i) {
        if (promptPick && !promptPick.has(i)) return;
        if (s.name !== null) out.push({ head: s.name + (s.repeated ? ' (Wiederholung)' : '') });
        s.body.split('\n').forEach(function (l) { if (l.trim()) out.push({ line: l.trim() }); });
      });
      return out;
    }
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

  // ---------- account ----------
  // With accounts set up (js/config.js) the app only opens after login; projects are synced.
  var account = null;
  function startAccount() {
    if (!RaimCloud.configured) return Promise.resolve();
    return RaimCloud.currentUser().then(function (u) {
      if (!u) { location.replace('login.html'); throw new Error('login'); }
      account = u;
      RaimCloud.setUser(u.id);
      RaimDB.useAccount(u.id, RaimCloud.online() ? RaimCloud : null);
      RaimCloud.onAuth(function (event) { if (event === 'SIGNED_OUT') location.replace('login.html'); });
      return RaimDB.sync().then(function (r) {
        if (r.offline) toast('Offline – Änderungen werden hochgeladen, sobald du wieder online bist.');
      }, function () {
        toast('Synchronisieren hat nicht geklappt – du arbeitest mit der Kopie auf diesem Gerät.');
      });
    });
  }

  // projects from before accounts: offer once per device to move them into the account
  function takeOverLegacy() {
    if (!account) return Promise.resolve();
    var done = null;
    try { done = localStorage.getItem('barbook.legacyDone'); } catch (e) { /* private mode */ }
    if (done) return Promise.resolve();
    function markDone() { try { localStorage.setItem('barbook.legacyDone', account.id); } catch (e) { /* private mode */ } }
    return RaimDB.legacy().then(function (old) {
      var list = old.projects.filter(function (p) { return !p.deletedAt; });
      if (!list.length) { markDone(); return; }
      return confirmDialog('Projekte übernehmen?',
        (list.length === 1 ? 'Auf diesem Gerät liegt 1 Projekt aus der Zeit ohne Account. Soll es'
          : 'Auf diesem Gerät liegen ' + list.length + ' Projekte aus der Zeit ohne Account. Sollen sie') +
        ' in deinen Account (' + account.email + ') übernommen werden?', 'Übernehmen')
        .then(function (yes) {
          markDone();
          if (!yes) return;
          var ids = new Set(list.map(function (p) { return p.id; }));
          return Promise.all(old.files.filter(function (f) { return ids.has(f.project); }).map(RaimDB.putFileRecord))
            .then(function () { return Promise.all(list.map(RaimDB.saveProject)); })
            .then(function () { toast(list.length + (list.length === 1 ? ' Projekt' : ' Projekte') + ' übernommen.'); });
        });
    }).catch(function () { /* nothing to take over */ });
  }

  function renderAccount() {
    $('backupText').textContent = RaimCloud.configured
      ? 'Deine Projekte liegen in deinem Account und auf diesem Gerät. Zusätzlich kannst du alles als Datei sichern.'
      : 'Projekte liegen nur in diesem Browser. Exportiere sie regelmäßig – inklusive Beats, Lizenzen und Aufnahmen.';
  }

  // ---------- profile ----------
  // Name and artist name live in the account (without accounts: in this browser), the picture as a
  // small square JPEG in the bucket. A copy stays here so the circle shows right away.
  var profile = { name: '', artist: '', avatar: 0, pic: '' };
  var draftPic;   // while the dialog is open: undefined = unchanged, '' = removed, data URL = new
  function profileKey() { return 'barbook.profile' + (account ? '.' + account.id : ''); }
  function loadProfile() {
    try {
      var x = JSON.parse(localStorage.getItem(profileKey()) || 'null');
      if (x) profile = x;
    } catch (e) { /* private mode */ }
    renderProfile();
    if (!account || !RaimCloud.online()) return;
    RaimCloud.getProfile().then(function (r) {
      var changed = r.avatar !== profile.avatar;
      profile.code = r.code;
      profile.name = r.name;
      profile.artist = r.artist;
      profile.avatar = r.avatar;
      if (!changed) return;
      if (!r.avatar) { profile.pic = ''; return; }
      return RaimCloud.downloadAvatar().then(blobToDataUrl).then(function (url) { profile.pic = url; });
    }).then(function () { storeProfile(); renderProfile(); renderFriends(); }, function () { /* keep the copy */ });
  }
  function storeProfile() {
    try { localStorage.setItem(profileKey(), JSON.stringify(profile)); } catch (e) { /* private mode */ }
  }
  // "Leon Lauterbach" -> "LL"
  function initials(person) {
    var words = (person.artist || person.name || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length && person.email) words = [person.email];
    return words.slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
  }
  function paintAvatar(node, pic, person) {
    node.classList.toggle('has-pic', !!pic);
    node.style.backgroundImage = pic ? 'url("' + pic + '")' : '';
    node.textContent = pic ? '' : initials(person || { artist: profile.artist, name: profile.name, email: account && account.email });
    if (!pic && !node.textContent) {
      node.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>';
    }
  }
  function renderProfile() {
    paintAvatar($('openProfile'), profile.pic);
    $('openProfile').title = profile.artist || profile.name || 'Profil';
  }
  function renderDraftPic() {
    var pic = draftPic === undefined ? profile.pic : draftPic;
    paintAvatar($('profileAvatar'), pic);
    $('avatarRemove').hidden = !pic;
  }
  function profileMsg(text) { $('profileMsg').textContent = text; $('profileMsg').hidden = !text; }

  $('openProfile').addEventListener('click', function () {
    var f = $('profileForm');
    f.elements.name.value = profile.name;
    f.elements.artist.value = profile.artist;
    draftPic = undefined;
    renderDraftPic();
    $('profileIdRow').hidden = !profile.code;
    $('profileCode').textContent = '#' + (profile.code || '');
    $('profileEmail').textContent = account ? 'Angemeldet als ' + account.email
      : 'Ohne Account – dein Profil bleibt in diesem Browser.';
    $('logout').hidden = !account;
    profileMsg('');
    $('profileDlg').showModal();
  });
  $('closeProfile').addEventListener('click', function () { $('profileDlg').close(); });

  // any photo -> 256 × 256 JPEG cut from the middle
  function squarePicture(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var s = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement('canvas');
        c.width = c.height = 256;
        c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 256, 256);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('image')); };
      img.src = url;
    });
  }
  $('avatarInput').addEventListener('change', function (e) {
    var file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    squarePicture(file).then(function (url) { draftPic = url; renderDraftPic(); profileMsg(''); },
      function () { profileMsg('Dieses Bild lässt sich nicht öffnen – nimm bitte ein JPG oder PNG.'); });
  });
  $('avatarRemove').addEventListener('click', function () { draftPic = ''; renderDraftPic(); });

  $('profileForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, name = f.elements.name.value.trim(), artist = f.elements.artist.value.trim();
    var pic = draftPic === undefined ? profile.pic : draftPic, version = profile.avatar;
    var job = Promise.resolve();
    if (account) {
      if (!RaimCloud.online()) { profileMsg('Offline – das Profil lässt sich gerade nicht speichern.'); return; }
      if (draftPic === '') {
        version = 0;
        job = RaimCloud.removeAvatar().catch(function () { /* already gone */ });
      } else if (draftPic) {
        version = Date.now();
        job = fetch(draftPic).then(function (r) { return r.blob(); }).then(RaimCloud.uploadAvatar);
      }
      job = job.then(function () { return RaimCloud.saveProfile({ name: name, artist: artist, avatar: version }); });
    }
    $('profileSave').disabled = true;
    profileMsg('Speichere …');
    job.then(function () {
      profile = { code: profile.code, name: name, artist: artist, avatar: version, pic: pic };
      storeProfile();
      renderProfile();
      $('profileDlg').close();
      toast('Profil gespeichert.');
    }, function (err) {
      profileMsg(RaimCloud.message(err));
    }).then(function () { $('profileSave').disabled = false; });
  });

  $('logout').addEventListener('click', function () {
    $('profileDlg').close();
    if (current) closeProject();
    RaimCloud.signOut().catch(function () {}).then(function () { location.replace('login.html'); });
  });


  // ---------- friends ----------
  // Everyone with an account has an ID (profile.code). Friends are found by it; accepted friends
  // can be featured on a project (song infos) and then open and edit it too.
  var people = [];        // [{ id, code, name, artist, avatar, status: 'friend' | 'incoming' | 'outgoing' }]
  var invites = [];       // songs friends invited me to: [{ owner, project_id, title }]
  var ownFeatures = {};   // my songs -> [{ member, accepted, rights }]
  var friendsProblem = '';
  var friendPics = {};    // id -> picture as data URL ('' while loading)
  function personName(x) { return x ? x.artist || x.name || '#' + x.code : ''; }
  function personById(id) { return people.find(function (x) { return x.id === id; }); }
  function friends() { return people.filter(function (x) { return x.status === 'friend'; }); }
  function ownerName(p) { return personName(personById(p._owner)) || p.ownerName || 'einem Freund'; }
  function featureNames(p) {
    return p.features.map(function (f) {
      if (account && f.id === account.id) return (profile.artist || profile.name || f.name) + ' (du)';
      var name = personName(personById(f.id)) || f.name;
      return !p._owner && memberState(p, f.id) === 'invited' ? name + ' (eingeladen)' : name;
    }).join(', ');
  }

  function loadFriends() {
    if (!account || !RaimCloud.online()) return Promise.resolve();
    // each part on its own: one failing (e.g. an outdated database) must not hide the others
    var problem = null;
    function part(job, fallback) { return job.catch(function (err) { problem = err; return fallback; }); }
    return Promise.all([
      part(RaimCloud.relations(), null), part(RaimCloud.invitations(), null), part(RaimCloud.myFeatures(), null)
    ]).then(function (r) {
      if (r[0]) people = r[0];
      if (r[1]) invites = r[1];
      if (r[2]) { ownFeatures = r[2]; pruneFeatures(); }
      friendsProblem = problem ? RaimCloud.message(problem) : '';
      renderFriends();
      if (!current) renderProjects();
    });
  }
  var featuresLoaded = false;
  // friends who declined an invitation or left a song drop out of its feature list
  function pruneFeatures() {
    featuresLoaded = true;
    projects.forEach(function (p) {
      if (p._owner || !p.features.length) return;
      var rows = ownFeatures[p.id] || [];
      var gone = p.features.filter(function (f) { return !rows.some(function (r) { return r.member === f.id; }); });
      if (!gone.length) return;
      p.features = p.features.filter(function (f) { return gone.indexOf(f) < 0; });
      p.updated = Date.now();
      saveNow(p);
      toast(gone.map(function (f) { return personName(personById(f.id)) || f.name; }).join(', ') +
        ' ist bei „' + (p.title || 'Ohne Titel') + '“ nicht mehr dabei.');
    });
  }

  // a friend's circle: initials first, the picture once it is loaded
  function paintPerson(node, x) {
    paintAvatar(node, friendPics[x.id], x);
    if (!x.avatar || friendPics[x.id] !== undefined) return;
    friendPics[x.id] = '';
    RaimCloud.downloadAvatar(x.id).then(blobToDataUrl).then(function (url) {
      friendPics[x.id] = url;
      document.querySelectorAll('[data-person="' + x.id + '"]').forEach(function (n) { paintAvatar(n, url, x); });
    }, function () { /* initials stay */ });
  }

  function personRow(x, actions) {
    var li = el('li', 'person');
    var pic = el('span', 'avatar');
    pic.dataset.person = x.id;
    paintPerson(pic, x);
    var info = el('div', 'person-info');
    info.append(el('strong', '', personName(x)));
    info.append(el('span', '', (x.artist && x.name ? x.name + ' · ' : '') + '#' + x.code));
    var box = el('div', 'person-actions');
    actions.forEach(function (a) {
      if (typeof a === 'string') { box.append(el('span', 'person-state', a)); return; }
      var b = el('button', 'btn' + (a.primary ? ' btn--primary' : ''), a.label);
      b.type = 'button';
      b.addEventListener('click', function () { b.disabled = true; a.run(); });
      box.append(b);
    });
    li.append(pic, info, box);
    return li;
  }

  function friendAction(job, done) {
    job.then(function () {
      if (done) toast(done);
      return loadFriends();
    }, function (err) { toast(RaimCloud.message(err)); renderFriends(); });
  }
  // A request between the two may already exist (sent earlier, or the other one asked first):
  // then answer the other one's request instead of failing
  function ask(x) {
    $('friendResult').textContent = '';
    RaimCloud.askFriend(x.id).then(function () {
      toast('Anfrage an ' + personName(x) + ' gesendet.');
      return loadFriends();
    }, function (err) {
      if (!/friendships_pair|duplicate|23505/i.test((err && (err.code + ' ' + err.message)) || '')) {
        toast(RaimCloud.message(err));
        return;
      }
      return loadFriends().then(function () {
        var known = personById(x.id), state = known && known.status;
        if (state === 'incoming') return accept(known);
        toast(state === 'friend' ? 'Ihr seid schon befreundet.' : 'Du hast ' + personName(x) + ' schon eine Anfrage geschickt.');
      });
    });
  }
  function accept(x) { friendAction(RaimCloud.acceptFriend(x.id), 'Du bist jetzt mit ' + personName(x) + ' befreundet.'); }
  function unfriend(x, text) { friendAction(RaimCloud.endFriendship(x.id), text); }

  function renderFriends() {
    var badge = $('friendsBadge'), incoming = people.filter(function (x) { return x.status === 'incoming'; });
    badge.textContent = String(incoming.length + invites.length);
    badge.hidden = !incoming.length && !invites.length;
    var banner = $('inviteBanner');
    banner.hidden = !invites.length;
    banner.textContent = invites.length === 1 ? 'Du hast eine Einladung zu einem Song – ansehen'
      : 'Du hast ' + invites.length + ' Einladungen zu Songs – ansehen';
    if ($('friends').hidden) return;
    $('friendsProblem').textContent = friendsProblem;
    $('friendsProblem').hidden = !friendsProblem;
    var invList = $('invitesList');
    invList.textContent = '';
    invites.forEach(function (inv) {
      var x = personById(inv.owner) || { id: inv.owner, code: '', name: '', artist: 'Ein Freund' };
      var li = personRow(x, [
        { label: 'Annehmen', primary: true, run: function () { answerInvite(inv, true); } },
        { label: 'Ablehnen', run: function () { answerInvite(inv, false); } }
      ]);
      li.querySelector('.person-info span').textContent = 'lädt dich zu „' + (inv.title || 'Ohne Titel') + '“ ein';
      li.classList.add('person--invite');
      invList.append(li);
    });
    $('invitesBlock').hidden = !invites.length;
    $('myCode').textContent = profile.code ? '#' + profile.code : '…';
    var inList = $('incomingList'), outList = $('outgoingList'), list = $('friendsList');
    inList.textContent = outList.textContent = list.textContent = '';
    incoming.forEach(function (x) {
      inList.append(personRow(x, [
        { label: 'Annehmen', primary: true, run: function () { accept(x); } },
        { label: 'Ablehnen', run: function () { unfriend(x, 'Anfrage abgelehnt.'); } }
      ]));
    });
    $('incomingBlock').hidden = !incoming.length;
    var mine = friends();
    mine.sort(function (a, b) { return personName(a).localeCompare(personName(b), 'de'); }).forEach(function (x) {
      list.append(personRow(x, [{ label: 'Entfernen', run: function () {
        confirmDialog('Freund entfernen?', personName(x) + ' ist dann nicht mehr in deiner Freundesliste. Gemeinsame Songs bleiben, bis jemand das Feature entfernt.', 'Entfernen')
          .then(function (yes) { if (yes) unfriend(x, personName(x) + ' entfernt.'); else renderFriends(); });
      } }]));
    });
    $('friendsCount').textContent = mine.length ? '(' + mine.length + ')' : '';
    $('friendsEmpty').hidden = mine.length > 0;
    var outgoing = people.filter(function (x) { return x.status === 'outgoing'; });
    outgoing.forEach(function (x) {
      outList.append(personRow(x, [{ label: 'Zurückziehen', run: function () { unfriend(x, 'Anfrage zurückgezogen.'); } }]));
    });
    $('outgoingBlock').hidden = !outgoing.length;
  }

  // accept: the song lands in my projects; decline: the invitation is gone
  function answerInvite(inv, yes) {
    if (!yes) {
      friendAction(RaimCloud.leaveProject(inv.owner, inv.project_id), 'Einladung abgelehnt.');
      return;
    }
    RaimCloud.acceptInvitation(inv.owner, inv.project_id).then(function () {
      return RaimDB.sync();
    }).then(function () { return RaimDB.projects(); }).then(function (list) {
      projects = list.map(normalize);
      toast('„' + (inv.title || 'Ohne Titel') + '“ ist jetzt in deinen Projekten.');
      return loadFriends();
    }, function (err) { toast(RaimCloud.message(err)); renderFriends(); });
  }
  $('inviteBanner').addEventListener('click', function () { $('openFriends').click(); });

  $('openFriends').addEventListener('click', function () {
    $('home').hidden = true;
    $('friends').hidden = false;
    $('friendResult').textContent = '';
    renderFriends();
    loadFriends();
    window.scrollTo(0, 0);
  });
  $('closeFriends').addEventListener('click', function () {
    $('friends').hidden = true;
    $('home').hidden = false;
    renderProjects();
  });

  function copyCode() {
    var text = '#' + profile.code;
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () {
      toast('ID ' + text + ' kopiert.');
    }, function () { toast('Deine ID: ' + text); });
  }
  $('copyCode').addEventListener('click', copyCode);
  $('profileCopy').addEventListener('click', copyCode);

  $('friendSearch').addEventListener('submit', function (e) {
    e.preventDefault();
    var code = $('friendCode').value.toUpperCase().replace(/[^A-Z0-9]/g, ''), out = $('friendResult');
    out.textContent = '';
    if (code.length < 4) { out.append(el('p', 'empty', 'Gib die ID deines Freundes ein, z. B. K7M2QX.')); return; }
    if (code === profile.code) { out.append(el('p', 'empty', 'Das ist deine eigene ID.')); return; }
    if (!RaimCloud.online()) { out.append(el('p', 'empty', 'Offline – suchen geht nur mit Internet.')); return; }
    out.append(el('p', 'empty', 'Suche …'));
    RaimCloud.findByCode(code).then(function (x) {
      out.textContent = '';
      if (!x) { out.append(el('p', 'empty', 'Niemand mit der ID #' + code + ' gefunden.')); return; }
      var known = personById(x.id), state = known && known.status, ul = el('ul', 'people');
      ul.append(personRow(x, state === 'friend' ? ['Schon befreundet']
        : state === 'outgoing' ? ['Anfrage gesendet']
        : state === 'incoming' ? [{ label: 'Annehmen', primary: true, run: function () { accept(x); out.textContent = ''; } }]
        : [{ label: 'Anfrage senden', primary: true, run: function () { ask(x); } }]));
      out.append(ul);
    }, function (err) { out.textContent = ''; out.append(el('p', 'empty', RaimCloud.message(err))); });
  });

  // ---------- features in the song infos ----------
  var infoFeatures = [];
  // Feature switch, "+ Freund einladen" and the invited friends with their rights
  var infoFeatureOn = false;
  function renderInfoFeatures(p) {
    var field = $('infoFeatureField'), note = $('infoFeatureNote'), sw = $('featureToggle').closest('.switch');
    field.hidden = !account;
    if (!account) return;
    if (p && p._owner) {
      sw.hidden = true;
      $('featureBox').hidden = true;
      note.textContent = 'Projekt von ' + ownerName(p) + (p.features.length ? ' · feat. ' + featureNames(p) : '') +
        '. Features kann nur ' + ownerName(p) + ' ändern.';
      return;
    }
    sw.hidden = false;
    infoFeatures = p ? p.features.map(function (f) { return f.id; }) : [];
    infoRights = {};
    (p ? p.features : []).forEach(function (f) { infoRights[f.id] = Object.assign({}, f.rights || {}); });
    infoFeatureOn = !!(p && (p.featureOn || p.features.length));
    $('featureToggle').checked = infoFeatureOn;
    $('invitePicker').hidden = true;
    renderFeatureBox();
  }
  function renderFeatureBox() {
    var on = $('featureToggle').checked, note = $('infoFeatureNote');
    $('featureBox').hidden = !on;
    if (!on) {
      note.textContent = infoFeatures.length ? 'Beim Speichern werden alle Features dieses Songs entfernt.'
        : 'Schalte Feature an, um Freunde zu diesem Song einzuladen.';
      return;
    }
    note.textContent = 'Eingeladene Freunde bekommen eine Einladung. Erst wenn sie annehmen, ist der Song in ihren Projekten. ' +
      'Ansehen dürfen sie dann alles – ändern nur, wo du einen Haken setzt.';
    renderInfoRights();
    if (!$('invitePicker').hidden) renderInvitePicker();
  }
  $('featureToggle').addEventListener('change', renderFeatureBox);
  $('inviteBtn').addEventListener('click', function () {
    var picker = $('invitePicker');
    picker.hidden = !picker.hidden;
    if (!picker.hidden) renderInvitePicker();
  });
  function renderInvitePicker() {
    var picker = $('invitePicker'), open = friends().filter(function (x) { return infoFeatures.indexOf(x.id) < 0; });
    picker.textContent = '';
    open.sort(function (a, b) { return personName(a).localeCompare(personName(b), 'de'); }).forEach(function (x) {
      picker.append(personRow(x, [{ label: 'Einladen', primary: true, run: function () {
        infoFeatures.push(x.id);
        rightsOf(x.id);
        picker.hidden = true;
        renderFeatureBox();
      } }]));
    });
    if (!open.length) {
      picker.append(el('li', 'empty', friends().length ? 'Alle deine Freunde sind schon eingeladen.'
        : 'Noch keine Freunde – über den Freunde-Knopf oben rechts kannst du welche hinzufügen.'));
    }
  }
  // what happened to an invitation: 'accepted', 'invited' or '' (not sent yet)
  function memberState(p, id) {
    var r = p && (ownFeatures[p.id] || []).find(function (x) { return x.member === id; });
    return r ? (r.accepted ? 'accepted' : 'invited') : '';
  }
  // one row per invited friend: status, what they may change, remove
  var RIGHTS = [['text', 'Text'], ['beat', 'Beat'], ['license', 'Lizenz'], ['info', 'Song-Infos'], ['status', 'Status']];
  var infoRights = {};
  function rightsOf(id) { return infoRights[id] || (infoRights[id] = {}); }
  function renderInfoRights() {
    var box = $('infoRights');
    box.textContent = '';
    infoFeatures.forEach(function (id) {
      var x = personById(id), old = infoProject && infoProject.features.find(function (f) { return f.id === id; });
      var row = el('div', 'rights-row'), r = rightsOf(id), state = memberState(infoProject, id);
      var head = el('div', 'rights-head');
      head.append(el('strong', '', personName(x) || (old && old.name) || 'Freund'));
      head.append(el('span', 'badge ' + (state === 'accepted' ? 'badge--done' : 'badge--feat'),
        state === 'accepted' ? 'Dabei' : state === 'invited' ? 'Eingeladen' : 'Wird beim Speichern eingeladen'));
      var remove = el('button', 'link-btn link-btn--danger', 'Entfernen');
      remove.type = 'button';
      remove.addEventListener('click', function () {
        infoFeatures = infoFeatures.filter(function (y) { return y !== id; });
        renderFeatureBox();
      });
      head.append(remove);
      row.append(head, el('span', 'rights-label', 'Darf ändern:'));
      var checks = el('div', 'rights-checks');
      RIGHTS.forEach(function (k) {
        var label = el('label', 'check'), cb = el('input');
        cb.type = 'checkbox';
        cb.checked = !!r[k[0]];
        cb.addEventListener('change', function () { r[k[0]] = cb.checked; });
        label.append(cb, document.createTextNode(' ' + k[1]));
        checks.append(label);
      });
      row.append(checks);
      box.append(row);
    });
  }
  function rightsText(r) {
    var on = RIGHTS.filter(function (k) { return r && r[k[0]]; }).map(function (k) { return k[1]; });
    return on.length > 1 ? on.slice(0, -1).join(', ') + ' und ' + on[on.length - 1] : on.join('');
  }
  function cleanRights(r) {
    var out = {};
    RIGHTS.forEach(function (k) { out[k[0]] = !!(r && r[k[0]]); });
    return out;
  }

  // -> { add: [ids], remove: [ids], update: [ids] } or null when nothing changed
  function applyFeatures(p) {
    if (!account || p._owner) return null;
    p.featureOn = $('featureToggle').checked;
    if (!p.featureOn) infoFeatures = [];
    var before = p.features.map(function (f) { return f.id; });
    var add = infoFeatures.filter(function (id) { return before.indexOf(id) < 0; });
    var remove = before.filter(function (id) { return infoFeatures.indexOf(id) < 0; });
    var update = infoFeatures.filter(function (id) {
      var old = p.features.find(function (f) { return f.id === id; });
      return old && JSON.stringify(cleanRights(old.rights)) !== JSON.stringify(cleanRights(rightsOf(id)));
    });
    if (!add.length && !remove.length && !update.length) return null;
    p.features = infoFeatures.map(function (id) {
      var x = personById(id), old = p.features.find(function (f) { return f.id === id; });
      return { id: id, name: personName(x) || (old && old.name) || '', rights: cleanRights(rightsOf(id)) };
    });
    p.ownerName = profile.artist || profile.name || account.email;
    return { add: add, remove: remove, update: update };
  }
  // the project row has to exist in the cloud before friends can be added to it
  function syncFeatures(p, change) {
    if (!RaimCloud.online()) { toast('Offline – Features werden erst mit Internet übernommen.'); return; }
    RaimCloud.saveProject(p).then(function () {
      var rights = {};
      p.features.forEach(function (f) { rights[f.id] = f.rights; });
      return Promise.all(change.add.map(function (id) { return RaimCloud.addMember(p.id, id, rights[id], p.title); })
        .concat(change.update.map(function (id) { return RaimCloud.setRights(p.id, id, rights[id]); }))
        .concat(change.remove.map(function (id) { return RaimCloud.removeMember(p.id, id); })));
    }).then(function () {
      if (change.add.length) {
        toast('Einladung an ' + change.add.map(function (id) { return personName(personById(id)); }).join(', ') + ' gesendet.');
      }
      return loadFriends();
    }, function (err) { toast('Features konnten nicht gespeichert werden: ' + RaimCloud.message(err)); });
  }

  // a featured friend leaves a project instead of deleting it
  function leaveProject(p) {
    confirmDialog('Projekt verlassen?', '„' + (p.title || 'Ohne Titel') + '“ gehört ' + ownerName(p) +
      '. Wenn du gehst, verschwindet es aus deiner Liste – für ' + ownerName(p) + ' bleibt es erhalten.', 'Verlassen')
      .then(function (yes) {
        if (!yes || current !== p) return;
        if (!RaimCloud.online()) { toast('Offline – verlassen geht nur mit Internet.'); return; }
        RaimCloud.leaveProject(p._owner, p.id).then(function () {
          closeProject();
          projects = projects.filter(function (x) { return x !== p; });
          return RaimDB.forgetProject(p.id);
        }).then(function () { renderProjects(); toast('Projekt verlassen.'); },
          function (err) { toast(RaimCloud.message(err)); });
      });
  }

  // open with the newest version: a friend may have changed the song in the meantime
  function openFresh(p, tab) {
    RaimDB.refreshProject(p).then(function (fresh) {
      if (fresh !== p) {
        normalize(fresh);
        projects = projects.map(function (x) { return x === p ? fresh : x; });
      }
      $('library').hidden = true;
      openProject(fresh);
      if (tab) showTab(tab);
    });
  }

  // ---------- beats & licenses of all projects ----------
  var libFilter = 'all';
  function libEntries() {
    return activeProjects().filter(function (p) { return p.beat || p.youtube || hasLicense(p.license); }).map(function (p) {
      var w = licenseWarnings(p);
      return { p: p, warnings: w, warn: w.some(function (x) { return x[0] === 'warn'; }) };
    });
  }
  function renderLibrary() {
    var all = libEntries(), list = $('libList');
    var beats = all.filter(function (e) { return e.p.beat || e.p.youtube; }).length;
    var lic = all.filter(function (e) { return hasLicense(e.p.license); }).length;
    var warn = all.filter(function (e) { return e.warn; }).length;
    var stats = $('libStats');
    stats.textContent = '';
    [[beats, beats === 1 ? 'Beat' : 'Beats'], [lic, lic === 1 ? 'Lizenz' : 'Lizenzen'], [warn, 'zu prüfen']].forEach(function (x, i) {
      var c = el('div', 'lib-stat' + (i === 2 && x[0] ? ' is-warn' : ''));
      c.append(el('strong', '', String(x[0])), el('span', '', x[1]));
      stats.append(c);
    });
    var shown = all.filter(function (e) {
      var t = e.p.license.type || '';
      return libFilter === 'warn' ? e.warn : libFilter === 'nolicense' ? !hasLicense(e.p.license)
        : libFilter === 'lease' ? /^(Lease|Premium|Free)/.test(t) : true;
    }).sort(function (a, b) { return (b.warn - a.warn) || b.p.updated - a.p.updated; });
    list.textContent = '';
    shown.forEach(function (e) {
      var p = e.p, l = p.license, li = el('li', 'lib-item' + (e.warn ? ' is-warn' : ''));
      var head = el('div', 'lib-head');
      head.append(el('strong', '', p.title || 'Ohne Titel'));
      if (p._owner) head.append(el('span', 'badge badge--feat', 'von ' + ownerName(p)));
      head.append(el('span', 'badge' + (hasLicense(l) ? '' : ' badge--warn'), hasLicense(l) ? (l.type || 'Lizenz') : 'Keine Lizenz'));
      li.append(head);
      var beat = p.beat ? '♪ ' + p.beat.name.replace(/\.\w+$/, '') : p.youtube ? '♪ YouTube-Beat' : 'Kein Beat';
      var facts = [beat];
      if (l.producer) facts.push('Prod. ' + l.producer);
      if (l.date) facts.push('gekauft ' + new Date(l.date).toLocaleDateString('de-DE'));
      facts.push(l.fileId ? 'Lizenzdatei ✓' : 'keine Lizenzdatei');
      li.append(el('p', 'lib-facts', facts.join(' · ')));
      if (l.notes) li.append(el('p', 'lib-notes', l.notes));
      var warns = e.warnings.filter(function (x) { return x[0] === 'warn'; });
      if (warns.length) {
        var ul = el('ul', 'lib-warn');
        warns.forEach(function (x) { ul.append(el('li', '', x[1])); });
        li.append(ul);
      }
      var open = el('button', 'btn btn--small', p._owner && !(p._rights && (p._rights.license || p._rights.beat)) ? 'Ansehen' : 'Öffnen');
      open.type = 'button';
      open.addEventListener('click', function () { openFresh(p, 'beat'); });
      li.append(open);
      list.append(li);
    });
    $('libEmpty').hidden = shown.length > 0;
    $('libEmpty').textContent = all.length ? 'Nichts in dieser Auswahl.' : 'Noch keine Beats oder Lizenzen. Lade in einem Projekt unter „Beat“ einen Beat und die Lizenz hoch.';
  }
  document.querySelectorAll('[data-lib]').forEach(function (b) {
    b.addEventListener('click', function () {
      libFilter = b.dataset.lib;
      document.querySelectorAll('[data-lib]').forEach(function (x) { x.classList.toggle('is-on', x === b); });
      renderLibrary();
    });
  });
  $('openLibrary').addEventListener('click', function () {
    $('home').hidden = true;
    $('library').hidden = false;
    renderLibrary();
    window.scrollTo(0, 0);
  });
  $('closeLibrary').addEventListener('click', function () {
    $('library').hidden = true;
    $('home').hidden = false;
    renderProjects();
  });

  // back in the app (other tab, phone unlocked): pick up what friends changed
  var lastSync = Date.now();
  document.addEventListener('visibilitychange', function () {
    if (document.hidden || !account || current || Date.now() - lastSync < 15000) return;
    lastSync = Date.now();
    RaimDB.sync().then(function () { return RaimDB.projects(); }).then(function (list) {
      if (current) return;
      projects = list.map(normalize);
      renderProjects();
    }, function () {});
    loadFriends();
  });

  startAccount().then(takeOverLegacy).then(function () {
    renderAccount();
    loadProfile();
    $('openFriends').hidden = !account;
    loadFriends();
    return RaimDB.projects();
  }).then(function (list) {
    projects = list.map(normalize);
    if (featuresLoaded) pruneFeatures();
    var expired = projects.filter(function (p) { return p.deletedAt && Date.now() - p.deletedAt > TRASH_DAYS * DAY; });
    return Promise.all([migrate(), expired.length ? purgeProjects(expired) : null]);
  }).then(function () {
    renderProjects();
    var openId = null;
    try { openId = sessionStorage.getItem('raim.project'); } catch (e) { /* private mode */ }
    var p = projects.find(function (x) { return x.id === openId && !x.deletedAt; });
    if (p) openProject(p);
  }).catch(function (err) {
    if (err && err.message === 'login') return;
    toast('Speicher nicht verfügbar – ist der private Modus aktiv?');
    renderProjects();
  });
})();

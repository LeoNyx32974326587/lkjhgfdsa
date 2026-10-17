// Read page behind a read link (share.html?t=…): the song text, no account needed.
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function fail(text) {
    $('shareMsg').textContent = text;
    $('shareMsg').hidden = false;
    $('song').hidden = true;
  }

  var token = new URLSearchParams(location.search).get('t') || '';
  if (!RaimCloud.configured) { fail('Leselinks gibt es nur, wenn Barbook mit Accounts eingerichtet ist.'); return; }
  if (!RaimCloud.online()) { fail('Keine Verbindung zum Server. Bist du online?'); return; }
  if (token.length < 20) { fail('Dieser Link ist unvollständig. Bitte kopier ihn noch einmal komplett.'); return; }

  RaimCloud.sharedProject(token).then(function (song) {
    if (!song) { fail('Diesen Leselink gibt es nicht mehr – vielleicht wurde er ausgeschaltet.'); return; }
    var title = song.title || 'Ohne Titel';
    document.title = title + ' – Barbook';
    $('songTitle').textContent = title;
    $('songArtist').textContent = song.artist ? 'von ' + song.artist : '';
    $('songArtist').hidden = !song.artist;
    var meta = [];
    if (song.bpm) meta.push(song.bpm + ' BPM');
    if (song.key) meta.push(song.key);
    (song.genres || []).forEach(function (g) { meta.push(g); });
    $('songMeta').textContent = meta.join(' · ');
    $('songMeta').hidden = !meta.length;

    var box = $('songText');
    box.textContent = '';
    var secs = RaimSong.expand(RaimSong.parse(song.text || ''));
    secs.forEach(function (s) {
      var lines = s.body.split('\n');
      if (s.name === null && !s.body.trim()) return;
      var sec = el('section', 'share-sec');
      if (s.name !== null) sec.append(el('h2', '', s.name + (s.repeated ? ' (Wiederholung)' : '')));
      lines.forEach(function (l) { sec.append(l.trim() ? el('p', '', l) : el('p', 'is-gap')); });
      box.append(sec);
    });
    if (!box.children.length) box.append(el('p', 'share-empty', 'Der Song hat noch keinen Text.'));
    if (song.updated) {
      $('songUpdated').textContent = 'Stand: ' + new Date(Number(song.updated)).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
    }
    $('shareMsg').hidden = true;
    $('song').hidden = false;
  }, function (err) {
    fail(RaimCloud.message(err));
  });
})();

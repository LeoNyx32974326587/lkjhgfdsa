// Beat tab of a project: the project's beat (file or YouTube), loop, tempo and recorded takes.
(function (root) {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function fmt(t) {
    if (!isFinite(t)) t = 0;
    var m = Math.floor(t / 60), s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  var toast, hooks;
  var audio = new Audio();
  audio.preservesPitch = true;
  audio.mozPreservesPitch = true;
  audio.webkitPreservesPitch = true;
  var ctx = null, mediaSrc = null, mixDest = null;
  var peaks = [], loop = null, looping = false, beatUrl = null, takeUrls = [];
  var canvas, g;
  var openId = null; // project currently shown, guards against late async results

  function audioCtx() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // ---------- open / close a project ----------
  function open(project) {
    close();
    openId = project.id;
    loop = null; looping = false; peaks = [];
    $('loopBtn').setAttribute('aria-pressed', 'false');
    $('tempo').value = 1; audio.playbackRate = 1; $('tempoOut').textContent = '100 %';
    $('deck').hidden = true;
    $('beatName').textContent = 'Beat hochladen (MP3, WAV, M4A …)';
    setSource(project.youtube && !project.beat ? 'yt' : 'file');
    $('ytUrl').value = project.youtube || '';
    $('ytFrame').hidden = $('ytControls').hidden = true;
    ytA = ytB = null; ytInfo();

    if (project.beat) {
      RaimDB.getFile(project.beat.fileId).then(function (rec) {
        if (openId !== project.id || !rec) return;
        showBeat(rec.blob, project.beat.name);
      });
    }
    renderTakes(project);
  }

  function close() {
    stopRec();
    audio.pause();
    audio.removeAttribute('src');
    if (beatUrl) { URL.revokeObjectURL(beatUrl); beatUrl = null; }
    takeUrls.forEach(URL.revokeObjectURL);
    takeUrls = [];
    stopYt();
    openId = null;
  }

  function pause() {
    audio.pause();
    if (yt && yt.pauseVideo) yt.pauseVideo();
  }

  // ---------- beat file ----------
  function showBeat(blob, name) {
    if (beatUrl) URL.revokeObjectURL(beatUrl);
    beatUrl = URL.createObjectURL(blob);
    audio.src = beatUrl;
    $('beatName').textContent = name + ' – ersetzen';
    $('deck').hidden = false;
    var id = openId;
    blob.arrayBuffer().then(function (buf) {
      return audioCtx().decodeAudioData(buf);
    }).then(function (decoded) {
      if (openId !== id) return;
      peaks = computePeaks(decoded, 160);
      draw();
    }).catch(function () {
      peaks = [];
      draw();
    });
    draw();
  }

  function uploadBeat(file) {
    if (!file) return;
    if (!/^audio\//.test(file.type) && !/\.(mp3|wav|m4a|aac|ogg|flac|aiff?)$/i.test(file.name)) {
      toast('Bitte eine Audiodatei wählen.');
      return;
    }
    var p = hooks.project(), old = p.beat && p.beat.fileId;
    RaimDB.putFile(p.id, file).then(function (fileId) {
      p.beat = { fileId: fileId, name: file.name };
      hooks.save();
      loop = null; setLoop(false);
      if (openId === p.id) showBeat(file, file.name);
      return RaimDB.deleteFile(old);
    }).catch(function () { toast('Beat konnte nicht gespeichert werden – Speicher voll?'); });
  }

  function computePeaks(buf, n) {
    var data = buf.getChannelData(0), size = Math.floor(data.length / n), out = [], max = 0;
    for (var i = 0; i < n; i++) {
      var sum = 0;
      for (var j = i * size, e = j + size; j < e; j += 16) sum += Math.abs(data[j]);
      out.push(sum);
      if (sum > max) max = sum;
    }
    return out.map(function (v) { return max ? v / max : 0; });
  }

  function draw() {
    if ($('deck').hidden) return;
    var dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w) return;
    if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    var dur = audio.duration || 0;
    if (loop && dur) {
      var x1 = loop[0] / dur * w, x2 = loop[1] / dur * w;
      g.fillStyle = looping ? 'rgba(200, 40, 140, .35)' : 'rgba(200, 40, 140, .18)';
      g.fillRect(x1, 0, x2 - x1, h);
      g.fillStyle = '#ff3b4e';
      g.fillRect(x1 - 1.5, 0, 3, h);
      g.fillRect(x2 - 1.5, 0, 3, h);
    }
    var n = peaks.length || 80, bw = w / n;
    var played = dur ? audio.currentTime / dur * w : 0;
    for (var i = 0; i < n; i++) {
      var p = peaks.length ? 0.12 + 0.88 * peaks[i] : 0.15;
      var bh = p * h * 0.9, x = i * bw;
      g.fillStyle = x < played ? '#ffffff' : 'rgba(255, 255, 255, .55)';
      g.fillRect(x + bw * 0.2, (h - bh) / 2, Math.max(1, bw * 0.6), bh);
    }
    if (dur) {
      g.fillStyle = '#5ee7ff';
      g.fillRect(played - 1, 0, 2, h);
    }
    $('tCur').textContent = fmt(audio.currentTime);
    $('tDur').textContent = fmt(dur);
    $('tLoop').textContent = loop ? 'Loop ' + fmt(loop[0]) + '–' + fmt(loop[1]) : '';
  }

  function tick() {
    if (looping && loop && audio.currentTime >= loop[1]) audio.currentTime = loop[0];
    draw();
    if (!audio.paused) requestAnimationFrame(tick);
  }

  function setLoop(on) {
    looping = on && !!loop;
    $('loopBtn').setAttribute('aria-pressed', String(looping));
    draw();
  }

  // ---------- recording: mic + beat mixed into one take ----------
  var recorder = null, micStream = null, chunks = [], recProject = null;

  function startRec() {
    if (!navigator.mediaDevices || !window.MediaRecorder) { toast('Aufnehmen wird in diesem Browser nicht unterstützt.'); return; }
    var ac = audioCtx();
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      .then(function (stream) {
        micStream = stream;
        if (!mediaSrc) {
          mediaSrc = ac.createMediaElementSource(audio);
          mediaSrc.connect(ac.destination);
        }
        mixDest = ac.createMediaStreamDestination();
        mediaSrc.connect(mixDest);
        ac.createMediaStreamSource(stream).connect(mixDest);
        chunks = [];
        recProject = hooks.project();
        recorder = new MediaRecorder(mixDest.stream);
        recorder.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
        recorder.onstop = saveTake;
        recorder.start();
        $('recBtn').classList.add('is-rec');
        if (looping && loop) audio.currentTime = loop[0];
        if (audio.src) audio.play();
      })
      .catch(function () { toast('Kein Zugriff aufs Mikrofon.'); });
  }

  function stopRec() {
    if (!recorder) return;
    recorder.stop();
    recorder = null;
    audio.pause();
    if (micStream) micStream.getTracks().forEach(function (t) { t.stop(); });
    try { mediaSrc.disconnect(mixDest); } catch (e) { /* already gone */ }
    $('recBtn').classList.remove('is-rec');
  }

  function saveTake() {
    var p = recProject, type = chunks[0] && chunks[0].type || 'audio/webm';
    var blob = new Blob(chunks, { type: type });
    var ext = /mp4|aac/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'webm';
    var name = 'Take ' + (p.takes.length + 1) + '.' + ext;
    RaimDB.putFile(p.id, blob, name).then(function (fileId) {
      p.takes.unshift({ fileId: fileId, name: name, created: Date.now() });
      hooks.save();
      if (openId === p.id) renderTakes(p);
    }).catch(function () { toast('Aufnahme konnte nicht gespeichert werden – Speicher voll?'); });
  }

  function renderTakes(p) {
    var ul = $('takes');
    ul.textContent = '';
    $('takesHead').hidden = !p.takes.length;
    p.takes.forEach(function (t) {
      var li = document.createElement('li');
      var head = document.createElement('div');
      head.className = 'take-head';
      var name = document.createElement('span');
      name.textContent = t.name.replace(/\.\w+$/, '') + ' · ' + new Date(t.created).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
      var actions = document.createElement('span');
      var dl = document.createElement('a');
      dl.textContent = 'Herunterladen';
      dl.download = (p.title || 'RAIM') + ' - ' + t.name;
      var del = document.createElement('button');
      del.type = 'button'; del.textContent = 'Löschen';
      del.addEventListener('click', function () {
        if (!confirm('Aufnahme löschen?')) return;
        p.takes = p.takes.filter(function (x) { return x !== t; });
        hooks.save();
        RaimDB.deleteFile(t.fileId);
        li.remove();
        $('takesHead').hidden = !p.takes.length;
      });
      actions.append(dl, ' · ', del);
      head.append(name, actions);
      var player = document.createElement('audio');
      player.controls = true;
      player.preload = 'metadata';
      li.append(head, player);
      ul.append(li);
      RaimDB.getFile(t.fileId).then(function (rec) {
        if (!rec || openId !== p.id) return;
        var url = URL.createObjectURL(rec.blob);
        takeUrls.push(url);
        player.src = url;
        dl.href = url;
      });
    });
  }

  // ---------- YouTube ----------
  var yt = null, ytA = null, ytB = null, ytLoop = false, ytTimer = null, ytApi = null;

  function parseYt(url) {
    var m = url.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/);
    return m ? m[1] : (/^[\w-]{11}$/.test(url.trim()) ? url.trim() : null);
  }
  function loadYtApi() {
    if (!ytApi) {
      ytApi = new Promise(function (resolve, reject) {
        window.onYouTubeIframeAPIReady = function () { resolve(window.YT); };
        var s = document.createElement('script');
        s.src = 'https://www.youtube.com/iframe_api';
        s.onerror = function () { ytApi = null; reject(); };
        document.head.appendChild(s);
      });
    }
    return ytApi;
  }
  function ytInfo() {
    $('ytInfo').textContent = ytA !== null || ytB !== null
      ? 'Loop: ' + (ytA !== null ? fmt(ytA) : '–') + ' bis ' + (ytB !== null ? fmt(ytB) : '–')
      : 'Setz A und B während der Beat läuft, dann „Loop“.';
  }
  function stopYt() {
    clearInterval(ytTimer);
    ytLoop = false;
    $('ytLoop').setAttribute('aria-pressed', 'false');
    if (yt && yt.stopVideo) yt.stopVideo();
  }
  function showYt(url) {
    var id = parseYt(url);
    if (!id) { toast('Das sieht nicht nach einem YouTube-Link aus.'); return false; }
    if (location.protocol === 'file:') toast('YouTube braucht einen Webserver – siehe README.');
    loadYtApi().then(function (YT) {
      $('ytFrame').hidden = false;
      $('ytControls').hidden = false;
      ytA = ytB = null; ytInfo();
      if (yt) { yt.cueVideoById(id); return; }
      yt = new YT.Player('ytPlayer', {
        videoId: id,
        playerVars: { playsinline: 1, rel: 0 },
        events: { onReady: function () { yt.setPlaybackRate(parseFloat($('ytRate').value)); } }
      });
    }, function () { toast('YouTube konnte nicht geladen werden.'); });
    return true;
  }

  function setSource(src) {
    document.querySelectorAll('[data-source]').forEach(function (x) { x.classList.toggle('is-on', x.dataset.source === src); });
    $('beatFile').hidden = src !== 'file';
    $('beatYt').hidden = src !== 'yt';
    if (src === 'yt') {
      audio.pause();
      var p = hooks.project();
      if (p && p.youtube && $('ytFrame').hidden) showYt(p.youtube);
    } else if (yt && yt.pauseVideo) yt.pauseVideo();
    if (src === 'file') draw();
  }

  // ---------- wiring ----------
  function init(toastFn, projectHooks) {
    toast = toastFn;
    hooks = projectHooks;
    canvas = $('waveCanvas');
    g = canvas.getContext('2d');

    document.querySelectorAll('[data-source]').forEach(function (b) {
      b.addEventListener('click', function () { setSource(b.dataset.source); });
    });

    // drag on the waveform to select a loop, tap to seek
    var dragStart = null, dragMode = null;
    function timeAt(e) {
      var r = canvas.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (audio.duration || 0);
    }
    canvas.addEventListener('pointerdown', function (e) {
      if (!audio.duration) return;
      canvas.setPointerCapture(e.pointerId);
      var t = timeAt(e), tol = audio.duration * 0.02;
      dragStart = t;
      if (loop && Math.abs(t - loop[0]) < tol) dragMode = 'a';
      else if (loop && Math.abs(t - loop[1]) < tol) dragMode = 'b';
      else dragMode = 'new';
    });
    canvas.addEventListener('pointermove', function (e) {
      if (dragStart === null) return;
      var t = timeAt(e);
      if (dragMode === 'a') loop[0] = Math.min(t, loop[1] - 0.2);
      else if (dragMode === 'b') loop[1] = Math.max(t, loop[0] + 0.2);
      else if (Math.abs(t - dragStart) > audio.duration * 0.01) loop = [Math.min(t, dragStart), Math.max(t, dragStart)];
      draw();
    });
    canvas.addEventListener('pointerup', function (e) {
      if (dragStart === null) return;
      var t = timeAt(e);
      if (dragMode === 'new' && Math.abs(t - dragStart) <= audio.duration * 0.01) audio.currentTime = t;
      else if (dragMode === 'new' && loop) setLoop(true);
      dragStart = dragMode = null;
      draw();
    });

    $('beatInput').addEventListener('change', function (e) { uploadBeat(e.target.files[0]); e.target.value = ''; });
    var drop = $('drop');
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('is-over'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('is-over'); });
    drop.addEventListener('drop', function (e) {
      e.preventDefault(); drop.classList.remove('is-over');
      uploadBeat(e.dataTransfer.files[0]);
    });

    $('playBtn').addEventListener('click', function () {
      if (audio.paused) {
        if (looping && loop && (audio.currentTime < loop[0] || audio.currentTime >= loop[1])) audio.currentTime = loop[0];
        audio.play();
      } else audio.pause();
    });
    audio.addEventListener('play', function () { $('playBtn').classList.add('is-playing'); requestAnimationFrame(tick); });
    audio.addEventListener('pause', function () { $('playBtn').classList.remove('is-playing'); draw(); });
    audio.addEventListener('ended', function () { $('playBtn').classList.remove('is-playing'); if (recorder) stopRec(); });
    audio.addEventListener('loadedmetadata', draw);
    window.addEventListener('resize', draw);

    $('loopBtn').addEventListener('click', function () {
      if (!loop) { toast('Zieh erst auf der Wellenform, um einen Bereich zu markieren.'); return; }
      setLoop(!looping);
    });
    $('tempo').addEventListener('input', function (e) {
      audio.playbackRate = parseFloat(e.target.value);
      $('tempoOut').textContent = Math.round(audio.playbackRate * 100) + ' %';
    });
    $('recBtn').addEventListener('click', function () {
      if (recorder) stopRec(); else startRec();
    });

    $('ytForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var url = $('ytUrl').value.trim();
      if (!showYt(url)) return;
      hooks.project().youtube = url;
      hooks.save();
    });
    $('ytA').addEventListener('click', function () { if (yt) { ytA = yt.getCurrentTime(); if (ytB !== null && ytB <= ytA) ytB = null; ytInfo(); } });
    $('ytB').addEventListener('click', function () { if (yt) { ytB = yt.getCurrentTime(); if (ytA !== null && ytB <= ytA) ytA = null; ytInfo(); } });
    $('ytLoop').addEventListener('click', function () {
      if (ytA === null || ytB === null) { toast('Setz zuerst A und B.'); return; }
      ytLoop = !ytLoop;
      $('ytLoop').setAttribute('aria-pressed', String(ytLoop));
      clearInterval(ytTimer);
      if (ytLoop) {
        yt.seekTo(ytA, true); yt.playVideo();
        ytTimer = setInterval(function () {
          if (yt.getCurrentTime() >= ytB) yt.seekTo(ytA, true);
        }, 50);
      }
    });
    $('ytRate').addEventListener('change', function (e) { if (yt) yt.setPlaybackRate(parseFloat(e.target.value)); });
  }

  root.RaimBeats = { init: init, open: open, close: close, pause: pause, redraw: draw };
})(this);

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
  var ctx = null, mediaSrc = null;
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
    $('tCur').textContent = $('miniTime').textContent = fmt(audio.currentTime);
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

  // ---------- recording ----------
  // Beat and mic are captured raw from the same audio graph, so both share one sample clock.
  // What is left is the hardware round trip (beat to headphones, voice back into the mic);
  // the voice is shifted earlier by that amount when the take is mixed.
  var rec = null; // running recording: { project, stream, nodes, beatL, beatR, mic (Float32 chunks), hasBeat, sampleRate, offsetMs }

  function autoLatencyMs(ac, stream) {
    var out = (ac.outputLatency || 0) + (ac.baseLatency || 0);
    var track = stream && stream.getAudioTracks()[0];
    var input = track && track.getSettings && track.getSettings().latency || 0.01;
    return Math.round((out + input) * 1000);
  }
  function savedLatency() {
    try { var v = localStorage.getItem('raim.latencyMs'); return v === null ? null : parseInt(v, 10); } catch (e) { return null; }
  }
  function showLatency(ms, auto) {
    $('latency').value = ms;
    $('latencyOut').textContent = ms + ' ms';
    $('latencyAuto').textContent = auto ? 'Auto (an)' : 'Auto';
  }

  function startRec() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('Aufnehmen wird in diesem Browser nicht unterstützt.'); return; }
    var ac = audioCtx();
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, latency: 0 } })
      .then(function (stream) {
        var hasBeat = !!audio.src;
        if (hasBeat && !mediaSrc) {
          mediaSrc = ac.createMediaElementSource(audio);
          mediaSrc.connect(ac.destination);
        }
        // beat -> stereo (upmix mono files) -> channels 0/1, mic -> mono -> channel 2
        var merger = ac.createChannelMerger(3);
        var beatIn = ac.createGain();
        beatIn.channelCount = 2; beatIn.channelCountMode = 'explicit'; beatIn.channelInterpretation = 'speakers';
        var split = ac.createChannelSplitter(2);
        if (hasBeat) mediaSrc.connect(beatIn);
        beatIn.connect(split);
        split.connect(merger, 0, 0);
        split.connect(merger, 1, 1);
        var micSrc = ac.createMediaStreamSource(stream);
        var micIn = ac.createGain();
        micIn.channelCount = 1; micIn.channelCountMode = 'explicit'; micIn.channelInterpretation = 'speakers';
        micSrc.connect(micIn);
        micIn.connect(merger, 0, 2);
        var proc = ac.createScriptProcessor(4096, 3, 1);
        merger.connect(proc);
        proc.connect(ac.destination); // outputs silence; needed so the processor runs

        var manual = savedLatency();
        rec = {
          project: hooks.project(), stream: stream, hasBeat: hasBeat, sampleRate: ac.sampleRate,
          offsetMs: manual === null ? autoLatencyMs(ac, stream) : manual,
          nodes: [beatIn, split, merger, micSrc, micIn, proc],
          beatL: [], beatR: [], mic: []
        };
        if (manual === null) showLatency(rec.offsetMs, true);
        proc.onaudioprocess = function (e) {
          if (!rec) return;
          var b = e.inputBuffer;
          rec.beatL.push(new Float32Array(b.getChannelData(0)));
          rec.beatR.push(new Float32Array(b.getChannelData(1)));
          rec.mic.push(new Float32Array(b.getChannelData(2)));
        };
        $('recBtn').classList.add('is-rec');
        $('miniRec').classList.add('is-rec');
        if (looping && loop) audio.currentTime = loop[0];
        if (hasBeat) audio.play();
      })
      .catch(function () { toast('Kein Zugriff aufs Mikrofon.'); });
  }

  function stopRec() {
    if (!rec) return;
    var r = rec;
    rec = null;
    audio.pause();
    r.stream.getTracks().forEach(function (t) { t.stop(); });
    r.nodes.forEach(function (n) { try { n.disconnect(); } catch (e) { /* gone */ } });
    if (r.hasBeat) { try { mediaSrc.disconnect(r.nodes[0]); } catch (e) { /* gone */ } }
    $('recBtn').classList.remove('is-rec');
    $('miniRec').classList.remove('is-rec');
    saveTake(r);
  }

  function concat(chunks) {
    var n = 0, i;
    for (i = 0; i < chunks.length; i++) n += chunks[i].length;
    var out = new Float32Array(n), o = 0;
    for (i = 0; i < chunks.length; i++) { out.set(chunks[i], o); o += chunks[i].length; }
    return out;
  }

  function saveTake(r) {
    var p = r.project, mic = concat(r.mic);
    if (mic.length < r.sampleRate * 0.3) { toast('Aufnahme zu kurz.'); return; }
    var n = p.takes.length + 1;
    var voiceBlob = RaimWav.encode([mic], r.sampleRate);
    var beatBlob = r.hasBeat ? RaimWav.encode([concat(r.beatL), concat(r.beatR)], r.sampleRate) : null;
    Promise.all([
      RaimDB.putFile(p.id, voiceBlob, 'Take ' + n + ' Stimme.wav'),
      beatBlob ? RaimDB.putFile(p.id, beatBlob, 'Take ' + n + ' Beat.wav') : null
    ]).then(function (ids) {
      p.takes.unshift({ voiceId: ids[0], beatId: ids[1], offsetMs: r.offsetMs, name: 'Take ' + n, created: Date.now() });
      hooks.save();
      if (openId === p.id) renderTakes(p);
    }).catch(function () { toast('Aufnahme konnte nicht gespeichert werden – Speicher voll?'); });
  }

  // voice shifted earlier by offsetMs, laid over the beat recorded in the same pass
  function mixTake(voice, beat, offsetMs) {
    var sr = voice.sampleRate, off = Math.round(offsetMs / 1000 * sr);
    var mic = voice.channels[0];
    var len = Math.max(0, (beat ? beat.channels[0].length : mic.length) - (beat ? 0 : off));
    var L = new Float32Array(len), R = new Float32Array(len);
    for (var i = 0; i < len; i++) {
      var v = mic[i + off] || 0;
      var l = (beat ? beat.channels[0][i] : 0) + v, rr = (beat ? beat.channels[1][i] : 0) + v;
      L[i] = l > 1 ? 1 : l < -1 ? -1 : l;
      R[i] = rr > 1 ? 1 : rr < -1 ? -1 : rr;
    }
    return { mix: RaimWav.encode([L, R], sr), voice: RaimWav.encode([mic.subarray(Math.min(off, mic.length))], sr) };
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
      var del = document.createElement('button');
      del.type = 'button'; del.textContent = 'Löschen';
      del.addEventListener('click', function () {
        if (!confirm('Aufnahme löschen?')) return;
        p.takes = p.takes.filter(function (x) { return x !== t; });
        hooks.save();
        [t.fileId, t.voiceId, t.beatId].forEach(function (id) { RaimDB.deleteFile(id); });
        li.remove();
        $('takesHead').hidden = !p.takes.length;
      });
      head.append(name, del);
      var player = document.createElement('audio');
      player.controls = true;
      player.preload = 'metadata';
      var links = document.createElement('div');
      links.className = 'take-links';
      li.append(head, player, links);
      ul.append(li);
      var base = (p.title || 'RAIM') + ' - ' + t.name.replace(/\.\w+$/, '');

      function link(text, url, file) {
        var a = document.createElement('a');
        a.textContent = text; a.href = url; a.download = file;
        return a;
      }

      if (t.fileId) { // takes from before the sync rework: one finished file
        RaimDB.getFile(t.fileId).then(function (f) {
          if (!f || openId !== p.id) return;
          var url = URL.createObjectURL(f.blob);
          takeUrls.push(url);
          player.src = url;
          links.append(link('Herunterladen', url, (p.title || 'RAIM') + ' - ' + t.name));
        });
        return;
      }

      var sync = document.createElement('label');
      sync.className = 'take-sync';
      sync.innerHTML = 'Sync <input type="range" min="0" max="800" step="5"> <output></output>';
      var range = sync.querySelector('input'), out = sync.querySelector('output');
      range.value = t.offsetMs; out.textContent = t.offsetMs + ' ms';
      li.insertBefore(sync, links);

      var voice = null, beat = null, urls = [];
      function render() {
        urls.forEach(URL.revokeObjectURL);
        var m = mixTake(voice, beat, t.offsetMs);
        urls = [URL.createObjectURL(m.mix), URL.createObjectURL(m.voice)];
        takeUrls.push(urls[0], urls[1]);
        var at = player.currentTime;
        player.src = urls[0];
        if (at) player.currentTime = at;
        links.textContent = '';
        links.append(link('Mix herunterladen', urls[0], base + '.wav'), ' · ', link('Nur Stimme', urls[1], base + ' (Stimme).wav'));
      }
      Promise.all([RaimDB.getFile(t.voiceId), t.beatId ? RaimDB.getFile(t.beatId) : null]).then(function (f) {
        if (!f[0] || openId !== p.id) return;
        return Promise.all([f[0].blob.arrayBuffer(), f[1] ? f[1].blob.arrayBuffer() : null]);
      }).then(function (bufs) {
        if (!bufs) return;
        voice = RaimWav.decode(bufs[0]);
        beat = bufs[1] ? RaimWav.decode(bufs[1]) : null;
        render();
      });
      var timer = null;
      range.addEventListener('input', function () {
        out.textContent = range.value + ' ms';
        clearTimeout(timer);
        timer = setTimeout(function () {
          t.offsetMs = parseInt(range.value, 10);
          hooks.save();
          if (voice) render();
        }, 250);
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
    function playing(on) { $('playBtn').classList.toggle('is-playing', on); $('miniPlay').classList.toggle('is-playing', on); }
    audio.addEventListener('play', function () { playing(true); requestAnimationFrame(tick); });
    audio.addEventListener('pause', function () { playing(false); draw(); });
    audio.addEventListener('ended', function () { playing(false); if (rec) stopRec(); });

    // when the deck's buttons are scrolled away (e.g. reading the lyrics), show a small bar instead
    $('miniPlay').addEventListener('click', function () { $('playBtn').click(); });
    $('miniRec').addEventListener('click', function () { $('recBtn').click(); });
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        var e = entries[entries.length - 1];
        $('miniBar').hidden = e.isIntersecting || !e.rootBounds || !$('deck').offsetParent;
      }).observe(document.querySelector('#deck .deck-controls'));
    }
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
      if (rec) stopRec(); else startRec();
    });

    var manual = savedLatency();
    showLatency(manual === null ? 0 : manual, manual === null);
    if (manual === null) $('latencyOut').textContent = 'auto';
    $('latency').addEventListener('input', function (e) {
      try { localStorage.setItem('raim.latencyMs', e.target.value); } catch (err) { /* private mode */ }
      showLatency(parseInt(e.target.value, 10), false);
    });
    $('latencyAuto').addEventListener('click', function () {
      try { localStorage.removeItem('raim.latencyMs'); } catch (err) { /* private mode */ }
      showLatency(0, true);
      $('latencyOut').textContent = 'auto';
      toast('Sync-Ausgleich wird bei der nächsten Aufnahme automatisch gemessen.');
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

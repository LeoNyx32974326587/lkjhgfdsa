// Beat tab of a project: the project's beat (file or YouTube), loop, tempo, teleprompter
// and takes recorded with earlier versions.
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
  var ctx = null;
  var peaks = [], loop = null, looping = false, beatUrl = null, takeUrls = [], decoded = null;
  var countTimers = [];
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
    loop = null; looping = false; peaks = []; decoded = null;
    $('bpmInput').value = project.bpm || project.license.bpm || '';
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
    updatePrompterCard();
  }

  function close() {
    cancelCount();
    RaimPrompter.hide();
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
    updatePrompterCard();
    $('beatName').textContent = name + ' – ersetzen';
    $('deck').hidden = false;
    var id = openId;
    blob.arrayBuffer().then(function (buf) {
      return audioCtx().decodeAudioData(buf);
    }).then(function (buf) {
      if (openId !== id) return;
      decoded = buf;
      peaks = computePeaks(buf, 160);
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
      if (hooks.changed) hooks.changed();
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
    RaimPrompter.setTime(fmt(audio.currentTime));
    $('recStart').textContent = 'ab ' + fmt(startPos());
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

  // ---------- start point, tempo, count-in ----------
  // the beat starts where the playhead is (or at the loop start)
  function startPos() {
    if (looping && loop) return loop[0];
    var d = audio.duration || 0;
    return d && audio.currentTime < d - 0.5 ? audio.currentTime : 0;
  }
  // the teleprompter plays the beat along only if one is loaded and that box is ticked
  function withBeat() { return !!audio.src && $('withBeat').checked; }
  function bpm() {
    var b = parseFloat(String($('bpmInput').value).replace(',', '.'));
    return b >= 40 && b <= 250 ? b * (withBeat() ? audio.playbackRate : 1) : 0;
  }
  // one lyric line per bar of four beats
  function secPerLine() { var b = bpm(); return b ? 4 * 60 / b : 2.6; }

  function cancelCount() {
    countTimers.forEach(clearTimeout);
    countTimers = [];
    RaimPrompter.count('');
  }


  // clicks for `bars` bars, then done(); without BPM it just waits a moment
  function countIn(done) {
    cancelCount();
    var bars = parseInt($('countIn').value, 10), b = bpm();
    if (!bars) { done(); return; }
    var beat = b ? 60 / b : 0.6, n = bars * 4, ac = audioCtx(), t0 = ac.currentTime + 0.1;
    for (var k = 0; k < n; k++) {
      var osc = ac.createOscillator(), gain = ac.createGain(), t = t0 + k * beat;
      osc.frequency.value = k % 4 === 0 ? 1600 : 1100;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.5, t + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      osc.connect(gain); gain.connect(ac.destination);
      osc.start(t); osc.stop(t + 0.08);
      (function (k) {
        countTimers.push(setTimeout(function () { RaimPrompter.count(String(k % 4 + 1)); }, (t - ac.currentTime) * 1000));
      })(k);
    }
    countTimers.push(setTimeout(function () { countTimers = []; RaimPrompter.count(''); done(); }, (t0 + n * beat - ac.currentTime) * 1000));
  }

  function lyrics() { return hooks.lyrics(); }

  // after the count-in: the beat (if used) and the scrolling start together
  function roll() {
    if (withBeat()) audio.currentTime = startPos();
    countIn(function () {
      if (withBeat()) audio.play();
      RaimPrompter.start(secPerLine());
      RaimPrompter.setPlaying(true);
    });
  }

  function practice() {
    audio.pause();
    RaimPrompter.show(lyrics());
    roll();
  }

  function promptPlay() {
    if (countTimers.length) { cancelCount(); return; }
    if (RaimPrompter.isRunning() || !audio.paused) {
      audio.pause();
      RaimPrompter.stop();
      RaimPrompter.setPlaying(false);
      return;
    }
    if (withBeat()) audio.play();
    RaimPrompter.start(secPerLine());
    RaimPrompter.setPlaying(true);
  }

  function updatePrompterCard() {
    $('withBeatLabel').hidden = !audio.src;
    $('recStart').hidden = !withBeat();
    $('bpmDetect').hidden = !audio.src;
  }

  // ---------- BPM detection: autocorrelation of the onset envelope ----------
  function detectBpm(buf) {
    var sr = buf.sampleRate, hop = 512, data = buf.getChannelData(0);
    var n = Math.min(data.length, sr * 60), frames = Math.floor(n / hop), env = new Float32Array(frames), prev = 0;
    for (var f = 0; f < frames; f++) {
      var e = 0;
      for (var i = f * hop, end = i + hop; i < end; i++) e += data[i] * data[i];
      e = Math.log(1e-9 + e);
      env[f] = Math.max(0, e - prev);
      prev = e;
    }
    var fps = sr / hop, best = 0, bestLag = 0;
    for (var bpmTry = 60; bpmTry <= 180; bpmTry += 0.5) {
      var lag = fps * 60 / bpmTry, l0 = Math.floor(lag), frac = lag - l0, sum = 0;
      for (var k = 0; k + l0 + 1 < frames; k++) sum += env[k] * (env[k + l0] * (1 - frac) + env[k + l0 + 1] * frac);
      // slight preference for the usual rap range
      sum *= bpmTry >= 75 && bpmTry <= 160 ? 1.05 : 1;
      if (sum > best) { best = sum; bestLag = bpmTry; }
    }
    return Math.round(bestLag);
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
      var base = (p.title || 'RAIM').replace(/[\\/:*?"<>|„“”‚‘’'«»]/g, '').trim() + ' - ' + t.name.replace(/\.\w+$/, '');

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
          links.append(link('Herunterladen', url, (p.title || 'RAIM').replace(/[\\/:*?"<>|„“”‚‘’'«»]/g, '').trim() + ' - ' + t.name));
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
    function playing(on) {
      $('playBtn').classList.toggle('is-playing', on);
      $('miniPlay').classList.toggle('is-playing', on);
      if (!on && RaimPrompter.isRunning() && withBeat()) { RaimPrompter.stop(); RaimPrompter.setPlaying(false); }
    }
    audio.addEventListener('play', function () { playing(true); requestAnimationFrame(tick); });
    audio.addEventListener('pause', function () { playing(false); draw(); });
    audio.addEventListener('ended', function () { playing(false); });

    // when the deck's buttons are scrolled away (e.g. reading the lyrics), show a small bar instead
    $('miniPlay').addEventListener('click', function () { $('playBtn').click(); });
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
    // start point, BPM, count-in, teleprompter
    $('bpmInput').addEventListener('change', function () {
      var p = hooks.project();
      p.bpm = $('bpmInput').value.trim();
      hooks.save();
    });
    $('bpmDetect').addEventListener('click', function () {
      if (!decoded) { toast('Lade zuerst einen Beat hoch.'); return; }
      var b = detectBpm(decoded);
      $('bpmInput').value = b;
      $('bpmInput').dispatchEvent(new Event('change'));
      toast('Erkannt: ' + b + ' BPM. Wenn es doppelt oder halb so schnell wirkt, korrigier die Zahl.');
    });
    try {
      var savedCount = localStorage.getItem('raim.countIn');
      if (savedCount !== null) $('countIn').value = savedCount;
      $('withBeat').checked = localStorage.getItem('raim.withBeat') !== '0';
    } catch (e) { /* private mode */ }
    $('countIn').addEventListener('change', function (e) {
      try { localStorage.setItem('raim.countIn', e.target.value); } catch (err) { /* private mode */ }
    });
    $('withBeat').addEventListener('change', function (e) {
      try { localStorage.setItem('raim.withBeat', e.target.checked ? '1' : '0'); } catch (err) { /* private mode */ }
      updatePrompterCard();
    });
    $('practiceBtn').addEventListener('click', practice);

    RaimPrompter.init({
      play: promptPlay,
      close: function () {
        cancelCount();
        audio.pause();
        RaimPrompter.hide();
      }
    });

    $('ytForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var url = $('ytUrl').value.trim();
      if (!showYt(url)) return;
      hooks.project().youtube = url;
      hooks.save();
      if (hooks.changed) hooks.changed();
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

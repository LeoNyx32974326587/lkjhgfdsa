// Teleprompter: the lyrics big on screen, rolling up evenly at one line per bar
// (with or without the beat). No line is highlighted; the text just runs through.
(function (root) {
  'use strict';

  function $(id) { return document.getElementById(id); }

  var items = [], lineEls = [], cb = {};
  var secPerLine = 2.6, factor = 1;
  var running = false, origin = 0, startLine = 0, raf = null, scrolledByHand = false;

  function init(callbacks) {
    cb = callbacks;
    $('prompterClose').addEventListener('click', function () { cb.close(); });
    $('prompterPlay').addEventListener('click', function () { cb.play(); });
    $('prompterSlower').addEventListener('click', function () { setFactor(factor * 1.15); });
    $('prompterFaster').addEventListener('click', function () { setFactor(factor / 1.15); });
    // while paused you can scroll by hand; playing continues from there
    ['wheel', 'touchmove'].forEach(function (ev) {
      $('prompterText').addEventListener(ev, function () { if (!running) scrolledByHand = true; }, { passive: true });
    });
  }

  function setFactor(f) {
    var now = elapsedLines();
    factor = Math.max(0.3, Math.min(4, f));
    // keep the current position when the speed changes
    if (running) { startLine = now; origin = performance.now(); }
    showSpeed();
  }
  // e.g. "92 BPM" (or "92 BPM · 115 %" after − / +), seconds per line without a BPM
  var label = '';
  function showSpeed() {
    var pct = Math.round(100 / factor);
    $('prompterSpeed').textContent = (label || (secPerLine * factor).toFixed(1).replace('.', ',') + ' s/Zeile') +
      (label && pct !== 100 ? ' · ' + pct + ' %' : '');
  }

  // list: [{ head: 'Hook' } | { line: '…' }]
  function show(list) {
    items = list;
    var box = $('prompterText');
    box.textContent = '';
    lineEls = [];
    if (!list.some(function (x) { return x.line; })) {
      var empty = document.createElement('p');
      empty.className = 'prompter-empty';
      empty.textContent = 'Noch kein Text in diesem Projekt.';
      box.append(empty);
    }
    list.forEach(function (x) {
      var e = document.createElement(x.head ? 'h4' : 'p');
      e.textContent = x.head || x.line;
      if (x.line) {
        var n = lineEls.length;
        e.addEventListener('click', function () { jump(n); });
        lineEls.push(e);
      }
      box.append(e);
    });
    startLine = 0; running = false; scrolledByHand = false;
    scrollToLine(0);
    count('');
    $('prompter').hidden = false;
    document.body.classList.add('prompter-open');
  }

  function hide() {
    stop();
    $('prompter').hidden = true;
    document.body.classList.remove('prompter-open');
  }

  function elapsedLines() {
    if (!running) return startLine;
    return startLine + (performance.now() - origin) / 1000 / (secPerLine * factor);
  }

  // seconds per line from the BPM; fresh: back to exactly that tempo (drops − / + changes)
  function start(seconds, speedLabel, fresh) {
    if (scrolledByHand) { startLine = lineAtScroll(); scrolledByHand = false; }
    secPerLine = seconds;
    if (speedLabel !== undefined) label = speedLabel;
    if (fresh) factor = 1;
    showSpeed();
    origin = performance.now();
    running = true;
    cancelAnimationFrame(raf);
    loop();
  }
  function stop() {
    if (running) startLine = elapsedLines();
    running = false;
    cancelAnimationFrame(raf);
  }
  function loop() {
    if (!running) return;
    scrollToLine(elapsedLines());
    raf = requestAnimationFrame(loop);
  }

  function jump(n) {
    startLine = n;
    origin = performance.now();
    scrolledByHand = false;
    scrollToLine(n);
  }

  function mid(e) { return e.offsetTop + e.offsetHeight / 2; }

  // pos is a line number with fraction: 2.5 = halfway from line 3 to line 4.
  // The text glides between line positions, so headers in between just roll past.
  function scrollToLine(pos) {
    var n = lineEls.length, box = $('prompterText');
    if (!n) return;
    pos = Math.max(0, Math.min(pos, n - 1));
    var i = Math.floor(pos), f = pos - i, a = mid(lineEls[i]);
    var y = i + 1 < n ? a + (mid(lineEls[i + 1]) - a) * f : a;
    box.scrollTop = y - box.clientHeight / 2;
  }

  // the reverse: which line position is in the middle of the screen right now
  function lineAtScroll() {
    var box = $('prompterText'), y = box.scrollTop + box.clientHeight / 2, n = lineEls.length;
    if (!n || y <= mid(lineEls[0])) return 0;
    for (var i = 0; i + 1 < n; i++) {
      var a = mid(lineEls[i]), b = mid(lineEls[i + 1]);
      if (y < b) return i + (y - a) / (b - a);
    }
    return n - 1;
  }

  function count(text) {
    var c = $('prompterCount');
    c.textContent = text;
    c.hidden = text === '';
  }

  function setPlaying(on) { $('prompterPlay').classList.toggle('is-playing', on); }
  function setTime(t) { $('prompterTime').textContent = t; }
  function isOpen() { return !$('prompter').hidden; }
  function isRunning() { return running; }

  root.RaimPrompter = {
    init: init, show: show, hide: hide, start: start, stop: stop, count: count,
    setPlaying: setPlaying, setTime: setTime, isOpen: isOpen, isRunning: isRunning
  };
})(this);

// Teleprompter: the lyrics big on screen, scrolling one line per bar (with or without the beat).
(function (root) {
  'use strict';

  function $(id) { return document.getElementById(id); }

  var items = [], lineEls = [], cb = {};
  var secPerLine = 2.6, factor = 1;
  var running = false, origin = 0, startLine = 0, current = -1, raf = null;

  function init(callbacks) {
    cb = callbacks;
    $('prompterClose').addEventListener('click', function () { cb.close(); });
    $('prompterPlay').addEventListener('click', function () { cb.play(); });
    $('prompterSlower').addEventListener('click', function () { setFactor(factor * 1.15); });
    $('prompterFaster').addEventListener('click', function () { setFactor(factor / 1.15); });
    try { factor = parseFloat(localStorage.getItem('raim.prompterFactor')) || 1; } catch (e) { factor = 1; }
  }

  function setFactor(f) {
    var now = elapsedLines();
    factor = Math.max(0.3, Math.min(4, f));
    try { localStorage.setItem('raim.prompterFactor', String(factor)); } catch (e) { /* private mode */ }
    // keep the current position when the speed changes
    if (running) { startLine = now; origin = performance.now(); }
    showSpeed();
  }
  function showSpeed() { $('prompterSpeed').textContent = (secPerLine * factor).toFixed(1).replace('.', ',') + ' s/Zeile'; }

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
    startLine = 0; current = -1; running = false;
    highlight(0, true);
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

  function start(seconds) {
    secPerLine = seconds;
    showSpeed();
    origin = performance.now();
    running = true;
    cancelAnimationFrame(raf);
    loop();
  }
  function stop() {
    if (running) startLine = Math.floor(elapsedLines());
    running = false;
    cancelAnimationFrame(raf);
  }
  function loop() {
    if (!running) return;
    highlight(Math.floor(elapsedLines()));
    raf = requestAnimationFrame(loop);
  }

  function jump(n) {
    startLine = n;
    origin = performance.now();
    highlight(n, true);
  }

  function highlight(n, force) {
    n = Math.min(n, lineEls.length - 1);
    if (n === current && !force) return;
    if (lineEls[current]) lineEls[current].classList.remove('is-now');
    current = n;
    lineEls.forEach(function (e, i) { e.classList.toggle('is-past', i < n); });
    var e = lineEls[n];
    if (!e) return;
    e.classList.add('is-now');
    var box = $('prompterText');
    box.scrollTo({ top: e.offsetTop - box.clientHeight * 0.32, behavior: 'smooth' });
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

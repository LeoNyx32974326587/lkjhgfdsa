// Beat analysis: tempo (BPM) and key from a decoded AudioBuffer.
(function (root) {
  'use strict';

  // ---------- BPM: autocorrelation of the onset envelope ----------
  function bpm(buf) {
    var sr = buf.sampleRate, hop = 512, data = buf.getChannelData(0);
    var n = Math.min(data.length, sr * 60), frames = Math.floor(n / hop), env = new Float32Array(frames), prev = 0;
    for (var f = 0; f < frames; f++) {
      var e = 0;
      for (var i = f * hop, end = i + hop; i < end; i++) e += data[i] * data[i];
      e = Math.log(1e-9 + e);
      env[f] = Math.max(0, e - prev);
      prev = e;
    }
    var fps = sr / hop;
    function strength(b) {
      var lag = fps * 60 / b, l0 = Math.floor(lag), frac = lag - l0, sum = 0;
      // compare with one, two and four beats later so small tempo errors add up and show
      [1, 2, 4].forEach(function (m) {
        var L = lag * m, i0 = Math.floor(L), fr = L - i0;
        for (var k = 0; k + i0 + 1 < frames; k++) sum += env[k] * (env[k + i0] * (1 - fr) + env[k + i0 + 1] * fr);
      });
      return sum;
    }
    var best = 0, bestBpm = 0, b;
    for (b = 60; b <= 180; b += 0.5) {
      // slight preference for the usual rap range
      var v = strength(b) * (b >= 75 && b <= 160 ? 1.05 : 1);
      if (v > best) { best = v; bestBpm = b; }
    }
    var fine = bestBpm;
    best = 0;
    for (b = bestBpm - 1; b <= bestBpm + 1; b += 0.05) {
      var w = strength(b);
      if (w > best) { best = w; fine = b; }
    }
    // very slow results are almost always the half-time reading of a faster beat
    if (fine < 70) fine *= 2;
    return Math.round(fine);
  }


  // ---------- key: pitch-class profile matched against Krumhansl's key profiles ----------
  var MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  var MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  var NAMES_MAJOR = ['C-Dur', 'Des-Dur', 'D-Dur', 'Es-Dur', 'E-Dur', 'F-Dur', 'Fis-Dur', 'G-Dur', 'As-Dur', 'A-Dur', 'B-Dur', 'H-Dur'];
  var NAMES_MINOR = ['C-Moll', 'Cis-Moll', 'D-Moll', 'Es-Moll', 'E-Moll', 'F-Moll', 'Fis-Moll', 'G-Moll', 'Gis-Moll', 'A-Moll', 'B-Moll', 'H-Moll'];

  // in-place radix-2 FFT
  function fft(re, im) {
    var n = re.length, i, j, k, len, t;
    for (i = 1, j = 0; i < n; i++) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (len = 2; len <= n; len <<= 1) {
      var ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (i = 0; i < n; i += len) {
        var cr = 1, ci = 0;
        for (k = 0; k < len / 2; k++) {
          var ar = re[i + k + len / 2], ai = im[i + k + len / 2];
          var xr = ar * cr - ai * ci, xi = ar * ci + ai * cr;
          re[i + k + len / 2] = re[i + k] - xr; im[i + k + len / 2] = im[i + k] - xi;
          re[i + k] += xr; im[i + k] += xi;
          t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }

  function corr(a, b) {
    var ma = 0, mb = 0, i;
    for (i = 0; i < 12; i++) { ma += a[i]; mb += b[i]; }
    ma /= 12; mb /= 12;
    var num = 0, da = 0, db = 0;
    for (i = 0; i < 12; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) * (a[i] - ma); db += (b[i] - mb) * (b[i] - mb); }
    return num / Math.sqrt(da * db || 1);
  }

  // -> German key name like "A-Moll", or '' for silence
  function key(buf) {
    var sr = buf.sampleRate, ch = buf.numberOfChannels, len = buf.length;
    var N = 8192, win = new Float32Array(N), chroma = new Float64Array(12), bass = new Float64Array(12), i, k;
    for (i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    // which pitch class each FFT bin belongs to (40 Hz – 2 kHz); below 250 Hz counts as bass
    var lo = Math.ceil(40 * N / sr), bassTop = Math.floor(250 * N / sr), hi = Math.min(N / 2 - 1, Math.floor(2000 * N / sr)), pcOf = new Int8Array(N / 2);
    for (k = lo; k <= hi; k++) pcOf[k] = ((Math.round(12 * Math.log2(k * sr / N / 440)) % 12) + 12 + 9) % 12;
    var data = [];
    for (var c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    var maxFrames = Math.floor(Math.min(len, sr * 90) / N), start = Math.max(0, Math.floor((len - maxFrames * N) / 2));
    var re = new Float64Array(N), im = new Float64Array(N);
    for (var f = 0; f < maxFrames; f++) {
      var off = start + f * N, energy = 0;
      for (i = 0; i < N; i++) {
        var v = 0;
        for (c = 0; c < ch; c++) v += data[c][off + i];
        re[i] = v / ch * win[i]; im[i] = 0;
        energy += re[i] * re[i];
      }
      if (energy < 1e-6) continue;
      fft(re, im);
      for (k = lo; k <= hi; k++) {
        var m = Math.sqrt(Math.sqrt(re[k] * re[k] + im[k] * im[k]));
        chroma[pcOf[k]] += m;
        if (k <= bassTop) bass[pcOf[k]] += m;
      }
    }
    if (!chroma.some(function (x) { return x > 0; })) return '';
    // the bass mostly plays the root, so it counts double
    var bmax = Math.max.apply(null, bass) || 1, cmax = Math.max.apply(null, chroma) || 1;
    var mix = [];
    for (i = 0; i < 12; i++) mix.push(chroma[i] / cmax + 2 * bass[i] / bmax);
    var scores = [];
    for (var t = 0; t < 12; t++) {
      var rot = [];
      for (i = 0; i < 12; i++) rot.push(mix[(i + t) % 12]);
      scores.push({ tonic: t, minor: false, r: corr(rot, MAJOR) }, { tonic: t, minor: true, r: corr(rot, MINOR) });
    }
    scores.sort(function (a, b) { return b.r - a.r; });
    var best = scores[0];
    // major and its relative minor share all notes (C-Dur / A-Moll): when close, the stronger bass root decides
    var rel = scores.filter(function (x) {
      return x.minor !== best.minor && x.tonic === (best.minor ? (best.tonic + 3) % 12 : (best.tonic + 9) % 12);
    })[0];
    if (rel && best.r - rel.r < 0.15 && bass[rel.tonic] > bass[best.tonic]) best = rel;
    return (best.minor ? NAMES_MINOR : NAMES_MAJOR)[best.tonic];
  }

  root.RaimAnalyze = { bpm: bpm, key: key, KEYS: NAMES_MAJOR.concat(NAMES_MINOR) };
})(this);

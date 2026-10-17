// RAIM rhyme engine: approximates German pronunciation and scores rhymes by sound.
(function (root) {
  'use strict';

  var VOWEL_RULES = [
    ['ieh', 'i', 1], ['ie', 'i', 1], ['ih', 'i', 1],
    ['äu', 'Y', 1], ['eu', 'Y', 1],
    ['ei', 'A', 1], ['ai', 'A', 1], ['ey', 'A', 1], ['ay', 'A', 1],
    ['au', 'W', 1],
    ['aa', 'a', 1], ['ah', 'a', 1], ['ee', 'e', 1], ['eh', 'e', 1],
    ['oo', 'o', 1], ['oh', 'o', 1], ['uh', 'u', 1],
    ['äh', 'e', 1], ['öh', 'ö', 1], ['üh', 'ü', 1],
    ['a', 'a', 0], ['e', 'e', 0], ['i', 'i', 0], ['o', 'o', 0], ['u', 'u', 0],
    ['ä', 'e', 0], ['ö', 'ö', 0], ['ü', 'ü', 0], ['y', 'ü', 0]
  ];
  var CONS_RULES = [
    ['tsch', 'tS'], ['sch', 'S'], ['chs', 'ks'], ['ch', 'X'], ['ck', 'k'],
    ['ph', 'f'], ['th', 't'], ['qu', 'kv'], ['tz', 'ts'], ['dt', 't'],
    ['ng', 'N'], ['nk', 'Nk'],
    ['b', 'b'], ['c', 'k'], ['d', 'd'], ['f', 'f'], ['g', 'g'], ['h', 'h'],
    ['j', 'j'], ['k', 'k'], ['l', 'l'], ['m', 'm'], ['n', 'n'], ['p', 'p'],
    ['r', 'r'], ['s', 's'], ['ß', 's'], ['t', 't'], ['v', 'f'], ['w', 'v'],
    ['x', 'ks'], ['z', 'ts']
  ];
  var DEVOICE = { b: 'p', d: 't', g: 'k' };
  var CLASS = {
    p: 'P', t: 'P', k: 'P', b: 'P', d: 'P', g: 'P',
    m: 'N', n: 'N', N: 'N',
    f: 'F', v: 'F', s: 'F', S: 'F', X: 'F', h: 'F', j: 'F',
    l: 'L', r: 'L'
  };
  var FULL_VOWELS = 'aeiouöüAYW';

  function startsAt(s, i, pat) { return s.substr(i, pat.length) === pat; }

  // -> { v: vowel codes, long: length flags, cons: consonant clusters between vowels
  //      (cons[0] = onset, cons[n] = coda), pos: char index where each vowel starts }
  function transcribe(word) {
    var s = word.toLowerCase();
    var v = [], long = [], short = [], pos = [], cons = [''];
    var i = 0, r, k, matched;
    while (i < s.length) {
      matched = false;
      for (k = 0; k < VOWEL_RULES.length; k++) {
        r = VOWEL_RULES[k];
        // "ah", "eh" ... only lengthen when the h is not starting a new syllable
        if (startsAt(s, i, r[0]) && !(r[0].length === 2 && r[0][1] === 'h' && 'aeiouäöüy'.indexOf(s[i + 2]) >= 0)) {
          v.push(r[1]); long.push(r[2]); short.push(0); pos.push(i); cons.push('');
          i += r[0].length; matched = true; break;
        }
      }
      if (matched) continue;
      for (k = 0; k < CONS_RULES.length; k++) {
        r = CONS_RULES[k];
        if (startsAt(s, i, r[0])) {
          var c = cons[cons.length - 1];
          // a doubled consonant shortens the vowel before it
          if (s[i + 1] === s[i] && r[0].length === 1) { i++; if (long.length && c === '') short[short.length - 1] = 1; }
          if ((r[0] === 'ck' || r[0] === 'tz') && long.length && c === '') short[short.length - 1] = 1;
          if (r[0] === 'ß' && long.length && c === '') long[long.length - 1] = 1;
          if (!(r[1] === 'h' && v.length && c === '')) cons[cons.length - 1] = c + r[1];
          i += r[0].length; matched = true; break;
        }
      }
      if (!matched) i++;
    }
    var n = v.length;
    // a plain vowel in an open syllable (one consonant, then a vowel) is long: "Gu-ter", "Sa-ge"
    for (k = 0; k < n; k++) {
      if (!long[k] && !short[k] && FULL_VOWELS.indexOf(v[k]) >= 0 && k + 1 < n && cons[k + 1].length <= 1) long[k] = 1;
    }
    // final devoicing and -ig
    for (k = 1; k <= n; k++) {
      var cl = cons[k];
      if (!cl) continue;
      if (k === n) {
        if (v[n - 1] === 'i' && cl === 'g') cl = 'X';
        cl = cl.replace(/[bdg]$/, function (m) { return DEVOICE[m]; });
      }
      cl = cl.replace(/[bdg](?=[^aeiou])/g, function (m) { return DEVOICE[m]; });
      cons[k] = cl;
    }
    // unstressed endings: -e, -en, -el, -em, -es, -et, -ern => schwa; -er => vocalic r
    if (n >= 2 && v[n - 1] === 'e' && !long[n - 1]) {
      var coda = cons[n];
      if (coda === 'r') { v[n - 1] = '6'; cons[n] = ''; }
      else if (/^(|n|l|m|s|t|st|rn|ns|nt|ls|lt|nd|rs|rt)$/.test(coda)) v[n - 1] = '@';
    }
    return { v: v, long: long, cons: cons, pos: pos };
  }

  function vsim(a, b) {
    if (a === b) return 1;
    var p = a < b ? a + b : b + a;
    switch (p) {
      case '6a': return 0.75;
      case '6@': return 0.55;
      case 'iü': return 0.6;
      case 'eö': return 0.6;
      case 'ou': return 0.35;
      case 'oö': return 0.3;
      case 'uü': return 0.3;
      case 'Ae': return 0.25;
      case 'Wo': return 0.25;
      default: return 0;
    }
  }

  function csim(a, b) {
    if (a === b) return 1;
    if (!a || !b) return a.length + b.length <= 1 ? 0.5 : 0.2;
    var la = a[a.length - 1], lb = b[b.length - 1];
    var s = la === lb ? 0.7 : CLASS[la] === CLASS[lb] ? 0.5 : 0.15;
    if (a.length !== b.length) s -= 0.1;
    return Math.max(0, s);
  }

  var WEIGHTS = [1, 0.8, 0.6, 0.45, 0.35, 0.25];

  function key(t) { return t.v.join(''); }

  // Score how well candidate c rhymes on query q (both transcriptions). 0..1
  function score(q, c) {
    var qn = q.v.length, cn = c.v.length;
    if (!qn || !cn) return 0;
    var m = Math.min(qn, cn, WEIGHTS.length);
    var sum = 0, total = 0, matched = 0, j, w, s;
    for (j = 0; j < Math.min(qn, WEIGHTS.length); j++) total += WEIGHTS[j];
    for (j = 0; j < m; j++) {
      s = vsim(q.v[qn - 1 - j], c.v[cn - 1 - j]);
      if (s && q.long[qn - 1 - j] !== c.long[cn - 1 - j] && FULL_VOWELS.indexOf(q.v[qn - 1 - j]) >= 0 && 'AYW'.indexOf(q.v[qn - 1 - j]) < 0) s *= 0.85;
      if (j === 0 && s < 0.5) return 0;
      if (s < 0.25) break;
      w = WEIGHTS[j];
      // consonants between this vowel and the next one also have to sound alike
      var cs = csim(q.cons[qn - j], c.cons[cn - j]);
      sum += w * s * (0.55 + 0.45 * cs);
      matched++;
    }
    // a weak ending alone (-en, -er) is no rhyme: the stressed vowel before it must match too
    if (FULL_VOWELS.indexOf(q.v[qn - 1]) < 0 && qn > 1 && matched < 2) return 0;
    var base = sum / total;
    var onset = csim(q.cons[qn - matched] || '', c.cons[cn - matched] || '');
    var r = base * 0.94 + 0.06 * (matched >= qn ? onset : 0.5);
    // too many extra syllables up front makes it clunky
    if (cn > qn + 2) r -= 0.02 * (cn - qn - 2);
    return Math.max(0, Math.min(1, r));
  }

  var ONSETS = ['schl', 'schm', 'schn', 'schr', 'schw', 'str', 'spr', 'spl', 'sch', 'pfl', 'pfr',
    'kl', 'kn', 'kr', 'gl', 'gn', 'gr', 'bl', 'br', 'dr', 'fl', 'fr', 'pl', 'pr', 'tr', 'zw',
    'st', 'sp', 'ch', 'ph', 'pf', 'qu', 'th'];

  // Literal ending of the last stressed syllable, e.g. "Nachrichtendienst" -> "dienst".
  // For a one-syllable stem ("Liebe", "Mutter") this is the whole word.
  function ending(word, t) {
    t = t || transcribe(word);
    var n = t.v.length;
    if (!n) return '';
    var k = n - 1;
    if (FULL_VOWELS.indexOf(t.v[k]) < 0 && k > 0) k--;
    if (!t.pos) return '';
    var s = word.toLowerCase(), p = t.pos[k], start = p;
    while (start > 0 && 'aeiouäöüy'.indexOf(s[start - 1]) < 0) start--;
    var cluster = s.slice(start, p), onset = cluster.slice(-1);
    for (var o = 0; o < ONSETS.length; o++) {
      if (cluster.slice(-ONSETS[o].length) === ONSETS[o]) { onset = ONSETS[o]; break; }
    }
    var e = s.slice(p - onset.length);
    return e.length >= 3 ? e : '';
  }

  // ---------- English: CMU pronunciations (ARPAbet) mapped onto the same sound codes ----------
  var ARPA_V = {
    AA: ['a', 1], AE: ['e', 0], AH: ['a', 0], AO: ['o', 1], AW: ['W', 1], AY: ['A', 1],
    EH: ['e', 0], ER: ['ö', 1], EY: ['e', 1], IH: ['i', 0], IY: ['i', 1], OW: ['o', 1],
    OY: ['Y', 1], UH: ['u', 0], UW: ['u', 1]
  };
  var ARPA_C = {
    B: 'b', CH: 'tS', D: 'd', DH: 'd', F: 'f', G: 'g', HH: 'h', JH: 'dS', K: 'k', L: 'l',
    M: 'm', N: 'n', NG: 'N', P: 'p', R: 'r', S: 's', SH: 'S', T: 't', TH: 't', V: 'v',
    W: 'v', Y: 'j', Z: 's', ZH: 'S'
  };

  // "M AH1 N IY0" -> transcription like transcribe() gives for German words
  function fromArpa(phones) {
    var v = [], long = [], cons = [''], ph = phones.split(' ');
    for (var i = 0; i < ph.length; i++) {
      var p = ph[i], base = p.replace(/\d$/, ''), stress = p.slice(-1);
      if (ARPA_V[base]) {
        var code = ARPA_V[base][0], ln = ARPA_V[base][1];
        // unstressed: "ah" becomes a schwa, "er" the vocalic r (like German "-er")
        if (stress === '0' && base === 'AH') { code = '@'; ln = 0; }
        if (stress === '0' && base === 'ER') { code = '6'; ln = 0; }
        v.push(code); long.push(ln); cons.push('');
      } else if (ARPA_C[base]) {
        cons[cons.length - 1] += ARPA_C[base];
      }
    }
    return { v: v, long: long, cons: cons, pos: null };
  }

  // join word transcriptions of a phrase ("Rechnung bezahle")
  function concatT(list) {
    var out = { v: [], long: [], cons: [''], pos: null };
    list.forEach(function (t) {
      out.cons[out.cons.length - 1] += t.cons[0];
      for (var i = 0; i < t.v.length; i++) {
        out.v.push(t.v[i]); out.long.push(t.long[i]); out.cons.push(t.cons[i + 1]);
      }
    });
    return out;
  }

  // crude inflection stem so "Anlage" and "Anlagen" count as the same word
  function stemOf(lower) { return lower.replace(/(e|en|er|es|em|n|s)$/, '').replace(/ß/g, 'ss'); }

  // One language's word list. The first `ranked` words are ordered by frequency.
  // toT(i) returns the transcription of word i.
  function Index(lang, words, ranked, toT) {
    this.lang = lang;
    this.words = words;
    this.ranked = ranked;
    this.toT = toT;
    this.lower = new Array(words.length);
    this.t = new Array(words.length);
    this.byLower = new Map();
    this.ready = false;
  }
  // build in slices so the UI stays responsive
  Index.prototype.build = function (onDone, slice) {
    var self = this, i = 0, N = this.words.length;
    slice = slice || 20000;
    function step() {
      var end = Math.min(N, i + slice);
      for (; i < end; i++) {
        var l = self.words[i].toLowerCase();
        self.lower[i] = l;
        self.t[i] = self.toT(i);
        if (!self.byLower.has(l)) self.byLower.set(l, i);
      }
      if (i < N) setTimeout(step, 0);
      else { self.ready = true; if (onDone) onDone(); }
    }
    step();
  };

  // q: { t, lower, stem, ending } ; opts: { limit, exclude, penalty }
  Index.prototype.scan = function (q, opts) {
    var hits = [], group = [], end = this.lang === 'de' ? q.ending : '';
    for (var i = 0; i < this.words.length; i++) {
      var w = this.lower[i];
      if (w === q.lower || stemOf(w) === q.stem) continue;
      if (end && w.length > end.length && w.slice(-end.length) === end) {
        if (group.length < 400) group.push(this.words[i]);
        continue;
      }
      if (opts.exclude && opts.exclude.has(q.lower + '|' + w)) continue;
      // skip words that only repeat the query's own tail ("dienst" for "Nachrichtendienst")
      if (q.lower.length > 4 && w.length >= 3 && q.lower.slice(-w.length) === w) continue;
      var s = score(q.t, this.t[i]);
      if (s < 0.45) continue;
      // common words first among equally good rhymes
      if (i < this.ranked) s += 0.03 * (1 - i / this.ranked);
      hits.push([s - (opts.penalty || 0), i]);
    }
    return { hits: hits, group: group };
  };

  // Rhyme search over one or more languages.
  function Engine() { this.indexes = {}; }
  Engine.prototype.add = function (index) { this.indexes[index.lang] = index; };
  Engine.prototype.ready = function (lang) { var x = this.indexes[lang]; return !!(x && x.ready); };

  // pronunciation of one word: from the dictionary of the language that knows it
  Engine.prototype.wordT = function (word, primary) {
    var l = word.toLowerCase(), de = this.indexes.de, en = this.indexes.en;
    var inDe = de && de.ready && de.byLower.has(l), inEn = en && en.ready && en.byLower.has(l);
    // words in both lists ("Money", "Hand"): English if it is far more common there
    var deRank = inDe ? de.byLower.get(l) : Infinity, enRank = inEn ? en.byLower.get(l) : Infinity;
    if (deRank >= de.ranked) deRank = Infinity;
    if (inEn && (primary === 'en' || !inDe || enRank * 3 < deRank)) return { lang: 'en', t: en.t[enRank] };
    return { lang: inDe || primary !== 'en' ? 'de' : 'en', t: transcribe(word), guessed: !inDe };
  };

  Engine.prototype.queryOf = function (query, primary) {
    var q = query.trim().replace(/\s+/g, ' ');
    var parts = q.split(' ').filter(Boolean), self = this;
    var infos = parts.map(function (w) { return self.wordT(w.replace(/[^A-Za-zÄÖÜäöüß']/g, '') || w, primary); });
    var last = infos[infos.length - 1];
    var lower = q.toLowerCase().replace(/ /g, '');
    return {
      text: q,
      t: concatT(infos.map(function (x) { return x.t; })),
      lower: lower,
      stem: stemOf(lower),
      lang: last ? last.lang : primary,
      ending: last && last.lang === 'de' ? ending(parts[parts.length - 1]) : ''
    };
  };

  // opts: { langs: ['de', 'en'], primary, limit, exclude: Set }
  Engine.prototype.search = function (query, opts) {
    opts = opts || {};
    var primary = opts.primary || 'de', limit = opts.limit || 80, self = this;
    var q = this.queryOf(query, primary);
    var hits = [], group = [];
    (opts.langs || [primary]).forEach(function (lang) {
      var idx = self.indexes[lang];
      if (!idx || !idx.ready) return;
      var r = idx.scan(q, { exclude: opts.exclude, penalty: lang === primary ? 0 : 0.03 });
      r.hits.forEach(function (h) { hits.push([h[0], h[1], idx]); });
      group = group.concat(r.group);
    });
    hits.sort(function (a, b) { return b[0] - a[0] || a[1] - b[1]; });
    var out = [], seen = {}, perEnd = {};
    for (var h = 0; h < hits.length && out.length < limit; h++) {
      var idx = hits[h][2], i = hits[h][1], word = idx.words[i];
      var stem = idx.lang + stemOf(word.toLowerCase());
      if (seen[stem]) continue;
      seen[stem] = 1;
      // keep the list varied: at most two compounds on the same final word
      var e2 = (idx.lang === 'de' && ending(word, idx.t[i])) || stem;
      perEnd[e2] = (perEnd[e2] || 0) + 1;
      if (perEnd[e2] > 2) continue;
      var sc = Math.min(1, hits[h][0]);
      out.push({
        word: word,
        lang: idx.lang,
        score: sc,
        kind: Math.min(q.t.v.length, idx.t[i].v.length) >= 2 && sc >= 0.7 ? 'multi' : 'end'
      });
    }
    group.sort(function (a, b) { return a.length - b.length; });
    return { query: q.text, lang: q.lang, ending: q.ending, endings: group, results: out };
  };

  // how well `word` rhymes on `target` (both may be phrases), 0..1
  Engine.prototype.rhymeScore = function (word, target, primary) {
    return score(this.queryOf(target, primary).t, this.queryOf(word, primary).t);
  };

  var api = { transcribe: transcribe, fromArpa: fromArpa, score: score, ending: ending, Index: Index, Engine: Engine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RaimRhyme = api;
})(this);

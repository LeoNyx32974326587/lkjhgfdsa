// Reads a beat license PDF without AI: extracts the text with pdf.js and looks for the usual
// patterns of BeatStars/Airbit-style contracts (BPM, key, producer, license type, date, limits).
(function (root) {
  'use strict';

  var PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  var pdfPromise = null;

  function loadPdfJs() {
    if (!pdfPromise) {
      pdfPromise = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = PDFJS + 'pdf.min.js';
        s.onload = function () {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
          resolve(window.pdfjsLib);
        };
        s.onerror = function () { pdfPromise = null; s.remove(); reject(new Error('pdf.js')); };
        document.head.appendChild(s);
      });
    }
    return pdfPromise;
  }

  function pdfText(file) {
    return Promise.all([loadPdfJs(), file.arrayBuffer()]).then(function (r) {
      return r[0].getDocument({ data: new Uint8Array(r[1]) }).promise;
    }).then(function (doc) {
      var pages = [];
      for (var i = 1; i <= Math.min(doc.numPages, 15); i++) pages.push(doc.getPage(i).then(function (pg) { return pg.getTextContent(); }));
      return Promise.all(pages);
    }).then(function (contents) {
      return contents.map(function (c) {
        return c.items.map(function (it) { return it.str + (it.hasEOL ? '\n' : ' '); }).join('');
      }).join('\n');
    });
  }

  var NOTES = { a: 'A', b: 'B', c: 'C', d: 'D', e: 'E', f: 'F', g: 'G', h: 'H' };

  // "A minor", "F#m", "Am", "fis-moll" -> "A-Moll", "Fis-Moll"
  function germanKey(raw) {
    var m = raw.trim().match(/^([A-Ha-h])\s*(#|♯|b|♭|is|es|s)?\s*-?\s*(maj(?:or)?|min(?:or)?|moll|dur|m)?\b/i);
    if (!m) return '';
    var note = NOTES[m[1].toLowerCase()], acc = (m[2] || '').toLowerCase();
    if (acc === '#' || acc === '♯' || acc === 'is') note += 'is';
    else if (acc === 'b' || acc === '♭' || acc === 'es' || acc === 's') note = note === 'B' ? 'B' : note === 'E' ? 'Es' : note === 'A' ? 'As' : note + 'es';
    var mode = (m[3] || '').toLowerCase();
    var minor = mode === 'm' || /^min|moll/.test(mode);
    if (!mode) return '';
    return note + (minor ? '-Moll' : '-Dur');
  }

  function first(text, patterns) {
    for (var i = 0; i < patterns.length; i++) {
      var m = text.match(patterns[i]);
      if (m) return m[1].trim();
    }
    return '';
  }

  function isoDate(raw) {
    if (!raw) return '';
    var m = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    m = raw.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
    if (m) {
      var y = m[3].length === 2 ? '20' + m[3] : m[3];
      // 03/14/2026 is American, 14.03.2026 German
      var a = +m[1], b = +m[2], day = raw.indexOf('/') >= 0 && a <= 12 ? b : a, mon = raw.indexOf('/') >= 0 && a <= 12 ? a : b;
      return y + '-' + ('0' + mon).slice(-2) + '-' + ('0' + day).slice(-2);
    }
    var d = new Date(raw.replace(/(\d)(st|nd|rd|th)/, '$1'));
    return isNaN(d) ? '' : d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function licenseType(t) {
    var s = t.toLowerCase();
    if (/\bexclusive (rights|license|licen[cs]e agreement)|exklusiv/.test(s) && !/non[- ]?exclusive|nicht[- ]?exklusiv/.test(s)) return 'Exklusiv';
    if (/unlimited/.test(s)) return 'Unlimited';
    if (/track ?outs?|stems|premium/.test(s)) return 'Premium / Trackouts';
    if (/\bwav\b/.test(s) && /lease|non[- ]?exclusive|nicht[- ]?exklusiv/.test(s)) return 'Lease WAV';
    if (/\bmp3\b/.test(s) && /lease|non[- ]?exclusive|nicht[- ]?exklusiv/.test(s)) return 'Lease MP3';
    if (/free (for )?(non[- ]?profit|download)|non[- ]?commercial|nicht[- ]?kommerziell/.test(s)) return 'Free (nur nicht-kommerziell)';
    if (/lease|non[- ]?exclusive|nicht[- ]?exklusiv/.test(s)) return 'Andere';
    return '';
  }

  // short notes on the usual limits: streams, sales, videos, radio, term, credit
  function conditions(t) {
    var out = [], seen = {};
    var rules = [
      [/([\d.,]+\s*(?:k|m|million|mio\.?|tausend)?)\s*(?:audio\s+|online\s+|monetized\s+)?(?:streams|plays|wiedergaben)/i, function (n) { return 'bis ' + n + ' Streams'; }],
      [/([\d.,]+\s*(?:k|m)?)\s*(?:unit|copies|sales|verkäufe|downloads)/i, function (n) { return 'bis ' + n + ' Verkäufe/Downloads'; }],
      [/([\d.,]+)\s*(?:monetized\s+)?music\s*videos?|musikvideos?\s*:?\s*([\d.,]+)/i, function (n) { return n + ' Musikvideo(s)'; }],
      [/([\d.,]+)\s*(?:radio\s+stations?|radiosender)/i, function (n) { return 'Radio: ' + n + ' Sender'; }],
      [/(?:term|laufzeit|valid for|period of)[^.\n]{0,20}?(\d+\s*(?:years?|jahre?|months?|monate?))/i, function (n) {
        return 'Laufzeit ' + n.replace(/years?/i, 'Jahre').replace(/months?/i, 'Monate').replace(/^1 Jahre$/, '1 Jahr');
      }]
    ];
    rules.forEach(function (r) {
      var m = t.match(r[0]);
      if (m) {
        var v = r[1]((m[1] || m[2] || '').trim());
        if (!seen[v]) { seen[v] = 1; out.push(v); }
      }
    });
    // credit line the license asks for, e.g. "Prod. by Kilo Beats"
    var credit = /credit/i.test(t) && t.match(/prod(?:uced)?\.?\s*(?:by|von)\s+([^\n"“”,;()]{2,40})/i);
    if (credit) out.push('Credit: prod. by ' + credit[1].replace(/[.\s]+$/, ''));
    return out.join(', ');
  }

  function fromText(text, fileName) {
    var t = text.replace(/[ \t]+/g, ' ');
    var all = t + '\n' + (fileName || '');
    return {
      producer: first(t, [
        /(?:producer|produzent|licensor|lizenzgeber|beatmaker)\s*(?:name)?\s*[:\-]\s*([^\n,;()]{2,50})/i,
        /prod(?:uced)?\.?\s*by\s*:?\s*([^\n,;()]{2,40})/i,
        /between\s+([^\n,;()]{2,40}?)\s*\((?:the\s+)?["“]?(?:producer|licensor)/i
      ]).replace(/\s+(?:and|und|hereinafter).*$/i, ''),
      type: licenseType(t),
      bpm: first(all, [/(\d{2,3}(?:[.,]\d+)?)\s*bpm/i, /bpm\s*[:\-]?\s*(\d{2,3}(?:[.,]\d+)?)/i, /tempo\s*[:\-]\s*(\d{2,3})/i]),
      key: germanKey(first(all, [/(?:key|tonart|scale)\s*[:\-]\s*([A-Ha-h][^\n,;]{0,12})/i, /[\s_\-(]([A-H](?:#|b)?m(?:in(?:or)?)?)[\s_\-).]/])),
      date: isoDate(first(t, [
        /(?:date|datum|effective date|purchase date|kaufdatum|order date|dated|made on|as of|vom)\s*(?:of\s+purchase)?\s*[:\-]?\s*(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[./]\d{1,2}[./]\d{2,4}|[A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?,? \d{4})/i,
        /(\d{4}-\d{2}-\d{2})/
      ])),
      notes: conditions(t)
    };
  }

  // -> Promise of { producer, type, bpm, key, date, notes } (empty strings where nothing was found)
  function read(file) {
    var isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    var isText = file.type === 'text/plain' || /\.txt$/i.test(file.name);
    var text = isPdf ? pdfText(file) : isText ? file.text() : Promise.resolve('');
    return text.then(function (t) { return fromText(t, file.name); });
  }

  root.RaimLicenseReader = { read: read, fromText: fromText, germanKey: germanKey };
})(this);

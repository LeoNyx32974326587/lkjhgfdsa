// Song structure. The text stays one string; a line like "[Hook]" starts a section.
// A section header with no lines below repeats the last section of the same name.
(function (root) {
  'use strict';

  var HEADER = /^\s*\[([^\]\n]{1,40})\]\s*$/;

  function isHeader(line) { return HEADER.test(line); }

  // -> [{ name: string|null, body: string }]
  function parse(text) {
    var out = [], cur = { name: null, lines: [] };
    function push() {
      var body = cur.lines.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
      if (cur.name !== null || body) out.push({ name: cur.name, body: body });
    }
    (text || '').split('\n').forEach(function (line) {
      var m = line.match(HEADER);
      if (m) { push(); cur = { name: m[1].trim(), lines: [] }; }
      else cur.lines.push(line);
    });
    push();
    if (!out.length) out.push({ name: null, body: '' });
    return out;
  }

  function serialize(sections) {
    return sections
      .filter(function (s, i) { return s.name !== null || s.body || sections.length === 1 || i === 0; })
      .map(function (s) { return s.name !== null ? '[' + s.name + ']' + (s.body ? '\n' + s.body : '') : s.body; })
      .filter(function (part, i, all) { return part || all.length === 1; })
      .join('\n\n');
  }

  function key(name) { return (name || '').toLowerCase().trim(); }

  // section whose text an empty section repeats, or null
  function repeatSource(sections, i) {
    var s = sections[i];
    if (s.name === null || s.body.trim()) return null;
    for (var j = i - 1; j >= 0; j--) {
      if (key(sections[j].name) === key(s.name) && sections[j].body.trim()) return sections[j];
    }
    return null;
  }

  // sections with repeats filled in, for reading, recording and export
  function expand(sections) {
    return sections.map(function (s, i) {
      var src = repeatSource(sections, i);
      return { name: s.name, body: src ? src.body : s.body, repeated: !!src };
    });
  }

  // lyric lines without headers and blank lines
  function lines(text) {
    return (text || '').split('\n').filter(function (l) { return l.trim() && !isHeader(l); });
  }

  root.RaimSong = { parse: parse, serialize: serialize, expand: expand, repeatSource: repeatSource, lines: lines, isHeader: isHeader };
})(this);

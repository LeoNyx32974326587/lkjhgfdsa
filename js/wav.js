// 16-bit PCM WAV encode/decode for recorded takes.
(function (root) {
  'use strict';

  // channels: Float32Array[] of equal length
  function encode(channels, sampleRate) {
    var nch = channels.length, len = channels[0].length;
    var buf = new ArrayBuffer(44 + len * nch * 2), v = new DataView(buf);
    function str(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    str(0, 'RIFF'); v.setUint32(4, 36 + len * nch * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nch, true);
    v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * nch * 2, true);
    v.setUint16(32, nch * 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, len * nch * 2, true);
    var o = 44;
    for (var i = 0; i < len; i++) {
      for (var c = 0; c < nch; c++) {
        var s = channels[c][i];
        s = s > 1 ? 1 : s < -1 ? -1 : s;
        v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        o += 2;
      }
    }
    return new Blob([buf], { type: 'audio/wav' });
  }

  // reads the files written by encode(); returns { sampleRate, channels }
  function decode(arrayBuffer) {
    var v = new DataView(arrayBuffer), o = 12, nch = 1, sr = 44100, data = null, dataLen = 0;
    while (o + 8 <= v.byteLength) {
      var id = String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
      var size = v.getUint32(o + 4, true);
      if (id === 'fmt ') { nch = v.getUint16(o + 10, true); sr = v.getUint32(o + 12, true); }
      if (id === 'data') { data = o + 8; dataLen = Math.min(size, v.byteLength - data); break; }
      o += 8 + size + (size & 1);
    }
    var len = Math.floor(dataLen / 2 / nch), channels = [];
    for (var c = 0; c < nch; c++) channels.push(new Float32Array(len));
    for (var i = 0, p = data; i < len; i++) {
      for (c = 0; c < nch; c++, p += 2) channels[c][i] = v.getInt16(p, true) / 0x8000;
    }
    return { sampleRate: sr, channels: channels };
  }

  root.RaimWav = { encode: encode, decode: decode };
})(this);

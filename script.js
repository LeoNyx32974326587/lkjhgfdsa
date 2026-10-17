// Background: flowing line field, gently animated
(function waves() {
  const svg = document.getElementById('waves');
  const NS = 'http://www.w3.org/2000/svg';
  const COUNT = 48;
  const paths = [];
  let w = 0, h = 0;

  for (let i = 0; i < COUNT; i++) {
    const p = document.createElementNS(NS, 'path');
    svg.appendChild(p);
    paths.push(p);
  }

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  }

  function draw(t) {
    const step = h / COUNT;
    paths.forEach((p, i) => {
      const y0 = i * step * 1.1 - step;
      const amp = 18 + 22 * Math.sin(i * 0.15 + t * 0.0002);
      let d = `M0 ${y0}`;
      for (let x = 0; x <= w + 40; x += 40) {
        const y = y0
          + amp * Math.sin(x * 0.006 + i * 0.12 + t * 0.0004)
          + 10 * Math.sin(x * 0.015 - t * 0.0003);
        d += ` L${x} ${y.toFixed(1)}`;
      }
      p.setAttribute('d', d);
    });
  }

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  resize();
  draw(0);
  window.addEventListener('resize', () => { resize(); draw(performance.now()); });
  if (!reduce) {
    const loop = (t) => { draw(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
})();

// Hero logo: stacked outlines for the neon "topographic" look
(function logo() {
  const g = document.getElementById('logoLayers');
  const NS = 'http://www.w3.org/2000/svg';
  // outermost first
  const rings = [
    [118, '#05040c'],
    [104, '#3b2a9a'],
    [96,  '#07061a'],
    [84,  '#5a3fd6'],
    [76,  '#08071c'],
    [64,  '#6d55ff'],
    [56,  '#0a0a26'],
    [44,  '#58a6ff'],
    [36,  '#0b0d30'],
    [24,  '#5ee7ff'],
    [16,  '#0d1240'],
  ];
  const add = (attrs) => {
    const t = document.createElementNS(NS, 'text');
    t.textContent = 'RAIM';
    t.setAttribute('x', 500);
    t.setAttribute('y', 248);
    for (const k in attrs) t.setAttribute(k, attrs[k]);
    g.appendChild(t);
    return t;
  };
  rings.forEach(([sw, c]) => add({ stroke: c, 'stroke-width': sw, fill: c }));
  add({ fill: 'url(#letterFill)', stroke: '#7ff0ff', 'stroke-width': 4, filter: 'url(#neon)' });
})();

// Beats waveform bars
(function waveform() {
  const el = document.getElementById('waveform');
  const bars = window.innerWidth < 480 ? 56 : 72;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < bars; i++) {
    const b = document.createElement('i');
    const env = 0.45 + 0.35 * Math.sin(i * 0.21) ** 2;
    b.style.height = `${Math.round((env + rnd() * 0.35) * 70)}%`;
    el.appendChild(b);
  }
})();

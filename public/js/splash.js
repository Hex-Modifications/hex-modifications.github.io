/* Intro splash, rendered live (no video): ~3,900 particles gather onto the exact halftone dots of the
   Hex Modifications mark, the crisp mark fades in over them, and the wordmark lands. Drawn with WebGL at the
   screen's own resolution and refresh rate. A loading bar reports real page milestones mixed with a shuffled
   set of build steps. On exit the mark and wordmark fly into their places in the nav while the dark lifts
   into the page's colours, so the splash hands off to the site instead of cutting away.
   About 4.5s in all; held on the finished logo only while the page is still loading; never over 7.5s.
   The timecycle script decides in <head> whether it runs at all (class "splash-on"). */
(() => {
  'use strict';
  const root = document.documentElement;
  const el = document.getElementById('splash');
  const audio = document.getElementById('splashAudio');
  if (!el) return;
  if (!root.classList.contains('splash-on')) { el.remove(); audio?.remove(); return; }
  try { sessionStorage.setItem('hex-intro', '1'); } catch { /* fine */ }

  const $ = (s) => el.querySelector(s);
  const canvas = $('.splash-gl'), mark = $('.splash-mark'), word = $('.splash-word');
  const bar = $('.splash-bar b'), label = $('.splash-step'), pct = $('.splash-pct');
  const MAX_MS = 7500, REVEAL_MS = 1300;
  const T = { arrive: 2.55, cross: 2.55, mark: 0.4, word: 2.75, minExit: 3.3 };   // seconds into the intro
  const CROSS = [0.52, 0.47];                    // centre of the cross within the mark
  const t0 = performance.now();
  const now = () => (performance.now() - t0) / 1000;
  let done = false;

  /* ── readiness: real signals from the page ── */
  const once = (target, ev) => new Promise((r) => target.addEventListener(ev, r, { once: true }));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const signals = {
    load: document.readyState === 'complete' ? Promise.resolve() : once(window, 'load'),
    data: window.hexData ? Promise.resolve() : once(document, 'hex:data'),
    hero: window.hexHeroReady ? Promise.resolve() : Promise.race([once(document, 'hex:hero-ready'), wait(5000)]),
    fonts: document.fonts ? document.fonts.ready : Promise.resolve(),
  };
  Promise.all([...Object.values(signals), wait(T.minExit * 1000)]).then(() => complete());
  setTimeout(() => complete(), MAX_MS);

  /* ── the loading log: real milestones + a shuffled, randomly timed pick of build steps ── */
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const clock = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const POOL = [
    () => `resolving timecycle · ${root.dataset.phase || 'day'} ${clock()}`,
    () => 'compiling glass shaders',
    () => `building environment map · ${pick(['256', '512'])}px`,
    () => `warming transmission buffer · ${pick(['0.5', '0.75', '1.0'])}x`,
    () => 'linking light field shader',
    () => `decoding showcase buffers · ${pick(['6', '7', '13'])} frames`,
    () => `hydrating platform links · ${Object.keys(window.hexData?.site?.links || {}).length || pick([6, 7])}`,
    () => 'mounting ask hex',
    () => `tessellating ${pick(['chassis', 'slide', 'rims', 'light bar', 'magazine'])} · ${pick(['1,284', '2,048', '3,912', '864'])} tris`,
    () => `streaming fonts · ${pick(['inter tight', 'jetbrains mono'])}`,
    () => `checking for cheats · ${pick(['none found', 'lawyerup?', 'skyfall?'])}`,
    () => `handshake · ${location.host || 'hex modifications'}`,
    () => `baking palette · ${pick(['coral', 'lilac', 'indigo', 'plum'])}`,
    () => `syncing feeds · ${pick(['gta5-mods', 'cfx.re', 'github'])}`,
    () => `placing particles · ${count ? count.toLocaleString('en-GB') : '3,894'}`,
  ];
  const MILESTONES = [
    [signals.data, () => { const n = window.hexData?.releases?.length; return n ? `fetched latest releases · ${n}` : 'fetched site data'; }],
    [signals.hero, () => (root.classList.contains('no-webgl') ? 'hero · static fallback' : `3D hero · first frame · ${document.getElementById('glass')?.dataset.model || 'ready'}`)],
    [signals.load, () => 'assets decoded'],
  ];
  let count = 0;
  const steps = shuffle(POOL.slice()).slice(0, 4 + Math.floor(Math.random() * 3));
  let shown = 0, target = 0, cur = 0, stallUntil = 0;
  const say = (t) => { if (label) label.textContent = t; };
  (function nextStep() {
    if (done || shown >= steps.length) return;
    say(steps[shown++]());
    target = Math.min(86, target + 6 + Math.random() * 12);
    setTimeout(nextStep, 260 + Math.random() * 480);
  })();
  MILESTONES.forEach(([p, text]) => p.then(() => { if (!done) { say(text()); target = Math.min(92, target + 8 + Math.random() * 6); } }));
  function complete() {
    if (done || target >= 100) return;
    target = 100; say(pick(['ready', 'all systems go', 'done · welcome in', 'ready · enjoy']));
    setTimeout(() => finish(), 260);
  }

  /* ── sound: subtle (-29 LUFS, soft fade-in); if autoplay sound is blocked, the first click, tap
        or key press during the intro starts it in sync ── */
  let soundArmed = false;
  const startSound = () => {
    if (done || !audio) return;
    audio.volume = 1;
    try { audio.currentTime = Math.min(now(), 4.5); } catch { /* not seekable yet */ }
    audio.play().catch(() => {
      if (soundArmed) return;
      soundArmed = true;
      const go = () => { removeEventListener('pointerdown', go); removeEventListener('keydown', go); startSound(); };
      addEventListener('pointerdown', go); addEventListener('keydown', go);
    });
  };
  if (audio) { audio.preload = 'auto'; startSound(); }
  addEventListener('keydown', (e) => { if (e.key === 'Escape') finish(); });

  /* ── WebGL: background glows (dithered, so no banding) + particles ── */
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
  let markLoaded = mark.complete && mark.naturalWidth > 0;
  mark.addEventListener('load', () => { markLoaded = true; }, { once: true });
  let draw = null;

  if (gl) {
    const compile = (vs, fs) => {
      const p = gl.createProgram();
      for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); gl.attachShader(p, s); }
      gl.linkProgram(p);
      return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
    };
    const bg = compile('attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }', `precision highp float;
      uniform vec2 uRes, uCross; uniform float uTime, uFlash, uGlow, uReveal;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float blob(vec2 q, vec2 c, float r){ float d = length(q - c) / r; return exp(-d * d * 2.4); }
      void main(){
        vec2 uv = gl_FragCoord.xy / uRes; vec2 q = vec2(uv.x * uRes.x / uRes.y, uv.y); float a = uRes.x / uRes.y, t = uTime;
        vec3 col = vec3(0.059, 0.055, 0.082);
        col += vec3(0.24, 0.21, 0.46) * 0.42 * uGlow * blob(q, vec2(a * (0.44 + 0.03 * sin(t * 0.4)), 0.62 + 0.02 * cos(t * 0.5)), 0.62);
        col += vec3(0.42, 0.16, 0.33) * 0.38 * uGlow * blob(q, vec2(a * (0.56 + 0.03 * cos(t * 0.35)), 0.3 + 0.03 * sin(t * 0.45)), 0.5);
        vec2 cq = vec2(uCross.x * a, uCross.y);
        col += vec3(0.78, 0.66, 1.0) * uFlash * (blob(q, cq, 0.07) * 1.4 + blob(q, cq, 0.3) * 0.35);
        col += (hash(gl_FragCoord.xy + fract(t) * 91.7) - 0.5) / 255.0 * 1.6;          // dither: no banding on 8-bit screens
        // exit: the dark recedes outward from the cross, a rim of palette light sweeping ahead of the page
        float d = length(q - cq), r = uReveal * (length(vec2(a, 1.)) + 0.45);
        float keep = uReveal > 0. ? smoothstep(r - 0.34, r, d) : 1.;
        float ring = uReveal > 0. ? exp(-pow((d - r + 0.17) / 0.11, 2.)) * (1. - uReveal * 0.85) : 0.;
        float ang = atan(q.y - cq.y, q.x - cq.x);
        vec3 rim = mix(vec3(0.91, 0.6, 0.6), vec3(0.64, 0.45, 0.83), 0.5 + 0.5 * sin(ang * 2. + uTime));
        gl_FragColor = vec4(col * keep + rim * ring * 0.55, min(1., keep + ring * 0.25));
      }`);
    const pts = compile(`precision highp float;
      attribute vec2 aStart, aCtrl, aEnd; attribute vec4 aInfo;            // info: radius px@1000, brightness, delay, duration
      uniform float uTime, uScale, uDpr, uAlpha;
      varying float vA, vB, vK;
      void main(){
        float k = clamp((uTime - aInfo.z) / aInfo.w, 0., 1.);
        float e = 1. - pow(1. - k, 3.);                                      // ease out
        vec2 p = mix(mix(aStart, aCtrl, e), mix(aCtrl, aEnd, e), e);          // curved path
        gl_Position = vec4(p, 0., 1.);
        gl_PointSize = max(1., aInfo.x * uScale * uDpr * 2. * mix(1.9, 1., e));
        vA = smoothstep(0., 0.18, k) * mix(0.45, 1., e) * uAlpha; vB = aInfo.y; vK = e;
      }`, `precision highp float;
      varying float vA, vB, vK;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.;
        float edge = mix(0.35, 0.82, vK);                                     // soft while flying, crisp on arrival
        float a = (1. - smoothstep(edge, 1., d)) * vA;
        vec3 c = mix(vec3(0.82, 0.76, 1.), vec3(1.), vK) * vB;
        gl_FragColor = vec4(c * a, a);
      }`);
    if (bg && pts) {
      const tri = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, tri); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const U = (p, n) => gl.getUniformLocation(p, n);
      const bgU = { res: U(bg, 'uRes'), cross: U(bg, 'uCross'), time: U(bg, 'uTime'), flash: U(bg, 'uFlash'), glow: U(bg, 'uGlow'), reveal: U(bg, 'uReveal') };
      const pU = { time: U(pts, 'uTime'), scale: U(pts, 'uScale'), dpr: U(pts, 'uDpr'), alpha: U(pts, 'uAlpha') };
      const A = ['aStart', 'aCtrl', 'aEnd', 'aInfo'].map((n) => gl.getAttribLocation(pts, n));
      const buf = gl.createBuffer();
      let dots = null, W = 0, H = 0, dpr = 1, rect = null;

      // particles: targets are the mark's real halftone dots; starts and curves are random every visit
      const build = () => {
        if (!dots) return;
        rect = mark.getBoundingClientRect();
        const n = dots.byteLength / 6, v = new DataView(dots), out = new Float32Array(n * 10);
        const toX = (px) => (px / innerWidth) * 2 - 1, toY = (py) => 1 - (py / innerHeight) * 2;
        const span = Math.max(innerWidth, innerHeight);
        for (let i = 0; i < n; i++) {
          const ex = rect.left + (v.getUint16(i * 6, true) / 65535) * rect.width, ey = rect.top + (v.getUint16(i * 6 + 2, true) / 65535) * rect.height;
          const ang = Math.random() * Math.PI * 2, dist = span * (0.12 + Math.pow(Math.random(), 0.7) * 0.42);
          const sx = ex + Math.cos(ang) * dist, sy = ey + Math.sin(ang) * dist * 0.75;
          const sw = (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.35);  // swirl
          const cx = (sx + ex) / 2 - (ey - sy) * sw, cy = (sy + ey) / 2 + (ex - sx) * sw;
          const fromCross = Math.hypot(ex - (rect.left + CROSS[0] * rect.width), ey - (rect.top + CROSS[1] * rect.height)) / rect.height;
          const delay = 0.12 + Math.pow(Math.random(), 1.3) * 0.75 + fromCross * 0.35, dur = Math.min(T.arrive - delay, 1.05 + Math.random() * 0.45);
          out.set([toX(sx), toY(sy), toX(cx), toY(cy), toX(ex), toY(ey), v.getUint8(i * 6 + 4) / 10, 0.55 + 0.45 * (v.getUint8(i * 6 + 5) / 255), delay, dur], i * 10);
        }
        count = n;
        gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, out, gl.STATIC_DRAW);
      };
      const resize = () => {
        dpr = Math.min(devicePixelRatio || 1, 2);
        W = Math.round(innerWidth * dpr); H = Math.round(innerHeight * dpr);
        canvas.width = W; canvas.height = H; gl.viewport(0, 0, W, H);
        build();
      };
      fetch('media/mark-dots.bin').then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => { dots = b; build(); }).catch(() => {});
      addEventListener('resize', resize);
      resize();

      const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
      draw = (t, reveal = 0) => {
        gl.disable(gl.BLEND);
        gl.useProgram(bg);
        gl.bindBuffer(gl.ARRAY_BUFFER, tri);
        for (const l of A) if (l >= 0) gl.disableVertexAttribArray(l);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        const r = rect || mark.getBoundingClientRect();
        gl.uniform2f(bgU.res, W, H);
        gl.uniform2f(bgU.cross, (r.left + CROSS[0] * r.width) / innerWidth, 1 - (r.top + CROSS[1] * r.height) / innerHeight);
        gl.uniform1f(bgU.time, t); gl.uniform1f(bgU.reveal, reveal);
        gl.uniform1f(bgU.glow, smooth(0, 0.9, t));
        gl.uniform1f(bgU.flash, smooth(T.cross - 0.25, T.cross, t) * (1 - smooth(T.cross, T.cross + 0.9, t)));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (!count || markShown >= 1) return;
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(pts);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.disableVertexAttribArray(0);
        [2, 2, 2, 4].forEach((size, i) => { if (A[i] < 0) return; gl.enableVertexAttribArray(A[i]); gl.vertexAttribPointer(A[i], size, gl.FLOAT, false, 40, [0, 8, 16, 24][i]); });
        gl.uniform1f(pU.time, t); gl.uniform1f(pU.scale, r.height / 1000); gl.uniform1f(pU.dpr, dpr);
        gl.uniform1f(pU.alpha, 1 - markShown);
        gl.drawArrays(gl.POINTS, 0, count);
      };
    }
  }
  if (!draw) el.classList.add('no-gl');

  /* ── frame loop: particles, then the crisp mark crossfades in over them, then the wordmark ── */
  let markShown = 0, markStart = 0, revealStart = 0, glReady = false;
  const easeInOut = (k) => 0.5 - 0.5 * Math.cos(Math.PI * k);          // gentle start and finish, even middle
  (function frame() {
    if (!el.isConnected) return;
    const t = now();
    if (draw && !glReady) { glReady = true; requestAnimationFrame(() => el.classList.add('gl-ready')); }   // canvas now covers the base
    if (t >= T.arrive && markLoaded && !markStart) markStart = t;
    markShown = markStart ? Math.min(1, (t - markStart) / T.mark) : 0;
    mark.style.opacity = draw ? markShown : '';
    if (t >= T.word) el.classList.add('word-in');
    if (draw) draw(t, revealStart ? easeInOut(Math.min(1, (performance.now() - revealStart) / REVEAL_MS)) : 0);
    // the bar eases toward its target and now and then stalls for a beat, like a real loader
    const ms = performance.now();
    if (ms > stallUntil && Math.random() < 0.012) stallUntil = ms + 180 + Math.random() * 380;
    if (ms > stallUntil || target >= 100) cur += (target - cur) * (target >= 100 ? 0.25 : 0.06);
    if (bar) bar.style.transform = `scaleX(${(cur / 100).toFixed(4)})`;
    if (pct) pct.textContent = `${Math.round(cur)}%`;
    requestAnimationFrame(frame);
  })();

  /* ── exit: the mark and wordmark fly into the nav, the dark lifts into the page ── */
  function finish() {
    if (done) return;
    done = true;
    markShown = 1; mark.style.opacity = 1; el.classList.add('word-in');
    const navWord = document.querySelector('.nav .wm-text'), navHex = document.querySelector('.nav .wm-hex'), badge = document.querySelector('.nav .wm-badge');
    const fly = (node, to, scale) => {
      const from = node.getBoundingClientRect();
      node.style.transformOrigin = '0 0';
      node.style.transform = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${scale})`;
    };
    const go = () => {
      root.classList.add('splash-leaving');
      el.classList.add('out');
      revealStart = performance.now();
      document.dispatchEvent(new CustomEvent('hex:intro-leave'));
      if (navWord && navHex) fly(word, navWord.getBoundingClientRect(), parseFloat(getComputedStyle(navHex).fontSize) / parseFloat(getComputedStyle(word.querySelector('.wm-hex')).fontSize));
      if (badge) {
        const b = badge.getBoundingClientRect(), m = mark.getBoundingClientRect(), s = (b.height / m.height) * 1.3;
        fly(mark, { left: b.left + b.width / 2 - (m.width * s) / 2, top: b.top + b.height / 2 - (m.height * s) / 2 }, s);
      }
      setTimeout(() => root.classList.add('splash-landing'), 780);      // nav wordmark takes over as the clones arrive
      setTimeout(() => {
        el.remove(); audio?.remove();
        root.classList.remove('splash-on', 'splash-leaving', 'splash-landing');
      }, 1400);
    };
    // let the last frame settle (mark fully in) before measuring and flying
    requestAnimationFrame(() => requestAnimationFrame(go));
    if (audio && !audio.paused) {
      const v0 = audio.volume, s0 = performance.now(), ms = 1100;
      const step = (t) => { const k = Math.min(1, (t - s0) / ms); audio.volume = v0 * (1 - k) * (1 - k); if (k < 1) requestAnimationFrame(step); else audio.pause(); };
      requestAnimationFrame(step);
    }
  }
})();

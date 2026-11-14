/* Ambient light field: the page's palette glows, slowly flowing like liquid.
   One GLSL function drives both the fixed page background (a tiny canvas, upscaled)
   and the 3D hero's backdrop, so the hero always matches the page behind it exactly.
   Colours come from the timecycle phase tokens (--bg, --g1..--g4, --aura-op). */

export const GLSL = /* glsl */`
uniform vec3 uBg; uniform vec3 uC[4]; uniform float uOp, uTime; uniform vec2 uView;
float hexBlob(vec2 q, vec2 c, float r) { float d = length(q - c) / r; return d < 1.0 ? pow(1.0 - d, 1.4) : 0.0; }
vec3 hexLiquid(vec2 px) {
  vec2 uv = px / uView.y; float a = uView.x / uView.y, t = uTime;
  vec2 w = vec2(sin(uv.y * 2.3 + t * 0.19) + 0.6 * sin(uv.y * 4.1 + uv.x * 1.3 - t * 0.11),
                cos(uv.x * 2.1 - t * 0.16) + 0.6 * sin(uv.x * 3.7 - uv.y * 1.1 + t * 0.13));
  vec2 q = uv + 0.085 * w;
  q += 0.035 * vec2(sin(q.y * 5.7 - t * 0.23 + 1.7), cos(q.x * 5.1 + t * 0.21 + 0.4));
  vec3 col = uBg;
  col = mix(col, uC[2], uOp * hexBlob(q, vec2(a * (0.23 + 0.07 * sin(t * 0.043)), 0.40 + a * 0.35 + 0.10 * cos(t * 0.051)), a * 0.35 * (1.0 + 0.06 * sin(t * 0.07))));
  col = mix(col, uC[0], uOp * hexBlob(q, vec2(a * (0.79 + 0.06 * cos(t * 0.038 + 1.0)), -0.08 + a * 0.31 + 0.09 * sin(t * 0.047)), a * 0.31 * (1.0 + 0.06 * cos(t * 0.061))));
  col = mix(col, uC[1], uOp * hexBlob(q, vec2(a * (0.65 + 0.08 * sin(t * 0.035 + 2.1)), 0.70 + a * 0.27 + 0.11 * cos(t * 0.044 + 0.7)), a * 0.27));
  col = mix(col, uC[3], uOp * 0.9 * hexBlob(q, vec2(a * (0.52 + 0.12 * cos(t * 0.031 + 4.0)), 0.30 + a * 0.18 + 0.12 * sin(t * 0.039 + 1.3)), a * 0.2));
  return col;
}`;

const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const t0 = Math.random() * 400;                     // a different moment of the flow each visit

export const liquid = {
  bg: [0.91, 0.906, 0.925], c: [[0.4, 0.4, 0.6], [0.6, 0.45, 0.8], [0.9, 0.6, 0.6], [0.36, 0.33, 0.6]], op: 0.3,
  view: [innerWidth, innerHeight],
  time: () => (reduced ? t0 : t0 + performance.now() / 1000),
};

/* phase colours, eased over ~1.2s when the timecycle changes */
const probe = document.createElement('canvas').getContext('2d');
const rgb = (v) => { probe.fillStyle = '#000'; probe.fillStyle = v; const h = probe.fillStyle; return h[0] === '#' ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) : [0, 0, 0]; };
function readTokens() {
  const s = getComputedStyle(document.documentElement), g = (n) => s.getPropertyValue(n).trim();
  return { bg: rgb(g('--bg')), c: ['--g1', '--g2', '--g3', '--g4'].map((n) => rgb(g(n))), op: parseFloat(g('--aura-op')) || 0.3 };
}
let from = null, to = readTokens(), tweenStart = 0;
Object.assign(liquid, { bg: to.bg, c: to.c, op: to.op });
document.addEventListener('hex:phase', () => {
  from = { bg: liquid.bg, c: liquid.c, op: liquid.op }; to = readTokens(); tweenStart = performance.now();
  if (!gl) { Object.assign(liquid, to); from = null; }
});
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
function tween(now) {
  if (!from) return;
  let k = Math.min(1, (now - tweenStart) / 1200); k = k * k * (3 - 2 * k);
  liquid.bg = mix(from.bg, to.bg, k); liquid.c = from.c.map((c, i) => mix(c, to.c[i], k)); liquid.op = from.op + (to.op - from.op) * k;
  if (k >= 1) from = null;
}

/* page background: ~1/6 resolution canvas, CSS-upscaled (the field is very smooth) */
const host = document.querySelector('.aura');
const canvas = document.createElement('canvas');
canvas.className = 'liquid-canvas';
let gl = null;
try { gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false }); } catch { gl = null; }
let loc = null;
if (gl && host) {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }'));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, 'precision highp float;' + GLSL + 'uniform vec2 uRes; void main(){ vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uRes * uView; gl_FragColor = vec4(hexLiquid(px), 1.); }'));
  gl.linkProgram(prog);
  if (gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    loc = Object.fromEntries(['uBg', 'uC', 'uOp', 'uTime', 'uView', 'uRes'].map((n) => [n, gl.getUniformLocation(prog, n)]));
    host.appendChild(canvas);
    document.documentElement.classList.add('liquid');
  } else gl = null;
} else gl = null;

function resize() {
  const w = innerWidth, h = innerHeight, [, ph] = liquid.view;
  // mobile toolbars nudge the height while scrolling; ignore small changes so the field doesn't jump
  liquid.view = [w, Math.abs(h - ph) < 140 && w === liquid.view[0] ? ph : h];
  if (!gl) return;
  canvas.width = Math.max(2, Math.ceil(w / 6)); canvas.height = Math.max(2, Math.ceil(h / 6));
  gl.viewport(0, 0, canvas.width, canvas.height);
  draw();
}
function draw() {
  if (!gl) return;
  gl.uniform3fv(loc.uBg, liquid.bg); gl.uniform3fv(loc.uC, liquid.c.flat()); gl.uniform1f(loc.uOp, liquid.op);
  gl.uniform1f(loc.uTime, liquid.time()); gl.uniform2f(loc.uView, ...liquid.view); gl.uniform2f(loc.uRes, canvas.width, canvas.height);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
addEventListener('resize', resize, { passive: true });
resize();

// ~20fps is plenty for motion this slow, and keeps re-blurring the glass panels above it cheap.
// It sits still while the page scrolls, and steps down to 10 then 5fps if the device starts dropping frames.
let last = 0, prev = 0, interval = 50, janks = 0, scrolledAt = 0;
addEventListener('scroll', () => { scrolledAt = performance.now(); }, { passive: true });
function loop(now) {
  requestAnimationFrame(loop);
  const gap = prev ? now - prev : 16; prev = now;
  if (gap > 60 && gap < 1000 && !document.hidden) { if (++janks >= 6 && interval < 200) { interval *= 2; janks = 0; } }
  if (root.classList.contains('splash-on') && !root.classList.contains('splash-leaving')) { prev = 0; return; }   // hidden behind the intro
  if (document.hidden || now - last < interval || (now - scrolledAt < 180 && !from)) return;
  last = now; tween(now); draw();
}
if (gl && !reduced) requestAnimationFrame(loop);
else if (gl) document.addEventListener('hex:phase', () => requestAnimationFrame(function step(now) { tween(now); draw(); if (from) requestAnimationFrame(step); }));

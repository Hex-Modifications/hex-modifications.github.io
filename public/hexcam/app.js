// hexcam UI: loading media, the control panel, playback, and export (photos as PNG/JPEG, video via MediaRecorder).
// Everything stays on the visitor's device: nothing is uploaded.
import { Engine } from './engine.js';
import { DEFAULTS, GROUPS, LOOKS, lookParams } from './looks.js';
import { drawStamp, drawSample } from './extras.js';

const $ = (s, r = document) => r.querySelector(s);
const canvas = $('#gl'), vid = $('#vid'), viewer = $('#viewer');
const stampCanvas = document.createElement('canvas');
const sampleCanvas = document.createElement('canvas');
const SAMPLE_LEN = 20;

const S = {
  kind: null,          // 'image' | 'video' | 'sample'
  name: 'sample',
  playing: false, muted: true, compare: false, exporting: false, dirty: false,
  seed: 1, lastKey: '', stampKey: '',
  sampleOffset: 0, sampleT0: 0,
  audio: null, cancel: null,
};

let engine;
try { engine = new Engine(canvas); } catch (e) {
  $('#fatal').hidden = false;
  $('#fatal p').textContent = `hexcam needs WebGL2, which this browser couldn't start (${e.message}). Try an up-to-date Chrome, Edge, Firefox or Safari.`;
  throw e;
}

// ── settings, persisted per browser and shareable through the URL hash
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } } };
let P = { ...DEFAULTS };
let lookId = 'ccd06';
(function restore() {
  const fromHash = decodeLook(location.hash);
  const saved = store.get('hexcam:v1');
  if (fromHash) { P = { ...DEFAULTS, ...fromHash.p }; lookId = fromHash.look || 'custom'; }
  else if (saved?.p) { P = { ...DEFAULTS, ...saved.p }; lookId = saved.look || 'custom'; }
  else P = lookParams(LOOKS.find((l) => l.id === lookId));
  for (const k of Object.keys(P)) if (!(k in DEFAULTS)) delete P[k];
})();

function encodeLook() {
  const diff = {};
  for (const [k, v] of Object.entries(P)) if (v !== DEFAULTS[k] && !k.startsWith('stampDate')) diff[k] = v;
  const json = JSON.stringify({ look: lookId, p: diff });
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeLook(hash) {
  const m = /[#&]look=([\w-]+)/.exec(hash || '');
  if (!m) return null;
  try {
    const o = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')))));
    const p = {};
    for (const [k, v] of Object.entries(o.p || {})) if (k in DEFAULTS && typeof v === typeof DEFAULTS[k]) p[k] = v;
    return { look: String(o.look || 'custom').slice(0, 20), p };
  } catch { return null; }
}

// ── helpers
const motion = () => S.kind === 'video' || S.kind === 'sample';
const hash1 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const vnoise = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash1(i) * (1 - u) + hash1(i + 1) * u; };
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function toast(msg, ms = 3500) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, ms);
}
function duration() { return S.kind === 'video' ? (vid.duration || 0) : S.kind === 'sample' ? SAMPLE_LEN : 0; }
function now() {
  if (S.kind === 'video') return vid.currentTime || 0;
  if (S.kind === 'sample') {
    const t = S.sampleOffset + (S.playing ? (performance.now() - S.sampleT0) / 1000 : 0);
    if (!S.exporting && t >= SAMPLE_LEN) { S.sampleOffset = 0; S.sampleT0 = performance.now(); return 0; }
    return Math.min(t, SAMPLE_LEN);
  }
  return 0;
}

// per-frame randomness. A frame rate below the source's holds whole frames, grain and all.
function frameInfo() {
  if (!motion()) return { key: `still|${S.seed}`, f: { time: 1.3, seed: S.seed, still: true } };
  const raw = now();
  const fps = P.fps > 0 ? P.fps : 30;
  const frame = Math.floor(raw * fps);
  const t = P.fps > 0 ? frame / fps : raw;
  const sh = P.shake;
  return {
    key: P.fps > 0 ? `f${frame}` : `t${raw.toFixed(4)}`,
    t,
    f: {
      time: t,
      seed: (frame % 9973) + 1,
      shake: sh ? [(vnoise(t * 2.3) - 0.5) * 0.014 * sh + (hash1(frame) - 0.5) * 0.0025 * sh, (vnoise(t * 1.9 + 40) - 0.5) * 0.014 * sh + (hash1(frame + 7) - 0.5) * 0.004 * sh] : [0, 0],
      flicker: 1 + P.flicker * (hash1(frame * 1.7) - 0.5) * 0.3,
      leakPos: [0.1 + 0.28 * Math.sin(t * 0.23), 0.86 + 0.1 * Math.sin(t * 0.31)],
    },
  };
}

function updateStamp(W, H, elapsed) {
  const key = P.stamp === 'off' ? 'off' : `${P.stamp}|${P.stampDate}|${P.stampTime}|${P.stampText}|${W}x${H}|${Math.floor(elapsed * 2)}`;
  if (key === S.stampKey) return;
  S.stampKey = key;
  engine.setStamp(drawStamp(stampCanvas, P, W, H, elapsed));
}

let info = null;
function renderFrame(force) {
  if (!S.kind) return;
  const fi = frameInfo();
  const key = `${fi.key}|${S.compare}`;
  if (!force && key === S.lastKey) return;
  S.lastKey = key;
  if (motion()) {
    if (S.kind === 'video') { if (vid.readyState >= 2) engine.updateSource(vid); }
    else engine.updateSource(drawSample(sampleCanvas, fi.t ?? 0));
  }
  const { W, H } = engine.sizes(P);
  updateStamp(W, H, motion() ? fi.t : 0);
  if (S.compare) engine.showOriginal(P);
  else info = engine.render(P, fi.f);
  if (info) $('#info').textContent = `${engine.srcW}×${engine.srcH} → sensor ${info.W}×${info.H} → ${info.OW}×${info.OH}`;
  if (motion()) {
    const t = now(), d = duration();
    $('#time').textContent = `${fmtTime(t)} / ${fmtTime(d)}`;
    if (!S.scrubbing) { $('#scrub').value = d ? Math.round((t / d) * 1000) : 0; $('#scrub').style.setProperty('--p', `${d ? (t / d) * 100 : 0}%`); }
    if (S.exporting) setProgress(d ? t / d : 0);
  }
}
function schedule() { S.dirty = true; }
(function loop() {
  if (S.kind && ((motion() && S.playing) || S.dirty)) { renderFrame(S.dirty); S.dirty = false; }
  requestAnimationFrame(loop);
})();

// ── loading
function afterLoad() {
  $('#drop').hidden = true;
  viewer.classList.add('has-media');
  $('#transport').hidden = !motion();
  document.body.dataset.kind = S.kind;
  $('#savePhoto').textContent = motion() ? 'save frame' : 'save photo';
  $('#exportVideo').hidden = !motion();
  S.lastKey = ''; S.stampKey = '';
  schedule();
  setTimeout(refreshThumbs, 60);
}

function stopVideo() {
  vid.pause();
  if (vid.src) { URL.revokeObjectURL(vid.src); vid.removeAttribute('src'); vid.load(); }
}

async function loadImage(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { return toast(`couldn't read that image${/heic|heif/i.test(file.type + file.name) ? ': HEIC only opens in Safari. Export it as JPEG first' : ''}.`); }
  const long = Math.max(bmp.width, bmp.height), s = Math.min(1, 3200 / long);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  stopVideo();
  S.kind = 'image'; S.playing = false; S.name = file.name.replace(/\.[^.]+$/, '');
  engine.setSource(c, c.width, c.height);
  afterLoad();
}

function loadVideo(file) {
  stopVideo();
  const url = URL.createObjectURL(file);
  vid.src = url; vid.loop = true; vid.muted = S.audio ? false : S.muted; vid.playsInline = true;
  vid.onerror = () => toast("this browser can't decode that video. MP4 (H.264) and WebM work everywhere.");
  vid.addEventListener('loadeddata', async () => {
    S.kind = 'video'; S.name = file.name.replace(/\.[^.]+$/, '');
    engine.setSource(vid, vid.videoWidth, vid.videoHeight);
    afterLoad();
    try { await vid.play(); S.playing = true; } catch { S.playing = false; }
    syncTransport();
    if (vid.duration > 300) toast('long video: export runs in real time, so this one takes as long as it plays.', 6000);
  }, { once: true });
}

function loadSample(asVideo) {
  stopVideo();
  drawSample(sampleCanvas, 0);
  S.name = 'sample';
  if (asVideo) {
    S.kind = 'sample'; S.sampleOffset = 0; S.sampleT0 = performance.now(); S.playing = true;
  } else { S.kind = 'image'; S.playing = false; }
  engine.setSource(sampleCanvas, sampleCanvas.width, sampleCanvas.height);
  afterLoad();
  syncTransport();
}

function openFile(file) {
  if (!file || S.exporting) return;
  if (/^video\//.test(file.type) || /\.(mp4|m4v|mov|webm|mkv|ogv)$/i.test(file.name)) loadVideo(file);
  else if (/^image\//.test(file.type) || /\.(jpe?g|png|webp|gif|avif|bmp|heic|heif)$/i.test(file.name)) loadImage(file);
  else toast('that file type isn\'t supported. Use a photo (JPG, PNG, WEBP) or a video (MP4, MOV, WEBM).');
}

// ── transport
function setPlaying(on) {
  if (!motion()) return;
  if (S.kind === 'video') { on ? vid.play().catch(() => {}) : vid.pause(); }
  else if (on) { S.sampleT0 = performance.now(); } else { S.sampleOffset = now(); }
  S.playing = on;
  syncTransport();
  schedule();
}
function seek(frac) {
  const t = Math.max(0, Math.min(1, frac)) * duration();
  if (S.kind === 'video') vid.currentTime = t;
  else { S.sampleOffset = t; S.sampleT0 = performance.now(); }
  engine.ghostValid = false;
  schedule();
}
function syncTransport() {
  $('#play').textContent = S.playing ? 'pause' : 'play';
  $('#play').setAttribute('aria-pressed', S.playing);
  $('#mute').textContent = S.muted ? 'sound off' : 'sound on';
  $('#mute').hidden = S.kind !== 'video';
}
vid.addEventListener('seeked', schedule);
$('#play').onclick = () => setPlaying(!S.playing);
$('#scrub').addEventListener('input', (e) => { S.scrubbing = true; seek(e.target.value / 1000); });
$('#scrub').addEventListener('change', () => { S.scrubbing = false; });
$('#mute').onclick = () => {
  S.muted = !S.muted;
  if (S.audio) { S.audio.spk.gain.value = S.muted ? 0 : 1; S.audio.ctx.resume(); } else vid.muted = S.muted;
  syncTransport();
};

// ── panel
const ID = (k) => `c-${k}`;
function depMet(dep) {
  if (!dep) return true;
  if (dep === 'bits<8') return P.bits < 8;
  const [k, v] = dep.split('=');
  return v === undefined ? (k === 'stamp' ? P.stamp !== 'off' : !!P[k]) : P[k] === v;
}
function parse(item, el) {
  if (item.type === 'range') return Number(el.value);
  if (item.type === 'toggle') return el.checked;
  if (item.type === 'text') return el.value.slice(0, item.max || 40);
  return el.value;
}
function buildPanel() {
  const host = $('#controls');
  for (const g of GROUPS) {
    const d = document.createElement('details');
    d.className = 'grp'; d.open = !!g.open;
    d.innerHTML = `<summary>${g.label}</summary><div class="rows"></div>`;
    const rows = $('.rows', d);
    for (const it of g.items) {
      const row = document.createElement('div');
      row.className = `row row-${it.type}${it.video ? ' is-video' : ''}`;
      row.dataset.k = it.k;
      const tag = it.video ? '<em class="vtag">video</em>' : '';
      const hint = it.hint ? ` title="${it.hint}"` : '';
      if (it.type === 'range') {
        row.innerHTML = `<label for="${ID(it.k)}"${hint}>${it.label}${tag}</label><output for="${ID(it.k)}"></output><input type="range" id="${ID(it.k)}" min="${it.min}" max="${it.max}" step="${it.step}">`;
      } else if (it.type === 'toggle') {
        row.innerHTML = `<label for="${ID(it.k)}"${hint}>${it.label}${tag}</label><input type="checkbox" role="switch" class="switch" id="${ID(it.k)}">`;
      } else if (it.type === 'select') {
        row.innerHTML = `<label for="${ID(it.k)}"${hint}>${it.label}</label><select id="${ID(it.k)}">${it.options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`;
      } else if (it.type === 'swatch') {
        row.innerHTML = `<span class="lbl">${it.label}</span><div class="swatches" role="radiogroup" aria-label="${it.label}">${it.options.map((c) => `<button type="button" role="radio" data-v="${c}" style="--sw:${c}" aria-label="${c}"></button>`).join('')}<input type="color" id="${ID(it.k)}" aria-label="custom ${it.label}"></div>`;
      } else {
        const type = { color: 'color', date: 'date', time: 'time', text: 'text' }[it.type];
        row.innerHTML = `<label for="${ID(it.k)}">${it.label}</label><input type="${type}" id="${ID(it.k)}"${it.max ? ` maxlength="${it.max}"` : ''}>`;
      }
      const input = $(`#${ID(it.k)}`, row);
      const ev = it.type === 'range' || it.type === 'text' || it.type === 'color' ? 'input' : 'change';
      input.addEventListener(ev, () => set(it.k, parse(it, input)));
      if (it.type === 'swatch') row.querySelectorAll('[data-v]').forEach((b) => { b.onclick = () => set(it.k, b.dataset.v); });
      const lab = $('label, .lbl', row);
      lab.addEventListener('dblclick', () => set(it.k, lookParams(LOOKS.find((l) => l.id === lookId))[it.k] ?? DEFAULTS[it.k]));
      rows.appendChild(row);
    }
    host.appendChild(d);
  }
  if (!engine.floatOK) {
    const r = $('.row[data-k="jpeg"]');
    r.querySelector('input').disabled = true;
    r.insertAdjacentHTML('beforeend', '<p class="note">this device\'s GPU can\'t run the codec (no float render targets)</p>');
  }
}
function syncPanel() {
  for (const g of GROUPS) for (const it of g.items) {
    const row = $(`.row[data-k="${it.k}"]`), input = $(`#${ID(it.k)}`);
    if (!row || !input) continue;
    const v = P[it.k];
    if (it.type === 'toggle') input.checked = !!v;
    else if (document.activeElement !== input || it.type !== 'text') input.value = v;
    if (it.type === 'range') { $('output', row).textContent = it.fmt ? it.fmt(v) : v; input.style.setProperty('--p', `${((v - it.min) / (it.max - it.min)) * 100}%`); }
    if (it.type === 'swatch') row.querySelectorAll('[data-v]').forEach((b) => b.setAttribute('aria-checked', b.dataset.v.toLowerCase() === String(v).toLowerCase()));
    row.hidden = !depMet(it.dep);
  }
  document.querySelectorAll('.look').forEach((b) => b.setAttribute('aria-pressed', b.dataset.id === lookId));
  $('#lookName').textContent = lookId === 'custom' ? 'custom' : (LOOKS.find((l) => l.id === lookId)?.name || 'custom');
}
let saveT;
function set(k, v) {
  if (S.exporting && (k === 'res' || k === 'out')) return toast('size is locked while exporting');
  P[k] = v;
  if (!k.startsWith('stamp')) lookId = 'custom';
  syncPanel();
  schedule();
  clearTimeout(saveT); saveT = setTimeout(() => store.set('hexcam:v1', { p: P, look: lookId }), 300);
}
function applyLook(id) {
  const look = LOOKS.find((l) => l.id === id);
  if (!look) return;
  const keep = { stampDate: P.stampDate, stampTime: P.stampTime, stampText: P.stampText };
  P = { ...lookParams(look), ...keep };
  lookId = id;
  engine.ghostValid = false;
  syncPanel(); schedule();
  store.set('hexcam:v1', { p: P, look: lookId });
}
function buildLooks() {
  $('#looks').innerHTML = LOOKS.map((l) => `<button type="button" class="look" data-id="${l.id}" aria-pressed="false"><canvas width="120" height="80" aria-hidden="true"></canvas><b>${l.name}</b><small>${l.note}</small></button>`).join('');
  document.querySelectorAll('.look').forEach((b) => { b.onclick = () => applyLook(b.dataset.id); });
}
// a live preview of every look on the current picture
let thumbBusy = false;
function refreshThumbs() {
  if (!S.kind || thumbBusy || S.exporting) return;
  thumbBusy = true;
  const real = P;
  const prevComp = S.compare;
  S.compare = false;
  try {
    for (const l of LOOKS) {
      P = { ...lookParams(l), stamp: 'off', out: '240', fps: 0, ghost: 0 };
      P.res = Math.min(P.res, 240);
      engine.setStamp(null);
      engine.render(P, { time: 1.3, seed: 3, still: true });
      const c = $(`.look[data-id="${l.id}"] canvas`);
      const ar = canvas.width / canvas.height;
      c.width = ar >= 1.5 ? 120 : Math.round(80 * ar); c.height = 80;
      const x = c.getContext('2d');
      const sw = Math.min(canvas.width, canvas.height * (c.width / c.height)), sh = sw / (c.width / c.height);
      x.drawImage(canvas, (canvas.width - sw) / 2, (canvas.height - sh) / 2, sw, sh, 0, 0, c.width, c.height);
    }
  } finally {
    P = real; S.compare = prevComp; S.stampKey = ''; S.lastKey = ''; engine.ghostValid = false; thumbBusy = false;
    schedule();
  }
}

// ── actions
function randomise() {
  const pool = LOOKS.filter((l) => l.id !== 'raw');
  const base = lookParams(pool[Math.floor(Math.random() * pool.length)]);
  const nudge = ['contrast', 'sat', 'temp', 'tint', 'bloom', 'noise', 'grain', 'vignette', 'ca', 'quality', 'res', 'exposure', 'blacks'];
  for (const g of GROUPS) for (const it of g.items) {
    if (it.type !== 'range' || !nudge.includes(it.k)) continue;
    const span = it.max - it.min;
    let v = base[it.k] + (Math.random() - 0.5) * span * 0.18;
    v = Math.round(Math.min(it.max, Math.max(it.min, v)) / it.step) * it.step;
    base[it.k] = +v.toFixed(4);
  }
  P = { ...base, stampDate: P.stampDate, stampTime: P.stampTime, stampText: P.stampText };
  lookId = 'custom';
  syncPanel(); schedule();
}
$('#random').onclick = randomise;
$('#reroll').onclick = () => { S.seed = (S.seed % 997) + 1 + Math.floor(Math.random() * 50); schedule(); };
$('#reset').onclick = () => applyLook('raw');
$('#share').onclick = async () => {
  const url = `${location.origin}${location.pathname}#look=${encodeLook()}`;
  history.replaceState(null, '', url);
  try { await navigator.clipboard.writeText(url); toast('link to this look copied'); } catch { toast('link to this look is now in the address bar'); }
};
const compareOn = (on) => { if (!S.kind) return; S.compare = on; $('#compare').setAttribute('aria-pressed', on); schedule(); };
$('#compare').addEventListener('pointerdown', (e) => { e.preventDefault(); compareOn(true); });
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => $('#compare').addEventListener(ev, () => compareOn(false)));
$('#compare').addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); compareOn(true); } });
$('#compare').addEventListener('keyup', () => compareOn(false));

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const stampName = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const lookSlug = () => (lookId === 'custom' ? 'custom' : lookId);

$('#savePhoto').onclick = () => {
  if (!S.kind) return;
  const wasCompare = S.compare; S.compare = false;
  renderFrame(true);
  const fmt = $('#photoFmt').value;
  canvas.toBlob((b) => {
    if (!b) return toast('saving failed');
    download(b, `hexcam-${lookSlug()}-${stampName()}.${fmt === 'image/png' ? 'png' : 'jpg'}`);
    toast('saved');
  }, fmt, 0.95);
  S.compare = wasCompare;
};

function pickMime() {
  const types = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc3,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return types.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
}
function setProgress(f) { $('#progress b').style.width = `${Math.round(Math.min(1, f) * 100)}%`; $('#progressPct').textContent = `${Math.round(Math.min(1, f) * 100)}%`; }

function ensureAudio() {
  if (S.audio) return S.audio;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  const src = ctx.createMediaElementSource(vid);
  const dest = ctx.createMediaStreamDestination();
  const spk = ctx.createGain();
  spk.gain.value = S.muted ? 0 : 1;
  src.connect(dest); src.connect(spk); spk.connect(ctx.destination);
  vid.muted = false;
  S.audio = { ctx, dest, spk };
  return S.audio;
}

$('#exportVideo').onclick = async () => {
  if (!motion() || S.exporting) return;
  if (!window.MediaRecorder || !canvas.captureStream) return toast('this browser can\'t record video. Use Chrome, Edge, Firefox or Safari 14.1+.');
  const mime = pickMime();
  const fps = P.fps > 0 ? P.fps : 30;
  const stream = canvas.captureStream(fps);
  if (S.kind === 'video') {
    const a = ensureAudio();
    if (a) { await a.ctx.resume(); a.dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t)); }
  }
  let rec;
  try { rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: Math.round(P.bitrate * 1000), audioBitsPerSecond: 160000 }); }
  catch (e) { return toast(`recording failed to start: ${e.message}`); }
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise((r) => { rec.onstop = r; });

  S.exporting = true; document.body.classList.add('exporting');
  $('#exportBox').hidden = false; setProgress(0);
  let cancelled = false;
  const finished = new Promise((resolve) => {
    S.cancel = () => { cancelled = true; resolve(); };
    if (S.kind === 'video') vid.addEventListener('ended', resolve, { once: true });
    else { const check = () => (now() >= SAMPLE_LEN ? resolve() : S.exporting && setTimeout(check, 100)); check(); }
  });

  // start from the beginning, play once at normal speed while recording
  if (S.kind === 'video') {
    vid.pause(); vid.loop = false; vid.currentTime = 0;
    await new Promise((r) => vid.addEventListener('seeked', r, { once: true }));
  } else { S.sampleOffset = 0; }
  engine.ghostValid = false; S.lastKey = '';
  renderFrame(true);
  rec.start(500);
  if (S.kind === 'video') await vid.play().catch(() => {}); else S.sampleT0 = performance.now();
  S.playing = true; syncTransport();

  await finished;
  if (rec.state !== 'inactive') rec.stop();
  await stopped;
  stream.getVideoTracks().forEach((t) => t.stop());
  S.exporting = false; S.cancel = null;
  document.body.classList.remove('exporting');
  $('#exportBox').hidden = true;
  if (S.kind === 'video') { vid.loop = true; }
  if (cancelled) { toast('export cancelled'); return; }
  const type = rec.mimeType || mime || 'video/webm';
  download(new Blob(chunks, { type }), `hexcam-${lookSlug()}-${stampName()}.${type.includes('mp4') ? 'mp4' : 'webm'}`);
  toast(type.includes('mp4') ? 'video saved (MP4)' : 'video saved (WebM). Most apps accept it, or convert it to MP4 for Instagram', 6000);
};
$('#cancelExport').onclick = () => S.cancel?.();

// ── input
const fileInput = $('#file');
const pick = () => { if (!S.exporting) fileInput.click(); };
$('#open').onclick = pick; $('#open2').onclick = pick;
fileInput.onchange = () => { openFile(fileInput.files[0]); fileInput.value = ''; };
$('#samplePhoto').onclick = () => loadSample(false);
$('#sampleVideo').onclick = () => loadSample(true);
['dragenter', 'dragover'].forEach((ev) => window.addEventListener(ev, (e) => { e.preventDefault(); document.body.classList.add('dragging'); }));
['dragleave', 'drop'].forEach((ev) => window.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'drop' || e.target === document.documentElement || !e.relatedTarget) document.body.classList.remove('dragging'); }));
window.addEventListener('drop', (e) => { const f = e.dataTransfer?.files?.[0]; if (f) openFile(f); });
window.addEventListener('paste', (e) => { const f = [...(e.clipboardData?.files || [])][0]; if (f) openFile(f); });
window.addEventListener('keydown', (e) => {
  if (/input|select|textarea/i.test(e.target.tagName)) return;
  if (e.key === ' ' && motion()) { e.preventDefault(); setPlaying(!S.playing); }
  if (e.key === '\\' && !e.repeat) compareOn(true);
});
window.addEventListener('keyup', (e) => { if (e.key === '\\') compareOn(false); });
document.addEventListener('visibilitychange', () => { if (document.hidden && S.exporting) toast('keep this tab open and visible while exporting, or the recording stalls', 8000); });
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); toast('the GPU reset. Reload the page to continue.', 10000); });

buildLooks();
buildPanel();
syncPanel();
syncTransport();

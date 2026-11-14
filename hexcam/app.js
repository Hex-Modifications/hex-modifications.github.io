// hexcam UI: loading media, the control panel, playback, and export (photos as PNG/JPEG, video via MediaRecorder).
// Everything stays on the visitor's device: nothing is uploaded.
import { Engine } from './engine.js';
import { DEFAULTS, GROUPS, LOOKS, lookParams } from './looks.js';
import { drawStamp } from './extras.js';
import { analyseSong, analyseClip, planEdit, hitsAt, EditPlayer, FORMATS, drawEditText } from './autoedit.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const canvas = $('#gl'), vid = $('#vid');
const stampCanvas = document.createElement('canvas');
const ITEMS = GROUPS.flatMap((g) => g.items);
const ITEM = Object.fromEntries(ITEMS.map((it) => [it.k, it]));

const S = {
  kind: null,          // 'image' | 'video'
  name: '',
  playing: false, muted: true, compare: false, holding: false, exporting: false, dirty: false,
  seed: 1, lastKey: '', stampKey: '',
  audio: null, cancel: null, scrubbing: false,
  mode: 'look',        // 'look' | 'edit' (auto edit: clips cut to a song)
  image: null, videoFile: null,
};
// auto edit state
const E = {
  song: null, songFile: null, songUrl: '', clips: [], plan: null, player: null, busy: false, audio: null,
  opts: { pace: 'balanced', length: 30, start: 'drop', format: '9:16', hits: true, text: true, lines: ['', '', ''], seed: 7 },
};
const audioEl = new Audio(); audioEl.preload = 'auto';

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
// the look's own values: ghost ticks on the sliders, "modified" state, double-click reset
let base = lookParams(LOOKS.find((l) => l.id === lookId) || LOOKS[0]);

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
const editing = () => S.mode === 'edit' && E.plan && E.player;
const motion = () => S.kind === 'video' || editing();
const hash1 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const vnoise = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash1(i) * (1 - u) + hash1(i + 1) * u; };
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
function mark(el, on, label) {
  const mk = $('.mk', el);
  if (mk) mk.textContent = on ? '[*]' : '[ ]';
  if (el.getAttribute('role') === 'switch') el.setAttribute('aria-checked', on);
  else el.setAttribute('aria-pressed', on);
  if (label !== undefined) el.lastChild.textContent = label;
}
// console-style status line, typed out
function toast(msg, ms = 3200) {
  const t = $('#toast');
  clearInterval(toast.i); clearTimeout(toast.h);
  t.textContent = ''; t.classList.add('on');
  let n = 0;
  toast.i = setInterval(() => { t.textContent = msg.slice(0, (n += 2)); if (n >= msg.length) clearInterval(toast.i); }, reduced ? 0 : 12);
  toast.h = setTimeout(() => t.classList.remove('on'), ms);
}
function duration() { return editing() ? E.plan.duration : S.kind === 'video' ? (vid.duration || 0) : 0; }
function now() {
  if (editing()) return Math.max(0, Math.min(E.plan.duration, audioEl.currentTime - E.plan.start));
  return S.kind === 'video' ? vid.currentTime || 0 : 0;
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
  const t = editing() ? now() : 0;
  const text = editing() && E.plan.texts.some((x) => t >= x.t0 && t <= x.t1);
  const key = `${P.stamp === 'off' ? 'off' : `${P.stamp}|${P.stampDate}|${P.stampTime}|${P.stampText}|${Math.floor(elapsed * 2)}`}|${W}x${H}${text ? `|tx${Math.floor(t * 30)}` : ''}`;
  if (key === S.stampKey) return;
  S.stampKey = key;
  let c = drawStamp(stampCanvas, P, W, H, elapsed);
  if (text) {
    if (!c) { stampCanvas.width = W; stampCanvas.height = H; c = stampCanvas; c.getContext('2d').clearRect(0, 0, W, H); }
    drawEditText(c.getContext('2d'), E.plan, t, W, H);
  }
  engine.setStamp(c);
}

const showingOriginal = () => S.compare || S.holding;
let info = null;
function renderFrame(force) {
  if (!S.kind) return;
  const fi = frameInfo();
  const key = `${fi.key}|${showingOriginal()}`;
  if (!force && key === S.lastKey) return;
  S.lastKey = key;
  let Pf = P;
  if (editing()) {
    const t = now();
    E.player.frame(t, S.playing);
    engine.updateSource(E.player.canvas);
    const h = hitsAt(E.plan, t);
    if (h.flash > 0.01) Pf = { ...P, exposure: P.exposure + h.flash * 1.1, bloom: P.bloom + h.flash * 0.5 };
    if (S.playing && !S.exporting && audioEl.currentTime >= E.plan.end - 0.02) { audioEl.currentTime = E.plan.start; engine.ghostValid = false; }
    drawStrip();
  } else if (motion() && vid.readyState >= 2) engine.updateSource(vid);
  const { W, H } = engine.sizes(P);
  updateStamp(W, H, motion() ? fi.t : 0);
  if (showingOriginal()) engine.showOriginal(P);
  else info = engine.render(Pf, fi.f);
  document.body.classList.toggle('comparing', showingOriginal());
  if (info) $('#info').textContent = editing() ? `edit · ${E.plan.bpm} bpm · ${E.plan.cuts.length} cuts · ${fmtTime(E.plan.duration)} · out ${info.OW}×${info.OH}` : `${engine.srcW}×${engine.srcH} → sensor ${info.W}×${info.H} → out ${info.OW}×${info.OH}${motion() ? ` · ${P.fps > 0 ? P.fps : 'src'} fps` : ''}`;
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
  document.body.dataset.kind = S.kind;
  $('#transport').hidden = !motion();
  $('#exportVideo').hidden = !motion();
  $('#savePhoto span').textContent = motion() ? 'Export frame' : 'Export image';
  $('#fileName').textContent = `${S.name}${motion() ? ` · ${fmtTime(duration())}` : ''}`;
  S.lastKey = ''; S.stampKey = '';
  schedule();
  setTimeout(refreshThumbs, 80);
}

function stopVideo() {
  vid.pause();
  if (vid.src) { URL.revokeObjectURL(vid.src); vid.removeAttribute('src'); vid.load(); }
}

async function loadImage(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { return toast(`couldn't read that image${/heic|heif/i.test(file.type + file.name) ? '. HEIC only opens in Safari: save it as JPEG first' : ''}`); }
  const long = Math.max(bmp.width, bmp.height), s = Math.min(1, 3200 / long);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  stopVideo();
  if (editing()) exitEdit(true);
  S.kind = 'image'; S.playing = false; S.name = file.name; S.image = c;
  engine.setSource(c, c.width, c.height);
  afterLoad();
  toast(`opened ${file.name}`);
}

function loadVideo(file) {
  if (editing()) exitEdit(true);
  stopVideo();
  S.videoFile = file;
  const url = URL.createObjectURL(file);
  vid.src = url; vid.loop = true; vid.muted = S.audio ? false : S.muted; vid.playsInline = true;
  vid.onerror = () => toast("this browser can't decode that video. MP4 (H.264) and WebM work everywhere");
  vid.addEventListener('loadeddata', async () => {
    S.kind = 'video'; S.name = file.name;
    engine.setSource(vid, vid.videoWidth, vid.videoHeight);
    afterLoad();
    try { await vid.play(); S.playing = true; } catch { S.playing = false; }
    syncTransport();
    toast(vid.duration > 300 ? 'long video: export runs in real time, so it takes as long as it plays' : `opened ${file.name}`, 5000);
  }, { once: true });
}

function openFile(file) {
  if (!file || S.exporting) return;
  if (/^audio\//.test(file.type) || /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i.test(file.name)) return setSong(file);
  if (/^video\//.test(file.type) || /\.(mp4|m4v|mov|webm|mkv|ogv)$/i.test(file.name)) loadVideo(file);
  else if (/^image\//.test(file.type) || /\.(jpe?g|png|webp|gif|avif|bmp|heic|heif)$/i.test(file.name)) loadImage(file);
  else toast("that file type isn't supported. Use JPG, PNG, WEBP, MP4, MOV or WEBM");
}

// ── transport
function setPlaying(on) {
  if (!motion()) return;
  if (editing()) {
    if (on) { ensureEditAudio()?.ctx.resume(); audioEl.play().catch(() => {}); } else { audioEl.pause(); E.player.stop(); }
  } else on ? vid.play().catch(() => {}) : vid.pause();
  S.playing = on;
  syncTransport();
  schedule();
}
function seek(frac) {
  const f = Math.max(0, Math.min(1, frac));
  if (editing()) { audioEl.currentTime = E.plan.start + f * E.plan.duration; E.player.cur = -1; }
  else vid.currentTime = f * duration();
  engine.ghostValid = false;
  schedule();
}
function syncTransport() {
  mark($('#play'), S.playing, S.playing ? 'PAUSE' : 'PLAY');
  mark($('#mute'), !S.muted, S.muted ? 'SOUND OFF' : 'SOUND ON');
}
vid.addEventListener('seeked', schedule);
$('#play').onclick = () => setPlaying(!S.playing);
$('#scrub').addEventListener('input', (e) => { S.scrubbing = true; e.target.style.setProperty('--p', `${e.target.value / 10}%`); seek(e.target.value / 1000); });
$('#scrub').addEventListener('change', () => { S.scrubbing = false; });
$('#mute').onclick = () => {
  S.muted = !S.muted;
  if (S.audio) { S.audio.spk.gain.value = S.muted ? 0 : 1; S.audio.ctx.resume(); } else vid.muted = S.muted;
  if (E.audio) { E.audio.spk.gain.value = S.muted ? 0 : 1; E.audio.ctx.resume(); } else audioEl.muted = S.muted;
  syncTransport();
};

// ── panel
const ID = (k) => `c-${k}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function depMet(dep) {
  if (!dep) return true;
  if (dep === 'bits<8') return P.bits < 8;
  const [k, v] = dep.split('=');
  return v === undefined ? (k === 'stamp' ? P.stamp !== 'off' : !!P[k]) : P[k] === v;
}
const pct = (it, v) => `${Math.max(0, Math.min(100, ((v - it.min) / (it.max - it.min)) * 100))}%`;
const snap = (it, v) => { const s = it.step || 1; v = Math.min(it.max, Math.max(it.min, v)); return +(Math.round((v - it.min) / s) * s + it.min).toFixed(4); };
const same = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-6 : String(a).toLowerCase() === String(b).toLowerCase());

const groupState = store.get('hexcam:groups') || {};
function buildPanel() {
  const host = $('#groups');
  for (const g of GROUPS) {
    const sec = document.createElement('section');
    const open = groupState[g.id] ?? !!g.open;
    sec.className = `grp${open ? '' : ' shut'}`;
    sec.innerHTML = `<button class="gh" type="button" aria-expanded="${open}"><span class="t">${g.label}</span><span class="dots"></span><span class="pm">${open ? '-' : '+'}</span></button><div class="gb"><div class="gi"><div class="rows"></div></div></div>`;
    const gh = $('.gh', sec);
    gh.onclick = () => {
      const shut = sec.classList.toggle('shut');
      gh.setAttribute('aria-expanded', !shut); $('.pm', gh).textContent = shut ? '+' : '-';
      groupState[g.id] = !shut; store.set('hexcam:groups', groupState);
    };
    const rows = $('.rows', sec);
    for (const it of g.items) rows.appendChild(buildRow(it));
    host.appendChild(sec);
  }
  if (!engine.floatOK) {
    const r = $('.row[data-k="jpeg"]');
    $('button', r).disabled = true;
    r.insertAdjacentHTML('beforeend', '<p class="note">this GPU can\'t run the codec (no float render targets)</p>');
  }
}
function buildRow(it) {
  const row = document.createElement('div');
  row.className = `row row-${it.type}${it.video ? ' is-video' : ''}`;
  row.dataset.k = it.k;
  const hint = it.hint ? ` title="${esc(it.hint)}"` : '';
  const vtag = it.video ? '<span class="vtag">video</span>' : '';
  const lab = `<label class="lab" for="${ID(it.k)}"${hint}>${it.label}${vtag}</label>`;
  if (it.type === 'range') {
    row.innerHTML = `<div class="top">${lab}<span class="val" aria-hidden="true"></span></div><div class="trk"><i class="def"></i><input type="range" id="${ID(it.k)}" min="${it.min}" max="${it.max}" step="${it.step}"></div>`;
    const input = $('input', row);
    input.addEventListener('input', () => set(it.k, Number(input.value)));
    input.addEventListener('change', commitSoon);
    scrubbable($('.val', row), it);
  } else if (it.type === 'toggle') {
    row.innerHTML = `<button class="item toggle" id="${ID(it.k)}" type="button" role="switch" aria-checked="false"${hint}><span class="mk">[ ]</span><span class="lab">${it.label}${vtag}</span></button>`;
    $('button', row).onclick = () => { set(it.k, !P[it.k]); commitSoon(); };
  } else if (it.type === 'select') {
    row.innerHTML = `<div class="top"><span class="lab" id="${ID(it.k)}-l"${hint}>${it.label}</span><span class="seg" id="${ID(it.k)}" role="radiogroup" aria-labelledby="${ID(it.k)}-l">${it.options.map(([v, l]) => `<button type="button" role="radio" data-v="${v}" aria-checked="false">${l}</button>`).join('')}</span></div>`;
    $$('[data-v]', row).forEach((b) => { b.onclick = () => { set(it.k, b.dataset.v); commitSoon(); }; });
  } else if (it.type === 'swatch') {
    row.innerHTML = `<div class="top"><span class="lab">${it.label}</span><span class="colr"><span class="hex"></span><input type="color" id="${ID(it.k)}" aria-label="custom ${it.label}"></span></div><div class="sw" role="radiogroup" aria-label="${it.label}">${it.options.map((c) => `<button type="button" role="radio" data-v="${c}" style="--sw:${c}" aria-label="${c}"></button>`).join('')}</div>`;
    $$('[data-v]', row).forEach((b) => { b.onclick = () => { set(it.k, b.dataset.v); commitSoon(); }; });
    $('input', row).addEventListener('input', (e) => set(it.k, e.target.value));
    $('input', row).addEventListener('change', commitSoon);
  } else if (it.type === 'color') {
    row.innerHTML = `<div class="top">${lab}<span class="colr"><span class="hex"></span><input type="color" id="${ID(it.k)}"></span></div>`;
    $('input', row).addEventListener('input', (e) => set(it.k, e.target.value));
    $('input', row).addEventListener('change', commitSoon);
  } else {
    row.innerHTML = `<div class="top">${lab}<input class="field" type="${it.type}" id="${ID(it.k)}"${it.max ? ` maxlength="${it.max}"` : ''}></div>`;
    $('input', row).addEventListener('input', (e) => set(it.k, it.type === 'text' ? e.target.value.slice(0, it.max || 40) : e.target.value));
    $('input', row).addEventListener('change', commitSoon);
  }
  const l = $('.lab', row);
  l.addEventListener('dblclick', (e) => { e.preventDefault(); set(it.k, base[it.k] ?? DEFAULTS[it.k]); commitSoon(); toast(`${it.label} reset`); });
  return row;
}
// drag a number left/right to change it; Shift for fine steps; double-click to type
function scrubbable(el, it) {
  let x0 = 0, v0 = 0, moved = false;
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    el.setPointerCapture(e.pointerId); x0 = e.clientX; v0 = P[it.k]; moved = false;
  });
  el.addEventListener('pointermove', (e) => {
    if (!el.hasPointerCapture(e.pointerId)) return;
    const dx = e.clientX - x0;
    if (Math.abs(dx) > 2) moved = true;
    if (moved) set(it.k, snap(it, v0 + (dx / 220) * (it.max - it.min) * (e.shiftKey ? 0.1 : 1)));
  });
  el.addEventListener('pointerup', () => { if (moved) commitSoon(); });
  el.addEventListener('dblclick', () => {
    el.contentEditable = 'plaintext-only';
    el.textContent = String(+(+P[it.k]).toFixed(3));
    el.focus();
    getSelection().selectAllChildren(el);
    const done = (ok) => {
      el.removeEventListener('keydown', key); el.removeEventListener('blur', blur);
      el.contentEditable = 'false';
      const v = Number(el.textContent.trim());
      if (ok && el.textContent.trim() !== '' && !Number.isNaN(v)) { set(it.k, snap(it, v)); commitSoon(); } else syncPanel();
    };
    const key = (e) => { if (e.key === 'Enter') { e.preventDefault(); done(true); } if (e.key === 'Escape') done(false); e.stopPropagation(); };
    const blur = () => done(true);
    el.addEventListener('keydown', key); el.addEventListener('blur', blur);
  });
}
function syncPanel(changed) {
  for (const it of ITEMS) {
    const row = $(`.row[data-k="${it.k}"]`);
    if (!row) continue;
    const v = P[it.k];
    row.hidden = !depMet(it.dep);
    row.classList.toggle('mod', !same(v, base[it.k]));
    if (it.type === 'range') {
      const input = $('input', row);
      if (document.activeElement !== input || changed !== it.k) input.value = v;
      input.style.setProperty('--p', pct(it, v));
      $('.def', row).style.setProperty('--d', pct(it, base[it.k]));
      $('.val', row).textContent = it.fmt ? it.fmt(it.step >= 1 ? Math.round(v) : +(+v).toFixed(3)) : v;
    } else if (it.type === 'toggle') {
      mark($('button', row), !!v);
    } else if (it.type === 'select' || it.type === 'swatch') {
      $$('[data-v]', row).forEach((b) => b.setAttribute('aria-checked', same(b.dataset.v, v)));
      if (it.type === 'swatch') { $('input', row).value = v; $('.hex', row).textContent = v; }
    } else if (it.type === 'color') {
      $('input', row).value = v; $('.hex', row).textContent = v;
    } else {
      const input = $('input', row);
      if (document.activeElement !== input) input.value = v;
    }
  }
  if (changed && ITEM[changed]?.type === 'range') {
    const val = $(`.row[data-k="${changed}"] .val`);
    val.classList.add('flash'); clearTimeout(val.t); val.t = setTimeout(() => val.classList.remove('flash'), 260);
  }
  $$('.look').forEach((b) => mark(b, b.dataset.id === lookId));
  $('#lookName').textContent = lookId === 'custom' ? 'custom' : (LOOKS.find((l) => l.id === lookId)?.name || 'custom');
}

let saveT;
function persist() { clearTimeout(saveT); saveT = setTimeout(() => store.set('hexcam:v1', { p: P, look: lookId }), 300); }
function set(k, v) {
  if (S.exporting && (k === 'res' || k === 'out')) return toast('size is locked while exporting');
  cancelTween();
  P[k] = v;
  if (!k.startsWith('stamp') && lookId !== 'custom') lookId = 'custom';
  syncPanel(k);
  schedule();
  persist();
}

// ── undo / redo: snapshots of every settled change
const hist = { list: [], i: -1 };
const snapNow = () => JSON.stringify({ p: P, look: lookId });
function commit() {
  if (tween) { tween.after = true; return; }      // record the look it lands on, not a frame of the glide
  const s = snapNow();
  if (hist.list[hist.i] === s) return;
  hist.list = hist.list.slice(0, hist.i + 1);
  hist.list.push(s);
  if (hist.list.length > 120) hist.list.shift();
  hist.i = hist.list.length - 1;
}
let commitT;
function commitSoon() { clearTimeout(commitT); commitT = setTimeout(commit, 250); }
function travel(d) {
  clearTimeout(commitT); commit();
  const j = hist.i + d;
  if (j < 0 || j >= hist.list.length) return toast(d < 0 ? 'nothing to undo' : 'nothing to redo');
  hist.i = j;
  const s = JSON.parse(hist.list[j]);
  tweenTo({ ...DEFAULTS, ...s.p }, s.look);
  toast(d < 0 ? 'undo' : 'redo', 1200);
}

// ── looks glide into place: numbers ease over a quarter second while the picture re-renders
let tween = null;
function cancelTween() { if (tween) { cancelAnimationFrame(tween.raf); tween = null; } }
function tweenTo(target, id) {
  cancelTween();
  lookId = id;
  const look = LOOKS.find((l) => l.id === id);
  if (look) base = lookParams(look);
  const from = { ...P };
  for (const [k, v] of Object.entries(target)) if (typeof v !== 'number') P[k] = v;
  engine.ghostValid = false;
  const t0 = performance.now(), dur = reduced ? 0 : 260;
  const step = (t) => {
    const u = dur ? Math.min(1, (t - t0) / dur) : 1, e = 1 - (1 - u) ** 3;
    for (const [k, v] of Object.entries(target)) if (typeof v === 'number') P[k] = u >= 1 ? v : from[k] + (v - from[k]) * e;
    syncPanel(); schedule();
    if (u < 1) tween.raf = requestAnimationFrame(step);
    else { const after = tween.after; tween = null; persist(); if (after) commit(); }
  };
  tween = { raf: requestAnimationFrame(step) };
}
function applyLook(id) {
  const look = LOOKS.find((l) => l.id === id);
  if (!look) return;
  const keep = { stampDate: P.stampDate, stampTime: P.stampTime, stampText: P.stampText };
  tweenTo({ ...lookParams(look), ...keep }, id);
  const b = $(`.look[data-id="${id}"]`);
  b?.classList.remove('flash'); void b?.offsetWidth; b?.classList.add('flash');
  commitSoon();
}
function buildLooks() {
  $('#looks').innerHTML = LOOKS.map((l) => `<li><button type="button" class="item look" data-id="${l.id}" aria-pressed="false"><span class="mk">[ ]</span>${l.name.toUpperCase()}</button></li>`).join('');
  const peek = $('#peek'), pc = $('canvas', peek);
  $$('.look').forEach((b) => {
    b.onclick = () => applyLook(b.dataset.id);
    b.addEventListener('pointerenter', () => {
      const th = thumbs.get(b.dataset.id);
      if (!th || matchMedia('(max-width: 900px)').matches) return;
      pc.width = th.width; pc.height = th.height;
      pc.getContext('2d').drawImage(th, 0, 0);
      $('span', peek).textContent = LOOKS.find((l) => l.id === b.dataset.id).note;
      const r = b.getBoundingClientRect();
      peek.style.top = `${Math.min(innerHeight - 150, Math.max(8, r.top - 30))}px`;
      peek.classList.add('on');
    });
    b.addEventListener('pointerleave', () => peek.classList.remove('on'));
  });
}
// every look rendered small from the current picture, shown on hover
const thumbs = new Map();
let thumbBusy = false;
function refreshThumbs() {
  if (!S.kind || thumbBusy || S.exporting) return;
  thumbBusy = true;
  const real = P;
  try {
    for (const l of LOOKS) {
      P = { ...lookParams(l), stamp: 'off', out: '320', fps: 0, ghost: 0 };
      P.res = Math.min(P.res, 320);
      engine.setStamp(null);
      engine.render(P, { time: 1.3, seed: 3, still: true });
      const c = thumbs.get(l.id) || document.createElement('canvas');
      c.width = 160; c.height = Math.round(160 * canvas.height / canvas.width);
      c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
      thumbs.set(l.id, c);
    }
  } finally {
    P = real; S.stampKey = ''; S.lastKey = ''; engine.ghostValid = false; thumbBusy = false;
    schedule();
  }
}

// ── actions
function randomise() {
  const pool = LOOKS.filter((l) => l.id !== 'raw');
  const pick = pool[Math.floor(Math.random() * pool.length)];
  const next = lookParams(pick);
  const nudge = ['contrast', 'sat', 'temp', 'tint', 'bloom', 'noise', 'grain', 'vignette', 'ca', 'quality', 'res', 'exposure', 'blacks'];
  for (const k of nudge) { const it = ITEM[k]; next[k] = snap(it, next[k] + (Math.random() - 0.5) * (it.max - it.min) * 0.18); }
  tweenTo({ ...next, stampDate: P.stampDate, stampTime: P.stampTime, stampText: P.stampText }, 'custom');
  base = lookParams(pick);
  commitSoon();
  toast(`randomised from ${pick.name}`, 1800);
}
function reroll() { S.seed = (S.seed % 997) + 1 + Math.floor(Math.random() * 50); schedule(); toast('new grain pattern', 1200); }
$('#random').onclick = randomise;
$('#reroll').onclick = reroll;
$('#undo').onclick = () => travel(-1);
$('#reset').onclick = () => { applyLook('raw'); toast('reset to raw', 1400); };
$('#share').onclick = async () => {
  const url = `${location.origin}${location.pathname}#look=${encodeLook()}`;
  history.replaceState(null, '', url);
  try { await navigator.clipboard.writeText(url); toast('look link copied'); } catch { toast('look link is in the address bar'); }
};
function setCompare(on) { S.compare = on; mark($('#compare'), !on); schedule(); }
$('#compare').onclick = () => setCompare(!S.compare);

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const stampName = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const lookSlug = () => (lookId === 'custom' ? 'custom' : lookId);
let photoFmt = 'image/png';
$$('#photoFmt [data-v]').forEach((b) => { b.onclick = () => { photoFmt = b.dataset.v; $$('#photoFmt [data-v]').forEach((x) => x.setAttribute('aria-checked', x === b)); }; });
function sweep(btn) { btn.classList.remove('go'); void btn.offsetWidth; btn.classList.add('go'); }

function savePhoto() {
  if (!S.kind) return toast('open a photo or video first');
  const c = S.compare, h = S.holding; S.compare = false; S.holding = false;
  renderFrame(true);
  sweep($('#savePhoto'));
  const name = `hexcam-${lookSlug()}-${stampName()}.${photoFmt === 'image/png' ? 'png' : 'jpg'}`;
  canvas.toBlob((b) => {
    if (!b) return toast('saving failed');
    download(b, name);
    toast(`saved ${name}`);
  }, photoFmt, 0.95);
  S.compare = c; S.holding = h;
}
$('#savePhoto').onclick = savePhoto;

function pickMime() {
  const types = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc3,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return types.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
}
function setProgress(f) {
  const n = Math.round(Math.min(1, Math.max(0, f)) * 20);
  $('#progress').textContent = `[${'#'.repeat(n)}${'-'.repeat(20 - n)}]`;
  $('#progressPct').textContent = `${Math.round(Math.min(1, f) * 100)}%`;
}

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

async function exportVideo() {
  if (!motion()) return toast(S.kind ? 'video export needs a video or an auto edit. Export image saves this photo' : 'open a video first');
  if (S.exporting) return;
  if (!window.MediaRecorder || !canvas.captureStream) return toast("this browser can't record video. Use Chrome, Edge, Firefox or Safari 14.1+");
  const mime = pickMime();
  const fps = P.fps > 0 ? P.fps : 30;
  const stream = canvas.captureStream(fps);
  const a = editing() ? ensureEditAudio() : ensureAudio();
  if (a) { await a.ctx.resume(); a.dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t)); }
  let rec;
  try { rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: Math.round(P.bitrate * 1000), audioBitsPerSecond: 160000 }); }
  catch (e) { return toast(`recording failed to start: ${e.message}`); }
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise((r) => { rec.onstop = r; });

  S.exporting = true; document.body.classList.add('exporting');
  S.compare = false; S.holding = false; mark($('#compare'), true);
  $('#exportBox').hidden = false; setProgress(0);
  sweep($('#exportVideo'));
  let cancelled = false;
  const finished = new Promise((resolve) => {
    S.cancel = () => { cancelled = true; resolve(); };
    if (editing()) {
      const check = () => { if (!S.exporting) return; if (audioEl.currentTime >= E.plan.end - 0.03 || audioEl.ended) resolve(); else setTimeout(check, 30); };
      setTimeout(check, 300);
    } else vid.addEventListener('ended', resolve, { once: true });
  });

  // start from the beginning, play once at normal speed while recording
  if (editing()) {
    audioEl.pause(); E.player.stop(); E.player.cur = -1;
    audioEl.currentTime = E.plan.start;
    await new Promise((r) => { audioEl.addEventListener('seeked', r, { once: true }); setTimeout(r, 600); });
    E.player.frame(0, false);
    await new Promise((r) => setTimeout(r, 250));
  } else {
    vid.pause(); vid.loop = false; vid.currentTime = 0;
    await new Promise((r) => vid.addEventListener('seeked', r, { once: true }));
  }
  engine.ghostValid = false; S.lastKey = '';
  renderFrame(true);
  rec.start(500);
  if (editing()) await audioEl.play().catch(() => {}); else await vid.play().catch(() => {});
  S.playing = true; syncTransport();

  await finished;
  if (editing()) { audioEl.pause(); E.player.stop(); S.playing = false; syncTransport(); }
  if (rec.state !== 'inactive') rec.stop();
  await stopped;
  stream.getVideoTracks().forEach((t) => t.stop());
  S.exporting = false; S.cancel = null;
  document.body.classList.remove('exporting');
  $('#exportBox').hidden = true;
  vid.loop = true;
  if (cancelled) return toast('export cancelled');
  const type = rec.mimeType || mime || 'video/webm';
  const name = `hexcam-${editing() ? 'edit-' : ''}${lookSlug()}-${stampName()}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
  download(new Blob(chunks, { type }), name);
  toast(type.includes('mp4') ? `saved ${name}` : `saved ${name}. convert to MP4 for Instagram`, 6000);
}
$('#exportVideo').onclick = exportVideo;
$('#cancelExport').onclick = () => S.cancel?.();

// ── dialogs
$$('[data-dialog]').forEach((b) => { b.onclick = () => $(`#${b.dataset.dialog}`).showModal(); });
$$('dialog [data-close]').forEach((b) => { b.onclick = () => b.closest('dialog').close(); });
$$('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));


// ── auto edit ─────────────────────────────────────────
const savedEd = store.get('hexcam:edit');
if (savedEd) Object.assign(E.opts, savedEd, { seed: 7 });
const edStatus = (t) => { $('#edStatus').textContent = t; };
function ensureEditAudio() {
  if (E.audio) return E.audio;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  const src = ctx.createMediaElementSource(audioEl);
  const dest = ctx.createMediaStreamDestination();
  const spk = ctx.createGain();
  spk.gain.value = S.muted ? 0 : 1;
  src.connect(dest); src.connect(spk); spk.connect(ctx.destination);
  audioEl.muted = false;
  E.audio = { ctx, dest, spk };
  return E.audio;
}
async function setSong(file) {
  if (E.busy) return toast('still analysing, one moment');
  E.busy = true;
  try {
    edStatus('reading the song');
    const song = await analyseSong(file, (f) => edStatus(`finding the beat ${Math.round(f * 100)}%`));
    if (E.songUrl) URL.revokeObjectURL(E.songUrl);
    E.song = song; E.songFile = file; E.songUrl = URL.createObjectURL(file);
    audioEl.src = E.songUrl;
    $('#edSong').textContent = `${file.name} · ${song.bpm} bpm · ${fmtTime(song.duration)}`;
    mark($('#edSongBtn'), true);
    edStatus(`${song.bpm} bpm · drop at ${fmtTime(song.beats[song.drop] || 0)}`);
    toast(`song ready: ${song.bpm} bpm`);
  } catch (e) {
    edStatus(''); toast(`couldn't read that audio file (${e.message})`);
  } finally { E.busy = false; }
  syncEd();
}
function clipList() {
  const list = E.clips.slice();
  if (S.videoFile && !list.some((c) => c.file === S.videoFile)) {
    if (E.openClip?.file !== S.videoFile) E.openClip = { file: S.videoFile };   // keep its analysis between rebuilds
    list.unshift(E.openClip);
  }
  return list;
}
function addClips(files) {
  for (const f of files) if (/^video\//.test(f.type) || /\.(mp4|m4v|mov|webm|mkv)$/i.test(f.name)) if (!E.clips.some((c) => c.file === f)) E.clips.push({ file: f });
  syncEd();
}
async function prepClip(c, n, total) {
  if (c.meta) return c.meta;
  c.url = c.url || URL.createObjectURL(c.file);
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = c.url;
  await new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error(`can't decode ${c.file.name}`)); });
  const a = await analyseClip(v, (f) => edStatus(`reading clip ${n}/${total} ${Math.round(f * 100)}%`));
  c.meta = { ...a, width: v.videoWidth, height: v.videoHeight };
  v.removeAttribute('src'); v.load();
  return c.meta;
}
async function buildEdit(reshuffle) {
  if (E.busy || S.exporting) return;
  const clips = clipList();
  if (!E.song) return toast('add a song first');
  if (!clips.length) return toast('add at least one video clip');
  E.busy = true; $('#edBuild').disabled = true;
  try {
    E.abort = false;
    for (const [i, c] of clips.entries()) await prepClip(c, i + 1, clips.length);
    if (E.abort) { E.abort = false; edStatus(''); return; }
    if (reshuffle) E.opts.seed = (E.opts.seed * 7 + 13) % 99991;
    const plan = planEdit(E.song, clips.map((c) => c.meta), { ...E.opts, length: Number(E.opts.length) || 0 });
    if (!plan.cuts.length) throw new Error('the song is too short for this length');
    const aspect = FORMATS[E.opts.format];
    const sameClips = E.player && E.player.clips.length === clips.length && E.player.aspectKey === E.opts.format && E.player.clips.every((c, i) => c.url === clips[i].url);
    if (sameClips) { E.player.stop(); E.player.plan = plan; E.player.cur = -1; }
    else {
      E.player?.destroy();
      E.player = new EditPlayer(clips.map((c) => ({ url: c.url, width: c.meta.width, height: c.meta.height })), plan, aspect);
      E.player.aspectKey = E.opts.format;
    }
    E.plan = plan;
    const wasVideo = S.kind === 'video';
    if (wasVideo) vid.pause();
    S.mode = 'edit';
    if (!S.kind) S.kind = 'video';
    engine.setSource(E.player.canvas, E.player.canvas.width, E.player.canvas.height);
    document.body.dataset.kind = 'video';
    document.body.classList.add('editing');
    $('#transport').hidden = false; $('#exportVideo').hidden = false; $('#strip').hidden = false;
    $('#savePhoto span').textContent = 'Export frame';
    $('#fileName').textContent = `auto edit · ${E.song.name}`;
    audioEl.currentTime = plan.start;
    S.playing = false; S.lastKey = ''; S.stampKey = ''; engine.ghostValid = false;
    setPlaying(true);
    edStatus(`${plan.cuts.length} cuts · ${plan.bpm} bpm · ${fmtTime(plan.duration)}${plan.texts.length ? ` · ${plan.texts.length} text` : ''}`);
    toast(reshuffle ? 'reshuffled' : `edit built: ${plan.cuts.length} cuts on the beat`);
    setTimeout(refreshThumbs, 400);
  } catch (e) {
    toast(e.message); edStatus('');
  } finally { E.busy = false; $('#edBuild').disabled = false; syncEd(); }
}
function exitEdit(silent) {
  if (E.busy) E.abort = true;                       // a rebuild in progress stops instead of re-entering the edit
  if (!E.plan) return;
  audioEl.pause(); E.player?.stop();
  S.mode = 'look'; S.playing = false;
  document.body.classList.remove('editing');
  $('#strip').hidden = true;
  if (S.videoFile && vid.src) { S.kind = 'video'; engine.setSource(vid, vid.videoWidth, vid.videoHeight); }
  else if (S.image) { S.kind = 'image'; engine.setSource(S.image, S.image.width, S.image.height); }
  else { S.kind = null; delete document.body.dataset.kind; }
  E.plan = null;
  if (S.kind) afterLoad();
  syncTransport(); syncEd();
  if (!silent) toast('left the edit');
}
let replanT;
function setEd(k, v) {
  E.opts[k] = v;
  store.set('hexcam:edit', { ...E.opts, lines: E.opts.lines });
  syncEd();
  if (editing()) { clearTimeout(replanT); replanT = setTimeout(() => buildEdit(false), k === 'lines' ? 600 : 120); }
}
function syncEd() {
  $$('[data-ed]').forEach((g) => $$('[data-v]', g).forEach((b) => b.setAttribute('aria-checked', String(E.opts[g.dataset.ed]) === b.dataset.v)));
  $$('[data-edt]').forEach((b) => mark(b, !!E.opts[b.dataset.edt]));
  $$('[data-edl]').forEach((f) => { if (document.activeElement !== f) f.value = E.opts.lines[+f.dataset.edl] || ''; f.closest('.row').hidden = !E.opts.text; });
  const clips = clipList();
  $('#edClips').textContent = clips.length ? clips.map((c) => c.file.name).join(' · ') : 'one or more videos. the open video counts';
  mark($('#edClipBtn'), clips.length > 0);
  $('#edBuild span').textContent = editing() ? 'Rebuild edit' : 'Build edit';
  $('#edAfter').hidden = !editing();
  $('#edBuild').classList.toggle('ready', !!E.song && clips.length > 0);
}
// the beat strip: loudness, beats, cuts, hits, text and the playhead
const strip = $('#strip');
function drawStrip() {
  if (!editing() || strip.hidden) return;
  const r = strip.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
  if (strip.width !== W || strip.height !== H) { strip.width = W; strip.height = H; }
  const c = strip.getContext('2d'), cs = getComputedStyle(document.documentElement);
  const ink = cs.getPropertyValue('--ink').trim() || '#121117', faint = cs.getPropertyValue('--faint').trim() || '#999';
  const p = E.plan, s = E.song, x = (t) => (t / p.duration) * W;
  c.clearRect(0, 0, W, H);
  // loudness envelope
  c.fillStyle = faint; c.globalAlpha = 0.45;
  const f0 = Math.floor(p.start * s.envRate), f1 = Math.ceil(p.end * s.envRate), step = Math.max(1, Math.floor((f1 - f0) / (W / (2 * dpr))));
  for (let f = f0; f < f1; f += step) { let m = 0; for (let k = 0; k < step; k++) m = Math.max(m, s.env[f + k] || 0); const h = m * H * 0.55; c.fillRect(x(f / s.envRate - p.start), H - h, Math.max(1, dpr), h); }
  c.globalAlpha = 1;
  // cuts
  c.fillStyle = ink;
  for (const cut of p.cuts) c.fillRect(x(cut.t0), 0, Math.max(1, dpr), H * 0.35);
  // text spans and hits
  const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#E89898'); g.addColorStop(1, '#A373D3');
  c.fillStyle = g;
  for (const t of p.texts) c.fillRect(x(t.t0), H * 0.42, Math.max(2, x(t.t1) - x(t.t0)), 2 * dpr);
  for (const h of p.hits) { c.beginPath(); c.arc(x(h.t), H * 0.18, (h.kind === 'flash' ? 2.5 : 1.6) * dpr, 0, 7); c.fill(); }
  // playhead
  c.fillStyle = ink; c.fillRect(x(now()), 0, Math.max(1, 1.5 * dpr), H);
}
strip.addEventListener('pointerdown', (e) => {
  if (!editing()) return;
  const r = strip.getBoundingClientRect();
  seek((e.clientX - r.left) / r.width); schedule();
});
$('#edSongBtn').onclick = () => $('#songFile').click();
$('#songFile').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) setSong(f); };
$('#edClipBtn').onclick = () => $('#clipFiles').click();
$('#clipFiles').onchange = (e) => { addClips([...e.target.files]); e.target.value = ''; };
$('#edBuild').onclick = () => buildEdit(false);
$('#edShuffle').onclick = () => buildEdit(true);
$('#edExit').onclick = () => exitEdit();
$$('[data-ed]').forEach((g) => $$('[data-v]', g).forEach((b) => { b.onclick = () => setEd(g.dataset.ed, g.dataset.ed === 'length' ? Number(b.dataset.v) : b.dataset.v); }));
$$('[data-edt]').forEach((b) => { b.onclick = () => setEd(b.dataset.edt, !E.opts[b.dataset.edt]); });
$$('[data-edl]').forEach((f) => f.addEventListener('input', () => { const l = E.opts.lines.slice(); l[+f.dataset.edl] = f.value.slice(0, 48); setEd('lines', l); }));
{
  const gh = $('#edGroup .gh'), sec = $('#edGroup');
  gh.onclick = () => { const shut = sec.classList.toggle('shut'); gh.setAttribute('aria-expanded', !shut); $('.pm', gh).textContent = shut ? '+' : '-'; };
}
audioEl.addEventListener('ended', () => { if (editing() && !S.exporting) { audioEl.currentTime = E.plan.start; audioEl.play().catch(() => {}); } });

// ── input
const fileInput = $('#file');
const pick = () => { if (!S.exporting) fileInput.click(); };
$('#open').onclick = pick; $('#drop').onclick = pick;
fileInput.onchange = () => { openFile(fileInput.files[0]); fileInput.value = ''; };
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; document.body.classList.add('dragging'); });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
window.addEventListener('drop', (e) => { e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging'); const f = e.dataTransfer?.files?.[0]; if (f) openFile(f); });
window.addEventListener('paste', (e) => { const f = [...(e.clipboardData?.files || [])][0]; if (f) openFile(f); });

function stepLook(d) {
  const i = Math.max(-1, LOOKS.findIndex((l) => l.id === lookId));
  const j = (i + d + LOOKS.length) % LOOKS.length;
  applyLook(LOOKS[i < 0 && d < 0 ? LOOKS.length - 1 : j].id);
  $(`.look[data-id="${lookId}"]`)?.scrollIntoView({ block: 'nearest' });
}
window.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (mod && k === 'o') { e.preventDefault(); return pick(); }
  if (mod && k === 's') { e.preventDefault(); return savePhoto(); }
  if (mod && k === 'e') { e.preventDefault(); return exportVideo(); }
  if (mod && k === 'b') { e.preventDefault(); return buildEdit(); }
  if (mod && (k === 'z' || k === 'y')) {
    if (/input|textarea/i.test(e.target.tagName) && e.target.type === 'text') return;
    e.preventDefault(); return travel(k === 'y' || e.shiftKey ? 1 : -1);
  }
  if (mod || e.altKey) return;
  const typing = /input|select|textarea/i.test(e.target.tagName) && !['range', 'checkbox'].includes(e.target.type);
  if (typing || $('dialog[open]')) return;
  if (e.key === '?') return $('#keys').showModal();
  if (e.key === ' ' && motion()) { e.preventDefault(); return setPlaying(!S.playing); }
  if (e.key === '\\' && !e.repeat) { S.holding = true; schedule(); return; }
  if (e.target.type === 'range') return;
  if (e.key === 'ArrowDown') { e.preventDefault(); return stepLook(1); }
  if (e.key === 'ArrowUp') { e.preventDefault(); return stepLook(-1); }
  if (k === 'r') return randomise();
  if (k === 'g') return reroll();
});
window.addEventListener('keyup', (e) => { if (e.key === '\\') { S.holding = false; schedule(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden && S.exporting) toast('keep this tab visible while exporting, or the recording stalls', 8000); });
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); toast('the GPU reset. Reload the page to continue', 10000); });

buildLooks();
buildPanel();
syncPanel();
syncTransport();
syncEd();
commit();

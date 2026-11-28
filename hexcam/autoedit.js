// hexcam auto edit: cut one or more clips to a song.
//   analyseSong   decode the song, find onsets, tempo, the beat grid, bars, energy and the drop
//   analyseClip   sample a clip quickly to measure how much moves in each moment
//   planEdit      choose cut points on the beat (faster when the song is louder), pick a fitting
//                 moment from the clips for each cut, and place hits and text at musical moments
//   EditPlayer    plays the plan in sync with the song: two video elements per clip, so the next
//                 shot is already cued when the cut lands
// Everything runs locally; nothing is uploaded.

// ── small radix-2 FFT (in place, real input in re, im zeroed)
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

const pause = () => new Promise((r) => setTimeout(r, 0));
const pct = (arr, q) => { const s = Float32Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))] || 0; };

export async function analyseSong(file, onProgress = () => {}) {
  const raw = await file.arrayBuffer();
  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const audio = await new AC(1, 2, 44100).decodeAudioData(raw);
  onProgress(0.15);
  // mono, decimated to ~11 kHz: plenty for rhythm
  const ch = [...Array(audio.numberOfChannels).keys()].map((c) => audio.getChannelData(c));
  const dec = Math.max(1, Math.round(audio.sampleRate / 11025));
  const sr = audio.sampleRate / dec;
  const n = Math.floor(audio.length / dec);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < dec; k++) for (const c of ch) s += c[i * dec + k] || 0;
    x[i] = s / (dec * ch.length);
  }
  // spectral flux onset envelope, with the low band (kicks) tracked separately
  const N = 1024, hop = 256, frames = Math.max(1, Math.floor((n - N) / hop));
  const win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const re = new Float32Array(N), im = new Float32Array(N);
  let prev = new Float32Array(N / 2), prevLow = 0;
  const flux = new Float32Array(frames), low = new Float32Array(frames), rms = new Float32Array(frames);
  const lowBin = Math.max(2, Math.round((160 / sr) * N));
  for (let f = 0; f < frames; f++) {
    let e = 0;
    for (let i = 0; i < N; i++) { const v = x[f * hop + i]; re[i] = v * win[i]; im[i] = 0; e += v * v; }
    rms[f] = Math.sqrt(e / N);
    fft(re, im);
    let fl = 0, lo = 0;
    const cur = new Float32Array(N / 2);
    for (let b = 1; b < N / 2; b++) {
      const m = Math.log1p(Math.hypot(re[b], im[b]) * 10);
      cur[b] = m;
      const d = m - prev[b];
      if (d > 0) fl += d;
      if (b <= lowBin) lo += m;
    }
    flux[f] = fl; low[f] = Math.max(0, lo - prevLow); prevLow = lo; prev = cur;
    if (f % 400 === 0) { onProgress(0.15 + 0.6 * (f / frames)); await pause(); }
  }
  const fps = sr / hop;
  // remove the local mean so only sudden rises count
  const env = new Float32Array(frames), m = Math.round(fps * 0.5);
  let acc = 0;
  for (let f = 0; f < frames; f++) {
    acc += flux[f] + low[f] * 0.6;
    if (f >= m) acc -= flux[f - m] + low[f - m] * 0.6;
    env[f] = Math.max(0, flux[f] + low[f] * 0.6 - acc / Math.min(f + 1, m));
  }
  const envMax = pct(env, 0.99) || 1;
  for (let f = 0; f < frames; f++) env[f] = Math.min(1, env[f] / envMax);

  // tempo: autocorrelation over 70-180 bpm, gently preferring ~120
  const minLag = Math.round((fps * 60) / 180), maxLag = Math.round((fps * 60) / 70);
  let best = minLag, bestScore = -1;
  const scores = [];
  for (let L = minLag; L <= maxLag; L++) {
    let s = 0;
    for (let f = L; f < frames; f++) s += env[f] * env[f - L];
    const bpm = (fps * 60) / L;
    s *= Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    scores[L] = s;
    if (s > bestScore) { bestScore = s; best = L; }
  }
  const a = scores[best - 1] ?? bestScore, c = scores[best + 1] ?? bestScore;
  const den = a - 2 * bestScore + c;
  const lag = best + (den ? (0.5 * (a - c)) / den : 0);
  let bpm = (fps * 60) / lag;
  while (bpm < 85) bpm *= 2;
  while (bpm > 175) bpm /= 2;
  const period = (fps * 60) / bpm;
  onProgress(0.82);

  // beat phase, then a grid that follows small drifts
  let phase = 0, phaseScore = -1;
  for (let p = 0; p < period; p++) {
    let s = 0;
    for (let t = p; t < frames; t += period) s += env[Math.round(t)] || 0;
    if (s > phaseScore) { phaseScore = s; phase = p; }
  }
  const beats = [];
  let t = phase;
  const look = Math.max(1, Math.round(period * 0.08));
  while (t < frames) {
    let bi = Math.round(t), bv = -1;
    for (let k = -look; k <= look; k++) { const v = env[Math.round(t) + k]; if (v > bv) { bv = v; bi = Math.round(t) + k; } }
    const snapped = bv > 0.25 ? 0.65 * bi + 0.35 * t : t;
    beats.push(snapped / fps);
    t = snapped + period;
  }
  // downbeat: which of the four beat positions carries the most kick
  let off = 0, offScore = -1;
  for (let o = 0; o < 4; o++) {
    let s = 0;
    for (let i = o; i < beats.length; i += 4) s += low[Math.round(beats[i] * fps)] || 0;
    if (s > offScore) { offScore = s; off = o; }
  }
  // loudness per beat, normalised to 0..1 across the song
  const beatE = beats.map((b, i) => {
    const f0 = Math.round(b * fps), f1 = Math.round((beats[i + 1] ?? b + period / fps) * fps);
    let s = 0, k = 0;
    for (let f = f0; f < Math.min(frames, f1); f++) { s += rms[f]; k++; }
    return k ? s / k : 0;
  });
  const lo = pct(beatE, 0.1), hi = pct(beatE, 0.95) || 1;
  const energy = beatE.map((e) => Math.max(0, Math.min(1, (e - lo) / (hi - lo || 1))));
  // bars and the drop: the biggest rise in loudness from one four-bar block to the next
  const bars = [];
  for (let i = off; i < beats.length; i += 4) bars.push(i);
  const barE = bars.map((bi) => (energy[bi] + (energy[bi + 1] ?? 0) + (energy[bi + 2] ?? 0) + (energy[bi + 3] ?? 0)) / 4);
  let drop = bars[0] ?? 0, dropScore = -1;
  for (let k = 4; k < bars.length - 2; k++) {
    const after = (barE[k] + barE[k + 1] + (barE[k + 2] ?? barE[k + 1])) / 3;
    const before = (barE[k - 1] + barE[k - 2] + barE[k - 3] + barE[k - 4]) / 4;
    const s = after - before + after * 0.25;
    if (s > dropScore) { dropScore = s; drop = bars[k]; }
  }
  const sections = [];
  for (let k = 1; k < bars.length; k++) if (Math.abs(barE[k] - barE[k - 1]) > 0.22 || k % 8 === 0) sections.push(bars[k]);
  onProgress(1);
  return {
    name: file.name.replace(/\.[^.]+$/, ''), duration: audio.duration, bpm: Math.round(bpm * 10) / 10,
    beats, downbeat: off, bars, energy, drop, sections, env, envRate: fps,
  };
}

// samples a clip quickly: plays it muted at up to 16x and measures frame-to-frame change (motion)
// and brightness. Falls back to seeking when the browser won't play it.
export async function analyseClip(video, onProgress = () => {}) {
  const d = video.duration || 0;
  const step = Math.max(0.25, d / 140);
  const bins = Math.max(1, Math.ceil(d / step));
  const motion = new Float32Array(bins), light = new Float32Array(bins), hits = new Uint16Array(bins);
  const c = document.createElement('canvas'); c.width = 32; c.height = 18;
  const x = c.getContext('2d', { willReadFrequently: true });
  let prev = null;
  const sample = () => {
    x.drawImage(video, 0, 0, 32, 18);
    const px = x.getImageData(0, 0, 32, 18).data;
    const cur = new Float32Array(px.length / 4);
    let diff = 0, lum = 0;
    for (let i = 0; i < cur.length; i++) {
      const l = px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11;
      cur[i] = l; lum += l;
      if (prev) diff += Math.abs(l - prev[i]);
    }
    const b = Math.min(bins - 1, Math.floor(video.currentTime / step));
    if (prev) { motion[b] += diff / cur.length / 255; hits[b]++; }
    light[b] = lum / cur.length / 255;
    prev = cur;
    onProgress(Math.min(1, video.currentTime / d));
  };
  let played = false;
  try {
    video.muted = true; video.currentTime = 0;
    video.playbackRate = Math.max(2, Math.min(16, d / 3));
    await video.play();
    played = true;
    await new Promise((resolve) => {
      const stopAt = performance.now() + Math.max(4000, (d / video.playbackRate) * 1000 * 2.5);
      const tick = () => {
        if (video.ended || video.currentTime >= d - 0.05 || performance.now() > stopAt) return resolve();
        if (video.readyState >= 2) sample();
        if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(tick); else requestAnimationFrame(tick);
      };
      tick();
      video.addEventListener('ended', resolve, { once: true });
    });
    video.pause();
  } catch { played = false; }
  // fill gaps (frames the fast playback skipped), or seek for every step if playback wasn't allowed
  const seek = (t) => new Promise((r) => { const done = () => { video.removeEventListener('seeked', done); r(); }; video.addEventListener('seeked', done); video.currentTime = t; setTimeout(done, 400); });
  if (!played || !hits.some(Boolean)) {
    // playback blocked: seek instead, at most 40 samples so it stays quick
    prev = null;
    const n = Math.min(40, bins), every = bins / n;
    for (let k = 0; k < n; k++) { await seek(Math.floor(k * every) * step); sample(); }
  }
  // moments the fast playback skipped are interpolated from their neighbours
  const out = Array.from(motion, (m, b) => (hits[b] ? m / hits[b] : NaN));
  const known = out.map((v, b) => (Number.isNaN(v) ? -1 : b)).filter((b) => b >= 0);
  if (!known.length) out.fill(0.5);
  else for (let b = 0; b < out.length; b++) {
    if (!Number.isNaN(out[b])) continue;
    const r = known.find((k) => k > b), l = [...known].reverse().find((k) => k < b);
    out[b] = l === undefined ? out[r] : r === undefined ? out[l] : out[l] + (out[r] - out[l]) * ((b - l) / (r - l));
  }
  const top = pct(out, 0.95) || 1;
  return { duration: d, step, motion: out.map((v) => Math.min(1, v / top)), light: Array.from(light) };
}

// seeded RNG so "reshuffle" gives a new cut and the same seed gives the same edit
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// opts: { pace: calm|balanced|hype, length: seconds or 0 for full, start: drop|intro, lines: [], text: bool, hits: bool, seed }
export function planEdit(song, clips, opts) {
  const R = rng(opts.seed || 7);
  const { beats, energy, bars, drop } = song;
  const beatLen = 60 / song.bpm;
  // range: from a downbeat, a couple of bars before the drop (or the first bar), for the chosen length
  const barIdx = (bi) => Math.max(0, bars.findIndex((b) => b >= bi));
  let b0 = bars[0] ?? 0;
  if (opts.start === 'drop') {
    const k = barIdx(drop) - (opts.length && opts.length <= 15 ? 2 : 4);
    b0 = bars[Math.max(0, k)] ?? b0;
  }
  const start = beats[b0] ?? 0;
  let end = opts.length ? start + opts.length : song.duration;
  end = Math.min(end, song.duration - 0.05);
  // snap the end to the last downbeat inside the range, so the edit finishes on the bar
  const lastBar = bars.filter((bi) => beats[bi] <= end && beats[bi] > start + 4 * beatLen).pop();
  if (lastBar !== undefined && opts.length) end = beats[lastBar];

  // cut lengths in beats by loudness: louder sections cut faster
  const pace = { calm: [8, 4], balanced: [4, 2], hype: [2, 1] }[opts.pace] || [4, 2];
  const cuts = [];
  let i = b0;
  while (i < beats.length && beats[i] < end - 0.05) {
    const e = energy[i] ?? 0.5;
    let len = e > 0.55 ? pace[1] : pace[0];
    const toDrop = drop - i;
    if (toDrop > 0 && toDrop <= 4) len = Math.min(len, Math.max(1, toDrop >= 2 ? 2 : 1));   // build into the drop
    if (i < drop && i + len > drop) len = drop - i;                                            // land a cut exactly on it
    const j = Math.min(beats.length - 1, i + len);
    const t1 = Math.min(end, beats[j] ?? end);
    if (t1 - beats[i] < 0.12) break;
    cuts.push({ t0: beats[i] - start, t1: t1 - start, beat: i, energy: e, drop: i === drop });
    i = j;
  }

  // pick a moment for each cut: motion that matches the music, avoiding repeats, drifting forward through the clips
  const used = clips.map(() => []);
  let lastClip = -1;
  for (const [n, cut] of cuts.entries()) {
    const d = cut.t1 - cut.t0;
    const target = 0.25 + 0.7 * cut.energy;
    const progress = n / Math.max(1, cuts.length - 1);
    let best = null;
    for (const [ci, cl] of clips.entries()) {
      if (cl.duration < 0.3) continue;
      const span = Math.max(0.01, cl.duration - Math.min(d, cl.duration));
      for (let k = 0; k < 24; k++) {
        const s = Math.min(span, R() * span);
        const a = Math.floor(s / cl.step), b = Math.max(a + 1, Math.ceil((s + d) / cl.step));
        let mv = 0;
        for (let q = a; q < Math.min(b, cl.motion.length); q++) mv += cl.motion[q];
        mv /= Math.max(1, Math.min(b, cl.motion.length) - a);
        let score = 1 - Math.abs(mv - target);
        score -= 0.35 * Math.abs(s / Math.max(0.01, cl.duration) - progress);
        for (const [u0, u1] of used[ci]) if (s < u1 + 0.4 && s + d > u0 - 0.4) score -= 0.8;
        if (clips.length > 1 && ci === lastClip) score -= 0.25;
        score += R() * 0.1;
        if (!best || score > best.score) best = { score, ci, s };
      }
    }
    if (!best) best = { ci: 0, s: 0 };
    cut.clip = best.ci; cut.src = best.s;
    used[best.ci].push([best.s, best.s + d]);
    lastClip = best.ci;
  }

  // hits: a flash on the drop and on section changes, a small zoom punch on loud downbeats
  const hits = [];
  if (opts.hits) {
    const downs = new Set(bars);
    for (const cut of cuts) {
      if (cut.drop) hits.push({ t: cut.t0, kind: 'flash', amt: 1 });
      else if (song.sections.includes(cut.beat)) hits.push({ t: cut.t0, kind: 'flash', amt: 0.45 });
      else if (downs.has(cut.beat) && cut.energy > 0.6) hits.push({ t: cut.t0, kind: 'punch', amt: 1 });
    }
  }

  // text: a quiet caption at the open, the main line on the drop, the rest on later section changes
  const texts = [];
  if (opts.text) {
    const lines = (opts.lines || []).map((l) => String(l).trim()).filter(Boolean);
    if (!lines.length) lines.push(song.name.toLowerCase().replace(/[_]+/g, ' ').replace(/\s+/g, ' ').slice(0, 40));
    const bar = beatLen * 4;
    const total = end - start;
    const dropT = (beats[drop] ?? start) - start;
    const slots = [];
    if (lines.length > 1 || dropT <= 0.5 || dropT > total - bar) slots.push({ t: 0.05, style: 'caption', dur: Math.min(bar * 2, total * 0.3) });
    if (dropT > 0.5 && dropT < total - bar) slots.push({ t: dropT, style: 'title', dur: Math.min(bar * 1.5, 4) });
    for (const sb of song.sections) {
      const st = beats[sb] - start;
      if (st > (slots.at(-1)?.t ?? 0) + bar * 2 && st < total - bar) slots.push({ t: st, style: 'caption', dur: Math.min(bar * 2, 5) });
    }
    if (!slots.length) slots.push({ t: Math.min(total * 0.3, bar), style: 'title', dur: Math.min(bar * 1.5, 4) });
    // the main (first) line goes on the strongest slot
    const order = slots.slice().sort((a, b) => (a.style === 'title' ? -1 : 0) - (b.style === 'title' ? -1 : 0) || a.t - b.t);
    lines.slice(0, order.length).forEach((text, k) => { const s = order[k]; texts.push({ t0: s.t, t1: Math.min(total, s.t + s.dur), text, style: s.style }); });
    texts.sort((a, b) => a.t0 - b.t0);
  }
  return { start, end, duration: end - start, cuts, hits, texts, bpm: song.bpm, seed: opts.seed };
}

// how strong the hits are at time t (decaying envelopes)
export function hitsAt(plan, t) {
  let flash = 0, punch = 0;
  for (const h of plan.hits) {
    const dt = t - h.t;
    if (dt < 0 || dt > 0.6) continue;
    if (h.kind === 'flash') flash = Math.max(flash, h.amt * Math.exp(-dt * 11));
    else punch = Math.max(punch, h.amt * Math.exp(-dt * 7));
  }
  return { flash, punch };
}

export const FORMATS = { source: null, '9:16': 9 / 16, '4:5': 4 / 5, '1:1': 1, '16:9': 16 / 9 };

export class EditPlayer {
  // clips: [{ url, width, height }]
  constructor(clips, plan, aspect) {
    this.plan = plan;
    this.cur = -1;
    this.clips = clips.map((c) => ({ ...c, els: [0, 1].map(() => this.makeVideo(c.url)) }));
    const a = aspect || clips[0].width / clips[0].height;
    const long = 1920;
    this.canvas = document.createElement('canvas');
    if (a >= 1) { this.canvas.width = long; this.canvas.height = Math.round(long / a / 2) * 2; }
    else { this.canvas.height = long; this.canvas.width = Math.round(long * a / 2) * 2; }
    this.ctx = this.canvas.getContext('2d');
    this.ctx.fillStyle = '#000'; this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.cue(0);
  }
  makeVideo(url) {
    const v = document.createElement('video');
    v.src = url; v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
    return v;
  }
  el(i) { const c = this.plan.cuts[i]; return c ? this.clips[c.clip].els[i % 2] : null; }
  cue(i) {
    const c = this.plan.cuts[i], v = this.el(i);
    if (!c || !v) return;
    v.pause();
    if (Math.abs(v.currentTime - c.src) > 0.04) v.currentTime = c.src;
  }
  indexAt(t) {
    const cuts = this.plan.cuts;
    let lo = 0, hi = cuts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cuts[mid].t0 <= t) lo = mid; else hi = mid - 1; }
    return lo;
  }
  // playing: true while the song plays; t: seconds into the edit
  frame(t, playing) {
    const i = this.indexAt(t), cut = this.plan.cuts[i];
    if (!cut) return;
    const v = this.el(i);
    if (i !== this.cur) {
      const prevEl = this.cur >= 0 ? this.el(this.cur) : null;
      if (prevEl && prevEl !== v) prevEl.pause();
      this.cur = i;
      const want = cut.src + (t - cut.t0);
      if (Math.abs(v.currentTime - want) > 0.08) v.currentTime = want;
      this.cue(i + 1);
    }
    const want = cut.src + (t - cut.t0);
    if (playing) {
      if (v.paused) v.play().catch(() => {});
      if (Math.abs(v.currentTime - want) > 0.2 && !v.seeking) v.currentTime = want;
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - want) > 0.05 && !v.seeking) v.currentTime = want;
    }
    if (v.readyState < 2) return;
    const { punch } = hitsAt(this.plan, t);
    this.draw(v, 1 + punch * 0.045);
  }
  draw(v, zoom) {
    const W = this.canvas.width, H = this.canvas.height, vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh) return;
    const s = Math.max(W / vw, H / vh) * zoom;
    const dw = vw * s, dh = vh * s;
    this.ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }
  stop() { for (const c of this.clips) for (const v of c.els) v.pause(); }
  destroy() { this.stop(); for (const c of this.clips) for (const v of c.els) { v.removeAttribute('src'); v.load(); } }
}

// text burned into the picture at sensor resolution: typed on, held, faded
export function drawEditText(ctx, plan, t, W, H) {
  for (const tx of plan.texts) {
    if (t < tx.t0 || t > tx.t1) continue;
    const age = t - tx.t0, left = tx.t1 - t;
    const shown = tx.text.slice(0, Math.max(1, Math.ceil(Math.min(1, age / Math.min(0.5, 0.05 * tx.text.length + 0.15)) * tx.text.length)));
    const alpha = Math.min(1, left / 0.25);
    const unit = Math.min(W, H);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = unit * 0.02;
    if (tx.style === 'title') {
      let px = unit * 0.11;
      ctx.font = `600 ${px}px "Inter Tight", "Helvetica Neue", Arial, sans-serif`;
      while (ctx.measureText(tx.text).width > W * 0.84 && px > 10) { px *= 0.92; ctx.font = `600 ${px}px "Inter Tight", "Helvetica Neue", Arial, sans-serif`; }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${-px * 0.03}px`;
      ctx.fillText(shown, W / 2, H / 2);
    } else {
      const px = Math.max(9, unit * 0.034);
      ctx.font = `500 ${px}px "JetBrains Mono", ui-monospace, Menlo, monospace`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      const x = unit * 0.07, y = H - unit * 0.08;
      ctx.fillText(shown, x, y);
      ctx.globalAlpha = alpha * 0.8;
      ctx.fillRect(x, y + px * 0.45, Math.min(ctx.measureText(shown).width, W * 0.8), Math.max(1, px * 0.07));
    }
    ctx.restore();
  }
}

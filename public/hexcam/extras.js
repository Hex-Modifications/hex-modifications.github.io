// Date stamps (drawn at sensor resolution, so they get pixelated and compressed like real burned-in stamps)
// and the built-in sample scene used for "try a sample".

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// seven-segment glyphs: segments a b c d e f g
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '' };

function seven(ctx, str, x, y, h) {
  const w = h * 0.55, t = h * 0.13, gap = h * 0.22;
  ctx.save();
  ctx.translate(x, y);
  ctx.transform(1, 0, -0.12, 1, 0, 0);
  let cx = 0;
  const seg = (sx, sy, horiz, len) => {
    ctx.beginPath();
    if (horiz) {
      ctx.moveTo(sx, sy); ctx.lineTo(sx + t / 2, sy - t / 2); ctx.lineTo(sx + len - t / 2, sy - t / 2);
      ctx.lineTo(sx + len, sy); ctx.lineTo(sx + len - t / 2, sy + t / 2); ctx.lineTo(sx + t / 2, sy + t / 2);
    } else {
      ctx.moveTo(sx, sy); ctx.lineTo(sx + t / 2, sy + t / 2); ctx.lineTo(sx + t / 2, sy + len - t / 2);
      ctx.lineTo(sx, sy + len); ctx.lineTo(sx - t / 2, sy + len - t / 2); ctx.lineTo(sx - t / 2, sy + t / 2);
    }
    ctx.closePath(); ctx.fill();
  };
  for (const ch of str) {
    if (ch === "'") { ctx.fillRect(cx + t * 0.2, 0, t * 0.9, h * 0.28); cx += t * 2.2; continue; }
    if (ch === ':' || ch === '.') {
      if (ch === ':') ctx.fillRect(cx, h * 0.25, t, t);
      ctx.fillRect(cx, h * 0.68, t, t); cx += t * 2.2; continue;
    }
    const on = SEG[ch] ?? '';
    const half = h / 2;
    if (on.includes('a')) seg(cx + t * 0.3, 0, true, w - t * 0.6);
    if (on.includes('b')) seg(cx + w, t * 0.3, false, half - t * 0.6);
    if (on.includes('c')) seg(cx + w, half + t * 0.3, false, half - t * 0.6);
    if (on.includes('d')) seg(cx + t * 0.3, h, true, w - t * 0.6);
    if (on.includes('e')) seg(cx, half + t * 0.3, false, half - t * 0.6);
    if (on.includes('f')) seg(cx, t * 0.3, false, half - t * 0.6);
    if (on.includes('g')) seg(cx + t * 0.3, half, true, w - t * 0.6);
    cx += w + gap;
  }
  ctx.restore();
  return cx;
}
const sevenWidth = (str, h) => [...str].reduce((a, ch) => a + ("':.".includes(ch) ? h * 0.13 * 2.2 : h * 0.55 + h * 0.22), 0);

// P: settings; W,H: sensor size; elapsed: seconds into a video (the clock ticks for camcorder/cctv)
export function drawStamp(canvas, P, W, H, elapsed = 0) {
  if (P.stamp === 'off') return null;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const [yy, mm, dd] = (P.stampDate || '2006-11-09').split('-').map(Number);
  const [hh, mi] = (P.stampTime || '23:42').split(':').map(Number);
  const d = new Date(Date.UTC(yy || 2006, (mm || 11) - 1, dd || 9, hh || 0, mi || 0, 0) + Math.floor(elapsed) * 1000);
  const p2 = (n) => String(n).padStart(2, '0');
  const Y = d.getUTCFullYear(), M = d.getUTCMonth(), D = d.getUTCDate(), h = d.getUTCHours(), m = d.getUTCMinutes(), s = d.getUTCSeconds();
  const unit = Math.min(W, H);
  const mono = (px) => `700 ${px}px ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace`;

  if (P.stamp === 'digicam' || (P.stamp === 'custom' && /^[\d '\-:.]+$/.test(P.stampText || ''))) {
    const str = P.stamp === 'custom' ? P.stampText : `'${String(Y).slice(2)} ${p2(M + 1)} ${p2(D)}`;
    const sh = Math.max(7, Math.round(unit * 0.045));
    const x = W - sevenWidth(str, sh) - unit * 0.05, y = H - sh - unit * 0.05;
    ctx.fillStyle = '#ff8a1e';
    ctx.shadowColor = 'rgba(255,110,20,.9)'; ctx.shadowBlur = sh * 0.6;
    seven(ctx, str, x, y, sh);
    ctx.shadowBlur = 0;
    seven(ctx, str, x, y, sh);
  } else if (P.stamp === 'custom') {
    const px = Math.max(8, Math.round(unit * 0.05));
    ctx.font = mono(px); ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#ff8a1e'; ctx.shadowColor = 'rgba(255,110,20,.9)'; ctx.shadowBlur = px * 0.5;
    ctx.fillText(P.stampText || '', W - unit * 0.05, H - unit * 0.05);
  } else if (P.stamp === 'camcorder') {
    const px = Math.max(8, Math.round(unit * 0.055));
    ctx.font = mono(px); ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.95)'; ctx.shadowOffsetX = px * 0.08; ctx.shadowOffsetY = px * 0.08; ctx.shadowBlur = 0;
    const x = unit * 0.07;
    ctx.fillText(`${h < 12 ? 'AM' : 'PM'} ${((h + 11) % 12) + 1}:${p2(m)}`, x, H - unit * 0.07 - px * 1.15);
    ctx.fillText(`${MONTHS[M]}. ${D} ${Y}`, x, H - unit * 0.07);
  } else if (P.stamp === 'cctv') {
    const px = Math.max(7, Math.round(unit * 0.042));
    ctx.font = mono(px); ctx.textBaseline = 'top';
    ctx.fillStyle = '#f2f2f2'; ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
    ctx.textAlign = 'left'; ctx.fillText('CAM 01', unit * 0.04, unit * 0.04);
    ctx.textAlign = 'right'; ctx.fillText(`${Y}-${p2(M + 1)}-${p2(D)} ${p2(h)}:${p2(m)}:${p2(s)}`, W - unit * 0.04, unit * 0.04);
    if (Math.floor(elapsed * 2) % 2 === 0) { ctx.fillStyle = '#ff2a2a'; ctx.textAlign = 'left'; ctx.fillText('● REC', unit * 0.04, unit * 0.04 + px * 1.3); }
  }
  return canvas;
}

// ── sample scene: a Leonida-style sunset strip with bright lights for bloom to bite on. t animates it.
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function drawSample(canvas, t = 0) {
  const W = 1280, H = 800;
  if (canvas.width !== W) { canvas.width = W; canvas.height = H; }
  const c = canvas.getContext('2d');
  const sky = c.createLinearGradient(0, 0, 0, H * 0.62);
  sky.addColorStop(0, '#2b2457'); sky.addColorStop(0.45, '#7e3a63'); sky.addColorStop(0.78, '#e89898'); sky.addColorStop(1, '#ffd2a1');
  c.fillStyle = sky; c.fillRect(0, 0, W, H);
  // sun
  const sx = W * 0.62, sy = H * 0.5 + Math.sin(t * 0.15) * 4;
  const glow = c.createRadialGradient(sx, sy, 10, sx, sy, 260);
  glow.addColorStop(0, 'rgba(255,240,210,.95)'); glow.addColorStop(0.25, 'rgba(255,190,150,.45)'); glow.addColorStop(1, 'rgba(255,150,150,0)');
  c.fillStyle = glow; c.fillRect(0, 0, W, H);
  c.fillStyle = '#fff6e6'; c.beginPath(); c.arc(sx, sy, 46, 0, 7); c.fill();
  // sea
  const sea = c.createLinearGradient(0, H * 0.62, 0, H);
  sea.addColorStop(0, '#c97a8c'); sea.addColorStop(1, '#2b2457');
  c.fillStyle = sea; c.fillRect(0, H * 0.62, W, H * 0.38);
  for (let i = 0; i < 26; i++) {
    const y = H * 0.63 + i * i * 0.5, w = 70 - i * 2 + Math.sin(t * 2 + i) * 14;
    c.fillStyle = `rgba(255,236,210,${0.75 - i * 0.025})`;
    c.fillRect(sx - w / 2 + Math.sin(t * 1.3 + i * 0.8) * 8, y, w, 2 + i * 0.12);
  }
  // skyline with lit windows
  const r = rng(42);
  let x = -10;
  while (x < W * 0.48) {
    const bw = 40 + r() * 70, bh = 90 + r() * 260;
    c.fillStyle = '#1b1530'; c.fillRect(x, H * 0.62 - bh, bw, bh);
    for (let wy = H * 0.62 - bh + 10; wy < H * 0.62 - 8; wy += 14) for (let wx = x + 6; wx < x + bw - 8; wx += 11) {
      if (r() < 0.32) { c.fillStyle = r() < 0.8 ? '#ffd27a' : '#9fe7ff'; c.fillRect(wx, wy, 5, 7); }
    }
    x += bw + 4;
  }
  // palms
  const palm = (px, ph, lean) => {
    c.strokeStyle = '#140f22'; c.lineWidth = 9; c.lineCap = 'round';
    c.beginPath(); c.moveTo(px, H * 0.64); c.quadraticCurveTo(px + lean * 0.5, H * 0.64 - ph * 0.5, px + lean, H * 0.64 - ph); c.stroke();
    c.lineWidth = 6;
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI + (k / 6) * Math.PI + Math.sin(t * 1.5 + k) * 0.05;
      const tx = px + lean, ty = H * 0.64 - ph;
      c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(tx + Math.cos(a) * 60, ty + Math.sin(a) * 40 - 20, tx + Math.cos(a) * 110, ty + Math.sin(a) * 30 + 40); c.stroke();
    }
  };
  palm(W * 0.8, 300, 40); palm(W * 0.9, 240, -30); palm(W * 0.52, 200, 25);
  // promenade + streetlights
  c.fillStyle = '#120d1f'; c.fillRect(0, H * 0.86, W, H * 0.14);
  for (let i = 0; i < 6; i++) {
    const lx = 80 + i * 230;
    c.fillStyle = '#120d1f'; c.fillRect(lx - 3, H * 0.66, 6, H * 0.2);
    const g = c.createRadialGradient(lx, H * 0.66, 2, lx, H * 0.66, 30);
    g.addColorStop(0, '#fffaf0'); g.addColorStop(0.3, 'rgba(255,220,170,.8)'); g.addColorStop(1, 'rgba(255,200,150,0)');
    c.fillStyle = g; c.beginPath(); c.arc(lx, H * 0.66, 30, 0, 7); c.fill();
  }
  // a car cruising past, headlights and tail lights
  const cx = ((t * 160) % (W + 400)) - 200, cy = H * 0.9;
  c.fillStyle = '#e89898'; c.fillRect(cx, cy - 26, 150, 26); c.fillRect(cx + 30, cy - 46, 80, 22);
  c.fillStyle = '#9fd0ff'; c.fillRect(cx + 38, cy - 42, 30, 16); c.fillRect(cx + 72, cy - 42, 32, 16);
  c.fillStyle = '#0b0814'; c.beginPath(); c.arc(cx + 32, cy, 13, 0, 7); c.arc(cx + 118, cy, 13, 0, 7); c.fill();
  c.fillStyle = '#ffffff'; c.beginPath(); c.arc(cx + 150, cy - 16, 6, 0, 7); c.fill();
  c.fillStyle = '#ff2030'; c.fillRect(cx - 2, cy - 22, 5, 8);
  // fine detail so compression and resolution changes are obvious
  c.fillStyle = 'rgba(255,255,255,.9)'; c.font = '600 30px ui-monospace, Menlo, monospace';
  c.fillText('HEXCAM · SAMPLE 01', 40, H - 34);
  return canvas;
}

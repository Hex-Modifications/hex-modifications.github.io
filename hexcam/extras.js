// Date stamps, drawn at sensor resolution so they get pixelated and compressed like real burned-in stamps.

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

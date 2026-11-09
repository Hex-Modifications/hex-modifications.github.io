// Every control in the panel, and the looks built from them.

const today = () => new Date().toISOString().slice(0, 10);

export const DEFAULTS = {
  // sensor
  res: 1080, alias: false, pixel: false, out: '1080', fps: 0,
  // lens
  distort: 0, ca: 0, soft: 0, shake: 0,
  // colour
  exposure: 0, contrast: 1, sat: 1, temp: 0, tint: 0, blacks: 0, fade: 0, bleach: 0,
  split: 0, shadowTint: '#2f6bd6', hiTint: '#f2a65a',
  // light
  flash: 0, bloom: 0, bloomThr: 0.7, bloomRadius: 0.5, bloomTint: '#ffffff', leak: 0, leakCol: '#ff7a3c',
  // processing
  noise: 0, sharpen: 0,
  // compression
  jpeg: false, quality: 70, chroma: '420', gens: 1, bitrate: 8000,
  // tape & motion
  vhs: 0, bleed: 0, interlace: 0, ghost: 0, flicker: 0, dust: 0,
  // finish
  grain: 0, grainSize: 1.5, vignette: 0, vigTint: '#000000', bits: 8, bayer: false,
  // date stamp
  stamp: 'off', stampDate: today(), stampTime: '23:42', stampText: '',
};

const pct = (v) => `${Math.round(v * 100)}`;
const signed = (v, d = 2) => `${v > 0 ? '+' : ''}${(+v).toFixed(d)}`;

export const GROUPS = [
  { id: 'sensor', label: 'sensor', open: true, items: [
    { k: 'res', label: 'resolution', type: 'range', min: 96, max: 1920, step: 8, fmt: (v) => `${v}px` },
    { k: 'out', label: 'output size', type: 'select', options: [['1080', '1080p'], ['720', '720p'], ['1440', '1440p'], ['2160', '4K'], ['sensor', 'same as sensor'], ['source', 'same as source']] },
    { k: 'pixel', label: 'pixelate upscale', type: 'toggle', hint: 'nearest-neighbour: every sensor pixel becomes a hard square' },
    { k: 'alias', label: 'jagged downscale', type: 'toggle', hint: 'skip filtering when shrinking, like cheap phone sensors' },
    { k: 'fps', label: 'frame rate', type: 'range', min: 0, max: 30, step: 1, video: true, fmt: (v) => (+v === 0 ? 'source' : `${v} fps`) },
  ] },
  { id: 'lens', label: 'lens & distortion', items: [
    { k: 'distort', label: 'barrel / pincushion', type: 'range', min: -0.6, max: 0.8, step: 0.01, fmt: (v) => signed(v) },
    { k: 'ca', label: 'chromatic aberration', type: 'range', min: 0, max: 2, step: 0.01, fmt: pct },
    { k: 'soft', label: 'lens softness', type: 'range', min: 0, max: 1, step: 0.01, fmt: pct },
    { k: 'shake', label: 'handheld shake', type: 'range', min: 0, max: 1, step: 0.01, video: true, fmt: pct },
  ] },
  { id: 'colour', label: 'colour', items: [
    { k: 'exposure', label: 'exposure', type: 'range', min: -2, max: 2, step: 0.05, fmt: (v) => `${signed(v)} ev` },
    { k: 'contrast', label: 'contrast', type: 'range', min: 0.4, max: 2, step: 0.01, fmt: (v) => (+v).toFixed(2) },
    { k: 'sat', label: 'saturation', type: 'range', min: 0, max: 2, step: 0.01, fmt: pct },
    { k: 'temp', label: 'temperature', type: 'range', min: -1, max: 1, step: 0.01, fmt: (v) => signed(v) },
    { k: 'tint', label: 'green / magenta', type: 'range', min: -1, max: 1, step: 0.01, fmt: (v) => signed(v) },
    { k: 'bleach', label: 'bleach bypass', type: 'range', min: 0, max: 1, step: 0.01, fmt: pct },
    { k: 'blacks', label: 'lifted blacks', type: 'range', min: 0, max: 0.3, step: 0.005, fmt: (v) => pct(v / 0.3) },
    { k: 'fade', label: 'faded whites', type: 'range', min: 0, max: 0.4, step: 0.005, fmt: (v) => pct(v / 0.4) },
    { k: 'split', label: 'split toning', type: 'range', min: 0, max: 1, step: 0.01, fmt: pct },
    { k: 'shadowTint', label: 'shadow colour', type: 'color' },
    { k: 'hiTint', label: 'highlight colour', type: 'color' },
  ] },
  { id: 'light', label: 'light', items: [
    { k: 'flash', label: 'on-camera flash', type: 'range', min: 0, max: 1, step: 0.01, fmt: pct },
    { k: 'bloom', label: 'bloom', type: 'range', min: 0, max: 3, step: 0.01, fmt: pct },
    { k: 'bloomThr', label: 'bloom threshold', type: 'range', min: 0, max: 0.95, step: 0.01, fmt: pct },
    { k: 'bloomRadius', label: 'bloom radius', type: 'range', min: 0, max: 1, step: 0.01, fmt: pct },
    { k: 'bloomTint', label: 'bloom colour', type: 'swatch', options: ['#ffffff', '#6b4dff', '#ff3df0', '#3d6bff', '#ff8a2a', '#36ff6b', '#ff3d3d'] },
    { k: 'leak', label: 'light leak', type: 'range', min: 0, max: 1, step: 0.01, fmt: pct },
    { k: 'leakCol', label: 'leak colour', type: 'color' },
  ] },
  { id: 'proc', label: 'in-camera processing', items: [
    { k: 'noise', label: 'sensor noise', type: 'range', min: 0, max: 0.6, step: 0.01, fmt: (v) => pct(v / 0.6) },
    { k: 'sharpen', label: 'oversharpening', type: 'range', min: 0, max: 2.5, step: 0.01, fmt: pct },
  ] },
  { id: 'jpeg', label: 'compression', items: [
    { k: 'jpeg', label: 'jpeg compression', type: 'toggle', hint: 'a real DCT codec: 8×8 blocks, quantised exactly like a JPEG encoder' },
    { k: 'quality', label: 'quality', type: 'range', min: 1, max: 100, step: 1, dep: 'jpeg', fmt: (v) => `${v}` },
    { k: 'chroma', label: 'chroma subsampling', type: 'select', dep: 'jpeg', options: [['444', '4:4:4 (none)'], ['422', '4:2:2'], ['420', '4:2:0 (phones)'], ['411', '4:1:1 (DV tape)']] },
    { k: 'gens', label: 're-saves', type: 'range', min: 1, max: 8, step: 1, dep: 'jpeg', fmt: (v) => `${v}×`, hint: 'generation loss: each save shifts the block grid and compresses again' },
    { k: 'bitrate', label: 'video bitrate', type: 'range', min: 150, max: 16000, step: 50, video: true, fmt: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} Mbps` : `${v} kbps`), hint: 'low bitrates let the video codec itself smear and block' },
  ] },
  { id: 'tape', label: 'tape & motion', items: [
    { k: 'vhs', label: 'tape tracking', type: 'range', min: 0, max: 1, step: 0.01, fmt: pct },
    { k: 'bleed', label: 'chroma bleed', type: 'range', min: 0, max: 1, step: 0.01, fmt: pct },
    { k: 'interlace', label: 'interlace lines', type: 'range', min: 0, max: 1, step: 0.01, fmt: pct },
    { k: 'ghost', label: 'ghosting trails', type: 'range', min: 0, max: 0.92, step: 0.01, video: true, fmt: pct },
    { k: 'flicker', label: 'exposure flicker', type: 'range', min: 0, max: 1, step: 0.01, video: true, fmt: pct },
    { k: 'dust', label: 'dust & scratches', type: 'range', min: 0, max: 1, step: 0.01, fmt: pct },
  ] },
  { id: 'finish', label: 'grain & finish', items: [
    { k: 'grain', label: 'film grain', type: 'range', min: 0, max: 1, step: 0.01, fmt: pct },
    { k: 'grainSize', label: 'grain size', type: 'range', min: 1, max: 5, step: 0.1, fmt: (v) => (+v).toFixed(1) },
    { k: 'vignette', label: 'vignette', type: 'range', min: 0, max: 1, step: 0.01, fmt: pct },
    { k: 'vigTint', label: 'vignette colour', type: 'color' },
    { k: 'bits', label: 'colour depth', type: 'range', min: 1, max: 8, step: 1, fmt: (v) => (+v === 8 ? 'full' : `${v}-bit`) },
    { k: 'bayer', label: 'ordered dither', type: 'toggle', dep: 'bits<8' },
  ] },
  { id: 'stamp', label: 'date stamp', items: [
    { k: 'stamp', label: 'style', type: 'select', options: [['off', 'off'], ['digicam', 'digicam (orange)'], ['camcorder', 'camcorder'], ['cctv', 'cctv'], ['custom', 'custom text']] },
    { k: 'stampDate', label: 'date', type: 'date', dep: 'stamp' },
    { k: 'stampTime', label: 'time', type: 'time', dep: 'stamp' },
    { k: 'stampText', label: 'text', type: 'text', dep: 'stamp=custom', max: 32 },
  ] },
];

// Original looks. Each one only lists what differs from DEFAULTS.
export const LOOKS = [
  { id: 'raw', name: 'raw', note: 'untouched', p: {} },
  { id: 'ccd06', name: 'ccd 2006', note: 'pocket digicam, violet glow', p: {
    res: 560, soft: 0.12, ca: 0.35, bloom: 0.9, bloomThr: 0.62, bloomRadius: 0.35, bloomTint: '#6b4dff', contrast: 1.06, sat: 1.12,
    temp: -0.15, blacks: 0.035, sharpen: 0.8, noise: 0.14, jpeg: true, quality: 68, chroma: '420', stamp: 'digicam' } },
  { id: 'bleach', name: 'bleach bypass', note: 'silver, crunchy, desaturated', p: {
    bleach: 0.85, contrast: 1.22, sat: 0.72, temp: -0.06, exposure: 0.1, grain: 0.32, grainSize: 1.6, vignette: 0.35, split: 0.12, shadowTint: '#3a6ea8', hiTint: '#d8d0c0' } },
  { id: 'flip07', name: 'flip phone', note: 'VGA, green cast, mush', p: {
    res: 320, pixel: false, alias: true, sat: 0.72, contrast: 0.95, temp: 0.08, tint: 0.22, fade: 0.08, blacks: 0.02, noise: 0.26, sharpen: 0.55,
    jpeg: true, quality: 42, chroma: '420', vignette: 0.55, vigTint: '#4a7a3a', fps: 15 } },
  { id: 'cam09', name: 'webcam 09', note: 'blue bloom, smeary, 15fps', p: {
    res: 360, soft: 0.25, contrast: 1.28, sat: 1.18, temp: -0.32, blacks: 0.05, bloom: 0.7, bloomThr: 0.55, bloomTint: '#3d6bff', noise: 0.3,
    jpeg: true, quality: 55, ghost: 0.35, fps: 15 } },
  { id: 'vhs', name: 'vhs tape', note: 'tracking, bleed, interlace', p: {
    res: 400, soft: 0.2, vhs: 0.65, bleed: 0.8, interlace: 0.3, sat: 1.25, contrast: 1.08, blacks: 0.06, fade: 0.05, noise: 0.18, sharpen: 0.9,
    flicker: 0.12, temp: 0.05, stamp: 'camcorder' } },
  { id: 'minidv', name: 'miniDV', note: 'DV tape, 4:1:1, crisp', p: {
    res: 720, interlace: 0.45, sharpen: 1.15, sat: 1.12, contrast: 1.1, ca: 0.2, jpeg: true, quality: 82, chroma: '411', temp: -0.05, stamp: 'camcorder' } },
  { id: 'super8', name: 'super 8', note: 'warm, weave, dust, 18fps', p: {
    res: 720, soft: 0.22, grain: 0.7, grainSize: 2.2, shake: 0.45, flicker: 0.4, dust: 0.45, vignette: 0.6, vigTint: '#2a1408', temp: 0.35,
    blacks: 0.06, fade: 0.08, sat: 0.85, contrast: 1.12, bloom: 0.5, bloomThr: 0.6, bloomRadius: 0.7, bloomTint: '#ff8a2a', fps: 18, leak: 0.25 } },
  { id: 'y2k', name: 'y2k flash', note: 'party flash, hard shadows', p: {
    res: 800, flash: 0.75, exposure: 0.15, contrast: 1.32, sat: 1.15, temp: -0.1, vignette: 0.45, bloom: 0.5, bloomThr: 0.7, sharpen: 0.5,
    jpeg: true, quality: 74, stamp: 'digicam' } },
  { id: 'iph3', name: 'early iphone', note: 'soft glow, muted, grainy', p: {
    res: 640, soft: 0.25, bloom: 0.8, bloomThr: 0.5, bloomRadius: 0.85, sat: 0.85, contrast: 0.95, exposure: -0.15, blacks: 0.02, temp: 0.08,
    noise: 0.22, grain: 0.2, jpeg: true, quality: 70 } },
  { id: 'fried', name: 'deep fried', note: 'saved too many times', p: {
    res: 300, pixel: true, sat: 2, contrast: 1.6, sharpen: 2.2, noise: 0.3, jpeg: true, quality: 6, chroma: '420', gens: 4, bitrate: 400 } },
  { id: 'mono', name: 'mono grain', note: 'push-processed b&w', p: {
    sat: 0, contrast: 1.35, bleach: 0.3, grain: 0.62, grainSize: 1.8, vignette: 0.4, blacks: 0.02 } },
  { id: 'webcore', name: 'webcore', note: '3-bit ordered dither', p: {
    res: 240, pixel: true, alias: true, bits: 3, bayer: true, sat: 1.35, contrast: 1.2 } },
  { id: 'cctv', name: 'cctv', note: 'night cam, 8fps', p: {
    res: 320, sat: 0.08, tint: 0.35, contrast: 1.4, noise: 0.5, soft: 0.15, jpeg: true, quality: 38, fps: 8, vignette: 0.5, distort: 0.35, stamp: 'cctv' } },
  { id: 'nightclub', name: 'club cam', note: 'magenta haze, trails', p: {
    res: 480, bloom: 1.4, bloomThr: 0.45, bloomRadius: 0.8, bloomTint: '#ff3df0', sat: 1.3, contrast: 1.2, blacks: 0.04, ghost: 0.5, ca: 0.8,
    noise: 0.25, jpeg: true, quality: 50 } },
];

export const lookParams = (look) => ({ ...DEFAULTS, ...(look?.p || {}) });

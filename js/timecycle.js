/* Timecycle: the site's lighting follows the visitor's local time, like GTA's day/night cycle.
   Runs in <head> so the correct phase is applied before first paint.
   dawn 05–08 · day 08–17 · dusk 17–20 · night 20–05. Preview any phase with ?phase=night */
(() => {
  'use strict';
  const PHASES = ['dawn', 'day', 'dusk', 'night'];
  const root = document.documentElement;
  const phaseFor = (h) => (h >= 5 && h < 8 ? 'dawn' : h >= 8 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'dusk' : 'night');
  let override = null;
  try {
    const q = new URLSearchParams(location.search).get('phase');
    if (PHASES.includes(q)) override = q;
  } catch { /* ignore */ }

  // intro splash (homepage only, marked data-splash): once per browser session; skipped with reduced motion,
  // data saver, a background tab, or ?nosplash. The class is set here so the page never flashes before it.
  try {
    if (root.hasAttribute('data-splash') && !document.hidden && !/[?&]nosplash\b/.test(location.search)
      && !matchMedia('(prefers-reduced-motion: reduce)').matches && !(navigator.connection && navigator.connection.saveData)
      && !sessionStorage.getItem('hex-intro')) {
      root.classList.add('splash-on');
      // fetch the intro's two small assets straight away, before the body is even parsed
      [['media/mark.webp', 'image'], ['media/mark-dots.bin', 'fetch']].forEach(([href, as]) => {
        const l = document.createElement('link'); l.rel = 'preload'; l.href = href; l.as = as;
        if (as === 'fetch') l.crossOrigin = 'anonymous';
        document.head.appendChild(l);
      });
    }
  } catch { /* storage blocked: no splash */ }

  function apply(phase) {
    if (root.dataset.phase === phase) return;
    root.dataset.phase = phase;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bg').trim() || meta.content;
    document.dispatchEvent(new CustomEvent('hex:phase', { detail: phase }));
  }

  function tick() {
    const now = new Date();
    apply(override || phaseFor(now.getHours()));
    const clock = document.getElementById('tcClock');
    const label = document.getElementById('tcPhase');
    if (clock) clock.textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    if (label) label.textContent = root.dataset.phase;
  }

  window.hexTimecycle = {
    phases: PHASES,
    current: () => root.dataset.phase,
    skip() {
      const i = PHASES.indexOf(root.dataset.phase);
      override = PHASES[(i + 1) % PHASES.length];
      tick();
      return override;
    },
    sync() { override = null; tick(); },
  };

  root.dataset.phase = '';
  tick();
  document.addEventListener('DOMContentLoaded', () => { tick(); setInterval(tick, 15000); });
})();

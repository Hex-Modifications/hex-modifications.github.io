/* Intro splash: the Hex Modifications animation plays while the site loads underneath, with a loading bar
   that reports what is actually coming up (data, the 3D hero, fonts…) mixed with a shuffled set of build
   steps, so it reads differently every visit. When the page is ready, the picture dissolves into the
   site's own colours. About 5s; held on the finished logo only while loading; never over 7.5s.
   The timecycle script decides in <head> whether it runs at all (class "splash-on"). */
(() => {
  'use strict';
  const root = document.documentElement;
  const el = document.getElementById('splash');
  const audio = document.getElementById('splashAudio');
  if (!el) return;
  if (!root.classList.contains('splash-on')) { el.remove(); audio?.remove(); return; }
  try { sessionStorage.setItem('hex-intro', '1'); } catch { /* fine */ }

  const video = el.querySelector('video');
  const bar = el.querySelector('.splash-bar b'), label = el.querySelector('.splash-step'), pct = el.querySelector('.splash-pct');
  const MAX_MS = 7500, EXIT_AT = 4.0;            // clip seconds: just after the wordmark lands
  let done = false;

  /* ── the best version this device decodes smoothly: AV1 10-bit → HEVC 10-bit → H.264 ── */
  const SOURCES = [
    { src: 'media/intro-av1.mp4', type: 'video/mp4; codecs="av01.0.08M.10"', bitrate: 2600000 },
    { src: 'media/intro-hevc.mp4', type: 'video/mp4; codecs="hvc1.2.4.L120.B0"', bitrate: 4200000 },
    { src: 'media/intro-h264.mp4', type: 'video/mp4; codecs="avc1.640032"', bitrate: 5200000 },
  ];
  async function pickSource() {
    const playable = SOURCES.filter((s) => video.canPlayType(s.type) !== '');
    if (!navigator.mediaCapabilities?.decodingInfo) return playable[0] || SOURCES[2];
    for (const s of playable) {
      try {
        const info = await navigator.mediaCapabilities.decodingInfo({ type: 'file', video: { contentType: s.type, width: 1920, height: 1080, bitrate: s.bitrate, framerate: 30 } });
        if (info.supported && info.smooth) return s;
      } catch { /* try the next one */ }
    }
    return playable.at(-1) || SOURCES[2];
  }

  /* ── readiness: real signals from the page ── */
  const once = (target, ev) => new Promise((r) => target.addEventListener(ev, r, { once: true }));
  const signals = {
    load: document.readyState === 'complete' ? Promise.resolve() : once(window, 'load'),
    data: window.hexData ? Promise.resolve() : once(document, 'hex:data'),
    hero: window.hexHeroReady ? Promise.resolve() : Promise.race([once(document, 'hex:hero-ready'), new Promise((r) => setTimeout(r, 5000))]),
    fonts: document.fonts ? document.fonts.ready : Promise.resolve(),
  };
  const pageReady = Promise.all(Object.values(signals));
  const videoDone = new Promise((r) => {
    video.addEventListener('timeupdate', () => { if (video.currentTime >= EXIT_AT) r(); });
    video.addEventListener('ended', r, { once: true }); video.addEventListener('error', r, { once: true });
  });

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
  ];
  const MILESTONES = [
    [signals.data, () => { const n = window.hexData?.releases?.length; return n ? `fetched latest releases · ${n}` : 'fetched site data'; }],
    [signals.hero, () => (root.classList.contains('no-webgl') ? 'hero · static fallback' : `3D hero · first frame · ${document.getElementById('glass')?.dataset.model || 'ready'}`)],
    [signals.load, () => 'assets decoded'],
  ];
  const steps = shuffle(POOL.slice()).slice(0, 4 + Math.floor(Math.random() * 3));
  let shown = 0, target = 0, cur = 0, stallUntil = 0;
  const say = (t) => { if (label) label.textContent = t; };
  (function nextStep() {
    if (done || shown >= steps.length) return;
    say(steps[shown++]());
    target = Math.min(86, target + 6 + Math.random() * 12);
    setTimeout(nextStep, 260 + Math.random() * 520);
  })();
  MILESTONES.forEach(([p, text]) => p.then(() => { if (!done) { say(text()); target = Math.min(92, target + 8 + Math.random() * 6); } }));
  // the bar eases toward its target and now and then stalls for a beat, like a real loader
  (function tick(now) {
    if (!el.isConnected) return;
    if (now > stallUntil && Math.random() < 0.012) stallUntil = now + 180 + Math.random() * 380;
    if (now > stallUntil || target >= 100) cur += (target - cur) * (target >= 100 ? 0.25 : 0.06);
    if (bar) bar.style.transform = `scaleX(${(cur / 100).toFixed(4)})`;
    if (pct) pct.textContent = `${Math.round(cur)}%`;
    requestAnimationFrame(tick);
  })(performance.now());

  Promise.all([pageReady, videoDone]).then(() => complete());
  setTimeout(() => complete(), MAX_MS);
  function complete() {
    if (done) return;
    target = 100; say(pick(['ready', 'all systems go', 'done · welcome in', 'ready · enjoy']));
    setTimeout(() => finish(), 280);
  }

  /* ── sound: subtle, mastered quiet (-29 LUFS) with a soft fade-in; if the browser blocks autoplay
        sound, the first click, tap or key press during the intro starts it in sync ── */
  let soundArmed = false;
  const startSound = () => {
    if (done || !audio) return;
    audio.volume = 1;
    try { audio.currentTime = Math.min(video.currentTime, 4.5); } catch { /* not seekable yet */ }
    audio.play().catch(() => {
      if (soundArmed) return;
      soundArmed = true;
      const go = () => { removeEventListener('pointerdown', go); removeEventListener('keydown', go); startSound(); };
      addEventListener('pointerdown', go); addEventListener('keydown', go);
    });
  };

  pickSource().then((s) => {
    if (done) return;
    video.src = s.src;
    video.preload = 'auto'; if (audio) audio.preload = 'auto';
    video.play().then(startSound).catch(() => finish(true));   // autoplay refused (e.g. iOS low power): straight in
  });
  // never sit on a black screen: if the picture hasn't started within 1.8s, go straight to the site
  setTimeout(() => { if (!done && (video.paused || video.currentTime === 0)) finish(true); }, 1800);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') finish(); });

  function finish(fast = false) {
    if (done) return;
    done = true;
    root.classList.add('splash-leaving');
    el.classList.add(fast ? 'out-fast' : 'out');
    document.dispatchEvent(new CustomEvent('hex:intro-leave'));
    if (audio && !audio.paused) {
      const v0 = audio.volume, s0 = performance.now(), ms = 1100;
      const step = (t) => { const k = Math.min(1, (t - s0) / ms); audio.volume = v0 * (1 - k) * (1 - k); if (k < 1) requestAnimationFrame(step); else audio.pause(); };
      requestAnimationFrame(step);
    }
    setTimeout(() => {
      el.remove(); audio?.remove();
      root.classList.remove('splash-on', 'splash-leaving');
    }, fast ? 650 : 1450);
  }
})();

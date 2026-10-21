/* Intro splash: the Hex Modifications animation plays while the site loads underneath, then light washes
   out of it into the page's own colours. Quick by design: about 4s of video, held on the finished logo only
   while the page is still loading, and never longer than 7s. The timecycle script decides in <head>
   whether it runs at all (class "splash-on"); otherwise this just removes the markup. */
(() => {
  'use strict';
  const root = document.documentElement;
  const el = document.getElementById('splash');
  const audio = document.getElementById('splashAudio');
  if (!el) return;
  if (!root.classList.contains('splash-on')) { el.remove(); audio?.remove(); return; }
  try { sessionStorage.setItem('hex-intro', '1'); } catch { /* fine */ }

  const video = el.querySelector('video');
  const MAX_MS = 7000;
  const SOUND_VOLUME = 0.85;            // the file itself is already mastered quiet (-24 LUFS)
  let done = false;

  // the page counts as ready once it has loaded, its data is in and the 3D hero has drawn a frame
  const once = (target, ev) => new Promise((r) => target.addEventListener(ev, r, { once: true }));
  const pageReady = Promise.all([
    document.readyState === 'complete' ? null : once(window, 'load'),
    window.hexData ? null : once(document, 'hex:data'),
    window.hexHeroReady ? null : Promise.race([once(document, 'hex:hero-ready'), new Promise((r) => setTimeout(r, 5000))]),
  ]);
  // "done" just after the wordmark lands (4.1s in the clip), so the exit overlaps the last frames
  const videoDone = new Promise((r) => {
    video.addEventListener('timeupdate', () => { if (video.currentTime >= 4.5) r(); });
    video.addEventListener('ended', r, { once: true }); video.addEventListener('error', r, { once: true });
  });
  Promise.all([pageReady, videoDone]).then(() => finish());
  setTimeout(() => finish(), MAX_MS);

  // sound: browsers often block audio until the visitor interacts, so if it's refused,
  // the first click, tap or key press during the intro starts it in sync with the picture
  let soundArmed = false;
  const startSound = () => {
    if (done || !audio) return;
    audio.volume = SOUND_VOLUME;
    try { audio.currentTime = Math.min(video.currentTime, 5); } catch { /* not seekable yet */ }
    audio.play().catch(() => {
      if (soundArmed) return;
      soundArmed = true;
      const go = () => { removeEventListener('pointerdown', go); removeEventListener('keydown', go); startSound(); };
      addEventListener('pointerdown', go); addEventListener('keydown', go);
    });
  };

  video.preload = 'auto'; if (audio) audio.preload = 'auto';
  video.load();
  video.playbackRate = 1.15;                       // a touch quicker than the source; the sound stays at normal speed
  video.play().then(() => {
    startSound();
  }).catch(() => finish(true));                     // autoplay refused (e.g. iOS low power mode): straight to the site
  // never sit on a black screen: if the picture hasn't started within 1.5s, skip
  setTimeout(() => { if (!done && (video.paused || video.currentTime === 0)) finish(true); }, 1500);

  el.querySelector('.splash-skip').addEventListener('click', (e) => { e.stopPropagation(); finish(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') finish(); });

  function finish(fast = false) {
    if (done) return;
    done = true;
    root.classList.add('splash-leaving');
    el.classList.add(fast ? 'out-fast' : 'out');
    document.dispatchEvent(new CustomEvent('hex:intro-leave'));
    if (audio && !audio.paused) {
      const v0 = audio.volume, t0 = performance.now(), ms = 1200;
      const step = (t) => { const k = Math.min(1, (t - t0) / ms); audio.volume = v0 * (1 - k) * (1 - k); if (k < 1) requestAnimationFrame(step); else audio.pause(); };
      requestAnimationFrame(step);
    }
    setTimeout(() => {
      el.remove(); audio?.remove();
      root.classList.remove('splash-on', 'splash-leaving');
    }, fast ? 650 : 1500);
  }
})();

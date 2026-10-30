/* GTA 6 Hub: liquid backdrop, countdown, click-to-load trailers and music, search and filter, lightbox, the map, and ads.
   Every page works without this file (links still go to YouTube, Spotify and full-size images); it only adds polish. */
(() => {
  'use strict';
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── liquid backdrop: a slow, dark sunset field drawn at low resolution and scaled up (it's very smooth) ──
  const canvas = document.querySelector('.lf-liquid');
  const gl = canvas && canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
  if (gl) {
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }'));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `precision mediump float; uniform vec2 uRes; uniform float uT;
      float blob(vec2 q, vec2 c, float r) { float d = length(q - c) / r; return d < 1. ? pow(1. - d, 1.6) : 0.; }
      void main() {
        vec2 uv = gl_FragCoord.xy / uRes.y; float a = uRes.x / uRes.y, t = uT;
        vec2 w = vec2(sin(uv.y * 2.3 + t * .17) + .6 * sin(uv.y * 4.1 + uv.x * 1.3 - t * .1), cos(uv.x * 2.1 - t * .15) + .6 * sin(uv.x * 3.7 - uv.y * 1.1 + t * .12));
        vec2 q = uv + .09 * w;
        vec3 col = vec3(.02, .016, .028);
        col = mix(col, vec3(.42, .25, .95), .2 * blob(q, vec2(a * (.84 + .06 * sin(t * .05)), .98 + .08 * cos(t * .04)), a * .55));
        col = mix(col, vec3(1., .42, .55), .14 * blob(q, vec2(a * (.1 + .06 * cos(t * .045)), .36 + .1 * sin(t * .05)), a * .45));
        col = mix(col, vec3(1., .7, .54), .07 * blob(q, vec2(a * (.55 + .12 * sin(t * .03)), .08 + .08 * cos(t * .035)), a * .4));
        col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - .5) / 255.;
        gl_FragColor = vec4(col, 1.);
      }`));
    gl.linkProgram(prog);
    if (gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const uRes = gl.getUniformLocation(prog, 'uRes'), uT = gl.getUniformLocation(prog, 'uT');
      const t0 = Math.random() * 300;
      const size = () => { canvas.width = Math.max(2, Math.ceil(innerWidth / 5)); canvas.height = Math.max(2, Math.ceil(innerHeight / 5)); gl.viewport(0, 0, canvas.width, canvas.height); };
      const draw = (now) => { gl.uniform2f(uRes, canvas.width, canvas.height); gl.uniform1f(uT, t0 + (reduced ? 0 : now / 1000)); gl.drawArrays(gl.TRIANGLES, 0, 3); };
      size(); draw(0);
      addEventListener('resize', () => { size(); draw(performance.now()); }, { passive: true });
      if (!reduced) {
        let last = 0;   // ~20fps is plenty for motion this slow
        const loop = (now) => { requestAnimationFrame(loop); if (document.hidden || now - last < 50) return; last = now; draw(now); };
        requestAnimationFrame(loop);
      }
    }
  }

  // ── soft light that follows the pointer across cards ──
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest?.('.lf-card, .lf-tile, .lf-buycard');
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`); el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });

  // ── countdown to local midnight on release day ──
  const count = document.querySelector('[data-release]');
  if (count) {
    const [y, mo, d] = count.dataset.release.split('-').map(Number);
    const target = new Date(y, mo - 1, d).getTime();
    const u = Object.fromEntries($$('[data-u]', count).map((el) => [el.dataset.u, el]));
    const pad = (n) => String(n).padStart(2, '0');
    const tick = () => {
      const left = target - Date.now();
      if (left <= 0) {
        count.classList.add('is-out');
        count.querySelector('.lf-count-label').textContent = 'Out now on PS5 & Xbox Series X|S';
        return;
      }
      const s = Math.floor(left / 1000);
      u.d.textContent = Math.floor(s / 86400); u.h.textContent = pad(Math.floor(s / 3600) % 24);
      u.m.textContent = pad(Math.floor(s / 60) % 60); u.s.textContent = pad(s % 60);
      setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    tick();
  }

  // ── trailers and music load from YouTube / Spotify only when played ──
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-yt]');
    if (a && !e.ctrlKey && !e.metaKey && !e.shiftKey && /^[\w-]{11}$/.test(a.dataset.yt)) {
      e.preventDefault();
      const f = document.createElement('iframe');
      f.src = `https://www.youtube-nocookie.com/embed/${a.dataset.yt}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
      f.title = a.dataset.title || 'GTA VI video';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      a.replaceWith(f);
      return;
    }
    const s = e.target.closest('[data-spotify]');
    if (s && /^(artist|album|track|playlist)\/[A-Za-z0-9]{22}$/.test(s.dataset.spotify)) {
      const f = document.createElement('iframe');
      f.src = `https://open.spotify.com/embed/${s.dataset.spotify}?utm_source=generator&theme=0`;
      f.title = 'Spotify player';
      f.height = s.dataset.h || 152;
      f.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
      f.loading = 'lazy';
      s.replaceWith(f);
    }
  });

  // ── search and status filter on database pages ──
  for (const bar of $$('[data-filter-for]')) {
    const grid = document.getElementById(bar.dataset.filterFor);
    const input = bar.querySelector('[data-filter-q]');
    const chips = $$('[data-filter-s]', bar);
    const empty = grid.nextElementSibling?.classList.contains('lf-empty') ? grid.nextElementSibling : null;
    let status = 'all';
    const apply = () => {
      const words = input.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      let shown = 0;
      for (const c of $$('.lf-card', grid)) {
        const ok = (status === 'all' || c.dataset.status === status) && words.every((w) => c.dataset.q.includes(w));
        c.hidden = !ok; if (ok) shown++;
      }
      const filtering = words.length || status !== 'all';
      for (const ad of $$(':scope > .lf-ad', grid)) ad.hidden = !!filtering;    // in-feed ads only between full lists
      if (empty) empty.hidden = shown > 0;
    };
    input.addEventListener('input', apply);
    chips.forEach((b) => b.addEventListener('click', () => {
      status = b.dataset.filterS;
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
      apply();
    }));
  }

  // ── lightbox ──
  let lb = null, set = [], at = 0, opener = null;
  const show = (i) => {
    at = (i + set.length) % set.length;
    const a = set[at], im = lb.querySelector('img');
    im.src = a.href; im.alt = a.querySelector('img')?.alt || '';
    lb.querySelector('.lf-lb-cap').textContent = `${im.alt} · ${at + 1} / ${set.length} · © Rockstar Games`;
  };
  const close = () => {
    if (!lb) return;
    lb.classList.remove('is-open');
    const el = lb; lb = null;
    setTimeout(() => el.remove(), 300);
    document.documentElement.style.overflow = '';
    opener?.focus();
  };
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-lb]');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    opener = a;
    set = $$(`a[data-lb="${CSS.escape(a.dataset.lb)}"]`);
    lb = document.createElement('div');
    lb.className = 'lf-lb'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Image viewer');
    lb.innerHTML = '<img alt=""><button class="lf-lb-close" aria-label="Close">×</button>' +
      (set.length > 1 ? '<button class="lf-lb-prev" aria-label="Previous image">‹</button><button class="lf-lb-next" aria-label="Next image">›</button>' : '') + '<p class="lf-lb-cap"></p>';
    document.body.appendChild(lb);
    document.documentElement.style.overflow = 'hidden';
    show(set.indexOf(a));
    requestAnimationFrame(() => lb.classList.add('is-open'));
    lb.querySelector('.lf-lb-close').focus();
    lb.addEventListener('click', (ev) => {
      if (ev.target.closest('.lf-lb-prev')) show(at - 1);
      else if (ev.target.closest('.lf-lb-next')) show(at + 1);
      else if (ev.target === lb || ev.target.closest('.lf-lb-close')) close();
    });
    let x0 = null;
    lb.addEventListener('touchstart', (ev) => { x0 = ev.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', (ev) => { if (x0 === null) return; const dx = ev.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50 && set.length > 1) show(at + (dx < 0 ? 1 : -1)); x0 = null; });
  });
  document.addEventListener('keydown', (e) => {
    if (!lb) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight' && set.length > 1) show(at + 1);
    else if (e.key === 'ArrowLeft' && set.length > 1) show(at - 1);
    else if (e.key === 'Tab') {            // keep focus inside the viewer
      const b = $$('button', lb), i = b.indexOf(document.activeElement);
      e.preventDefault(); b[(i + (e.shiftKey ? -1 : 1) + b.length) % b.length].focus();
    }
  });

  // ── interactive map: drag to pan, wheel or pinch to zoom, tap a region or pin for details ──
  const map = document.querySelector('[data-map]');
  const mapData = map && JSON.parse(document.getElementById('lf-map-data')?.textContent || 'null');
  if (map && mapData) {
    const stage = map.querySelector('.lf-map-stage'), svg = map.querySelector('svg'), view = map.querySelector('.lf-map-view');
    const panel = map.querySelector('.lf-map-panel');
    const VB = { w: 1000, h: 1120 };
    let v = { x: 0, y: 0, k: 1 };
    const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
    const apply = () => {
      v.k = clamp(v.k, 1, 6);
      const m = 300;   // keep some of the land in view
      v.x = clamp(v.x, VB.w - VB.w * v.k - m, m); v.y = clamp(v.y, VB.h - VB.h * v.k - m, m);
      view.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
      view.style.setProperty('--ik', (1 / v.k ** 0.8).toFixed(4));   // labels and pins stay readable, growing only a little
    };
    view.style.transformOrigin = '0 0'; view.style.transformBox = 'view-box';
    const toSvg = (cx, cy) => { const p = svg.createSVGPoint(); p.x = cx; p.y = cy; return p.matrixTransform(svg.getScreenCTM().inverse()); };
    const zoomAt = (px, py, k) => { const nk = clamp(k, 1, 6); v.x = px - (px - v.x) * (nk / v.k); v.y = py - (py - v.y) * (nk / v.k); v.k = nk; apply(); };
    const focus = (x, y, k = 2.6) => { v.k = k; v.x = VB.w / 2 - x * k; v.y = VB.h / 2 - y * k; apply(); };
    const img = (s) => `<a href="/gta6hub/img/${esc(s)}.webp" data-lb="map"><img src="/gta6hub/img/${esc(s)}-sm.webp" alt="" loading="lazy" width="640" height="360"></a>`;
    const badge = (st) => (st === 'confirmed' ? '<span class="lf-badge lf-ok">Confirmed</span>' : '<span class="lf-badge lf-rep">Reported</span>');
    const select = (el, html) => {
      $$('.is-on', svg).forEach((n) => n.classList.remove('is-on'));
      el?.classList.add('is-on');
      panel.innerHTML = `<div class="lf-map-panel-in">${html}</div>`;
      if (matchMedia('(max-width: 999px)').matches) panel.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
    };
    const showRegion = (i, move = true) => {
      const r = mapData.regions[i]; if (!r) return;
      const pins = mapData.pois.filter((q) => q.region === r.name);
      select(svg.querySelector(`[data-region="${i}"]`), `<p class="lf-kicker">Region</p><h2 class="lf-h2">${esc(r.name)}</h2><p>${esc(r.text)}</p>
        ${r.images.length ? `<div class="lf-shots">${r.images.map(img).join('')}</div>` : ''}
        ${pins.length ? `<p><b>Here:</b> ${pins.map((q) => esc(q.name)).join(', ')}</p>` : ''}
        <a class="lf-more" href="${esc(r.url)}">${esc(r.name)} guide →</a>`);
      if (move) focus(r.x, r.y, 2.2);
      history.replaceState(null, '', `#${r.slug}`);
    };
    const showPoi = (i, move = true) => {
      const q = mapData.pois[i]; if (!q) return;
      select(svg.querySelector(`[data-poi="${i}"]`), `<p class="lf-kicker">${esc(q.region)} · ${esc(q.kind)}</p><h2 class="lf-h2">${esc(q.name)}</h2>${badge(q.status)}<p>${esc(q.text)}</p>
        ${q.image ? `<div class="lf-shots" style="grid-template-columns:1fr">${img(q.image)}</div>` : ''}
        ${q.url ? `<a class="lf-more" href="${esc(q.url)}">More about it →</a>` : ''}
        <p class="lf-src">Pin positions are approximate until Rockstar publishes an official map.</p>`);
      if (move) focus(q.x, q.y, 3.4);
    };
    // pointer handling: one pointer pans, two pinch; a tap that didn't move selects
    const pts = new Map(); let moved = 0, startDist = 0, startK = 1, last = null;
    stage.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.lf-map-ui')) return;
      stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0;
      stage.classList.add('is-drag'); last = toSvg(e.clientX, e.clientY);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; startDist = Math.hypot(a.x - b.x, a.y - b.y); startK = v.k; }
    });
    stage.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()], mid = toSvg((a.x + b.x) / 2, (a.y + b.y) / 2);
        zoomAt(mid.x, mid.y, startK * (Math.hypot(a.x - b.x, a.y - b.y) / (startDist || 1)));
      } else if (pts.size === 1) {
        const p = toSvg(e.clientX, e.clientY);
        v.x += p.x - last.x; v.y += p.y - last.y; apply();
      }
      last = toSvg(e.clientX, e.clientY);
    });
    const end = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (!pts.size) stage.classList.remove('is-drag');
      if (moved < 6 && e.type === 'pointerup') {
        const hit = document.elementFromPoint(e.clientX, e.clientY);
        const pin = hit?.closest('[data-poi]'), reg = hit?.closest('[data-region]');
        if (pin) showPoi(+pin.dataset.poi); else if (reg) showRegion(+reg.dataset.region);
      }
      if (pts.size === 1) last = toSvg(...Object.values([...pts.values()][0]));
    };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = toSvg(e.clientX, e.clientY);
      stage.classList.add('no-ease'); zoomAt(p.x, p.y, v.k * Math.exp(-e.deltaY * 0.0018));
      clearTimeout(stage._t); stage._t = setTimeout(() => stage.classList.remove('no-ease'), 120);
    }, { passive: false });
    svg.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const pin = e.target.closest('[data-poi]'), reg = e.target.closest('[data-region]');
      if (pin || reg) { e.preventDefault(); pin ? showPoi(+pin.dataset.poi) : showRegion(+reg.dataset.region); }
    });
    map.querySelector('.lf-map-zoom').addEventListener('click', (e) => {
      const b = e.target.closest('[data-zoom]'); if (!b) return;
      const z = +b.dataset.zoom;
      if (!z) { v = { x: 0, y: 0, k: 1 }; apply(); return; }
      zoomAt(VB.w / 2, VB.h / 2, v.k * (z > 0 ? 1.5 : 1 / 1.5));
      // keep the zoom centred on what's on screen
    });
    const chips = $$('[data-kind]', map.querySelector('.lf-map-filter'));
    chips.forEach((c) => c.addEventListener('click', () => {
      chips.forEach((o) => o.setAttribute('aria-pressed', String(o === c)));
      $$('.lf-pin', svg).forEach((p) => p.classList.toggle('is-hidden', c.dataset.kind !== 'all' && p.dataset.kind !== c.dataset.kind));
    }));
    apply();
    const start = mapData.regions.findIndex((r) => `#${r.slug}` === location.hash);
    if (start >= 0) showRegion(start);
  }

  // ── keep the current section visible in the scrolling nav ──
  const cur = document.querySelector('.lf-nav [aria-current]');
  if (cur) { const nav = cur.parentElement; nav.scrollLeft = cur.offsetLeft - nav.clientWidth / 2 + cur.clientWidth / 2; }

  // ── ads: AdSense units are written into the page at build time; load Google's script once the page is idle ──
  const units = $$('ins.adsbygoogle');
  if (units.length) {
    const client = units[0].dataset.adClient;
    const go = () => {
      const s = document.createElement('script');
      s.async = true; s.crossOrigin = 'anonymous';
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
      s.addEventListener('error', () => units.forEach((u) => u.closest('.lf-ad')?.classList.add('is-empty')));   // blocked: no empty boxes
      document.head.appendChild(s);
      units.forEach(() => { try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { /* ignore */ } });
    };
    (window.requestIdleCallback || ((f) => setTimeout(f, 1200)))(go, { timeout: 3000 });
  }
})();

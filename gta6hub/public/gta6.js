/* GTA 6 Hub: menu, liquid backdrop, countdown, click-to-load trailers and music, search and filters, lightbox,
   the map, the real-life locations search, and ads.
   Every page works without this file (links still go to YouTube, Spotify and full-size images); it only adds polish. */
(() => {
  'use strict';
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const BASE = '/gta6hub';

  // ── header turns to glass once you scroll past the top ──
  const headEl = document.querySelector('.lf-head');
  const onScroll = () => headEl?.classList.toggle('is-solid', scrollY > 40);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // ── full-screen menu ──
  const menuBtn = document.querySelector('.lf-menu-btn'), menu = document.getElementById('lf-menu');
  const setMenu = (open) => {
    if (!menu) return;
    menuBtn.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('lf-menu-open', open);
    if (open) { menu.hidden = false; requestAnimationFrame(() => menu.classList.add('is-open')); menu.querySelector('a')?.focus(); }
    else { menu.classList.remove('is-open'); setTimeout(() => { if (menuBtn.getAttribute('aria-expanded') === 'false') menu.hidden = true; }, 350); }
  };
  menuBtn?.addEventListener('click', () => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuBtn?.getAttribute('aria-expanded') === 'true') { setMenu(false); menuBtn.focus(); } });

  // ── liquid backdrop: a slow navy field with pink and violet glows, drawn small and scaled up ──
  const canvas = document.querySelector('.lf-liquid');
  const gl = canvas && canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
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
        float v = .3 * blob(q, vec2(a * (.84 + .06 * sin(t * .05)), .98 + .08 * cos(t * .04)), a * .55);
        float p = .2 * blob(q, vec2(a * (.1 + .06 * cos(t * .045)), .36 + .1 * sin(t * .05)), a * .45);
        float c = .08 * blob(q, vec2(a * (.55 + .12 * sin(t * .03)), .08 + .08 * cos(t * .035)), a * .4);
        vec3 col = vec3(.545, .424, .941) * v + vec3(.992, .702, .761) * p + vec3(1., 1., .83) * c;
        float al = clamp(v + p + c, 0., 1.);
        al += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - .5) / 255.;
        gl_FragColor = vec4(col / max(al, .001), al);
      }`));
    gl.linkProgram(prog);
    if (gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const uRes = gl.getUniformLocation(prog, 'uRes'), uT = gl.getUniformLocation(prog, 'uT');
      const t0 = Math.random() * 300;
      canvas.style.background = 'none';
      const size = () => { canvas.width = Math.max(2, Math.ceil(innerWidth / 5)); canvas.height = Math.max(2, Math.ceil(innerHeight / 5)); gl.viewport(0, 0, canvas.width, canvas.height); };
      const draw = (now) => { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.uniform2f(uRes, canvas.width, canvas.height); gl.uniform1f(uT, t0 + (reduced ? 0 : now / 1000)); gl.drawArrays(gl.TRIANGLES, 0, 3); };
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
    const el = e.target.closest?.('.lf-card, .lf-buycard');
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
      if (left <= 0) { count.classList.add('is-out'); count.querySelector('.lf-count-label').textContent = 'Out now on PS5 & Xbox Series X|S'; return; }
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

  // ── search, status and type filters on database pages ──
  for (const bar of $$('[data-filter-for]')) {
    const grid = document.getElementById(bar.dataset.filterFor);
    const input = bar.querySelector('[data-filter-q]');
    const chips = $$('[data-filter-s]', bar), gchips = $$('[data-filter-g]', bar);
    const empty = grid.nextElementSibling?.classList.contains('lf-empty') ? grid.nextElementSibling : null;
    let status = 'all', group = '';
    const apply = () => {
      const words = input.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      let shown = 0;
      for (const c of $$('.lf-card', grid)) {
        const ok = (status === 'all' || c.dataset.status === status) && (!group || c.dataset.group === group) && words.every((w) => c.dataset.q.includes(w));
        c.hidden = !ok; if (ok) shown++;
      }
      const filtering = words.length || status !== 'all' || group;
      for (const ad of $$(':scope > .lf-ad', grid)) ad.hidden = !!filtering;    // in-feed ads only between full lists
      if (empty) empty.hidden = shown > 0;
    };
    input.addEventListener('input', apply);
    chips.forEach((b) => b.addEventListener('click', () => { status = b.dataset.filterS; chips.forEach((c) => c.setAttribute('aria-pressed', String(c === b))); apply(); }));
    gchips.forEach((b) => b.addEventListener('click', () => { group = b.dataset.filterG; gchips.forEach((c) => c.setAttribute('aria-pressed', String(c === b))); apply(); }));
  }

  // ── real-life locations: search across every landmark ──
  const lmData = document.getElementById('lf-lm-data');
  if (lmData) {
    const rows = JSON.parse(lmData.textContent);
    const list = document.querySelector('[data-lm-list]'), input = document.querySelector('[data-lm-q]');
    const note = list.nextElementSibling;
    const row = ([id, name, street, district, area, real, lat, lng, aslug]) => `<li class="lf-lm"><div><b>${esc(name)}</b><span>${esc([street, district, area].filter(Boolean).join(', '))}</span></div><div class="lf-lm-real"><i>Real life</i><span>${esc(real.split(',')[0])}</span><em>${esc(real.split(',').slice(1, 3).join(',').trim())}</em></div><div class="lf-lm-act"><a href="${BASE}/map/#lm-${esc(id)}">Map</a><a href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}" target="_blank" rel="noopener">Real place ↗</a></div></li>`;
    const initial = list.innerHTML, initialNote = note.textContent;
    input.addEventListener('input', () => {
      const w = input.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      if (!w.length) { list.innerHTML = initial; note.textContent = initialNote; return; }
      const hits = rows.filter((r) => { const t = `${r[1]} ${r[2]} ${r[3]} ${r[4]} ${r[5]}`.toLowerCase(); return w.every((x) => t.includes(x)); });
      list.innerHTML = hits.slice(0, 120).map(row).join('') || '<li class="lf-empty">No places match that.</li>';
      note.textContent = `${hits.length} match${hits.length === 1 ? '' : 'es'}${hits.length > 120 ? ', showing the first 120' : ''}.`;
    });
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
    else if (e.key === 'Tab') { const b = $$('button', lb), i = b.indexOf(document.activeElement); e.preventDefault(); b[(i + (e.shiftKey ? -1 : 1) + b.length) % b.length].focus(); }
  });

  // ── interactive map: drag to pan, wheel or pinch to zoom, search, tap a region, pin or landmark ──
  const map = document.querySelector('[data-map]');
  const mapData = map && JSON.parse(document.getElementById('lf-map-data')?.textContent || 'null');
  if (map && mapData) {
    const stage = map.querySelector('.lf-map-stage'), svg = map.querySelector('svg'), view = map.querySelector('.lf-map-view');
    const panel = map.querySelector('.lf-map-panel'), results = map.querySelector('.lf-map-results'), q = map.querySelector('[data-map-q]');
    const vb = svg.viewBox.baseVal, VB = { w: vb.width, h: vb.height };
    let v = { x: 0, y: 0, k: 1 }, lastK = 0;
    const dots = $$('.lf-lmdot', svg), labels = svg.querySelector('.lf-lmlabels');
    const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
    const apply = () => {
      v.k = clamp(v.k, 1, 24);
      const m = 200;
      v.x = clamp(v.x, VB.w - VB.w * v.k - m, m); v.y = clamp(v.y, VB.h - VB.h * v.k - m, m);
      view.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
      view.style.setProperty('--ik', (1 / v.k ** 0.85).toFixed(4));
      if (v.k !== lastK) {
        lastK = v.k; const r = (2.2 / v.k ** 0.6).toFixed(2); dots.forEach((c) => c.setAttribute('r', r));
        stage.classList.toggle('is-close', v.k >= 9);   // landmark names appear once you're zoomed in
        if (v.k >= 9) labels.setAttribute('font-size', (11 / v.k).toFixed(3));
      }
    };
    view.style.transformOrigin = '0 0'; view.style.transformBox = 'view-box';
    const toSvg = (cx, cy) => { const p = svg.createSVGPoint(); p.x = cx; p.y = cy; return p.matrixTransform(svg.getScreenCTM().inverse()); };
    const zoomAt = (px, py, k) => { const nk = clamp(k, 1, 24); v.x = px - (px - v.x) * (nk / v.k); v.y = py - (py - v.y) * (nk / v.k); v.k = nk; apply(); };
    const focus = (x, y, k) => { v.k = k; v.x = VB.w / 2 - x * k; v.y = VB.h / 2 - y * k; apply(); };
    const img = (s) => `<a href="${BASE}/img/${esc(s)}.webp" data-lb="map"><img src="${BASE}/img/${esc(s)}-sm.webp" alt="" loading="lazy" width="640" height="360"></a>`;
    const badge = (st) => (st === 'confirmed' ? '<span class="lf-badge lf-ok">Confirmed</span>' : '<span class="lf-badge lf-rep">Reported</span>');
    const select = (el, html) => {
      $$('.is-on', svg).forEach((n) => n.classList.remove('is-on'));
      el?.classList.add('is-on');
      panel.innerHTML = `<div class="lf-map-panel-in">${html}</div>`;
      if (matchMedia('(max-width: 999px)').matches) panel.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
    };
    const showRegion = (i, move = true) => {
      const r = mapData.regions[i]; if (!r) return;
      select(svg.querySelector(`[data-region="${i}"]`), `${r.art ? `<a class="lf-postcard-mini" href="${BASE}/art/${esc(r.art)}-landscape.webp" data-lb="map"><img src="${BASE}/art/${esc(r.art)}-landscape-sm.webp" alt="${esc(r.name)} postcard" loading="lazy" width="960" height="540"></a>` : ''}
        <p class="lf-kicker">Official region</p><h2 class="lf-h2">${esc(r.name)}</h2><p>${esc(r.text)}</p>
        ${r.images.length ? `<div class="lf-shots">${r.images.map(img).join('')}</div>` : ''}
        <div class="lf-actions"><a class="lf-more" href="${esc(r.url)}">${esc(r.name)} guide →</a></div>`);
      if (move) focus(r.x, r.y, 4);
      history.replaceState(null, '', `#${r.slug}`);
    };
    const showPoi = (i, move = true) => {
      const p = mapData.pois[i]; if (!p) return;
      select(svg.querySelector(`[data-poi="${i}"]`), `<p class="lf-kicker">${esc(p.region)} · story place</p><h2 class="lf-h2">${esc(p.name)}</h2>${badge(p.status)}<p>${esc(p.text)}</p>
        ${p.image ? `<div class="lf-shots" style="grid-template-columns:1fr">${img(p.image)}</div>` : ''}
        ${p.url ? `<div class="lf-actions"><a class="lf-more" href="${esc(p.url)}">More about it →</a></div>` : ''}`);
      if (move) focus(p.x, p.y, 10);
    };
    const showLm = (i, move = true) => {
      const [id, name, where, real, x, y, type] = mapData.lms[i] || []; if (!id) return;
      select(svg.querySelector(`[data-lm="${i}"]`), `<p class="lf-kicker">${esc(where)} · ${esc(type)}</p><h2 class="lf-h2">${esc(name)}</h2>
        <div class="lf-real"><i>Based on</i><b>${esc(real.split(',')[0])}</b><br>${esc(real.split(',').slice(1).join(',').trim())}</div>
        <div class="lf-actions"><a class="lf-more" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(real)}" target="_blank" rel="noopener">See the real place ↗</a></div>
        <p class="lf-src">Mapped by the GTA VI community (gtadb.org). Not confirmed by Rockstar.</p>`);
      if (move) focus(x, y, 14);
      history.replaceState(null, '', `#lm-${id}`);
    };
    // pointer handling: one pointer pans, two pinch; a tap that didn't move selects
    const pts = new Map(); let moved = 0, startDist = 0, startK = 1, last = null;
    stage.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.lf-map-ui, .lf-map-results')) return;
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
        const pin = hit?.closest('[data-poi]'), reg = hit?.closest('[data-region]'), lm = hit?.closest('[data-lm]');
        if (pin) showPoi(+pin.dataset.poi); else if (reg) showRegion(+reg.dataset.region); else if (lm) showLm(+lm.dataset.lm);
      }
      if (pts.size === 1) { const r = [...pts.values()][0]; last = toSvg(r.x, r.y); }
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
      const c = toSvg(stage.getBoundingClientRect().left + stage.clientWidth / 2, stage.getBoundingClientRect().top + stage.clientHeight / 2);
      zoomAt(c.x, c.y, v.k * (z > 0 ? 1.6 : 1 / 1.6));
    });
    $$('[data-layer]', map).forEach((c) => c.addEventListener('click', () => {
      const on = c.getAttribute('aria-pressed') !== 'true';
      c.setAttribute('aria-pressed', String(on));
      stage.classList.toggle(`no-${c.dataset.layer}`, !on);
    }));
    // search: regions, story places and landmarks
    const index = [
      ...mapData.regions.map((r, i) => ({ t: r.name, s: 'Official region', go: () => showRegion(i) })),
      ...mapData.pois.map((p, i) => ({ t: p.name, s: `${p.region} · story place`, go: () => showPoi(i) })),
      ...mapData.lms.map((l, i) => ({ t: l[1], s: `${l[2]} · based on ${l[3].split(',')[0]}`, go: () => showLm(i) })),
    ];
    let hits = [];
    q.addEventListener('input', () => {
      const w = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      hits = w.length ? index.filter((h) => w.every((x) => `${h.t} ${h.s}`.toLowerCase().includes(x))).slice(0, 30) : [];
      results.innerHTML = hits.map((h, i) => `<li><button type="button" data-hit="${i}">${esc(h.t)}<span>${esc(h.s)}</span></button></li>`).join('') || (w.length ? '<li><button type="button" disabled>No matches</button></li>' : '');
      results.hidden = !w.length;
    });
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && hits[0]) { hits[0].go(); results.hidden = true; } });
    results.addEventListener('click', (e) => { const b = e.target.closest('[data-hit]'); if (b) { hits[+b.dataset.hit]?.go(); results.hidden = true; } });
    apply();
    const h = location.hash.slice(1);
    if (h.startsWith('lm-')) { const i = mapData.lms.findIndex((l) => l[0] === h.slice(3)); if (i >= 0) showLm(i); }
    else { const i = mapData.regions.findIndex((r) => r.slug === h); if (i >= 0) showRegion(i); }
  }

  // ── ads ──
  // AdSense units are written into the page at build time; Google's script loads once the page is idle.
  const units = $$('ins.adsbygoogle');
  const idle = (f) => (window.requestIdleCallback || ((g) => setTimeout(g, 1200)))(f, { timeout: 3000 });
  if (units.length) {
    idle(() => {
      const s = document.createElement('script');
      s.async = true; s.crossOrigin = 'anonymous';
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(units[0].dataset.adClient)}`;
      s.addEventListener('error', () => units.forEach((u) => u.closest('.lf-ad')?.classList.add('is-empty')));   // blocked: no empty boxes
      document.head.appendChild(s);
      units.forEach(() => { try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { /* ignore */ } });
    });
  }
  // Adsterra native banners: one container per page (their code identifies it by id)
  const ast = $$('.lf-adsterra');
  if (ast.length) {
    ast.slice(1).forEach((el) => el.closest('.lf-ad')?.remove());
    const el = ast[0], key = el.dataset.adsterra;
    if (/^[a-f0-9]{32}$/.test(key) && /^https:\/\/[a-z0-9.-]+$/.test(el.dataset.host)) {
      idle(() => {
        el.id = `container-${key}`;
        const s = document.createElement('script');
        s.async = true; s.dataset.cfasync = 'false'; s.src = `${el.dataset.host}/${key}/invoke.js`;
        s.addEventListener('error', () => el.closest('.lf-ad')?.classList.add('is-empty'));
        el.before(s);
      });
    }
  }
})();

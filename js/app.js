/* Hex Modifications: client app */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let apiOnline = false;
  let discordUser = '001hex';
  let email = '';

  // API first (Node backend), static JSON fallback (GitHub Pages / any static host).
  async function load(api, fallback) {
    try {
      const r = await fetch(api, { headers: { Accept: 'application/json' } });
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) { apiOnline = true; return await r.json(); }
    } catch { /* offline */ }
    if (!fallback) return null;
    try { const r = await fetch(fallback); if (r.ok) return await r.json(); } catch { /* none */ }
    return null;
  }

  // ── Glass specular follows the pointer ─────────────
  // (rAF-throttled: one style write per frame at most, instead of one per mouse event)
  let sheenEvt = null;
  document.addEventListener('pointermove', (e) => {
    if (sheenEvt === null) requestAnimationFrame(() => {
      const ev = sheenEvt; sheenEvt = null;
      const g = ev.target.closest?.('.glass, .glass-dark');
      if (!g) return;
      const r = g.getBoundingClientRect();
      g.style.setProperty('--mx', `${ev.clientX - r.left}px`);
      g.style.setProperty('--my', `${ev.clientY - r.top}px`);
    });
    sheenEvt = e;
  }, { passive: true });

  // ── Toast ──────────────────────────────────────────
  let toastTimer;
  function toast(title, body) {
    const el = $('#toast');
    $('#toastTitle').textContent = title; $('#toastBody').textContent = body;
    el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 4200);
  }

  // ── Site, links, platforms ─────────────────────────
  function applySite(site) {
    if (!site) return;
    const links = site.links || {};
    discordUser = site.discordUser || discordUser;
    email = site.email || '';
    $$('[data-link]').forEach((a) => {
      const url = links[a.dataset.link];
      if (url) a.href = safeUrl(url); else a.hidden = true;     // never show a dead link
    });
    $$('[data-discord-user]').forEach((el) => { el.textContent = discordUser; });
    $$('[data-email]').forEach((a) => { a.textContent = email; a.href = `mailto:${email}`; });
    if (!email) $$('[data-email], [data-copy-email]').forEach((el) => el.closest('.link-card')?.remove());
    $('#yearsInline').textContent = site.yearsScripting || 6;

    const plats = (site.platforms || []).filter((p) => links[p.key]);
    $('#platGrid').innerHTML = plats.map((p, i) => `
      <a class="plat glass reveal ${i < 3 ? 'major' : ''}" href="${esc(safeUrl(links[p.key]))}" target="_blank" rel="noopener" data-track="${esc(p.key)}-platform">
        <span class="plat-label">${esc(p.label)}</span>
        <strong>${esc(p.name)}</strong>
        ${p.highlights?.length ? `<ul>${p.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
        <span class="lc-arrow" aria-hidden="true">↗</span>
      </a>`).join('');
    $('#sheetPlats').innerHTML = plats.map((p) => `<li><a href="${esc(safeUrl(links[p.key]))}" target="_blank" rel="noopener" data-track="${esc(p.key)}-menu">${esc(p.name)}<small>${esc(p.label)}</small></a></li>`).join('');
    $('#footLinks').innerHTML = plats.map((p) => `<a href="${esc(safeUrl(links[p.key]))}" target="_blank" rel="noopener" data-track="${esc(p.key)}-foot">${esc(p.name.toLowerCase())}</a>`).join('')
      + (email ? `<a href="mailto:${esc(email)}">email</a>` : '');
    observeReveal();
  }

  // ── Technology showcase ────────────────────────────
  function renderTech(data) {
    if (!data?.slides?.length) { $('#tech').hidden = true; return; }
    const tabs = $('#techTabs'), cmp = $('#techCmp'), range = $('.cmp-range', cmp);
    const before = $('#techBefore'), after = $('#techAfter'), btn = $('#bufferBtn');
    before.src = data.before;
    $('#techNote').textContent = data.note || '';
    tabs.insertAdjacentHTML('beforeend', data.slides.map((s, i) => `<button role="tab" aria-selected="${i === 0}" data-i="${i}">${esc(s.title)}</button>`).join(''));
    // warm the cache so tab switches are instant
    data.slides.forEach((s) => { new Image().src = s.after; if (s.buffer) new Image().src = s.buffer; });
    let current = 0, buffer = false;
    const show = () => {
      const s = data.slides[current];
      after.src = buffer && s.buffer ? s.buffer : s.after;
      after.alt = `${s.title}${buffer ? ' buffer view' : ''}`;
      $('#techName').textContent = s.title;
      $('#techText').textContent = s.text;
      $('#techLabelR').textContent = buffer ? 'buffer' : 'reshade';
      btn.textContent = buffer ? 'back to image' : 'view buffer';
      btn.setAttribute('aria-pressed', String(buffer));
      btn.hidden = !s.buffer;
    };
    tabs.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      current = Number(b.dataset.i); buffer = false;
      $$('button', tabs).forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      moveThumb(tabs, b); show();
    });
    btn.addEventListener('click', () => { buffer = !buffer; show(); });
    const set = (v) => cmp.style.setProperty('--pos', `${v}%`);
    range.addEventListener('input', () => set(range.value));
    let pending = null;
    cmp.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' && !e.buttons) return;
      if (pending === null) requestAnimationFrame(() => {
        const r = cmp.getBoundingClientRect();
        const v = Math.max(0, Math.min(100, ((pending - r.left) / r.width) * 100));
        pending = null; range.value = v; set(v);
      });
      pending = e.clientX;
    });
    show();
    requestAnimationFrame(() => moveThumb(tabs, $('[aria-selected="true"]', tabs)));
  }

  function moveThumb(group, btn) {
    const thumb = $('.filter-thumb', group);
    if (!thumb || !btn) return;
    thumb.style.width = `${btn.offsetWidth}px`; thumb.style.transform = `translateX(${btn.offsetLeft}px)`;
  }
  addEventListener('resize', () => $$('.filters').forEach((g) => moveThumb(g, $('[aria-selected="true"]', g))));

  // ── Store ──────────────────────────────────────────
  const PLATFORM_NAMES = { tebex: 'Tebex', kofi: 'Ko-fi', patreon: 'Patreon', shopify: 'Shopify', fiverr: 'Fiverr', gumroad: 'Gumroad', payhip: 'Payhip' };
  const PALETTE = ['#E89898', '#A373D3', '#6F70A2', '#7E3A63', '#5D549C'];
  const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  let products = [];
  function productArt(p) {
    if (p.image) return `<img src="${esc(safeUrl(p.image))}" alt="" loading="lazy">`;
    const h = hash(p.slug), c1 = PALETTE[h % 5], c2 = PALETTE[(h + 2) % 5], id = `g${h}`;
    const hex = (r) => Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 3 * k - Math.PI / 2; return `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`; }).join(' ');
    return `<svg class="glyph" viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
      <polygon points="${hex(46)}" fill="url(#${id})" opacity=".9"/><circle cx="50" cy="50" r="16" fill="#fff" fill-opacity=".35" stroke="#fff" stroke-opacity=".9"/></svg>`;
  }
  function renderProducts(filter = 'all') {
    const list = filter === 'all' ? products : products.filter((p) => p.category === filter);
    const fmt = (p) => Number(p.price) > 0 ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: p.currency || 'GBP' }).format(p.price) : 'free';
    $('#products').innerHTML = list.map((p, i) => `
      <article class="card glass" style="animation-delay:${i * 60}ms">
        <a class="detail-link" href="${apiOnline ? `/p/${esc(p.slug)}` : esc(safeUrl(p.url))}" aria-label="${esc(p.title)} details"></a>
        <div class="card-art"><div class="card-tags"><span class="chip">${esc(p.game || '')}</span><span class="chip feat">${esc(PLATFORM_NAMES[p.platform] || p.platform || '')}</span></div>${productArt(p)}</div>
        <div class="card-body">
          <h3>${esc(p.title)}</h3><p class="sub">${esc(p.subtitle || '')}</p><p class="desc">${esc(p.description || '')}</p>
          <div class="card-foot"><span class="price">${esc(fmt(p))}</span><a class="card-go" href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener" data-track="buy-${esc(p.platform)}">get it ↗</a></div>
        </div>
      </article>`).join('');
  }
  function setupStore(list) {
    products = Array.isArray(list) ? list : [];
    const has = products.length > 0;
    $('#storeEmpty').hidden = has;
    $('#storeFilters').hidden = products.length < 5;              // filters only once there's something to filter
    renderProducts();
    observeReveal();
  }
  $$('#storeFilters button').forEach((b) => b.addEventListener('click', () => {
    $$('#storeFilters button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    moveThumb($('#storeFilters'), b); renderProducts(b.dataset.filter);
  }));

  // ── Roadmap + updates: only shown when they have content ──
  function renderRoadmap(items) {
    if (!items?.length) return;
    const label = { shipped: 'shipped', 'in-progress': 'in development', planned: 'planned', research: 'research' };
    $('#roadmapList').innerHTML = items.map((r) => `
      <li class="rm glass reveal">
        <div class="rm-meta"><span class="status ${esc(r.status)}">${esc(label[r.status] || r.status)}</span><span>${esc(String(r.type || '').toLowerCase())} · ${esc(r.eta || '')}</span></div>
        <div><span class="rm-title">${esc(String(r.title).toLowerCase())}</span><span class="rm-notes">${esc(r.notes || '')}</span></div>
        <div class="rm-bar"><span>${Number(r.progress) || 0}%</span><div class="bar"><b data-w="${Math.max(0, Math.min(100, Number(r.progress) || 0))}"></b></div></div>
      </li>`).join('');
    $('#roadmap').hidden = false; observeReveal();
  }
  function renderFeed(data) {
    const posts = Array.isArray(data) ? data : data?.posts || [];
    if (!posts.length) return;
    const fmt = (d) => { const t = new Date(d); return isNaN(t) ? '' : t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toLowerCase(); };
    $('#feedList').innerHTML = posts.slice(0, 6).map((p) => `
      <a class="post glass reveal" href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener" data-track="patreon-post">
        <div class="post-top"><span>${esc(fmt(p.date))}</span><span class="${p.public ? '' : 'lock'}">${p.public ? 'public' : 'patrons only'}</span></div>
        <h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}</p><span class="post-go">read on patreon ↗</span>
      </a>`).join('');
    $('#feed').hidden = false; observeReveal();
  }

  // ── Latest releases (GTA5-Mods, FiveM forum, GitHub, Patreon…, merged newest first) ──
  function renderReleases(data) {
    const items = (data?.items || []).filter((it) => it.title && /^https?:\/\//.test(it.url || '')).slice(0, 12);
    if (!items.length) return;
    const fmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const num = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
    const imgSrc = (u) => (/^(https:\/\/|img\/releases\/)[^"'<>\s]+$/.test(u || '') ? u : '');
    const SHOWN = 6;
    $('#relGrid').innerHTML = items.map((it, i) => {
      const d = it.date ? new Date(it.date) : null, s = it.stats || {};
      const fresh = d && Date.now() - d < 21 * 864e5;
      const meta = [s.downloads && `↓ ${num(s.downloads)}`, s.likes && `♥ ${num(s.likes)}`, s.rating && `★ ${s.rating}`, s.stars && `★ ${num(s.stars)}`].filter(Boolean);
      const src = imgSrc(it.image);
      return `<a class="rel glass reveal${i === 0 ? ' lead' : ''}" href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener" data-track="release-${esc(it.platform)}"${i >= SHOWN ? ' hidden' : ''}>
        <div class="rel-art">${src ? `<img src="${esc(src)}" alt="" loading="${i < 3 ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer">` : ''}<span class="rel-mark" aria-hidden="true">${esc(it.source || '')}</span>
          <div class="rel-tags"><span class="chip${fresh ? ' feat' : ''}">${fresh ? 'new · ' : ''}${esc(it.source || 'release')}</span>${d && !isNaN(d) ? `<span class="chip">${esc(fmt.format(d).toLowerCase())}</span>` : ''}</div></div>
        <div class="rel-body"><h3>${esc(it.title)}</h3>${it.description ? `<p>${esc(it.description)}</p>` : ''}
          <div class="rel-foot"><span class="rel-meta">${[...(it.tags || []).slice(0, 3).map((t) => String(t).toLowerCase()), ...meta].map((m) => `<span>${esc(m)}</span>`).join('')}</span><span class="rel-go" aria-hidden="true">↗</span></div></div>
      </a>`;
    }).join('');
    // a cover that fails to load falls back to the platform mark; wide banners are shown whole over a blurred copy
    $$('#relGrid img').forEach((img) => {
      img.addEventListener('error', () => img.remove(), { once: true });
      const fit = () => {
        if (img.naturalWidth / img.naturalHeight < 1.9) return;
        const bg = img.cloneNode(); bg.className = 'rel-bg'; bg.setAttribute('aria-hidden', 'true');
        img.before(bg); img.closest('.rel').classList.add('wide');
      };
      if (img.complete && img.naturalWidth) fit(); else img.addEventListener('load', fit, { once: true });
    });
    const more = $('#relMore');
    if (items.length > SHOWN) {
      more.hidden = false;
      more.addEventListener('click', () => { $$('#relGrid .rel[hidden]').forEach((el) => { el.hidden = false; }); more.hidden = true; observeReveal(); }, { once: true });
    }
    const sources = [...new Set(items.map((it) => it.source).filter(Boolean))];
    if (sources.length) $('#relNote').textContent = `the newest uploads from ${sources.length > 1 ? `${sources.slice(0, -1).join(', ')} and ${sources.at(-1)}` : sources[0]}, pulled in automatically. open one to grab it where it lives.`;
    $('#releases').hidden = false; observeReveal();
  }

  // ── Contact ────────────────────────────────────────
  async function copy(text, title, body) {
    try { await navigator.clipboard.writeText(text); toast(title, body); }
    catch { toast(text, body); }
  }
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-copy-discord]')) copy(discordUser, 'username copied', `add ${discordUser} on Discord to get in touch.`);
    if (e.target.closest('[data-copy-email]') && email) copy(email, 'email copied', email);
  });

  // The form only appears when the Node backend is running (it needs the API to deliver messages).
  let csrf = null;
  async function setupForm() {
    const d = await load('/api/csrf');
    csrf = d?.token || null;
    if (csrf) { $('#contactForm').hidden = false; $('#contactGrid').classList.add('with-form'); }
  }
  $('#contactForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget, status = $('#formStatus'), btn = $('button[type=submit]', form);
    $$('.field', form).forEach((f) => { f.classList.remove('err'); $('.msg', f)?.remove(); });
    btn.disabled = true; status.className = 'form-status'; status.textContent = 'sending…';
    try {
      const r = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...Object.fromEntries(new FormData(form)), csrf }) });
      const out = await r.json().catch(() => ({}));
      if (r.ok) { form.reset(); status.className = 'form-status ok'; status.textContent = 'message delivered.'; toast('mission passed', 'your message reached Hex Modifications.'); setupForm(); }
      else if (r.status === 429 || r.status === 403) { status.className = 'form-status bad'; status.textContent = 'too many messages. try again later.'; wanted.raise(2); }
      else {
        status.className = 'form-status bad'; status.textContent = (out.error || 'something went wrong.').toLowerCase();
        for (const [k, v] of Object.entries(out.fields || {})) {
          const f = form.elements[k]?.closest('.field');
          if (f) { f.classList.add('err'); f.insertAdjacentHTML('beforeend', `<span class="msg">${esc(v)}</span>`); }
        }
        if (r.status === 400) setupForm();
      }
    } catch { status.className = 'form-status bad'; status.textContent = `network error. message ${discordUser} on Discord instead.`; }
    btn.disabled = false;
  });

  // ── Outbound click analytics (backend only) ────────
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-track]');
    if (!a || !apiOnline) return;
    try { navigator.sendBeacon('/api/track', JSON.stringify({ type: 'outbound', target: a.dataset.track })); } catch { /* ignore */ }
  });

  // ── Nav sheet, active link, scroll progress, reveal ──
  const sheet = $('#sheet'), menuBtn = $('#menuBtn');
  const setSheet = (open) => { sheet.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open)); };
  menuBtn.addEventListener('click', (e) => { e.stopPropagation(); setSheet(sheet.hidden); });
  sheet.addEventListener('click', (e) => { if (e.target.closest('a')) setSheet(false); });
  document.addEventListener('click', (e) => { if (!sheet.hidden && !sheet.contains(e.target)) setSheet(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setSheet(false); });

  const navObs = new IntersectionObserver((ents) => ents.forEach((en) => {
    if (en.isIntersecting) $$('.pill a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${en.target.id}`));
  }), { rootMargin: '-45% 0px -50% 0px' });
  $$('main section[id]').forEach((s) => navObs.observe(s));

  const bar = $('#progBar'), pct = $('#progPct'), nav = $('.nav');
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? Math.round((scrollY / max) * 100) : 0;
    bar.style.width = `${p}%`; pct.textContent = `${p}%`;
    nav.classList.toggle('scrolled', scrollY > 60);          // wordmark gets a glass backing once content passes under it
    if (scrollY < innerHeight * 0.6) $$('.pill a.active').forEach((a) => a.classList.remove('active'));
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  const revObs = new IntersectionObserver((ents) => ents.forEach((en) => {
    if (!en.isIntersecting) return;
    en.target.classList.add('in');
    $$('.bar b', en.target).forEach((b) => { b.style.width = `${b.dataset.w}%`; });
    revObs.unobserve(en.target);
  }), { threshold: 0.12 });
  function observeReveal() { $$('.reveal:not(.in)').forEach((el) => revObs.observe(el)); }
  observeReveal();

  // ── Easter eggs: wanted level, timecycle skip, cheat codes ──
  const wanted = (() => {
    const el = $('#wanted');
    el.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z"/></svg>'.repeat(5);
    let level = 0, decay;
    const set = (n) => {
      level = Math.max(0, Math.min(5, n));
      $$('svg', el).forEach((s, i) => s.classList.toggle('lit', i < level));
      el.classList.toggle('on', level > 0); el.classList.remove('flash'); clearTimeout(decay);
      if (level > 0) decay = setTimeout(() => { el.classList.add('flash'); decay = setTimeout(() => set(0), 4000); }, 16000);
    };
    return { raise: (n = 1) => set(level + n), clear: () => set(0) };
  })();

  $('#timecycle').addEventListener('click', () => {
    const p = window.hexTimecycle?.skip();
    if (p) toast(`time skipped to ${p}`, 'reload the page to sync back to your local time.');
  });

  const CHEATS = {
    MAKEITRAIN: () => { const on = $('#rain').classList.toggle('on'); return on ? 'weather: rain' : 'weather: clear'; },
    FUGITIVE: () => { wanted.raise(1); return 'wanted level raised'; },
    LAWYERUP: () => { wanted.clear(); return 'wanted level cleared'; },
    SLOWMO: () => {
      const on = document.body.classList.toggle('slowmo');
      document.getAnimations().forEach((a) => { a.playbackRate = on ? 0.25 : 1; });
      document.dispatchEvent(new CustomEvent('hex:slowmo', { detail: on }));
      return on ? 'slow motion on' : 'slow motion off';
    },
    SKYFALL: () => { document.dispatchEvent(new CustomEvent('hex:model')); scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); return 'new object dropped in'; },
  };
  let typed = '';
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.key.length !== 1) return;
    typed = (typed + e.key.toUpperCase()).slice(-12);
    for (const [code, fn] of Object.entries(CHEATS)) if (typed.endsWith(code)) { typed = ''; toast('cheat activated', fn()); break; }
  });

  $('#yr').textContent = new Date().getFullYear();

  // ── Go ─────────────────────────────────────────────
  (async () => {
    const [site, prods, road, feed, show, rel] = await Promise.all([
      load('/api/site', 'data/site.json'),
      load('/api/products', 'data/products.json'),
      load('/api/roadmap', 'data/roadmap.json'),
      load('/api/feed', 'data/feed.json'),
      load('/api/showcase', 'data/showcase.json'),
      load('/api/releases', 'data/releases.json'),
    ]);
    // shared with the chat assistant (js/chat.js), which answers from the same data
    window.hexData = { site, products: Array.isArray(prods) ? prods : [], roadmap: Array.isArray(road) ? road : [], releases: rel?.items || [], apiOnline };
    document.dispatchEvent(new CustomEvent('hex:data'));
    applySite(site);
    renderReleases(rel);
    renderTech(show);
    setupStore(prods);
    renderRoadmap(road);
    renderFeed(feed);
    setupForm();
  })();
})();

/* Hex Modifications: client app */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let apiOnline = false;

  // API first, static JSON fallback (lets the frontend run on any static host or preview).
  async function load(api, fallback) {
    try {
      const r = await fetch(api, { headers: { Accept: 'application/json' } });
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) { apiOnline = true; return await r.json(); }
    } catch { /* offline */ }
    if (!fallback) return null;
    try { const r = await fetch(fallback); if (r.ok) return await r.json(); } catch { /* none */ }
    return null;
  }

  const PLATFORMS = {
    patreon: { name: 'Patreon', label: 'early access' },
    kofi: { name: 'Ko-fi', label: 'tips & presets' },
    tebex: { name: 'Tebex', label: 'fivem store' },
    shopify: { name: 'Shopify', label: 'software' },
    fiverr: { name: 'Fiverr', label: 'commissions' },
    discord: { name: 'Discord', label: 'support' },
    youtube: { name: 'YouTube', label: 'showcases' },
    github: { name: 'GitHub', label: 'open source' },
  };
  const CAT_LABEL = { reshade: 'reshade', graphics: 'graphics', scripts: 'script', software: 'software', services: 'commission' };
  const PALETTE = ['#E89898', '#A373D3', '#6F70A2', '#7E3A63', '#5D549C']; // GTA VI sunset
  const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

  // ── Glass specular: highlight follows the pointer across any glass surface ──
  document.addEventListener('pointermove', (e) => {
    const g = e.target.closest?.('.glass, .glass-dark');
    if (!g) return;
    const r = g.getBoundingClientRect();
    g.style.setProperty('--mx', `${e.clientX - r.left}px`);
    g.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });

  // ── Links & platforms ──────────────────────────────
  function applySite(site) {
    if (!site) return;
    const links = site.links || {};
    $$('[data-link]').forEach((a) => { if (links[a.dataset.link]) a.href = safeUrl(links[a.dataset.link]); });
    discordUser = site.discordUser || discordUser;
    siteEmail = site.email || siteEmail;
    $$('[data-discord-user]').forEach((el) => { el.textContent = discordUser; });
    const invite = links.discord || '';
    const hasServer = /^https:\/\/(discord\.gg|discord\.com\/invite)\/(?!your-invite)/.test(invite);
    $$('[data-server-invite]').forEach((el) => { el.hidden = !hasServer; });
    const years = site.yearsScripting || 6;
    $('#statYears').textContent = years; $('#yearsInline').textContent = years;

    const order = ['patreon', 'kofi', 'tebex', 'shopify', 'fiverr', 'discord', 'youtube', 'github'].filter((k) => links[k]);
    $('#statPlatforms').textContent = order.length;
    const item = (k, track) => `<li><a href="${esc(safeUrl(links[k]))}" target="_blank" rel="noopener" data-track="${k}-${track}">${esc(PLATFORMS[k].name)}<small>${esc(PLATFORMS[k].label)}</small></a><span class="hexdot" aria-hidden="true"></span></li>`;
    const row = order.map((k) => item(k, 'ribbon')).join('');
    $('#ribbon').innerHTML = row + row.replace(/<li>/g, '<li aria-hidden="true">'); // doubled for a seamless loop
    $('#sheetPlats').innerHTML = order.map((k) => `<li><a href="${esc(safeUrl(links[k]))}" target="_blank" rel="noopener" data-track="${k}-menu">${esc(PLATFORMS[k].name)}<small>${esc(PLATFORMS[k].label)}</small></a></li>`).join('');
    $('#footLinks').innerHTML = order.map((k) => `<a href="${esc(safeUrl(links[k]))}" target="_blank" rel="noopener" data-track="${k}-foot">${esc(PLATFORMS[k].name.toLowerCase())}</a>`).join('');
  }

  // Glass hexagon artwork, unique gradient per product
  function productArt(p) {
    if (p.image) return `<img src="${esc(safeUrl(p.image))}" alt="" loading="lazy">`;
    const h = hash(p.slug);
    const c1 = PALETTE[h % 5], c2 = PALETTE[(h >> 3) % 5 === h % 5 ? (h + 2) % 5 : (h >> 3) % 5];
    const id = `g${h}`;
    const hex = (r) => Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 3 * k - Math.PI / 2; return `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`; }).join(' ');
    return `<svg class="glyph" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="${id}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
        <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
      </defs>
      <polygon points="${hex(46)}" fill="url(#${id}a)" opacity=".9"/>
      <polygon points="${hex(46)}" fill="url(#${id}b)" opacity=".55"/>
      <polygon points="${hex(46)}" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="1"/>
      <circle cx="50" cy="50" r="${14 + (h % 6)}" fill="#fff" fill-opacity=".35" stroke="#fff" stroke-opacity=".9"/>
    </svg>`;
  }
  const artBg = (p) => { const h = hash(p.slug + 'bg'); return `linear-gradient(${120 + (h % 90)}deg, ${PALETTE[h % 5]}33, ${PALETTE[(h + 2) % 5]}40)`; };

  // ── Store ──────────────────────────────────────────
  let products = [];
  function renderProducts(filter = 'all') {
    const list = filter === 'all' ? products : products.filter((p) => p.category === filter);
    const fmt = (p) => Number(p.price) > 0 ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: p.currency || 'GBP' }).format(p.price) : 'included';
    $('#products').innerHTML = list.length ? list.map((p, i) => `
      <article class="card glass" style="animation-delay:${i * 60}ms">
        <a class="detail-link" href="${apiOnline ? `/p/${esc(p.slug)}` : esc(safeUrl(p.url))}" aria-label="${esc(p.title)} details"></a>
        <div class="card-art" style="--art:${artBg(p)}">
          <div class="card-tags"><span class="chip">${esc(CAT_LABEL[p.category] || p.category)} · ${esc(p.game)}</span><span class="chip ${p.featured ? 'feat' : ''}">${esc(PLATFORMS[p.platform]?.name || p.platform)}</span></div>
          ${productArt(p)}
        </div>
        <div class="card-body">
          <h3>${esc(p.title)}</h3>
          <p class="sub">${esc(p.subtitle)}</p>
          <p class="desc">${esc(p.description)}</p>
          <div class="card-foot"><span class="price">${esc(fmt(p))}</span><a class="card-go" href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener" data-track="buy-${esc(p.platform)}">get it ↗</a></div>
        </div>
      </article>`).join('') : '<p class="label">nothing here yet. check the roadmap.</p>';
  }
  const thumb = $('.filter-thumb');
  function moveThumb(btn) { thumb.style.width = `${btn.offsetWidth}px`; thumb.style.transform = `translateX(${btn.offsetLeft}px)`; }
  $$('.filters button').forEach((b) => b.addEventListener('click', () => {
    $$('.filters button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    moveThumb(b); renderProducts(b.dataset.filter);
  }));
  addEventListener('resize', () => moveThumb($('.filters [aria-selected="true"]')));

  // ── Showcase compare sliders ───────────────────────
  function renderShowcase(items) {
    if (!items?.length) return;
    $('#showcase').innerHTML = items.map((s) => `
      <article class="cmp-card glass reveal">
        <div class="cmp ${s.demo ? 'demo' : ''}">
          <img class="before" src="${esc(s.before)}" alt="${esc(s.title)} vanilla" loading="lazy">
          <img class="after" src="${esc(s.after)}" alt="${esc(s.title)} with Hex preset" loading="lazy">
          <div class="vignette"></div>
          <span class="cmp-label l">vanilla</span><span class="cmp-label r">hex</span>
          <div class="cmp-handle"></div><div class="cmp-knob" aria-hidden="true">‹ ›</div>
          <input class="cmp-range" type="range" min="0" max="100" value="50" aria-label="Compare ${esc(s.title)} before and after">
        </div>
        <div class="cmp-meta"><strong>${esc(String(s.title).toLowerCase())}</strong><span>${esc(s.game)}${s.demo ? ' · demo image' : ''}</span></div>
      </article>`).join('');
    $$('.cmp').forEach((c) => {
      const range = $('.cmp-range', c);
      const set = (v) => c.style.setProperty('--pos', `${v}%`);
      range.addEventListener('input', () => set(range.value));
      c.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse' && !e.buttons) return;
        const r = c.getBoundingClientRect();
        const v = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
        range.value = v; set(v);
      });
    });
    observeReveal();
  }

  // ── Roadmap ────────────────────────────────────────
  function renderRoadmap(items) {
    if (!items) return;
    const label = { shipped: 'shipped', 'in-progress': 'in development', planned: 'planned', research: 'research' };
    $('#roadmapList').innerHTML = items.map((r) => `
      <li class="rm glass reveal">
        <div class="rm-meta"><span class="status ${esc(r.status)}">${esc(label[r.status] || r.status)}</span><span>${esc(String(r.type).toLowerCase())} · ${esc(r.eta)}</span></div>
        <div><span class="rm-title">${esc(String(r.title).toLowerCase())}</span><span class="rm-notes">${esc(r.notes)}</span></div>
        <div class="rm-bar"><span>${Number(r.progress) || 0}%</span><div class="bar"><b data-w="${Math.max(0, Math.min(100, Number(r.progress) || 0))}"></b></div></div>
      </li>`).join('');
    observeReveal();
    const shipped = items.find((r) => r.status === 'shipped');
    $('#latestRelease').textContent = shipped ? String(shipped.title).toLowerCase() : '…';
  }

  // ── Patreon feed ───────────────────────────────────
  function renderFeed(data) {
    const posts = Array.isArray(data) ? data : data?.posts || [];
    if (data?.source === 'patreon') $('#feedSrc').textContent = 'LIVE';
    $('#feedList').innerHTML = posts.slice(0, 6).map((p) => `
      <a class="post glass reveal" href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener" data-track="patreon-post">
        <div class="post-top"><span>${esc(formatDate(p.date))}</span><span class="${p.public ? '' : 'lock'}">${p.public ? 'public' : 'patrons only'}</span></div>
        <h3>${esc(p.title)}</h3>
        <p>${esc(p.excerpt)}</p>
        <span class="post-go">read on patreon ↗</span>
      </a>`).join('');
    observeReveal();
  }
  const formatDate = (d) => { const t = new Date(d); return isNaN(t) ? '' : t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toLowerCase(); };

  // ── Discord online count ───────────────────────────
  async function discord() {
    const d = await load('/api/discord');
    if (d?.online != null) $('#dcOnline2').insertAdjacentText('beforeend', ` ${d.online} people online in the server right now.`);
  }

  // ── Contact form ───────────────────────────────────
  let csrf = null;
  async function getCsrf() { const d = await load('/api/csrf'); csrf = d?.token || null; }
  $('#contactForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const status = $('#formStatus');
    const btn = $('button[type=submit]', form);
    $$('.field', form).forEach((f) => { f.classList.remove('err'); $('.msg', f)?.remove(); });
    const data = Object.fromEntries(new FormData(form));
    if (!csrf) {
      status.className = 'form-status bad';
      status.innerHTML = `the inbox isn't connected yet. message <b>${esc(discordUser)}</b> on Discord, or <a href="mailto:${esc(siteEmail)}">send an email</a>.`;
      return;
    }
    btn.disabled = true; status.className = 'form-status'; status.textContent = 'sending…';
    try {
      const r = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, csrf }) });
      const out = await r.json().catch(() => ({}));
      if (r.ok) {
        form.reset(); status.className = 'form-status ok'; status.textContent = 'message delivered. expect a reply on Discord or by email.'; getCsrf();
        toast('mission passed', 'your message reached Hex Modifications.');
      } else if (r.status === 429 || r.status === 403) {
        status.className = 'form-status bad'; status.textContent = 'too many messages. take a breather and try again later.';
        wanted.raise(2); toast('wanted level raised', 'too many requests. lie low for a bit.');
      }
      else {
        status.className = 'form-status bad'; status.textContent = (out.error || 'something went wrong.').toLowerCase();
        for (const [k, v] of Object.entries(out.fields || {})) {
          const f = form.elements[k]?.closest('.field');
          if (f) { f.classList.add('err'); f.insertAdjacentHTML('beforeend', `<span class="msg">${esc(v)}</span>`); }
        }
        if (r.status === 400) getCsrf();
      }
    } catch { status.className = 'form-status bad'; status.textContent = `network error. try again, or message ${discordUser} on Discord.`; }
    btn.disabled = false;
  });

  // ── Outbound click analytics ───────────────────────
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-track]');
    if (!a || !apiOnline) return;
    try { navigator.sendBeacon('/api/track', JSON.stringify({ type: 'outbound', target: a.dataset.track })); } catch { /* ignore */ }
  });

  // ── Nav: menu sheet + active section ───────────────
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

  // Scroll progress
  const bar = $('#progBar'), pct = $('#progPct');
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? Math.round((scrollY / max) * 100) : 0;
    bar.style.width = `${p}%`; pct.textContent = `${p}%`;
    if (scrollY < innerHeight * 0.6) $$('.pill a.active').forEach((a) => a.classList.remove('active'));
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // Reveal + progress bars
  const revObs = new IntersectionObserver((ents) => ents.forEach((en) => {
    if (!en.isIntersecting) return;
    en.target.classList.add('in');
    $$('.bar b', en.target).forEach((b) => { b.style.width = `${b.dataset.w}%`; });
    revObs.unobserve(en.target);
  }), { threshold: 0.12 });
  function observeReveal() { $$('.reveal:not(.in)').forEach((el) => revObs.observe(el)); }
  observeReveal();

  // Terminal typing
  const TERM = [
    '<span class="d">~</span> <span class="k">$</span> hextune --profile gaming',
    '<span class="d">[scan]</span> timer resolution ...... 15.6ms <span class="c">→</span> 0.5ms',
    '<span class="d">[scan]</span> background services ... 41 found, 17 non-essential',
    '<span class="d">[net ]</span> dns resolver .......... 38ms <span class="c">→</span> 9ms',
    '<span class="d">[net ]</span> nagle on game ports ... <span class="g">disabled</span>',
    '<span class="d">[snap]</span> restore point ......... <span class="g">created</span>',
    '<span class="g">✓ profile "gaming" applied.</span> run <span class="k">hextune --revert</span> to undo.',
  ];
  new IntersectionObserver(([en], obs) => {
    if (!en.isIntersecting) return;
    obs.disconnect();
    const out = $('#termOut'); let html = '';
    TERM.forEach((line, i) => setTimeout(() => {
      html += line + '\n'; out.innerHTML = html + (i === TERM.length - 1 ? '<span class="caret"></span>' : '');
    }, reduced ? 0 : 380 * i));
  }, { threshold: .3 }).observe($('.terminal'));

  // Count-up
  new IntersectionObserver(([en], obs) => {
    if (!en.isIntersecting) return; obs.disconnect();
    if (reduced) return;
    $$('[data-count]').forEach((el) => {
      const end = Number(el.textContent) || 0;
      const t0 = performance.now();
      const step = (t) => { const k = Math.min(1, (t - t0) / 1200); el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }).observe($('.stats'));

  $('#yr').textContent = new Date().getFullYear();

  // ── Toast: small help box, top-left ────────────────
  let toastTimer;
  function toast(title, body) {
    const el = $('#toast');
    $('#toastTitle').textContent = title; $('#toastBody').textContent = body;
    el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 4200);
  }

  // ── Discord username copy ──────────────────────────
  let discordUser = '001hex';
  let siteEmail = 'hello@hexmodifications.com';
  document.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-copy-discord]')) return;
    try { await navigator.clipboard.writeText(discordUser); toast('username copied', `add ${discordUser} on Discord to get in touch.`); }
    catch { toast(`discord: ${discordUser}`, 'add this username on Discord to get in touch.'); }
  });

  // ── Wanted level (FUGITIVE / LAWYERUP, or spamming the form) ──
  const wanted = (() => {
    const el = $('#wanted');
    const star = '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z"/></svg>';
    el.innerHTML = star.repeat(5);
    let level = 0, decay;
    const render = () => {
      $$('svg', el).forEach((s, i) => s.classList.toggle('lit', i < level));
      el.classList.toggle('on', level > 0);
    };
    const set = (n) => {
      level = Math.max(0, Math.min(5, n)); render();
      clearTimeout(decay); el.classList.remove('flash');
      if (level > 0) decay = setTimeout(() => { el.classList.add('flash'); decay = setTimeout(() => { el.classList.remove('flash'); set(0); }, 4000); }, 16000);
    };
    return { raise: (n = 1) => set(level + n), clear: () => set(0) };
  })();

  // ── Timecycle control: click to skip ahead ─────────
  $('#timecycle').addEventListener('click', () => {
    const p = window.hexTimecycle?.skip();
    if (p) toast(`time skipped to ${p}`, 'reload the page to sync back to your local time.');
  });

  // ── Cheat codes (type them anywhere outside a form field) ──
  const CHEATS = {
    MAKEITRAIN: () => { const r = $('#rain'); const on = !r.classList.contains('on'); r.classList.toggle('on', on); return on ? 'weather: rain' : 'weather: clear'; },
    FUGITIVE: () => { wanted.raise(1); return 'wanted level raised'; },
    LAWYERUP: () => { wanted.clear(); return 'wanted level cleared'; },
    SLOWMO: () => {
      const on = document.body.classList.toggle('slowmo');
      document.getAnimations().forEach((a) => { a.playbackRate = on ? 0.25 : 1; });
      document.dispatchEvent(new CustomEvent('hex:slowmo', { detail: on }));
      return on ? 'slow motion on' : 'slow motion off';
    },
    SKYFALL: () => { document.dispatchEvent(new CustomEvent('hex:model')); scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); return 'new object dropped in'; },
    TIMECYCLE: () => `time skipped to ${window.hexTimecycle?.skip()}`,
  };
  let typed = '';
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.key.length !== 1) return;
    typed = (typed + e.key.toUpperCase()).slice(-12);
    for (const [code, fn] of Object.entries(CHEATS)) {
      if (typed.endsWith(code)) { typed = ''; toast('cheat activated', fn()); break; }
    }
  });

  // ── Go ─────────────────────────────────────────────
  (async () => {
    const [site, prods, road, feed, show] = await Promise.all([
      load('/api/site', 'data/site.json'),
      load('/api/products', 'data/products.json'),
      load('/api/roadmap', 'data/roadmap.json'),
      load('/api/feed', 'data/feed.json'),
      load('/api/showcase', 'data/showcase.json'),
    ]);
    applySite(site);
    products = prods || [];
    $('#statReleases').textContent = products.length;
    renderProducts();
    moveThumb($('.filters [aria-selected="true"]'));
    renderShowcase(show);
    renderRoadmap(road);
    renderFeed(feed);
    discord();
    getCsrf();
  })();
})();

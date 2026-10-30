/* Leonida Files: countdown, click-to-load trailers, search and filter, image lightbox, and ads.
   Everything works without this file (links still go to YouTube and to full-size images); it only adds polish. */
(() => {
  'use strict';
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

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

  // ── trailers load from YouTube only when played ──
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-yt]');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const id = a.dataset.yt;
    if (!/^[\w-]{11}$/.test(id)) return;
    e.preventDefault();
    const f = document.createElement('iframe');
    f.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
    f.title = a.dataset.title || 'GTA VI video';
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.allowFullscreen = true;
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    a.replaceWith(f);
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
    setTimeout(() => el.remove(), 250);
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

  // ── keep the current section visible in the scrolling nav ──
  document.querySelector('.lf-nav [aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'center' });

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

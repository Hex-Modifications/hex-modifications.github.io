/* Monetisation, kept subtle: one support strip (Patreon / Ko-fi) and one clearly labelled ad slot.
   Everything is driven by data/site.json → "monetise", and anything left empty simply doesn't show:
     support.patreon / support.kofi  → the support strip after the latest releases
     adsense.client + adsense.slot   → a responsive Google AdSense unit (needs a custom domain to be approved)
     sponsored: [{ title, text, url, image, cta }] → an affiliate / sponsor card, used when AdSense isn't set
   The AdSense script loads only once the intro has finished and the browser is idle. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const https = (u) => /^https:\/\/[^\s"'<>]+$/.test(u || '');

  function render(site) {
    const m = site?.monetise || {};

    // ── support strip ──
    const sup = m.support || {};
    const kofi = sup.kofi && !https(sup.kofi) ? `https://ko-fi.com/${encodeURIComponent(sup.kofi.replace(/^@/, ''))}` : sup.kofi;
    const links = [[sup.patreon, 'patreon', 'support-patreon'], [kofi, 'ko-fi', 'support-kofi']].filter(([u]) => https(u));
    if (links.length) {
      $('#supportLinks').innerHTML = links.map(([u, name, track], i) =>
        `<a class="btn-pill ${i ? 'glass' : 'dark'}" href="${esc(u)}" target="_blank" rel="noopener" data-track="${track}">${name} ↗</a>`).join('');
      $('#promoSupport').hidden = false;
    }

    // ── ad slot: AdSense if configured, otherwise a sponsor / affiliate card ──
    const ad = m.adsense || {};
    const client = /^ca-pub-\d{10,20}$/.test(ad.client || '') ? ad.client : '';
    const slot = /^\d{6,12}$/.test(String(ad.slot || '')) ? String(ad.slot) : '';
    const sponsor = (m.sponsored || []).filter((s) => s && s.title && https(s.url));
    const box = $('#promoAd'), body = $('#promoBody');
    if (client && slot) {
      body.innerHTML = `<ins class="adsbygoogle" style="display:block" data-ad-client="${esc(client)}" data-ad-slot="${esc(slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
      box.hidden = false;
      whenQuiet(box, () => loadAdSense(client));
    } else if (sponsor.length) {
      const s = sponsor[Math.floor(Math.random() * sponsor.length)];     // rotate when there are several
      $('#promoLabel').textContent = s.label || 'ad · affiliate link';
      body.innerHTML = `<a class="sponsor glass" href="${esc(s.url)}" target="_blank" rel="sponsored noopener" data-track="sponsor">
        ${https(s.image) || /^img\//.test(s.image || '') ? `<img src="${esc(s.image)}" alt="" loading="lazy" decoding="async">` : ''}
        <span class="sponsor-text"><strong>${esc(s.title)}</strong>${s.text ? `<span>${esc(s.text)}</span>` : ''}</span>
        <span class="sponsor-cta">${esc(s.cta || 'take a look')} ↗</span></a>`;
      box.hidden = false;
    }
  }

  // wait until the intro has gone and the browser is idle (Google's consent prompt then appears early,
  // not halfway down the page)
  function whenQuiet(el, fn) {
    const go = () => (window.requestIdleCallback || setTimeout)(fn, { timeout: 2500 });
    if (document.documentElement.classList.contains('splash-on')) {
      new MutationObserver((_, mo) => { if (!document.documentElement.classList.contains('splash-on')) { mo.disconnect(); go(); } })
        .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    } else go();
  }

  function loadAdSense(client) {
    const s = document.createElement('script');
    s.async = true; s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
    s.addEventListener('error', () => { $('#promoAd').hidden = true; });       // blocked by an ad blocker: no empty box
    document.head.appendChild(s);
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { /* ignore */ }
  }

  if (window.hexData) render(window.hexData.site);
  else document.addEventListener('hex:data', () => render(window.hexData?.site), { once: true });
})();

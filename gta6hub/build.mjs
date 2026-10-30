// Builds "GTA 6 Hub", the unofficial GTA VI database by Hex Modifications, into dist/gta6hub/.
// It is its own site (own name, look and navigation) that shares the Hex Modifications GitHub Pages deploy.
// Data (all in gta6hub/data):
//   db.json         facts, each "confirmed" (said or shown by Rockstar) or "reported" (press, store listings, fan identification)
//   images.json     Rockstar's official screenshot pack (→ public/img)        art.json  official artwork & wallpapers (→ public/art)
//   landmarks.json  community-mapped landmarks and their real-life counterparts, from gtadb.org (MIT, see GTADB-LICENSE.txt)
//   leonida-geo.json  Florida geography from Natural Earth (public domain), the stand-in for Leonida until Rockstar's map is out
// Every build also reads Rockstar's YouTube feed, so new GTA VI videos appear in News and Trailers on their own.
// Usage: imported by scripts/build-static.mjs, or on its own: node gta6hub/build.mjs (writes to dist/gta6hub)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BRAND = 'GTA 6 Hub';
const YT_FEED = 'https://www.youtube.com/feeds/videos.xml?channel_id=UC6VcWc1rAoWdBCM0JxrRQ3A';   // Rockstar Games
const BASE = '/gta6hub';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const fmtDate = (d) => new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmtShort = (d) => new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 60);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : (/s$/.test(w) ? 'es' : /y$/.test(w) ? '' : 's')}`.replace(/y$/, n === 1 ? 'y' : 'ies');
const ext = (href, text, cls = '') => `<a${cls ? ` class="${cls}"` : ''} href="${esc(href)}" target="_blank" rel="noopener">${text}</a>`;

const SECTIONS = {
  characters: { label: 'Characters', one: 'character', title: 'GTA 6 Characters: Jason, Lucia and Every Known Character',
    desc: 'Every GTA 6 character: Jason Duval, Lucia Caminos, Cal Hampton, Boobie Ike, Dre\'Quan Priest, the Real Dimez, Raul Bautista, Brian Heder and the new names from the Extended Look, with official art and quotes.',
    intro: 'The people of Leonida, from Rockstar\'s official profiles and artwork, plus the names heard for the first time in the Extended Look.' },
  places: { label: 'Places', one: 'region', title: 'GTA 6 Locations: Vice City, Leonida Keys and Every Region',
    desc: 'Every confirmed GTA 6 region in the state of Leonida: Vice City, the Leonida Keys, Grassrivers, Port Gellhorn, Ambrosia and Mount Kalaga National Park, with official postcards and screenshots.',
    intro: 'Leonida is Rockstar\'s take on modern Florida. These are the six regions on Rockstar\'s official "Visit Leonida" postcards.' },
  vehicles: { label: 'Vehicles', one: 'vehicle', title: 'GTA 6 Vehicles: Every Car, Bike, Boat and Aircraft (90+)',
    desc: 'Every GTA 6 vehicle known so far: Rockstar-confirmed cars like the Grotti Cheetah and Vapid Stanier, plus 80+ cars, bikes, boats and aircraft fans have identified in the trailers, with real-life inspirations.',
    intro: 'Confirmed vehicles come straight from Rockstar. Everything else has been identified by fans in Rockstar\'s official trailers and screenshots, with the real cars they\'re based on.' },
  weapons: { label: 'Weapons', one: 'weapon', title: 'GTA 6 Weapons: Every Confirmed and Spotted Gun',
    desc: 'Every GTA 6 weapon known so far: the Ultimate Edition revolvers and engraved sidearms, plus the shotguns, rifles, SMGs and melee weapons seen in the trailers.',
    intro: 'Edition-exclusive weapons are confirmed by Rockstar. Everything seen only in trailer footage is marked as reported until it\'s officially named.' },
  businesses: { label: 'Businesses', one: 'business', title: 'GTA 6 Businesses, Shops and Clubs',
    desc: 'Every confirmed GTA 6 business and shop: Only Raw Records, the Jack of Hearts, Electric Fang Tattoo, Rideout Customs, Sara\'s Salon, Stock 305 and more.',
    intro: 'Clubs, labels, shops and fronts. Some are part of the story, others come with the Ultimate Edition.' },
};

// main menu (opened from the menu button, Rockstar-style), grouped
const MENU = [
  ['Explore', [['map', 'Map'], ['locations', 'Real-life locations'], ['places', 'Regions'], ['characters', 'Characters'], ['vehicles', 'Vehicles'], ['weapons', 'Weapons'], ['businesses', 'Businesses']]],
  ['Watch & listen', [['trailers', 'Trailers'], ['music', 'Music & radio'], ['artwork', 'Artwork & covers'], ['gallery', 'Screenshots']]],
  ['Guides', [['news', 'News'], ['timeline', 'Timeline'], ['gameplay', 'Gameplay'], ['editions', 'Pre-order guide'], ['faq', 'FAQ'], ['about', 'About']]],
];

export async function buildGta6({ root, dist, siteUrl, site = {}, fetchFeed = true, log = console.log }) {
  const dataDir = path.join(root, 'gta6hub', 'data');
  const read = (n) => JSON.parse(fs.readFileSync(path.join(dataDir, n), 'utf8'));
  const db = read('db.json'), images = read('images.json'), art = read('art.json'), landmarks = read('landmarks.json'), geo = read('leonida-geo.json');
  const imgBy = Object.fromEntries(images.map((i) => [i.slug, i]));
  const artBy = Object.fromEntries(art.map((a) => [a.slug, a]));
  const L = db.links;
  const out = path.join(dist, 'gta6hub');
  const urls = [];
  const now = Date.now();

  // ── ads. Configure in data/site.json → monetise:
  //   adsense: { client: "ca-pub-…", slot: "…" }   (needs a custom domain to be approved)
  //   aads:    { unit: "2412345" }                 (A-ADS: no approval, works on github.io)
  //   adsterra:{ native: "abc123…" }               (Adsterra native banner key; the script host comes from your Adsterra code)
  const M = site.monetise || {};
  const adClient = /^ca-pub-\d{10,20}$/.test(M.adsense?.client || '') ? M.adsense.client : '';
  const adsenseSlot = (kind) => { const v = String(M.adsense?.gta6Slots?.[kind] || M.adsense?.slot || ''); return /^\d{6,12}$/.test(v) ? v : ''; };
  const aads = /^\d{5,9}$/.test(String(M.aads?.unit || '')) ? String(M.aads.unit) : '';
  const adsterra = /^[a-f0-9]{32}$/.test(M.adsterra?.native || '') && /^https:\/\/[a-z0-9.-]+\/?$/.test(M.adsterra?.host || '') ? M.adsterra : null;
  const adsOn = Boolean(adClient || aads || adsterra);
  const sponsors = (M.sponsored || []).filter((s) => s?.title && /^https:\/\//.test(s.url || ''));
  let adCount = 0;
  function adSlot(kind) {
    adCount++;
    const wrap = (inner, label = 'Advertisement') => `<aside class="lf-ad lf-ad-${kind}" aria-label="${label}"><span class="lf-ad-label">${label}</span>${inner}</aside>`;
    if (adClient && adsenseSlot(kind)) return wrap(`<ins class="adsbygoogle" style="display:block" data-ad-client="${esc(adClient)}" data-ad-slot="${esc(adsenseSlot(kind))}" data-ad-format="${kind === 'side' ? 'vertical' : 'auto'}" data-full-width-responsive="true"></ins>`);
    if (adsterra && (kind === 'infeed' || kind === 'side')) return wrap(`<div class="lf-adsterra" data-adsterra="${esc(adsterra.native)}" data-host="${esc(adsterra.host.replace(/\/$/, ''))}"></div>`);
    if (aads) return wrap(`<iframe class="lf-aads" data-aa="${esc(aads)}" src="https://ad.a-ads.com/${esc(aads)}?size=Adaptive" title="Advertisement" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`);
    if (kind === 'leader' && sponsors.length) {
      const s = sponsors[0];
      return wrap(`<a class="lf-sponsor" href="${esc(s.url)}" target="_blank" rel="sponsored noopener"><strong>${esc(s.title)}</strong>${s.text ? `<span>${esc(s.text)}</span>` : ''}<em>${esc(s.cta || 'Take a look')} ↗</em></a>`, esc(s.label || 'Sponsored'));
    }
    return '';
  }

  // ── images ──
  const altFor = (slug) => { const i = imgBy[slug]; return i ? `${i.name}: official GTA VI ${i.kind === 'edition' ? 'artwork' : 'screenshot'}` : 'GTA VI screenshot'; };
  function img(slug, { alt = altFor(slug), eager = false, sizes = '(min-width: 1100px) 33vw, (min-width: 700px) 50vw, 100vw' } = {}) {
    const i = imgBy[slug];
    if (!i) return '';
    return `<img src="${BASE}/img/${slug}-sm.webp" srcset="${BASE}/img/${slug}-sm.webp 640w, ${BASE}/img/${slug}.webp ${i.w}w" sizes="${sizes}" width="${i.w}" height="${i.h}" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
  }
  // official artwork in a given crop (portrait / landscape / ultrawide / square)
  function artImg(slug, v, { alt, eager = false, sizes = '100vw', cls = '' } = {}) {
    const a = artBy[slug], d = a?.v[v];
    if (!d) return '';
    const sm = { landscape: 960, portrait: 520, ultrawide: 1280, square: 560 }[v];
    return `<img${cls ? ` class="${cls}"` : ''} src="${BASE}/art/${slug}-${v}-sm.webp" srcset="${BASE}/art/${slug}-${v}-sm.webp ${sm}w, ${BASE}/art/${slug}-${v}.webp ${d[0]}w" sizes="${sizes}" width="${d[0]}" height="${d[1]}" alt="${esc(alt ?? `${a.title}: official GTA VI artwork`)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
  }
  const ogImage = (slug) => (imgBy[slug] ? `${siteUrl}${BASE}/img/${slug}.webp` : `${siteUrl}${BASE}/art/jason-and-lucia-01-landscape.webp`);
  const ogArt = (slug) => `${siteUrl}${BASE}/art/${slug}-landscape.webp`;
  const badge = (status) => (status === 'confirmed'
    ? '<span class="lf-badge lf-ok" title="Confirmed by Rockstar Games">Confirmed</span>'
    : '<span class="lf-badge lf-rep" title="From press, store listings or fans identifying it in official footage; not confirmed by Rockstar">Reported</span>');
  const credit = `<p class="lf-credit">Artwork and screenshots © Rockstar Games, from the ${ext(L.media, 'official GTA VI media pack')}.</p>`;
  const charArt = { 'boobie-ike': 'boobie-ike', 'brian-heder': 'brian-heder', 'cal-hampton': 'cal-hampton', 'drequan-priest': 'drequan-priest', 'raul-bautista': 'raul-bautista', 'real-dimez': 'real-dimez', 'jason-duval': 'jason-and-lucia-lock-and-load', 'lucia-caminos': 'jason-and-lucia-02' };
  const placeArt = (slug) => (artBy[`${slug}-postcard`] ? `${slug}-postcard` : '');

  // ── videos: the curated list plus any new GTA VI uploads on Rockstar's channel ──
  const videos = db.videos.map((v) => ({ ...v }));
  const known = new Set(videos.map((v) => v.youtube));
  let feed = [];
  if (fetchFeed) {
    try {
      const xml = await (await fetch(YT_FEED, { signal: AbortSignal.timeout(12000) })).text();
      feed = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
        youtube: (e.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/) || [])[1],
        title: decode((e.match(/<title>([^<]*)<\/title>/) || [])[1] || ''),
        date: ((e.match(/<published>([^<]*)<\/published>/) || [])[1] || '').slice(0, 10),
        summary: decode((e.match(/<media:description>([\s\S]*?)<\/media:description>/) || [])[1] || '').split('\n').map((l) => l.replace(/#\w+/g, '').trim()).find((l) => l.length > 20)?.slice(0, 220) || '',
      })).filter((v) => v.youtube && /grand theft auto vi\b|gta vi\b|gta 6\b/i.test(v.title) && /^\d{4}-\d\d-\d\d$/.test(v.date));
    } catch (err) { log(`gta6hub: YouTube feed unavailable (${err.message}), using the saved video list`); }
  }
  // Rockstar often posts several cuts under one title (vertical, regional); one per title is enough,
  // and teasers or clips of a video already listed ("An Extended Look — Now Playing", "... Coming August 27") are skipped
  const byTitle = new Map();
  for (const v of feed) {
    const k = v.title.toLowerCase();
    if (!byTitle.has(k)) byTitle.set(k, []);
    byTitle.get(k).push(v);
  }
  const base = (t) => t.toLowerCase().replace(/^grand theft auto vi:?\s*/, '').replace(/\s+[—–-]\s+.*$/, '').replace(/\s+coming\s.*$/, '').trim();
  const listed = new Set(videos.map((v) => base(v.title)));
  for (const group of byTitle.values()) {
    if (group.some((v) => known.has(v.youtube)) || listed.has(base(group[0].title))) continue;
    const v = group.sort((a, b) => b.date.localeCompare(a.date))[0];
    const title = v.title.replace(/^grand theft auto vi:?\s*/i, '').replace(/\s+—\s+/g, ': ') || v.title;
    videos.push({ slug: `${slugify(title)}-${v.youtube.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6)}`, title, youtube: v.youtube, date: v.date, summary: v.summary || `New from Rockstar Games: ${v.title}.`, fromFeed: true });
    known.add(v.youtube);
  }
  videos.sort((a, b) => b.date.localeCompare(a.date));
  const news = [...db.news, ...videos.filter((v) => v.fromFeed).map((v) => ({ date: v.date, title: `New video: ${v.title}`, summary: v.summary, source: 'Rockstar Games YouTube', video: v.youtube }))]
    .sort((a, b) => b.date.localeCompare(a.date));
  const updated = [db.updated, news[0]?.date].filter(Boolean).sort().pop();
  if (feed.length) log(`gta6hub: ${feed.length} GTA VI videos in Rockstar's feed, ${videos.filter((v) => v.fromFeed).length} new`);
  const videoBy = Object.fromEntries(videos.map((v) => [v.youtube, v]));

  function yt(v, { big = false } = {}) {
    return `<div class="lf-yt${big ? ' lf-yt-big' : ''}">
      <a class="lf-yt-btn" href="https://www.youtube.com/watch?v=${esc(v.youtube)}" data-yt="${esc(v.youtube)}" data-title="${esc(v.title)}" target="_blank" rel="noopener">
        <img src="https://i.ytimg.com/vi/${esc(v.youtube)}/hqdefault.jpg" width="480" height="360" alt="" loading="lazy" decoding="async">
        <span class="lf-play" aria-hidden="true"></span><span class="lf-sr">Play ${esc(v.title)}</span>
      </a></div>`;
  }
  const videoCard = (v) => `<article class="lf-video">${yt(v)}<h3><a href="${BASE}/trailers/${v.slug}/">${esc(v.title)}</a></h3><p>${fmtDate(v.date)}</p></article>`;
  const spotify = (kind, id, label, sub = '', tall = false) => `<div class="lf-spot${tall ? ' lf-spot-tall' : ''}"><button type="button" class="lf-spot-btn" data-spotify="${esc(kind)}/${esc(id)}" data-h="${tall ? 352 : 152}"><span class="lf-spot-ico" aria-hidden="true"></span><span><b>${esc(label)}</b>${sub ? `<em>${esc(sub)}</em>` : ''}<i>Play on Spotify</i></span></button></div>`;

  // ── page shell ──
  const fonts = 'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Big+Shoulders+Display:wght@700;800;900&display=swap';
  const menuArt = ['jason-and-lucia-beach', 'jason-and-lucia-robbery', 'jason-lucia-motel', 'jason-and-lucia-02'];
  function layout({ p, title, desc, image, crumbs = [], body, jsonld = [], section = '', type = 'website', label = '' }) {
    const url = `${siteUrl}${p}`;
    urls.push({ loc: url, lastmod: updated, priority: p === `${BASE}/` ? '0.9' : crumbs.length > 1 ? '0.6' : '0.8' });
    const trail = [[BRAND, `${BASE}/`], ...crumbs];
    const ld = [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: trail.map(([name, href], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${siteUrl}${href}` })) }, ...jsonld];
    const frames = ['https://www.youtube-nocookie.com', 'https://open.spotify.com', ...(aads ? ['https://ad.a-ads.com'] : [])].join(' ');
    const csp = adClient || adsterra
      ? `default-src 'self'; script-src 'self' https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https:; frame-src https:; media-src 'none'; base-uri 'self'; form-action 'none'; object-src 'none'`
      : `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://i.ytimg.com; connect-src 'self'; frame-src ${frames}; media-src 'none'; base-uri 'self'; form-action 'none'; object-src 'none'`;
    const sectionLabel = label || MENU.flatMap(([, l]) => l).find(([s]) => s === section)?.[1] || '';
    return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#1d1d35">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:locale" content="en_GB">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<link rel="icon" href="${BASE}/icon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fonts}">
<link rel="stylesheet" href="${BASE}/gta6.css">
<script src="${BASE}/gta6.js" defer></script>
<script type="application/ld+json">${json(ld.length === 1 ? ld[0] : ld)}</script>
</head>
<body${section ? ` data-section="${section}"` : ''}>
<a class="lf-skip" href="#main">Skip to content</a>
<canvas class="lf-liquid" aria-hidden="true"></canvas>
<header class="lf-head">
  <a class="lf-brand" href="${BASE}/" aria-label="${BRAND} home"><span class="lf-logo">GTA<b>6</b></span><span class="lf-logo-hub">Hub</span></a>
  ${sectionLabel ? `<span class="lf-head-sec">${esc(sectionLabel)}</span>` : ''}
  <nav class="lf-quicknav" aria-label="Popular">${[['map', 'Map'], ['characters', 'Characters'], ['vehicles', 'Vehicles'], ['trailers', 'Trailers'], ['news', 'News']].map(([s, l]) => `<a href="${BASE}/${s}/"${s === section ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
  <a class="lf-pill" href="${BASE}/editions/">Pre-Order Guide</a>
  <button class="lf-menu-btn" type="button" aria-expanded="false" aria-controls="lf-menu"><span class="lf-sr">Menu</span><i></i><i></i></button>
</header>
<div class="lf-menu" id="lf-menu" hidden>
  <div class="lf-menu-art" aria-hidden="true">${artImg(menuArt[urls.length % menuArt.length], 'portrait', { alt: '', sizes: '40vw' })}</div>
  <nav class="lf-menu-nav" aria-label="Site">
    ${MENU.map(([h, links]) => `<div><p class="lf-menu-h">${h}</p>${links.map(([s, l]) => `<a href="${BASE}/${s}/"${s === section ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</div>`).join('')}
    <a class="lf-by" href="/"><img src="${BASE}/hex-logo.webp" width="40" height="40" alt="" loading="lazy"><span>A Hex Modifications site</span></a>
  </nav>
</div>
${crumbs.length ? `<nav class="lf-crumbs" aria-label="Breadcrumb"><ol>${trail.map(([n, h], i) => (i === trail.length - 1 ? `<li aria-current="page">${esc(n)}</li>` : `<li><a href="${h}">${esc(n)}</a></li>`)).join('')}</ol></nav>` : ''}
<main id="main">
${body}
${adSlot('foot')}
</main>
<footer class="lf-foot">
  <div class="lf-foot-grid">
    <div class="lf-foot-about">
      <a class="lf-brand" href="${BASE}/"><span class="lf-logo">GTA<b>6</b></span><span class="lf-logo-hub">Hub</span></a>
      <p>Everything about Grand Theft Auto VI in one place: the map, the people, the cars, the music and the news, checked every day.</p>
      <a class="lf-by" href="/"><img src="${BASE}/hex-logo.webp" width="40" height="40" alt="" loading="lazy"><span>A Hex Modifications site</span></a>
    </div>
    ${MENU.map(([h, links]) => `<nav aria-label="${h}"><p class="lf-foot-h">${h}</p>${links.map(([s, l]) => `<a href="${BASE}/${s}/">${l}</a>`).join('')}</nav>`).join('\n    ')}
    <nav aria-label="Official"><p class="lf-foot-h">Official</p>${ext(L.official, 'Rockstar: GTA VI')}${ext(L.newswire, 'Rockstar Newswire')}${ext(L.youtube, 'Rockstar on YouTube')}${ext(L.spotify, 'GTA VI on Spotify')}${ext(L.store, 'Rockstar Store')}</nav>
  </div>
  <p class="lf-legal">GTA 6 Hub is an unofficial fan site, not affiliated with Rockstar Games or Take-Two Interactive. Grand Theft Auto and all related names and trademarks belong to their owners. Artwork and screenshots © Rockstar Games. Landmark data from ${ext(L.gtadb, 'gtadb.org')} (MIT licence). Map geography from Natural Earth. <em>Reported</em> entries come from press or fan sightings, not Rockstar.</p>
  <p class="lf-legal">Last updated ${fmtDate(updated)} · <a href="/sitemap.xml">Sitemap</a> · <a href="${BASE}/about/">About</a></p>
</footer>
</body>
</html>
`;
  }
  function write(p, html) {
    const file = path.join(out, p, 'index.html');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html);
  }
  const head = (kicker, h1, lede, extra = '') => `<header class="lf-pagehead"><p class="lf-kicker">${kicker}</p><h1 class="lf-display">${h1}</h1>${lede ? `<p class="lf-lede">${lede}</p>` : ''}${extra}</header>`;
  // a full-width artwork banner page header, the way Rockstar's pages open
  const bannerHead = (artSlug, kicker, h1, lede, v = 'ultrawide') => `<header class="lf-banner">${artImg(artSlug, artBy[artSlug]?.v[v] ? v : 'landscape', { alt: '', eager: true })}<div class="lf-banner-copy"><p class="lf-kicker">${kicker}</p><h1 class="lf-display">${h1}</h1>${lede ? `<p class="lf-lede">${lede}</p>` : ''}</div></header>`;
  const sechead = (id, h, more = '') => `<div class="lf-sechead"><h2 class="lf-h2" id="${id}">${h}</h2>${more}</div>`;
  const more = (href, text) => `<a class="lf-more" href="${href}">${text} <span aria-hidden="true">→</span></a>`;
  const days = Math.max(0, Math.ceil((Date.parse(`${db.game.release}T00:00:00Z`) - now) / 864e5));

  // ── cross-links between entries ──
  const entryUrl = (sec, e) => `${BASE}/${sec}/${e.slug}/`;
  const all = Object.keys(SECTIONS).flatMap((sec) => db[sec].map((e) => ({ sec, e })));
  const first = (e) => e.name.split(/[\s']/)[0].replace(/[^\w]/g, '');
  function related(sec, e) {
    const text = `${e.summary} ${(e.facts || []).join(' ')}`.toLowerCase();
    return all.filter(({ sec: s, e: o }) => o !== e && (
      (s === 'characters' && first(o).length > 3 && text.includes(first(o).toLowerCase())) ||
      (sec === 'characters' && `${o.summary} ${o.name}`.toLowerCase().includes(first(e).toLowerCase()) && first(e).length > 3) ||
      (s === 'businesses' && text.includes(o.name.toLowerCase()))
    )).slice(0, 6);
  }
  const sourceLink = (sec, e) => {
    if (e.status !== 'confirmed') return '';
    if (sec === 'characters' || sec === 'places') return L.people;
    if (/ultimate/i.test(e.where || '')) return L.ultimate;
    return L.official;
  };

  // ── cards ──
  function cardMedia(sec, e) {
    if (sec === 'characters' && charArt[e.slug] && e.status === 'confirmed' && !e.slug.startsWith('jason') && !e.slug.startsWith('lucia')) return artImg(charArt[e.slug], 'portrait', { alt: `${e.name}: official GTA VI artwork`, sizes: '(min-width: 1100px) 25vw, 50vw' });
    if (sec === 'places' && placeArt(e.slug)) return artImg(placeArt(e.slug), 'landscape', { alt: `${e.name} postcard: official GTA VI artwork`, sizes: '(min-width: 1100px) 33vw, 100vw' });
    if (e.images?.[0]) return img(e.images[0]);
    return `<span class="lf-ph"><span>${esc(e.type || SECTIONS[sec].one)}</span></span>`;
  }
  function card(sec, e) {
    const meta = sec === 'characters' ? e.role : sec === 'places' ? (e.inspiration ? `Inspired by ${e.inspiration}` : 'Region of Leonida') : [e.brand !== '—' ? e.brand : '', e.type].filter(Boolean).join(' · ');
    const q = [e.name, e.aka, e.role, e.brand, e.type, e.where, e.inspiration].filter(Boolean).join(' ').toLowerCase();
    return `<a class="lf-card" href="${entryUrl(sec, e)}" data-status="${e.status}" data-type="${esc(slugify(e.type || ''))}" data-q="${esc(q)}">
      <span class="lf-card-media${sec === 'characters' ? ' lf-portrait' : ''}">${cardMedia(sec, e)}</span>
      <span class="lf-card-body">${badge(e.status)}<span class="lf-card-title">${esc(e.name)}</span>${meta ? `<span class="lf-card-meta">${esc(meta)}</span>` : ''}${sec === 'vehicles' && e.inspiration ? `<span class="lf-card-insp">${esc(e.inspiration)}</span>` : ''}</span>
    </a>`;
  }
  function grid(sec, list, { filter = false, adEvery = 0, types = false } = {}) {
    const items = list.map((e, i) => card(sec, e) + (adEvery && (i + 1) % adEvery === 0 && i < list.length - 1 ? adSlot('infeed') : ''));
    const counts = { confirmed: list.filter((e) => e.status === 'confirmed').length, reported: list.filter((e) => e.status !== 'confirmed').length };
    const typeList = types ? [...new Set(list.map((e) => e.type).filter(Boolean))] : [];
    const group = (t) => (/police|helicopter|jet|aircraft|seaplane|duster|airliner/i.test(t) ? 'Air & emergency' : /boat|ski|kayak|sail|yacht|airboat/i.test(t) ? 'Boats' : /bike|chopper|scooter|bicycle|atv|bmx/i.test(t) ? 'Bikes' : /suv|pickup|truck|van|off-road|buggy|utility/i.test(t) ? 'Trucks & off-road' : /sedan|service|compact|coupe/i.test(t) ? 'Sedans & coupes' : /muscle/i.test(t) ? 'Muscle' : 'Sports & super');
    const groups = types ? [...new Set(typeList.map(group))] : [];
    const bar = filter ? `<div class="lf-tools" data-filter-for="g-${sec}">
      <label class="lf-search"><span class="lf-sr">Search ${SECTIONS[sec].label.toLowerCase()}</span><input type="search" placeholder="Search ${plural(list.length, SECTIONS[sec].one)}" autocomplete="off" data-filter-q></label>
      <div class="lf-chips" role="group" aria-label="Filter by status"><button type="button" aria-pressed="true" data-filter-s="all">All <b>${list.length}</b></button><button type="button" aria-pressed="false" data-filter-s="confirmed">Confirmed <b>${counts.confirmed}</b></button>${counts.reported ? `<button type="button" aria-pressed="false" data-filter-s="reported">Reported <b>${counts.reported}</b></button>` : ''}</div>
      ${groups.length > 1 ? `<div class="lf-chips lf-chips-types" role="group" aria-label="Filter by type"><button type="button" aria-pressed="true" data-filter-g="">Every type</button>${groups.map((g) => `<button type="button" aria-pressed="false" data-filter-g="${esc(slugify(g))}">${esc(g)}</button>`).join('')}</div>` : ''}
    </div>` : '';
    const tagged = types ? items.map((h, i) => h.replace('<a class="lf-card"', `<a class="lf-card" data-group="${esc(slugify(group(list[i]?.type || '')))}"`)) : items;
    return `${bar}<div class="lf-grid${sec === 'characters' ? ' lf-grid-people' : ''}" id="g-${sec}">${tagged.join('')}</div>${filter ? '<p class="lf-empty" hidden>Nothing matches that yet. New entries are added as soon as they\'re revealed.</p>' : ''}`;
  }
  const itemList = (sec, list) => ({ '@context': 'https://schema.org', '@type': 'ItemList', name: SECTIONS[sec].title, numberOfItems: list.length,
    itemListElement: list.map((e, i) => ({ '@type': 'ListItem', position: i + 1, url: `${siteUrl}${entryUrl(sec, e)}`, name: e.name })) });
  const videoLd = (v) => ({ '@context': 'https://schema.org', '@type': 'VideoObject', name: `Grand Theft Auto VI: ${v.title}`, description: v.summary,
    uploadDate: `${v.date}T12:00:00+00:00`, thumbnailUrl: `https://i.ytimg.com/vi/${v.youtube}/hqdefault.jpg`, embedUrl: `https://www.youtube-nocookie.com/embed/${v.youtube}`,
    contentUrl: `https://www.youtube.com/watch?v=${v.youtube}`, publisher: { '@type': 'Organization', name: 'Rockstar Games' } });
  const gameLd = { '@context': 'https://schema.org', '@type': 'VideoGame', name: db.game.title, alternateName: ['GTA 6', 'GTA VI'],
    author: { '@type': 'Organization', name: db.game.developer }, publisher: { '@type': 'Organization', name: 'Rockstar Games' },
    datePublished: db.game.release, gamePlatform: db.game.platforms, genre: ['Action-adventure', 'Open world'], playMode: 'SinglePlayer',
    image: ogArt('official-cover-art'), url: L.official, characters: db.characters.filter((c) => c.status === 'confirmed').slice(0, 8).map((c) => ({ '@type': 'Person', name: c.name })) };
  function newsItem(n) {
    return `<li class="lf-newsitem"><time datetime="${esc(n.date)}">${fmtDate(n.date)}</time><h3>${esc(n.title)}</h3><p>${esc(n.summary)}</p><p class="lf-src">${esc(n.source)}${n.video ? ` · <a href="https://www.youtube.com/watch?v=${esc(n.video)}" target="_blank" rel="noopener">Watch ↗</a>` : ''}</p></li>`;
  }
  const faqItem = (f) => `<details class="lf-q"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`;

  // ── landmarks (real-life locations), grouped by in-game area ──
  const areaSlug = (a) => slugify(a);
  const areas = [...landmarks.reduce((m, l) => m.set(l.area, [...(m.get(l.area) || []), l]), new Map())].sort((a, b) => b[1].length - a[1].length);
  const gmaps = (l) => `https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}`;
  const lmRow = (l) => `<li class="lf-lm" data-q="${esc(`${l.name} ${l.district} ${l.area} ${l.real}`.toLowerCase())}"><div><b>${esc(l.name)}</b><span>${esc([l.street, l.district, l.area].filter(Boolean).join(', '))}</span></div><div class="lf-lm-real"><i>Real life</i><span>${esc(l.real.split(',')[0])}</span><em>${esc(l.real.split(',').slice(1, 3).join(',').trim())}</em></div><div class="lf-lm-act"><a href="${BASE}/map/#lm-${esc(l.id)}">Map</a>${ext(gmaps(l), 'Real place ↗')}</div></li>`;

  // ── projection for the map (same maths as the Natural Earth export) ──
  const project = (lng, lat) => [+((lng - geo.proj.w) * geo.proj.c * geo.proj.k).toFixed(1), +((geo.proj.n - lat) * geo.proj.k).toFixed(1)];
  const REGION_LL = { 'vice-city': [-80.2, 25.79], 'leonida-keys': [-81.15, 24.72], grassrivers: [-80.95, 25.6], 'port-gellhorn': [-85.66, 30.17], ambrosia: [-81.15, 26.85], 'mount-kalaga-national-park': [-81.75, 29.2] };
  const POI_LL = { 'Vice City sign': [-80.21, 25.81], 'Ocean View Hotel': [-80.13, 25.78], 'Jack of Hearts': [-80.23, 25.76], 'Only Raw Records': [-80.2, 25.83], "Brian's boat yard": [-80.62, 24.93], "Jason's place": [-81.36, 24.67], 'Starlet Motel': [-85.74, 30.19] };

  // ═════════════ home ═════════════
  const latest = videos[0];
  const upcoming = db.timeline.filter((t) => Date.parse(`${t.date}T23:59:59Z`) >= now).slice(0, 3);
  const jason = db.characters.find((c) => c.slug === 'jason-duval'), lucia = db.characters.find((c) => c.slug === 'lucia-caminos');
  const cast = db.characters.filter((c) => c.status === 'confirmed' && charArt[c.slug] && !/^(jason|lucia)/.test(c.slug));
  const showcaseLm = ['Ocean View Hotel', 'Dominion Hotel', 'Vice Museum of Art', 'Vice Beach Marina', 'Bobby Hurricane\'s', 'Hotel Neptune'].map((n) => landmarks.find((l) => l.name === n)).filter(Boolean);
  const vehShow = db.vehicles.filter((v) => v.images?.length).slice(0, 8);
  const characterFeature = (c, shot, quoteLine, artSlug, flip) => `
<section class="lf-feature${flip ? ' lf-flip' : ''}" aria-labelledby="f-${c.slug}">
  <div class="lf-feature-shot">${img(shot, { sizes: '100vw' })}<p class="lf-bigquote" aria-hidden="true">“${esc(quoteLine)}”</p></div>
  <div class="lf-feature-body">
    <div class="lf-feature-copy">
      <h2 class="lf-pinkhead" id="f-${c.slug}">${esc(c.name)}</h2>
      <p class="lf-feature-quote">${esc(c.quote)}</p>
      <p>${esc(c.summary)}</p>
      ${more(entryUrl('characters', c), `More on ${first(c)}`)}
    </div>
    <div class="lf-feature-stack">${c.images.slice(1, 3).map((s) => `<a href="${BASE}/img/${s}.webp" data-lb="f-${c.slug}">${img(s, { sizes: '(min-width: 1000px) 30vw, 50vw' })}</a>`).join('')}</div>
    ${artSlug ? `<a class="lf-feature-art" href="${BASE}/art/${artSlug}-portrait.webp" data-lb="f-${c.slug}">${artImg(artSlug, 'portrait', { sizes: '(min-width: 1000px) 22vw, 60vw' })}</a>` : ''}
  </div>
</section>`;
  write('', layout({
    p: `${BASE}/`, title: 'GTA 6 Hub: Map, Characters, Cars, Trailers, Music & Release Date',
    desc: `Everything about GTA 6 in one place: the ${fmtDate(db.game.release)} release date, an interactive Leonida map with ${landmarks.length} real-life locations, every character and ${db.vehicles.length} vehicles, official artwork, trailers, music and daily news.`,
    image: ogArt('jason-and-lucia-01'),
    jsonld: [{ '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND, alternateName: ['GTA6 Hub', 'GTA VI Hub'], url: `${siteUrl}${BASE}/`, publisher: { '@type': 'Organization', name: 'Hex Modifications', url: `${siteUrl}/` } }, gameLd],
    body: `
<section class="lf-hero">
  <picture class="lf-hero-media"><source media="(max-width: 700px)" srcset="${BASE}/art/jason-and-lucia-01-portrait.webp">${artImg('jason-and-lucia-01', 'ultrawide', { alt: 'Jason Duval and Lucia Caminos: official GTA VI key art', eager: true })}</picture>
  <div class="lf-hero-copy">
    <p class="lf-kicker">Grand Theft Auto VI · Coming</p>
    <h1 class="lf-display lf-hero-title">November 19, 2026</h1>
    <p class="lf-hero-plat">PlayStation 5 · Xbox Series X|S</p>
    <div class="lf-count" data-release="${db.game.release}">
      <div class="lf-count-units"><span><b data-u="d">${days}</b><i>days</i></span><span><b data-u="h">--</b><i>hrs</i></span><span><b data-u="m">--</b><i>min</i></span><span><b data-u="s">--</b><i>sec</i></span></div>
      <p class="lf-count-label">Until launch in your time zone</p>
    </div>
    <div class="lf-cta"><a class="lf-btn" href="${BASE}/trailers/${latest.slug}/"><span class="lf-btn-play" aria-hidden="true"></span>Watch the ${esc(latest.title)}</a><a class="lf-btn lf-ghost" href="${BASE}/map/">Explore the map</a></div>
  </div>
</section>
<section class="lf-intro">
  <h2 class="lf-pinkhead">Vice City, USA.</h2>
  <p>Jason and Lucia have always known the deck is stacked against them. When an easy score goes wrong, they end up on the darkest side of the sunniest place in America, caught in a criminal conspiracy that stretches across the state of Leonida.</p>
  <nav class="lf-quick" aria-label="Jump to">${[['map', `Map · ${landmarks.length + db.map.pois.length} places`], ['characters', `${db.characters.length} characters`], ['vehicles', `${db.vehicles.length} vehicles`], ['artwork', `${art.length} artworks`], ['gallery', `${images.length} screenshots`], ['music', 'Soundtrack'], ['timeline', 'Timeline']].map(([s, l]) => `<a href="${BASE}/${s}/">${l}</a>`).join('')}</nav>
</section>
${adSlot('leader')}
${characterFeature(jason, 'jason-duval-04', 'If anything happens, I\'m right behind you.', 'jason-and-lucia-lock-and-load', false)}
${characterFeature(lucia, 'lucia-caminos-06', 'Only smart moves from here.', 'jason-and-lucia-02', true)}
<section class="lf-section" aria-labelledby="cast-h">
  ${sechead('cast-h', 'Only in Leonida', more(`${BASE}/characters/`, `All ${db.characters.length} characters`))}
  <div class="lf-rail" tabindex="0" aria-label="Characters">${cast.map((c) => `<a class="lf-poster" href="${entryUrl('characters', c)}">${artImg(charArt[c.slug], 'portrait', { alt: `${c.name}: official GTA VI artwork`, sizes: '300px' })}<span><b>${esc(c.name)}</b><i>${esc(c.quote)}</i></span></a>`).join('')}</div>
</section>
<section class="lf-section lf-split" aria-labelledby="news-h">
  <div>
    ${sechead('news-h', 'Latest news', more(`${BASE}/news/`, 'All news'))}
    <ol class="lf-news lf-news-list">${news.slice(0, 4).map(newsItem).join('')}</ol>
  </div>
  <aside class="lf-upnext" aria-labelledby="up-h">
    <h2 class="lf-h3" id="up-h">Coming up</h2>
    <ol class="lf-tl lf-tl-mini">${upcoming.map((t) => `<li><time datetime="${t.date}">${fmtShort(t.date)}</time><b>${esc(t.title)}</b></li>`).join('')}</ol>
    ${more(`${BASE}/timeline/`, 'Full timeline')}
  </aside>
</section>
${adSlot('infeed')}
<section class="lf-section" aria-labelledby="map-h">
  <a class="lf-mapteaser" href="${BASE}/map/">
    ${artImg('vice-city-postcard', 'ultrawide', { alt: '', sizes: '100vw' })}
    <span class="lf-mapteaser-copy"><span class="lf-kicker">Interactive map</span><span class="lf-h2" id="map-h">Welcome to Leonida</span><span class="lf-mapteaser-text">Six regions, ${landmarks.length} community-mapped landmarks and the real places they're based on. Search, zoom and tap anything.</span><span class="lf-btn">Open the map</span></span>
  </a>
</section>
<section class="lf-section" aria-labelledby="real-h">
  ${sechead('real-h', 'GTA 6 in real life', more(`${BASE}/locations/`, `All ${landmarks.length} locations`))}
  <div class="lf-reallife">${showcaseLm.map((l) => `<a class="lf-rl" href="${BASE}/locations/${areaSlug(l.area)}/#lm-${esc(l.id)}"><span class="lf-rl-game"><i>In game</i><b>${esc(l.name)}</b><em>${esc([l.district, l.area].filter(Boolean).join(', '))}</em></span><span class="lf-rl-arrow" aria-hidden="true">⇄</span><span class="lf-rl-real"><i>Real life</i><b>${esc(l.real.split(',')[0])}</b><em>${esc(l.real.split(',').slice(1, 3).join(',').trim())}</em></span></a>`).join('')}</div>
  <p class="lf-src">Landmark matches by the GTA VI mapping community via ${ext(L.gtadb, 'gtadb.org')}.</p>
</section>
<section class="lf-section" aria-labelledby="places-h">
  ${sechead('places-h', 'Visit Leonida', more(`${BASE}/places/`, 'All regions'))}
  <div class="lf-postcards">${db.places.map((p) => `<a class="lf-postcard" href="${entryUrl('places', p)}">${artImg(placeArt(p.slug), 'landscape', { alt: `${p.name} postcard: official GTA VI artwork`, sizes: '(min-width: 1000px) 33vw, 100vw' })}<span>${esc(p.name)}</span></a>`).join('')}</div>
</section>
<section class="lf-section" aria-labelledby="veh-h">
  ${sechead('veh-h', 'Vehicles', more(`${BASE}/vehicles/`, `All ${db.vehicles.length}`))}
  <div class="lf-rail lf-rail-wide" tabindex="0" aria-label="Vehicles">${vehShow.map((v) => `<a class="lf-railcard" href="${entryUrl('vehicles', v)}">${img(v.images[0], { sizes: '420px' })}<span>${badge(v.status)}<b>${esc(v.name)}</b><i>${esc(v.type)}</i></span></a>`).join('')}</div>
</section>
<section class="lf-section" aria-labelledby="tr-h">
  ${sechead('tr-h', 'Trailers', more(`${BASE}/trailers/`, `All ${videos.length}`))}
  <div class="lf-videos">${videos.slice(0, 3).map(videoCard).join('')}</div>
</section>
${adSlot('infeed')}
<section class="lf-section" aria-labelledby="art-h">
  ${sechead('art-h', 'Official artwork', more(`${BASE}/artwork/`, `All ${art.length}`))}
  <div class="lf-artwall">${['official-cover-art', 'the-album-cover-art', 'real-dimez', 'jason-and-lucia-beach', 'cal-hampton', 'raul-bautista'].map((s) => `<a href="${BASE}/art/${s}-portrait.webp" data-lb="home-art">${artImg(s, 'portrait', { sizes: '(min-width: 1000px) 16vw, 33vw' })}</a>`).join('')}</div>
</section>
<section class="lf-section" aria-labelledby="mu-h">
  ${sechead('mu-h', 'Soundtrack', more(`${BASE}/music/`, 'Music &amp; radio'))}
  <div class="lf-spots">${db.music.spotify.tracks.slice(0, 6).map((t) => spotify(t.type, t.id, t.song, t.artist)).join('')}</div>
</section>
<section class="lf-section" aria-labelledby="faq-h">
  ${sechead('faq-h', 'Quick answers', more(`${BASE}/faq/`, 'All questions'))}
  <div class="lf-faq">${db.faq.slice(0, 5).map(faqItem).join('')}</div>
</section>
${credit}`,
  }));

  // ═════════════ database sections ═════════════
  const listHero = { characters: ['jason-and-lucia-robbery', 'ultrawide'], places: ['leonida-keys-postcard', 'ultrawide'], vehicles: ['jason-and-lucia-01', 'ultrawide'], weapons: ['jason-and-lucia-lock-and-load', 'ultrawide'], businesses: ['boobie-ike', 'ultrawide'] };
  for (const [sec, cfg] of Object.entries(SECTIONS)) {
    const list = sec === 'vehicles' ? [...db[sec]].sort((a, b) => (a.status === b.status ? 0 : a.status === 'confirmed' ? -1 : 1)) : db[sec];
    const extra = sec === 'characters'
      ? `<aside class="lf-note"><b>Voice cast:</b> ${esc(db.cast.note)}</aside>`
      : sec === 'places' ? `<aside class="lf-note"><b>Want street-level detail?</b> <a href="${BASE}/map/">Open the interactive map</a> or browse <a href="${BASE}/locations/">${landmarks.length} real-life locations</a>.</aside>`
      : sec === 'vehicles' ? `<aside class="lf-note"><b>${db.vehicles.filter((v) => v.status === 'confirmed').length} confirmed by Rockstar, ${db.vehicles.filter((v) => v.status !== 'confirmed').length} identified by fans</b> in Rockstar's trailers and screenshots. Rockstar hasn't published a full vehicle list.</aside>` : '';
    const [hs, hv] = listHero[sec];
    write(sec, layout({
      p: `${BASE}/${sec}/`, title: `${cfg.title} | ${BRAND}`, desc: cfg.desc, section: sec,
      image: ogArt(hs), crumbs: [[cfg.label, `${BASE}/${sec}/`]], jsonld: [itemList(sec, list)],
      body: `${bannerHead(hs, `GTA VI · ${plural(list.length, cfg.one)}`, `GTA 6 ${cfg.label}`, cfg.intro, hv)}
${adSlot('leader')}
<section class="lf-section lf-tight">${extra}${grid(sec, list, { filter: true, adEvery: sec === 'vehicles' ? 12 : 6, types: sec === 'vehicles' })}</section>
${credit}`,
    }));

    list.forEach((e, idx) => {
      const others = list.filter((o) => o !== e && o.status === e.status).slice(0, 6);
      const src = sourceLink(sec, e);
      const rows = [
        ['Status', e.status === 'confirmed' ? 'Confirmed by Rockstar Games' : 'Reported, not confirmed by Rockstar'],
        ...(e.aka ? [[sec === 'characters' ? 'Members' : 'Details', e.aka]] : []),
        ...(e.role ? [['Role', e.role]] : []), ...(e.brand && e.brand !== '—' ? [['Manufacturer', e.brand]] : []), ...(e.type ? [['Type', e.type]] : []),
        ...(sec === 'vehicles' && e.inspiration ? [['Based on', `${e.inspiration} (fan comparison)`]] : []),
        ...(e.where ? [['Where it appears', e.where]] : []), ...(sec === 'places' && e.inspiration ? [['Real-world inspiration', `${e.inspiration} (fan consensus)`]] : []),
      ];
      const sourceText = e.source || (e.status === 'confirmed' ? 'Rockstar Games, official GTA VI site and media' : 'Press reports');
      const artSlug = sec === 'characters' ? charArt[e.slug] : sec === 'places' ? placeArt(e.slug) : '';
      const [hero, ...rest] = e.images || [];
      const lines = (e.lines || []).filter((l) => l !== e.quote);
      const rel = related(sec, e);
      const lms = sec === 'places' ? landmarks.filter((l) => regionOf(l) === e.slug).slice(0, 12) : [];
      const title = sec === 'characters' ? `${e.name} in GTA 6: Bio, Quotes and Artwork` : sec === 'places' ? `${e.name} in GTA 6: Location Guide, Landmarks and Postcard` : sec === 'vehicles' ? `${e.name} in GTA 6${e.inspiration ? `: ${e.inspiration.replace(/^Modelled on /, '')}` : ''}` : `${e.name} in GTA 6`;
      const desc = `${e.summary} ${e.status === 'confirmed' ? 'Confirmed by Rockstar Games.' : 'Reported, not yet confirmed by Rockstar.'}`.slice(0, 300);
      const prev = list[(idx - 1 + list.length) % list.length], next = list[(idx + 1) % list.length];
      const heroHtml = artSlug && (sec === 'places' || !/^(jason|lucia)/.test(e.slug))
        ? `<figure class="lf-entry-hero"><a href="${BASE}/art/${artSlug}-landscape.webp" data-lb="${esc(e.slug)}">${artImg(artSlug, 'landscape', { eager: true, sizes: '(min-width: 1100px) 66vw, 100vw' })}</a></figure>`
        : hero ? `<figure class="lf-entry-hero"><a href="${BASE}/img/${hero}.webp" data-lb="${esc(e.slug)}">${img(hero, { eager: true, sizes: '(min-width: 1100px) 66vw, 100vw' })}</a></figure>`
        : `<div class="lf-entry-hero lf-ph lf-ph-big"><span>${esc(e.type || cfg.one)}</span></div>`;
      const shots = [...(artSlug && hero && heroHtml.includes('/art/') ? [hero] : []), ...rest];
      write(`${sec}/${e.slug}`, layout({
        p: entryUrl(sec, e), title: `${title} | ${BRAND}`, desc, section: sec, type: 'article', image: artSlug ? ogArt(artSlug) : ogImage(hero),
        crumbs: [[cfg.label, `${BASE}/${sec}/`], [e.name, entryUrl(sec, e)]],
        jsonld: [{ '@context': 'https://schema.org', '@type': 'WebPage', name: `${e.name} (GTA 6)`, description: e.summary, url: `${siteUrl}${entryUrl(sec, e)}`, dateModified: updated, about: { '@type': 'VideoGame', name: db.game.title } }],
        body: `<article class="lf-entry">
  <div class="lf-entry-main">
    ${heroHtml}
    <header class="lf-entry-head">${badge(e.status)}<p class="lf-kicker">GTA VI ${esc(cfg.one)}</p><h1 class="lf-display">${esc(e.name)}</h1>${e.quote ? `<p class="lf-quote">“${esc(e.quote)}”</p>` : ''}</header>
    <p class="lf-lede">${esc(e.summary)}</p>
    <div class="lf-actions">${src ? ext(src, 'Official page ↗', 'lf-more') : ''}${sec === 'places' ? more(`${BASE}/map/#${e.slug}`, 'See on the map') : ''}${sec === 'places' ? more(`${BASE}/locations/`, 'Real-life locations') : ''}${/ultimate|vintage|pre-order/i.test(e.where || '') ? more(`${BASE}/editions/`, 'Pre-order guide') : ''}</div>
    ${adSlot('infeed')}
    <dl class="lf-table">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}<div><dt>Source</dt><dd>${src ? ext(src, esc(sourceText)) : esc(sourceText)}</dd></div></dl>
    ${lines.length ? `<h2 class="lf-h3">In their own words</h2><ul class="lf-lines">${lines.map((l) => `<li>“${esc(l)}”</li>`).join('')}</ul><p class="lf-src">Lines from Rockstar's official trailers and character profile. ${more(`${BASE}/trailers/`, 'Watch the trailers')}</p>` : ''}
    ${e.facts?.length ? `<h2 class="lf-h3">What we know</h2><ul class="lf-list">${e.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
    ${lms.length ? `<h2 class="lf-h3">Landmarks in ${esc(e.name)}</h2><ul class="lf-lms">${lms.map(lmRow).join('')}</ul>` : ''}
    ${rel.length ? `<h2 class="lf-h3">Connected</h2><div class="lf-rel">${rel.map(({ sec: s, e: o }) => `<a href="${entryUrl(s, o)}">${o.images?.[0] ? img(o.images[0], { alt: '', sizes: '80px' }) : '<span class="lf-ph"></span>'}<span><b>${esc(o.name)}</b><i>${esc(SECTIONS[s].one)}</i></span></a>`).join('')}</div>` : ''}
    ${shots.length ? `<h2 class="lf-h3">Screenshots</h2><div class="lf-shots">${shots.map((s) => `<a href="${BASE}/img/${s}.webp" data-lb="${esc(e.slug)}">${img(s, { sizes: '(min-width: 1100px) 22vw, 50vw' })}</a>`).join('')}</div>` : ''}
    ${hero || artSlug ? credit : ''}
    <nav class="lf-pager" aria-label="More ${cfg.label.toLowerCase()}"><a href="${entryUrl(sec, prev)}"><i>Previous</i>${esc(prev.name)}</a><a href="${entryUrl(sec, next)}"><i>Next</i>${esc(next.name)}</a></nav>
  </div>
  <aside class="lf-entry-side">
    ${artSlug && sec === 'characters' ? `<a class="lf-side-art" href="${BASE}/art/${artSlug}-portrait.webp" data-lb="${esc(e.slug)}">${artImg(artSlug, 'portrait', { sizes: '300px' })}</a>` : ''}
    ${adSlot('side')}
    <p class="lf-foot-h">More ${cfg.label.toLowerCase()}</p>
    <ul class="lf-mini">${others.map((o) => `<li><a href="${entryUrl(sec, o)}">${o.images?.[0] ? img(o.images[0], { alt: '', sizes: '120px' }) : '<span class="lf-ph"></span>'}<span>${esc(o.name)}</span></a></li>`).join('')}</ul>
    ${more(`${BASE}/${sec}/`, `All ${cfg.label.toLowerCase()}`)}
  </aside>
</article>`,
      }));
    });
  }
  // which official region a landmark falls in (by in-game area name, then by distance on the map)
  function regionOf(l) {
    const a = l.area.toLowerCase();
    if (/vice|port vice/.test(a)) return 'vice-city';
    if (/gellhorn/.test(a)) return 'port-gellhorn';
    if (/ambrosia/.test(a)) return 'ambrosia';
    if (/key|catalan|gloriana|starfish/.test(a)) return 'leonida-keys';
    const [x, y] = project(l.lng, l.lat);
    return Object.entries(REGION_LL).map(([s, ll]) => [s, Math.hypot(...project(...ll).map((v, i) => v - [x, y][i]))]).sort((p, q) => p[1] - q[1])[0][0];
  }

  // ═════════════ interactive map ═════════════
  const placeBy = Object.fromEntries(db.places.map((p) => [p.slug, p]));
  const mapData = {
    regions: Object.entries(REGION_LL).map(([slug, ll]) => { const p = placeBy[slug]; const [x, y] = project(...ll); return { slug, x, y, name: p.name, text: p.summary, art: placeArt(slug), images: p.images.slice(0, 2), url: entryUrl('places', p) }; }),
    pois: db.map.pois.filter((q) => POI_LL[q.name]).map((q) => { const [x, y] = project(...POI_LL[q.name]); return { name: q.name, kind: q.kind, status: q.status, text: q.text, image: q.image || '', x, y, url: q.link ? `${BASE}/${q.link}/` : '', region: placeBy[q.region]?.name || '' }; }),
    lms: landmarks.map((l) => { const [x, y] = project(l.lng, l.lat); return [l.id, l.name, [l.district, l.area].filter(Boolean).join(', '), l.real, x, y, (l.types[0] || 'landmark')]; }),
  };
  write('map', layout({
    p: `${BASE}/map/`, title: `GTA 6 Map: Interactive Map of Leonida, Vice City and ${landmarks.length} Locations | ${BRAND}`, section: 'map',
    desc: `Interactive GTA 6 map of Leonida with all six regions, ${landmarks.length} community-mapped landmarks and the real Florida places they're based on. Search, zoom and explore Vice City, the Keys and more.`,
    image: ogArt('vice-city-postcard'), crumbs: [['Map', `${BASE}/map/`]],
    body: `${head('GTA VI · Interactive', 'Map of Leonida', `Leonida is Rockstar's Florida, so this map uses real Florida geography with every official region and ${landmarks.length} landmarks mapped by the GTA VI community. Search for a place or tap any dot.`)}
<section class="lf-section lf-tight">
  <div class="lf-map" data-map>
    <div class="lf-map-stage">
      <svg class="lf-map-svg" viewBox="0 0 ${geo.w} ${geo.h}" role="img" aria-label="Map of Leonida on Florida geography">
        <defs>
          <radialGradient id="mg-glow"><stop offset="0" stop-color="#fdb3c2" stop-opacity=".5"/><stop offset=".55" stop-color="#8b6cf0" stop-opacity=".14"/><stop offset="1" stop-color="#8b6cf0" stop-opacity="0"/></radialGradient>
          <pattern id="mg-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="#fff" stroke-opacity=".04"/></pattern>
        </defs>
        <g class="lf-map-view">
          <rect x="-1500" y="-1500" width="4000" height="4000" class="lf-map-sea"/>
          <rect x="-1500" y="-1500" width="4000" height="4000" fill="url(#mg-grid)"/>
          <path class="lf-map-near" d="${geo.near}"/>
          <path class="lf-map-land" d="${geo.land}${geo.islands}"/>
          <path class="lf-map-lake" d="${geo.lakes}"/>
          <path class="lf-map-road2" d="${geo.roadsMinor}"/>
          <path class="lf-map-road" d="${geo.roads}"/>
          ${mapData.regions.map((r) => `<circle class="lf-map-zone" cx="${r.x}" cy="${r.y}" r="70" fill="url(#mg-glow)"/>`).join('')}
          <g class="lf-lms-layer">${mapData.lms.map((l, i) => `<circle class="lf-lmdot" data-lm="${i}" cx="${l[4]}" cy="${l[5]}" r="2.2"/>`).join('')}</g>
          <g class="lf-lmlabels" aria-hidden="true">${mapData.lms.map((l) => `<text class="lf-lmlabel" x="${l[4]}" y="${l[5]}" dx=".5" dy="-.6">${esc(l[1])}</text>`).join('')}</g>
          ${mapData.pois.map((q, i) => `<g class="lf-pin lf-pin-${q.kind}" data-poi="${i}" data-kind="${q.kind}" tabindex="0" role="button" aria-label="${esc(q.name)}" transform="translate(${q.x} ${q.y})"><g class="lf-ms"><circle r="7"/><circle class="lf-pin-dot" r="2.6"/></g></g>`).join('')}
          ${mapData.regions.map((r, i) => `<g class="lf-map-region" data-region="${i}" tabindex="0" role="button" aria-label="${esc(r.name)}" transform="translate(${r.x} ${r.y})"><g class="lf-ms"><circle r="5"/><text y="-12">${esc(r.name)}</text></g></g>`).join('')}
        </g>
      </svg>
      <div class="lf-map-ui">
        <label class="lf-search lf-map-search"><span class="lf-sr">Search places</span><input type="search" placeholder="Search ${landmarks.length} places, e.g. Ocean View Hotel" autocomplete="off" data-map-q list="lf-map-list"></label>
        <div class="lf-chips lf-map-filter" role="group" aria-label="Show"><button type="button" aria-pressed="true" data-layer="lms">Landmarks</button><button type="button" aria-pressed="true" data-layer="pins">Story places</button><button type="button" aria-pressed="true" data-layer="roads">Roads</button></div>
        <div class="lf-map-zoom"><button type="button" data-zoom="1" aria-label="Zoom in">+</button><button type="button" data-zoom="-1" aria-label="Zoom out">−</button><button type="button" data-zoom="0" aria-label="Reset view">⟲</button></div>
      </div>
      <ul class="lf-map-results" hidden></ul>
    </div>
    <aside class="lf-map-panel" aria-live="polite"><div class="lf-map-panel-in"><p class="lf-kicker">Leonida</p><h2 class="lf-h2">Pick a place</h2><p>Drag to move, scroll or pinch to zoom. Big labels are Rockstar's six official regions; pink pins are named places from Rockstar's profiles and artwork; small dots are landmarks mapped by the community, with the real building each one is based on.</p><p class="lf-src">Rockstar hasn't released the in-game map yet, so positions follow the real-life locations. Landmark data: ${ext(L.gtadb, 'gtadb.org')} (MIT). Geography: Natural Earth.</p></div></aside>
  </div>
  <script type="application/json" id="lf-map-data">${json(mapData)}</script>
</section>
${adSlot('leader')}
<section class="lf-section">
  ${sechead('cm-h', 'Community maps', '')}
  <div class="lf-buy">
    <a class="lf-buycard" href="${esc(L.gtadbMap)}" target="_blank" rel="noopener"><b>leonida.gtadb.org</b><span>The GTA VI mapping project's standalone map, built from official screenshots and trailers</span><i>Open ↗</i></a>
    <a class="lf-buycard" href="${esc(L.communityMap)}" target="_blank" rel="noopener"><b>The State of Leonida</b><span>A community-made interactive map of the whole state</span><i>Open ↗</i></a>
    <a class="lf-buycard" href="${BASE}/locations/"><b>Real-life locations</b><span>Every landmark on this map with the real place it's based on</span><i>Browse →</i></a>
  </div>
  <p class="lf-src">Huge credit to the GTA VI mapping community, who have spent years placing every building from Rockstar's footage.</p>
</section>`,
  }));

  // ═════════════ real-life locations ═════════════
  write('locations', layout({
    p: `${BASE}/locations/`, title: `GTA 6 Real-Life Locations: ${landmarks.length} Places in Leonida and Their Real Florida Counterparts | ${BRAND}`, section: 'locations',
    desc: `${landmarks.length} GTA 6 landmarks matched to the real places they're based on: Ocean View Hotel (Clevelander South Beach), the Dominion Hotel (Cardozo), Vice Beach and every district of Vice City.`,
    image: ogArt('vice-city-postcard'), crumbs: [['Real-life locations', `${BASE}/locations/`]],
    jsonld: [{ '@context': 'https://schema.org', '@type': 'ItemList', name: 'GTA 6 real-life locations by area', itemListElement: areas.map(([a], i) => ({ '@type': 'ListItem', position: i + 1, name: a, url: `${siteUrl}${BASE}/locations/${areaSlug(a)}/` })) }],
    body: `${bannerHead('vice-city-postcard', `GTA VI · ${landmarks.length} landmarks`, 'GTA 6 in real life', `Every building the GTA VI mapping community has matched to its real Florida counterpart, from Ocean Drive's hotels to the Keys. Data from ${ext(L.gtadb, 'gtadb.org')} (MIT licence).`)}
${adSlot('leader')}
<section class="lf-section lf-tight">
  <div class="lf-tools" data-lm-filter><label class="lf-search"><span class="lf-sr">Search locations</span><input type="search" placeholder="Search ${landmarks.length} places or real addresses" autocomplete="off" data-lm-q></label></div>
  <div class="lf-areas">${areas.map(([a, ls]) => `<a class="lf-area" href="${BASE}/locations/${areaSlug(a)}/"><b>${esc(a)}</b><i>${plural(ls.length, 'landmark')}</i></a>`).join('')}</div>
  <ul class="lf-lms lf-lms-all" data-lm-list>${landmarks.slice(0, 60).map(lmRow).join('')}</ul>
  <p class="lf-src">Showing 60 of ${landmarks.length}. Pick an area above, or search, to see the rest.</p>
  <script type="application/json" id="lf-lm-data">${json(landmarks.map((l) => [l.id, l.name, l.street, l.district, l.area, l.real, l.lat, l.lng, areaSlug(l.area)]))}</script>
</section>`,
  }));
  for (const [a, ls] of areas) {
    const districts = [...ls.reduce((m, l) => m.set(l.district || 'Around ' + a, [...(m.get(l.district || 'Around ' + a) || []), l]), new Map())];
    write(`locations/${areaSlug(a)}`, layout({
      p: `${BASE}/locations/${areaSlug(a)}/`, title: `${a} in GTA 6: ${plural(ls.length, 'Landmark')} and Their Real-Life Locations | ${BRAND}`, section: 'locations',
      desc: `${plural(ls.length, 'landmark')} in ${a}, GTA 6, matched to their real Florida counterparts${ls[0] ? `, including ${ls.slice(0, 3).map((l) => l.name).join(', ')}` : ''}.`,
      image: ogArt(`${regionOf(ls[0])}-postcard`), crumbs: [['Real-life locations', `${BASE}/locations/`], [a, `${BASE}/locations/${areaSlug(a)}/`]],
      body: `${head(`GTA VI · ${plural(ls.length, 'landmark')}`, esc(a), `Landmarks in ${esc(a)} and the real places they're based on, as mapped by the GTA VI community. ${more(`${BASE}/map/`, 'Open the map')}`)}
${adSlot('leader')}
<section class="lf-section lf-tight">${districts.map(([dname, dl], i) => `<h2 class="lf-h3" id="${slugify(dname)}">${esc(dname)} <small>${dl.length}</small></h2><ul class="lf-lms">${dl.map((l) => lmRow(l).replace('<li class="lf-lm"', `<li class="lf-lm" id="lm-${esc(l.id)}"`)).join('')}</ul>${i % 3 === 2 ? adSlot('infeed') : ''}`).join('')}
<p class="lf-src">Data: ${ext(L.gtadb, 'gtadb.org')} community landmark mapping (MIT licence). Real-world names and addresses are of the buildings that inspired each location.</p></section>`,
    }));
  }

  // ═════════════ artwork ═════════════
  const artGroups = [['Covers', art.filter((a) => a.kind === 'cover')], ['Jason & Lucia', art.filter((a) => a.kind === 'pair' && !a.logo)], ['Characters', art.filter((a) => a.kind === 'character')], ['Visit Leonida postcards', art.filter((a) => a.kind === 'place')], ['With the official logo', art.filter((a) => a.logo)]];
  write('artwork', layout({
    p: `${BASE}/artwork/`, title: `GTA 6 Artwork: Official Cover Art, Posters, Character Art and Wallpapers | ${BRAND}`, section: 'artwork',
    desc: `All ${art.length} official GTA 6 artworks: the cover art, The Album cover, Jason and Lucia key art, every character poster and the Visit Leonida postcards, as phone, desktop and ultrawide wallpapers.`,
    image: ogArt('official-cover-art'),
    crumbs: [['Artwork', `${BASE}/artwork/`]],
    jsonld: [{ '@context': 'https://schema.org', '@type': 'ImageGallery', name: 'Official GTA VI artwork', url: `${siteUrl}${BASE}/artwork/`, copyrightHolder: { '@type': 'Organization', name: 'Rockstar Games' } }],
    body: `${bannerHead('official-cover-art', `GTA VI · ${art.length} artworks`, 'Artwork &amp; covers', `Rockstar's official GTA VI artwork, from the cover art to every character poster. Tap any piece to view it full size, or grab the full-resolution wallpapers from ${ext(L.media, 'Rockstar\'s downloads page ↗')}.`)}
<nav class="lf-jump" aria-label="Jump to">${artGroups.map(([g]) => `<a href="#${slugify(g)}">${esc(g)}</a>`).join('')}</nav>
${artGroups.map(([g, list], gi) => `<section class="lf-section lf-tight" id="${slugify(g)}"><h2 class="lf-h2">${esc(g)} <small>${list.length}</small></h2><div class="lf-artgrid">${list.map((a) => `<figure><a href="${BASE}/art/${a.slug}-portrait.webp" data-lb="art-${gi}">${artImg(a.slug, 'portrait', { sizes: '(min-width: 1100px) 20vw, 45vw' })}</a><figcaption>${esc(a.title)}<span>${Object.keys(a.v).map((v) => `<a href="${BASE}/art/${a.slug}-${v}.webp" target="_blank" rel="noopener">${v}</a>`).join(' · ')}</span></figcaption></figure>`).join('')}</div></section>${gi === 1 ? adSlot('infeed') : ''}`).join('')}
${credit}`,
  }));

  // ═════════════ gameplay ═════════════
  write('gameplay', layout({
    p: `${BASE}/gameplay/`, title: `GTA 6 Gameplay: Everything Shown in the Extended Look | ${BRAND}`, section: 'gameplay',
    desc: 'Every GTA 6 gameplay feature Rockstar has shown: switching between Jason and Lucia, six-star wanted levels, stealing cars, racing, airboats, scuba diving, skydiving and more.',
    image: ogArt('jason-and-lucia-robbery'), crumbs: [['Gameplay', `${BASE}/gameplay/`]],
    body: `${bannerHead('jason-and-lucia-robbery', 'GTA VI · Gameplay', 'How it plays', `What Rockstar has actually shown of GTA VI in action, mostly from ${esc(db.gameplay.source)}.`)}
${adSlot('leader')}
<section class="lf-section lf-tight"><div class="lf-features">${db.gameplay.features.map(([t, d2, s], i) => `<article class="lf-feat"><span class="lf-feat-n">${String(i + 1).padStart(2, '0')}</span><h2>${esc(t)}</h2><p>${esc(d2)}</p>${badge(s)}</article>`).join('')}</div></section>
<section class="lf-section">${sechead('gv-h', 'Watch it', more(`${BASE}/trailers/`, 'All videos'))}${yt(videos.find((v) => v.slug === 'extended-look') || latest, { big: true })}</section>`,
  }));

  // ═════════════ timeline ═════════════
  const years = [...new Set(db.timeline.map((t) => t.date.slice(0, 4)))];
  write('timeline', layout({
    p: `${BASE}/timeline/`, title: `GTA 6 Timeline: Every Announcement, Trailer and Delay | ${BRAND}`, section: 'timeline',
    desc: 'The full GTA 6 timeline from Rockstar\'s first confirmation in 2022 to release on November 19, 2026: trailers, delays, pre-orders, the soundtrack and what\'s next.',
    image: ogArt('jason-lucia-motel'), crumbs: [['Timeline', `${BASE}/timeline/`]],
    body: `${bannerHead('jason-lucia-motel', 'GTA VI · 2022 to now', 'Timeline', 'Every major GTA VI moment, from the first confirmation to launch day and beyond.')}
${adSlot('leader')}
<section class="lf-section lf-tight">${years.map((y) => `<h2 class="lf-year">${y}</h2><ol class="lf-tl">${db.timeline.filter((t) => t.date.startsWith(y)).map((t) => {
      const soon = Date.parse(`${t.date}T23:59:59Z`) >= now, v = t.video && videoBy[t.video];
      return `<li class="${soon ? 'is-next' : ''}"><time datetime="${t.date}">${fmtDate(t.date)}</time><div class="lf-tl-card"><h3>${esc(t.title)}${soon ? ' <span class="lf-badge lf-soon">Upcoming</span>' : ''}</h3><p>${esc(t.text)}</p>${t.status !== 'confirmed' ? badge(t.status) : ''}${v ? `<div class="lf-tl-video">${yt(v)}</div>` : ''}</div></li>`;
    }).join('')}</ol>`).join('')}</section>`,
  }));

  // ═════════════ editions / pre-order guide ═════════════
  const [std, ult] = db.editions;
  write('editions', layout({
    p: `${BASE}/editions/`, title: `GTA 6 Pre-Order Guide: Editions, Price and Bonuses | ${BRAND}`, section: 'editions',
    desc: 'GTA 6 pre-order guide: Standard vs Ultimate Edition price and contents, the Vintage Vice City Pack bonus, the collector\'s box and where to buy.',
    image: ogArt('official-cover-art'), crumbs: [['Pre-order guide', `${BASE}/editions/`]],
    body: `${bannerHead('official-cover-art', 'GTA VI · Buying guide', 'Pre-order guide', 'What each version includes, what it costs, and where to buy it. US prices come from store listings reported in June 2026; UK prices vary by store.')}
<section class="lf-section lf-tight">
  <div class="lf-buy">
    <a class="lf-buycard" href="${esc(L.official)}" target="_blank" rel="noopener"><b>Rockstar Games</b><span>Official pre-order page with every store</span><i>Open ↗</i></a>
    <a class="lf-buycard" href="${esc(L.playstation)}" target="_blank" rel="noopener"><b>PlayStation 5</b><span>PlayStation's GTA VI page</span><i>Open ↗</i></a>
    <a class="lf-buycard" href="https://www.xbox.com/en-GB/search?q=Grand+Theft+Auto+VI" target="_blank" rel="noopener"><b>Xbox Series X|S</b><span>Search the Microsoft Store</span><i>Open ↗</i></a>
    <a class="lf-buycard" href="${esc(L.store)}" target="_blank" rel="noopener"><b>Rockstar Store</b><span>The Vice City Collection and merch</span><i>Open ↗</i></a>
  </div>
  <div class="lf-compare" role="table" aria-label="Standard vs Ultimate Edition">
    <div role="row" class="lf-compare-head"><span role="columnheader"></span><span role="columnheader">Standard</span><span role="columnheader">Ultimate</span></div>
    ${[['Price (US, reported)', std.price.replace(' (US)', ''), ult.price.replace(' (US)', '')], ['Grand Theft Auto VI', '✓', '✓'], ['Vintage Vice City Pack (with pre-order)', '✓', '✓'], ['Exclusive vehicles, weapons, shops and outfits', '—', '✓'], ['Physical copy', 'Reported: code in a box', 'Reported: digital only']]
      .map(([k, a, b]) => `<div role="row"><span role="rowheader">${esc(k)}</span><span role="cell">${esc(a)}</span><span role="cell">${esc(b)}</span></div>`).join('')}
  </div>
  <ul class="lf-list lf-good">
    <li>Release: <b>${fmtDate(db.game.release)}</b> on PlayStation 5 and Xbox Series X|S. No PC version announced.</li>
    <li>Pre-order bonus reportedly applies to pre-orders and digital purchases made before <b>November 20, 2026</b>. <span class="lf-badge lf-rep">Reported</span></li>
    <li>Preload date and unlock time haven't been confirmed by Rockstar yet.</li>
  </ul>
</section>
${adSlot('leader')}
<section class="lf-section lf-editions">${db.editions.map((ed) => `<article class="lf-edition" id="${ed.slug}">
  ${ed.images[0] ? `<a class="lf-edition-media" href="${BASE}/img/${ed.images[0]}.webp" data-lb="editions">${img(ed.images[0], { sizes: '(min-width: 900px) 45vw, 100vw' })}</a>` : ''}
  <div class="lf-edition-body">${badge(ed.status)}<h2 class="lf-h2">${esc(ed.name)}</h2>
    <p class="lf-price">${esc(ed.price)}${ed.priceStatus === 'reported' ? ' <span class="lf-badge lf-rep">Reported price</span>' : ''}</p>
    <p>${esc(ed.summary)}</p>
    ${ed.items.length ? `<ul class="lf-list lf-cols">${ed.items.map((i) => { const hit = all.find(({ e }) => e.name.toLowerCase().replace(/^'\d\d /, '') === i.toLowerCase().replace(/^'\d\d /, '').replace(/"/g, '')); return `<li>${hit ? `<a href="${entryUrl(hit.sec, hit.e)}">${esc(i)}</a>` : esc(i)}</li>`; }).join('')}</ul>` : ''}
    ${ed.images.length > 1 ? `<div class="lf-shots lf-shots-sm">${ed.images.slice(1).map((s) => `<a href="${BASE}/img/${s}.webp" data-lb="editions">${img(s, { sizes: '200px' })}</a>`).join('')}</div>` : ''}
    <p class="lf-src">Source: ${esc(ed.source)}${ed.slug === 'ultimate-edition' ? ` · ${ext(L.ultimate, 'Rockstar\'s Ultimate Edition page ↗')}` : ''}</p>
  </div>
</article>`).join(adSlot('infeed'))}</section>
${credit}`,
  }));

  // ═════════════ trailers ═════════════
  write('trailers', layout({
    p: `${BASE}/trailers/`, title: `GTA 6 Trailers: Every Official Video, Trailer 1 to the Launch Trailer | ${BRAND}`, section: 'trailers',
    desc: `Watch every official GTA 6 trailer and video from Rockstar Games: the Launch Trailer, An Extended Look, Trailer 2, Trailer 1 and more, plus the songs used in each.`,
    image: `https://i.ytimg.com/vi/${latest.youtube}/hqdefault.jpg`, crumbs: [['Trailers', `${BASE}/trailers/`]],
    jsonld: videos.slice(0, 10).map(videoLd),
    body: `${head(`GTA VI · ${plural(videos.length, 'video')}`, 'Trailers &amp; videos', `Every official GTA VI video from Rockstar Games, newest first. Videos load from YouTube only when you press play. ${ext(L.youtube, 'Rockstar on YouTube ↗')}`)}
<section class="lf-section lf-tight"><div class="lf-player">${yt(latest, { big: true })}<div><p class="lf-kicker">Latest · ${fmtDate(latest.date)}</p><h2 class="lf-h2">${esc(latest.title)}</h2><p>${esc(latest.summary)}</p></div></div></section>
${adSlot('leader')}
<section class="lf-section"><div class="lf-videos">${videos.slice(1).map(videoCard).join('')}</div></section>
<section class="lf-section">${sechead('ts-h', 'Trailer songs')}<div class="lf-spots">${db.music.trailers.map((t) => t.spotify ? spotify('track', t.spotify, t.song, `${t.artist} · ${t.trailer}`) : `<div class="lf-spot"><a class="lf-spot-btn" href="https://www.youtube.com/watch?v=${esc(t.video)}" target="_blank" rel="noopener"><span class="lf-spot-ico" aria-hidden="true"></span><span><b>${esc(t.song)}</b><em>${esc(t.artist)} · ${esc(t.trailer)}</em><i>Hear it in the trailer ↗</i></span></a></div>`).join('')}</div></section>`,
  }));
  for (const v of videos) {
    write(`trailers/${v.slug}`, layout({
      p: `${BASE}/trailers/${v.slug}/`, title: `GTA 6 ${v.title} (${fmtDate(v.date)}) | ${BRAND}`, section: 'trailers', type: 'video.other',
      desc: `Watch the official Grand Theft Auto VI ${v.title}, released by Rockstar Games on ${fmtDate(v.date)}. ${v.summary}`.slice(0, 300),
      image: `https://i.ytimg.com/vi/${v.youtube}/hqdefault.jpg`, crumbs: [['Trailers', `${BASE}/trailers/`], [v.title, `${BASE}/trailers/${v.slug}/`]], jsonld: [videoLd(v)],
      body: `${head(`Official video · ${fmtDate(v.date)}`, `GTA 6 ${esc(v.title)}`, esc(v.summary))}
<section class="lf-section lf-tight">${yt(v, { big: true })}<p class="lf-src">Video by Rockstar Games, embedded from YouTube. ${ext(`https://www.youtube.com/watch?v=${v.youtube}`, 'Watch on YouTube ↗')}</p>
${(() => { const s = db.music.trailers.find((t) => t.video === v.youtube); return s ? `<div class="lf-spots lf-tight">${s.spotify ? spotify('track', s.spotify, s.song, `${s.artist} · the song in this trailer`) : `<p class="lf-src">Song: ${esc(s.song)} by ${esc(s.artist)}</p>`}</div>` : ''; })()}</section>
${adSlot('leader')}
<section class="lf-section">${sechead('more-v', 'More videos', more(`${BASE}/trailers/`, 'All videos'))}<div class="lf-videos">${videos.filter((o) => o !== v).slice(0, 3).map(videoCard).join('')}</div></section>`,
    }));
  }

  // ═════════════ music ═════════════
  const m = db.music;
  write('music', layout({
    p: `${BASE}/music/`, title: `GTA 6 Soundtrack: Listen to the Album, Score by Justice, Trailer Songs and Radio | ${BRAND}`, section: 'music',
    desc: `Listen to the GTA 6 soundtrack: Grand Theft Auto VI: The Album (${m.album.tracks} tracks) with Travis Scott, Cardi B, Morgan Wallen and more, the original score by Justice, the trailer songs and every confirmed radio station.`,
    image: ogArt('the-album-cover-art'), crumbs: [['Music', `${BASE}/music/`]],
    jsonld: [m.album, m.score].map((a) => ({ '@context': 'https://schema.org', '@type': 'MusicAlbum', name: a.title, numTracks: a.tracks, datePublished: a.release, byArtist: { '@type': a.artist ? 'MusicGroup' : 'Organization', name: a.artist || 'Various artists' } })),
    body: `${bannerHead('the-album-cover-art', 'GTA VI · Soundtrack', 'Music &amp; radio', `The album, the score, the trailer songs and the stations you'll hear around Leonida. ${ext(L.music, 'Rockstar\'s music page ↗')}`, 'landscape')}
<section class="lf-section lf-tight">
  ${sechead('listen-h', 'Listen now', ext(L.spotify, 'Open in Spotify ↗', 'lf-more'))}
  <div class="lf-listen">${spotify('artist', m.spotify.artist, 'Grand Theft Auto VI', 'Every released track from the album and score', true)}<div class="lf-spots lf-spots-col">${m.spotify.tracks.slice(0, 3).map((t) => spotify(t.type, t.id, t.song, t.artist)).join('')}</div></div>
  <div class="lf-spots lf-tight">${m.spotify.tracks.slice(3).map((t) => spotify(t.type, t.id, t.song, t.artist)).join('')}</div>
  <p class="lf-src">Players load from Spotify when you press play. Full songs need a free Spotify account.</p>
</section>
${adSlot('leader')}
<section class="lf-section lf-albums">${[m.album, m.score].map((a, i) => `<article class="lf-album">${i === 0 ? `<a class="lf-album-cover" href="${BASE}/art/the-album-cover-art-square.webp" data-lb="album">${artImg('the-album-cover-art', 'square', { sizes: '200px' })}</a>` : ''}${badge('confirmed')}<p class="lf-kicker">${fmtDate(a.release)} · ${a.tracks} tracks</p><h2 class="lf-h2">${esc(a.title)}</h2>${a.artist ? `<p class="lf-price">by ${esc(a.artist)}</p>` : ''}<p>${esc(a.summary)}</p><h3 class="lf-h3">Singles out now</h3><ol class="lf-tracks">${a.singles.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></article>`).join('')}</section>
<section class="lf-section">${sechead('ts-h', 'Trailer songs')}<div class="lf-spots">${m.trailers.map((t) => t.spotify ? spotify('track', t.spotify, t.song, `${t.artist} · ${t.trailer}`) : `<div class="lf-spot"><a class="lf-spot-btn" href="https://www.youtube.com/watch?v=${esc(t.video)}" target="_blank" rel="noopener"><span class="lf-spot-ico" aria-hidden="true"></span><span><b>${esc(t.song)}</b><em>${esc(t.artist)} · ${esc(t.trailer)}</em><i>Hear it in the trailer ↗</i></span></a></div>`).join('')}</div></section>
${adSlot('infeed')}
<section class="lf-section">${sechead('radio-h', 'Radio stations')}<p class="lf-prose">Rockstar has described these stations and their hosts. Station names are still to be announced.</p>
<div class="lf-radio">${m.radio.map((r, i) => `<div class="lf-station"><span class="lf-dial" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><b>${esc(r.genre)}</b><i>Hosted by ${esc(r.hosts)}</i></div>`).join('')}</div>
<p class="lf-src">Source: ${ext(L.music, esc(m.source))}</p></section>`,
  }));

  // ═════════════ gallery ═════════════
  const groups = [];
  for (const i of images) {
    let g = groups.find((x) => x.label === i.group);
    if (!g) groups.push(g = { label: i.group, kind: i.kind, items: [] });
    g.items.push(i);
  }
  const order = { people: 0, places: 1, edition: 2 };
  groups.sort((a, b) => order[a.kind] - order[b.kind]);
  write('gallery', layout({
    p: `${BASE}/gallery/`, title: `GTA 6 Screenshots: ${images.length} Official Images in HD | ${BRAND}`, section: 'gallery',
    desc: `All ${images.length} official GTA 6 screenshots from Rockstar's media pack, sorted by character and region: Jason, Lucia, Vice City, the Keys, Grassrivers and more.`,
    image: ogImage('vice-city-03'), crumbs: [['Screenshots', `${BASE}/gallery/`]],
    jsonld: [{ '@context': 'https://schema.org', '@type': 'ImageGallery', name: 'Official GTA VI screenshots', url: `${siteUrl}${BASE}/gallery/`, copyrightHolder: { '@type': 'Organization', name: 'Rockstar Games' } }],
    body: `${head(`GTA VI · ${images.length} images`, 'Screenshots', `Every screenshot from Rockstar's official media pack. Tap any image to view it full size. ${more(`${BASE}/artwork/`, 'Official artwork')}`)}
<nav class="lf-jump" aria-label="Jump to">${groups.map((g) => `<a href="#${slugify(g.label)}">${esc(g.label)}</a>`).join('')}</nav>
${groups.map((g, gi) => `<section class="lf-section lf-tight" id="${slugify(g.label)}"><h2 class="lf-h2">${esc(g.label)} <small>${g.items.length}</small></h2><div class="lf-shots lf-shots-gallery">${g.items.map((i) => `<a href="${BASE}/img/${i.slug}.webp" data-lb="gallery">${img(i.slug, { sizes: '(min-width: 1100px) 25vw, 50vw' })}</a>`).join('')}</div></section>${gi % 3 === 2 ? adSlot('infeed') : ''}`).join('')}
${credit}`,
  }));

  // ═════════════ news ═════════════
  write('news', layout({
    p: `${BASE}/news/`, title: `GTA 6 News: Latest Updates, Checked Daily | ${BRAND}`, section: 'news',
    desc: `The latest GTA 6 news, updated daily: release date, trailers, editions, music and every new detail from Rockstar Games. Last update ${fmtDate(updated)}.`,
    image: ogArt('jason-and-lucia-beach'), crumbs: [['News', `${BASE}/news/`]],
    jsonld: [{ '@context': 'https://schema.org', '@type': 'ItemList', name: 'GTA 6 news', itemListElement: news.slice(0, 20).map((n, i) => ({ '@type': 'ListItem', position: i + 1, name: n.title })) }],
    body: `${bannerHead('jason-and-lucia-beach', 'GTA VI · Updated daily', 'News', `New trailers from Rockstar's channel appear here automatically, and everything is checked against Rockstar's announcements every day. Last update ${fmtDate(updated)}. ${ext(L.newswire, 'Rockstar Newswire ↗')}`)}
${adSlot('leader')}
<section class="lf-section lf-tight"><ol class="lf-news lf-news-list">${news.map((n, i) => newsItem(n) + (i === 3 ? `<li class="lf-newsad">${adSlot('infeed')}</li>` : '')).join('')}</ol></section>`,
  }));

  // ═════════════ faq ═════════════
  write('faq', layout({
    p: `${BASE}/faq/`, title: `GTA 6 FAQ: Release Date, Price, PC, Characters and More | ${BRAND}`, section: 'faq',
    desc: 'Quick answers to the most asked GTA 6 questions: when it comes out, platforms, PC, price, pre-order bonus, Ultimate Edition, characters, map and soundtrack.',
    image: ogArt('jason-and-lucia-02'), crumbs: [['FAQ', `${BASE}/faq/`]],
    jsonld: [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: db.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }],
    body: `${head('GTA VI · Questions', 'FAQ', 'Short, sourced answers. If Rockstar hasn\'t confirmed something, we say so.')}
${adSlot('leader')}
<section class="lf-section lf-tight"><div class="lf-faq">${db.faq.map((f, i) => faqItem(f).replace('<details', i < 3 ? '<details open' : '<details')).join('')}</div></section>`,
  }));

  // ═════════════ about ═════════════
  write('about', layout({
    p: `${BASE}/about/`, title: `About GTA 6 Hub and Disclaimer | ${BRAND}`, section: 'about',
    desc: 'About GTA 6 Hub, the unofficial GTA 6 database by Hex Modifications: how facts are checked and labelled, where artwork, maps and data come from, and our disclaimer.',
    image: ogArt('jason-and-lucia-01'), crumbs: [['About', `${BASE}/about/`]],
    body: `${head('About', 'About GTA 6 Hub', '')}
<section class="lf-section lf-tight lf-prose">
  <p><b>GTA 6 Hub is an unofficial fan site</b> made by <a href="/">Hex Modifications</a>. It isn't affiliated with, endorsed by or sponsored by Rockstar Games or Take-Two Interactive. Grand Theft Auto, GTA VI and all related names, logos, images and trademarks belong to their respective owners.</p>
  <h2 class="lf-h3">How we label facts</h2>
  <p><span class="lf-badge lf-ok">Confirmed</span> means Rockstar Games has said or shown it. <span class="lf-badge lf-rep">Reported</span> means it comes from press reports, store listings or fans identifying things in Rockstar's official footage. We don't host leaked or stolen material, and we don't list rumours about real people, so the voice cast stays empty until it's officially announced.</p>
  <h2 class="lf-h3">Artwork, video and audio</h2>
  <p>Artwork and screenshots are from Rockstar's ${ext(L.media, 'official GTA VI media pack')}, which Rockstar shares for fans to download and share, and remain © Rockstar Games. Trailers are embedded from Rockstar's YouTube channel and music from Spotify; neither loads until you press play.</p>
  <h2 class="lf-h3">Map and locations</h2>
  <p>Rockstar hasn't released the in-game map yet. Our map draws Leonida on real Florida geography from Natural Earth (public domain). Landmark names, districts and real-life matches come from the GTA VI mapping community via ${ext(L.gtadb, 'gtadb.org')}, used under the MIT licence: Copyright (C) 2025-2026 GTADB.ORG. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files, to deal in the Software without restriction, subject to including this notice. The software is provided "as is", without warranty of any kind.</p>
  <h2 class="lf-h3">Privacy</h2>
  <p>This site doesn't set cookies or run analytics. Fonts load from Google Fonts. ${adsOn ? 'Ads are served by third-party networks, which may use cookies; where the law requires it you\'ll be asked for consent first.' : 'If advertising is switched on, ads are served by third-party networks, which may use cookies, and you\'ll be asked for consent first where the law requires it.'}</p>
  <h2 class="lf-h3">Contact</h2>
  <p>Spotted a mistake, or need something removed? Email <a href="mailto:hexmodifications@icloud.com">hexmodifications@icloud.com</a>.</p>
</section>`,
  }));

  fs.writeFileSync(path.join(out, 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#1d1d35"/><text x="32" y="46" text-anchor="middle" font-family="Impact, sans-serif" font-size="40" fill="#fdb3c2">6</text></svg>`);

  // the hub used to live at /gta6/: send old links to the new address
  for (const u of urls) {
    const rel = u.loc.slice(`${siteUrl}${BASE}`.length);
    const file = path.join(dist, 'gta6', rel, 'index.html');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `<!doctype html><meta charset="utf-8"><title>Moved to GTA 6 Hub</title><meta name="robots" content="noindex"><link rel="canonical" href="${esc(u.loc)}"><meta http-equiv="refresh" content="0;url=${esc(u.loc)}"><a href="${esc(u.loc)}">GTA 6 Hub has moved here</a>`);
  }
  log(`gta6hub: ${urls.length} pages built (${news.length} news, ${videos.length} videos, ${landmarks.length} landmarks, ${adCount} ad slots${adsOn ? '' : ', ads off until configured'})`);
  return { urls, updated };
}

function decode(s) { return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }

// standalone: node gta6hub/build.mjs
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dist = path.join(root, 'dist');
  fs.mkdirSync(path.join(dist, 'gta6hub'), { recursive: true });
  fs.cpSync(path.join(root, 'gta6hub', 'public'), path.join(dist, 'gta6hub'), { recursive: true });
  const site = JSON.parse(fs.readFileSync(path.join(root, 'data', 'site.json'), 'utf8'));
  await buildGta6({ root, dist, siteUrl: (process.env.SITE_URL || 'https://hex-modifications.github.io').replace(/\/$/, ''), site, fetchFeed: process.env.SKIP_FEED !== '1' });
}

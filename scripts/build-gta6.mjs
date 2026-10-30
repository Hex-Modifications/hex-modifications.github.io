// Builds "Leonida Files", the unofficial GTA VI database, into dist/gta6/ (a branch of the Hex Modifications site).
// Facts come from data/gta6/db.json, where every entry is marked "confirmed" (said or shown by Rockstar) or
// "reported" (press reports, store listings, or fan identification from trailers). Images are Rockstar's official
// media pack (data/gta6/images.json → public/gta6/img). On every build it also reads Rockstar's YouTube feed,
// so new GTA VI videos show up in News and Trailers without anyone touching the data.
// Usage: imported by scripts/build-static.mjs, or on its own: node scripts/build-gta6.mjs (writes to dist/gta6)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BRAND = 'Leonida Files';
const YT_FEED = 'https://www.youtube.com/feeds/videos.xml?channel_id=UC6VcWc1rAoWdBCM0JxrRQ3A';   // Rockstar Games
const BASE = '/gta6';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const fmtDate = (d) => new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 60);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// the five database sections, each with a list page and one page per entry
const SECTIONS = {
  characters: { label: 'Characters', one: 'character', title: 'GTA 6 Characters: Jason, Lucia and Every Confirmed Character',
    desc: 'Every confirmed GTA 6 character: Jason Duval, Lucia Caminos, Cal Hampton, Boobie Ike, Dre\'Quan Priest, the Real Dimez, Raul Bautista and Brian Heder, with official bios and screenshots.',
    intro: 'The people of Leonida, from Rockstar\'s official character profiles. Two protagonists, a crew of hustlers, smugglers and wannabe stars, and everyone else they owe money to.' },
  places: { label: 'Places', one: 'region', title: 'GTA 6 Map: Vice City, Leonida Keys and Every Confirmed Region',
    desc: 'Every confirmed GTA 6 location in the state of Leonida: Vice City, the Leonida Keys, Grassrivers, Port Gellhorn, Ambrosia and Mount Kalaga National Park, with official screenshots.',
    intro: 'Leonida is Rockstar\'s take on modern Florida. These are the six regions Rockstar has named so far, from the neon of Vice City to the swamps and the mountains up north.' },
  vehicles: { label: 'Vehicles', one: 'vehicle', title: 'GTA 6 Vehicles: Every Confirmed Car, Bike and Boat',
    desc: 'Every GTA 6 car, bike and boat we know about: confirmed vehicles from Rockstar (Grotti Cheetah, Vapid Stanier, Squalo) and models fans have spotted in the trailers, clearly labelled.',
    intro: 'Cars, bikes and boats in GTA VI. Confirmed entries come straight from Rockstar\'s announcements and media; reported ones have been identified by fans in trailer footage and are labelled that way.' },
  weapons: { label: 'Weapons', one: 'weapon', title: 'GTA 6 Weapons: Every Confirmed and Spotted Gun',
    desc: 'Every GTA 6 weapon known so far: the Ultimate Edition revolvers and engraved sidearms, plus the shotguns, rifles, SMGs and melee weapons seen in the trailers.',
    intro: 'The arsenal so far. Edition-exclusive weapons are confirmed by Rockstar; everything seen in trailer footage is marked as reported until it\'s officially named.' },
  businesses: { label: 'Businesses', one: 'business', title: 'GTA 6 Businesses, Shops and Locations',
    desc: 'Every confirmed GTA 6 business and shop: Only Raw Records, the Jack of Hearts, Electric Fang Tattoo, Rideout Customs, Sara\'s Salon, Stock 305 and more.',
    intro: 'Clubs, labels, shops and fronts. Some are part of the story, others come with the Ultimate Edition.' },
};

const NAV = [
  ['characters', 'Characters'], ['places', 'Places'], ['vehicles', 'Vehicles'], ['weapons', 'Weapons'], ['businesses', 'Businesses'],
  ['editions', 'Editions'], ['trailers', 'Trailers'], ['music', 'Music'], ['gallery', 'Gallery'], ['news', 'News'], ['faq', 'FAQ'],
];

export async function buildGta6({ root, dist, siteUrl, site = {}, fetchFeed = true, log = console.log }) {
  const db = JSON.parse(fs.readFileSync(path.join(root, 'data', 'gta6', 'db.json'), 'utf8'));
  const images = JSON.parse(fs.readFileSync(path.join(root, 'data', 'gta6', 'images.json'), 'utf8'));
  const imgBy = Object.fromEntries(images.map((i) => [i.slug, i]));
  const out = path.join(dist, 'gta6');
  const urls = [];
  const today = new Date().toISOString().slice(0, 10);

  // ── ads: AdSense units are written into the pages at build time once data/site.json has a publisher ID ──
  const ad = site.monetise?.adsense || {};
  const adClient = /^ca-pub-\d{10,20}$/.test(ad.client || '') ? ad.client : '';
  const adSlotId = (kind) => { const v = String(ad.gta6Slots?.[kind] || ad.slot || ''); return /^\d{6,12}$/.test(v) ? v : ''; };
  const sponsors = (site.monetise?.sponsored || []).filter((s) => s?.title && /^https:\/\//.test(s.url || ''));
  function adSlot(kind) {
    const id = adSlotId(kind);
    if (adClient && id) {
      return `<aside class="lf-ad lf-ad-${kind}" aria-label="Advertisement"><span class="lf-ad-label">Advertisement</span><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(adClient)}" data-ad-slot="${esc(id)}" data-ad-format="${kind === 'side' ? 'vertical' : 'auto'}" data-full-width-responsive="true"></ins></aside>`;
    }
    if (kind === 'leader' && sponsors.length) {
      const s = sponsors[0];
      return `<aside class="lf-ad lf-ad-leader" aria-label="Sponsored"><span class="lf-ad-label">${esc(s.label || 'Sponsored')}</span><a class="lf-sponsor" href="${esc(s.url)}" target="_blank" rel="sponsored noopener"><strong>${esc(s.title)}</strong>${s.text ? `<span>${esc(s.text)}</span>` : ''}<em>${esc(s.cta || 'Take a look')} ↗</em></a></aside>`;
    }
    if (kind === 'foot') {   // with no ad account yet, the last slot cross-promotes the main site
      return `<aside class="lf-ad lf-ad-foot lf-house" aria-label="From Hex Modifications"><span class="lf-ad-label">From the makers</span><a class="lf-sponsor" href="/"><strong>Hex Modifications</strong><span>GTA V mods, LSPDFR call-outs, FiveM scripts and ReShade presets, free to download.</span><em>Explore the mods →</em></a></aside>`;
    }
    return '';
  }

  // ── images ──
  const altFor = (slug) => { const i = imgBy[slug]; return i ? `${i.name}: official GTA VI ${i.kind === 'edition' ? 'artwork' : 'screenshot'}` : 'GTA VI screenshot'; };
  function img(slug, { alt = altFor(slug), eager = false, sizes = '(min-width: 1100px) 33vw, (min-width: 700px) 50vw, 100vw', cls = '' } = {}) {
    const i = imgBy[slug];
    if (!i) return '';
    return `<img${cls ? ` class="${cls}"` : ''} src="${BASE}/img/${slug}-sm.webp" srcset="${BASE}/img/${slug}-sm.webp 640w, ${BASE}/img/${slug}.webp ${i.w}w" sizes="${sizes}" width="${i.w}" height="${i.h}" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
  }
  const ogImage = (slug) => (imgBy[slug] ? `${siteUrl}${BASE}/img/${slug}.webp` : `${siteUrl}${BASE}/img/jason-and-lucia-01.webp`);
  const badge = (status) => (status === 'confirmed'
    ? '<span class="lf-badge lf-ok" title="Confirmed by Rockstar Games">Confirmed</span>'
    : '<span class="lf-badge lf-rep" title="Reported by press or spotted by fans, not confirmed by Rockstar">Reported</span>');
  const credit = '<p class="lf-credit">Images © Rockstar Games, from the official GTA VI media pack.</p>';

  // ── videos: the curated list plus any new GTA VI uploads on Rockstar's channel ──
  const videos = db.videos.map((v) => ({ ...v, official: true }));
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
    } catch (err) { log(`gta6: YouTube feed unavailable (${err.message}), using the saved video list`); }
  }
  // Rockstar often posts several cuts under one title (vertical, regional); one per title is enough
  const byTitle = new Map();
  for (const v of feed) {
    const k = v.title.toLowerCase();
    if (!byTitle.has(k)) byTitle.set(k, []);
    byTitle.get(k).push(v);
  }
  // ...and teasers or clips of a video already listed ("An Extended Look — Now Playing", "... Coming August 27") are skipped
  const base = (t) => t.toLowerCase().replace(/^grand theft auto vi:?\s*/, '').replace(/\s+[—–-]\s+.*$/, '').replace(/\s+coming\s.*$/, '').trim();
  const listed = new Set(videos.map((v) => base(v.title)));
  for (const group of byTitle.values()) {
    if (group.some((v) => known.has(v.youtube)) || listed.has(base(group[0].title))) continue;
    const v = group.sort((a, b) => b.date.localeCompare(a.date))[0];
    const title = v.title.replace(/^grand theft auto vi:?\s*/i, '').replace(/\s+—\s+/g, ': ') || v.title;
    videos.push({ slug: `${slugify(title)}-${v.youtube.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6)}`, title, youtube: v.youtube, date: v.date, summary: v.summary || `New from Rockstar Games: ${v.title}.`, official: true, fromFeed: true });
    known.add(v.youtube);
  }
  videos.sort((a, b) => b.date.localeCompare(a.date));
  const news = [...db.news, ...videos.filter((v) => v.fromFeed).map((v) => ({ date: v.date, title: `New video: ${v.title}`, summary: v.summary, source: 'Rockstar Games YouTube', video: v.youtube }))]
    .sort((a, b) => b.date.localeCompare(a.date));
  const updated = [db.updated, news[0]?.date].filter(Boolean).sort().pop();
  if (feed.length) log(`gta6: ${feed.length} GTA VI videos in Rockstar's feed, ${videos.filter((v) => v.fromFeed).length} new`);

  function yt(v, { big = false } = {}) {
    return `<div class="lf-yt${big ? ' lf-yt-big' : ''}">
      <a class="lf-yt-btn" href="https://www.youtube.com/watch?v=${esc(v.youtube)}" data-yt="${esc(v.youtube)}" data-title="${esc(v.title)}" target="_blank" rel="noopener">
        <img src="https://i.ytimg.com/vi/${esc(v.youtube)}/hqdefault.jpg" width="480" height="360" alt="" loading="lazy" decoding="async">
        <span class="lf-play" aria-hidden="true"></span><span class="lf-sr">Play ${esc(v.title)}</span>
      </a></div>`;
  }

  // ── page shell ──
  function layout({ p, title, desc, image, crumbs = [], body, jsonld = [], section = '', type = 'website' }) {
    const url = `${siteUrl}${p}`;
    urls.push({ loc: url, lastmod: updated, priority: p === `${BASE}/` ? '0.9' : crumbs.length > 2 ? '0.6' : '0.8' });
    const trail = [['Leonida Files', `${BASE}/`], ...crumbs];
    const ld = [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: trail.map(([name, href], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${siteUrl}${href}` })) }, ...jsonld];
    const csp = adClient
      ? `default-src 'self'; script-src 'self' https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https:; frame-src https:; media-src 'none'; base-uri 'self'; form-action 'none'; object-src 'none'`
      : `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://i.ytimg.com; connect-src 'self'; frame-src https://www.youtube-nocookie.com; media-src 'none'; base-uri 'self'; form-action 'none'; object-src 'none'`;
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
<meta name="theme-color" content="#0d0716">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1440"><meta property="og:image:height" content="810">
<meta property="og:locale" content="en_GB">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<link rel="icon" href="${BASE}/icon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Inter+Tight:wght@400;500;600;700&family=Yellowtail&display=swap">
<link rel="stylesheet" href="${BASE}/gta6.css">
<script src="${BASE}/gta6.js" defer></script>
<script type="application/ld+json">${json(ld.length === 1 ? ld[0] : ld)}</script>
</head>
<body${section ? ` data-section="${section}"` : ''}>
<a class="lf-skip" href="#main">Skip to content</a>
<div class="lf-ticker" role="note" aria-label="Disclaimer"><div class="lf-ticker-track">${'<span>Unofficial fan site · not affiliated with Rockstar Games or Take-Two</span><span>Grand Theft Auto VI · 19 November 2026 · PS5 &amp; Xbox Series X|S</span><span>Updated daily · every fact labelled confirmed or reported</span>'.repeat(2)}</div></div>
<header class="lf-head">
  <a class="lf-brand" href="${BASE}/" aria-label="Leonida Files home">
    <span class="lf-sunmark" aria-hidden="true"></span>
    <span class="lf-brand-words"><span class="lf-brand-name">Leonida <em>Files</em></span><span class="lf-brand-by">GTA VI database · by Hex Modifications</span></span>
  </a>
  <nav class="lf-nav" aria-label="Database">${NAV.map(([s, l]) => `<a href="${BASE}/${s}/"${s === section ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
</header>
${crumbs.length ? `<nav class="lf-crumbs" aria-label="Breadcrumb"><ol>${trail.map(([n, h], i) => (i === trail.length - 1 ? `<li aria-current="page">${esc(n)}</li>` : `<li><a href="${h}">${esc(n)}</a></li>`)).join('')}</ol></nav>` : ''}
<main id="main">
${body}
${adSlot('foot')}
</main>
<footer class="lf-foot">
  <div class="lf-foot-grid">
    <div class="lf-foot-about">
      <p class="lf-brand-name">Leonida <em>Files</em></p>
      <p>The unofficial Grand Theft Auto VI database, checked and updated every day. A <a href="/">Hex Modifications</a> project.</p>
    </div>
    <nav aria-label="Database"><p class="lf-foot-h">Database</p>${NAV.slice(0, 6).map(([s, l]) => `<a href="${BASE}/${s}/">${l}</a>`).join('')}</nav>
    <nav aria-label="More"><p class="lf-foot-h">More</p>${NAV.slice(6).map(([s, l]) => `<a href="${BASE}/${s}/">${l}</a>`).join('')}<a href="${BASE}/about/">About &amp; disclaimer</a><a href="/">Hex Modifications</a></nav>
  </div>
  <p class="lf-legal"><strong>Unofficial fan site.</strong> Leonida Files is not affiliated with, endorsed by or sponsored by Rockstar Games or Take-Two Interactive. Grand Theft Auto, GTA VI and all related names, images and trademarks belong to their owners. Official screenshots and artwork © Rockstar Games, shared from Rockstar's media pack. Anything marked <em>Reported</em> comes from press coverage, store listings or fan sightings, and isn't confirmed by Rockstar.</p>
  <p class="lf-legal">Last updated ${fmtDate(updated)} · <a href="/sitemap.xml">Sitemap</a> · <a href="${BASE}/about/">About</a></p>
</footer>
</body>
</html>
`;
  }
  function write(p, html) {
    const file = path.join(dist, p, 'index.html');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html);
  }
  const head = (kicker, h1, lede, extra = '') => `<header class="lf-pagehead"><p class="lf-kicker">${kicker}</p><h1 class="lf-display">${h1}</h1>${lede ? `<p class="lf-lede">${lede}</p>` : ''}${extra}</header>`;
  const days = Math.max(0, Math.ceil((Date.parse(`${db.game.release}T00:00:00Z`) - Date.now()) / 864e5));

  // ── cards ──
  const entryUrl = (sec, e) => `${BASE}/${sec}/${e.slug}/`;
  function card(sec, e) {
    const meta = sec === 'characters' ? e.role : sec === 'places' ? (e.inspiration && !/^no /i.test(e.inspiration) ? `Inspired by ${e.inspiration}` : 'Region of Leonida') : [e.brand, e.type].filter(Boolean).join(' · ');
    const q = [e.name, e.role, e.brand, e.type, e.where, e.inspiration].filter(Boolean).join(' ').toLowerCase();
    return `<a class="lf-card" href="${entryUrl(sec, e)}" data-status="${e.status}" data-q="${esc(q)}">
      <span class="lf-card-media${sec === 'characters' ? ' lf-portrait' : ''}">${e.images?.[0] ? img(e.images[0]) : `<span class="lf-ph"><span>${esc(e.type || SECTIONS[sec].one)}</span></span>`}</span>
      <span class="lf-card-body">${badge(e.status)}<span class="lf-card-title">${esc(e.name)}</span>${meta ? `<span class="lf-card-meta">${esc(meta)}</span>` : ''}</span>
    </a>`;
  }
  function grid(sec, list, { filter = false, adEvery = 0 } = {}) {
    const items = list.map((e, i) => card(sec, e) + (adEvery && (i + 1) % adEvery === 0 && i < list.length - 1 ? adSlot('infeed') : ''));
    const counts = { confirmed: list.filter((e) => e.status === 'confirmed').length, reported: list.filter((e) => e.status !== 'confirmed').length };
    const bar = filter ? `<div class="lf-tools" data-filter-for="g-${sec}">
      <label class="lf-search"><span class="lf-sr">Search ${SECTIONS[sec].label.toLowerCase()}</span><input type="search" placeholder="Search ${plural(list.length, SECTIONS[sec].one)}…" autocomplete="off" data-filter-q></label>
      <div class="lf-chips" role="group" aria-label="Filter by status"><button type="button" aria-pressed="true" data-filter-s="all">All <b>${list.length}</b></button><button type="button" aria-pressed="false" data-filter-s="confirmed">Confirmed <b>${counts.confirmed}</b></button>${counts.reported ? `<button type="button" aria-pressed="false" data-filter-s="reported">Reported <b>${counts.reported}</b></button>` : ''}</div>
    </div>` : '';
    return `${bar}<div class="lf-grid${sec === 'characters' ? ' lf-grid-people' : ''}" id="g-${sec}">${items.join('')}</div>${filter ? '<p class="lf-empty" hidden>Nothing matches that yet. We add new entries as soon as Rockstar confirms them.</p>' : ''}`;
  }
  const itemList = (sec, list) => ({ '@context': 'https://schema.org', '@type': 'ItemList', name: SECTIONS[sec].title, numberOfItems: list.length,
    itemListElement: list.map((e, i) => ({ '@type': 'ListItem', position: i + 1, url: `${siteUrl}${entryUrl(sec, e)}`, name: e.name })) });
  const videoLd = (v) => ({ '@context': 'https://schema.org', '@type': 'VideoObject', name: `Grand Theft Auto VI: ${v.title}`, description: v.summary,
    uploadDate: `${v.date}T12:00:00+00:00`, thumbnailUrl: `https://i.ytimg.com/vi/${v.youtube}/hqdefault.jpg`, embedUrl: `https://www.youtube-nocookie.com/embed/${v.youtube}`,
    contentUrl: `https://www.youtube.com/watch?v=${v.youtube}`, publisher: { '@type': 'Organization', name: 'Rockstar Games' } });
  const gameLd = { '@context': 'https://schema.org', '@type': 'VideoGame', name: db.game.title, alternateName: ['GTA 6', 'GTA VI'],
    author: { '@type': 'Organization', name: db.game.developer }, publisher: { '@type': 'Organization', name: 'Rockstar Games' },
    datePublished: db.game.release, gamePlatform: db.game.platforms, genre: ['Action-adventure', 'Open world'], playMode: 'SinglePlayer',
    image: ogImage('jason-and-lucia-01'), url: 'https://www.rockstargames.com/VI', characters: db.characters.slice(0, 8).map((c) => ({ '@type': 'Person', name: c.name })) };

  // ── home ──
  const latest = videos[0];
  const facts = [
    ['Release', fmtDate(db.game.release)], ['Platforms', db.game.platforms.join(' & ')], ['PC', db.game.pc],
    ['Setting', 'Vice City, state of Leonida'], ['Protagonists', db.game.protagonists.join(' & ')], ['Price (US)', '$79.99 / $99.99 Ultimate'],
  ];
  const tiles = [
    ['vehicles', 'Vehicles', db.vehicles.length, 'ultimate-edition-grotti-cheetah-02'], ['weapons', 'Weapons', db.weapons.length, 'ultimate-edition-hawk-and-little-morgan-revolvers-01'],
    ['businesses', 'Businesses', db.businesses.length, 'ultimate-edition-electric-fang-02'], ['editions', 'Editions', db.editions.length, 'vintage-vice-city-pack-01'],
    ['music', 'Music & radio', db.music.radio.length + 2, 'vice-city-07'], ['gallery', 'Gallery', images.length, 'vice-city-03'],
  ];
  write(`gta6`, layout({
    p: `${BASE}/`, title: 'GTA 6 Database: Release Date, Characters, Map, Vehicles & News | Leonida Files',
    desc: `Everything confirmed about GTA 6: the ${fmtDate(db.game.release)} release date, Jason and Lucia, the Leonida map, every vehicle, weapon and business, trailers and daily news. Unofficial fan database.`,
    image: ogImage('jason-and-lucia-01'),
    jsonld: [{ '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND, alternateName: 'Leonida Files GTA 6 Database', url: `${siteUrl}${BASE}/`, publisher: { '@type': 'Organization', name: site.name || 'Hex Modifications', url: `${siteUrl}/` } }, gameLd],
    body: `
<section class="lf-hero">
  <div class="lf-hero-media">${img('jason-and-lucia-01', { alt: 'Jason Duval and Lucia Caminos in an official GTA VI screenshot', eager: true, sizes: '100vw' })}</div>
  <div class="lf-hero-sun" aria-hidden="true"></div>
  <div class="lf-hero-grid" aria-hidden="true"></div>
  <div class="lf-hero-copy">
    <p class="lf-kicker">The unofficial GTA VI database</p>
    <h1 class="lf-display lf-hero-title">Grand Theft Auto <span class="lf-vi">VI</span></h1>
    <p class="lf-hero-script" aria-hidden="true">Welcome to Leonida</p>
    <p class="lf-lede">Every confirmed character, region, vehicle, weapon and business, with Rockstar's official screenshots, all the trailers and the latest news, checked daily.</p>
    <div class="lf-count" data-release="${db.game.release}" aria-live="off">
      <p class="lf-count-label">Out ${fmtDate(db.game.release)} on PS5 &amp; Xbox Series X|S</p>
      <div class="lf-count-units"><span><b data-u="d">${days}</b><i>days</i></span><span><b data-u="h">--</b><i>hrs</i></span><span><b data-u="m">--</b><i>min</i></span><span><b data-u="s">--</b><i>sec</i></span></div>
    </div>
    <div class="lf-cta"><a class="lf-btn" href="${BASE}/trailers/${latest.slug}/">Watch the ${esc(latest.title)}</a><a class="lf-btn lf-ghost" href="#database">Browse the database</a></div>
  </div>
</section>
${adSlot('leader')}
<section class="lf-section lf-facts-wrap" aria-labelledby="facts-h">
  <h2 class="lf-sr" id="facts-h">GTA 6 at a glance</h2>
  <dl class="lf-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
</section>
<section class="lf-section" aria-labelledby="news-h">
  <div class="lf-sechead"><h2 class="lf-h2" id="news-h">Latest news</h2><a class="lf-more" href="${BASE}/news/">All news →</a></div>
  <ol class="lf-news">${news.slice(0, 4).map(newsItem).join('')}</ol>
</section>
<section class="lf-section" aria-labelledby="chars-h">
  <div class="lf-sechead"><h2 class="lf-h2" id="chars-h">Characters</h2><a class="lf-more" href="${BASE}/characters/">All ${db.characters.length} →</a></div>
  ${grid('characters', db.characters.filter((c) => c.images.length >= 4))}
</section>
${adSlot('infeed')}
<section class="lf-section" aria-labelledby="places-h">
  <div class="lf-sechead"><h2 class="lf-h2" id="places-h">Welcome to Leonida</h2><a class="lf-more" href="${BASE}/places/">The map →</a></div>
  ${grid('places', db.places)}
</section>
<section class="lf-section lf-band" aria-labelledby="tr-h">
  <div class="lf-sechead"><h2 class="lf-h2" id="tr-h">Trailers</h2><a class="lf-more" href="${BASE}/trailers/">All ${videos.length} videos →</a></div>
  <div class="lf-videos">${videos.slice(0, 3).map((v) => `<article class="lf-video">${yt(v)}<h3><a href="${BASE}/trailers/${v.slug}/">${esc(v.title)}</a></h3><p>${fmtDate(v.date)}</p></article>`).join('')}</div>
</section>
<section class="lf-section" id="database" aria-labelledby="db-h">
  <div class="lf-sechead"><h2 class="lf-h2" id="db-h">The database</h2></div>
  <div class="lf-tiles">${tiles.map(([s, l, n, im]) => `<a class="lf-tile" href="${BASE}/${s}/">${img(im, { alt: '' })}<span><b>${l}</b><i>${n} entries</i></span></a>`).join('')}</div>
</section>
<section class="lf-section" aria-labelledby="faq-h">
  <div class="lf-sechead"><h2 class="lf-h2" id="faq-h">Quick answers</h2><a class="lf-more" href="${BASE}/faq/">All questions →</a></div>
  <div class="lf-faq">${db.faq.slice(0, 5).map(faqItem).join('')}</div>
</section>
${credit}`,
  }));

  function newsItem(n) {
    return `<li class="lf-newsitem"><time datetime="${esc(n.date)}">${fmtDate(n.date)}</time><h3>${esc(n.title)}</h3><p>${esc(n.summary)}</p><p class="lf-src">Source: ${esc(n.source)}${n.video ? ` · <a href="https://www.youtube.com/watch?v=${esc(n.video)}" target="_blank" rel="noopener">Watch ↗</a>` : ''}</p></li>`;
  }
  function faqItem(f) { return `<details class="lf-q"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`; }

  // ── database sections ──
  for (const [sec, cfg] of Object.entries(SECTIONS)) {
    const list = db[sec];
    const extra = sec === 'characters'
      ? `<aside class="lf-note"><b>Voice cast:</b> ${esc(db.cast.note)}</aside>`
      : sec === 'places' ? `<aside class="lf-note"><b>Map size and layout:</b> Rockstar hasn't published an official map yet. We'll add it the moment it appears.</aside>` : '';
    write(`gta6/${sec}`, layout({
      p: `${BASE}/${sec}/`, title: `${cfg.title} | ${BRAND}`, desc: cfg.desc, section: sec,
      image: ogImage(list.find((e) => e.images?.length)?.images[0]), crumbs: [[cfg.label, `${BASE}/${sec}/`]], jsonld: [itemList(sec, list)],
      body: `${head(`GTA VI · ${plural(list.length, cfg.one)}`, `GTA 6 ${cfg.label}`, cfg.intro)}
${adSlot('leader')}
<section class="lf-section">${extra}${grid(sec, list, { filter: true, adEvery: 6 })}</section>
${credit}`,
    }));

    list.forEach((e, idx) => {
      const others = list.filter((o) => o !== e).slice(0, 6);
      const rows = [
        ['Status', e.status === 'confirmed' ? 'Confirmed by Rockstar Games' : 'Reported (not yet confirmed by Rockstar)'],
        ...(e.role ? [['Role', e.role]] : []), ...(e.brand ? [['Manufacturer', e.brand]] : []), ...(e.type ? [['Type', e.type]] : []),
        ...(e.where ? [['Where it appears', e.where]] : []), ...(e.inspiration ? [['Real-world inspiration', `${e.inspiration} (fan consensus)`]] : []),
        ['Source', e.source || (e.status === 'confirmed' ? 'Rockstar Games: official GTA VI site and media' : sec === 'vehicles' || sec === 'weapons' ? 'Fan identification from official trailer footage' : 'Press reports')],
      ];
      const [first, ...rest] = e.images || [];
      const title = sec === 'characters' ? `${e.name} in GTA 6: Bio, Role and Screenshots` : sec === 'places' ? `${e.name} in GTA 6: Location Guide and Screenshots` : `${e.name} in GTA 6`;
      const desc = `${e.summary} ${e.status === 'confirmed' ? 'Confirmed by Rockstar Games.' : 'Reported, not yet confirmed by Rockstar.'}`.slice(0, 300);
      const prev = list[(idx - 1 + list.length) % list.length], next = list[(idx + 1) % list.length];
      write(`gta6/${sec}/${e.slug}`, layout({
        p: entryUrl(sec, e), title: `${title} | ${BRAND}`, desc, section: sec, type: 'article', image: ogImage(first),
        crumbs: [[cfg.label, `${BASE}/${sec}/`], [e.name, entryUrl(sec, e)]],
        jsonld: [{ '@context': 'https://schema.org', '@type': 'WebPage', name: `${e.name} (GTA 6)`, description: e.summary, url: `${siteUrl}${entryUrl(sec, e)}`, dateModified: updated, about: { '@type': 'VideoGame', name: db.game.title }, ...(first ? { primaryImageOfPage: ogImage(first) } : {}) }],
        body: `<article class="lf-entry">
  <div class="lf-entry-main">
    ${first ? `<figure class="lf-entry-hero"><a href="${BASE}/img/${first}.webp" data-lb="${esc(e.slug)}">${img(first, { eager: true, sizes: '(min-width: 1100px) 66vw, 100vw' })}</a></figure>` : `<div class="lf-entry-hero lf-ph lf-ph-big"><span>${esc(e.type || cfg.one)}</span></div>`}
    <header class="lf-entry-head">${badge(e.status)}<p class="lf-kicker">GTA VI ${esc(cfg.one)}</p><h1 class="lf-display">${esc(e.name)}</h1>${e.quote ? `<p class="lf-quote">“${esc(e.quote)}”</p>` : ''}</header>
    <p class="lf-lede">${esc(e.summary)}</p>
    ${adSlot('infeed')}
    <dl class="lf-table">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    ${e.facts?.length ? `<h2 class="lf-h3">What we know</h2><ul class="lf-list">${e.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
    ${rest.length ? `<h2 class="lf-h3">Screenshots</h2><div class="lf-shots">${rest.map((s) => `<a href="${BASE}/img/${s}.webp" data-lb="${esc(e.slug)}">${img(s, { sizes: '(min-width: 1100px) 22vw, 50vw' })}</a>`).join('')}</div>` : ''}
    ${first ? credit : ''}
    <nav class="lf-pager" aria-label="More ${cfg.label.toLowerCase()}"><a href="${entryUrl(sec, prev)}"><i>Previous</i>${esc(prev.name)}</a><a href="${entryUrl(sec, next)}"><i>Next</i>${esc(next.name)}</a></nav>
  </div>
  <aside class="lf-entry-side">
    ${adSlot('side')}
    <p class="lf-foot-h">More ${cfg.label.toLowerCase()}</p>
    <ul class="lf-mini">${others.map((o) => `<li><a href="${entryUrl(sec, o)}">${o.images?.[0] ? img(o.images[0], { alt: '', sizes: '120px' }) : '<span class="lf-ph"></span>'}<span>${esc(o.name)}</span></a></li>`).join('')}</ul>
    <a class="lf-more" href="${BASE}/${sec}/">All ${cfg.label.toLowerCase()} →</a>
  </aside>
</article>`,
      }));
    });
  }

  // ── editions ──
  write('gta6/editions', layout({
    p: `${BASE}/editions/`, title: `GTA 6 Editions, Price and Pre-Order Bonus: Standard vs Ultimate | ${BRAND}`, section: 'editions',
    desc: 'GTA 6 Standard vs Ultimate Edition: price, everything in the Ultimate Edition, the Vintage Vice City Pack pre-order bonus and the Vice City Collection collector\'s box.',
    image: ogImage('ultimate-edition-01'), crumbs: [['Editions', `${BASE}/editions/`]],
    body: `${head('GTA VI · Buying guide', 'Editions &amp; pre-order', 'What each version of GTA VI includes. US prices come from store listings reported in June 2026; UK prices vary by store.')}
${adSlot('leader')}
<section class="lf-section lf-editions">${db.editions.map((ed) => `<article class="lf-edition" id="${ed.slug}">
  ${ed.images[0] ? `<a class="lf-edition-media" href="${BASE}/img/${ed.images[0]}.webp" data-lb="editions">${img(ed.images[0], { sizes: '(min-width: 900px) 45vw, 100vw' })}</a>` : ''}
  <div class="lf-edition-body">${badge(ed.status)}<h2 class="lf-h2">${esc(ed.name)}</h2>
    <p class="lf-price">${esc(ed.price)}${ed.priceStatus === 'reported' ? ' <span class="lf-badge lf-rep">Reported price</span>' : ''}</p>
    <p>${esc(ed.summary)}</p>
    ${ed.items.length ? `<ul class="lf-list lf-cols">${ed.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
    ${ed.images.length > 1 ? `<div class="lf-shots lf-shots-sm">${ed.images.slice(1).map((s) => `<a href="${BASE}/img/${s}.webp" data-lb="editions">${img(s, { sizes: '200px' })}</a>`).join('')}</div>` : ''}
    <p class="lf-src">Source: ${esc(ed.source)}</p>
  </div>
</article>`).join(adSlot('infeed'))}</section>
<section class="lf-section"><h2 class="lf-h2">Physical copies</h2><p class="lf-prose">Reports from June 2026 say physical copies of GTA VI come as a download code in a box rather than a disc. <span class="lf-badge lf-rep">Reported</span></p></section>
${credit}`,
  }));

  // ── trailers ──
  write('gta6/trailers', layout({
    p: `${BASE}/trailers/`, title: `GTA 6 Trailers: Every Official Video, Trailer 1 to the Launch Trailer | ${BRAND}`, section: 'trailers',
    desc: `Watch every official GTA 6 trailer and video from Rockstar Games: the Launch Trailer, An Extended Look, Trailer 2, Trailer 1 and more. ${videos.length} videos.`,
    image: `https://i.ytimg.com/vi/${latest.youtube}/hqdefault.jpg`, crumbs: [['Trailers', `${BASE}/trailers/`]],
    jsonld: videos.slice(0, 10).map(videoLd),
    body: `${head(`GTA VI · ${plural(videos.length, 'video')}`, 'Trailers &amp; videos', 'Every official GTA VI video from Rockstar Games, newest first. Videos load from YouTube only when you press play.')}
<section class="lf-section"><div class="lf-player">${yt(latest, { big: true })}<div><p class="lf-kicker">Latest · ${fmtDate(latest.date)}</p><h2 class="lf-h2">${esc(latest.title)}</h2><p>${esc(latest.summary)}</p></div></div></section>
${adSlot('leader')}
<section class="lf-section"><div class="lf-videos">${videos.slice(1).map((v) => `<article class="lf-video">${yt(v)}<h3><a href="${BASE}/trailers/${v.slug}/">${esc(v.title)}</a></h3><p>${fmtDate(v.date)}</p></article>`).join('')}</div></section>`,
  }));
  for (const v of videos) {
    write(`gta6/trailers/${v.slug}`, layout({
      p: `${BASE}/trailers/${v.slug}/`, title: `GTA 6 ${v.title} (${fmtDate(v.date)}) | ${BRAND}`, section: 'trailers', type: 'video.other',
      desc: `Watch the official Grand Theft Auto VI ${v.title}, released by Rockstar Games on ${fmtDate(v.date)}. ${v.summary}`.slice(0, 300),
      image: `https://i.ytimg.com/vi/${v.youtube}/hqdefault.jpg`, crumbs: [['Trailers', `${BASE}/trailers/`], [v.title, `${BASE}/trailers/${v.slug}/`]], jsonld: [videoLd(v)],
      body: `${head(`Official video · ${fmtDate(v.date)}`, `GTA 6 ${esc(v.title)}`, esc(v.summary))}
<section class="lf-section">${yt(v, { big: true })}<p class="lf-src">Video by Rockstar Games, embedded from YouTube. <a href="https://www.youtube.com/watch?v=${esc(v.youtube)}" target="_blank" rel="noopener">Watch on YouTube ↗</a></p></section>
${adSlot('leader')}
<section class="lf-section"><h2 class="lf-h2">More videos</h2><div class="lf-videos">${videos.filter((o) => o !== v).slice(0, 3).map((o) => `<article class="lf-video">${yt(o)}<h3><a href="${BASE}/trailers/${o.slug}/">${esc(o.title)}</a></h3><p>${fmtDate(o.date)}</p></article>`).join('')}</div></section>`,
    }));
  }

  // ── music ──
  const m = db.music;
  write('gta6/music', layout({
    p: `${BASE}/music/`, title: `GTA 6 Soundtrack, Radio Stations and Score by Justice | ${BRAND}`, section: 'music',
    desc: `GTA 6 music: the original score by Justice (${m.score.tracks} tracks, ${fmtDate(m.score.release)}), Grand Theft Auto VI: The Album (${m.album.tracks} tracks) with Travis Scott, Cardi B and more, and every confirmed radio station.`,
    image: ogImage('vice-city-07'), crumbs: [['Music', `${BASE}/music/`]],
    jsonld: [m.album, m.score].map((a) => ({ '@context': 'https://schema.org', '@type': 'MusicAlbum', name: a.title, numTracks: a.tracks, datePublished: a.release, byArtist: { '@type': a.artist ? 'MusicGroup' : 'Organization', name: a.artist || 'Various artists' } })),
    body: `${head('GTA VI · Soundtrack', 'Music &amp; radio', 'The score, the album and the stations you\'ll hear driving around Leonida, from Rockstar\'s official music announcements.')}
${adSlot('leader')}
<section class="lf-section lf-albums">${[m.album, m.score].map((a) => `<article class="lf-album">${badge('confirmed')}<p class="lf-kicker">${fmtDate(a.release)} · ${a.tracks} tracks</p><h2 class="lf-h2">${esc(a.title)}</h2>${a.artist ? `<p class="lf-price">by ${esc(a.artist)}</p>` : ''}<p>${esc(a.summary)}</p><h3 class="lf-h3">${a.artist ? 'Singles out now' : 'Announced tracks'}</h3><ol class="lf-tracks">${a.singles.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></article>`).join('')}</section>
${adSlot('infeed')}
<section class="lf-section"><h2 class="lf-h2">Radio stations</h2><p class="lf-prose">Rockstar has described these stations and their hosts. Station names are still to be announced.</p>
<div class="lf-radio">${m.radio.map((r, i) => `<div class="lf-station"><span class="lf-dial" aria-hidden="true">${(88.1 + i * 3.4).toFixed(1)}</span><b>${esc(r.genre)}</b><i>Hosted by ${esc(r.hosts)}</i></div>`).join('')}</div>
<p class="lf-src">Source: ${esc(m.source)}</p></section>`,
  }));

  // ── gallery ──
  const groups = [];
  for (const i of images) {
    const label = i.group;
    let g = groups.find((x) => x.label === label);
    if (!g) groups.push(g = { label, kind: i.kind, items: [] });
    g.items.push(i);
  }
  const order = { people: 0, places: 1, edition: 2 };
  groups.sort((a, b) => order[a.kind] - order[b.kind]);
  write('gta6/gallery', layout({
    p: `${BASE}/gallery/`, title: `GTA 6 Screenshots: ${images.length} Official Images in HD | ${BRAND}`, section: 'gallery',
    desc: `All ${images.length} official GTA 6 screenshots and artwork from Rockstar's media pack, sorted by character and region: Jason, Lucia, Vice City, the Keys, Grassrivers and more.`,
    image: ogImage('vice-city-03'), crumbs: [['Gallery', `${BASE}/gallery/`]],
    jsonld: [{ '@context': 'https://schema.org', '@type': 'ImageGallery', name: 'Official GTA VI screenshots', url: `${siteUrl}${BASE}/gallery/`, copyrightHolder: { '@type': 'Organization', name: 'Rockstar Games' } }],
    body: `${head(`GTA VI · ${images.length} images`, 'Gallery', 'Every image from Rockstar\'s official GTA VI media pack, which Rockstar shares for fans to download and share. Tap any image to view it full size.')}
<nav class="lf-jump" aria-label="Jump to">${groups.map((g) => `<a href="#${slugify(g.label)}">${esc(g.label)}</a>`).join('')}</nav>
${groups.map((g, gi) => `<section class="lf-section" id="${slugify(g.label)}"><h2 class="lf-h2">${esc(g.label)} <small>${g.items.length}</small></h2><div class="lf-shots lf-shots-gallery">${g.items.map((i) => `<a href="${BASE}/img/${i.slug}.webp" data-lb="gallery">${img(i.slug, { sizes: '(min-width: 1100px) 25vw, 50vw' })}</a>`).join('')}</div></section>${gi % 3 === 2 ? adSlot('infeed') : ''}`).join('')}
${credit}`,
  }));

  // ── news ──
  write('gta6/news', layout({
    p: `${BASE}/news/`, title: `GTA 6 News: Latest Updates, Checked Daily | ${BRAND}`, section: 'news',
    desc: `The latest GTA 6 news, updated daily: release date, trailers, editions, music and every new detail from Rockstar Games. Last update ${fmtDate(updated)}.`,
    image: ogImage('vice-city-01'), crumbs: [['News', `${BASE}/news/`]],
    jsonld: [{ '@context': 'https://schema.org', '@type': 'ItemList', name: 'GTA 6 news', itemListElement: news.slice(0, 20).map((n, i) => ({ '@type': 'ListItem', position: i + 1, name: n.title })) }],
    body: `${head('GTA VI · Updated daily', 'News', `New trailers and videos from Rockstar's channel appear here automatically, and the database is checked against Rockstar's announcements every day. Last update: ${fmtDate(updated)}.`)}
${adSlot('leader')}
<section class="lf-section"><ol class="lf-news lf-news-full">${news.map((n, i) => newsItem(n) + (i === 3 ? `<li class="lf-newsad">${adSlot('infeed')}</li>` : '')).join('')}</ol></section>`,
  }));

  // ── faq ──
  write('gta6/faq', layout({
    p: `${BASE}/faq/`, title: `GTA 6 FAQ: Release Date, Price, PC, Characters and More | ${BRAND}`, section: 'faq',
    desc: 'Quick answers to the most asked GTA 6 questions: when it comes out, platforms, PC, price, pre-order bonus, Ultimate Edition, characters, map and soundtrack.',
    image: ogImage('jason-and-lucia-02'), crumbs: [['FAQ', `${BASE}/faq/`]],
    jsonld: [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: db.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }],
    body: `${head('GTA VI · Questions', 'Frequently asked', 'Short, sourced answers. If Rockstar hasn\'t confirmed something, we say so.')}
${adSlot('leader')}
<section class="lf-section"><div class="lf-faq lf-faq-open">${db.faq.map((f, i) => faqItem(f).replace('<details', i < 3 ? '<details open' : '<details')).join('')}</div></section>`,
  }));

  // ── about ──
  write('gta6/about', layout({
    p: `${BASE}/about/`, title: `About Leonida Files and Disclaimer | ${BRAND}`,
    desc: 'About Leonida Files, the unofficial GTA 6 database by Hex Modifications: how facts are checked and labelled, where images come from, and our disclaimer.',
    image: ogImage('vice-city-05'), crumbs: [['About', `${BASE}/about/`]],
    body: `${head('About', 'About Leonida Files', '')}
<section class="lf-section lf-prose">
  <p><b>Leonida Files is an unofficial fan site.</b> It isn't affiliated with, endorsed by or sponsored by Rockstar Games or Take-Two Interactive. Grand Theft Auto, GTA VI and all related names, logos, images and trademarks belong to their respective owners.</p>
  <h2 class="lf-h3">How we label facts</h2>
  <p><span class="lf-badge lf-ok">Confirmed</span> means Rockstar Games has said or shown it: the official GTA VI website, Newswire posts, trailers or media pack. <span class="lf-badge lf-rep">Reported</span> means it comes from press reports, store listings or fans identifying things in trailer footage. We don't list leaks or rumours about real people, so the voice cast stays empty until it's officially announced.</p>
  <h2 class="lf-h3">Images and videos</h2>
  <p>Screenshots and artwork are from Rockstar's official GTA VI media pack, which Rockstar shares for fans to download and share, and remain © Rockstar Games. Trailers are embedded from Rockstar's YouTube channel and only load when you press play.</p>
  <h2 class="lf-h3">Updates</h2>
  <p>New GTA VI videos from Rockstar's channel are picked up automatically, and the database is checked against Rockstar's announcements every day.</p>
  <h2 class="lf-h3">Privacy</h2>
  <p>This site doesn't set cookies or run analytics. Fonts load from Google Fonts. When advertising is switched on, ads are served by Google, which may use cookies, and you'll be asked for consent first where the law requires it.</p>
  <h2 class="lf-h3">Contact</h2>
  <p>Spotted a mistake, or need something removed? Email <a href="mailto:hexmodifications@icloud.com">hexmodifications@icloud.com</a>.</p>
  <p>Leonida Files is built by <a href="/">Hex Modifications</a>.</p>
</section>`,
  }));

  // little sun icon for tabs
  fs.writeFileSync(path.join(out, 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffcf6b"/><stop offset=".5" stop-color="#ff4f8b"/><stop offset="1" stop-color="#8a3cf0"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="#0d0716"/><circle cx="32" cy="32" r="20" fill="url(#g)"/><g fill="#0d0716"><rect x="10" y="36" width="44" height="2.5"/><rect x="10" y="42" width="44" height="3"/><rect x="10" y="48" width="44" height="4"/></g></svg>`);
  log(`gta6: ${urls.length} pages built (${news.length} news items, ${videos.length} videos)`);
  return { urls, updated };
}

function decode(s) { return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }

// standalone: node scripts/build-gta6.mjs
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dist = path.join(root, 'dist');
  fs.mkdirSync(path.join(dist, 'gta6'), { recursive: true });
  fs.cpSync(path.join(root, 'public', 'gta6'), path.join(dist, 'gta6'), { recursive: true });
  const site = JSON.parse(fs.readFileSync(path.join(root, 'data', 'site.json'), 'utf8'));
  await buildGta6({ root, dist, siteUrl: (process.env.SITE_URL || 'https://hex-modifications.github.io').replace(/\/$/, ''), site, fetchFeed: process.env.SKIP_FEED !== '1' });
}

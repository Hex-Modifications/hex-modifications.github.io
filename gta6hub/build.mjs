// Builds "GTA 6 Hub", the unofficial GTA VI database by Hex Modifications, into dist/gta6hub/.
// It is its own site (own name, look and navigation) that shares the Hex Modifications GitHub Pages deploy.
// Facts come from gta6hub/data/db.json, where every entry is marked "confirmed" (said or shown by Rockstar) or
// "reported" (press reports, store listings, or fan identification from trailers). Images are Rockstar's official
// media pack (gta6hub/data/images.json → gta6hub/public/img). On every build it also reads Rockstar's YouTube feed,
// so new GTA VI videos show up in News and Trailers without anyone touching the data.
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
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : (/s$/.test(w) ? 'es' : 's')}`;
const ext = (href, text, cls = '') => `<a${cls ? ` class="${cls}"` : ''} href="${esc(href)}" target="_blank" rel="noopener">${text}</a>`;

// the five database sections, each with a list page and one page per entry
const SECTIONS = {
  characters: { label: 'Characters', one: 'character', title: 'GTA 6 Characters: Jason, Lucia and Every Confirmed Character',
    desc: 'Every confirmed GTA 6 character: Jason Duval, Lucia Caminos, Cal Hampton, Boobie Ike, Dre\'Quan Priest, the Real Dimez, Raul Bautista and Brian Heder, with official bios, lines and screenshots.',
    intro: 'The people of Leonida, from Rockstar\'s official character profiles: two protagonists, a crew of hustlers, smugglers and wannabe stars, and everyone they owe money to.' },
  places: { label: 'Places', one: 'region', title: 'GTA 6 Locations: Vice City, Leonida Keys and Every Confirmed Region',
    desc: 'Every confirmed GTA 6 location in the state of Leonida: Vice City, the Leonida Keys, Grassrivers, Port Gellhorn, Ambrosia and Mount Kalaga National Park, with official screenshots.',
    intro: 'Leonida is Rockstar\'s take on modern Florida. These are the six regions Rockstar has named so far.' },
  vehicles: { label: 'Vehicles', one: 'vehicle', title: 'GTA 6 Vehicles: Every Confirmed Car, Bike and Boat',
    desc: 'Every GTA 6 car, bike and boat we know about: confirmed vehicles from Rockstar (Grotti Cheetah, Vapid Stanier, Squalo) and models fans have spotted in the trailers, clearly labelled.',
    intro: 'Confirmed entries come straight from Rockstar\'s announcements and media. Reported ones were identified by fans in trailer footage.' },
  weapons: { label: 'Weapons', one: 'weapon', title: 'GTA 6 Weapons: Every Confirmed and Spotted Gun',
    desc: 'Every GTA 6 weapon known so far: the Ultimate Edition revolvers and engraved sidearms, plus the shotguns, rifles, SMGs and melee weapons seen in the trailers.',
    intro: 'Edition-exclusive weapons are confirmed by Rockstar. Everything seen only in trailer footage is marked as reported until it\'s officially named.' },
  businesses: { label: 'Businesses', one: 'business', title: 'GTA 6 Businesses, Shops and Locations',
    desc: 'Every confirmed GTA 6 business and shop: Only Raw Records, the Jack of Hearts, Electric Fang Tattoo, Rideout Customs, Sara\'s Salon, Stock 305 and more.',
    intro: 'Clubs, labels, shops and fronts. Some are part of the story, others come with the Ultimate Edition.' },
};

const NAV = [['news', 'News'], ['map', 'Map'], ['characters', 'Characters'], ['places', 'Places'], ['vehicles', 'Vehicles'], ['weapons', 'Weapons'],
  ['trailers', 'Trailers'], ['music', 'Music'], ['timeline', 'Timeline'], ['editions', 'Pre-order']];
const FOOT = [
  ['Database', [['characters', 'Characters'], ['places', 'Places'], ['vehicles', 'Vehicles'], ['weapons', 'Weapons'], ['businesses', 'Businesses'], ['gallery', 'Gallery']]],
  ['Guides', [['map', 'Interactive map'], ['timeline', 'Timeline'], ['editions', 'Pre-order guide'], ['faq', 'FAQ'], ['news', 'News'], ['trailers', 'Trailers'], ['music', 'Music']]],
];

export async function buildGta6({ root, dist, siteUrl, site = {}, fetchFeed = true, log = console.log }) {
  const db = JSON.parse(fs.readFileSync(path.join(root, 'gta6hub', 'data', 'db.json'), 'utf8'));
  const images = JSON.parse(fs.readFileSync(path.join(root, 'gta6hub', 'data', 'images.json'), 'utf8'));
  const imgBy = Object.fromEntries(images.map((i) => [i.slug, i]));
  const L = db.links;
  const out = path.join(dist, 'gta6hub');
  const urls = [];
  const now = Date.now();

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
    return '';
  }

  // ── images ──
  const altFor = (slug) => { const i = imgBy[slug]; return i ? `${i.name}: official GTA VI ${i.kind === 'edition' ? 'artwork' : 'screenshot'}` : 'GTA VI screenshot'; };
  function img(slug, { alt = altFor(slug), eager = false, sizes = '(min-width: 1100px) 33vw, (min-width: 700px) 50vw, 100vw' } = {}) {
    const i = imgBy[slug];
    if (!i) return '';
    return `<img src="${BASE}/img/${slug}-sm.webp" srcset="${BASE}/img/${slug}-sm.webp 640w, ${BASE}/img/${slug}.webp ${i.w}w" sizes="${sizes}" width="${i.w}" height="${i.h}" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
  }
  const ogImage = (slug) => (imgBy[slug] ? `${siteUrl}${BASE}/img/${slug}.webp` : `${siteUrl}${BASE}/img/jason-and-lucia-01.webp`);
  const badge = (status) => (status === 'confirmed'
    ? '<span class="lf-badge lf-ok" title="Confirmed by Rockstar Games">Confirmed</span>'
    : '<span class="lf-badge lf-rep" title="Reported by press or spotted by fans, not confirmed by Rockstar">Reported</span>');
  const credit = `<p class="lf-credit">Images © Rockstar Games, from the ${ext(L.media, 'official GTA VI media pack')}.</p>`;

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
  // Spotify players load only when asked for (no third-party requests until then)
  const spotify = (kind, id, label, sub = '', tall = false) => `<div class="lf-spot${tall ? ' lf-spot-tall' : ''}"><button type="button" class="lf-spot-btn" data-spotify="${esc(kind)}/${esc(id)}" data-h="${tall ? 352 : 152}"><span class="lf-spot-ico" aria-hidden="true"></span><span><b>${esc(label)}</b>${sub ? `<em>${esc(sub)}</em>` : ''}<i>Play on Spotify</i></span></button></div>`;

  // ── page shell ──
  const fonts = 'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Big+Shoulders+Display:wght@700;800;900&display=swap';
  function layout({ p, title, desc, image, crumbs = [], body, jsonld = [], section = '', type = 'website', wide = false }) {
    const url = `${siteUrl}${p}`;
    urls.push({ loc: url, lastmod: updated, priority: p === `${BASE}/` ? '0.9' : crumbs.length > 1 ? '0.6' : '0.8' });
    const trail = [[BRAND, `${BASE}/`], ...crumbs];
    const ld = [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: trail.map(([name, href], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${siteUrl}${href}` })) }, ...jsonld];
    const frames = 'https://www.youtube-nocookie.com https://open.spotify.com';
    const csp = adClient
      ? `default-src 'self'; script-src 'self' https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https:; frame-src https:; media-src 'none'; base-uri 'self'; form-action 'none'; object-src 'none'`
      : `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://i.ytimg.com; connect-src 'self'; frame-src ${frames}; media-src 'none'; base-uri 'self'; form-action 'none'; object-src 'none'`;
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
<meta name="theme-color" content="#050407">
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
<link rel="stylesheet" href="${fonts}">
<link rel="stylesheet" href="${BASE}/gta6.css">
<script src="${BASE}/gta6.js" defer></script>
<script type="application/ld+json">${json(ld.length === 1 ? ld[0] : ld)}</script>
</head>
<body${section ? ` data-section="${section}"` : ''}>
<a class="lf-skip" href="#main">Skip to content</a>
<canvas class="lf-liquid" aria-hidden="true"></canvas>
<header class="lf-head"><div class="lf-head-in">
  <a class="lf-brand" href="${BASE}/" aria-label="${BRAND} home"><span class="lf-logo">GTA<b>6</b></span><span class="lf-logo-hub">Hub</span></a>
  <nav class="lf-nav" aria-label="Sections">${NAV.map(([s, l]) => `<a href="${BASE}/${s}/"${s === section ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
  <a class="lf-by" href="/" title="A Hex Modifications site"><img src="${BASE}/hex-logo.webp" width="34" height="34" alt="Hex Modifications"><span>by Hex<br>Modifications</span></a>
</div></header>
${crumbs.length ? `<nav class="lf-crumbs" aria-label="Breadcrumb"><ol>${trail.map(([n, h], i) => (i === trail.length - 1 ? `<li aria-current="page">${esc(n)}</li>` : `<li><a href="${h}">${esc(n)}</a></li>`)).join('')}</ol></nav>` : ''}
<main id="main"${wide ? ' class="lf-wide"' : ''}>
${body}
${adSlot('foot')}
</main>
<footer class="lf-foot">
  <div class="lf-foot-grid">
    <div class="lf-foot-about">
      <a class="lf-brand" href="${BASE}/"><span class="lf-logo">GTA<b>6</b></span><span class="lf-logo-hub">Hub</span></a>
      <p>Every confirmed fact about Grand Theft Auto VI in one place, checked and updated every day.</p>
      <a class="lf-by lf-by-foot" href="/"><img src="${BASE}/hex-logo.webp" width="40" height="40" alt="" loading="lazy"><span>A Hex Modifications site</span></a>
    </div>
    ${FOOT.map(([h, links]) => `<nav aria-label="${h}"><p class="lf-foot-h">${h}</p>${links.map(([s, l]) => `<a href="${BASE}/${s}/">${l}</a>`).join('')}</nav>`).join('\n    ')}
    <nav aria-label="Official"><p class="lf-foot-h">Official links</p>${ext(L.official, 'Rockstar: GTA VI')}${ext(L.newswire, 'Rockstar Newswire')}${ext(L.youtube, 'Rockstar on YouTube')}${ext(L.spotify, 'GTA VI on Spotify')}${ext(L.store, 'Rockstar Store')}<a href="${BASE}/about/">About this site</a></nav>
  </div>
  <p class="lf-legal">GTA 6 Hub is an unofficial fan site, not affiliated with Rockstar Games or Take-Two Interactive. Grand Theft Auto and all related names and trademarks belong to their owners. Screenshots and artwork © Rockstar Games. <em>Reported</em> entries come from press or fan sightings, not Rockstar.</p>
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
    if (/vintage|pre-order/i.test(e.where || '')) return L.official;
    return L.official;
  };

  // ── cards ──
  function card(sec, e) {
    const meta = sec === 'characters' ? e.role : sec === 'places' ? (e.inspiration ? `Inspired by ${e.inspiration}` : 'Region of Leonida') : [e.brand, e.type].filter(Boolean).join(' · ');
    const q = [e.name, e.aka, e.role, e.brand, e.type, e.where, e.inspiration].filter(Boolean).join(' ').toLowerCase();
    return `<a class="lf-card" href="${entryUrl(sec, e)}" data-status="${e.status}" data-q="${esc(q)}">
      <span class="lf-card-media${sec === 'characters' ? ' lf-portrait' : ''}">${e.images?.[0] ? img(e.images[0]) : `<span class="lf-ph"><span>${esc(e.type || SECTIONS[sec].one)}</span></span>`}</span>
      <span class="lf-card-body">${badge(e.status)}<span class="lf-card-title">${esc(e.name)}</span>${meta ? `<span class="lf-card-meta">${esc(meta)}</span>` : ''}</span>
    </a>`;
  }
  function grid(sec, list, { filter = false, adEvery = 0 } = {}) {
    const items = list.map((e, i) => card(sec, e) + (adEvery && (i + 1) % adEvery === 0 && i < list.length - 1 ? adSlot('infeed') : ''));
    const counts = { confirmed: list.filter((e) => e.status === 'confirmed').length, reported: list.filter((e) => e.status !== 'confirmed').length };
    const bar = filter ? `<div class="lf-tools" data-filter-for="g-${sec}">
      <label class="lf-search"><span class="lf-sr">Search ${SECTIONS[sec].label.toLowerCase()}</span><input type="search" placeholder="Search ${plural(list.length, SECTIONS[sec].one)}" autocomplete="off" data-filter-q></label>
      <div class="lf-chips" role="group" aria-label="Filter by status"><button type="button" aria-pressed="true" data-filter-s="all">All <b>${list.length}</b></button><button type="button" aria-pressed="false" data-filter-s="confirmed">Confirmed <b>${counts.confirmed}</b></button>${counts.reported ? `<button type="button" aria-pressed="false" data-filter-s="reported">Reported <b>${counts.reported}</b></button>` : ''}</div>
    </div>` : '';
    return `${bar}<div class="lf-grid${sec === 'characters' ? ' lf-grid-people' : ''}" id="g-${sec}">${items.join('')}</div>${filter ? '<p class="lf-empty" hidden>Nothing matches that yet. New entries are added as soon as Rockstar confirms them.</p>' : ''}`;
  }
  const itemList = (sec, list) => ({ '@context': 'https://schema.org', '@type': 'ItemList', name: SECTIONS[sec].title, numberOfItems: list.length,
    itemListElement: list.map((e, i) => ({ '@type': 'ListItem', position: i + 1, url: `${siteUrl}${entryUrl(sec, e)}`, name: e.name })) });
  const videoLd = (v) => ({ '@context': 'https://schema.org', '@type': 'VideoObject', name: `Grand Theft Auto VI: ${v.title}`, description: v.summary,
    uploadDate: `${v.date}T12:00:00+00:00`, thumbnailUrl: `https://i.ytimg.com/vi/${v.youtube}/hqdefault.jpg`, embedUrl: `https://www.youtube-nocookie.com/embed/${v.youtube}`,
    contentUrl: `https://www.youtube.com/watch?v=${v.youtube}`, publisher: { '@type': 'Organization', name: 'Rockstar Games' } });
  const gameLd = { '@context': 'https://schema.org', '@type': 'VideoGame', name: db.game.title, alternateName: ['GTA 6', 'GTA VI'],
    author: { '@type': 'Organization', name: db.game.developer }, publisher: { '@type': 'Organization', name: 'Rockstar Games' },
    datePublished: db.game.release, gamePlatform: db.game.platforms, genre: ['Action-adventure', 'Open world'], playMode: 'SinglePlayer',
    image: ogImage('jason-and-lucia-01'), url: L.official, characters: db.characters.slice(0, 8).map((c) => ({ '@type': 'Person', name: c.name })) };
  function newsItem(n) {
    return `<li class="lf-newsitem"><time datetime="${esc(n.date)}">${fmtDate(n.date)}</time><h3>${esc(n.title)}</h3><p>${esc(n.summary)}</p><p class="lf-src">${esc(n.source)}${n.video ? ` · <a href="https://www.youtube.com/watch?v=${esc(n.video)}" target="_blank" rel="noopener">Watch ↗</a>` : ''}</p></li>`;
  }
  const faqItem = (f) => `<details class="lf-q"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`;

  // ── home ──
  const latest = videos[0];
  const facts = [
    ['Release', fmtDate(db.game.release)], ['Platforms', db.game.platforms.join(', ')], ['PC', db.game.pc],
    ['Setting', 'Vice City, Leonida'], ['Protagonists', db.game.protagonists.join(' & ')], ['Price (US)', '$79.99 · $99.99 Ultimate'],
  ];
  const tiles = [
    ['map', 'Map', `${db.map.pois.length + db.map.regions.length} points`, 'leonida-keys-02'], ['vehicles', 'Vehicles', plural(db.vehicles.length, 'entry').replace('entrys', 'entries'), 'ultimate-edition-grotti-cheetah-02'],
    ['weapons', 'Weapons', `${db.weapons.length} entries`, 'ultimate-edition-hawk-and-little-morgan-revolvers-01'], ['businesses', 'Businesses', `${db.businesses.length} entries`, 'ultimate-edition-electric-fang-02'],
    ['editions', 'Pre-order', `${db.editions.length} editions`, 'vintage-vice-city-pack-01'], ['gallery', 'Gallery', `${images.length} images`, 'vice-city-03'],
  ];
  const upcoming = db.timeline.filter((t) => Date.parse(`${t.date}T23:59:59Z`) >= now).slice(0, 3);
  write('', layout({
    p: `${BASE}/`, title: 'GTA 6 Hub: Release Date, Map, Characters, Trailers & Daily News',
    desc: `Everything confirmed about GTA 6: the ${fmtDate(db.game.release)} release date, an interactive Leonida map, Jason and Lucia, every vehicle, weapon and business, trailers, music and daily news.`,
    image: ogImage('jason-and-lucia-01'),
    jsonld: [{ '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND, alternateName: ['GTA6 Hub', 'GTA VI Hub'], url: `${siteUrl}${BASE}/`, publisher: { '@type': 'Organization', name: 'Hex Modifications', url: `${siteUrl}/` } }, gameLd],
    body: `
<section class="lf-hero">
  <div class="lf-hero-media">${img('jason-and-lucia-01', { alt: 'Jason Duval and Lucia Caminos in an official GTA VI screenshot', eager: true, sizes: '100vw' })}</div>
  <div class="lf-hero-copy">
    <p class="lf-kicker">The GTA VI fan database</p>
    <h1 class="lf-display lf-hero-title">Grand Theft Auto <span class="lf-vi">VI</span></h1>
    <p class="lf-lede">Every confirmed character, place, vehicle and weapon, an interactive map, all the trailers and the latest news, checked daily.</p>
    <div class="lf-count" data-release="${db.game.release}">
      <p class="lf-count-label">Out ${fmtDate(db.game.release)} · PS5 &amp; Xbox Series X|S</p>
      <div class="lf-count-units"><span><b data-u="d">${days}</b><i>days</i></span><span><b data-u="h">--</b><i>hrs</i></span><span><b data-u="m">--</b><i>min</i></span><span><b data-u="s">--</b><i>sec</i></span></div>
    </div>
    <div class="lf-cta"><a class="lf-btn" href="${BASE}/trailers/${latest.slug}/"><span class="lf-btn-play" aria-hidden="true"></span>Watch the ${esc(latest.title)}</a><a class="lf-btn lf-ghost" href="${BASE}/map/">Explore the map</a></div>
  </div>
</section>
${adSlot('leader')}
<section class="lf-section" aria-labelledby="facts-h">
  <h2 class="lf-sr" id="facts-h">GTA 6 at a glance</h2>
  <dl class="lf-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
  <nav class="lf-quick" aria-label="Quick links"><a href="${BASE}/editions/">Pre-order guide</a><a href="${BASE}/timeline/">Full timeline</a><a href="${BASE}/faq/">Is it on PC?</a><a href="${BASE}/music/">Listen to the soundtrack</a>${ext(L.official, 'Official site ↗')}</nav>
</section>
<section class="lf-section lf-split" aria-labelledby="news-h">
  <div>
    ${sechead('news-h', 'Latest news', more(`${BASE}/news/`, 'All news'))}
    <ol class="lf-news lf-news-list">${news.slice(0, 4).map(newsItem).join('')}</ol>
  </div>
  <aside class="lf-upnext" aria-labelledby="up-h">
    <h2 class="lf-h3" id="up-h">Coming up</h2>
    <ol class="lf-tl lf-tl-mini">${upcoming.map((t) => `<li><time datetime="${t.date}">${fmtShort(t.date)}</time><b>${esc(t.title)}</b></li>`).join('')}</ol>
    ${more(`${BASE}/timeline/`, 'Timeline')}
  </aside>
</section>
<section class="lf-section" aria-labelledby="chars-h">
  ${sechead('chars-h', 'Characters', more(`${BASE}/characters/`, `All ${db.characters.length}`))}
  ${grid('characters', db.characters.filter((c) => c.images.length >= 4))}
</section>
${adSlot('infeed')}
<section class="lf-section" aria-labelledby="map-h">
  <a class="lf-mapteaser" href="${BASE}/map/">
    ${img('vice-city-02', { alt: '', sizes: '100vw' })}
    <span class="lf-mapteaser-copy"><span class="lf-kicker">Interactive</span><span class="lf-h2" id="map-h">Map of Leonida</span><span class="lf-mapteaser-text">Six regions and every named location so far. Tap a pin for screenshots and details.</span><span class="lf-btn">Open the map</span></span>
  </a>
</section>
<section class="lf-section" aria-labelledby="places-h">
  ${sechead('places-h', 'Places', more(`${BASE}/places/`, 'All regions'))}
  ${grid('places', db.places)}
</section>
<section class="lf-section" aria-labelledby="tr-h">
  ${sechead('tr-h', 'Trailers', more(`${BASE}/trailers/`, `All ${videos.length}`))}
  <div class="lf-videos">${videos.slice(0, 3).map(videoCard).join('')}</div>
</section>
<section class="lf-section" aria-labelledby="mu-h">
  ${sechead('mu-h', 'Soundtrack', more(`${BASE}/music/`, 'Music &amp; radio'))}
  <div class="lf-spots">${db.music.spotify.tracks.map((t) => spotify(t.type, t.id, t.song, t.artist)).join('')}</div>
</section>
<section class="lf-section" id="database" aria-labelledby="db-h">
  ${sechead('db-h', 'Explore')}
  <div class="lf-tiles">${tiles.map(([s, l, n, im]) => `<a class="lf-tile" href="${BASE}/${s}/">${img(im, { alt: '' })}<span><b>${l}</b><i>${n}</i></span></a>`).join('')}</div>
</section>
<section class="lf-section" aria-labelledby="faq-h">
  ${sechead('faq-h', 'Quick answers', more(`${BASE}/faq/`, 'All questions'))}
  <div class="lf-faq">${db.faq.slice(0, 5).map(faqItem).join('')}</div>
</section>
${credit}`,
  }));

  // ── database sections ──
  for (const [sec, cfg] of Object.entries(SECTIONS)) {
    const list = db[sec];
    const extra = sec === 'characters'
      ? `<aside class="lf-note"><b>Voice cast:</b> ${esc(db.cast.note)}</aside>`
      : sec === 'places' ? `<aside class="lf-note"><b>Looking for the map?</b> <a href="${BASE}/map/">Open the interactive map of Leonida →</a></aside>` : '';
    write(sec, layout({
      p: `${BASE}/${sec}/`, title: `${cfg.title} | ${BRAND}`, desc: cfg.desc, section: sec,
      image: ogImage(list.find((e) => e.images?.length)?.images[0]), crumbs: [[cfg.label, `${BASE}/${sec}/`]], jsonld: [itemList(sec, list)],
      body: `${head(`GTA VI · ${plural(list.length, cfg.one).replace('businesss', 'businesses')}`, `GTA 6 ${cfg.label}`, cfg.intro)}
${adSlot('leader')}
<section class="lf-section lf-tight">${extra}${grid(sec, list, { filter: true, adEvery: 6 })}</section>
${credit}`,
    }));

    list.forEach((e, idx) => {
      const others = list.filter((o) => o !== e).slice(0, 6);
      const src = sourceLink(sec, e);
      const rows = [
        ['Status', e.status === 'confirmed' ? 'Confirmed by Rockstar Games' : 'Reported, not yet confirmed by Rockstar'],
        ...(e.aka ? [[sec === 'characters' ? 'Members' : 'Details', e.aka]] : []),
        ...(e.role ? [['Role', e.role]] : []), ...(e.brand ? [['Manufacturer', e.brand]] : []), ...(e.type ? [['Type', e.type]] : []),
        ...(e.where ? [['Where it appears', e.where]] : []), ...(e.inspiration ? [['Real-world inspiration', `${e.inspiration} (fan consensus)`]] : []),
      ];
      const sourceText = e.source || (e.status === 'confirmed' ? 'Rockstar Games, official GTA VI site and media' : sec === 'vehicles' || sec === 'weapons' ? 'Fan identification from official trailer footage' : 'Press reports');
      const [hero, ...rest] = e.images || [];
      const lines = (e.lines || []).filter((l) => l !== e.quote);
      const rel = related(sec, e);
      const onMap = sec === 'places' && db.map.regions.some((r) => r.slug === e.slug);
      const pois = sec === 'places' ? db.map.pois.filter((q) => q.region === e.slug) : [];
      const title = sec === 'characters' ? `${e.name} in GTA 6: Bio, Quotes and Screenshots` : sec === 'places' ? `${e.name} in GTA 6: Location Guide and Screenshots` : `${e.name} in GTA 6`;
      const desc = `${e.summary} ${e.status === 'confirmed' ? 'Confirmed by Rockstar Games.' : 'Reported, not yet confirmed by Rockstar.'}`.slice(0, 300);
      const prev = list[(idx - 1 + list.length) % list.length], next = list[(idx + 1) % list.length];
      write(`${sec}/${e.slug}`, layout({
        p: entryUrl(sec, e), title: `${title} | ${BRAND}`, desc, section: sec, type: 'article', image: ogImage(hero),
        crumbs: [[cfg.label, `${BASE}/${sec}/`], [e.name, entryUrl(sec, e)]],
        jsonld: [{ '@context': 'https://schema.org', '@type': 'WebPage', name: `${e.name} (GTA 6)`, description: e.summary, url: `${siteUrl}${entryUrl(sec, e)}`, dateModified: updated, about: { '@type': 'VideoGame', name: db.game.title }, ...(hero ? { primaryImageOfPage: ogImage(hero) } : {}) }],
        body: `<article class="lf-entry">
  <div class="lf-entry-main">
    ${hero ? `<figure class="lf-entry-hero"><a href="${BASE}/img/${hero}.webp" data-lb="${esc(e.slug)}">${img(hero, { eager: true, sizes: '(min-width: 1100px) 66vw, 100vw' })}</a></figure>` : `<div class="lf-entry-hero lf-ph lf-ph-big"><span>${esc(e.type || cfg.one)}</span></div>`}
    <header class="lf-entry-head">${badge(e.status)}<p class="lf-kicker">GTA VI ${esc(cfg.one)}</p><h1 class="lf-display">${esc(e.name)}</h1>${e.quote ? `<p class="lf-quote">“${esc(e.quote)}”</p>` : ''}</header>
    <p class="lf-lede">${esc(e.summary)}</p>
    <div class="lf-actions">${src ? ext(src, 'Official page ↗', 'lf-more') : ''}${onMap ? more(`${BASE}/map/#${e.slug}`, 'See on the map') : ''}${/ultimate|vintage|pre-order/i.test(e.where || '') ? more(`${BASE}/editions/`, 'Pre-order guide') : ''}</div>
    ${adSlot('infeed')}
    <dl class="lf-table">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}<div><dt>Source</dt><dd>${src ? ext(src, esc(sourceText)) : esc(sourceText)}</dd></div></dl>
    ${lines.length ? `<h2 class="lf-h3">In their own words</h2><ul class="lf-lines">${lines.map((l) => `<li>“${esc(l)}”</li>`).join('')}</ul><p class="lf-src">Lines from Rockstar's official trailers and character profile. ${more(`${BASE}/trailers/`, 'Watch the trailers')}</p>` : ''}
    ${e.facts?.length ? `<h2 class="lf-h3">What we know</h2><ul class="lf-list">${e.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
    ${pois.length ? `<h2 class="lf-h3">Known locations here</h2><ul class="lf-list">${pois.map((q) => `<li><b>${esc(q.name)}</b>: ${esc(q.text)}</li>`).join('')}</ul>` : ''}
    ${rel.length ? `<h2 class="lf-h3">Connected</h2><div class="lf-rel">${rel.map(({ sec: s, e: o }) => `<a href="${entryUrl(s, o)}">${o.images?.[0] ? img(o.images[0], { alt: '', sizes: '80px' }) : '<span class="lf-ph"></span>'}<span><b>${esc(o.name)}</b><i>${esc(SECTIONS[s].one)}</i></span></a>`).join('')}</div>` : ''}
    ${rest.length ? `<h2 class="lf-h3">Screenshots</h2><div class="lf-shots">${rest.map((s) => `<a href="${BASE}/img/${s}.webp" data-lb="${esc(e.slug)}">${img(s, { sizes: '(min-width: 1100px) 22vw, 50vw' })}</a>`).join('')}</div>` : ''}
    ${hero ? credit : ''}
    <nav class="lf-pager" aria-label="More ${cfg.label.toLowerCase()}"><a href="${entryUrl(sec, prev)}"><i>Previous</i>${esc(prev.name)}</a><a href="${entryUrl(sec, next)}"><i>Next</i>${esc(next.name)}</a></nav>
  </div>
  <aside class="lf-entry-side">
    ${adSlot('side')}
    <p class="lf-foot-h">More ${cfg.label.toLowerCase()}</p>
    <ul class="lf-mini">${others.map((o) => `<li><a href="${entryUrl(sec, o)}">${o.images?.[0] ? img(o.images[0], { alt: '', sizes: '120px' }) : '<span class="lf-ph"></span>'}<span>${esc(o.name)}</span></a></li>`).join('')}</ul>
    ${more(`${BASE}/${sec}/`, `All ${cfg.label.toLowerCase()}`)}
  </aside>
</article>`,
      }));
    });
  }

  // ── interactive map ──
  const placeBy = Object.fromEntries(db.places.map((p) => [p.slug, p]));
  const mapData = {
    regions: db.map.regions.map((r) => { const p = placeBy[r.slug]; return { slug: r.slug, x: r.x, y: r.y, name: p.name, text: p.summary, images: p.images.slice(0, 4), url: entryUrl('places', p) }; }),
    pois: db.map.pois.filter((q) => q.region).map((q) => ({ ...q, url: q.link ? `${BASE}/${q.link}/` : '', region: placeBy[q.region]?.name || '' })),
  };
  const unplaced = db.map.pois.filter((q) => !q.region);
  const coast = smoothPath([[40,150],[120,128],[300,122],[470,118],[560,112],[640,108],[668,150],[690,230],[718,320],[752,410],[785,500],[815,590],[842,670],[866,740],[884,800],[888,860],[872,920],[840,965],[800,990],[760,985],[715,955],[680,915],[650,870],[615,815],[585,760],[560,700],[545,640],[520,580],[498,520],[470,470],[440,430],[405,395],[360,360],[310,330],[260,300],[205,285],[150,282],[95,285],[40,290]]);
  const keys = [[780, 1014], [746, 1030], [710, 1043], [674, 1055], [638, 1065], [602, 1074], [566, 1082], [532, 1088]];
  write('map', layout({
    p: `${BASE}/map/`, title: `GTA 6 Map: Interactive Map of Leonida and Vice City | ${BRAND}`, section: 'map', wide: true,
    desc: 'Interactive GTA 6 map of Leonida: Vice City, the Leonida Keys, Grassrivers, Port Gellhorn, Ambrosia and Mount Kalaga, with every named location, official screenshots and links.',
    image: ogImage('leonida-keys-02'), crumbs: [['Map', `${BASE}/map/`]],
    body: `${head('GTA VI · Interactive', 'Map of Leonida', 'Six official regions and every named location so far. Tap a region or pin for screenshots and details.')}
<section class="lf-section lf-tight">
  <div class="lf-map" data-map>
    <div class="lf-map-stage">
      <svg class="lf-map-svg" viewBox="0 0 1000 1120" role="img" aria-label="Illustrated map of Leonida with its six regions">
        <defs>
          <radialGradient id="mg-glow"><stop offset="0" stop-color="#ff6b8b" stop-opacity=".45"/><stop offset=".6" stop-color="#a46bff" stop-opacity=".12"/><stop offset="1" stop-color="#a46bff" stop-opacity="0"/></radialGradient>
          <linearGradient id="mg-land" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b1622"/><stop offset="1" stop-color="#120e18"/></linearGradient>
          <pattern id="mg-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#fff" stroke-opacity=".035"/></pattern>
        </defs>
        <g class="lf-map-view">
          <rect x="-1000" y="-1000" width="3000" height="3200" fill="url(#mg-grid)"/>
          <path class="lf-map-land" d="${coast}"/>
          <ellipse class="lf-map-lake" cx="720" cy="560" rx="34" ry="28"/>
          ${keys.map(([x, y], i) => `<ellipse class="lf-map-land" cx="${x}" cy="${y}" rx="${16 - (i % 3) * 2}" ry="6" transform="rotate(-14 ${x} ${y})"/>`).join('')}
          ${mapData.regions.map((r) => `<circle class="lf-map-zone" cx="${r.x}" cy="${r.y}" r="115" fill="url(#mg-glow)"/>`).join('')}
          ${mapData.regions.map((r, i) => `<g class="lf-map-region" data-region="${i}" tabindex="0" role="button" aria-label="${esc(r.name)}" transform="translate(${r.x} ${r.y})"><g class="lf-ms"><circle r="7"/><text y="-16">${esc(r.name)}</text></g></g>`).join('')}
          ${mapData.pois.map((q, i) => `<g class="lf-pin lf-pin-${q.kind}" data-poi="${i}" data-kind="${q.kind}" tabindex="0" role="button" aria-label="${esc(q.name)}" transform="translate(${q.x} ${q.y})"><g class="lf-ms"><circle r="9"/><circle class="lf-pin-dot" r="3.5"/></g></g>`).join('')}
        </g>
      </svg>
      <div class="lf-map-ui">
        <div class="lf-map-zoom"><button type="button" data-zoom="1" aria-label="Zoom in">+</button><button type="button" data-zoom="-1" aria-label="Zoom out">−</button><button type="button" data-zoom="0" aria-label="Reset view">⟲</button></div>
        <div class="lf-chips lf-map-filter" role="group" aria-label="Show"><button type="button" aria-pressed="true" data-kind="all">All</button><button type="button" aria-pressed="false" data-kind="landmark">Landmarks</button><button type="button" aria-pressed="false" data-kind="business">Businesses</button><button type="button" aria-pressed="false" data-kind="story">Story</button></div>
      </div>
    </div>
    <aside class="lf-map-panel" aria-live="polite"><div class="lf-map-panel-in"><p class="lf-kicker">Leonida</p><h2 class="lf-h2">Pick a region or pin</h2><p>Drag to move, scroll or pinch to zoom. Region names are Rockstar's; pins are named locations from Rockstar's profiles and screenshots.</p><p class="lf-src">${esc(db.map.note)}</p></div></aside>
  </div>
  <script type="application/json" id="lf-map-data">${json(mapData)}</script>
</section>
<section class="lf-section">
  ${sechead('loc-h', 'All known locations')}
  <div class="lf-loclist">${mapData.regions.map((r) => `<div class="lf-locgroup" id="loc-${r.slug}"><h3><a href="${r.url}">${esc(r.name)}</a></h3><ul>${mapData.pois.filter((q) => q.region === r.name).map((q) => `<li><b>${esc(q.name)}</b> ${badge(q.status)}<span>${esc(q.text)}</span></li>`).join('') || '<li><span>No named locations confirmed here yet.</span></li>'}</ul></div>`).join('')}
  ${unplaced.length ? `<div class="lf-locgroup"><h3>Location not yet known</h3><ul>${unplaced.map((q) => `<li><b>${esc(q.name)}</b> ${badge(q.status)}<span>${esc(q.text)}</span></li>`).join('')}</ul></div>` : ''}</div>
</section>
${adSlot('leader')}`,
  }));

  // ── timeline ──
  const years = [...new Set(db.timeline.map((t) => t.date.slice(0, 4)))];
  write('timeline', layout({
    p: `${BASE}/timeline/`, title: `GTA 6 Timeline: Every Announcement, Trailer and Delay | ${BRAND}`, section: 'timeline',
    desc: 'The full GTA 6 timeline from Rockstar\'s first confirmation in 2022 to release on November 19, 2026: trailers, delays, pre-orders, the soundtrack and what\'s next.',
    image: ogImage('vice-city-04'), crumbs: [['Timeline', `${BASE}/timeline/`]],
    body: `${head('GTA VI · 2022 to now', 'Timeline', 'Every major GTA VI moment, from the first confirmation to launch day and beyond.')}
${adSlot('leader')}
<section class="lf-section lf-tight">${years.map((y) => `<h2 class="lf-year">${y}</h2><ol class="lf-tl">${db.timeline.filter((t) => t.date.startsWith(y)).map((t) => {
      const soon = Date.parse(`${t.date}T23:59:59Z`) >= now, v = t.video && videoBy[t.video];
      return `<li class="${soon ? 'is-next' : ''}"><time datetime="${t.date}">${fmtDate(t.date)}</time><div class="lf-tl-card"><h3>${esc(t.title)}${soon ? ' <span class="lf-badge lf-soon">Upcoming</span>' : ''}</h3><p>${esc(t.text)}</p>${t.status !== 'confirmed' ? badge(t.status) : ''}${v ? `<div class="lf-tl-video">${yt(v)}</div>` : ''}</div></li>`;
    }).join('')}</ol>`).join('')}</section>`,
  }));

  // ── editions / pre-order guide ──
  const [std, ult] = db.editions;
  write('editions', layout({
    p: `${BASE}/editions/`, title: `GTA 6 Pre-Order Guide: Editions, Price and Bonuses | ${BRAND}`, section: 'editions',
    desc: 'GTA 6 pre-order guide: Standard vs Ultimate Edition price and contents, the Vintage Vice City Pack bonus, the collector\'s box and where to buy.',
    image: ogImage('ultimate-edition-01'), crumbs: [['Pre-order guide', `${BASE}/editions/`]],
    body: `${head('GTA VI · Buying guide', 'Pre-order guide', 'What each version includes, what it costs, and where to buy it. US prices come from store listings reported in June 2026; UK prices vary by store.')}
<section class="lf-section lf-tight">
  <div class="lf-buy">
    <a class="lf-buycard" href="${esc(L.official)}" target="_blank" rel="noopener"><b>Rockstar Games</b><span>Official pre-order page with every store</span><i>Open ↗</i></a>
    <a class="lf-buycard" href="${esc(L.playstation)}" target="_blank" rel="noopener"><b>PlayStation 5</b><span>PlayStation's GTA VI page</span><i>Open ↗</i></a>
    <a class="lf-buycard" href="https://www.xbox.com/en-GB/search?q=Grand+Theft+Auto+VI" target="_blank" rel="noopener"><b>Xbox Series X|S</b><span>Search the Microsoft Store</span><i>Open ↗</i></a>
    <a class="lf-buycard" href="${esc(L.store)}" target="_blank" rel="noopener"><b>Rockstar Store</b><span>The Vice City Collection and merch</span><i>Open ↗</i></a>
  </div>
  <div class="lf-compare" role="table" aria-label="Standard vs Ultimate Edition">
    <div role="row" class="lf-compare-head"><span role="columnheader"></span><span role="columnheader">Standard</span><span role="columnheader">Ultimate</span></div>
    ${[['Price (US, reported)', std.price.replace(' (US)', ''), ult.price.replace(' (US)', '')], ['Grand Theft Auto VI', '✓', '✓'], ['Vintage Vice City Pack (with pre-order)', '✓', '✓'], ['Exclusive vehicles, weapons, shops and outfits', '—', '✓']]
      .map(([k, a, b]) => `<div role="row"><span role="rowheader">${esc(k)}</span><span role="cell">${esc(a)}</span><span role="cell">${esc(b)}</span></div>`).join('')}
  </div>
  <ul class="lf-list lf-good">
    <li>Release: <b>${fmtDate(db.game.release)}</b> on PlayStation 5 and Xbox Series X|S. No PC version announced.</li>
    <li>Physical copies reportedly contain a download code rather than a disc. <span class="lf-badge lf-rep">Reported</span></li>
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

  // ── trailers ──
  write('trailers', layout({
    p: `${BASE}/trailers/`, title: `GTA 6 Trailers: Every Official Video, Trailer 1 to the Launch Trailer | ${BRAND}`, section: 'trailers',
    desc: `Watch every official GTA 6 trailer and video from Rockstar Games: the Launch Trailer, An Extended Look, Trailer 2, Trailer 1 and more. ${videos.length} videos.`,
    image: `https://i.ytimg.com/vi/${latest.youtube}/hqdefault.jpg`, crumbs: [['Trailers', `${BASE}/trailers/`]],
    jsonld: videos.slice(0, 10).map(videoLd),
    body: `${head(`GTA VI · ${plural(videos.length, 'video')}`, 'Trailers &amp; videos', `Every official GTA VI video from Rockstar Games, newest first. Videos load from YouTube only when you press play. ${ext(L.youtube, 'Rockstar on YouTube ↗')}`)}
<section class="lf-section lf-tight"><div class="lf-player">${yt(latest, { big: true })}<div><p class="lf-kicker">Latest · ${fmtDate(latest.date)}</p><h2 class="lf-h2">${esc(latest.title)}</h2><p>${esc(latest.summary)}</p></div></div></section>
${adSlot('leader')}
<section class="lf-section"><div class="lf-videos">${videos.slice(1).map(videoCard).join('')}</div></section>`,
  }));
  for (const v of videos) {
    write(`trailers/${v.slug}`, layout({
      p: `${BASE}/trailers/${v.slug}/`, title: `GTA 6 ${v.title} (${fmtDate(v.date)}) | ${BRAND}`, section: 'trailers', type: 'video.other',
      desc: `Watch the official Grand Theft Auto VI ${v.title}, released by Rockstar Games on ${fmtDate(v.date)}. ${v.summary}`.slice(0, 300),
      image: `https://i.ytimg.com/vi/${v.youtube}/hqdefault.jpg`, crumbs: [['Trailers', `${BASE}/trailers/`], [v.title, `${BASE}/trailers/${v.slug}/`]], jsonld: [videoLd(v)],
      body: `${head(`Official video · ${fmtDate(v.date)}`, `GTA 6 ${esc(v.title)}`, esc(v.summary))}
<section class="lf-section lf-tight">${yt(v, { big: true })}<p class="lf-src">Video by Rockstar Games, embedded from YouTube. ${ext(`https://www.youtube.com/watch?v=${v.youtube}`, 'Watch on YouTube ↗')}</p></section>
${adSlot('leader')}
<section class="lf-section">${sechead('more-v', 'More videos', more(`${BASE}/trailers/`, 'All videos'))}<div class="lf-videos">${videos.filter((o) => o !== v).slice(0, 3).map(videoCard).join('')}</div></section>`,
    }));
  }

  // ── music ──
  const m = db.music;
  write('music', layout({
    p: `${BASE}/music/`, title: `GTA 6 Soundtrack: Listen to the Album, Score by Justice and Radio | ${BRAND}`, section: 'music',
    desc: `Listen to the GTA 6 soundtrack: the original score by Justice (${m.score.tracks} tracks, ${fmtDate(m.score.release)}), Grand Theft Auto VI: The Album (${m.album.tracks} tracks) with Travis Scott, Cardi B and more, and every confirmed radio station.`,
    image: ogImage('vice-city-07'), crumbs: [['Music', `${BASE}/music/`]],
    jsonld: [m.album, m.score].map((a) => ({ '@context': 'https://schema.org', '@type': 'MusicAlbum', name: a.title, numTracks: a.tracks, datePublished: a.release, byArtist: { '@type': a.artist ? 'MusicGroup' : 'Organization', name: a.artist || 'Various artists' } })),
    body: `${head('GTA VI · Soundtrack', 'Music &amp; radio', `The score, the album and the stations you'll hear around Leonida, from Rockstar's official music announcements. ${ext(L.music, 'Rockstar\'s music page ↗')}`)}
<section class="lf-section lf-tight">
  ${sechead('listen-h', 'Listen now', ext(L.spotify, 'Open in Spotify ↗', 'lf-more'))}
  <div class="lf-listen">${spotify('artist', m.spotify.artist, 'Grand Theft Auto VI', 'Every released track from the album and score', true)}<div class="lf-spots lf-spots-col">${m.spotify.tracks.map((t) => spotify(t.type, t.id, t.song, t.artist)).join('')}</div></div>
  <p class="lf-src">Players load from Spotify when you press play. Full previews need a free Spotify account.</p>
</section>
${adSlot('leader')}
<section class="lf-section lf-albums">${[m.album, m.score].map((a) => `<article class="lf-album">${badge('confirmed')}<p class="lf-kicker">${fmtDate(a.release)} · ${a.tracks} tracks</p><h2 class="lf-h2">${esc(a.title)}</h2>${a.artist ? `<p class="lf-price">by ${esc(a.artist)}</p>` : ''}<p>${esc(a.summary)}</p><h3 class="lf-h3">Singles out now</h3><ol class="lf-tracks">${a.singles.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></article>`).join('')}</section>
${adSlot('infeed')}
<section class="lf-section">${sechead('radio-h', 'Radio stations')}<p class="lf-prose">Rockstar has described these stations and their hosts. Station names are still to be announced.</p>
<div class="lf-radio">${m.radio.map((r, i) => `<div class="lf-station"><span class="lf-dial" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><b>${esc(r.genre)}</b><i>Hosted by ${esc(r.hosts)}</i></div>`).join('')}</div>
<p class="lf-src">Source: ${ext(L.music, esc(m.source))}</p></section>`,
  }));

  // ── gallery ──
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
    desc: `All ${images.length} official GTA 6 screenshots and artwork from Rockstar's media pack, sorted by character and region: Jason, Lucia, Vice City, the Keys, Grassrivers and more.`,
    image: ogImage('vice-city-03'), crumbs: [['Gallery', `${BASE}/gallery/`]],
    jsonld: [{ '@context': 'https://schema.org', '@type': 'ImageGallery', name: 'Official GTA VI screenshots', url: `${siteUrl}${BASE}/gallery/`, copyrightHolder: { '@type': 'Organization', name: 'Rockstar Games' } }],
    body: `${head(`GTA VI · ${images.length} images`, 'Gallery', `Every image from Rockstar's official media pack, which Rockstar shares for fans to download and share. Tap any image to view it full size. ${ext(L.media, 'Rockstar\'s downloads page ↗')}`)}
<nav class="lf-jump" aria-label="Jump to">${groups.map((g) => `<a href="#${slugify(g.label)}">${esc(g.label)}</a>`).join('')}</nav>
${groups.map((g, gi) => `<section class="lf-section lf-tight" id="${slugify(g.label)}"><h2 class="lf-h2">${esc(g.label)} <small>${g.items.length}</small></h2><div class="lf-shots lf-shots-gallery">${g.items.map((i) => `<a href="${BASE}/img/${i.slug}.webp" data-lb="gallery">${img(i.slug, { sizes: '(min-width: 1100px) 25vw, 50vw' })}</a>`).join('')}</div></section>${gi % 3 === 2 ? adSlot('infeed') : ''}`).join('')}
${credit}`,
  }));

  // ── news ──
  write('news', layout({
    p: `${BASE}/news/`, title: `GTA 6 News: Latest Updates, Checked Daily | ${BRAND}`, section: 'news',
    desc: `The latest GTA 6 news, updated daily: release date, trailers, editions, music and every new detail from Rockstar Games. Last update ${fmtDate(updated)}.`,
    image: ogImage('vice-city-01'), crumbs: [['News', `${BASE}/news/`]],
    jsonld: [{ '@context': 'https://schema.org', '@type': 'ItemList', name: 'GTA 6 news', itemListElement: news.slice(0, 20).map((n, i) => ({ '@type': 'ListItem', position: i + 1, name: n.title })) }],
    body: `${head('GTA VI · Updated daily', 'News', `New trailers from Rockstar's channel appear here automatically, and everything is checked against Rockstar's announcements every day. Last update ${fmtDate(updated)}. ${ext(L.newswire, 'Rockstar Newswire ↗')}`)}
${adSlot('leader')}
<section class="lf-section lf-tight"><ol class="lf-news lf-news-list">${news.map((n, i) => newsItem(n) + (i === 3 ? `<li class="lf-newsad">${adSlot('infeed')}</li>` : '')).join('')}</ol></section>`,
  }));

  // ── faq ──
  write('faq', layout({
    p: `${BASE}/faq/`, title: `GTA 6 FAQ: Release Date, Price, PC, Characters and More | ${BRAND}`, section: 'faq',
    desc: 'Quick answers to the most asked GTA 6 questions: when it comes out, platforms, PC, price, pre-order bonus, Ultimate Edition, characters, map and soundtrack.',
    image: ogImage('jason-and-lucia-02'), crumbs: [['FAQ', `${BASE}/faq/`]],
    jsonld: [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: db.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }],
    body: `${head('GTA VI · Questions', 'FAQ', 'Short, sourced answers. If Rockstar hasn\'t confirmed something, we say so.')}
${adSlot('leader')}
<section class="lf-section lf-tight"><div class="lf-faq">${db.faq.map((f, i) => faqItem(f).replace('<details', i < 3 ? '<details open' : '<details')).join('')}</div></section>`,
  }));

  // ── about ──
  write('about', layout({
    p: `${BASE}/about/`, title: `About GTA 6 Hub and Disclaimer | ${BRAND}`,
    desc: 'About GTA 6 Hub, the unofficial GTA 6 database by Hex Modifications: how facts are checked and labelled, where images come from, and our disclaimer.',
    image: ogImage('vice-city-05'), crumbs: [['About', `${BASE}/about/`]],
    body: `${head('About', 'About GTA 6 Hub', '')}
<section class="lf-section lf-tight lf-prose">
  <p><b>GTA 6 Hub is an unofficial fan site</b> made by <a href="/">Hex Modifications</a>. It isn't affiliated with, endorsed by or sponsored by Rockstar Games or Take-Two Interactive. Grand Theft Auto, GTA VI and all related names, logos, images and trademarks belong to their respective owners.</p>
  <h2 class="lf-h3">How we label facts</h2>
  <p><span class="lf-badge lf-ok">Confirmed</span> means Rockstar Games has said or shown it: the official GTA VI website, Newswire posts, trailers or media pack. <span class="lf-badge lf-rep">Reported</span> means it comes from press reports, store listings or fans identifying things in trailer footage. We don't list leaks or rumours about real people, so the voice cast stays empty until it's officially announced.</p>
  <h2 class="lf-h3">Images, video and audio</h2>
  <p>Screenshots and artwork are from Rockstar's ${ext(L.media, 'official GTA VI media pack')}, which Rockstar shares for fans to download and share, and remain © Rockstar Games. Trailers are embedded from Rockstar's YouTube channel and music from Spotify; neither loads until you press play.</p>
  <h2 class="lf-h3">The map</h2>
  <p>${esc(db.map.note)}</p>
  <h2 class="lf-h3">Privacy</h2>
  <p>This site doesn't set cookies or run analytics. Fonts load from Google Fonts. When advertising is switched on, ads are served by Google, which may use cookies, and you'll be asked for consent first where the law requires it.</p>
  <h2 class="lf-h3">Contact</h2>
  <p>Spotted a mistake, or need something removed? Email <a href="mailto:hexmodifications@icloud.com">hexmodifications@icloud.com</a>.</p>
</section>`,
  }));

  fs.writeFileSync(path.join(out, 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#ffb38a"/><stop offset=".5" stop-color="#ff5c8a"/><stop offset="1" stop-color="#a46bff"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="#050407"/><text x="32" y="45" text-anchor="middle" font-family="Impact, sans-serif" font-size="40" fill="#fff">6</text><rect x="16" y="50" width="32" height="4" rx="2" fill="url(#g)"/></svg>`);

  // the hub used to live at /gta6/: send old links to the new address
  for (const u of urls) {
    const rel = u.loc.slice(`${siteUrl}${BASE}`.length);
    const file = path.join(dist, 'gta6', rel, 'index.html');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `<!doctype html><meta charset="utf-8"><title>Moved to GTA 6 Hub</title><meta name="robots" content="noindex"><link rel="canonical" href="${esc(u.loc)}"><meta http-equiv="refresh" content="0;url=${esc(u.loc)}"><a href="${esc(u.loc)}">GTA 6 Hub has moved here</a>`);
  }
  log(`gta6hub: ${urls.length} pages built (${news.length} news items, ${videos.length} videos)`);
  return { urls, updated };
}

// closed Catmull-Rom spline through the points, as cubic Béziers
function smoothPath(p) {
  const n = p.length, f = (v) => Math.round(v * 10) / 10;
  let d = `M${p[0][0]} ${p[0][1]}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [p[(i - 1 + n) % n], p[i], p[(i + 1) % n], p[(i + 2) % n]];
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${p2[0]} ${p2[1]}`;
  }
  return `${d}Z`;
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

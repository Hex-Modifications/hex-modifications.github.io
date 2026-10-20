// Builds a static copy of the site for free static hosting (GitHub Pages, Cloudflare Pages, Netlify).
// Usage: SITE_URL=https://hexmodifications.github.io node scripts/build-static.mjs
// Output: dist/   (frontend, data, product pages, sitemap, robots, 404)
// Backend-only features (contact inbox, admin, live Patreon/Tebex/Shopify) need `node server.js` on a Node host.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { jsonLd, sitemap, robots, productPage } from '../lib/seo.js';
import { collectReleases } from '../lib/releases.js';
import { personaPrompt } from '../public/js/persona.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SITE_URL = (process.env.SITE_URL || 'https://hexmodifications.github.io').replace(/\/$/, '');
const read = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `${n}.json`), 'utf8'));
const UA = 'Mozilla/5.0 (compatible; HexModificationsSite/1.0; +https://hex-modifications.github.io)';

fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public'), DIST, {
  recursive: true,
  filter: (src) => !/admin\.(html|js|css)$/.test(src),
});

const site = read('site');
const products = read('products');

// data the frontend falls back to when there is no API
fs.mkdirSync(path.join(DIST, 'data'));
for (const n of ['site', 'products', 'roadmap', 'feed', 'showcase']) {
  fs.copyFileSync(path.join(ROOT, 'data', `${n}.json`), path.join(DIST, 'data', `${n}.json`));
}

// latest releases, fetched fresh every build (the workflow also runs every few hours).
// A platform that fails this time keeps whatever the live site already shows for it.
const releases = process.env.SKIP_RELEASES === '1' ? { items: [], status: { skipped: true } } : await collectReleases(site, {
  manual: read('releases-manual'),
  githubToken: process.env.GITHUB_TOKEN,
  patreonToken: process.env.PATREON_ACCESS_TOKEN,
  patreonCampaign: process.env.PATREON_CAMPAIGN_ID,
});
const failed = Object.entries(releases.status).filter(([, v]) => String(v).startsWith('error')).map(([k]) => k);
if (failed.length) {
  try {
    const prev = await (await fetch(`${SITE_URL}/data/releases.json`, { signal: AbortSignal.timeout(10000) })).json();
    const kept = (prev.items || []).filter((it) => failed.includes(it.platform)).map((it) => ({ ...it, image: it.imageSrc || it.image }));
    releases.items = [...releases.items, ...kept].sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0)).slice(0, 12);
  } catch { /* first deploy, or the live site is down: show what we have */ }
}
// cover images are saved next to the page, so visitors never load anything from third-party CDNs.
// With sharp available (the deploy workflow installs it) they're also resized to 1200px WebP.
fs.mkdirSync(path.join(DIST, 'img', 'releases'), { recursive: true });
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const sharp = await import('sharp').then((m) => m.default).catch(() => null);
await Promise.all(releases.items.map(async (it) => {
  if (!it.image || !/^https:\/\//.test(it.image)) return;
  try {
    const res = await fetch(it.image, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    const ext = EXT[(res.headers.get('content-type') || '').split(';')[0]];
    let buf = Buffer.from(await res.arrayBuffer()), type = ext;
    if (!res.ok || !ext || buf.length > 12e6) return;
    if (sharp) {
      try { buf = await sharp(buf).resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(); type = 'webp'; } catch { /* keep the original */ }
    }
    if (buf.length > 4e6) return;
    const name = `${crypto.createHash('sha1').update(it.image).digest('hex').slice(0, 12)}.${type}`;
    fs.writeFileSync(path.join(DIST, 'img', 'releases', name), buf);
    it.imageSrc = it.image; it.image = `img/releases/${name}`;
  } catch { /* leave the remote URL; the CSP allows https images */ }
}));
fs.writeFileSync(path.join(DIST, 'data', 'releases.json'), JSON.stringify(releases));
// the chat persona, for the optional Cloudflare Worker (workers/chat-worker.js) to read
fs.writeFileSync(path.join(DIST, 'data', 'persona.json'), JSON.stringify({ prompt: personaPrompt({ site, releases: releases.items, products, roadmap: read('roadmap') }) }));
console.log('releases:', JSON.stringify(releases.status), `${releases.items.length} items`);

// index: SEO structured data + real URLs + a CSP for hosts that can't send headers
// the chat talks to Pollinations' free tier, or to the endpoint set in site.json "chat"
const chatOrigins = ['https://text.pollinations.ai'];
try { if (site.chat?.endpoint) chatOrigins.push(new URL(site.chat.endpoint).origin); } catch { /* ignore a bad URL */ }
const csp = `default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' ${chatOrigins.join(' ')}; base-uri 'self'; form-action 'self'; object-src 'none'`;
let index = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8')
  .replace('<!--SEO_JSONLD-->', `<script type="application/ld+json">${jsonLd(site, products, SITE_URL)}</script>`)
  .replaceAll('__SITE_URL__', SITE_URL)
  .replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${csp}">\n<meta name="referrer" content="strict-origin-when-cross-origin">`);
fs.writeFileSync(path.join(DIST, 'index.html'), index);

// one crawlable page per product
for (const p of products) {
  const dir = path.join(DIST, 'p', p.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), productPage(site, p, SITE_URL));
}

fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap(products, SITE_URL));
fs.writeFileSync(path.join(DIST, 'robots.txt'), robots(SITE_URL).replace('Disallow: /admin\n', '').replace('Disallow: /api/\n', ''));

// "wasted" 404
fs.writeFileSync(path.join(DIST, '404.html'), `<!doctype html><html lang="en-GB"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="8;url=/"><title>Wasted | Hex Modifications</title><link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/img/favicon-32.png" type="image/png" sizes="32x32"><link rel="stylesheet" href="/css/style.css"><script src="/js/timecycle.js"></script><body class="wasted-page"><div class="aura" aria-hidden="true"><i class="a1"></i><i class="a2"></i><i class="a3"></i></div><main class="pp"><p class="label">error 404</p><h1 class="pp-title"><span class="grad">wasted</span></h1><p class="pp-desc">this page doesn't exist. respawning at the homepage in a few seconds.</p><a class="btn" href="/">respawn now</a></main></body></html>`);

fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
console.log(`Static site built in dist/ for ${SITE_URL} (${products.length} product pages)`);

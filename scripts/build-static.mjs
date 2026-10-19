// Builds a static copy of the site for free static hosting (GitHub Pages, Cloudflare Pages, Netlify).
// Usage: SITE_URL=https://hexmodifications.github.io node scripts/build-static.mjs
// Output: dist/   (frontend, data, product pages, sitemap, robots, 404)
// Backend-only features (contact inbox, admin, live Patreon/Tebex/Shopify) need `node server.js` on a Node host.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsonLd, sitemap, robots, productPage } from '../lib/seo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SITE_URL = (process.env.SITE_URL || 'https://hexmodifications.github.io').replace(/\/$/, '');
const read = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', `${n}.json`), 'utf8'));

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

// index: SEO structured data + real URLs + a CSP for hosts that can't send headers
const csp = "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'";
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

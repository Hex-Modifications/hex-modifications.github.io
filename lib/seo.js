// Built-in SEO: JSON-LD structured data, sitemap, robots, server-rendered product pages.
import { escapeHtml as e } from './security.js';

const PLATFORM_NAMES = { tebex: 'Tebex', kofi: 'Ko-fi', patreon: 'Patreon', fiverr: 'Fiverr', shopify: 'Shopify' };

export function jsonLd(site, products, siteUrl) {
  const sameAs = Object.values(site.links || {}).filter((u) => /^https:\/\//.test(u));
  const graph = [
    {
      '@type': 'Organization', '@id': `${siteUrl}/#org`, name: site.name, url: siteUrl,
      logo: `${siteUrl}/img/icon-512.png`, email: site.email, sameAs,
      founder: { '@id': `${siteUrl}/#founder` },
    },
    {
      '@type': 'Person', '@id': `${siteUrl}/#founder`, name: site.handle, alternateName: '001hex',
      jobTitle: 'Modder, scripter & software developer', worksFor: { '@id': `${siteUrl}/#org` },
      knowsAbout: ['ReShade', 'Game modding', 'FiveM', 'Lua', 'Scripting', 'Networking', 'macOS', 'Windows'],
      sameAs,
    },
    {
      '@type': 'WebSite', '@id': `${siteUrl}/#website`, url: siteUrl, name: site.name,
      description: site.description, publisher: { '@id': `${siteUrl}/#org` }, inLanguage: 'en-GB',
    },
    {
      '@type': 'ItemList', name: `${site.name} products`,
      itemListElement: products.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${siteUrl}/p/${p.slug}`, name: titleCase(p.title) })),
    },
  ];
  return safeJson({ '@context': 'https://schema.org', '@graph': graph });
}

export function productJsonLd(site, p, siteUrl) {
  return safeJson({
    '@context': 'https://schema.org', '@type': p.category === 'software' ? 'SoftwareApplication' : 'Product',
    name: titleCase(p.title), description: p.description, url: `${siteUrl}/p/${p.slug}`,
    ...(p.category === 'software' ? { operatingSystem: p.game, applicationCategory: 'UtilitiesApplication' } : { category: p.subtitle }),
    brand: { '@type': 'Brand', name: site.name },
    offers: { '@type': 'Offer', price: Number(p.price).toFixed(2), priceCurrency: p.currency, url: p.url, availability: 'https://schema.org/InStock' },
  });
}

// "</script>" inside JSON would break out of the tag; escape "<".
function safeJson(obj) { return JSON.stringify(obj).replace(/</g, '\\u003c'); }

export function sitemap(products, siteUrl) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [`${siteUrl}/`, ...products.map((p) => `${siteUrl}/p/${p.slug}`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u, i) => `  <url><loc>${e(u)}</loc><lastmod>${today}</lastmod><priority>${i === 0 ? '1.0' : '0.7'}</priority></url>`).join('\n')}
</urlset>`;
}

export function robots(siteUrl) {
  return `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/

Sitemap: ${siteUrl}/sitemap.xml
`;
}

export function productPage(site, p, siteUrl) {
  const title = `${titleCase(p.title)}: ${p.subtitle} for ${p.game} | ${site.name}`;
  const price = Number(p.price) > 0 ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: p.currency }).format(p.price) : 'Included';
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}</title>
<meta name="description" content="${e(p.description)}">
<link rel="canonical" href="${e(`${siteUrl}/p/${p.slug}`)}">
<meta property="og:type" content="product"><meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(p.description)}"><meta property="og:url" content="${e(`${siteUrl}/p/${p.slug}`)}">
<meta property="og:image" content="${e(p.image || `${siteUrl}/img/og.png`)}"><meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#E8E7EC">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/img/favicon-32.png" type="image/png" sizes="32x32">
<link rel="icon" href="/img/favicon-16.png" type="image/png" sizes="16x16">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/style.css">
<script src="/js/timecycle.js"></script>
<script type="application/ld+json">${productJsonLd(site, p, siteUrl)}</script>
</head>
<body class="product-page">
<div class="aura" aria-hidden="true"><i class="a1"></i><i class="a2"></i><i class="a3"></i></div>
<main class="pp">
  <a class="pp-back mono" href="/#store">&larr; all products</a>
  <p class="label">${e(p.subtitle)} / ${e(p.game)}</p>
  <h1 class="pp-title">${e(p.title)}</h1>
  <p class="pp-desc">${e(p.description)}</p>
  <ul class="pp-tags mono">${(p.tags || []).map((t) => `<li>${e(t)}</li>`).join('')}</ul>
  <div class="pp-buy">
    <span class="pp-price">${e(price)}</span>
    <a class="btn" href="${e(p.url)}" rel="noopener" target="_blank">get it on ${e(PLATFORM_NAMES[p.platform] || p.platform)}</a>
  </div>
</main>
</body>
</html>`;
}

function titleCase(s) { return String(s).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()); }

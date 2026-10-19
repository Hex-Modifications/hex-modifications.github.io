// Live platform integrations with caching + graceful fallback to local JSON.
// Patreon (posts feed), Tebex Headless (packages), Shopify Storefront (products), Discord (widget).

const cache = new Map();

async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  try {
    const value = await fn();
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (err) {
    console.warn(`[integrations] ${key} failed: ${err.message}`);
    if (hit) return hit.value; // serve stale on error
    return null;
  }
}

async function getJson(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

const stripHtml = (s = '') => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

export function patreonFeed(env) {
  if (!env.PATREON_ACCESS_TOKEN || !env.PATREON_CAMPAIGN_ID) return Promise.resolve(null);
  return cached('patreon', 10 * 60_000, async () => {
    const url = `https://www.patreon.com/api/oauth2/v2/campaigns/${encodeURIComponent(env.PATREON_CAMPAIGN_ID)}/posts`
      + '?fields%5Bpost%5D=title,content,url,published_at,is_public&page%5Bcount%5D=12&sort=-published_at';
    const json = await getJson(url, { headers: { Authorization: `Bearer ${env.PATREON_ACCESS_TOKEN}`, 'User-Agent': 'HexModifications/1.0' } });
    return (json.data || []).map((p) => ({
      title: p.attributes.title || 'Untitled post',
      excerpt: p.attributes.is_public ? stripHtml(p.attributes.content).slice(0, 180) : 'Patron-only post. Unlock it on Patreon.',
      url: p.attributes.url?.startsWith('http') ? p.attributes.url : `https://www.patreon.com${p.attributes.url || ''}`,
      date: (p.attributes.published_at || '').slice(0, 10),
      public: !!p.attributes.is_public,
    }));
  });
}

export function tebexPackages(env) {
  if (!env.TEBEX_PUBLIC_TOKEN) return Promise.resolve(null);
  return cached('tebex', 15 * 60_000, async () => {
    const json = await getJson(`https://headless.tebex.io/api/accounts/${encodeURIComponent(env.TEBEX_PUBLIC_TOKEN)}/categories?includePackages=1`);
    const out = [];
    for (const cat of json.data || []) {
      for (const p of cat.packages || []) {
        out.push({
          slug: `tebex-${p.id}`,
          title: String(p.name || '').toUpperCase(),
          subtitle: cat.name,
          category: 'scripts',
          game: 'FiveM',
          platform: 'tebex',
          price: Number(p.total_price ?? p.base_price ?? 0),
          currency: p.currency || 'GBP',
          tags: [],
          image: p.image || null,
          url: `${env.TEBEX_STORE_URL || ''}/package/${p.id}`,
          description: stripHtml(p.description).slice(0, 200),
          live: true,
        });
      }
    }
    return out;
  });
}

export function shopifyProducts(env) {
  if (!env.SHOPIFY_DOMAIN || !env.SHOPIFY_STOREFRONT_TOKEN) return Promise.resolve(null);
  return cached('shopify', 15 * 60_000, async () => {
    const query = `{ products(first: 24, sortKey: UPDATED_AT, reverse: true) { nodes {
      handle title description productType onlineStoreUrl tags
      featuredImage { url }
      priceRange { minVariantPrice { amount currencyCode } } } } }`;
    const json = await getJson(`https://${env.SHOPIFY_DOMAIN}/api/2025-01/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': env.SHOPIFY_STOREFRONT_TOKEN },
      body: JSON.stringify({ query }),
    });
    return (json.data?.products?.nodes || []).map((p) => ({
      slug: `shop-${p.handle}`,
      title: p.title.toUpperCase(),
      subtitle: p.productType || 'Software',
      category: 'software',
      game: p.tags?.find((t) => /mac|windows/i.test(t)) || 'macOS / Windows',
      platform: 'shopify',
      price: Number(p.priceRange.minVariantPrice.amount),
      currency: p.priceRange.minVariantPrice.currencyCode,
      tags: (p.tags || []).slice(0, 3),
      image: p.featuredImage?.url || null,
      url: p.onlineStoreUrl || `https://${env.SHOPIFY_DOMAIN}/products/${p.handle}`,
      description: p.description.slice(0, 200),
      live: true,
    }));
  });
}

export function discordWidget(env) {
  if (!env.DISCORD_GUILD_ID) return Promise.resolve(null);
  return cached('discord', 5 * 60_000, async () => {
    const json = await getJson(`https://discord.com/api/guilds/${encodeURIComponent(env.DISCORD_GUILD_ID)}/widget.json`);
    return { online: json.presence_count ?? 0, name: json.name, invite: json.instant_invite || null };
  });
}

export async function notifyDiscord(env, msg) {
  if (!env.DISCORD_WEBHOOK_URL) return false;
  // Never let user content ping @everyone/roles.
  const body = {
    username: 'Hex Inbox',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `New ${msg.topic} message`,
      color: 0xff5a1f,
      fields: [
        { name: 'From', value: `${msg.name} <${msg.email}>`.slice(0, 1000) },
        { name: 'Message', value: msg.message.slice(0, 1000) },
      ],
      timestamp: msg.at,
    }],
  };
  try {
    const res = await fetch(env.DISCORD_WEBHOOK_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  } catch { return false; }
}

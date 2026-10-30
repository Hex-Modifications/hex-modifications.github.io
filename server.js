// Hex Modifications: zero-dependency Node server.
// Static site + JSON API + platform integrations + traffic manager + admin.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { securityHeaders, cspAds, makeCsrf, checkCsrf, isAdmin, originAllowed, clean, EMAIL_RE } from './lib/security.js';
import { Traffic, writeJson } from './lib/traffic.js';
import { patreonFeed, tebexPackages, shopifyProducts, discordWidget, notifyDiscord } from './lib/integrations.js';
import { jsonLd, sitemap, robots, productPage } from './lib/seo.js';
import { collectReleases } from './lib/releases.js';
import { personaPrompt } from './public/js/persona.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');

ensureEnvFile();
const env = { ...loadEnv(path.join(ROOT, '.env')), ...process.env };
const PORT = Number(env.PORT) || 8080;
const SITE_URL = (env.SITE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const SECRET = env.SECRET_KEY && env.SECRET_KEY !== 'change-me' ? env.SECRET_KEY : crypto.randomBytes(32).toString('hex');
if (!env.SECRET_KEY || env.SECRET_KEY === 'change-me') console.warn('[warn] SECRET_KEY not set: using a random one (CSRF tokens reset on restart).');
if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 24) console.warn('[warn] ADMIN_TOKEN missing or < 24 chars: /admin is disabled.');

const traffic = new Traffic({ dataDir: DATA, trustProxy: env.TRUST_PROXY });
const CONTENT = ['site', 'products', 'roadmap', 'feed', 'showcase', 'releases-manual'];
const MAX_BODY = 32 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.mp4': 'video/mp4', '.webm': 'video/webm', '.m4a': 'audio/mp4',
};
const COMPRESSIBLE = /^(text\/|application\/(json|xml|javascript)|image\/svg)/;

// ── Content store ────────────────────────────────────
const readData = (name) => JSON.parse(fs.readFileSync(path.join(DATA, `${name}.json`), 'utf8'));
cspAds.on = /^ca-pub-\d{10,20}$/.test(readData('site').monetise?.adsense?.client || '');

async function allProducts() {
  const local = readData('products');
  const [tebex, shop] = await Promise.all([tebexPackages(env), shopifyProducts(env)]);
  // Live listings replace local samples for that platform once connected.
  return [
    ...local.filter((p) => !(tebex && p.platform === 'tebex') && !(shop && p.platform === 'shopify')),
    ...(tebex || []), ...(shop || []),
  ];
}

// ── HTTP helpers ─────────────────────────────────────
function send(req, res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const headers = { 'Content-Type': type, Vary: 'Accept-Encoding', ...extra };
  if (buf.length > 1024 && COMPRESSIBLE.test(type)) {
    const ae = String(req.headers['accept-encoding'] || '');
    if (/\bbr\b/.test(ae)) { buf = zlib.brotliCompressSync(buf); headers['Content-Encoding'] = 'br'; }
    else if (/\bgzip\b/.test(ae)) { buf = zlib.gzipSync(buf); headers['Content-Encoding'] = 'gzip'; }
  }
  headers['Content-Length'] = buf.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : buf);
}
const json = (req, res, status, obj, extra) => send(req, res, status, obj, 'application/json; charset=utf-8', { 'Cache-Control': 'no-store', ...extra });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
async function readJsonBody(req) {
  const raw = await readBody(req);
  try { return JSON.parse(raw || '{}'); } catch { throw Object.assign(new Error('bad json'), { status: 400 }); }
}

// ── Static files (path-traversal safe, ETag, compression cache) ──
const staticCache = new Map();
async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return false;
  let stat;
  try { stat = await fsp.stat(file); } catch { return false; }
  if (!stat.isFile()) return false;

  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const etag = `"${stat.size.toString(36)}-${stat.mtimeMs.toString(36)}"`;
  const isHtml = ext === '.html';
  securityHeaders(res, { isHtml });
  const cacheControl = isHtml ? 'no-cache' : 'public, max-age=604800, stale-while-revalidate=86400';
  if (!isHtml && req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag, 'Cache-Control': cacheControl }); res.end(); return true; }

  // audio/video: byte ranges (Safari won't play media without them), streamed, never recompressed
  if (/^(video|audio)\//.test(type)) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    let start = 0, end = stat.size - 1;
    if (m) {
      start = m[1] ? Number(m[1]) : Math.max(0, stat.size - Number(m[2]));
      end = m[1] && m[2] ? Math.min(Number(m[2]), stat.size - 1) : end;
      if (start > end || start >= stat.size) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); res.end(); return true; }
    }
    res.writeHead(m ? 206 : 200, { 'Content-Type': type, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', ETag: etag, 'Cache-Control': cacheControl, ...(m ? { 'Content-Range': `bytes ${start}-${end}/${stat.size}` } : {}) });
    if (req.method === 'HEAD') { res.end(); return true; }
    fs.createReadStream(file, { start, end }).pipe(res);
    return true;
  }

  let body = staticCache.get(file)?.etag === etag ? staticCache.get(file).body : await fsp.readFile(file);
  staticCache.set(file, { etag, body });
  if (isHtml && rel === '/index.html') body = await renderIndex(body);
  send(req, res, 200, body, type, { ETag: etag, 'Cache-Control': cacheControl });
  return true;
}

async function renderIndex(buf) {
  const site = readData('site');
  const products = await allProducts();
  return Buffer.from(buf.toString('utf8')
    .replace('<!--SEO_JSONLD-->', `<script type="application/ld+json">${jsonLd(site, products, SITE_URL)}</script>`)
    .replaceAll('__SITE_URL__', SITE_URL));
}

// ── API ──────────────────────────────────────────────
// latest releases across platforms: refreshed at most every 6 hours, stale copy served if a refresh fails
let releasesCache = null;
async function latestReleases() {
  if (releasesCache && Date.now() - releasesCache.at < 6 * 3600_000) return releasesCache.value;
  const value = await collectReleases(readData('site'), {
    manual: readData('releases-manual'), githubToken: env.GITHUB_TOKEN,
    patreonToken: env.PATREON_ACCESS_TOKEN, patreonCampaign: env.PATREON_CAMPAIGN_ID,
  }).catch(() => null);
  if (value && value.items.length) releasesCache = { at: Date.now(), value };
  return releasesCache?.value || value || { items: [] };
}

const routes = {
  'GET /api/site': (req, res) => json(req, res, 200, readData('site')),
  'GET /api/products': async (req, res) => json(req, res, 200, await allProducts()),
  'GET /api/roadmap': (req, res) => json(req, res, 200, readData('roadmap')),
  'GET /api/showcase': (req, res) => json(req, res, 200, readData('showcase')),
  'GET /api/feed': async (req, res) => {
    const live = await patreonFeed(env);
    json(req, res, 200, { source: live ? 'patreon' : 'local', posts: live || readData('feed') });
  },
  'GET /api/releases': async (req, res) => json(req, res, 200, await latestReleases()),

  // chat proxy: only active when an OpenAI-compatible key is set (keeps the key off the page).
  // Without it the page talks to the free keyless tier directly.
  'GET /api/chat': (req, res) => json(req, res, 200, { enabled: !!(env.CHAT_API_URL && env.CHAT_API_KEY) }),
  'POST /api/chat': async (req, res) => {
    if (!env.CHAT_API_URL || !env.CHAT_API_KEY) return json(req, res, 404, { error: 'Chat proxy not configured.' });
    if (!originAllowed(req, SITE_URL)) return json(req, res, 403, { error: 'Bad origin.' });
    const body = await readJsonBody(req);
    const messages = (Array.isArray(body?.messages) ? body.messages : []).slice(-12)
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content.slice(0, 800) }));
    if (!messages.length || messages.at(-1).role !== 'user') return json(req, res, 422, { error: 'Send a message.' });
    const system = personaPrompt({ site: readData('site'), releases: (await latestReleases()).items || [], products: await allProducts(), roadmap: readData('roadmap') });
    try {
      const r = await fetch(env.CHAT_API_URL, {
        method: 'POST', signal: AbortSignal.timeout(45000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.CHAT_API_KEY}` },
        body: JSON.stringify({ model: env.CHAT_MODEL || 'openai', messages: [{ role: 'system', content: system }, ...messages], max_tokens: 400 }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      json(req, res, 200, { reply: String(j.choices?.[0]?.message?.content || '').slice(0, 2000) });
    } catch (err) {
      console.warn('[chat]', err.message);
      json(req, res, 502, { error: 'The AI is unavailable right now.' });
    }
  },
  'GET /api/discord': async (req, res) => json(req, res, 200, (await discordWidget(env)) || { online: null }),
  'GET /api/csrf': (req, res) => json(req, res, 200, { token: makeCsrf(SECRET) }),

  'POST /api/contact': async (req, res) => {
    if (!originAllowed(req, SITE_URL)) return json(req, res, 403, { error: 'Origin not allowed.' });
    const body = await readJsonBody(req);
    if (body.website) return json(req, res, 200, { ok: true }); // honeypot: pretend success to bots
    const csrfErr = checkCsrf(SECRET, body.csrf);
    if (csrfErr) {
      if (csrfErr === 'too-fast') traffic.strike(traffic.ip(req), 2, 'contact submitted too fast');
      return json(req, res, 400, { error: csrfErr === 'expired' ? 'Form expired, refresh and try again.' : 'Security check failed, refresh and try again.' });
    }
    const msg = {
      at: new Date().toISOString(),
      name: clean(body.name, 80),
      email: clean(body.email, 254),
      topic: ['support', 'commission', 'business', 'bug'].includes(body.topic) ? body.topic : 'support',
      message: clean(body.message, 4000),
    };
    const errors = {};
    if (msg.name.length < 2) errors.name = 'Tell me your name.';
    if (!EMAIL_RE.test(msg.email)) errors.email = 'That email looks off.';
    if (msg.message.length < 10) errors.message = 'A bit more detail, please (10+ characters).';
    if ((msg.message.match(/https?:\/\//g) || []).length > 3) errors.message = 'Too many links.';
    if (Object.keys(errors).length) return json(req, res, 422, { error: 'Check the highlighted fields.', fields: errors });

    await fsp.appendFile(path.join(DATA, 'messages.jsonl'), JSON.stringify({ id: crypto.randomUUID(), ...msg }) + '\n');
    notifyDiscord(env, msg); // fire-and-forget
    json(req, res, 200, { ok: true });
  },

  'POST /api/track': async (req, res) => {
    const raw = await readBody(req);
    let data; try { data = JSON.parse(raw); } catch { data = {}; }
    const type = clean(data.type, 20).replace(/[^a-z-]/g, '');
    const target = clean(data.target, 40).replace(/[^a-z0-9-_.]/gi, '');
    if (type && target) traffic.recordEvent(type, target);
    res.writeHead(204); res.end();
  },

  // ── Admin (Bearer ADMIN_TOKEN) ──
  'GET /api/admin/stats': (req, res) => json(req, res, 200, traffic.snapshot()),
  'GET /api/admin/messages': async (req, res) => {
    let lines = [];
    try { lines = (await fsp.readFile(path.join(DATA, 'messages.jsonl'), 'utf8')).trim().split('\n').filter(Boolean); } catch { /* none yet */ }
    json(req, res, 200, lines.slice(-200).reverse().map((l) => JSON.parse(l)));
  },
  'GET /api/admin/content': (req, res, q) => {
    const name = q.get('name');
    if (!CONTENT.includes(name)) return json(req, res, 400, { error: 'unknown content' });
    json(req, res, 200, readData(name));
  },
  'PUT /api/admin/content': async (req, res, q) => {
    const name = q.get('name');
    if (!CONTENT.includes(name)) return json(req, res, 400, { error: 'unknown content' });
    const body = await readJsonBody(req);
    const expectArray = ['products', 'roadmap', 'feed', 'releases-manual'].includes(name);
    if (expectArray !== Array.isArray(body) || (expectArray && body.length > 200)) return json(req, res, 422, { error: `${name} must be ${expectArray ? 'an array' : 'an object'}.` });
    writeJson(path.join(DATA, `${name}.json`), body);
    if (name === 'releases-manual') releasesCache = null;
    json(req, res, 200, { ok: true });
  },
  'POST /api/admin/unban': async (req, res) => {
    const { ip } = await readJsonBody(req);
    json(req, res, 200, { ok: traffic.unban(String(ip || '')) });
  },
};

// ── Request pipeline ────────────────────────────────
async function handle(req, res) {
  const started = performance.now();
  res.on('finish', () => traffic.recordTiming(res.statusCode, performance.now() - started));

  let url;
  try { url = new URL(req.url, 'http://x'); } catch { res.writeHead(400); return res.end(); }
  const { pathname } = url;

  if (!['GET', 'HEAD', 'POST', 'PUT'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD, POST, PUT' }); return res.end(); }

  const isApi = pathname.startsWith('/api/');
  const isAdminApi = pathname.startsWith('/api/admin/');
  const kind = isAdminApi ? 'admin' : pathname === '/api/contact' ? 'contact' : pathname === '/api/chat' && req.method === 'POST' ? 'chat' : isApi ? 'api'
    : /\.(css|js|svg|png|jpe?g|webp|avif|woff2|ico|json|mp4|webm)$/.test(pathname) ? 'asset' : 'page';

  const blocked = traffic.gate(req, kind);
  if (blocked) {
    securityHeaders(res);
    const extra = blocked.status === 429 ? { 'Retry-After': '60' } : {};
    return isApi ? json(req, res, blocked.status, { error: blocked.status === 429 ? 'Slow down.' : 'Request blocked.' }, extra) : send(req, res, blocked.status, 'Request blocked.', 'text/plain; charset=utf-8', extra);
  }

  try {
    if (isApi) {
      securityHeaders(res);
      if (isAdminApi && !isAdmin(req, env.ADMIN_TOKEN)) {
        traffic.strike(traffic.ip(req), 2, 'admin auth failed');
        return json(req, res, 401, { error: 'Unauthorised.' });
      }
      const route = routes[`${req.method === 'HEAD' ? 'GET' : req.method} ${pathname}`];
      if (!route) return json(req, res, 404, { error: 'Not found.' });
      return await route(req, res, url.searchParams);
    }

    if (pathname === '/ads.txt') {
      const client = readData('site').monetise?.adsense?.client || '';
      if (/^ca-pub-\d{10,20}$/.test(client)) { securityHeaders(res); return send(req, res, 200, `google.com, ${client.replace('ca-', '')}, DIRECT, f08c47fec0942fa0\n`, 'text/plain; charset=utf-8'); }
    }
    if (pathname === '/robots.txt') { securityHeaders(res); return send(req, res, 200, robots(SITE_URL), 'text/plain; charset=utf-8', { 'Cache-Control': 'public, max-age=3600' }); }
    if (pathname === '/sitemap.xml') { securityHeaders(res); return send(req, res, 200, sitemap(await allProducts(), SITE_URL), 'application/xml; charset=utf-8', { 'Cache-Control': 'public, max-age=3600' }); }

    const pm = pathname.match(/^\/p\/([a-z0-9-]{1,80})\/?$/);
    if (pm) {
      const p = (await allProducts()).find((x) => x.slug === pm[1]);
      if (p) {
        traffic.recordPageview(req, pathname);
        securityHeaders(res, { isHtml: true });
        return send(req, res, 200, productPage(readData('site'), p, SITE_URL), 'text/html; charset=utf-8', { 'Cache-Control': 'no-cache' });
      }
    }

    if (pathname === '/admin' || pathname === '/admin/') {
      return serveStatic(req, res, '/admin.html').then((ok) => ok || notFound(req, res));
    }
    if (pathname.startsWith('/data/')) return notFound(req, res); // raw content only via API

    const ok = await serveStatic(req, res, pathname);
    if (ok) { if (pathname === '/' || pathname === '/index.html') traffic.recordPageview(req, '/'); return; }
    return notFound(req, res);
  } catch (err) {
    if (!res.headersSent) json(req, res, err.status || 500, { error: err.status ? err.message : 'Server error.' });
    if (!err.status) console.error(err);
  }
}

async function notFound(req, res) {
  securityHeaders(res, { isHtml: true });
  const body = `<!doctype html><html lang="en-GB"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="8;url=/"><title>Wasted | Hex Modifications</title><link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/img/favicon-32.png" type="image/png" sizes="32x32"><link rel="stylesheet" href="/css/style.css"><script src="/js/timecycle.js"></script><body class="wasted-page"><div class="aura" aria-hidden="true"><i class="a1"></i><i class="a2"></i><i class="a3"></i></div><main class="pp"><p class="label">error 404</p><h1 class="pp-title"><span class="grad">wasted</span></h1><p class="pp-desc">this page doesn't exist. respawning at the homepage in a few seconds.</p><a class="btn" href="/">respawn now</a></main></body></html>`;
  send(req, res, 404, body, 'text/html; charset=utf-8');
}

// First run: create .env from the example with strong random secrets, so it works out of the box.
function ensureEnvFile() {
  const file = path.join(ROOT, '.env');
  if (fs.existsSync(file) || process.env.ADMIN_TOKEN) return;
  let text = '';
  try { text = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8'); } catch { /* no example */ }
  const rand = () => crypto.randomBytes(24).toString('hex');
  const admin = rand();
  text = text.replace(/^SECRET_KEY=.*$/m, `SECRET_KEY=${rand()}`).replace(/^ADMIN_TOKEN=.*$/m, `ADMIN_TOKEN=${admin}`);
  if (!/^SECRET_KEY=/m.test(text)) text += `\nSECRET_KEY=${rand()}\n`;
  if (!/^ADMIN_TOKEN=/m.test(text)) text += `ADMIN_TOKEN=${admin}\n`;
  fs.writeFileSync(file, text, { mode: 0o600 });
  console.log('\n  Created .env with fresh secrets.');
  console.log(`  Admin page: /admin   Admin token: ${admin}`);
  console.log('  (Saved in the .env file. Keep it private.)\n');
}

function loadEnv(file) {
  const out = {};
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env */ }
  return out;
}

const server = http.createServer(handle);
server.headersTimeout = 15_000;   // slowloris protection
server.requestTimeout = 30_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 60;
server.listen(PORT, () => console.log(`Hex Modifications running on http://localhost:${PORT}`));

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { traffic.flush(); traffic.saveBans(); process.exit(0); });

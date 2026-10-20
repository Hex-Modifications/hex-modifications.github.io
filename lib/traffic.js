// Traffic manager: per-IP token-bucket rate limiting, abuse strikes & temp bans,
// scanner/bad-bot blocking, and privacy-friendly analytics (no raw IPs stored).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const LIMITS = {
  page:    { capacity: 60, refillPerSec: 1 },        // ~60 req/min sustained, bursts of 60
  asset:   { capacity: 300, refillPerSec: 10 },
  api:     { capacity: 40, refillPerSec: 0.5 },
  contact: { capacity: 3, refillPerSec: 1 / 300 },   // 3 burst, then 1 every 5 min
  chat:    { capacity: 10, refillPerSec: 1 / 12 },    // 10 burst, then 5 messages a minute
  admin:   { capacity: 20, refillPerSec: 0.2 },
};

const STRIKES_TO_BAN = 8;
const BAN_MS = 60 * 60 * 1000;

// Paths only vulnerability scanners ask for. One hit = heavy strike.
const SCANNER_RE = /(\/\.env|\/\.git|wp-admin|wp-login|xmlrpc\.php|phpmyadmin|\/cgi-bin|\.php$|\/vendor\/phpunit|\/actuator|\/server-status|\/\.aws|\/\.ssh|etc\/passwd|\.\.%2f|%00)/i;
const BAD_UA_RE = /(sqlmap|nikto|nmap|masscan|zgrab|nuclei|acunetix|wpscan|dirbuster|gobuster|ffuf|httpx-toolkit|python-requests\/2\.[0-9]+$|libwww-perl|^$)/i;
const BOT_UA_RE = /(bot|crawler|spider|slurp|bingpreview|facebookexternalhit|discordbot|twitterbot|embedly|headless)/i;

export class Traffic {
  constructor({ dataDir, trustProxy }) {
    this.trustProxy = trustProxy;
    this.buckets = new Map();
    this.strikes = new Map();
    this.bansFile = path.join(dataDir, 'bans.json');
    this.statsFile = path.join(dataDir, 'analytics.json');
    this.bans = new Map(Object.entries(readJson(this.bansFile, {})));
    this.stats = readJson(this.statsFile, freshStats());
    this.daySalt = { day: '', salt: '' };
    this.uniques = new Set();
    this.live = new Map(); // visitorHash -> lastSeen, for "live now"
    this.recentBlocks = [];

    setInterval(() => this.flush(), 60_000).unref();
    setInterval(() => this.sweep(), 5 * 60_000).unref();
  }

  ip(req) {
    if (this.trustProxy === 'cloudflare' && req.headers['cf-connecting-ip']) return String(req.headers['cf-connecting-ip']);
    if (this.trustProxy && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
    return req.socket.remoteAddress || 'unknown';
  }

  // Returns null if allowed, or { status, reason } if the request must be refused.
  gate(req, kind) {
    const ip = this.ip(req);
    const ban = this.bans.get(ip);
    if (ban && ban.until > Date.now()) return { status: 403, reason: 'banned' };
    if (ban) this.bans.delete(ip);

    const url = req.url || '';
    const ua = String(req.headers['user-agent'] || '');
    if (SCANNER_RE.test(url)) { this.strike(ip, 4, `scanner path ${url.slice(0, 80)}`); return { status: 404, reason: 'scanner' }; }
    if (BAD_UA_RE.test(ua)) { this.strike(ip, 2, `bad ua ${ua.slice(0, 60)}`); return { status: 403, reason: 'bad-ua' }; }

    if (!this.take(ip, kind)) {
      this.strike(ip, 1, `rate limit ${kind}`);
      return { status: 429, reason: 'rate-limited' };
    }
    return null;
  }

  take(ip, kind) {
    const cfg = LIMITS[kind] || LIMITS.page;
    const key = `${kind}:${ip}`;
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b) { b = { tokens: cfg.capacity, at: now }; this.buckets.set(key, b); }
    b.tokens = Math.min(cfg.capacity, b.tokens + ((now - b.at) / 1000) * cfg.refillPerSec);
    b.at = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  strike(ip, weight, why) {
    const s = (this.strikes.get(ip) || 0) + weight;
    this.strikes.set(ip, s);
    this.stats.blocked = (this.stats.blocked || 0) + 1;
    this.recentBlocks.unshift({ at: new Date().toISOString(), ip: maskIp(ip), why });
    this.recentBlocks.length = Math.min(this.recentBlocks.length, 50);
    if (s >= STRIKES_TO_BAN) {
      this.bans.set(ip, { until: Date.now() + BAN_MS, why });
      this.strikes.delete(ip);
      this.saveBans();
    }
  }

  unban(ip) { const ok = this.bans.delete(ip); this.saveBans(); return ok; }

  // ── Analytics ───────────────────────────────────────
  visitorHash(req) {
    const day = new Date().toISOString().slice(0, 10);
    if (this.daySalt.day !== day) {
      this.daySalt = { day, salt: crypto.randomBytes(16).toString('hex') }; // rotates daily: hashes can't be linked across days
      this.uniques.clear();
    }
    return crypto.createHash('sha256').update(`${this.daySalt.salt}|${this.ip(req)}|${req.headers['user-agent'] || ''}`).digest('hex').slice(0, 16);
  }

  recordPageview(req, pathname) {
    const ua = String(req.headers['user-agent'] || '');
    const day = new Date().toISOString().slice(0, 10);
    const d = (this.stats.days[day] ||= { views: 0, uniques: 0, bots: 0 });
    if (BOT_UA_RE.test(ua)) { d.bots++; return; }
    const v = this.visitorHash(req);
    d.views++;
    if (!this.uniques.has(v)) { this.uniques.add(v); d.uniques++; }
    this.live.set(v, Date.now());
    bump(this.stats.paths, pathname);
    const ref = refHost(req.headers.referer, req.headers.host);
    if (ref) bump(this.stats.referrers, ref);
    const country = req.headers['cf-ipcountry'];
    if (country) bump(this.stats.countries, String(country).slice(0, 2));
    bump(this.stats.devices, /mobile|android|iphone/i.test(ua) ? 'mobile' : 'desktop');
  }

  recordEvent(type, target) {
    bump(this.stats.events, `${type}:${target}`.slice(0, 60));
  }

  recordTiming(status, ms) {
    bump(this.stats.status, String(status));
    const t = this.stats.timing;
    t.count++; t.total += ms; if (ms > t.max) t.max = ms;
  }

  snapshot() {
    const cutoff = Date.now() - 5 * 60_000;
    for (const [k, at] of this.live) if (at < cutoff) this.live.delete(k);
    const days = Object.entries(this.stats.days).sort().slice(-30);
    return {
      liveNow: this.live.size,
      days,
      topPaths: top(this.stats.paths),
      topReferrers: top(this.stats.referrers),
      countries: top(this.stats.countries),
      devices: this.stats.devices,
      events: top(this.stats.events, 30),
      status: this.stats.status,
      avgResponseMs: this.stats.timing.count ? +(this.stats.timing.total / this.stats.timing.count).toFixed(2) : 0,
      maxResponseMs: +this.stats.timing.max.toFixed(2),
      blockedTotal: this.stats.blocked || 0,
      recentBlocks: this.recentBlocks,
      bans: [...this.bans].map(([ip, b]) => ({ ip, until: new Date(b.until).toISOString(), why: b.why })),
    };
  }

  sweep() {
    const now = Date.now();
    for (const [k, b] of this.buckets) if (now - b.at > 10 * 60_000) this.buckets.delete(k);
    for (const [ip, b] of this.bans) if (b.until < now) this.bans.delete(ip);
    this.strikes.clear(); // strikes decay every 5 min
  }

  flush() { writeJson(this.statsFile, this.stats); }
  saveBans() { writeJson(this.bansFile, Object.fromEntries(this.bans)); }
}

function freshStats() {
  return { days: {}, paths: {}, referrers: {}, countries: {}, devices: {}, events: {}, status: {}, timing: { count: 0, total: 0, max: 0 }, blocked: 0 };
}
function bump(obj, key) { obj[key] = (obj[key] || 0) + 1; }
function top(obj, n = 15) { return Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, n); }
function maskIp(ip) { return ip.includes(':') ? ip.split(':').slice(0, 3).join(':') + ':…' : ip.replace(/\.\d+$/, '.x'); }
function refHost(ref, host) {
  if (!ref) return null;
  try { const h = new URL(ref).host; return h && h !== host ? h : null; } catch { return null; }
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
export function writeJson(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file); // atomic replace
}

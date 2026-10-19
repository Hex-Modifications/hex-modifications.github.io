// Security primitives: headers, CSRF tokens, admin auth, input sanitising.
import crypto from 'node:crypto';

export function securityHeaders(res, { isHtml = false, nonce = '' } = {}) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.removeHeader('X-Powered-By');
  if (isHtml) {
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      `script-src 'self' https://cdn.jsdelivr.net ${nonce ? ` 'nonce-${nonce}'` : ''}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      'upgrade-insecure-requests',
    ].join('; '));
  }
}

// ── CSRF: stateless signed tokens. Format: <issuedAt>.<nonce>.<hmac>
// Also doubles as a bot filter: forms submitted < MIN_AGE after loading are rejected.
const MIN_AGE_MS = 2500;
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

export function makeCsrf(secret) {
  const payload = `${Date.now()}.${crypto.randomBytes(12).toString('base64url')}`;
  return `${payload}.${hmac(secret, payload)}`;
}

export function checkCsrf(secret, token) {
  if (typeof token !== 'string' || token.length > 200) return 'bad-token';
  const parts = token.split('.');
  if (parts.length !== 3) return 'bad-token';
  const [ts, nonce, sig] = parts;
  if (!safeEqual(sig, hmac(secret, `${ts}.${nonce}`))) return 'bad-token';
  const age = Date.now() - Number(ts);
  if (!Number.isFinite(age) || age > MAX_AGE_MS) return 'expired';
  if (age < MIN_AGE_MS) return 'too-fast';
  return null;
}

function hmac(secret, data) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

// Constant-time compare that doesn't leak length.
export function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function isAdmin(req, adminToken) {
  if (!adminToken || adminToken.length < 24) return false; // refuse weak/missing tokens outright
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return false;
  return safeEqual(h.slice(7), adminToken);
}

// Same-origin check for state-changing requests.
export function originAllowed(req, siteUrl) {
  const origin = req.headers.origin;
  if (!origin) return true; // sendBeacon / same-origin navigations may omit it; CSRF token still required
  const host = req.headers.host;
  try {
    const o = new URL(origin);
    if (o.host === host) return true;
    if (siteUrl && o.host === new URL(siteUrl).host) return true;
  } catch { /* fallthrough */ }
  return false;
}

// Strip control chars, trim, cap length. Output is always escaped again at render time.
export function clean(value, max = 2000) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9.-]{1,253}\.[a-z]{2,24}$/i;

// Optional free backend for the "ask hex" chat, on Cloudflare Workers AI (free daily allowance, no card).
// Faster and far less rate-limited than the keyless public tier the site uses by default.
//
// Set up (about 5 minutes):
//   1. dash.cloudflare.com → Workers & Pages → Create → Create Worker → name it (e.g. hex-chat) → Deploy.
//   2. Edit code → replace everything with this file → Deploy.
//   3. Worker → Settings → Bindings → Add → Workers AI → variable name: AI → Save.
//   4. In data/site.json add:  "chat": { "endpoint": "https://hex-chat.<your-subdomain>.workers.dev" }
//      Commit it; the site rebuilds and the chat (and its security policy) switches over automatically.
// The persona is read from the live site (data/persona.json), so the worker never needs editing when mods change.
// Model list: https://developers.cloudflare.com/workers-ai/models/ (set a MODEL variable to change it).

const SITE = 'https://hex-modifications.github.io';
const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const hits = new Map();                       // per-isolate rate limit: 8 messages a minute per visitor
let persona = { at: 0, text: '' };

export default {
  async fetch(req, env) {
    const cors = { 'Access-Control-Allow-Origin': SITE, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return new Response('POST only', { status: 405, headers: cors });
    if (req.headers.get('Origin') !== SITE) return new Response('Forbidden', { status: 403, headers: cors });

    const ip = req.headers.get('CF-Connecting-IP') || 'unknown', now = Date.now();
    const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
    if (recent.length >= 8) return Response.json({ error: 'Slow down. Retry after 20s' }, { status: 429, headers: { ...cors, 'Retry-After': '20' } });
    recent.push(now); hits.set(ip, recent);

    const body = await req.json().catch(() => null);
    const messages = (Array.isArray(body?.messages) ? body.messages : []).slice(-12)
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')   // the page's system prompt is ignored
      .map((m) => ({ role: m.role, content: m.content.slice(0, 800) }));
    if (!messages.length || messages.at(-1).role !== 'user') return Response.json({ error: 'Send a message.' }, { status: 422, headers: cors });

    if (now - persona.at > 3_600_000 || !persona.text) {
      try { const r = await fetch(`${SITE}/data/persona.json`); if (r.ok) persona = { at: now, text: (await r.json()).prompt || '' }; } catch { /* keep the old one */ }
    }
    try {
      const out = await env.AI.run(env.MODEL || DEFAULT_MODEL, { messages: [{ role: 'system', content: persona.text }, ...messages], max_tokens: 400 });
      return Response.json({ choices: [{ message: { role: 'assistant', content: String(out?.response || '') } }] }, { headers: cors });
    } catch {
      return Response.json({ error: 'AI unavailable. Retry after 10s' }, { status: 503, headers: cors });
    }
  },
};

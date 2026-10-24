/* "ask hex": a free AI chat that answers in 001hex's voice.
   Routes, in order: the site's own backend (/api/chat, when a key is configured there) → a custom endpoint from
   site.json "chat" (e.g. the free Cloudflare Worker in workers/) → Pollinations' keyless free tier.
   Common questions (support, links, what's new) are answered instantly on the page, which also covers the free
   tier's limits (about one AI reply every 30 seconds per visitor) and any outage. */
import { personaPrompt } from './persona.js';

const FREE = { endpoint: 'https://text.pollinations.ai/openai', model: 'openai' };
const $ = (s, el = document) => el.querySelector(s);
const fab = $('#chatFab'), box = $('#chat'), log = $('#chatLog'), form = $('#chatForm'), input = $('#chatInput'), sugg = $('#chatSugg');
const STORE = 'hex-chat';
let history = [];
try { history = JSON.parse(sessionStorage.getItem(STORE) || '[]').filter((m) => m && typeof m.content === 'string').slice(-20); } catch { history = []; }
const save = () => { try { sessionStorage.setItem(STORE, JSON.stringify(history.slice(-20))); } catch { /* private mode */ } };

/* ── data the persona is built from (app.js publishes it once loaded) ── */
const data = () => window.hexData || {};
const ready = new Promise((resolve) => {
  if (window.hexData) return resolve();
  document.addEventListener('hex:data', () => resolve(), { once: true });
  setTimeout(resolve, 4000);
});
let serverChat = null;                                     // null = unknown, then true/false
async function hasServerChat() {
  if (serverChat !== null) return serverChat;
  serverChat = false;
  if (data().apiOnline) {
    try { const r = await fetch('/api/chat', { headers: { Accept: 'application/json' } }); serverChat = r.ok && !!(await r.json()).enabled; } catch { /* static host */ }
  }
  return serverChat;
}

/* ── rendering ── */
const URL_RE = /(https:\/\/[^\s<>"')\]]+[^\s<>"')\].,!?;:])/g;
function bubble(role, text, cls = '') {
  const el = document.createElement('div');
  el.className = `msg ${role === 'user' ? 'me' : 'bot'} ${cls}`.trim();
  // plain text only; https links become real links, everything else stays text
  String(text).split(URL_RE).forEach((part, i) => {
    if (i % 2) { const a = document.createElement('a'); a.href = part; a.target = '_blank'; a.rel = 'noopener'; a.textContent = part.replace(/^https:\/\/(www\.)?/, ''); el.append(a); }
    else el.append(part);
  });
  log.append(el); log.scrollTop = log.scrollHeight;
  return el;
}
function typing() {
  const el = document.createElement('div');
  el.className = 'msg bot typing'; el.setAttribute('aria-label', 'hex is typing');
  el.innerHTML = '<i></i><i></i><i></i><span class="wait"></span>';
  log.append(el); log.scrollTop = log.scrollHeight;
  return el;
}
const clean = (s) => String(s || '')
  .replace(/<think>[\s\S]*?<\/think>/gi, '')
  .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '$1 $2')       // markdown links → text + url
  .replace(/(\*\*|__|`{1,3})/g, '').replace(/^#{1,6}\s*/gm, '').replace(/^\s*[-*]\s+/gm, '• ')
  .replace(/\s+[–—]\s+/g, ', ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/\n{3,}/g, '\n\n').trim().slice(0, 1400);

/* ── instant answers for the obvious questions ── */
function local(q) {
  const d = data(), L = d.site?.links || {}, rel = d.releases || [];
  const disc = L.discord ? `the discord: ${L.discord}` : 'the discord';
  const t = q.toLowerCase().trim();
  if (/^(hi+|hey+|yo+|hello+|sup|wassup|hiya|heya|oi|wagwan)\b[\s!.?]*$/.test(t)) return "yo, i'm the AI version of 001hex. ask me about the mods, scripts, presets or how to get support.";
  if (/\b(discord|support server|contact you|get in touch|reach you|talk to (you|001hex|a human|someone)|real person)\b/.test(t) && !/\b(install|how do|how to|error|crash)\b/.test(t)) {
    return `best place is ${disc}. you can also add me directly, 001hex${d.site?.email ? `, or email ${d.site.email}` : ''}.`;
  }
  if (/\b(e-?mail)\b/.test(t) && d.site?.email) return `it's ${d.site.email}. for quicker replies, discord is better: 001hex.`;
  if ((/\b(latest|newest|recent|new)\b/.test(t) && /\b(mods?|releases?|drops?|uploads?|scripts?|stuff)\b/.test(t)) || /what'?s new/.test(t)) {
    if (!rel.length) return null;
    return `newest stuff:\n${rel.slice(0, 3).map((r) => `• ${r.title} (${r.source}) ${r.url}`).join('\n')}`;
  }
  if (/\b(links?|socials?|platforms?|where (can i|do i|are|is)|find (your|ur|the) (mods|stuff|scripts))\b/.test(t)) {
    const pick = ['gta5mods', 'lcpdfr', 'fivem', 'github', 'patreon'].filter((k) => L[k]).map((k) => `• ${{ gta5mods: 'gta5-mods', lcpdfr: 'lcpdfr', fivem: 'fivem forum', github: 'github', patreon: 'patreon' }[k]}: ${L[k]}`);
    return pick.length ? `everything's here:\n${pick.join('\n')}` : null;
  }
  return null;
}

/* ── the AI call ── */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ask(messages, onWait) {
  await ready;
  const d = data();
  if (await hasServerChat()) {
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ messages }), signal: AbortSignal.timeout(45000) });
    if (!r.ok) throw new Error(`server ${r.status}`);
    return clean((await r.json()).reply);
  }
  const cfg = d.site?.chat || {};
  const endpoint = /^https:\/\//.test(cfg.endpoint || '') ? cfg.endpoint : FREE.endpoint;
  const system = personaPrompt({ site: d.site, releases: d.releases, products: d.products, roadmap: d.roadmap });
  const body = JSON.stringify({ model: cfg.model || FREE.model, messages: [{ role: 'system', content: system }, ...messages], max_tokens: 400, private: true, referrer: location.hostname });
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(60000) });
    if (r.ok) {
      const j = await r.json();
      const reply = clean(j.choices?.[0]?.message?.content ?? j.reply ?? '');
      if (reply) return reply;
      throw new Error('empty reply');
    }
    // free tier: "one reply every 30 seconds" (402/429) or "busy" (503) → wait as told, then retry
    if (![402, 429, 503].includes(r.status)) throw new Error(`ai ${r.status}`);
    const msg = await r.text().catch(() => '');
    const secs = Number(msg.match(/retry after (\d+)\s*s/i)?.[1] || r.headers.get('Retry-After') || (r.status === 503 ? 10 : 15));
    if (secs > 45) throw new Error('busy');
    await onWait(secs + 1);
  }
  throw new Error('busy');
}

let busy = false;
async function send(text) {
  text = text.replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!text || busy) return;
  busy = true; form.classList.add('busy'); sugg.hidden = true;
  bubble('user', text);
  history.push({ role: 'user', content: text }); save();
  await ready;
  const quick = local(text);
  if (quick) {
    await sleep(350);
    bubble('assistant', quick); history.push({ role: 'assistant', content: quick }); save();
    busy = false; form.classList.remove('busy'); return;
  }
  const dots = typing(), wait = $('.wait', dots);
  try {
    const reply = await ask(history.slice(-10), async (secs) => {
      for (let s = secs; s > 0; s--) { wait.textContent = `free AI is busy, trying again in ${s}s`; await sleep(1000); }
      wait.textContent = '';
    });
    dots.remove();
    bubble('assistant', reply); history.push({ role: 'assistant', content: reply }); save();
  } catch {
    dots.remove();
    const L = data().site?.links || {};
    bubble('assistant', `can't reach my brain right now, sorry. try again in a minute, or message 001hex on discord${L.discord ? `: ${L.discord}` : ''}.`, 'err');
    history.pop(); save();
  }
  busy = false; form.classList.remove('busy'); input.focus();
}

/* ── open / close ── */
function open() {
  box.hidden = false; fab.setAttribute('aria-expanded', 'true'); document.documentElement.classList.add('chat-open');
  if (!log.childElementCount) {
    if (history.length) history.forEach((m) => bubble(m.role, m.content));
    else { bubble('assistant', "yo, i'm the AI version of 001hex. ask me anything about the mods, presets or scripts."); sugg.hidden = false; }
  }
  setTimeout(() => input.focus({ preventScroll: true }), 60);
}
function close() { box.hidden = true; fab.setAttribute('aria-expanded', 'false'); document.documentElement.classList.remove('chat-open'); fab.focus({ preventScroll: true }); }
if (fab && box) {
  fab.addEventListener('click', () => (box.hidden ? open() : close()));
  $('#chatClose').addEventListener('click', close);
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  form.addEventListener('submit', (e) => { e.preventDefault(); const v = input.value; input.value = ''; send(v); });
  sugg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) send(b.textContent); });
  fab.hidden = false;
}

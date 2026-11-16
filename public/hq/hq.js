/* Hex HQ: the owner panel for the Hex Modifications network.
   There is no server: GitHub is the backend. The owner signs in with a GitHub token; every change is a commit
   to the repo, and the deploy workflow rebuilds the sites. Access = write access to the repo AND a place on
   the owner list in data/network.json (repo admins always get in, so the owner can't lock themselves out).
   The token lives in sessionStorage only and is wiped on lock, tab close or 30 minutes idle. */
(() => {
  'use strict';
  const REPO = 'Hex-Modifications/hex-modifications.github.io';
  const BRANCH = 'main';
  const AI = 'https://text.pollinations.ai/openai';
  const IDLE_MS = 30 * 60 * 1000;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ago = (d) => { const s = (Date.now() - Date.parse(d)) / 1000; return s < 90 ? 'just now' : s < 5400 ? `${Math.round(s / 60)}m ago` : s < 129600 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`; };
  const store = { get: () => { try { return sessionStorage.getItem('hex-hq') || ''; } catch { return ''; } }, set: (v) => { try { v ? sessionStorage.setItem('hex-hq', v) : sessionStorage.removeItem('hex-hq'); } catch { /* blocked */ } } };

  let token = store.get(), me = null, repo = null, network = null, networkSha = '', idle, poll;

  // ── GitHub ─────────────────────────────────────────
  async function gh(path, opts = {}) {
    const r = await fetch(`https://api.github.com${path}`, { ...opts, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
    if (r.status === 401) { lock('Your token was rejected or has expired.'); throw new Error('signed out'); }
    if (r.status === 204) return null;
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.message ? `${body.message} (${r.status})` : `GitHub ${r.status}`);
    return body;
  }
  const b64 = { decode: (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0))),
    encode: (t) => { const b = new TextEncoder().encode(t); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); } };
  async function readFile(path) {
    const f = await gh(`/repos/${REPO}/contents/${path}?ref=${BRANCH}`);
    return { text: b64.decode(f.content), sha: f.sha };
  }
  async function writeFile(path, text, sha, message) {
    // commits under the GitHub noreply address, so no personal email ends up in the history
    const who = { name: me.login, email: `${me.login}@users.noreply.github.com` };
    const r = await gh(`/repos/${REPO}/contents/${path}`, { method: 'PUT', body: JSON.stringify({ message: `${message}\n\nVia Hex HQ`, content: b64.encode(text), sha, branch: BRANCH, author: who, committer: who }) });
    return r.content.sha;
  }
  async function loadNetwork() { const f = await readFile('data/network.json'); network = JSON.parse(f.text); networkSha = f.sha; return network; }
  async function saveNetwork(message) { networkSha = await writeFile('data/network.json', `${JSON.stringify(network, null, 2)}\n`, networkSha, message); }

  // ── sign in / lock ─────────────────────────────────
  async function unlock() {
    const err = $('#loginErr'); err.textContent = '';
    const btn = $('#loginForm button'); btn.disabled = true; btn.textContent = 'checking…';
    try {
      me = await gh('/user');
      repo = await gh(`/repos/${REPO}`);
      if (!repo.permissions?.push) throw new Error(`@${me.login} doesn't have write access to the Hex Modifications repo.`);
      await loadNetwork();
      const owners = (network.owners || []).map((o) => String(o).toLowerCase());
      if (!repo.permissions.admin && owners.length && !owners.includes(me.login.toLowerCase())) throw new Error(`@${me.login} isn't on the owner list.`);
    } catch (e) {
      token = ''; store.set(''); me = null;
      if (e.message !== 'signed out') err.textContent = /Bad credentials|401/.test(e.message) ? 'That token was rejected by GitHub.' : e.message;
      btn.disabled = false; btn.textContent = 'unlock'; return;
    }
    store.set(token); $('#token').value = '';
    btn.disabled = false; btn.textContent = 'unlock';
    $('#login').hidden = true; $('#dash').hidden = false; $('#lock').hidden = false;
    $('#who').innerHTML = `<img src="${esc(me.avatar_url)}" alt=""><span>@${esc(me.login)}</span>`;
    bump(); show(location.hash.slice(1) || 'overview');
  }
  function lock(msg = '') {
    token = ''; store.set(''); me = null; network = null; clearTimeout(idle); clearInterval(poll);
    $('#dash').hidden = true; $('#lock').hidden = true; $('#login').hidden = false; $('#who').textContent = '';
    $('#loginErr').textContent = msg;
  }
  const bump = () => { clearTimeout(idle); idle = setTimeout(() => lock('Locked after 30 minutes idle.'), IDLE_MS); };
  ['pointerdown', 'keydown'].forEach((ev) => addEventListener(ev, () => { if (me) bump(); }, { passive: true }));
  $('#loginForm').addEventListener('submit', (e) => { e.preventDefault(); token = $('#token').value.trim(); if (token) unlock(); });
  $('#lock').addEventListener('click', () => lock());

  // ── tabs ───────────────────────────────────────────
  const loaders = {};
  function show(tab) {
    if (!$(`[data-panel="${tab}"]`)) tab = 'overview';
    $$('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    $$('.panel').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
    history.replaceState(null, '', `#${tab}`);
    clearInterval(poll);
    loaders[tab]?.();
  }
  $('.tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(b.dataset.tab); });
  function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 3200); }
  const say = (el, text, kind = '') => { el.textContent = text; el.className = `mono msg ${kind}`; };

  // ── overview ───────────────────────────────────────
  const SITE_ROWS = () => [{ key: 'main', name: 'Hex Modifications', path: '', live: true }, ...Object.entries(network.sites || {}).map(([key, s]) => ({ key, name: s.name || key, path: s.path || `${key}/`, live: s.live !== false }))];
  loaders.overview = async () => {
    $('#ovSites').innerHTML = SITE_ROWS().map((s) => `<li data-k="${esc(s.key)}"><span class="dot"></span><span class="grow"><a href="/${esc(s.path)}" target="_blank" rel="noopener">${esc(s.name)}</a></span><span class="tag ${s.live ? 'live' : 'parked'}">${s.live ? 'live' : 'parked'}</span><span class="meta">…</span></li>`).join('');
    SITE_ROWS().forEach(async (s) => {
      const li = $(`#ovSites [data-k="${s.key}"]`);
      try {
        const r = await fetch(`/${s.path}?hq=${Date.now()}`, { method: 'HEAD', cache: 'no-store' });
        const up = r.ok, fine = up === s.live;
        $('.dot', li).className = `dot ${fine ? (up ? 'ok' : '') : 'warn'}`;
        $('.meta', li).textContent = up ? 'online' : s.live ? `${r.status} · deploying?` : 'offline';
      } catch { $('.meta', li).textContent = 'unreachable'; }
    });
    const refresh = async () => {
      try {
        const runs = (await gh(`/repos/${REPO}/actions/runs?per_page=6`)).workflow_runs || [];
        $('#ovRuns').innerHTML = runs.map((r) => { const st = r.status !== 'completed' ? 'run' : r.conclusion === 'success' ? 'ok' : 'bad';
          return `<li><span class="dot ${st}"></span><span class="grow"><a href="${esc(r.html_url)}" target="_blank" rel="noopener">${esc((r.head_commit?.message || r.display_title || '').split('\n')[0])}</a></span><span class="meta">${esc(r.event === 'schedule' ? 'auto' : r.event)} · ${ago(r.created_at)}</span></li>`; }).join('') || '<li class="muted">no deploys yet</li>';
      } catch (e) { $('#ovRuns').innerHTML = `<li class="muted">${esc(e.message)}. Give the token Actions access to see deploys.</li>`; }
    };
    refresh(); poll = setInterval(refresh, 20000);
    try {
      const commits = await gh(`/repos/${REPO}/commits?sha=${BRANCH}&per_page=8`);
      $('#ovCommits').innerHTML = commits.map((c) => `<li><span class="grow"><a href="${esc(c.html_url)}" target="_blank" rel="noopener">${esc(c.commit.message.split('\n')[0])}</a></span><span class="meta">${ago(c.commit.author.date)}</span></li>`).join('');
    } catch (e) { $('#ovCommits').innerHTML = `<li class="muted">${esc(e.message)}</li>`; }
  };
  $('#rebuild').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { await gh(`/repos/${REPO}/actions/workflows/deploy.yml/dispatches`, { method: 'POST', body: JSON.stringify({ ref: BRANCH }) }); toast('rebuild started, live in about two minutes'); setTimeout(() => loaders.overview(), 4000); }
    catch (err) { toast(err.message); }
    e.target.disabled = false;
  });

  // ── network ────────────────────────────────────────
  loaders.network = async () => {
    await loadNetwork();
    $('#netSites').innerHTML = `<li class="site"><span class="grow"><b>Hex Modifications</b><p>the main site · always on</p></span><label class="switch" title="the main site is always on"><input type="checkbox" checked disabled><span></span></label></li>`
      + Object.entries(network.sites || {}).map(([k, s]) => `<li class="site"><span class="grow"><b>${esc(s.name || k)}</b><p>/${esc(s.path || k)} · ${esc(s.about || '')}</p></span><label class="switch" title="live or parked"><input type="checkbox" data-site="${esc(k)}" ${s.live !== false ? 'checked' : ''}><span></span></label></li>`).join('');
    say($('#netMsg'), '');
  };
  $('#netSave').addEventListener('click', async (e) => {
    e.target.disabled = true; say($('#netMsg'), 'saving…');
    try {
      await loadNetwork();
      const changed = [];
      $$('#netSites input[data-site]').forEach((i) => { const s = network.sites[i.dataset.site]; if (s && (s.live !== false) !== i.checked) { s.live = i.checked; changed.push(`${i.checked ? 'bring back' : 'park'} ${s.name}`); } });
      if (!changed.length) { say($('#netMsg'), 'nothing changed'); return; }
      await saveNetwork(`HQ: ${changed.join(', ')}`);
      say($('#netMsg'), `saved: ${changed.join(', ')}. live in about two minutes.`, 'ok');
    } catch (err) { say($('#netMsg'), err.message, 'bad'); } finally { e.target.disabled = false; }
  });

  // ── theme ──────────────────────────────────────────
  const PALETTES = { sunset: ['#E89898', '#A373D3', '#5D549C'], mono: ['#A3A3AC', '#7C7C87', '#3B3B45'], ocean: ['#7FC8C2', '#4FA3C7', '#2F5D8A'], neon: ['#FF6FA8', '#19C6F0', '#5B3DF5'], ember: ['#F2A65A', '#E0703E', '#8C2F39'] };
  const PHASES = ['auto', 'dawn', 'day', 'dusk', 'night'];
  let pick = { palette: 'sunset', phase: 'auto' };
  const previewLink = () => { $('#themePreview').href = `/?nosplash&palette=${pick.palette}${pick.phase !== 'auto' ? `&phase=${pick.phase}` : ''}`; };
  loaders.theme = async () => {
    await loadNetwork();
    pick = { palette: network.theme?.palette || 'sunset', phase: network.theme?.phase || 'auto' };
    $('#palettes').innerHTML = Object.entries(PALETTES).map(([k, c]) => `<button class="pal" type="button" data-p="${k}" aria-pressed="${k === pick.palette}"><i style="background:linear-gradient(100deg,${c.join(',')})"></i>${k}</button>`).join('');
    $('#phases').innerHTML = PHASES.map((p) => `<button class="chip" type="button" data-ph="${p}" aria-pressed="${p === pick.phase}">${p === 'auto' ? 'follow visitor' : p}</button>`).join('');
    previewLink(); say($('#themeMsg'), '');
  };
  $('#palettes').addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (!b) return; pick.palette = b.dataset.p; $$('.pal').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); previewLink(); });
  $('#phases').addEventListener('click', (e) => { const b = e.target.closest('[data-ph]'); if (!b) return; pick.phase = b.dataset.ph; $$('#phases .chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); previewLink(); });
  $('#themeSave').addEventListener('click', async (e) => {
    e.target.disabled = true; say($('#themeMsg'), 'saving…');
    try { await loadNetwork(); network.theme = { ...pick }; await saveNetwork(`HQ: theme ${pick.palette}, ${pick.phase === 'auto' ? 'time of day follows visitors' : `locked to ${pick.phase}`}`); say($('#themeMsg'), 'applied. live in about two minutes.', 'ok'); }
    catch (err) { say($('#themeMsg'), err.message, 'bad'); } finally { e.target.disabled = false; }
  });

  // ── AI ─────────────────────────────────────────────
  // Pollinations' free tier, the same one the site's "ask hex" chat uses. Only public site data is sent.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function ai(messages, { json = false, onWait } = {}) {
    const body = JSON.stringify({ model: 'openai', messages, private: true, referrer: 'hex-hq', ...(json ? { response_format: { type: 'json_object' } } : {}) });
    for (let i = 0; i < 4; i++) {
      const r = await fetch(AI, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(90000) });
      if (r.ok) {
        const out = (await r.json()).choices?.[0]?.message?.content || '';
        if (!json) return out.trim();
        const m = out.match(/\{[\s\S]*\}/); if (!m) throw new Error('the AI reply was not readable, try again');
        return JSON.parse(m[0]);
      }
      if (![402, 429, 503].includes(r.status)) throw new Error(`AI unavailable (${r.status})`);
      const secs = Number((await r.text().catch(() => '')).match(/(\d+)\s*s/)?.[1] || 15);
      onWait?.(secs); await sleep((secs + 1) * 1000);
    }
    throw new Error('the free AI is busy, try again in a minute');
  }
  let ctxCache = null;
  async function context() {
    if (ctxCache) return ctxCache;
    const get = async (p) => { try { return JSON.parse((await readFile(p)).text); } catch { return null; } };
    const [site, projects, rel] = await Promise.all([get('data/site.json'), get('data/projects.json'), fetch('/data/releases.json').then((r) => r.json()).catch(() => null)]);
    const live = Object.entries(network?.sites || {}).filter(([, s]) => s.live !== false).map(([k]) => k);
    ctxCache = {
      site: { name: site?.name, handle: site?.handle, tagline: site?.tagline, description: site?.description, links: site?.links, platforms: (site?.platforms || []).map((p) => ({ name: p.name, label: p.label, highlights: p.highlights })) },
      projects: (projects || []).filter((p) => !network?.sites?.[p.slug] || live.includes(p.slug)).map((p) => ({ name: p.name, kicker: p.kicker, text: p.text, url: p.url })),
      latestReleases: (rel?.items || []).slice(0, 8).map((r) => ({ title: r.title, platform: r.source || r.platform, date: r.date })),
      url: location.origin,
    };
    return ctxCache;
  }
  const SYSTEM = 'You are HQ, the private growth assistant for Hex Modifications, a one-person modding studio run by 001hex (an 18-year-old UK modder and developer). It makes GTA V mods, LSPDFR add-ons, FiveM scripts, ReShade presets, PC tools for Mac and Windows, and hexcam, a free in-browser photo and video effects tool. Goal: more people discovering the work and more downloads, by honest means only (no fake reviews, no bots, no spam, no vote manipulation, respect each platform\'s rules and Rockstar\'s modding guidelines). Be specific, practical and brief. British English. Lowercase style is fine for social copy.';

  // ── growth: SEO health ─────────────────────────────
  async function seoCheck() {
    const out = $('#seoChecks'); out.innerHTML = '<li class="warn">checking the live site…</li>';
    const items = [];
    const add = (state, text, tip = '') => items.push(`<li class="${state}">${esc(text)}${tip ? `<em>${esc(tip)}</em>` : ''}</li>`);
    const pages = [['/', 'homepage'], ...Object.values(network?.sites || {}).filter((s) => s.live !== false).map((s) => [`/${s.path}`, s.name])];
    for (const [url, name] of pages) {
      try {
        const html = await (await fetch(url, { cache: 'no-store' })).text();
        const d = new DOMParser().parseFromString(html, 'text/html');
        const t = d.title.trim(), desc = d.querySelector('meta[name="description"]')?.content?.trim() || '';
        add(t.length >= 25 && t.length <= 65 ? '' : 'warn', `${name}: title ${t.length} characters`, t.length > 65 ? 'Google cuts titles after about 60 characters.' : t.length < 25 ? 'Short titles waste space: add what you make.' : t);
        add(desc.length >= 70 && desc.length <= 160 ? '' : desc ? 'warn' : 'bad', `${name}: description ${desc.length} characters`, desc ? (desc.length > 160 ? 'Google cuts descriptions after about 155 characters.' : '') : 'Missing: Google will pick random text from the page.');
        add(d.querySelector('meta[property="og:image"]') ? '' : 'bad', `${name}: share image`, d.querySelector('meta[property="og:image"]') ? '' : 'Links shared on Discord, Reddit and X will show no picture.');
        add(d.querySelector('link[rel="canonical"]') ? '' : 'warn', `${name}: canonical link`);
        add(d.querySelector('script[type="application/ld+json"]') || url !== '/' ? '' : 'warn', `${name}: structured data`, url === '/' ? 'Helps Google show your name, links and logo.' : '');
        const h1 = d.querySelectorAll('h1').length; add(h1 === 1 ? '' : 'warn', `${name}: ${h1} main heading${h1 === 1 ? '' : 's'}`, h1 === 1 ? '' : 'Pages rank best with exactly one <h1>.');
        const noAlt = [...d.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length; if (noAlt) add('warn', `${name}: ${noAlt} image${noAlt > 1 ? 's' : ''} without alt text`);
      } catch { add('bad', `${name}: couldn't load ${url}`); }
    }
    try { const sm = await (await fetch('/sitemap.xml', { cache: 'no-store' })).text(); const n = (sm.match(/<loc>/g) || []).length; add(n ? '' : 'bad', `sitemap lists ${n} page${n === 1 ? '' : 's'}`); } catch { add('bad', 'no sitemap'); }
    try { const rb = await (await fetch('/robots.txt', { cache: 'no-store' })).text(); add(/Sitemap:/i.test(rb) ? '' : 'warn', 'robots.txt points search engines to the sitemap'); add(/Disallow:\s*\/\s*$/m.test(rb) ? 'bad' : '', /Disallow:\s*\/\s*$/m.test(rb) ? 'robots.txt blocks the whole site!' : 'robots.txt lets search engines in'); } catch { add('bad', 'no robots.txt'); }
    const key = network?.indexnow?.enabled !== false && network?.indexnow?.key;
    add(key ? '' : 'warn', key ? 'IndexNow pings search engines on every deploy' : 'IndexNow is off', key ? '' : 'Turn it on in data/network.json (indexnow.enabled).');
    out.innerHTML = items.join('');
  }
  $('#seoRun').addEventListener('click', seoCheck);

  // ── growth: search listing ─────────────────────────
  const counter = (id, max) => { const el = $(`.count[data-for="${id}"]`), n = $(`#${id}`).value.length; el.textContent = `${n}/${max}`; el.classList.toggle('over', n > max); };
  const serp = () => {
    counter('seoTitle', 60); counter('seoDesc', 155);
    $('#serp').innerHTML = `<small>${esc(location.host)}</small><b>${esc($('#seoTitle').value || document.title)}</b><span>${esc($('#seoDesc').value)}</span>`;
  };
  ['seoTitle', 'seoDesc'].forEach((id) => $(`#${id}`).addEventListener('input', serp));
  async function seoLoad() {
    const s = network?.seo || {};
    let title = s.title, desc = s.description, keys = s.keywords;
    if (!title || !desc || !keys) {   // fall back to what the live homepage says now
      try { const d = new DOMParser().parseFromString(await (await fetch('/', { cache: 'no-store' })).text(), 'text/html'); title ||= d.title; desc ||= d.querySelector('meta[name="description"]')?.content || ''; keys ||= d.querySelector('meta[name="keywords"]')?.content || ''; } catch { /* offline */ }
    }
    $('#seoTitle').value = title || ''; $('#seoDesc').value = desc || ''; $('#seoKeys').value = keys || ''; serp();
  }
  $('#seoAi').addEventListener('click', async (e) => {
    e.target.disabled = true; say($('#seoMsg'), 'writing…');
    try {
      const ctx = await context();
      const r = await ai([{ role: 'system', content: SYSTEM }, { role: 'user', content: `Write the Google search listing for the Hex Modifications homepage. Site data: ${JSON.stringify(ctx)}\nReturn JSON only: {"title": "...", "description": "...", "keywords": "..."}. Title: 50 to 60 characters, starts with "Hex Modifications", names the most-searched things it offers (e.g. GTA V mods, LSPDFR, FiveM scripts, ReShade). Description: 140 to 155 characters, specific, ends with a reason to click, no clickbait. Keywords: 10 to 15 comma-separated phrases people actually search.` }], { json: true, onWait: (s) => say($('#seoMsg'), `the free AI is queueing, ${s}s…`) });
      $('#seoTitle').value = String(r.title || '').slice(0, 70); $('#seoDesc').value = String(r.description || '').slice(0, 170); $('#seoKeys').value = String(r.keywords || '');
      serp(); say($('#seoMsg'), 'check it, then apply', 'ok');
    } catch (err) { say($('#seoMsg'), err.message, 'bad'); } finally { e.target.disabled = false; }
  });
  $('#seoApply').addEventListener('click', async (e) => {
    e.target.disabled = true; say($('#seoMsg'), 'saving…');
    try {
      await loadNetwork();
      network.seo = { title: $('#seoTitle').value.trim(), description: $('#seoDesc').value.trim(), keywords: $('#seoKeys').value.trim() };
      await saveNetwork('HQ: update the homepage search listing');
      say($('#seoMsg'), 'applied. live in about two minutes, and search engines are pinged.', 'ok');
    } catch (err) { say($('#seoMsg'), err.message, 'bad'); } finally { e.target.disabled = false; }
  });

  // ── growth: release kit ────────────────────────────
  const KIT = [['gta5mods', 'GTA5-Mods description'], ['lcpdfr', 'LCPDFR / Cfx.re forum post'], ['reddit', 'Reddit post'], ['discord', 'Discord announcement'], ['x', 'X post'], ['tiktok', 'TikTok / Shorts caption'], ['youtube', 'YouTube title, description and tags']];
  $('#rkGo').addEventListener('click', async (e) => {
    const name = $('#rkName').value.trim(), what = $('#rkWhat').value.trim();
    if (!name || !what) { say($('#rkMsg'), 'add a name and what it does', 'bad'); return; }
    e.target.disabled = true; say($('#rkMsg'), 'writing every post…'); $('#rkOut').innerHTML = '';
    try {
      const ctx = await context();
      const r = await ai([{ role: 'system', content: SYSTEM }, { role: 'user', content: `New release from Hex Modifications.\nName: ${name}\nType: ${$('#rkType').value}\nWhat it does / what's new: ${what}\nDownload: ${$('#rkLink').value.trim() || '(link to come)'}\nStudio: ${JSON.stringify({ links: ctx.site.links, platforms: ctx.site.platforms })}\n\nWrite release copy for each platform, following each one's norms and rules. Return JSON only with string values for these keys: ${KIT.map(([k]) => k).join(', ')}.\n- gta5mods: full mod description with features list, installation steps, requirements, changelog and credits sections (plain text, no markdown links).\n- lcpdfr: forum post for LCPDFR or the Cfx.re forum, whichever fits the type.\n- reddit: first line "TITLE: ..." then the body; then a line "SUBREDDITS: ..." naming 2 to 4 fitting subreddits (e.g. r/GTA5Mods, r/LSPDFR, r/FiveM, r/ReShade, r/GrandTheftAutoV_PC); no clickbait, follow self-promotion rules.\n- discord: short hype announcement with emoji, ping-free.\n- x: under 260 characters with 2 to 4 hashtags.\n- tiktok: hook line, caption and 5 hashtags.\n- youtube: "TITLE: ..." line, a description with timestamps placeholder and links, and a "TAGS: ..." line.` }], { json: true, onWait: (s) => say($('#rkMsg'), `the free AI is queueing, ${s}s…`) });
      $('#rkOut').innerHTML = KIT.filter(([k]) => r[k]).map(([k, label]) => `<div class="post"><h3>${esc(label)}</h3><button class="btn ghost" type="button" data-copy>copy</button><pre>${esc(typeof r[k] === 'string' ? r[k] : JSON.stringify(r[k], null, 2))}</pre></div>`).join('');
      say($('#rkMsg'), 'done. read each one before posting.', 'ok');
    } catch (err) { say($('#rkMsg'), err.message, 'bad'); } finally { e.target.disabled = false; }
  });
  $('#rkOut').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy]'); if (!b) return;
    try { await navigator.clipboard.writeText($('pre', b.parentElement).textContent); b.textContent = 'copied'; setTimeout(() => { b.textContent = 'copy'; }, 1500); } catch { toast('copy blocked by the browser'); }
  });

  // ── growth: ask hq ─────────────────────────────────
  const QUICK = ['make me a growth plan for this week', 'what should my next mod be?', 'where should I post my latest release?', 'how do I get more GTA5-Mods downloads?', 'ideas to grow hexcam'];
  const chat = [];
  $('#askQuick').innerHTML = QUICK.map((q) => `<button class="chip" type="button">${esc(q)}</button>`).join('');
  $('#askQuick').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) { $('#askIn').value = b.textContent; $('#askForm').requestSubmit(); } });
  $('#askForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('#askIn').value.trim(); if (!q) return;
    $('#askIn').value = ''; chat.push({ role: 'user', content: q });
    const log = $('#askLog');
    log.insertAdjacentHTML('beforeend', `<div class="bubble me">${esc(q)}</div><div class="bubble ai">thinking…</div>`);
    const out = log.lastElementChild; log.scrollTop = log.scrollHeight;
    try {
      const ctx = await context();
      const a = await ai([{ role: 'system', content: `${SYSTEM}\nCurrent data: ${JSON.stringify(ctx)}` }, ...chat.slice(-10)], { onWait: (s) => { out.textContent = `queueing, ${s}s…`; } });
      chat.push({ role: 'assistant', content: a }); out.textContent = a;
    } catch (err) { out.textContent = err.message; chat.pop(); }
    log.scrollTop = log.scrollHeight;
  });
  loaders.growth = () => { seoCheck(); seoLoad(); };

  // ── content ────────────────────────────────────────
  let edSha = '';
  const ARRAYS = ['projects', 'products', 'roadmap', 'feed', 'releases-manual'];
  async function edLoad() {
    say($('#edMsg'), 'loading…');
    try { const f = await readFile(`data/${$('#edFile').value}.json`); $('#editor').value = f.text; edSha = f.sha; say($('#edMsg'), 'loaded'); }
    catch (err) { say($('#edMsg'), err.message, 'bad'); }
  }
  loaders.content = () => { if (!$('#editor').value) edLoad(); };
  $('#edLoad').addEventListener('click', edLoad);
  $('#edFile').addEventListener('change', edLoad);
  $('#edSave').addEventListener('click', async (e) => {
    const name = $('#edFile').value; let data;
    try { data = JSON.parse($('#editor').value); } catch (err) { say($('#edMsg'), `not valid JSON: ${err.message}`, 'bad'); return; }
    if (ARRAYS.includes(name) !== Array.isArray(data)) { say($('#edMsg'), `${name} must be ${ARRAYS.includes(name) ? 'a list [ … ]' : 'an object { … }'}`, 'bad'); return; }
    e.target.disabled = true; say($('#edMsg'), 'saving…');
    try { edSha = await writeFile(`data/${name}.json`, `${JSON.stringify(data, null, 2)}\n`, edSha, `HQ: edit data/${name}.json`); if (name === 'network') await loadNetwork(); ctxCache = null; say($('#edMsg'), 'saved. live in about two minutes.', 'ok'); }
    catch (err) { say($('#edMsg'), /does not match|sha/.test(err.message) ? 'someone changed this file since you loaded it: load it again first' : err.message, 'bad'); }
    finally { e.target.disabled = false; }
  });

  // ── access ─────────────────────────────────────────
  loaders.access = async () => {
    await loadNetwork();
    const owners = (network.owners || []).map((o) => o.toLowerCase());
    $('#me').innerHTML = `<ul class="rows"><li><img src="${esc(me.avatar_url)}" alt=""><span class="grow">@${esc(me.login)}</span><span class="tag live">${repo.permissions.admin ? 'repo admin' : 'write access'}</span></li></ul><p class="muted small">Lost a token or think one leaked? Revoke it at <a href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noopener">github.com/settings/personal-access-tokens</a>; it stops working everywhere straight away.</p>`;
    try {
      const people = await gh(`/repos/${REPO}/collaborators?per_page=100`);
      $('#people').innerHTML = people.map((p) => { const hq = owners.includes(p.login.toLowerCase()), self = p.login === me.login;
        return `<li><img src="${esc(p.avatar_url)}" alt=""><span class="grow">@${esc(p.login)}</span><span class="tag ${hq ? 'live' : ''}">${hq ? 'hq access' : 'repo only'}</span><span class="meta">${esc(p.role_name || '')}</span>${self ? '' : `<button class="btn danger" type="button" data-rm="${esc(p.login)}">remove</button>`}</li>`; }).join('');
    } catch (e) { $('#people').innerHTML = `<li class="muted">${esc(e.message)}. Listing people needs a token with Administration access.</li>`; }
  };
  $('#invGo').addEventListener('click', async (e) => {
    const user = $('#invUser').value.trim().replace(/^@/, '');
    if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(user)) { say($('#invMsg'), 'that isn\'t a GitHub username', 'bad'); return; }
    e.target.disabled = true; say($('#invMsg'), 'adding…');
    try {
      await gh(`/repos/${REPO}/collaborators/${user}`, { method: 'PUT', body: JSON.stringify({ permission: 'push' }) });
      await loadNetwork();
      if (!(network.owners || []).some((o) => o.toLowerCase() === user.toLowerCase())) { network.owners = [...(network.owners || []), user]; await saveNetwork(`HQ: give @${user} access`); }
      say($('#invMsg'), `done. @${user} gets a GitHub invite; once accepted they can sign in here with their own token.`, 'ok'); $('#invUser').value = ''; loaders.access();
    } catch (err) { say($('#invMsg'), `${err.message}. Giving access needs a token with Administration access.`, 'bad'); } finally { e.target.disabled = false; }
  });
  $('#people').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    const user = b.dataset.rm;
    if (!confirm(`Remove @${user}'s access to the repo and to HQ?`)) return;
    b.disabled = true;
    try {
      await gh(`/repos/${REPO}/collaborators/${user}`, { method: 'DELETE' });
      await loadNetwork(); network.owners = (network.owners || []).filter((o) => o.toLowerCase() !== user.toLowerCase()); await saveNetwork(`HQ: remove @${user}'s access`);
      toast(`@${user} removed`); loaders.access();
    } catch (err) { toast(err.message); b.disabled = false; }
  });

  // ── go ─────────────────────────────────────────────
  if (token) unlock();
})();

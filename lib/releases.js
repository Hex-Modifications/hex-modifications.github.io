// Latest releases from every platform, merged and newest first.
// Native APIs where they exist (FiveM forum is Discourse JSON, GitHub REST, Patreon v2 with a token);
// otherwise the public page is read the way a browser would (GTA5-Mods profile + file pages).
// LCPDFR sits behind a browser check, so its entries come from data/releases-manual.json.
// Used by scripts/build-static.mjs (GitHub Pages, refreshed on a schedule) and by server.js (/api/releases).

const UA = 'Mozilla/5.0 (compatible; HexModificationsSite/1.0; +https://hex-modifications.github.io)';

async function get(url, { json = false, headers = {}, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: json ? 'application/json' : 'text/html', ...headers }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return json ? res.json() : res.text();
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
export const decode = (s = '') => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const noEmoji = (s) => s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();

// html → clean lines: block tags break lines, inline tags vanish without leaving stray spaces
export const lines = (html = '') => decode(html
  .replace(/<aside[\s\S]*?<\/aside>/gi, '\n').replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
  .replace(/<\/?(br|p|li|ul|ol|h\d|div|blockquote|table|tr)\b[^>]*>/gi, '\n')
  .replace(/<a[^>]*class="[^"]*onebox[^"]*"[^>]*>[\s\S]*?<\/a>/gi, '')
  .replace(/<[^>]+>/g, '')).split('\n').map((l) => noEmoji(l).replace(/\s+([,.!?;:)])/g, '$1').replace(/\(\s+/g, '(')).filter(Boolean)
  // re-join sentences an author broke with a stray <br>
  .reduce((out, l) => { const prev = out[out.length - 1]; if (prev && !/[.!?:]$/.test(prev) && /^[a-z]/.test(l)) out[out.length - 1] = `${prev} ${l}`; else out.push(l); return out; }, []);

// first sentence or two, cut on a word boundary
export function summary(s, max = 190) {
  s = s.trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (stop > max * 0.55) return cut.slice(0, stop + 1);
  return cut.replace(/\s+\S*$/, '').replace(/[,;:\-–—\s]+$/, '') + '…';
}

// the author's actual pitch: skip title lines, shouty warnings, headings, links and code
export function describe(ls, title = '') {
  const t = title.toLowerCase().slice(0, 10);
  const ok = (l) => !/https?:\/\/|```|^here it is\b|\b(newest|latest) version (can now be|is now|is) (found|available)|^(thanks|credits?) to\b/i.test(l) && !(l === l.toUpperCase() && /[A-Z]{4}/.test(l))
    && !/^(overview|features?|description|about|showcase\s*\d*|changelog|installation|install|requirements|credits)\s*:?$/i.test(l);
  const sentence = (l) => ok(l) && l.length >= 45 && !(l.length < 90 && t && l.toLowerCase().startsWith(t) && !/[.!?]$/.test(l));
  let i = ls.findIndex(sentence);
  if (i >= 0) {
    let out = '';
    for (; i < ls.length && out.length < 190 && sentence(ls[i]); i++) {
      out += (out ? (/[.!?]$/.test(out) ? ' ' : '. ') : '') + ls[i].replace(/^(overview|description)\s*:\s*/i, '');
    }
    return summary(out);
  }
  const h = ls.findIndex((l) => ok(l) && /:$/.test(l));
  if (h >= 0) {
    const items = [];
    for (let j = h + 1; j < ls.length && ok(ls[j]) && !/:$/.test(ls[j]) && ls[j].length < 70; j++) items.push(ls[j]);
    if (items.length) return summary(`${ls[h]} ${items.join(', ')}.`);
  }
  return summary(ls.filter(ok).join('. '));
}

const iso = (d) => { const t = Date.parse(d); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
const absolute = (u, base) => { if (!u) return null; try { return new URL(decode(u), base).href; } catch { return null; } };

/* ── GTA5-Mods: profile file list, then each file page for date, cover and description ── */
export async function gta5mods(profileUrl, { limit = 8, fetchImpl } = {}) {
  const base = 'https://www.gta5-mods.com';
  const list = await get(`${profileUrl.replace(/\/$/, '')}/files`, { fetchImpl });
  const files = [];
  for (const b of list.split('<div class="file-list-obj">').slice(1)) {
    const href = b.match(/<a href="(\/[^"]+)"[^>]*class="preview/)?.[1];
    if (!href || files.some((f) => f.href === href)) continue;
    files.push({
      href,
      title: decode(b.match(/<a href="[^"]+" title="([^"]+)"[^>]*class="preview/)?.[1] || ''),
      thumb: b.match(/<img[^>]+src="([^"]+)"/)?.[1] || null,
      tags: [...b.matchAll(/<li>([^<]+)<\/li>/g)].map((m) => decode(m[1]).trim()).filter(Boolean),
      version: decode(b.match(/class="version"[^>]*title="([^"]*)"/)?.[1] || '').split(/\s+/)[0],
      downloads: Number((b.match(/title="([\d,]+) Downloads"/)?.[1] || '').replace(/,/g, '')) || null,
      likes: Number((b.match(/title="([\d,]+) Likes"/)?.[1] || '').replace(/,/g, '')) || null,
      rating: Number(b.match(/title="([\d.]+) star rating"/)?.[1]) || null,
    });
  }
  const out = [];
  for (const f of files.slice(0, limit)) {
    const url = base + f.href;
    let page = '';
    try { page = await get(url, { fetchImpl }); } catch { /* keep what the list gave us */ }
    const body = page.match(/class="description-body[^"]*"[^>]*>([\s\S]*?)<\/span>\s*<\/div>/)?.[1] || '';
    out.push({
      id: `gta5mods:${f.href}`,
      platform: 'gta5mods', source: 'GTA5-Mods', url, title: f.title,
      image: page.match(/<meta property="og:image" content="([^"]+)"/)?.[1] || f.thumb,
      description: describe(lines(body), f.title) || decode(page.match(/<meta name="description" content="([^"]*)"/)?.[1] || ''),
      date: iso(page.match(/First Uploaded:<\/strong>\s*([A-Za-z]+ \d{1,2}, \d{4})/)?.[1]),
      tags: [...f.tags.filter((t) => !/^(\.net|asi|lua|enhanced|legacy)$/i.test(t)).slice(0, 2), f.version && `v${f.version}`].filter(Boolean),
      stats: { downloads: f.downloads, likes: f.likes, rating: f.rating },
    });
  }
  return out;
}

/* ── FiveM (Cfx.re forum, Discourse JSON API) ── */
export async function fivem(profileUrl, { limit = 6, fetchImpl } = {}) {
  const user = profileUrl.match(/\/u\/([^/?#]+)/)?.[1];
  if (!user) return [];
  const base = 'https://forum.cfx.re';
  const list = await get(`${base}/topics/created-by/${encodeURIComponent(user)}.json`, { json: true, fetchImpl });
  const out = [];
  for (const t of list.topic_list?.topics || []) {
    const tags = [...t.title.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim().toLowerCase());
    if (tags.includes('inactive') || t.closed || t.archived) continue;
    let cooked = '';
    try { cooked = (await get(`${base}/t/${t.id}.json`, { json: true, fetchImpl })).post_stream?.posts?.[0]?.cooked || ''; } catch { /* list data is enough */ }
    const yt = cooked.match(/data-youtube-id="([\w-]{11})"/)?.[1] || cooked.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/)?.[1];
    const firstImg = [...cooked.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]).find((u) => !/emoji|avatar|favicon/i.test(u));
    const title = noEmoji(t.title.replace(/\[[^\]]*\]/g, '').split('|')[0]);
    out.push({
      id: `fivem:${t.id}`,
      platform: 'fivem', source: 'FiveM forum', url: `${base}/t/${t.slug}/${t.id}`, title,
      image: t.image_url || absolute(firstImg, base) || (yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : null),
      description: describe(lines(cooked), title),
      date: iso(t.created_at),
      tags: tags.filter((x) => ['free', 'standalone', 'paid', 'esx', 'qbcore'].includes(x)).slice(0, 2),
      stats: { likes: t.like_count || null, views: t.views || null },
    });
    if (out.length >= limit) break;
  }
  return out;
}

/* ── GitHub (REST API; the build passes the workflow's token so rate limits never bite) ── */
export async function github(profileUrl, { limit = 6, token, fetchImpl } = {}) {
  const user = profileUrl.match(/github\.com\/([^/?#]+)/)?.[1];
  if (!user) return [];
  const headers = { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const repos = await get(`https://api.github.com/users/${encodeURIComponent(user)}/repos?sort=created&direction=desc&per_page=30&type=owner`, { json: true, headers, fetchImpl });
  return repos
    // skip plumbing repos (Homebrew taps, version manifests, profile/config repos); keep real projects
    .filter((r) => !r.fork && !r.archived && !r.private && r.name.toLowerCase() !== user.toLowerCase() && r.description
      && !/^(homebrew-|\.github$|dotfiles)|[-_]versions?$|[-_]config$/i.test(r.name))
    .slice(0, limit)
    .map((r) => ({
      id: `github:${r.full_name}`,
      platform: 'github', source: 'GitHub', url: r.html_url, title: r.name.replace(/[-_](releases?|app)$/i, '').replace(/[-_]+/g, ' '),
      image: `https://opengraph.githubassets.com/1/${r.full_name}`,
      description: summary(noEmoji(r.description)),
      date: iso(r.created_at),
      tags: [r.language].filter(Boolean),
      stats: { stars: r.stargazers_count || null },
    }));
}

/* ── Patreon (needs the creator's own token; only public posts are listed) ── */
export async function patreon({ token, campaign, limit = 6, fetchImpl } = {}) {
  if (!token || !campaign) return [];
  const url = `https://www.patreon.com/api/oauth2/v2/campaigns/${encodeURIComponent(campaign)}/posts?fields%5Bpost%5D=title,content,url,published_at,is_public&page%5Bcount%5D=20&sort=-published_at`;
  const json = await get(url, { json: true, headers: { Authorization: `Bearer ${token}` }, fetchImpl });
  return (json.data || []).filter((p) => p.attributes.is_public).slice(0, limit).map((p) => {
    const a = p.attributes, title = noEmoji(a.title || 'Patreon post');
    return {
      id: `patreon:${p.id}`,
      platform: 'patreon', source: 'Patreon', url: a.url?.startsWith('http') ? a.url : `https://www.patreon.com${a.url || ''}`, title,
      image: absolute(a.content?.match(/<img[^>]+src="([^"]+)"/)?.[1], 'https://www.patreon.com'),
      description: describe(lines(a.content || ''), title),
      date: iso(a.published_at), tags: [], stats: {},
    };
  });
}

/* ── everything, newest first; each source fails on its own ── */
export async function collectReleases(site, { manual = [], githubToken, patreonToken, patreonCampaign, fetchImpl, limit = 12 } = {}) {
  const L = site.links || {};
  const jobs = {
    gta5mods: () => (L.gta5mods ? gta5mods(L.gta5mods, { fetchImpl }) : []),
    fivem: () => (L.fivem ? fivem(L.fivem, { fetchImpl }) : []),
    github: () => (L.github ? github(L.github, { token: githubToken, fetchImpl }) : []),
    patreon: () => patreon({ token: patreonToken, campaign: patreonCampaign, fetchImpl }),
  };
  const status = {}, items = [];
  await Promise.all(Object.entries(jobs).map(async ([name, run]) => {
    try { const got = await run(); items.push(...got); status[name] = `ok (${got.length})`; } catch (err) { status[name] = `error: ${err.message}`; }
  }));
  // manual entries add releases (LCPDFR…); { "url": "...", "hide": true } removes one that was picked up automatically
  const hidden = new Set(manual.filter((m) => m?.hide && m.url).map((m) => m.url.replace(/\/$/, '')));
  for (const m of manual) {
    if (m && !m.hide && m.title && m.url) items.push({ id: `manual:${m.url}`, tags: [], stats: {}, source: m.platform || 'release', ...m, date: iso(m.date) });
  }
  for (let i = items.length - 1; i >= 0; i--) if (hidden.has(String(items[i].url).replace(/\/$/, ''))) items.splice(i, 1);
  items.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  // the same mod posted on two platforms shows once (newest post wins)
  const seen = new Set(), key = (t) => t.toLowerCase().replace(/^hex\s+/, '').replace(/[^a-z0-9]+/g, '');
  const unique = items.filter((it) => !seen.has(key(it.title)) && seen.add(key(it.title)));
  return { fetchedAt: new Date().toISOString(), status, items: unique.slice(0, limit) };
}

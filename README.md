# Hex Modifications

The home of Hex Modifications: graphics overhauls, ReShade presets and FiveM scripts for GTA V and GTA VI, plus QoL software for macOS and Windows. Developed by 001hex. It brings Patreon, Ko-fi, Fiverr, Tebex, Shopify and Discord into one site.

- **Frontend:** editorial layout, Apple-style glass UI, the GTA VI sunset palette, time-of-day lighting, and real-time 3D glass objects rendered with three.js (transmission, dispersion and iridescence).
- **Backend:** a Node server with **zero dependencies**, so there's nothing to `npm install` and no supply-chain risk.
- **Figma brand system:** https://www.figma.com/design/Dw8XzjKaxBXq7JNZyfWjcJ

## Run it

```bash
node server.js            # http://localhost:8080
```

Requires Node 20 or newer. On the first run the server creates a `.env` file with secure random keys and prints your admin token. Admin dashboard: `http://localhost:8080/admin` (paste that token). Add your platform keys to `.env` later (see below).

## Design system

- **Palette (GTA VI sunset):** coral `#E89898`, indigo `#5D549C`, slate `#6F70A2`, plum `#7E3A63`, lilac `#A373D3`.
- **Timecycle:** the site's lighting follows each visitor's local time: dawn 05–08, day 08–17, dusk 17–20, night 20–05. Night is the dark theme. Clicking the clock in the hero skips ahead. You can preview a phase with `?phase=dawn|day|dusk|night`.
- **Hero objects:** bubbly glass pistol, rifle, sports car, police cruiser (flashing light bar), wanted star or heist cash stack. One is picked at random per visit, never the same as the visitor's last one. Clicking the object swaps it. Preview one with `?model=car` etc.

### Easter eggs
Type these anywhere on the page (not inside a form field):

| Code | Effect |
|---|---|
| `MAKEITRAIN` | toggles rain |
| `FUGITIVE` | raises the wanted level (stars, top right) |
| `LAWYERUP` | clears the wanted level |
| `SLOWMO` | slow motion |
| `SKYFALL` | drops in a new 3D object |
| `TIMECYCLE` | skips the time of day |

Also:
- Sending the contact form shows "mission passed".
- Spamming the form raises the wanted level.
- The 404 page is a "wasted" screen that respawns visitors on the homepage.

## Edit your content

Everything lives in `data/`. You can edit it from **/admin → Content** (validated, goes live instantly) or by editing the files directly:

| File | What it controls |
|---|---|
| `site.json` | Your links (Patreon, Ko-fi, Fiverr, Tebex, Shopify, Discord server invite, YouTube, GitHub, X), `discordUser` (the username visitors copy, currently `001hex`), years scripting, email. The "join the server" button only appears once `links.discord` is a real invite |
| `products.json` | Store listings (category: `reshade`, `graphics`, `scripts`, `software`, `services`; platform: `tebex`, `kofi`, `patreon`, `shopify`, `fiverr`) |
| `roadmap.json` | Planned mods and scripts (status: `shipped`, `in-progress`, `planned`, `research`) |
| `showcase.json` | The technology viewer: one `before` image plus slides (`title`, `after`, `buffer`, `text`). The current images are grey clay diagrams of each pass with technical overlays (sample rays, occlusion vectors, focal plane, blur radii, tone curves) |
| `feed.json` | Updates section. Hidden while empty; fills automatically once Patreon is connected |
| `releases-manual.json` | Extra entries for **Latest releases** from sites that block automated reading (LCPDFR). Each entry: `{ "platform": "lcpdfr", "source": "LCPDFR", "title", "url", "image", "description", "date": "2026-10-01" }`. To hide something that was picked up automatically, add `{ "url": "<its link>", "hide": true }` |

The store, roadmap and updates start empty and stay hidden (the store shows a "coming soon" card) until you add entries.

## Latest releases

The **fresh drops** section fills itself, newest first, from every platform:

- **GTA5-Mods:** read from your public profile and each file page (cover image, description, upload date, downloads, likes, rating)
- **FiveM forum:** Discourse JSON API (topics you created; `[INACTIVE]` ones are skipped)
- **GitHub:** REST API (your own public repos that have a description)
- **Patreon:** public posts, once `PATREON_ACCESS_TOKEN` and `PATREON_CAMPAIGN_ID` are set (as `.env` values, or as repository secrets for GitHub Pages)
- **LCPDFR:** its pages sit behind a browser check, so add those by hand in `data/releases-manual.json`

On GitHub Pages the deploy workflow refreshes this **every 6 hours**. Cover images are copied onto the site itself, so visitors never load anything from other servers. If one platform is down during a refresh, it keeps the entries the live site already had. With the Node server it's live at `/api/releases`, cached for 6 hours.

## Intro splash

The Hex Modifications animation plays over the homepage while it loads underneath, with a loading bar, then the picture dissolves into the site's own palette and the page settles in. It takes about 5 seconds, only holds on the finished logo if the page is still loading, and never runs past 7.5 seconds.

- **Video:** debanded at 1080p and encoded three ways, with the script picking the best one each device decodes smoothly: AV1 10-bit (1.35 MB, Chrome/Edge/Firefox and newer Apple devices), HEVC 10-bit (2.2 MB, Safari) and H.264 (2.7 MB, everything else). The 10-bit versions keep the dark gradients free of banding
- **Loading bar:** follows real milestones (site data and release count, the 3D hero's first frame, fonts, assets) mixed with a shuffled, randomly timed set of build steps, so it reads differently every visit
- **Sound:** `media/intro.m4a` (Opus `.webm` fallback), mastered subtle at −29 LUFS with a soft fade-in, and faded out with the picture. Browsers usually block sound until the visitor interacts, so if it's blocked, the first click, tap or key press starts it in sync
- **Smoothness:** the exit only animates opacity and transform (GPU-composited). The 3D hero draws a few warm-up frames to compile its shaders, then idles behind the splash, and the background shader pauses until the hand-off
- **When it shows:** once per browser session. It's skipped for reduced motion, Data Saver, background tabs and `?nosplash`, and straight away if the video can't start within 1.8 seconds. Esc also skips it
- **Replace it:** swap the files in `public/media/`, and adjust `EXIT_AT` in `public/js/splash.js` if the new clip's timing differs

## Chat assistant ("ask hex")

A chat button at the bottom left answers visitors in 001hex's voice. It's built from your own site data (links, releases, store, roadmap) by `public/js/persona.js`, so it stays current automatically. It's told never to invent prices or dates, never to share personal details, and to point people to Discord when it isn't sure.

- **Free, no setup:** it uses Pollinations' keyless free tier. That allows about one AI reply every 30 seconds per visitor, so common questions (support, links, what's new) are answered instantly on the page and the AI handles the rest. When the free tier is busy, the chat waits and retries on its own
- **Faster, still free:** deploy `workers/chat-worker.js` to Cloudflare Workers AI (steps are at the top of the file), then add `"chat": { "endpoint": "<worker url>" }` to `data/site.json`
- **With the Node server:** set `CHAT_API_URL` and `CHAT_API_KEY` (any OpenAI-compatible API) and replies go through `/api/chat`, rate-limited and with the key kept off the page

## Connect your platforms (`.env`)

| Platform | What it does | How to get the key |
|---|---|---|
| **Patreon** | Live "Updates" feed of your posts (patron-only posts show as locked teasers) | patreon.com/portal → Clients → Create client → copy the *Creator's Access Token*. Campaign ID: `GET https://www.patreon.com/api/oauth2/v2/campaigns` with that token |
| **Tebex** | Pulls your Tebex packages into the store automatically | Tebex panel → Integrations → API Keys → *Public token* (Headless API) |
| **Shopify** | Pulls your software products into the store | Shopify admin → Sales channels → *Headless* → Storefront API token. `SHOPIFY_DOMAIN=yourstore.myshopify.com` |
| **Discord** | The contact form posts to a private channel, and the site shows a live online count | Channel settings → Integrations → Webhooks (`DISCORD_WEBHOOK_URL`). Server settings → Widget → enable it and copy the Server ID (`DISCORD_GUILD_ID`) |

Live Tebex and Shopify listings replace the sample items for that platform. Results are cached for 10–15 minutes, and if a platform goes down the site keeps serving the last good copy.

## Security

- **Headers:** strict CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, COOP/CORP, and a locked-down Permissions-Policy
- **Contact form:** HMAC-signed CSRF tokens (these also reject bots that submit in under 2.5 seconds), a honeypot field, origin checks, validation, length caps and a link-spam limit. Discord pings are disabled for user content
- **Admin:** Bearer token with a constant-time compare. The token is refused outright if shorter than 24 characters, and failed attempts count as strikes
- **Hardening:** path-traversal-safe static serving, a 32 KB body limit, slowloris timeouts, and atomic writes for content files

## Traffic manager

- Per-IP token-bucket rate limits for each route class (pages, assets, API, contact, admin)
- A strike system: rate-limit hits, failed admin logins, scanner paths (`/.env`, `wp-admin`, …) and attack tools (sqlmap, nikto…) add up to an automatic 1-hour ban. You can unban from /admin → Security
- **Privacy-friendly analytics:** no cookies and no raw IPs stored. Visitors are hashed with a salt that rotates daily. Tracks views, uniques, referrers, countries (via Cloudflare), devices, response times, and **which platform links people click**

## SEO

- Server-rendered JSON-LD (Organization, Person "001hex", WebSite, ItemList)
- Each product gets its own crawlable page at `/p/<slug>` with Product/SoftwareApplication schema
- Auto-generated `/sitemap.xml` and `/robots.txt`, plus canonical URLs, Open Graph and Twitter cards, and `img/og.png`
- Set `SITE_URL` to your real domain

## Deploying

1. Host on any Node host (Railway, Render, Fly.io or a small VPS) and run `node server.js`.
2. Put **Cloudflare** in front of it (free plan) for DNS, SSL, DDoS protection and caching, then set `TRUST_PROXY=cloudflare`.
3. Add the site to Google Search Console and submit `/sitemap.xml`.

## Structure

```
server.js              HTTP server, routes, static files, admin API
lib/security.js        headers, CSRF, auth, sanitising
lib/traffic.js         rate limiting, bans, analytics
lib/integrations.js    Patreon, Tebex, Shopify, Discord
lib/seo.js             JSON-LD, sitemap, robots, product pages
lib/releases.js        latest releases from GTA5-Mods, FiveM forum, GitHub, Patreon
public/                index.html, admin.html, css/, js/, img/
  js/app.js            page logic        js/glass3d.js   3D hero         js/liquid.js   flowing background
  js/chat.js           ask hex chat      js/persona.js   chat persona    js/timecycle.js time-of-day lighting
  js/splash.js         intro splash      media/          intro video, poster and sound
workers/chat-worker.js optional free Cloudflare Workers AI backend for the chat
brand/                 official Hex Modifications images (transparent, sunset, night) + the script that makes them
data/                  editable content (JSON)
```

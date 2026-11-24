// HexFW page: renders releases, changelog and support links from data/firmware.json.
// Release entries are copies of the firmware pipeline's release.json; the site build adds `mirror`
// (a same-origin copy of the .tgz) so Flipper Lab can fetch it.

const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mb = (n) => (n ? `${(n / 1048576).toFixed(1)} MB` : '');
const day = (d) => { const t = Date.parse(d); return Number.isNaN(t) ? '' : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
const safeUrl = (u) => (/^(https:\/\/|fw\/)/.test(String(u || '')) ? String(u) : '');

function labUrl(rel, tgz) {
  const src = rel.mirror ? new URL(rel.mirror, location.href).href : tgz.url;
  const q = new URLSearchParams({ url: src, target: rel.target || 'f7', channel: 'release-cfw', version: rel.version });
  return `https://lab.flipper.net/?${q}`;
}

function card(rel) {
  const tgz = (rel.files || []).find((f) => f.type === 'update_tgz');
  if (!tgz) return '';
  const dl = safeUrl(rel.mirror) || safeUrl(tgz.url);
  const notes = (rel.notes || []).slice(0, 6).map((n) => `<li>${esc(n)}</li>`).join('');
  return `<article class="rel">
    <div class="rel-top"><span class="rel-v">${esc(rel.version)}</span><span class="rel-meta">${esc(day(rel.date))}${tgz.size ? ` · ${mb(tgz.size)}` : ''}</span>
      <span class="rel-hw${rel.hardwareTested ? '' : ' no'}">${rel.hardwareTested ? 'tested on hardware' : 'not hardware tested'}</span></div>
    ${notes ? `<ul class="rel-notes">${notes}</ul>` : ''}
    <div class="rel-actions">
      <a class="btn btn-sun btn-sm" href="${esc(labUrl(rel, tgz))}" rel="noopener">install in browser</a>
      ${dl ? `<a class="btn btn-ghost btn-sm" href="${esc(dl)}" download>download .tgz</a>` : ''}
    </div>
    <div class="hash"><code title="SHA-256">${esc(tgz.sha256)}</code><button type="button" data-copy="${esc(tgz.sha256)}">copy sha-256</button></div>
  </article>`;
}

function render(data) {
  const rels = (data.releases || []).filter((r) => r && r.version).sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  const by = (ch) => rels.filter((r) => r.channel === ch);
  const panel = $('#panel');
  const show = (ch) => {
    document.querySelectorAll('.tabs [role=tab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.ch === ch)));
    const list = by(ch).slice(0, 3);
    if (list.length) panel.innerHTML = list.map(card).join('');
    else panel.innerHTML = ch === 'stable' && by('experimental').length
      ? '<div class="empty"><p class="empty-t">no stable release yet</p><p>the current beta is under <b>experimental</b>. a stable build follows once it has been tested on real hardware.</p></div>'
      : '<div class="empty"><p class="empty-t">the first beta is in the works</p><p>there\'s no download yet. it\'ll appear here as soon as a build has been tested on a real flipper.</p></div>';
  };
  const tabs = [...document.querySelectorAll('.tabs [role=tab]')];
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t.dataset.ch));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      n.focus(); show(n.dataset.ch);
    });
  });
  show(by('stable').length || !by('experimental').length ? 'stable' : 'experimental');

  const stable = by('stable')[0], beta = by('experimental')[0];
  $('#statusChip').textContent = stable ? `stable ${stable.version}` : beta ? `beta ${beta.version}` : (data.status || 'in development');

  if (rels.length) {
    $('#log').innerHTML = rels.map((r) => `<article><h3>${esc(r.version)} <span>${esc(r.channel)} · ${esc(day(r.date))}</span></h3>${(r.notes || []).length ? `<ul>${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</article>`).join('');
  }

  const kofi = String(data.support?.kofi || '').trim();
  if (kofi) {
    const url = /^https:\/\//.test(kofi) ? kofi : `https://ko-fi.com/${encodeURIComponent(kofi)}`;
    $('#supportLinks').insertAdjacentHTML('beforeend', `<a class="btn btn-ghost" href="${esc(url)}" rel="noopener">tip on ko-fi</a>`);
  }
  const pp = String(data.support?.paypal || '');
  if (/^https:\/\//.test(pp)) $('#supportLinks a').href = pp;
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'copied'; } catch { b.textContent = 'select and copy'; }
  setTimeout(() => { b.textContent = 'copy sha-256'; }, 1800);
});

// the hero screen cycles through the previews (skipped for reduced motion)
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const img = $('#heroScreen');
  const frames = [['img/screen-boot.png', 'boot screen'], ['img/screen-home.png', 'home screen'], ['img/screen-control.png', 'control centre']];
  frames.forEach(([src]) => { new Image().src = src; });
  let i = 0;
  setInterval(() => {
    i = (i + 1) % frames.length;
    img.src = frames[i][0];
    img.alt = `HexFW ${frames[i][1]} design preview`;
    img.closest('figure').querySelector('figcaption').textContent = `${frames[i][1]} · design preview, 128×64 1-bit`;
  }, 3800);
}

fetch('../data/firmware.json', { cache: 'no-cache' }).then((r) => r.json()).then(render).catch(() => { /* static empty state stays */ });

/* Hex Control: admin dashboard */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Token lives in sessionStorage only: gone when the tab closes.
  let token = (() => { try { return sessionStorage.getItem('hex-admin') || ''; } catch { return ''; } })();
  let timer;

  async function api(path, opts = {}) {
    const r = await fetch(path, { ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
    if (r.status === 401) { lock(); throw new Error('Unauthorised'); }
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || r.statusText);
    return body;
  }

  function lock() {
    token = ''; try { sessionStorage.removeItem('hex-admin'); } catch { /* ignore */ }
    clearInterval(timer);
    $('#dash').hidden = true; $('#logout').hidden = true; $('#login').hidden = false;
  }

  async function unlock() {
    try { await refresh(); } catch (e) { $('#loginErr').textContent = e.message; return; }
    try { sessionStorage.setItem('hex-admin', token); } catch { /* ignore */ }
    $('#login').hidden = true; $('#dash').hidden = false; $('#logout').hidden = false;
    timer = setInterval(refresh, 15000);
  }

  const bars = (rows, total) => {
    if (!rows?.length) return '<li class="empty">No data yet</li>';
    const max = total || Math.max(...rows.map((r) => r[1]));
    return rows.map(([k, v]) => `<li style="--w:${(v / max) * 100}%"><span>${esc(k)}</span><b>${v}</b></li>`).join('');
  };

  async function refresh() {
    const s = await api('/api/admin/stats');
    $('#live').innerHTML = `<b>●</b> ${s.liveNow} live now`;
    const today = s.days.at(-1)?.[1] || { views: 0, uniques: 0, bots: 0 };
    const total30 = s.days.reduce((a, [, d]) => a + d.views, 0);
    const clicks = s.events.reduce((a, [, v]) => a + v, 0);
    $('#kpis').innerHTML = [
      ['Views today', today.views], ['Visitors today', today.uniques], ['Views 30d', total30],
      ['Platform clicks', clicks], ['Bots today', today.bots], ['Blocked', s.blockedTotal], ['Avg response', `${s.avgResponseMs}ms`],
    ].map(([k, v]) => `<div class="kpi"><span>${k}</span><strong>${esc(v)}</strong></div>`).join('');
    const maxV = Math.max(1, ...s.days.map(([, d]) => d.views));
    $('#chart').innerHTML = s.days.length
      ? s.days.map(([day, d]) => `<div style="height:${(d.views / maxV) * 100}%"><span>${esc(day.slice(5))}: ${d.views} / ${d.uniques}u</span></div>`).join('')
      : '<p class="empty">Traffic will appear here.</p>';
    $('#paths').innerHTML = bars(s.topPaths);
    $('#refs').innerHTML = bars(s.topReferrers);
    $('#events').innerHTML = bars(s.events.map(([k, v]) => [k.replace('outbound:', ''), v]));
    $('#geo').innerHTML = bars([...s.countries, ...Object.entries(s.devices || {})]);
    $('#codes').innerHTML = bars(Object.entries(s.status).sort((a, b) => b[1] - a[1]));
    $('#bans').innerHTML = s.bans.length ? s.bans.map((b) => `<li><span>${esc(b.ip)}</span><span>${esc(b.why)}</span><button data-unban="${esc(b.ip)}">unban</button></li>`).join('') : '<li class="empty">No active bans</li>';
    $('#blocks').innerHTML = s.recentBlocks.length ? s.recentBlocks.map((b) => `<li><span>${esc(b.at.slice(11, 19))} ${esc(b.ip)}</span><span>${esc(b.why)}</span></li>`).join('') : '<li class="empty">Quiet so far</li>';
  }

  async function loadInbox() {
    const msgs = await api('/api/admin/messages');
    $('#inbox').innerHTML = msgs.length ? msgs.map((m) => `
      <article class="msg-item">
        <header><strong>${esc(m.name)}</strong><a href="mailto:${esc(m.email)}">${esc(m.email)}</a><span class="tag">${esc(m.topic)}</span><span>${esc(new Date(m.at).toLocaleString('en-GB'))}</span></header>
        <p>${esc(m.message)}</p>
      </article>`).join('') : '<p class="empty">Inbox zero.</p>';
  }

  async function loadContent() {
    $('#edMsg').textContent = '';
    const data = await api(`/api/admin/content?name=${$('#edName').value}`);
    $('#editor').value = JSON.stringify(data, null, 2);
  }

  async function saveContent() {
    let data;
    try { data = JSON.parse($('#editor').value); } catch (e) { $('#edMsg').textContent = `Invalid JSON: ${e.message}`; return; }
    try {
      await api(`/api/admin/content?name=${$('#edName').value}`, { method: 'PUT', body: JSON.stringify(data) });
      $('#edMsg').textContent = 'Saved ✓';
    } catch (e) { $('#edMsg').textContent = e.message; }
  }

  $('#loginForm').addEventListener('submit', (e) => { e.preventDefault(); token = $('#token').value.trim(); $('#loginErr').textContent = ''; unlock(); });
  $('#logout').addEventListener('click', lock);
  $$('.a-tabs button').forEach((b) => b.addEventListener('click', () => {
    $$('.a-tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    $$('.a-panel').forEach((p) => { p.hidden = p.dataset.panel !== b.dataset.tab; });
    if (b.dataset.tab === 'inbox') loadInbox().catch(() => {});
    if (b.dataset.tab === 'content') loadContent().catch(() => {});
  }));
  document.addEventListener('click', async (e) => {
    const ip = e.target.dataset?.unban;
    if (ip) { await api('/api/admin/unban', { method: 'POST', body: JSON.stringify({ ip }) }); refresh(); }
  });
  $('#edLoad').addEventListener('click', () => loadContent().catch((e) => { $('#edMsg').textContent = e.message; }));
  $('#edSave').addEventListener('click', saveContent);
  $('#editor').addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); const t = e.target; const s = t.selectionStart; t.setRangeText('  ', s, t.selectionEnd, 'end'); }
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); saveContent(); }
  });

  if (token) unlock();
})();

// HexFW web installer: flashes a firmware update package (.tgz) onto a Flipper Zero over USB,
// straight from the browser (Web Serial, Chrome / Edge / Opera on desktop).
//
// It does what qFlipper and the firmware's own scripts/selfupdate.py do, over the official
// protobuf RPC (assets/protobuf in the firmware): open an RPC session from the CLI, upload every
// file of the package to /ext/update/<package>/ on the SD card, ask the firmware to validate and
// stage the update (system_update_request), then reboot into the updater (reboot mode UPDATE).
// The Flipper's own updater then installs it, with its usual checks and /int backup.

// ---------- protobuf: just the messages we need (field numbers from flipper.proto / storage.proto / system.proto) ----------
const F = {
  command_id: 1, command_status: 2, has_next: 3,
  system_ping_request: 5, system_ping_response: 6,
  storage_write_request: 11, storage_mkdir_request: 13,
  storage_info_request: 28, storage_info_response: 29,
  system_reboot_request: 31, system_device_info_request: 32, system_device_info_response: 33,
  system_update_request: 41, system_update_response: 46,
};
const STATUS = { 0: 'OK', 1: 'error', 2: 'decode error', 3: 'not implemented', 4: 'busy', 5: 'storage not ready', 6: 'already exists', 7: 'does not exist', 8: 'invalid parameter', 9: 'access denied', 10: 'invalid name', 11: 'internal error', 12: 'not implemented', 13: 'already open', 14: 'interrupted', 15: 'invalid parameters', 18: 'directory not empty' };
const UPDATE_RESULT = ['OK', 'manifest path invalid', 'manifest folder not found', 'manifest invalid', 'stage missing', 'stage integrity error', 'manifest pointer error', 'wrong hardware target', 'outdated manifest version', 'internal storage full', 'unspecified error'];
const enc = new TextEncoder();
const dec = new TextDecoder();

const varint = (n) => {
  const out = [];
  let v = n >>> 0;
  while (v > 0x7f) { out.push((v & 0x7f) | 0x80); v >>>= 7; }
  out.push(v);
  return out;
};
const concat = (parts) => {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const fVarint = (field, n) => Uint8Array.from([...varint((field << 3) | 0), ...varint(n)]);
const fBytes = (field, bytes) => concat([Uint8Array.from([...varint((field << 3) | 2), ...varint(bytes.length)]), bytes]);
const fString = (field, s) => fBytes(field, enc.encode(s));

// PB_Main: { command_id, has_next, <content field> }
export const mainMsg = (id, contentField, content, hasNext = false) =>
  concat([fVarint(F.command_id, id), ...(hasNext ? [fVarint(F.has_next, 1)] : []), fBytes(contentField, content)]);
export const frame = (msg) => concat([Uint8Array.from(varint(msg.length)), msg]);

export const msgs = {
  ping: (id) => mainMsg(id, F.system_ping_request, fBytes(1, Uint8Array.from([0x68, 0x65, 0x78]))),
  deviceInfo: (id) => mainMsg(id, F.system_device_info_request, new Uint8Array(0)),
  storageInfo: (id, path) => mainMsg(id, F.storage_info_request, fString(1, path)),
  mkdir: (id, path) => mainMsg(id, F.storage_mkdir_request, fString(1, path)),
  // WriteRequest { path = 1; File file = 2 { data = 4 } }
  write: (id, path, data, hasNext) => mainMsg(id, F.storage_write_request, concat([fString(1, path), fBytes(2, fBytes(4, data))]), hasNext),
  update: (id, manifest) => mainMsg(id, F.system_update_request, fString(1, manifest)),
  reboot: (id, mode) => mainMsg(id, F.system_reboot_request, mode ? fVarint(1, mode) : new Uint8Array(0)),
};

// decode one PB_Main into { command_id, command_status, has_next, field, payload }
export const parseMain = (buf) => {
  const m = { command_id: 0, command_status: 0, has_next: false, field: 0, payload: null };
  let i = 0;
  const rv = () => { let r = 0, s = 0, b; do { b = buf[i++]; r += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80); return r; };
  while (i < buf.length) {
    const key = rv();
    const field = Math.floor(key / 8), wt = key & 7;
    if (wt === 0) {
      const v = rv();
      if (field === F.command_id) m.command_id = v;
      else if (field === F.command_status) m.command_status = v;
      else if (field === F.has_next) m.has_next = !!v;
    } else if (wt === 2) {
      const len = rv();
      m.field = field;
      m.payload = buf.subarray(i, i + len);
      i += len;
    } else throw new Error(`unexpected wire type ${wt}`);
  }
  return m;
};
// generic flat decode of a small message: { fieldNumber: value } (strings decoded, varints as numbers)
const parseFlat = (buf) => {
  const out = {};
  let i = 0;
  const rv = () => { let r = 0, s = 0, b; do { b = buf[i++]; r += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80); return r; };
  while (buf && i < buf.length) {
    const key = rv();
    const field = Math.floor(key / 8), wt = key & 7;
    if (wt === 0) out[field] = rv();
    else if (wt === 2) { const len = rv(); out[field] = buf.subarray(i, i + len); i += len; }
    else break;
  }
  return out;
};

// ---------- the update package (.tgz) ----------
export async function untgz(buffer) {
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  const tar = new Uint8Array(await new Response(stream).arrayBuffer());
  const files = [];
  for (let o = 0; o + 512 <= tar.length;) {
    const h = tar.subarray(o, o + 512);
    if (h.every((b) => b === 0)) break;
    const str = (a, b) => dec.decode(h.subarray(a, b)).replace(/\0.*$/s, '');
    const name = (str(345, 500) ? `${str(345, 500)}/` : '') + str(0, 100);
    const size = parseInt(str(124, 136).trim() || '0', 8);
    const type = String.fromCharCode(h[156] || 48);
    o += 512;
    if (type === '0' || type === '\0') files.push({ name, data: tar.slice(o, o + size) });
    o += Math.ceil(size / 512) * 512;
  }
  return files;
}

// ---------- serial transport ----------
class FlipperRpc {
  constructor(port) {
    this.port = port;
    this.buf = new Uint8Array(0);
    this.id = 1;
  }

  async open() {
    await this.port.open({ baudRate: 230400 });
    this.reader = this.port.readable.getReader();
    this.writer = this.port.writable.getWriter();
    this.reading = this.pump();
  }

  async pump() {
    try {
      for (;;) {
        const { value, done } = await this.reader.read();
        if (done) break;
        this.buf = concat([this.buf, value]);
        this.wake?.();
      }
    } catch { /* port closed or device rebooted */ }
    this.closed = true;
    this.wake?.();
  }

  async waitFor(test, ms, what) {
    const end = Date.now() + ms;
    for (;;) {
      const r = test();
      if (r !== undefined) return r;
      if (this.closed) throw new Error(`the Flipper disconnected while ${what}`);
      const left = end - Date.now();
      if (left <= 0) throw new Error(`timed out ${what}`);
      await new Promise((res) => { this.wake = res; setTimeout(res, Math.min(left, 250)); });
      this.wake = null;
    }
  }

  async writeRaw(bytes) { await this.writer.write(bytes); }

  // CLI handshake: wait for the prompt, then switch the session to protobuf RPC
  async startRpc() {
    const text = () => dec.decode(this.buf);
    await this.writeRaw(enc.encode('\r'));
    await this.waitFor(() => (text().includes('>: ') ? true : undefined), 6000, 'waiting for the Flipper (is it unlocked and not running an app?)');
    this.buf = new Uint8Array(0);
    await this.writeRaw(enc.encode('start_rpc_session\r'));
    await this.waitFor(() => { const i = text().indexOf('start_rpc_session\r\n'); if (i >= 0) { this.buf = this.buf.slice(enc.encode(text().slice(0, i + 19)).length); return true; } return undefined; }, 4000, 'starting the RPC session');
  }

  // read one length-delimited PB_Main from the buffer, if complete
  takeMessage() {
    let i = 0, len = 0, s = 0, b;
    do { if (i >= this.buf.length) return undefined; b = this.buf[i++]; len += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80);
    if (this.buf.length < i + len) return undefined;
    const m = parseMain(this.buf.subarray(i, i + len));
    this.buf = this.buf.slice(i + len);
    return m;
  }

  // send a request and collect every response for its command_id (until has_next is false)
  async call(build, ms = 8000, what = 'waiting for a reply') {
    const id = this.id++;
    await this.writeRaw(frame(build(id)));
    const out = [];
    for (;;) {
      const m = await this.waitFor(() => this.takeMessage(), ms, what);
      if (m.command_id !== id) continue;
      out.push(m);
      if (!m.has_next || m.command_status !== 0) return out;
    }
  }

  async close() {
    try { this.reader?.cancel(); } catch { /* ignore */ }
    try { this.writer?.releaseLock(); } catch { /* ignore */ }
    try { await this.port.close(); } catch { /* ignore */ }
  }
}

const ok = (res, what, allow = []) => {
  const st = res[res.length - 1].command_status;
  if (st !== 0 && !allow.includes(st)) throw new Error(`${what}: ${STATUS[st] || `error ${st}`}`);
  return res;
};

export const webSerialSupported = () => typeof navigator !== 'undefined' && 'serial' in navigator && typeof DecompressionStream !== 'undefined';

// Full install. `onStep(text)` and `onProgress(0..1)` drive the UI.
export async function installToFlipper({ tgzUrl, sha256, onStep = () => {}, onProgress = () => {} }) {
  if (!webSerialSupported()) throw new Error('this browser can\'t talk to USB devices. Use Chrome or Edge on a computer.');
  onStep('downloading the firmware');
  const res = await fetch(tgzUrl);
  if (!res.ok) throw new Error(`download failed (HTTP ${res.status})`);
  const buffer = await res.arrayBuffer();
  if (sha256) {
    const hex = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (hex !== sha256) throw new Error('the download didn\'t match its SHA-256 checksum. Nothing was installed.');
  }
  const files = (await untgz(buffer)).filter((f) => !f.name.endsWith('/'));
  const manifest = files.find((f) => /(^|\/)update\.fuf$/.test(f.name));
  if (!manifest) throw new Error('this package has no update manifest');
  const pkg = manifest.name.split('/').slice(-2, -1)[0] || 'hexfw';
  const total = files.reduce((s, f) => s + f.data.length, 0);

  onStep('choose your Flipper in the pop-up');
  const port = await navigator.serial.requestPort({ filters: [{ usbVendorId: 0x0483, usbProductId: 0x5740 }] });
  const rpc = new FlipperRpc(port);
  try {
    onStep('connecting');
    await rpc.open();
    await rpc.startRpc();
    ok(await rpc.call(msgs.ping), 'ping');

    const info = {};
    for (const m of ok(await rpc.call(msgs.deviceInfo, 8000, 'reading device info'), 'device info')) {
      const kv = parseFlat(m.payload);
      if (kv[1]) info[dec.decode(kv[1])] = kv[2] ? dec.decode(kv[2]) : '';
    }
    if (info.hardware_target && info.hardware_target !== '7') throw new Error(`this isn't a Flipper Zero (hardware target ${info.hardware_target})`);
    onStep(`connected to ${info.hardware_name || 'your Flipper'}${info.firmware_version ? ` (currently ${info.firmware_version})` : ''}`);

    const sd = await rpc.call((id) => msgs.storageInfo(id, '/ext'), 8000, 'checking the SD card');
    if (sd[0].command_status !== 0) throw new Error('no SD card found. Insert a microSD card and try again.');
    const free = parseFlat(sd[0].payload)[2];
    if (typeof free === 'number' && free < total * 2) throw new Error('the SD card is almost full. Free up some space and try again.');

    const dir = `/ext/update/${pkg}`;
    ok(await rpc.call((id) => msgs.mkdir(id, '/ext/update')), 'creating /ext/update', [6]);
    ok(await rpc.call((id) => msgs.mkdir(id, dir)), `creating ${dir}`, [6]);

    let sent = 0;
    for (const f of files) {
      const base = f.name.split('/').pop();
      onStep(`copying ${base}`);
      const path = `${dir}/${base}`;
      const id = rpc.id++;
      const CH = 512;
      const n = Math.max(1, Math.ceil(f.data.length / CH));
      for (let k = 0; k < n; k++) {
        const chunk = f.data.subarray(k * CH, (k + 1) * CH);
        await rpc.writeRaw(frame(msgs.write(id, path, chunk, k < n - 1)));
        sent += chunk.length;
        onProgress(sent / total);
      }
      for (;;) {
        const m = await rpc.waitFor(() => rpc.takeMessage(), 30000, `writing ${base}`);
        if (m.command_id !== id) continue;
        if (m.command_status !== 0) throw new Error(`writing ${base}: ${STATUS[m.command_status] || m.command_status}`);
        break;
      }
    }

    onStep('checking the package on your Flipper');
    const up = ok(await rpc.call((id) => msgs.update(id, `${dir}/update.fuf`), 20000, 'preparing the update'), 'preparing the update');
    const code = parseFlat(up[0].payload)[1] || 0;
    if (code !== 0) throw new Error(`the Flipper rejected the update: ${UPDATE_RESULT[code] || `code ${code}`}`);

    onStep('restarting into the installer');
    await rpc.writeRaw(frame(msgs.reboot(rpc.id++, 2)));
    onProgress(1);
    return { info };
  } finally {
    await rpc.close();
  }
}

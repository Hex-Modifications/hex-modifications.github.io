/* Hero 3D: bubbly refractive glass objects, picked at random per visit.
   pistol · rifle · sports car · police cruiser · wanted star · heist cash
   Lighting follows the timecycle phase. Click the object to swap it.
   three.js r165 (ES module, self-contained build). */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.172.0/build/three.module.js';
import { GLSL as LIQUID_GLSL, liquid } from './liquid.js';

const canvas = document.getElementById('glass');
const hero = canvas?.parentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const PAL = { coral: '#E89898', indigo: '#5D549C', slate: '#6F70A2', plum: '#7E3A63', lilac: '#A373D3' };
const css = (name, fb) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb;

/* ── Geometry helpers ─────────────────────────────── */
// Polygon with every corner rounded by a quadratic curve: the "inflated" look starts here.
function roundedShape(points, radius) {
  const s = new THREE.Shape();
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n];
    const v1 = new THREE.Vector2(p0[0] - p1[0], p0[1] - p1[1]);
    const v2 = new THREE.Vector2(p2[0] - p1[0], p2[1] - p1[1]);
    const r = Math.min(radius, v1.length() / 2, v2.length() / 2);
    v1.normalize(); v2.normalize();
    const a = [p1[0] + v1.x * r, p1[1] + v1.y * r], b = [p1[0] + v2.x * r, p1[1] + v2.y * r];
    i === 0 ? s.moveTo(a[0], a[1]) : s.lineTo(a[0], a[1]);
    s.quadraticCurveTo(p1[0], p1[1], b[0], b[1]);
  }
  s.closePath();
  return s;
}

// Extrude with a deep bevel, then average normals so it reads as one soft, inflated surface.
function puff(shape, depth, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.85, bevelSegments: 8, curveSegments: 12 });
  g.translate(0, 0, -depth / 2);
  return smoothNormals(g);
}
function smoothNormals(g) {
  const pos = g.attributes.position, nor = g.attributes.normal, acc = new Map();
  const key = (i) => `${pos.getX(i).toFixed(3)}|${pos.getY(i).toFixed(3)}|${pos.getZ(i).toFixed(3)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i), a = acc.get(k) || [0, 0, 0];
    a[0] += nor.getX(i); a[1] += nor.getY(i); a[2] += nor.getZ(i); acc.set(k, a);
  }
  for (let i = 0; i < pos.count; i++) {
    const a = acc.get(key(i)), l = Math.hypot(a[0], a[1], a[2]) || 1;
    nor.setXYZ(i, a[0] / l, a[1] / l, a[2] / l);
  }
  nor.needsUpdate = true;
  return g;
}
const pillBox = (w, h, d, r) => puff(roundedShape([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], r), d, r * 0.9);

/* ── Materials ────────────────────────────────────── */
const glass = new THREE.MeshPhysicalMaterial({
  color: 0xffffff, metalness: 0, roughness: 0,
  transmission: 1, thickness: 2.2, ior: 1.55, dispersion: 8,
  iridescence: 0.3, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 600],
  clearcoat: 1, clearcoatRoughness: 0.04, specularIntensity: 1, envMapIntensity: 1.3,
  attenuationColor: new THREE.Color('#F2ECF7'), attenuationDistance: 8,
});
const gloss = (hex, extra = {}) => new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.15, ...extra });

/* ── Models ───────────────────────────────────────── */
const MODELS = {
  pistol() {
    const g = new THREE.Group();
    const body = roundedShape([[2.15, 1.2], [-1.95, 1.2], [-2.1, 1.0], [-2.1, 0.55], [-2.45, -1.65], [-1.3, -1.8], [-0.95, -0.62], [0.32, -0.62], [0.58, 0.3], [2.15, 0.3]], 0.26);
    const guard = new THREE.Path(); guard.absellipse(-0.27, -0.08, 0.42, 0.27, 0, Math.PI * 2, true); body.holes.push(guard);
    const depth = 0.55, bev = 0.3;
    g.add(new THREE.Mesh(puff(body, depth, bev), glass));
    const panel = puff(roundedShape([[-1.95, 0.3], [-2.22, -1.42], [-1.45, -1.52], [-1.14, -0.42], [-1.22, 0.3]], 0.2), 0.08, 0.08);
    const pm = gloss(PAL.plum);
    for (const side of [1, -1]) { const m = new THREE.Mesh(panel, pm); m.position.z = side * (depth / 2 + bev * 0.75); g.add(m); }
    const sight = pillBox(0.22, 0.2, 0.22, 0.07);
    const s1 = new THREE.Mesh(sight, gloss(PAL.coral)); s1.position.set(1.9, 1.48, 0); g.add(s1);
    const s2 = new THREE.Mesh(sight, gloss(PAL.coral)); s2.position.set(-1.72, 1.48, 0); g.add(s2);
    const trig = new THREE.Mesh(pillBox(0.12, 0.42, 0.14, 0.05), gloss(PAL.lilac)); trig.position.set(-0.25, -0.06, 0); trig.rotation.z = 0.25; g.add(trig);
    const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.06, 16, 32), gloss(PAL.indigo));
    muzzle.rotation.y = Math.PI / 2; muzzle.position.set(2.48, 0.95, 0); g.add(muzzle);
    return { group: g, base: { x: -0.08, y: 0.28, z: 0.05 }, fit: 5.0 };
  },

  rifle() {
    const g = new THREE.Group();
    const body = roundedShape([[-3.5, 0.6], [-3.5, -0.5], [-2.3, -0.05], [-1.3, -0.05], [-1.55, -1.15], [-0.95, -1.2], [-0.75, -0.05],
      [-0.35, -0.05], [-0.5, -1.3], [0.12, -1.42], [0.3, -0.05], [2.2, -0.05], [2.2, 0.12], [3.4, 0.12], [3.4, 0.42], [2.2, 0.42], [2.2, 0.62], [-1.6, 0.62], [-2.3, 0.42]], 0.14);
    const depth = 0.5, bev = 0.26;
    g.add(new THREE.Mesh(puff(body, depth, bev), glass));
    // carry handle / optic, magazine and grip accents
    const optic = new THREE.Mesh(pillBox(1.3, 0.34, 0.34, 0.12), gloss(PAL.indigo)); optic.position.set(-0.4, 1.02, 0); g.add(optic);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 32), gloss(PAL.lilac, { emissive: PAL.lilac, emissiveIntensity: 0.5 }));
    lens.rotation.z = Math.PI / 2; lens.position.set(0.28, 1.02, 0); g.add(lens);
    const mag = puff(roundedShape([[-0.3, -0.15], [-0.43, -1.15], [0.04, -1.25], [0.18, -0.15]], 0.1), 0.06, 0.06);
    for (const side of [1, -1]) { const m = new THREE.Mesh(mag, gloss(PAL.coral)); m.position.z = side * (depth / 2 + bev * 0.7); g.add(m); }
    const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.07, 16, 32), gloss(PAL.plum)); muzzle.rotation.y = Math.PI / 2; muzzle.position.set(3.62, 0.27, 0); g.add(muzzle);
    return { group: g, base: { x: -0.05, y: 0.18, z: 0.04 }, fit: 6.4 };
  },

  car() { return buildCar(false); },
  police() { return buildCar(true); },

  star() {
    const g = new THREE.Group();
    const pts = Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 0.92 : 2.15, a = -Math.PI / 2 + (Math.PI / 5) * i; return [r * Math.cos(a), -r * Math.sin(a)]; });
    g.add(new THREE.Mesh(puff(roundedShape(pts, 0.3), 0.5, 0.42), glass));
    return { group: g, base: { x: -0.2, y: 0.35, z: 0.1 } };
  },

  cash() {
    // heist cash: three banded glass bricks, slightly off-stack
    const g = new THREE.Group();
    const brick = pillBox(3.0, 1.45, 0.42, 0.16);
    const band = pillBox(0.55, 1.62, 0.5, 0.08);
    const ring = new THREE.TorusGeometry(0.42, 0.045, 12, 48);
    [[0, 0, 0], [0.14, 0.72, 0.12], [-0.1, 1.44, -0.08]].forEach(([dx, dy, rot], i) => {
      const brickGroup = new THREE.Group();
      brickGroup.add(new THREE.Mesh(brick, glass));
      const b = new THREE.Mesh(band, gloss(i === 1 ? PAL.plum : PAL.coral)); brickGroup.add(b);
      const r = new THREE.Mesh(ring, gloss(PAL.lilac)); r.scale.set(1.3, 1, 1); r.position.z = 0.42; r.position.x = 0.95; brickGroup.add(r);
      brickGroup.rotation.x = -Math.PI / 2; brickGroup.rotation.z = rot;
      brickGroup.position.set(dx, dy, 0);
      g.add(brickGroup);
    });
    return { group: g, base: { x: 0.55, y: 0.5, z: 0 }, fit: 4.6 };
  },
};

function buildCar(police) {
  const g = new THREE.Group();
  const width = 1.9;
  // lower body (glass), side profile extruded across the car's width
  const body = roundedShape([[-2.75, -0.25], [2.75, -0.25], [2.85, 0.22], [2.3, 0.55], [-2.05, 0.62], [-2.8, 0.45]], 0.3);
  g.add(new THREE.Mesh(puff(body, width, 0.34), glass));
  // cabin: tinted glossy glass
  const cabin = roundedShape([[1.15, 0.5], [0.4, 1.28], [-1.15, 1.28], [-1.9, 0.5]], 0.32);
  const cab = new THREE.Mesh(puff(cabin, width * 0.78, 0.26), gloss(PAL.indigo, { transmission: 0.35, roughness: 0.08, thickness: 0.5 }));
  g.add(cab);
  // wheels
  const tyre = new THREE.TorusGeometry(0.46, 0.22, 20, 40), hub = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 32);
  for (const x of [-1.72, 1.72]) for (const side of [1, -1]) {
    const t = new THREE.Mesh(tyre, gloss('#2A2640', { roughness: 0.35 })); t.position.set(x, -0.3, side * (width / 2 + 0.3)); g.add(t);
    const h = new THREE.Mesh(hub, gloss(police ? '#E9E7EE' : PAL.lilac)); h.rotation.x = Math.PI / 2; h.position.copy(t.position); g.add(h);
  }
  // lights
  const lamp = new THREE.SphereGeometry(0.14, 24, 24);
  for (const side of [1, -1]) {
    const head = new THREE.Mesh(lamp, gloss('#FFF4EC', { emissive: '#FFE7D6', emissiveIntensity: 0.8 })); head.position.set(2.86, 0.18, side * 0.62); head.scale.x = 0.5; g.add(head);
    const tail = new THREE.Mesh(lamp, gloss(PAL.coral, { emissive: PAL.coral, emissiveIntensity: 0.6 })); tail.position.set(-2.88, 0.32, side * 0.62); tail.scale.x = 0.5; g.add(tail);
  }
  const flash = [];
  if (police) {
    // light bar: one coral (red) and one indigo (blue) side, flashing like a cruiser
    const half = pillBox(0.42, 0.18, 0.5, 0.07);
    [[PAL.coral, 0.26], [PAL.indigo, -0.26]].forEach(([c, z]) => {
      const m = new THREE.Mesh(half, gloss(c, { emissive: c, emissiveIntensity: 0.4 }));
      m.rotation.y = Math.PI / 2; m.position.set(-0.4, 1.66, z); g.add(m); flash.push(m);
    });
    const stripe = new THREE.Mesh(pillBox(3.8, 0.16, width + 0.62, 0.06), gloss('#F2F1F5'));
    stripe.position.set(0.05, 0.12, 0); g.add(stripe);
  } else {
    const spoiler = new THREE.Mesh(pillBox(0.55, 0.12, width * 0.95, 0.05), gloss(PAL.plum)); spoiler.position.set(-2.45, 0.9, 0); g.add(spoiler);
    for (const side of [1, -1]) { const post = new THREE.Mesh(pillBox(0.12, 0.3, 0.1, 0.04), gloss(PAL.plum)); post.position.set(-2.45, 0.72, side * 0.6); g.add(post); }
  }
  g.userData.flash = flash;
  return { group: g, base: { x: 0.2, y: 0.55, z: 0 }, fit: 5.2 };
}
const NAMES = Object.keys(MODELS);

function pickInitial() {
  let last = null;
  try { last = localStorage.getItem('hex-model'); } catch { /* storage blocked */ }
  const q = new URLSearchParams(location.search).get('model');
  if (NAMES.includes(q)) return q;
  const pool = NAMES.filter((n) => n !== last);
  return pool[Math.floor(Math.random() * pool.length)];
}

function init() {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: (devicePixelRatio || 1) < 1.5, powerPreference: 'high-performance' }); }
  catch { document.documentElement.classList.add('no-webgl'); return; }
  // ── Performance budget ──
  // The glass refraction pass re-renders the scene every frame; half resolution is visually identical
  // because the refraction is soft anyway. Resolution then adapts to keep frames under budget.
  renderer.transmissionResolutionScale = 0.5;
  const params = new URLSearchParams(location.search);
  const fixedQuality = params.get('quality') === 'high';
  const DPR_CAP = Math.min(devicePixelRatio || 1, 1.5);
  const DPR_MIN = 0.75;
  let dpr = DPR_CAP;
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 12);

  /* Environment: gradient dome + softboxes, rebuilt per phase */
  const envScene = new THREE.Scene();
  const domeU = { a: { value: new THREE.Color() }, b: { value: new THREE.Color('#ffffff') }, c: { value: new THREE.Color() } };
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(20, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, uniforms: domeU,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 a; uniform vec3 b; uniform vec3 c; varying vec3 vP; void main(){ float t = vP.y*0.5+0.5; vec3 col = t > 0.5 ? mix(b, a, (t-0.5)*2.0) : mix(c, b, t*2.0); gl_FragColor = vec4(col*0.9,1.0); }',
  })));
  const box = (w, h, pos, color, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.copy(pos); m.lookAt(0, 0, 0); envScene.add(m); return m;
  };
  const key = box(10, 3, new THREE.Vector3(-6, 7, 6), '#ffffff', 6);
  box(3, 10, new THREE.Vector3(9, 0, 3), '#ffffff', 3);
  const warm = box(6, 6, new THREE.Vector3(-8, -4, -6), PAL.lilac, 3);
  const cool = box(6, 4, new THREE.Vector3(6, -6, 6), PAL.coral, 2.5);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;

  /* Backdrop plane: the page's own liquid light field, evaluated at the same viewport pixels,
     so the canvas is seamless with the page and the glass refracts what is really behind it */
  const bdU = {
    uBg: { value: new THREE.Vector3() }, uC: { value: [0, 1, 2, 3].map(() => new THREE.Vector3()) },
    uOp: { value: 0.3 }, uTime: { value: 0 }, uView: { value: new THREE.Vector2(1, 1) },
    uOrigin: { value: new THREE.Vector2() }, uSize: { value: new THREE.Vector2(1, 1) },
    uGlow: { value: 0 }, uGlowAt: { value: new THREE.Vector2(0.7, 0.5) }, uGlowK: { value: 0.55 },
  };
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: bdU, depthWrite: false, toneMapped: false,
    vertexShader: 'varying vec2 vNdc; void main(){ vec4 c = projectionMatrix * modelViewMatrix * vec4(position, 1.0); vNdc = c.xy / c.w; gl_Position = c; }',
    fragmentShader: LIQUID_GLSL + `
      uniform vec2 uOrigin, uSize, uGlowAt; uniform float uGlow, uGlowK; varying vec2 vNdc;
      float glowAt(vec2 d, vec2 c, float r) { return clamp(1.0 - length(d - c) / r, 0.0, 1.0); }
      vec3 toLinear(vec3 c) { return mix(pow(c * 0.9478672986 + 0.0521327014, vec3(2.4)), c * 0.0773993808, vec3(lessThanEqual(c, vec3(0.04045)))); }
      void main() {
        vec2 uv = vNdc * 0.5 + 0.5, pd = vec2(uv.x, 1.0 - uv.y);
        vec3 col = hexLiquid(uOrigin + pd * uSize);
        if (uGlow > 0.5) {   // refraction only: soft palette glows behind the object, so the glass carries colour
          vec2 d = (pd - uGlowAt) * uSize / min(uSize.x, uSize.y);
          col = mix(col, uC[0], uGlowK * glowAt(d, vec2(-0.18, -0.12), 0.42));
          col = mix(col, uC[2], uGlowK * glowAt(d, vec2(0.2, 0.15), 0.45));
          col = mix(col, uC[1], uGlowK * 0.9 * glowAt(d, vec2(0.02, -0.02), 0.3));
          col = mix(col, uC[3], uGlowK * 0.6 * glowAt(d, vec2(-0.25, 0.3), 0.25));
        }
        gl_FragColor = vec4(toLinear(col), 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  backdrop.position.z = -6; scene.add(backdrop);
  // the transmission pass renders into its own target; only there do the extra glows apply
  backdrop.onBeforeRender = (r) => { bdU.uGlow.value = r.getRenderTarget() ? 1 : 0; };
  let canvasDocTop = 0, canvasLeft = 0;
  function syncBackdrop() {
    bdU.uBg.value.fromArray(liquid.bg); liquid.c.forEach((c, i) => bdU.uC.value[i].fromArray(c));
    bdU.uOp.value = liquid.op; bdU.uGlowK.value = document.documentElement.dataset.phase === 'night' ? 0.75 : 0.55; bdU.uTime.value = liquid.time(); bdU.uView.value.fromArray(liquid.view);
    bdU.uOrigin.value.set(canvasLeft, canvasDocTop - scrollY);
  }

  const rim = new THREE.PointLight(PAL.coral, 30, 20); rim.position.set(4, -2, 3); scene.add(rim);
  const rim2 = new THREE.PointLight(PAL.slate, 30, 20); rim2.position.set(-4, 3, 2); scene.add(rim2);

  function applyPhase() {
    const phase = document.documentElement.dataset.phase || 'day';
    const g1 = css('--g1', PAL.slate), g3 = css('--g3', PAL.coral), g2 = css('--g2', PAL.lilac);
    domeU.a.value.set(g1); domeU.c.value.set(g3); domeU.b.value.set(phase === 'night' ? '#2A2838' : '#FFFFFF');
    warm.material.color.set(g2).multiplyScalar(3); cool.material.color.set(g3).multiplyScalar(2.5);
    key.material.color.set('#ffffff').multiplyScalar(phase === 'night' ? 3 : 6);
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(envScene, 0.035); scene.environment = envRT.texture;
    rim.color.set(g3); rim2.color.set(g1);
    renderer.toneMappingExposure = phase === 'night' ? 0.92 : phase === 'dusk' ? 1.0 : 1.04;
    glass.attenuationColor.set(phase === 'night' ? '#E6DDF5' : phase === 'dusk' ? '#F6E6EC' : '#F2ECF7');
  }
  document.addEventListener('hex:phase', applyPhase);

  /* Orbs */
  const orbs = [
    { c: PAL.coral, r: 0.5, dist: 3.2, speed: 0.32, phase: 0, tilt: 0.5 },
    { c: PAL.slate, r: 0.36, dist: 3.6, speed: -0.26, phase: 2.1, tilt: -0.4 },
    { c: PAL.lilac, r: 0.25, dist: 2.8, speed: 0.45, phase: 4.2, tilt: 0.9 },
    { c: '#ffffff', r: 0.17, dist: 4.0, speed: 0.2, phase: 1.1, tilt: -0.8, chrome: true },
  ].map((d) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(d.r, 28, 20), d.chrome
      ? new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0.05, envMapIntensity: 1.5 })
      : gloss(d.c, { emissive: d.c, emissiveIntensity: 0.12 }));
    scene.add(m); return { m, ...d };
  });

  /* Model holder + swapping */
  const stage = new THREE.Group(); scene.add(stage);
  const holder = new THREE.Group(); stage.add(holder);
  let current = null, base = { x: 0, y: 0, z: 0 };
  function build(name) {
    if (current) holder.remove(current);
    const { group, base: b, fit: target = 4.4 } = MODELS[name]();
    const bb = new THREE.Box3().setFromObject(group), size = new THREE.Vector3(), center = new THREE.Vector3();
    bb.getSize(size); bb.getCenter(center);
    group.position.sub(center);
    const fit = new THREE.Group(); fit.add(group); fit.scale.setScalar(target / Math.max(size.x, size.y));
    holder.add(fit); current = fit; base = b; holder.userData.name = name;
    canvas.dataset.model = name;
    try { localStorage.setItem('hex-model', name); } catch { /* ignore */ }
  }
  let swap = { t: -1, next: null };
  let pop = 0; // intro scale 0 → 1
  function requestSwap(name) {
    if (swap.t >= 0) return;
    const i = NAMES.indexOf(holder.userData.name);
    swap = { t: 0, next: name && NAMES.includes(name) ? name : NAMES[(i + 1) % NAMES.length] };
  }
  document.addEventListener('hex:model', (e) => requestSwap(e.detail));
  let timeScale = 1;
  document.addEventListener('hex:slowmo', (e) => { timeScale = e.detail ? 0.25 : 1; });

  /* Layout */
  let layout = { x: 0, y: 0, s: 1 };
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;      // canvas only covers the object's side of the hero
    const narrow = hero.clientWidth < 900;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const vh = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z, vw = vh * camera.aspect;
    layout = narrow ? { x: vw * 0.16, y: -vh * 0.1, s: Math.min(0.8, vw / 9) } : { x: vw * 0.04, y: vh * 0.02, s: Math.min(1.2, vh / 9.4, vw / 7.2) };
    const bz = camera.position.z - backdrop.position.z;
    const bh = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * bz;
    backdrop.scale.set(bh * camera.aspect * 1.02, bh * 1.02, 1);
    const at = new THREE.Vector3(layout.x, layout.y, 0).project(camera);
    bdU.uGlowAt.value.set((at.x + 1) / 2, (1 - at.y) / 2);
    const r = canvas.getBoundingClientRect();
    canvasLeft = r.left; canvasDocTop = r.top + scrollY; bdU.uSize.value.set(r.width, r.height);
  }
  new ResizeObserver(resize).observe(hero);

  /* Interaction */
  const ptr = { x: 0, y: 0 }, cur = { x: 0, y: 0 }, ndc = new THREE.Vector2(), ray = new THREE.Raycaster();
  const hits = (e) => {
    const at = new THREE.Vector3(layout.x, layout.y, 0).project(camera);
    bdU.uGlowAt.value.set((at.x + 1) / 2, (1 - at.y) / 2);
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObject(holder, true).length > 0;
  };
  addEventListener('pointermove', (e) => {
    ptr.x = (e.clientX / innerWidth) * 2 - 1; ptr.y = (e.clientY / innerHeight) * 2 - 1;
    if (e.pointerType === 'mouse' && e.target === canvas) canvas.classList.toggle('hover', hits(e));
  }, { passive: true });
  canvas.addEventListener('click', (e) => { if (hits(e)) requestSwap(); });

  let visible = true;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(hero);

  build(pickInitial());
  applyPhase();
  resize();

  const clock = new THREE.Clock();
  let t = 0;
  const easeOutBack = (k) => 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
  let lastFrame = 0, sampleT = 0, sampleN = 0, lastAdjust = 0, degraded = false;
  function adapt(now, frameMs) {
    if (fixedQuality) return;
    sampleT += frameMs; sampleN++;
    if (sampleN < 24 || now - lastAdjust < 1500) return;
    const avg = sampleT / sampleN; sampleT = 0; sampleN = 0; lastAdjust = now;
    let next = dpr;
    if (avg > 21 && dpr > DPR_MIN) next = Math.max(DPR_MIN, dpr - (avg > 40 ? 0.3 : 0.15));
    else if (avg < 14 && dpr < DPR_CAP) next = Math.min(DPR_CAP, dpr + 0.1);
    else if (avg > 40 && dpr <= DPR_MIN && !degraded) {      // very weak GPU: drop the priciest optics
      degraded = true; glass.dispersion = 0; glass.iridescence = 0; glass.needsUpdate = true;
    }
    if (next !== dpr) { dpr = next; renderer.setPixelRatio(dpr); resize(); }
  }
  renderer.setAnimationLoop((now) => {
    if (!visible || document.hidden) { clock.getDelta(); return; }
    if (now - lastFrame < 15.5) return;                       // cap at ~60fps on 120/144Hz screens
    const frameMs = lastFrame ? now - lastFrame : 16.7;
    lastFrame = now;
    adapt(now, frameMs);
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt * timeScale;
    const m = reduced ? 0 : 1;
    cur.x += (ptr.x - cur.x) * 0.05; cur.y += (ptr.y - cur.y) * 0.05;
    const scrollK = Math.min(1, scrollY / innerHeight);

    // intro pop + swap animation (shrink → rebuild → spring back)
    pop = reduced ? 1 : Math.min(1, pop + dt * 1.6);
    let s = easeOutBack(pop);
    if (swap.t >= 0) {
      swap.t += dt * timeScale;
      if (swap.t < 0.3) s *= 1 - swap.t / 0.3;
      else {
        if (swap.next) { build(swap.next); swap.next = null; }
        const k = Math.min(1, (swap.t - 0.3) / 0.6); s *= easeOutBack(k);
        if (k >= 1) swap.t = -1;
      }
    }
    stage.scale.setScalar(layout.s * Math.max(0.001, s));
    stage.position.set(layout.x, layout.y + Math.sin(t * 0.9) * 0.12 * m + scrollK * 1.5, 0);
    holder.rotation.x = base.x + cur.y * 0.3 + Math.sin(t * 0.5) * 0.1 * m + scrollK * 0.9;
    holder.rotation.y = base.y + cur.x * 0.45 + Math.sin(t * 0.35) * 0.35 * m;
    holder.rotation.z = base.z + Math.sin(t * 0.3) * 0.06 * m;
    const flash = current?.children[0]?.userData.flash;
    if (flash?.length) { const on = Math.floor(t * 4) % 2; flash[0].material.emissiveIntensity = on ? 1.6 : 0.15; flash[1].material.emissiveIntensity = on ? 0.15 : 1.6; }

    for (const o of orbs) {
      const a = o.phase + t * o.speed * m;
      o.m.position.set(
        layout.x + Math.cos(a) * o.dist * layout.s,
        layout.y + (Math.sin(a) * o.dist * 0.45 + Math.sin(a * 2) * 0.2) * layout.s + scrollK * 1.5,
        (Math.sin(a) * o.dist * Math.sin(o.tilt) - 0.4) * layout.s,
      );
      o.m.scale.setScalar(layout.s);
    }
    syncBackdrop();
    renderer.render(scene, camera);
  });
}

if (canvas && hero) {
  try { init(); } catch (err) { console.warn('[glass3d]', err); document.documentElement.classList.add('no-webgl'); }
}

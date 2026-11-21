// hexcam engine: a zero-dependency WebGL2 pipeline for raw camera looks on photos and video.
//
// Per frame, at "sensor" resolution unless noted:
//   lens     source -> A        barrel distortion, chromatic aberration, softness, shake, VHS line jitter, downscale
//   bloom    A -> q1/q2         highlight extract + separable blur at quarter res (linear light)
//   grade    A + bloom -> B     exposure, flash, white balance, contrast, bleach bypass, saturation, split tone, blacks, fade
//   sensor   B + stamp -> C     oversharpening, shadow-weighted chroma noise, burned-in date stamp
//   codec    C -> D             real JPEG-style DCT: YCbCr, chroma subsampling, 8x8 separable DCT, quantise, IDCT (N generations)
//   post     D + prev -> out    (output res) upscale, chroma bleed, tape noise, light leak, vignette, scanlines, grain, dust, ghosting, dither
//   blit     out -> canvas

const VERT = `#version 300 es
in vec2 a_pos; out vec2 v_uv;
void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const HEAD = `#version 300 es
precision highp float; precision highp int;
in vec2 v_uv; out vec4 o;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 hash32(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
float luma(vec3 c){ return dot(c, vec3(.2126, .7152, .0722)); }
vec3 toLin(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }
vec3 toSrgb(vec3 c){ return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
`;

const FS = {
  blit: `${HEAD}
uniform sampler2D u_tex;
void main(){ o = vec4(texture(u_tex, v_uv).rgb, 1.0); }`,

  lens: `${HEAD}
uniform sampler2D u_src; uniform vec2 u_srcSize; uniform vec2 u_out;
uniform float u_distort, u_ca, u_soft, u_vhs, u_time, u_alias; uniform vec2 u_shake;
vec3 samp(vec2 uv, float lod){
  vec2 e = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  return textureLod(u_src, uv, lod).rgb * e.x * e.y;
}
vec3 tap(vec2 uv, vec2 r, vec2 b, float lod){
  return vec3(samp(r, lod).r, samp(uv, lod).g, samp(b, lod).b);
}
void main(){
  vec2 uv = v_uv;
  float row = floor(uv.y * u_out.y);
  float frame = floor(u_time * 30.0);
  // VHS: per-line jitter, a rolling tracking band and head-switching skew at the bottom
  float jit = (hash12(vec2(row, frame)) - 0.5) * 0.0035 * u_vhs;
  float bandY = 1.0 - fract(u_time * 0.07);
  jit += u_vhs * smoothstep(0.05, 0.0, abs(uv.y - bandY)) * (hash12(vec2(row * 0.37, frame)) - 0.2) * 0.025;
  jit += u_vhs * smoothstep(0.045, 0.0, uv.y) * 0.03 * (1.0 - uv.y / 0.045);
  uv.x += jit;
  uv += u_shake;
  // barrel (+) / pincushion (-), auto-zoomed so the frame stays filled
  float asp = u_out.x / u_out.y;
  vec2 p = uv - 0.5;
  vec2 q = vec2(p.x * asp, p.y);
  float r2 = dot(q, q);
  float rmax = 0.25 * (asp * asp + 1.0);
  p *= (1.0 + u_distort * r2) / (1.0 + max(u_distort, 0.0) * rmax);
  float r = sqrt(r2);
  vec2 pr = p * (1.0 + u_ca * 0.018 * r), pb = p * (1.0 - u_ca * 0.018 * r);
  vec2 c = p + 0.5, cr = pr + 0.5, cb = pb + 0.5;
  // downscale: mip-filtered 4-tap (clean) or a single nearest-ish tap (jagged)
  vec2 foot = u_srcSize / u_out;
  float lod = mix(max(log2(max(foot.x, foot.y)) - 0.5, 0.0), 0.0, u_alias) + u_soft * 3.5;
  vec3 col;
  if (u_alias > 0.5) {
    col = tap(c, cr, cb, lod);
  } else {
    vec2 d = 0.25 / u_out;
    col = 0.25 * (tap(c + vec2(-d.x, -d.y), cr + vec2(-d.x, -d.y), cb + vec2(-d.x, -d.y), lod)
                + tap(c + vec2( d.x, -d.y), cr + vec2( d.x, -d.y), cb + vec2( d.x, -d.y), lod)
                + tap(c + vec2(-d.x,  d.y), cr + vec2(-d.x,  d.y), cb + vec2(-d.x,  d.y), lod)
                + tap(c + vec2( d.x,  d.y), cr + vec2( d.x,  d.y), cb + vec2( d.x,  d.y), lod));
  }
  o = vec4(col, 1.0);
}`,

  bloomExtract: `${HEAD}
uniform sampler2D u_tex; uniform vec2 u_texel; uniform float u_thr;
void main(){
  vec3 c = vec3(0.0);
  c += texture(u_tex, v_uv + u_texel * vec2(-1.0, -1.0)).rgb;
  c += texture(u_tex, v_uv + u_texel * vec2( 1.0, -1.0)).rgb;
  c += texture(u_tex, v_uv + u_texel * vec2(-1.0,  1.0)).rgb;
  c += texture(u_tex, v_uv + u_texel * vec2( 1.0,  1.0)).rgb;
  c *= 0.25;
  float w = smoothstep(u_thr, min(u_thr + 0.25, 1.0001), luma(c));
  o = vec4(toLin(c) * w, 1.0);
}`,

  blur: `${HEAD}
uniform sampler2D u_tex; uniform vec2 u_dir;
void main(){
  const float W[5] = float[5](.2270270270, .1945945946, .1216216216, .0540540541, .0162162162);
  vec3 c = texture(u_tex, v_uv).rgb * W[0];
  for (int i = 1; i < 5; i++) {
    c += texture(u_tex, v_uv + u_dir * float(i)).rgb * W[i];
    c += texture(u_tex, v_uv - u_dir * float(i)).rgb * W[i];
  }
  o = vec4(c, 1.0);
}`,

  grade: `${HEAD}
uniform sampler2D u_tex, u_bloom; uniform float u_asp;
uniform float u_exposure, u_contrast, u_sat, u_temp, u_tint, u_blacks, u_fade, u_bleach, u_split, u_flash, u_bloomAmt;
uniform vec3 u_shadowTint, u_hiTint, u_bloomTint;
void main(){
  vec3 c = toLin(texture(u_tex, v_uv).rgb);
  c *= exp2(u_exposure);
  // on-camera flash: hot centre, falloff to the edges
  vec2 p = (v_uv - 0.5) * vec2(u_asp, 1.0);
  float fr = length(p);
  c *= 1.0 + u_flash * (1.9 * exp(-fr * fr * 5.0) - 0.5 * fr);
  c += texture(u_bloom, v_uv).rgb * u_bloomTint * u_bloomAmt;
  c *= vec3(1.0 + u_temp * 0.3 - u_tint * 0.05, 1.0 + u_tint * 0.25, 1.0 - u_temp * 0.3 - u_tint * 0.05);
  vec3 d = clamp(toSrgb(c), 0.0, 1.0);          // sensor clip: highlights blow out like a cheap CCD
  d = clamp((d - 0.5) * u_contrast + 0.5, 0.0, 1.0);
  float L = luma(d);
  vec3 ov = mix(2.0 * d * L, 1.0 - 2.0 * (1.0 - d) * (1.0 - L), step(0.5, L));   // bleach bypass: luminance overlaid on colour
  d = mix(d, ov, u_bleach);
  d = mix(d, vec3(luma(d)), u_bleach * 0.45);
  L = luma(d);
  d = mix(vec3(L), d, u_sat);
  d += (u_shadowTint * (1.0 - L) * (1.0 - L) + u_hiTint * L * L) * u_split;
  d = u_blacks + d * (1.0 - u_blacks - u_fade);
  o = vec4(clamp(d, 0.0, 1.0), 1.0);
}`,

  sensor: `${HEAD}
uniform sampler2D u_tex, u_stamp; uniform vec2 u_size; uniform float u_sharp, u_noise, u_seed;
void main(){
  vec2 t = 1.0 / u_size;
  vec3 c = texture(u_tex, v_uv).rgb;
  vec3 n = texture(u_tex, v_uv + vec2(0.0, t.y)).rgb + texture(u_tex, v_uv - vec2(0.0, t.y)).rgb
         + texture(u_tex, v_uv + vec2(t.x, 0.0)).rgb + texture(u_tex, v_uv - vec2(t.x, 0.0)).rgb;
  c += u_sharp * (4.0 * c - n);                  // in-camera oversharpening, halos included
  float L = luma(clamp(c, 0.0, 1.0));
  vec3 nz = hash32(gl_FragCoord.xy + u_seed * 101.0) - 0.5;
  float ln = hash12(gl_FragCoord.xy * 1.31 + u_seed * 57.0) - 0.5;
  c += (nz * 0.7 + ln * 0.5) * u_noise * (0.3 + (1.0 - L) * 0.9);
  vec4 s = texture(u_stamp, v_uv);
  c = mix(c, s.rgb, s.a) + s.rgb * s.a * 0.2;
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`,

  chroma: `${HEAD}
uniform sampler2D u_tex; uniform ivec2 u_valid, u_sub, u_off;
void main(){
  ivec2 px = ivec2(gl_FragCoord.xy) - u_off;     // codec space is the image shifted by u_off (generation loss)
  vec2 acc = vec2(0.0); float n = 0.0;
  for (int y = 0; y < 4; y++) { if (y >= u_sub.y) break;
    for (int x = 0; x < 4; x++) { if (x >= u_sub.x) break;
      ivec2 p = clamp(px * u_sub + ivec2(x, y), ivec2(0), u_valid - 1);
      vec3 c = texelFetch(u_tex, p, 0).rgb * 255.0;
      acc += vec2(-.168736 * c.r - .331264 * c.g + .5 * c.b, .5 * c.r - .418688 * c.g - .081312 * c.b);
      n += 1.0;
    }
  }
  o = vec4(acc / n, 0.0, 1.0);
}`,

  // one 1-D pass of a separable 8x8 DCT / IDCT. Forward = horizontal then vertical(+quantise).
  dct: `${HEAD}
uniform sampler2D u_tex; uniform ivec2 u_valid, u_off;
uniform int u_dir, u_inv, u_toY, u_quant;
uniform float u_q[64]; uniform float u_cos[64];
vec2 fetchV(ivec2 p){
  if (u_toY == 1) {                               // first pass reads the image, shifted into codec space
    vec3 c = texelFetch(u_tex, clamp(p - u_off, ivec2(0), u_valid - 1), 0).rgb * 255.0;
    return vec2(dot(c, vec3(.299, .587, .114)) - 128.0, 0.0);
  }
  return texelFetch(u_tex, clamp(p, ivec2(0), u_valid - 1), 0).xy;
}
void main(){
  ivec2 px = ivec2(gl_FragCoord.xy);
  int a = u_dir == 0 ? px.x : px.y;
  int org = (a / 8) * 8;
  int j = a - org;
  vec2 acc = vec2(0.0);
  for (int i = 0; i < 8; i++) {
    ivec2 sp = u_dir == 0 ? ivec2(org + i, px.y) : ivec2(px.x, org + i);
    vec2 val = fetchV(sp);
    if (u_inv == 0) acc += val * u_cos[i * 8 + j];
    else acc += (i == 0 ? 0.70710678 : 1.0) * val * u_cos[j * 8 + i];
  }
  acc *= u_inv == 0 ? 0.5 * (j == 0 ? 0.70710678 : 1.0) : 0.5;
  if (u_quant == 1) {
    float q = u_q[j * 8 + (px.x % 8)];
    acc = floor(acc / q + 0.5) * q;
  }
  o = vec4(acc, 0.0, 1.0);
}`,

  recombine: `${HEAD}
uniform sampler2D u_y, u_c; uniform ivec2 u_cvalid, u_off; uniform vec2 u_sub;
vec2 cAt(ivec2 p){ return texelFetch(u_c, clamp(p, ivec2(0), u_cvalid - 1), 0).xy; }
void main(){
  ivec2 px = ivec2(gl_FragCoord.xy);
  float Y = texelFetch(u_y, px + u_off, 0).x + 128.0;
  vec2 cp = (vec2(px) + 0.5) / u_sub - 0.5 + vec2(u_off);
  ivec2 i0 = ivec2(floor(cp)); vec2 f = fract(cp);
  vec2 C = mix(mix(cAt(i0), cAt(i0 + ivec2(1, 0)), f.x), mix(cAt(i0 + ivec2(0, 1)), cAt(i0 + ivec2(1, 1)), f.x), f.y);
  vec3 rgb = vec3(Y + 1.402 * C.y, Y - .344136 * C.x - .714136 * C.y, Y + 1.772 * C.x) / 255.0;
  o = vec4(clamp(rgb, 0.0, 1.0), 1.0);
}`,

  post: `${HEAD}
uniform sampler2D u_tex, u_prev; uniform vec2 u_sensor, u_out;
uniform float u_bleed, u_vhs, u_interlace, u_ghost, u_flick, u_leak, u_vig, u_grain, u_grainSize, u_seed, u_dust, u_bits, u_bayer, u_time;
uniform vec3 u_leakCol, u_vigTint; uniform vec2 u_leakPos;
vec3 rgb2yiq(vec3 c){ return mat3(.299, .596, .211, .587, -.274, -.523, .114, -.322, .312) * c; }
vec3 yiq2rgb(vec3 c){ return mat3(1.0, 1.0, 1.0, .956, -.272, -1.106, .621, -.647, 1.703) * c; }
float bayer4(vec2 p){
  int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
  const float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  return (m[x + y * 4] + 0.5) / 16.0;
}
void main(){
  vec3 c = texture(u_tex, v_uv).rgb;
  if (u_bleed > 0.0) {                            // composite-video chroma: smeared and shifted right, luma stays sharp
    vec3 yiq = rgb2yiq(c);
    vec2 ch = vec2(0.0); float ws = 0.0;
    for (int i = -6; i <= 6; i++) {
      float w = exp(-float(i * i) / 18.0);
      vec2 off = vec2((float(i) * 1.7 + u_bleed * 3.0) / u_sensor.x, 0.0);
      ch += rgb2yiq(texture(u_tex, v_uv - off).rgb).yz * w; ws += w;
    }
    yiq.yz = mix(yiq.yz, ch / ws * (1.0 + u_bleed * 0.25), u_bleed);
    c = yiq2rgb(yiq);
  }
  if (u_vhs > 0.0) {
    float bandY = 1.0 - fract(u_time * 0.07);
    float st = step(0.8, hash12(vec2(floor(v_uv.x * u_out.x / 3.0), floor(v_uv.y * u_sensor.y)) + u_seed));
    c = mix(c, vec3(st), u_vhs * smoothstep(0.018, 0.0, abs(v_uv.y - bandY)) * 0.7);
    c = mix(c, vec3(hash12(floor(gl_FragCoord.xy / vec2(2.0, 1.0)) + u_seed)), u_vhs * smoothstep(0.035, 0.0, v_uv.y) * 0.55);
  }
  vec2 lp = (v_uv - u_leakPos) * vec2(u_out.x / u_out.y, 1.0);
  c = 1.0 - (1.0 - c) * (1.0 - u_leakCol * exp(-dot(lp, lp) * 2.2) * u_leak);
  vec2 vp = (v_uv - 0.5) * 2.0;
  c *= mix(vec3(1.0), u_vigTint, smoothstep(0.45, 1.5, length(vp)) * u_vig);
  c *= u_flick;
  float ratio = u_out.y / u_sensor.y;
  float sel = ratio >= 1.8 ? step(0.5, fract(v_uv.y * u_sensor.y)) : mod(floor(gl_FragCoord.y), 2.0);
  c *= 1.0 - u_interlace * 0.42 * sel;
  if (u_grain > 0.0) {                            // film grain: clumped, strongest in the midtones
    vec2 gp = floor(gl_FragCoord.xy / u_grainSize);
    float g = hash12(gp + u_seed * 13.1) + hash12(gp * 1.73 + u_seed * 7.7) - 1.0;
    float L = luma(c);
    c += g * u_grain * 0.32 * (1.0 - pow(abs(L - 0.5) * 2.0, 2.0) * 0.6);
  }
  if (u_dust > 0.0) {
    float scale = max(u_out.y / 540.0, 1.0);
    vec2 cell = floor(gl_FragCoord.xy / (2.5 * scale));
    float h = hash12(cell + u_seed * 3.7);
    if (h > 1.0 - u_dust * 0.0016) c = mix(c, vec3(step(0.35, hash12(cell + 9.1))), 0.85);
    if (hash12(vec2(u_seed, 3.3)) < u_dust * 0.45) {
      float sx = hash12(vec2(u_seed, 9.9));
      c *= 1.0 - 0.45 * smoothstep(1.4 * scale / u_out.x, 0.0, abs(v_uv.x - sx));
    }
  }
  if (u_ghost > 0.0) c = mix(c, texture(u_prev, v_uv).rgb, u_ghost);
  if (u_bits < 7.99) {
    float lv = exp2(u_bits) - 1.0;
    float th = u_bayer > 0.5 ? bayer4(floor(v_uv * u_sensor)) - 0.5 : 0.0;
    c = floor(clamp(c, 0.0, 1.0) * lv + 0.5 + th) / lv;
  }
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`,
};

// standard JPEG (ITU T.81 Annex K) quantisation tables, natural order
const Q_LUMA = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const Q_CHROMA = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
  ...new Array(32).fill(99)];
const COS = new Float32Array(64);
for (let i = 0; i < 8; i++) for (let k = 0; k < 8; k++) COS[i * 8 + k] = Math.cos(((2 * i + 1) * k * Math.PI) / 16);
// IJG quality scaling
export function qtable(base, quality) {
  const q = Math.min(100, Math.max(1, quality));
  const s = q < 50 ? 5000 / q : 200 - 2 * q;
  return Float32Array.from(base, (b) => Math.min(255, Math.max(1, Math.floor((b * s + 50) / 100))));
}
const SUB = { 444: [1, 1], 422: [2, 1], 420: [2, 2], 411: [4, 1] };

export const hexToRgb = (h) => {
  const n = parseInt(String(h).replace('#', ''), 16) || 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const tintOffset = (h) => { const c = hexToRgb(h); const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; return c.map((v) => v - l); };
const ceil8 = (n) => Math.ceil(n / 8) * 8;
const even = (n) => Math.max(2, Math.round(n / 2) * 2);

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.floatOK = !!gl.getExtension('EXT_color_buffer_float');
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.p = {};
    for (const [k, src] of Object.entries(FS)) this.p[k] = this.program(src);
    this.t = {};
    this.src = this.texture();
    this.stamp = this.texture();
    gl.bindTexture(gl.TEXTURE_2D, this.stamp);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    this.srcW = 0; this.srcH = 0;
    this.outIdx = 0;
    this.ghostValid = false;
  }

  program(fs) {
    const gl = this.gl;
    const sh = (type, s) => {
      const x = gl.createShader(type); gl.shaderSource(x, s); gl.compileShader(x);
      if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x));
      return x;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'a_pos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const uniforms = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      uniforms[info.name.replace(/\[0\]$/, '')] = { loc: gl.getUniformLocation(p, info.name), type: info.type, size: info.size };
    }
    return { p, uniforms };
  }

  texture(filter) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter || gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter || gl.LINEAR);
    return t;
  }

  // render target, reused while its size and format stay the same
  target(name, w, h, kind = 'u8') {
    const gl = this.gl;
    if (kind !== 'u8' && !this.floatOK) kind = 'u8';
    const old = this.t[name];
    if (old && old.w === w && old.h === h && old.kind === kind) return old;
    if (old) { gl.deleteTexture(old.tex); gl.deleteFramebuffer(old.fbo); }
    const fmt = { u8: [gl.RGBA8, gl.UNSIGNED_BYTE], f16: [gl.RGBA16F, gl.HALF_FLOAT], f32: [gl.RGBA32F, gl.FLOAT] }[kind];
    const tex = this.texture(kind === 'f32' ? gl.NEAREST : gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt[0], w, h, 0, gl.RGBA, fmt[1], null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const t = { tex, fbo, w, h, kind };
    this.t[name] = t;
    if (name.startsWith('out')) this.ghostValid = false;
    return t;
  }

  run(prog, target, uniforms = {}, textures = {}) {
    const gl = this.gl, P = this.p[prog];
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, target ? target.w : this.canvas.width, target ? target.h : this.canvas.height);
    gl.useProgram(P.p);
    let unit = 0;
    for (const [name, t] of Object.entries(textures)) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t.tex || t);
      uniforms[name] = unit++;
    }
    for (const [name, v] of Object.entries(uniforms)) {
      const u = P.uniforms[name];
      if (!u) continue;
      switch (u.type) {
        case gl.FLOAT: u.size > 1 ? gl.uniform1fv(u.loc, v) : gl.uniform1f(u.loc, v); break;
        case gl.FLOAT_VEC2: gl.uniform2fv(u.loc, v); break;
        case gl.FLOAT_VEC3: gl.uniform3fv(u.loc, v); break;
        case gl.INT_VEC2: gl.uniform2iv(u.loc, v.map(Math.round)); break;
        default: gl.uniform1i(u.loc, Math.round(v));
      }
    }
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // source: an <img>-like canvas, a <video> or an animated <canvas>
  setSource(el, w, h) {
    this.srcW = w; this.srcH = h;
    this.ghostValid = false;
    this.updateSource(el);
  }

  updateSource(el) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.src);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, el);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  setStamp(canvas) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.stamp);
    if (canvas) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  }

  sizes(P) {
    const sw = this.srcW, sh = this.srcH, long = Math.max(sw, sh);
    const cap = Math.min(this.maxTex, 3840);
    const sensorLong = Math.min(Number(P.res) || 640, long, cap);
    const W = even(sw * sensorLong / long), H = even(sh * sensorLong / long);
    let outLong;
    switch (String(P.out)) {
      case 'sensor': outLong = sensorLong; break;
      case 'source': outLong = Math.min(long, 2160); break;
      default: outLong = Number(P.out) || 1080;
    }
    outLong = Math.min(outLong, cap);
    const OW = even(sw * outLong / long), OH = even(sh * outLong / long);
    return { W, H, OW, OH };
  }

  showOriginal(P) {
    const { OW, OH } = this.sizes(P);
    this.resizeCanvas(OW, OH);
    this.run('blit', null, {}, { u_tex: this.src });
  }

  resizeCanvas(w, h) {
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }

  // P: settings object. f: { time (s), seed, shake [x,y], flicker, leakPos [x,y] }
  render(P, f = {}) {
    const gl = this.gl;
    if (!this.srcW) return;
    const { W, H, OW, OH } = this.sizes(P);
    const time = f.time ?? 1.3, seed = f.seed ?? 1;

    const A = this.target('A', W, H);
    this.run('lens', A, {
      u_srcSize: [this.srcW, this.srcH], u_out: [W, H], u_distort: P.distort, u_ca: P.ca, u_soft: P.soft,
      u_vhs: P.vhs, u_time: time, u_alias: P.alias ? 1 : 0, u_shake: f.shake || [0, 0],
    }, { u_src: this.src });

    const qw = Math.max(1, Math.round(W / 4)), qh = Math.max(1, Math.round(H / 4));
    const q1 = this.target('q1', qw, qh, 'f16'), q2 = this.target('q2', qw, qh, 'f16');
    if (P.bloom > 0) {
      this.run('bloomExtract', q1, { u_texel: [1 / W, 1 / H], u_thr: P.bloomThr }, { u_tex: A });
      const step = 1 + P.bloomRadius * 3.5;
      for (let i = 0; i < 2; i++) {
        this.run('blur', q2, { u_dir: [step / qw, 0] }, { u_tex: q1 });
        this.run('blur', q1, { u_dir: [0, step / qh] }, { u_tex: q2 });
      }
    }
    const B = this.target('B', W, H);
    this.run('grade', B, {
      u_asp: W / H, u_exposure: P.exposure, u_contrast: P.contrast, u_sat: P.sat, u_temp: P.temp, u_tint: P.tint,
      u_blacks: P.blacks, u_fade: P.fade, u_bleach: P.bleach, u_split: P.split, u_flash: P.flash,
      u_bloomAmt: P.bloom > 0 ? P.bloom : 0, u_shadowTint: tintOffset(P.shadowTint), u_hiTint: tintOffset(P.hiTint), u_bloomTint: hexToRgb(P.bloomTint),
    }, { u_tex: A, u_bloom: q1 });

    const C = this.target('C', W, H);
    this.run('sensor', C, { u_size: [W, H], u_sharp: P.sharpen, u_noise: P.noise, u_seed: seed }, { u_tex: B, u_stamp: this.stamp });

    let final = C;
    if (P.jpeg && this.floatOK) final = this.codec(C, W, H, P);

    // upscaling filter: nearest = chunky pixels, linear = soft
    gl.bindTexture(gl.TEXTURE_2D, final.tex);
    const filt = P.pixel ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);

    const outA = this.target('outA', OW, OH), outB = this.target('outB', OW, OH);
    const cur = this.outIdx ? outB : outA, prev = this.outIdx ? outA : outB;
    const ghost = f.still || !this.ghostValid ? 0 : P.ghost;
    this.run('post', cur, {
      u_sensor: [W, H], u_out: [OW, OH], u_bleed: P.bleed, u_vhs: P.vhs, u_interlace: P.interlace, u_ghost: ghost,
      u_flick: f.flicker ?? 1, u_leak: P.leak, u_leakCol: hexToRgb(P.leakCol), u_leakPos: f.leakPos || [0.08, 0.88],
      u_vig: P.vignette, u_vigTint: hexToRgb(P.vigTint), u_grain: P.grain, u_grainSize: Math.max(1, P.grainSize * OH / 1080),
      u_seed: seed, u_dust: P.dust, u_bits: P.bits, u_bayer: P.bayer ? 1 : 0, u_time: time,
    }, { u_tex: final, u_prev: prev });
    this.ghostValid = true;
    this.outIdx ^= 1;

    this.resizeCanvas(OW, OH);
    this.run('blit', null, {}, { u_tex: cur });
    return { W, H, OW, OH };
  }

  codec(input, W, H, P) {
    const [sx, sy] = SUB[P.chroma] || SUB[420];
    const cw = Math.ceil(W / sx), ch = Math.ceil(H / sy);
    const pw = ceil8(W) + 8, ph = ceil8(H) + 8, cpw = ceil8(cw) + 8, cph = ceil8(ch) + 8;
    const Ya = this.target('Ya', pw, ph, 'f32'), Yb = this.target('Yb', pw, ph, 'f32');
    const Ca = this.target('Ca', cpw, cph, 'f32'), Cb = this.target('Cb', cpw, cph, 'f32');
    const D = this.target('D', W, H), D2 = this.target('D2', W, H);
    const qL = qtable(Q_LUMA, P.quality), qC = qtable(Q_CHROMA, P.quality);
    const gens = Math.max(1, Math.min(8, Math.round(P.gens || 1)));
    let src = input;
    for (let g = 0; g < gens; g++) {
      const off = [(g * 3) % 8, (g * 5) % 8];
      const base = { u_off: off, u_cos: COS };
      // luma: RGB -> Y DCT rows -> cols (+quantise) -> IDCT rows -> cols
      this.run('dct', Ya, { ...base, u_valid: [W, H], u_dir: 0, u_inv: 0, u_toY: 1, u_quant: 0, u_q: qL }, { u_tex: src });
      this.run('dct', Yb, { ...base, u_valid: [pw, ph], u_dir: 1, u_inv: 0, u_toY: 0, u_quant: 1, u_q: qL }, { u_tex: Ya });
      this.run('dct', Ya, { ...base, u_valid: [pw, ph], u_dir: 0, u_inv: 1, u_toY: 0, u_quant: 0, u_q: qL }, { u_tex: Yb });
      this.run('dct', Yb, { ...base, u_valid: [pw, ph], u_dir: 1, u_inv: 1, u_toY: 0, u_quant: 0, u_q: qL }, { u_tex: Ya });
      // chroma: subsample -> same DCT round trip with the chroma table
      this.run('chroma', Ca, { u_valid: [W, H], u_sub: [sx, sy], u_off: off }, { u_tex: src });
      this.run('dct', Cb, { ...base, u_valid: [cpw, cph], u_dir: 0, u_inv: 0, u_toY: 0, u_quant: 0, u_q: qC }, { u_tex: Ca });
      this.run('dct', Ca, { ...base, u_valid: [cpw, cph], u_dir: 1, u_inv: 0, u_toY: 0, u_quant: 1, u_q: qC }, { u_tex: Cb });
      this.run('dct', Cb, { ...base, u_valid: [cpw, cph], u_dir: 0, u_inv: 1, u_toY: 0, u_quant: 0, u_q: qC }, { u_tex: Ca });
      this.run('dct', Ca, { ...base, u_valid: [cpw, cph], u_dir: 1, u_inv: 1, u_toY: 0, u_quant: 0, u_q: qC }, { u_tex: Cb });
      const out = g % 2 ? D2 : D;
      this.run('recombine', out, { u_cvalid: [cpw, cph], u_sub: [sx, sy], u_off: off }, { u_y: Yb, u_c: Ca });
      src = out;
    }
    return src;
  }
}

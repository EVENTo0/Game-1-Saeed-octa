/**
 * Procedural PBR texture generation.
 *
 * Every surface map in the game is generated here at load time into a canvas —
 * no downloads, nothing to license, and a payload of zero bytes. Each material
 * gets an albedo map plus a normal map derived from the same height field, so
 * surfaces actually catch the sun instead of reading as flat paint.
 *
 * Resolution is driven by the quality preset; the whole set is generated once
 * and shared by every mesh that uses it.
 */
import * as THREE from 'three';

// ---------------------------------------------------------------- noise
/** Deterministic 2D hash in [0,1). */
function hash2(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 1442695040888963407;
  h = (h ^ (h >> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);

/** Value noise that wraps on `period`, so the texture tiles seamlessly. */
function periodicNoise(x, y, period, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const wrap = (v) => ((v % period) + period) % period;
  const x0 = wrap(xi), x1 = wrap(xi + 1);
  const y0 = wrap(yi), y1 = wrap(yi + 1);
  const n00 = hash2(x0, y0, seed), n10 = hash2(x1, y0, seed);
  const n01 = hash2(x0, y1, seed), n11 = hash2(x1, y1, seed);
  const u = smooth(xf), v = smooth(yf);
  return (n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v;
}

/** Fractal brownian motion built from the tiling noise above. */
function fbm(x, y, basePeriod, octaves, seed, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, period = basePeriod;
  for (let o = 0; o < octaves; o++) {
    sum += amp * periodicNoise(x * period, y * period, period, seed + o * 17);
    norm += amp;
    amp *= gain;
    period *= 2;
  }
  return sum / norm;
}

// ---------------------------------------------------------------- helpers
function canvasOf(size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  return c;
}

/** Height field -> tangent-space normal map, wrapping at the edges. */
function normalMapFromHeight(height, size, strength = 2.0) {
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      // normalize (-dx, -dy, 1)
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Build an albedo texture (and its height field) from a per-pixel function.
 * @param {(u:number,v:number)=>{r:number,g:number,b:number,h:number}} fn
 */
function buildSurface(size, fn) {
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const { r, g, b, h } = fn(x / size, y / size);
      const i = (y * size + x) * 4;
      img.data[i] = r * 255;
      img.data[i + 1] = g * 255;
      img.data[i + 2] = b * 255;
      img.data[i + 3] = 255;
      height[y * size + x] = h;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { map: tex, height, canvas };
}

const mix = (a, b, t) => a + (b - a) * t;
const tint = (base, k) => ({ r: base.r * k, g: base.g * k, b: base.b * k });

// ---------------------------------------------------------------- surfaces
/** Wind-rippled desert sand. */
function sand(size, seed) {
  const base = { r: 0.83, g: 0.68, b: 0.47 };
  return buildSurface(size, (u, v) => {
    const grain = fbm(u, v, 48, 3, seed);
    // long wind ripples running across the dune face
    const ripple = Math.sin((u * 26 + fbm(u, v, 6, 2, seed + 5) * 5) * Math.PI * 2) * 0.5 + 0.5;
    const h = grain * 0.45 + ripple * 0.55;
    const k = 0.86 + h * 0.26;
    const c = tint(base, k);
    return { ...c, h };
  });
}

/** Sun-baked mud brick with mortar lines and weathering. */
function mudBrick(size, seed) {
  const brick = { r: 0.76, g: 0.62, b: 0.44 };
  const mortar = { r: 0.62, g: 0.52, b: 0.40 };
  const rows = 8, cols = 4;
  return buildSurface(size, (u, v) => {
    const row = Math.floor(v * rows);
    const offset = (row % 2) * 0.5;                 // running bond
    const bu = (u * cols + offset) % 1;
    const bv = (v * rows) % 1;
    const edge = 0.055;
    const inBrick = bu > edge && bu < 1 - edge && bv > edge && bv < 1 - edge;
    const weather = fbm(u, v, 24, 4, seed);
    const grit = fbm(u, v, 96, 2, seed + 3);
    if (!inBrick) {
      const c = tint(mortar, 0.82 + weather * 0.2);
      return { ...c, h: 0.15 + grit * 0.1 };
    }
    const shade = 0.82 + hash2(Math.floor(u * cols + offset), row, seed) * 0.28;
    const c = tint(brick, shade * (0.88 + weather * 0.24));
    return { ...c, h: 0.62 + grit * 0.22 + weather * 0.16 };
  });
}

/** Poured concrete, stained and pitted — the abandoned outpost. */
function concrete(size, seed) {
  const base = { r: 0.60, g: 0.59, b: 0.56 };
  return buildSurface(size, (u, v) => {
    const mottle = fbm(u, v, 20, 4, seed);
    const pits = fbm(u, v, 110, 2, seed + 9);
    const stain = Math.max(0, fbm(u, v, 7, 3, seed + 2) - 0.55) * 1.6;
    const k = 0.84 + mottle * 0.22 - stain * 0.22;
    const c = tint(base, k);
    return { ...c, h: mottle * 0.5 + (1 - pits) * 0.3 };
  });
}

/** Weathered desert rock. */
function rock(size, seed) {
  const base = { r: 0.68, g: 0.60, b: 0.50 };
  return buildSurface(size, (u, v) => {
    const strata = fbm(u, v, 10, 4, seed);
    const crack = Math.abs(fbm(u, v, 16, 3, seed + 4) - 0.5) * 2;
    const h = strata * 0.7 + (1 - crack) * 0.3;
    const c = tint(base, 0.72 + h * 0.45);
    return { ...c, h };
  });
}

/** Rough timber for crates, posts and the watchtower. */
function wood(size, seed) {
  const base = { r: 0.45, g: 0.31, b: 0.19 };
  return buildSurface(size, (u, v) => {
    const grain = Math.sin((v * 14 + fbm(u, v, 8, 3, seed) * 4) * Math.PI * 2) * 0.5 + 0.5;
    const knots = fbm(u, v, 30, 3, seed + 6);
    const h = grain * 0.6 + knots * 0.4;
    const c = tint(base, 0.78 + h * 0.4);
    return { ...c, h };
  });
}

/** Woven cloth for the shemagh and villager robes. */
function cloth(size, seed, base = { r: 0.16, g: 0.13, b: 0.24 }) {
  return buildSurface(size, (u, v) => {
    const warp = Math.sin(u * size * 0.5 * Math.PI * 2) * 0.5 + 0.5;
    const weft = Math.sin(v * size * 0.5 * Math.PI * 2) * 0.5 + 0.5;
    const weave = (warp * 0.5 + weft * 0.5);
    const fuzz = fbm(u, v, 64, 2, seed);
    const h = weave * 0.7 + fuzz * 0.3;
    const c = tint(base, 0.82 + h * 0.3);
    return { ...c, h };
  });
}

/** Brushed, scuffed armour plate. */
function armour(size, seed, base = { r: 0.17, g: 0.15, b: 0.23 }) {
  return buildSurface(size, (u, v) => {
    const brush = fbm(u * 0.15, v * 4, 40, 3, seed);
    const scuff = Math.max(0, fbm(u, v, 18, 3, seed + 7) - 0.6) * 2;
    const h = brush * 0.6 + scuff * 0.4;
    const c = tint(base, 0.8 + h * 0.5 + scuff * 0.3);
    return { ...c, h };
  });
}

// ---------------------------------------------------------------- public
const RECIPES = {
  // `repeat` is in TILES PER METRE — world-space UVs are metres, so 0.5 means
  // one texture tile every two metres. The ground is the exception: it keeps
  // plane UVs spanning 260m, hence its much larger number.
  sand:     { fn: sand,     seed: 11, normal: 1.4, repeat: 34,   rough: 0.96, metal: 0.0 },
  mud:      { fn: mudBrick, seed: 23, normal: 2.6, repeat: 0.62, rough: 0.92, metal: 0.0 },
  concrete: { fn: concrete, seed: 37, normal: 2.0, repeat: 0.35, rough: 0.88, metal: 0.0 },
  rock:     { fn: rock,     seed: 51, normal: 2.8, repeat: 0.3,  rough: 0.94, metal: 0.0 },
  wood:     { fn: wood,     seed: 67, normal: 2.2, repeat: 0.8,  rough: 0.86, metal: 0.0 },
  cloth:    { fn: cloth,    seed: 83, normal: 1.2, repeat: 1.2,  rough: 0.95, metal: 0.0 },
  armour:   { fn: armour,   seed: 97, normal: 1.6, repeat: 2.0,  rough: 0.45, metal: 0.35 },
};

export const TEXTURE_SIZES = { low: 0, med: 256, high: 512 };

/**
 * Generate the shared texture set. Returns {} for the LOW preset, where
 * materials fall back to flat colours and nothing is uploaded to the GPU.
 */
export function generateTextures(quality = 'med') {
  const size = TEXTURE_SIZES[quality] ?? 256;
  if (!size || typeof document === 'undefined') return { size: 0, maps: {} };

  const maps = {};
  for (const [name, r] of Object.entries(RECIPES)) {
    const built = r.fn(size, r.seed);
    const normalMap = normalMapFromHeight(built.height, size, r.normal);
    built.map.repeat.set(r.repeat, r.repeat);
    normalMap.repeat.set(r.repeat, r.repeat);
    maps[name] = { map: built.map, normalMap, roughness: r.rough, metalness: r.metal, repeat: r.repeat };
  }
  return { size, maps };
}

let sharedSet = null;
let sharedQuality = null;

/**
 * The world and every character share one texture set — generating it twice
 * would double both the load hitch and the GPU memory.
 */
export function getSharedTextures(quality = 'med') {
  if (sharedSet && sharedQuality === quality) return sharedSet;
  if (sharedSet) disposeTextures(sharedSet);
  sharedSet = generateTextures(quality);
  sharedQuality = quality;
  return sharedSet;
}

export function clearSharedTextures() {
  if (sharedSet) disposeTextures(sharedSet);
  sharedSet = null; sharedQuality = null;
}

/** Free every GPU texture in a set. */
export function disposeTextures(set) {
  for (const m of Object.values(set.maps ?? {})) {
    m.map?.dispose();
    m.normalMap?.dispose();
  }
}

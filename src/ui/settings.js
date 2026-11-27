/**
 * Player preferences: one schema with defaults and ranges, so the settings
 * screen, the layout editor and the game all read the same clamped values.
 * Pure (storage is injected) and unit tested.
 */

export const SCHEMA = {
  // graphics
  quality: { def: 'med', options: ['low', 'med', 'high'] },
  fpsCap: { def: 60, options: [30, 60, 0] },          // 0 = as fast as the screen allows
  brightness: { def: 1, min: 0.7, max: 1.4, step: 0.05 },
  showFps: { def: false },
  camera: { def: 'tpp', options: ['tpp', 'fpp'] },    // third / first person
  // controls
  sensitivity: { def: 1, min: 0.3, max: 2.5, step: 0.05 },
  adsSensitivity: { def: 1, min: 0.3, max: 2, step: 0.05 },
  scopeSensitivity: { def: 1, min: 0.3, max: 2, step: 0.05 },
  assist: { def: true },
  autoPickup: { def: true },
  leftFire: { def: true },
  haptics: { def: true },
  // hud
  buttonSize: { def: 1, min: 0.75, max: 1.35, step: 0.05 },
  buttonOpacity: { def: 0.7, min: 0.25, max: 1, step: 0.05 },
  hudScale: { def: 1, min: 0.8, max: 1.25, step: 0.05 },
  damageNumbers: { def: true },
  layout: { def: {} },                                 // action -> { dx, dy, s }
  // audio
  volume: { def: 0.5, min: 0, max: 1, step: 0.05 },
};

/** Layout entries are bounded so a stray drag cannot push a button off screen for good. */
const LAYOUT_MAX = 600;
function cleanLayout(v) {
  const out = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, e] of Object.entries(v)) {
    if (!/^[a-z]{2,12}$/.test(k) || !e || typeof e !== 'object') continue;
    const n = (x, lo, hi, d) => (Number.isFinite(+x) ? Math.min(hi, Math.max(lo, +x)) : d);
    out[k] = { dx: Math.round(n(e.dx, -LAYOUT_MAX, LAYOUT_MAX, 0)), dy: Math.round(n(e.dy, -LAYOUT_MAX, LAYOUT_MAX, 0)), s: n(e.s, 0.6, 1.8, 1) };
  }
  return out;
}

/** Coerce one value to its schema: clamp ranges, snap to options, fall back to the default. */
export function cleanValue(key, v) {
  const f = SCHEMA[key];
  if (!f) return undefined;
  if (key === 'layout') return cleanLayout(v);
  if (f.options) return f.options.includes(v) ? v : f.def;
  if (typeof f.def === 'boolean') return typeof v === 'boolean' ? v : f.def;
  const x = Number(v);
  if (!Number.isFinite(x)) return f.def;
  return Math.min(f.max, Math.max(f.min, x));
}

export function defaults() {
  const d = {};
  for (const [k, f] of Object.entries(SCHEMA)) d[k] = typeof f.def === 'object' ? { ...f.def } : f.def;
  return d;
}

export class Settings {
  constructor(storage = null, key = 'saeed_prefs') {
    this.storage = storage;
    this.key = key;
    this.data = defaults();
    this._subs = [];
    try {
      const raw = storage?.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw);
        for (const k of Object.keys(SCHEMA)) if (k in saved) this.data[k] = cleanValue(k, saved[k]);
      }
    } catch { /* corrupt storage: defaults */ }
  }
  get(k) { return this.data[k]; }
  set(k, v) {
    const c = cleanValue(k, v);
    if (c === undefined) return false;
    this.data[k] = c;
    this.save();
    this._subs.forEach((fn) => fn(k, c));
    return true;
  }
  /** Move/resize one control in the layout editor. */
  setLayout(action, entry) {
    const next = { ...this.data.layout, [action]: { ...(this.data.layout[action] ?? { dx: 0, dy: 0, s: 1 }), ...entry } };
    return this.set('layout', next);
  }
  resetLayout() { return this.set('layout', {}); }
  resetAll() {
    this.data = defaults();
    this.save();
    for (const k of Object.keys(SCHEMA)) this._subs.forEach((fn) => fn(k, this.data[k]));
  }
  onChange(fn) { this._subs.push(fn); }
  save() {
    try { this.storage?.setItem(this.key, JSON.stringify(this.data)); } catch { /* private mode / quota */ }
  }
}

/** Frame pacing for the fps cap: should this rAF tick render? */
export function shouldRender(now, last, cap) {
  if (!cap) return true;
  return now - last >= 1000 / cap - 1.5;     // small slack: rAF ticks jitter around the interval
}

import { describe, it, expect } from 'vitest';
import { Settings, SCHEMA, cleanValue, defaults, shouldRender } from '../src/ui/settings.js';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };

describe('settings', () => {
  it('starts from defaults and every field has one', () => {
    const s = new Settings(memory());
    for (const k of Object.keys(SCHEMA)) expect(s.get(k)).toEqual(defaults()[k]);
    expect(s.get('autoPickup')).toBe(true);
    expect(s.get('fpsCap')).toBe(60);
  });

  it('clamps ranges, snaps options and rejects wrong types', () => {
    expect(cleanValue('sensitivity', 99)).toBe(SCHEMA.sensitivity.max);
    expect(cleanValue('buttonOpacity', -1)).toBe(SCHEMA.buttonOpacity.min);
    expect(cleanValue('quality', 'ultra')).toBe('med');
    expect(cleanValue('fpsCap', 0)).toBe(0);
    expect(cleanValue('fpsCap', 45)).toBe(60);
    expect(cleanValue('assist', 'yes')).toBe(true);
    expect(cleanValue('volume', 'loud')).toBe(SCHEMA.volume.def);
    expect(cleanValue('nope', 1)).toBeUndefined();
  });

  it('persists, reloads and keeps v3.0 prefs (sensitivity, quality, volume)', () => {
    const st = memory();
    st.setItem('saeed_prefs', JSON.stringify({ sensitivity: 1.6, quality: 'high', volume: 0.2, assist: false, junk: 5 }));
    const s = new Settings(st);
    expect(s.get('sensitivity')).toBe(1.6);
    expect(s.get('quality')).toBe('high');
    expect(s.get('assist')).toBe(false);
    s.set('camera', 'fpp');
    expect(new Settings(st).get('camera')).toBe('fpp');
  });

  it('survives corrupt storage', () => {
    const bad = { getItem: () => '{oops', setItem: () => { throw new Error('quota'); } };
    const s = new Settings(bad);
    expect(s.get('quality')).toBe('med');
    expect(() => s.set('volume', 0.3)).not.toThrow();
  });

  it('layout entries are bounded and resettable', () => {
    const s = new Settings(memory());
    s.setLayout('fire', { dx: 5000, dy: -20, s: 9 });
    expect(s.get('layout').fire).toEqual({ dx: 600, dy: -20, s: 1.8 });
    s.setLayout('fire', { dy: 40 });
    expect(s.get('layout').fire.dx).toBe(600);
    expect(s.get('layout').fire.dy).toBe(40);
    expect(cleanValue('layout', { '<script>': { dx: 1 } })).toEqual({});
    s.resetLayout();
    expect(s.get('layout')).toEqual({});
  });

  it('notifies listeners and resets everything', () => {
    const s = new Settings(memory());
    const seen = [];
    s.onChange((k, v) => seen.push([k, v]));
    s.set('brightness', 1.2);
    expect(seen).toContainEqual(['brightness', 1.2]);
    s.resetAll();
    expect(s.get('brightness')).toBe(1);
  });

  it('frame pacing renders every frame uncapped and every other frame at 30 on a 60 Hz screen', () => {
    expect(shouldRender(16, 0, 0)).toBe(true);
    let last = 0, drawn = 0;
    for (let t = 16.67; t < 1000; t += 16.67) if (shouldRender(t, last, 30)) { drawn++; last = t; }
    expect(drawn).toBeGreaterThan(27);
    expect(drawn).toBeLessThan(33);
  });
});

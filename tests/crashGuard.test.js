import { describe, it, expect } from 'vitest';
import { CrashGuard } from '../src/core/crashGuard.js';

const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

describe('CrashGuard', () => {
  it('reports a session cut off mid-match exactly once', () => {
    const s = store(); let t = 1000;
    new CrashGuard(s, () => t).markRunning();
    t += 60_000;
    const g = new CrashGuard(s, () => t);
    expect(g.consumeCrash()).toBe(true);
    expect(g.consumeCrash()).toBe(false);
  });
  it('does not report a clean exit or a stale flag', () => {
    const s = store(); let t = 1000;
    const g = new CrashGuard(s, () => t);
    g.markRunning(); g.markClean();
    expect(g.consumeCrash()).toBe(false);
    g.markRunning(); t += 2 * 24 * 3600 * 1000;
    expect(g.consumeCrash()).toBe(false);
  });
  it('keeps the last error, trimmed', () => {
    const g = new CrashGuard(store(), () => 5);
    g.recordError('x'.repeat(500), '2.2.1');
    expect(g.lastError()).toEqual({ msg: 'x'.repeat(300), at: 5, version: '2.2.1' });
  });
  it('survives blocked storage', () => {
    const bad = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); }, removeItem: () => { throw new Error('no'); } };
    const g = new CrashGuard(bad);
    expect(() => { g.markRunning(); g.markClean(); g.recordError('e'); }).not.toThrow();
    expect(g.consumeCrash()).toBe(false);
    expect(g.lastError()).toBeNull();
  });
});

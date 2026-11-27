/**
 * Detects a session that ended without a clean exit (the browser killed the
 * tab, usually for memory on a phone) and remembers the last script error.
 * Storage is injected so this is unit tested without a browser.
 */
const RUN_KEY = 'saeed_running_v1';
const ERR_KEY = 'saeed_last_error_v1';

export class CrashGuard {
  constructor(storage = null, now = () => Date.now()) {
    this.storage = storage;
    this.now = now;
  }
  _get(k) { try { return this.storage?.getItem(k) ?? null; } catch { return null; } }
  _set(k, v) { try { this.storage?.setItem(k, v); } catch { /* blocked or full */ } }
  _del(k) { try { this.storage?.removeItem(k); } catch { /* blocked */ } }

  /** Call while a match is being played. */
  markRunning() { this._set(RUN_KEY, String(this.now())); }
  /** Call on any orderly stop: menu, results, page hidden. */
  markClean() { this._del(RUN_KEY); }

  /**
   * True once if the previous session was cut off mid-match within the last
   * day; clears the flag so one crash triggers one recovery.
   */
  consumeCrash() {
    const v = Number(this._get(RUN_KEY));
    this._del(RUN_KEY);
    return Number.isFinite(v) && v > 0 && this.now() - v < 24 * 3600 * 1000;
  }

  recordError(message, version = '') {
    const msg = String(message ?? '').slice(0, 300);
    this._set(ERR_KEY, JSON.stringify({ msg, at: this.now(), version }));
  }
  lastError() {
    try { return JSON.parse(this._get(ERR_KEY) ?? 'null'); } catch { return null; }
  }
}

/**
 * All audio is synthesised with the WebAudio API — no sample files, so there is
 * nothing to download and no third-party licence to track (see LICENSES.md).
 */
export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.volume = 0.5;
  }
  /** Must be called from a user gesture on iOS/Android. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    } catch { this.enabled = false; }
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  _now() { return this.ctx.currentTime; }

  _noise(duration = 0.15) {
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }
  _env(gainVal, attack, decay) {
    const gnode = this.ctx.createGain();
    const t = this._now();
    gnode.gain.setValueAtTime(0.0001, t);
    gnode.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainVal), t + attack);
    gnode.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return gnode;
  }
  shot(weaponClass = 'rifle', distance = 0) {
    if (!this.enabled || !this.ctx) return;
    const atten = Math.max(0.08, 1 - distance / 90);
    const cfg = {
      rifle: { f: 180, decay: 0.13, gain: 0.35 },
      shotgun: { f: 110, decay: 0.26, gain: 0.5 },
      marksman: { f: 90, decay: 0.42, gain: 0.55 },
      melee: { f: 400, decay: 0.09, gain: 0.25 },
    }[weaponClass] ?? { f: 180, decay: 0.13, gain: 0.35 };

    const n = this._noise(cfg.decay + 0.05);
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(3200, this._now());
    filt.frequency.exponentialRampToValueAtTime(400, this._now() + cfg.decay);
    const g = this._env(cfg.gain * atten, 0.004, cfg.decay);
    n.connect(filt).connect(g).connect(this.master);
    n.start();

    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(cfg.f, this._now());
    osc.frequency.exponentialRampToValueAtTime(cfg.f * 0.4, this._now() + cfg.decay);
    const og = this._env(cfg.gain * 0.5 * atten, 0.003, cfg.decay);
    osc.connect(og).connect(this.master);
    osc.start();
    osc.stop(this._now() + cfg.decay + 0.08);
  }
  hit(flesh = false) {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = flesh ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(flesh ? 420 : 900, this._now());
    osc.frequency.exponentialRampToValueAtTime(flesh ? 160 : 300, this._now() + 0.09);
    const g = this._env(flesh ? 0.3 : 0.16, 0.002, 0.1);
    osc.connect(g).connect(this.master);
    osc.start(); osc.stop(this._now() + 0.16);
  }
  reload() { this._blip(320, 0.07, 'square', 0.16); setTimeout(() => this._blip(200, 0.09, 'square', 0.14), 180); }
  pickup() { this._blip(660, 0.09, 'sine', 0.2); setTimeout(() => this._blip(990, 0.1, 'sine', 0.18), 80); }
  heal() { this._blip(520, 0.2, 'sine', 0.2); setTimeout(() => this._blip(780, 0.25, 'sine', 0.18), 140); }
  hurt() { this._blip(150, 0.22, 'sawtooth', 0.22); }
  empty() { this._blip(1200, 0.04, 'square', 0.08); }
  zoneWarn() { this._blip(240, 0.4, 'triangle', 0.18); }
  victory() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._blip(f, 0.32, 'triangle', 0.24), i * 150)); }
  defeat() { [392, 330, 262].forEach((f, i) => setTimeout(() => this._blip(f, 0.45, 'sine', 0.24), i * 200)); }
  _blip(freq, dur, type = 'sine', gain = 0.2) {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = this._env(gain, 0.006, dur);
    osc.connect(g).connect(this.master);
    osc.start(); osc.stop(this._now() + dur + 0.06);
  }
}

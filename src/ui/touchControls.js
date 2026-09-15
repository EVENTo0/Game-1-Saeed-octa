/**
 * Touch layer: left half = floating virtual joystick, right half = look drag,
 * plus hit-tested action buttons. Multi-touch is tracked per pointer id so
 * moving, looking and firing can happen at the same time (two thumbs).
 */
const JOY_RADIUS = 62;      // px, visual + max stick travel
const LOOK_SENS = 0.0042;

export class TouchControls {
  constructor(root, input) {
    this.root = root;
    this.input = input;
    this.enabled = false;
    this.joyId = null;
    this.lookId = null;
    this.joyOrigin = { x: 0, y: 0 };
    this.lookLast = { x: 0, y: 0 };
    this.lookMoved = 0;
    this.buttonTouches = new Map();   // pointerId -> button element

    this.zone = root.querySelector('#joystick-zone');
    this.base = root.querySelector('#joystick-base');
    this.knob = root.querySelector('#joystick-knob');
    this.lookZone = root.querySelector('#look-zone');
    this.buttons = [...root.querySelectorAll('[data-action]')];

    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
  }
  attach() {
    const opts = { passive: false };
    this.root.addEventListener('pointerdown', this._onDown, opts);
    window.addEventListener('pointermove', this._onMove, opts);
    window.addEventListener('pointerup', this._onUp, opts);
    window.addEventListener('pointercancel', this._onUp, opts);
    return this;
  }
  dispose() {
    this.root.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
  }
  setEnabled(on) {
    this.enabled = on;
    this.root.classList.toggle('touch-active', on);
    if (!on) this._releaseAll();
  }
  _releaseAll() {
    this.joyId = null; this.lookId = null;
    this.input.touch.x = 0; this.input.touch.z = 0; this.input.touch.active = false;
    this.input.syncMove();
    this.buttonTouches.forEach((btn) => this._buttonUp(btn));
    this.buttonTouches.clear();
    if (this.base) this.base.style.opacity = '0';
    if (this.knob) this.knob.style.transform = 'translate(-50%, -50%)';
  }
  _buttonAt(target) {
    return target?.closest?.('[data-action]') ?? null;
  }
  _buttonDown(btn) {
    const s = this.input.state;
    btn.classList.add('pressed');
    switch (btn.dataset.action) {
      case 'fire': s.fire = true; break;
      case 'aim': s.aim = !s.aim; btn.classList.toggle('toggled', s.aim); break;
      case 'jump': s.jump = true; break;
      case 'crouch': s.crouch = !s.crouch; btn.classList.toggle('toggled', s.crouch); break;
      case 'reload': s.reload = true; break;
      case 'interact': s.interact = true; break;
      case 'swap': s.swap = true; break;
      case 'heal': s.use = true; break;
      case 'run': s.run = !s.run; btn.classList.toggle('toggled', s.run); break;
      default: break;
    }
  }
  _buttonUp(btn) {
    const s = this.input.state;
    btn.classList.remove('pressed');
    if (btn.dataset.action === 'fire') s.fire = false;
  }

  _onDown(e) {
    if (!this.enabled) return;
    const btn = this._buttonAt(e.target);
    if (btn) {
      e.preventDefault();
      this.buttonTouches.set(e.pointerId, btn);
      this._buttonDown(btn);
      return;
    }
    const inJoyZone = this.zone && this._inRect(this.zone, e.clientX, e.clientY);
    if (inJoyZone && this.joyId === null) {
      e.preventDefault();
      this.joyId = e.pointerId;
      this.joyOrigin = { x: e.clientX, y: e.clientY };
      this.input.touch.active = true;
      if (this.base) {
        this.base.style.opacity = '1';
        this.base.style.left = `${e.clientX}px`;
        this.base.style.top = `${e.clientY}px`;
      }
      this._moveJoy(e.clientX, e.clientY);
      return;
    }
    if (this.lookId === null) {
      e.preventDefault();
      this.lookId = e.pointerId;
      this.lookLast = { x: e.clientX, y: e.clientY };
      this.lookMoved = 0;
    }
  }
  _inRect(el, x, y) {
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }
  _moveJoy(x, y) {
    let dx = x - this.joyOrigin.x;
    let dy = y - this.joyOrigin.y;
    const d = Math.hypot(dx, dy);
    if (d > JOY_RADIUS) { dx = (dx / d) * JOY_RADIUS; dy = (dy / d) * JOY_RADIUS; }
    if (this.knob) this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this.input.touch.x = dx / JOY_RADIUS;
    this.input.touch.z = -dy / JOY_RADIUS;         // up on screen = forward
    // full-tilt stick sprints, like most mobile shooters
    this.input.state.run = Math.hypot(dx, dy) > JOY_RADIUS * 0.82;
    this.input.syncMove();
  }
  _onMove(e) {
    if (!this.enabled) return;
    if (e.pointerId === this.joyId) { e.preventDefault(); this._moveJoy(e.clientX, e.clientY); return; }
    if (e.pointerId === this.lookId) {
      e.preventDefault();
      const dx = e.clientX - this.lookLast.x;
      const dy = e.clientY - this.lookLast.y;
      this.lookLast = { x: e.clientX, y: e.clientY };
      this.lookMoved += Math.hypot(dx, dy);
      this.input.state.lookDX += dx * LOOK_SENS * this.input.sensitivity;
      this.input.state.lookDY += dy * LOOK_SENS * this.input.sensitivity;
    }
  }
  _onUp(e) {
    const btn = this.buttonTouches.get(e.pointerId);
    if (btn) { this._buttonUp(btn); this.buttonTouches.delete(e.pointerId); return; }
    if (e.pointerId === this.joyId) {
      this.joyId = null;
      this.input.touch.x = 0; this.input.touch.z = 0; this.input.touch.active = false;
      this.input.state.run = false;
      this.input.syncMove();
      if (this.base) this.base.style.opacity = '0';
      if (this.knob) this.knob.style.transform = 'translate(-50%, -50%)';
      return;
    }
    if (e.pointerId === this.lookId) this.lookId = null;
  }
}

export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  return ('ontouchstart' in window) || (navigator.maxTouchPoints ?? 0) > 0;
}

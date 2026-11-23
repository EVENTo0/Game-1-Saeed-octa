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
    // Fire-and-look: dragging the thumb off the fire button keeps aiming, as
    // in PUBG Mobile and CoD Mobile, so one thumb can shoot and track.
    this.fireLook = null;             // { id, x, y }

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
    // Listen on the whole document. The HUD is click-through (pointer-events:
    // none) so a real finger on open screen lands on the canvas, never on the
    // HUD element itself; a listener on the HUD only ever saw synthetic events.
    document.addEventListener('pointerdown', this._onDown, { passive: false, capture: true });
    window.addEventListener('pointermove', this._onMove, opts);
    window.addEventListener('pointerup', this._onUp, opts);
    window.addEventListener('pointercancel', this._onUp, opts);
    return this;
  }
  dispose() {
    document.removeEventListener('pointerdown', this._onDown, { capture: true });
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
    this.joyId = null; this.lookId = null; this.fireLook = null;
    this.input.touch.x = 0; this.input.touch.z = 0; this.input.touch.active = false;
    this.input.syncMove();
    this.buttonTouches.forEach((btn) => this._buttonUp(btn));
    this.buttonTouches.clear();
    if (this.base) { this.base.style.opacity = ''; this.base.style.left = ''; this.base.style.top = ''; }   // back to its faint home spot
    if (this.knob) this.knob.style.transform = 'translate(-50%, -50%)';
  }
  _buttonAt(target) {
    return target?.closest?.('[data-action]') ?? null;
  }
  _buttonDown(btn) {
    const s = this.input.state;
    btn.classList.add('pressed');
    switch (btn.dataset.action) {
      case 'fire': case 'firel': s.fire = true; break;
      case 'aim': s.aim = !s.aim; btn.classList.toggle('toggled', s.aim); break;
      case 'jump': s.jump = true; break;
      case 'crouch': s.crouch = !s.crouch; btn.classList.toggle('toggled', s.crouch); break;
      case 'reload': s.reload = true; break;
      case 'interact': s.interact = true; break;
      case 'swap': s.swap = true; break;
      case 'heal': s.use = true; break;
      case 'run': s.run = !s.run; btn.classList.toggle('toggled', s.run); break;
      case 'grenade': s.grenade = true; break;
      default: break;
    }
  }
  _buttonUp(btn) {
    const s = this.input.state;
    btn.classList.remove('pressed');
    if (btn.dataset.action === 'fire' || btn.dataset.action === 'firel') s.fire = false;
    if (btn.dataset.action === 'grenade') s.grenade = false;
  }

  _onDown(e) {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse') return;          // a mouse is InputManager's job
    const btn = this._buttonAt(e.target);
    if (btn) {
      e.preventDefault();
      this.buttonTouches.set(e.pointerId, btn);
      this._buttonDown(btn);
      // fire and grenade both keep aiming while the thumb drags off the button
      if (['fire', 'firel', 'grenade'].includes(btn.dataset.action)) this.fireLook = { id: e.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    // other controls (pause, menus) keep their own taps
    if (e.target?.closest?.('button, a, input, select, label')) return;
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
      this._addLook(dx, dy);
    } else if (this.fireLook && e.pointerId === this.fireLook.id) {
      e.preventDefault();
      const dx = e.clientX - this.fireLook.x, dy = e.clientY - this.fireLook.y;
      this.fireLook.x = e.clientX; this.fireLook.y = e.clientY;
      this._addLook(dx, dy);
    }
  }
  /**
   * Touch look with a gentle response curve: slow drags stay precise for
   * aiming, fast flicks turn quickly, and aiming down sights slows it further.
   */
  _addLook(dx, dy) {
    const speed = Math.hypot(dx, dy);
    const accel = 1 + Math.min(1.2, Math.max(0, speed - 6) * 0.045);
    const ads = (this.input.state.aim ? 0.55 : 1) * (this.input.lookScale ?? 1);
    const k = LOOK_SENS * this.input.sensitivity * accel * ads;
    this.input.state.lookDX += dx * k;
    this.input.state.lookDY += dy * k * 0.85;
  }
  _onUp(e) {
    const btn = this.buttonTouches.get(e.pointerId);
    if (this.fireLook && e.pointerId === this.fireLook.id) this.fireLook = null;
    if (btn) { this._buttonUp(btn); this.buttonTouches.delete(e.pointerId); return; }
    if (e.pointerId === this.joyId) {
      this.joyId = null;
      this.input.touch.x = 0; this.input.touch.z = 0; this.input.touch.active = false;
      this.input.state.run = false;
      this.input.syncMove();
      if (this.base) { this.base.style.opacity = ''; this.base.style.left = ''; this.base.style.top = ''; }   // back to its faint home spot
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

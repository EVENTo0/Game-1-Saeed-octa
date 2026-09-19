import { clamp } from '../core/mathx.js';

/**
 * One input state, two producers (keyboard/mouse and touch), so gameplay never
 * branches on device type. Edge-triggered actions are latched and consumed once
 * per frame by the game loop.
 */
export function createInputState() {
  return {
    moveX: 0, moveZ: 0,
    lookDX: 0, lookDY: 0,
    run: false, aim: false, crouch: false, fire: false,
    jump: false, reload: false, interact: false, swap: false, use: false, weapon: 0,
  };
}

export class InputManager {
  constructor(state = createInputState()) {
    this.state = state;
    this.keyboard = { x: 0, z: 0 };
    this.touch = { x: 0, z: 0, active: false };
    this.sensitivity = 1.0;
    this.enabled = false;
    this._bound = [];
  }
  /** Merge keyboard + touch sticks, clamped to the unit disc. */
  syncMove() {
    const x = clamp(this.keyboard.x + this.touch.x, -1, 1);
    const z = clamp(this.keyboard.z + this.touch.z, -1, 1);
    const m = Math.hypot(x, z);
    if (m > 1) { this.state.moveX = x / m; this.state.moveZ = z / m; }
    else { this.state.moveX = x; this.state.moveZ = z; }
  }
  /** Read-and-clear the per-frame deltas and one-shot buttons. */
  consume() {
    const s = this.state;
    const out = {
      moveX: s.moveX, moveZ: s.moveZ,
      lookDX: s.lookDX, lookDY: s.lookDY,
      run: s.run, aim: s.aim, crouch: s.crouch, fire: s.fire,
      jump: s.jump, reload: s.reload, interact: s.interact, swap: s.swap,
      use: s.use, weapon: s.weapon,
    };
    s.lookDX = 0; s.lookDY = 0;
    s.jump = false; s.reload = false; s.interact = false; s.swap = false;
    s.use = false; s.weapon = 0;
    return out;
  }
  reset() {
    const s = this.state;
    Object.assign(s, createInputState());
    this.keyboard = { x: 0, z: 0 };
    this.touch = { x: 0, z: 0, active: false };
  }

  // ---------------- keyboard / mouse ----------------
  attachKeyboard(target = window, canvas = null) {
    const keys = new Set();
    const applyAxes = () => {
      this.keyboard.x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      this.keyboard.z = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      this.syncMove();
    };
    const down = (e) => {
      if (!this.enabled) return;
      if (e.repeat) { return; }
      keys.add(e.code);
      const s = this.state;
      switch (e.code) {
        case 'Space': s.jump = true; e.preventDefault(); break;
        case 'KeyR': s.reload = true; break;
        case 'KeyE': s.interact = true; break;
        case 'KeyQ': s.swap = true; break;
        case 'KeyF': s.use = true; break;
        case 'KeyH': s.use = true; break;
        case 'Digit1': s.weapon = 1; break;
        case 'Digit2': s.weapon = 2; break;
        case 'KeyC': s.crouch = !s.crouch; break;
        case 'ShiftLeft': case 'ShiftRight': s.run = true; break;
        default: break;
      }
      applyAxes();
    };
    const up = (e) => {
      keys.delete(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.state.run = false;
      applyAxes();
    };
    const blur = () => { keys.clear(); this.state.run = false; applyAxes(); };
    target.addEventListener('keydown', down);
    target.addEventListener('keyup', up);
    target.addEventListener('blur', blur);
    this._bound.push(() => {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      target.removeEventListener('blur', blur);
    });

    if (canvas) this.attachMouse(canvas);
    return this;
  }
  attachMouse(canvas) {
    const s = this.state;
    let dragActive = false;
    let lastX = 0, lastY = 0;

    const onMove = (e) => {
      if (!this.enabled) return;
      if (document.pointerLockElement === canvas) {
        s.lookDX += (e.movementX || 0) * 0.0022 * this.sensitivity;
        s.lookDY += (e.movementY || 0) * 0.0022 * this.sensitivity;
      } else if (dragActive) {
        // Fallback drag-to-look when pointer lock is unavailable or pending
        s.lookDX += (e.clientX - lastX) * 0.0022 * this.sensitivity;
        s.lookDY += (e.clientY - lastY) * 0.0022 * this.sensitivity;
        lastX = e.clientX;
        lastY = e.clientY;
      }
    };
    const onDown = (e) => {
      if (!this.enabled) return;
      dragActive = true;
      lastX = e.clientX;
      lastY = e.clientY;
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
      if (e.button === 0) s.fire = true;
      if (e.button === 2) s.aim = true;
    };
    const onUp = (e) => {
      dragActive = false;
      if (e.button === 0) s.fire = false;
      if (e.button === 2) s.aim = false;
    };
    const onCtx = (e) => e.preventDefault();
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('contextmenu', onCtx);
    this._bound.push(() => {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('contextmenu', onCtx);
    });
    return this;
  }
  dispose() { this._bound.forEach((f) => f()); this._bound = []; }
}

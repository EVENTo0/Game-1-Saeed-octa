/**
 * Animation state machine.
 *
 * `Animator` is an INTERFACE: gameplay only ever calls `play(state)` and
 * `update(dt, ctx)`. `ProceduralAnimator` below fakes the clips by rotating rig
 * groups. A future `GltfAnimator` can implement the same two methods on top of
 * THREE.AnimationMixer without any gameplay change.
 */
export const AnimState = {
  IDLE: 'Idle', WALK: 'Walk', RUN: 'Run', JUMP: 'Jump', CROUCH: 'Crouch',
  AIM: 'Aim', FIRE: 'Fire', RELOAD: 'Reload', HIT: 'Hit', DEATH: 'Death',
  VICTORY: 'Victory',
};

/** One-shot states cannot be interrupted until their duration elapses. */
const ONE_SHOT = { [AnimState.FIRE]: 0.12, [AnimState.HIT]: 0.25, [AnimState.RELOAD]: 0 };

export class ProceduralAnimator {
  constructor(rig) {
    this.rig = rig;
    this.state = AnimState.IDLE;
    this.prev = AnimState.IDLE;
    this.time = 0;
    this.oneShot = 0;
    this.blend = 0;
    this.recoil = 0;
    this.deathT = 0;
  }
  play(state, duration = null) {
    if (state === this.state) return false;
    if (this.oneShot > 0 && state !== AnimState.DEATH) return false;
    if (this.state === AnimState.DEATH && state !== AnimState.IDLE) return false;
    this.prev = this.state;
    this.state = state;
    this.time = 0;
    const d = duration ?? ONE_SHOT[state];
    this.oneShot = d ?? 0;
    if (state === AnimState.FIRE) this.recoil = 1;
    return true;
  }
  /** Explicitly clear a long one-shot (reload finished early, revive, restart). */
  release() { this.oneShot = 0; }

  update(dt, ctx = {}) {
    this.time += dt;
    if (this.oneShot > 0) {
      this.oneShot = Math.max(0, this.oneShot - dt);
      if (this.oneShot === 0) this.state = ctx.fallback ?? AnimState.IDLE;
    }
    this.recoil = Math.max(0, this.recoil - dt * 6);
    const r = this.rig;
    if (!r?.hips) return;

    const speed = ctx.speed ?? 0;
    const st = this.state;
    const dead = st === AnimState.DEATH;
    if (dead) this.deathT = Math.min(1, this.deathT + dt * 2.6);
    else this.deathT = Math.max(0, this.deathT - dt * 4);

    // --- locomotion cycle ---
    const cycleSpeed = Math.min(speed, 8) * 1.5;
    const phase = this.time * cycleSpeed;
    const stride = Math.min(1, speed / 6) * (st === AnimState.CROUCH ? 0.45 : 1);
    const swing = Math.sin(phase) * 0.75 * stride;
    const swing2 = Math.sin(phase + Math.PI) * 0.75 * stride;

    r.legL.rotation.x = swing;
    r.legR.rotation.x = swing2;
    r.hips.position.y = 0.92 - (st === AnimState.CROUCH ? 0.34 : 0) + Math.abs(Math.sin(phase)) * 0.045 * stride;
    r.spine.rotation.x = (st === AnimState.CROUCH ? 0.34 : 0) + Math.min(speed / 40, 0.16);

    const aiming = st === AnimState.AIM || st === AnimState.FIRE || ctx.aiming;
    const pitch = ctx.pitch ?? 0;
    if (aiming) {
      r.armR.rotation.x = -1.42 - pitch + this.recoil * 0.35;
      r.armL.rotation.x = -1.28 - pitch;
      r.armL.rotation.z = 0.32;
      r.armR.rotation.z = -0.12;
      r.spine.rotation.y = 0.12;
    } else if (st === AnimState.RELOAD) {
      const k = Math.sin(this.time * 7);
      r.armR.rotation.x = -0.9 + k * 0.25;
      r.armL.rotation.x = -1.5 + k * 0.5;
      r.armL.rotation.z = 0.5;
      r.armR.rotation.z = 0;
      r.spine.rotation.y = 0.05;
    } else if (st === AnimState.VICTORY) {
      const k = Math.sin(this.time * 4);
      r.armR.rotation.x = -2.5 + k * 0.3;
      r.armL.rotation.x = -2.5 - k * 0.3;
      r.armL.rotation.z = 0.2; r.armR.rotation.z = -0.2;
      r.hips.position.y = 0.92 + Math.abs(k) * 0.12;
    } else if (ctx.armed) {
      // low-ready carry: the weapon has to be visible in third person, or the
      // player cannot tell what they are holding
      r.armR.rotation.x = -1.05 + swing2 * 0.12;
      r.armL.rotation.x = -1.2 + swing * 0.1;
      r.armL.rotation.z = 0.38;
      r.armR.rotation.z = -0.1;
      r.spine.rotation.y = 0.1;
    } else {
      r.armR.rotation.x = swing2 * 0.8 - 0.12;
      r.armL.rotation.x = swing * 0.8 - 0.12;
      r.armL.rotation.z = 0.08; r.armR.rotation.z = -0.08;
      r.spine.rotation.y = 0;
    }
    if (st === AnimState.JUMP) {
      r.legL.rotation.x = -0.5; r.legR.rotation.x = 0.3;
      r.armL.rotation.x = -1.2; r.armR.rotation.x = -1.0;
    }
    if (st === AnimState.HIT) {
      r.spine.rotation.x += 0.25;
      r.spine.rotation.y = Math.sin(this.time * 30) * 0.12;
    }
    // death ragdoll-lite: fall forward and sink
    r.hips.rotation.x = this.deathT * -1.45;
    r.hips.position.y -= this.deathT * 0.55;
    r.head.rotation.x = dead ? 0 : -pitch * 0.4;
  }
}

/** Decide which animation state an actor should be in, from gameplay flags. */
export function resolveState(a) {
  if (!a.alive) return AnimState.DEATH;
  if (a.victory) return AnimState.VICTORY;
  if (a.reloading) return AnimState.RELOAD;
  if (a.firing) return AnimState.FIRE;
  if (!a.grounded) return AnimState.JUMP;
  if (a.crouching) return AnimState.CROUCH;
  if (a.aiming) return AnimState.AIM;
  if (a.speed > 5.2) return AnimState.RUN;
  if (a.speed > 0.4) return AnimState.WALK;
  return AnimState.IDLE;
}

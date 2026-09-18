import { segmentBlocked } from '../world/collision.js';
import { clamp } from '../core/mathx.js';

/**
 * Touch aim assist.
 *
 * Dragging a thumb across glass cannot track a moving target the way a mouse
 * can, so every mobile shooter bends the aim a little. This is deliberately the
 * gentle kind: it only pulls when the crosshair is ALREADY close to a target
 * (within a narrow cone), it pulls harder the closer you are rather than
 * snapping, and it never acquires a target you cannot see.
 *
 * Pure function — no three.js, no DOM — so the behaviour is unit tested.
 *
 * @returns {{dYaw:number, dPitch:number, targetId:?string}} rotation to add
 */
export function computeAimAssist(view, targets, colliders, cfg, dt) {
  const none = { dYaw: 0, dPitch: 0, targetId: null };
  if (!cfg.enabled || dt <= 0) return none;

  const eye = view.eye;
  const forward = view.forward;
  const strengthScale = view.aiming ? 1 : cfg.hipFireScale;
  if (strengthScale <= 0) return none;

  let best = null, bestAngle = cfg.cone;
  for (const t of targets) {
    if (!t.alive) continue;
    const dx = t.center.x - eye.x, dy = t.center.y - eye.y, dz = t.center.z - eye.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 1e-3 || dist > cfg.range) continue;
    const nx = dx / dist, ny = dy / dist, nz = dz / dist;
    const dot = clamp(forward.x * nx + forward.y * ny + forward.z * nz, -1, 1);
    const angle = Math.acos(dot);
    if (angle >= bestAngle) continue;
    if (colliders && segmentBlocked(eye.x, eye.z, eye.y, t.center.x, t.center.z, t.center.y, colliders)) continue;
    bestAngle = angle;
    best = { t, nx, ny, nz, angle };
  }
  if (!best) return none;

  // Where the view would have to point to be exactly on target. Matches the
  // engine's convention: at yaw 0 / pitch 0 the player looks down -Z.
  const wantYaw = Math.atan2(-best.nx, -best.nz);
  const wantPitch = Math.asin(clamp(best.ny, -1, 1));

  let dYaw = wantYaw - view.yaw;
  while (dYaw > Math.PI) dYaw -= Math.PI * 2;
  while (dYaw < -Math.PI) dYaw += Math.PI * 2;
  const dPitch = wantPitch - view.pitch;

  // Closer to on-target => stronger pull. Never a full snap.
  const closeness = 1 - best.angle / cfg.cone;
  const k = clamp(cfg.rate * closeness * strengthScale * dt, 0, cfg.maxPerFrame);
  return { dYaw: dYaw * k, dPitch: dPitch * k, targetId: best.t.id };
}

/** Convenience: build the `view` argument from a Player. */
export function viewFromPlayer(player) {
  return {
    eye: { x: player.pos.x, y: player.eyeY, z: player.pos.z },
    forward: player.aimDir(),
    yaw: player.yaw,
    pitch: player.pitch,
    aiming: player.aiming,
  };
}

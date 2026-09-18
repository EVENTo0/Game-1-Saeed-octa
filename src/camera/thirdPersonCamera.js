import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { raycastBoxes, pointInsideBoxes } from '../world/collision.js';
import { damp } from '../core/mathx.js';

/**
 * Over-the-shoulder chase camera. Pulls in when geometry would clip, which is
 * the single biggest "feels broken" issue in third-person mobile shooters.
 */
export class ThirdPersonCamera {
  constructor(aspect = 16 / 9) {
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, aspect, 0.15, 600);
    this.distance = CONFIG.camera.distance;
    this.currentDist = this.distance;
    this.shake = 0;
    this._target = new THREE.Vector3();
  }
  addShake(amount) { this.shake = Math.min(1, this.shake + amount); }

  update(dt, player, colliders) {
    const C = CONFIG.camera;
    const aiming = player.aiming;
    const wantDist = aiming ? C.aimDistance : C.distance;
    const wantFov = aiming ? C.aimFov : C.fov;
    this.distance = damp(this.distance, wantDist, 10, dt);
    this.camera.fov = damp(this.camera.fov, wantFov, 10, dt);
    this.camera.updateProjectionMatrix();

    const focusY = player.pos.y + player.height * (player.crouching ? 1.05 : 0.95);
    const shoulder = aiming ? C.shoulder : C.shoulder * 0.55;
    const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
    // right vector for the shoulder offset
    const rx = cos, rz = -sin;
    const focus = this._target.set(
      player.pos.x + rx * shoulder,
      focusY,
      player.pos.z + rz * shoulder,
    );

    const cp = Math.cos(player.pitch);
    const back = {
      x: Math.sin(player.yaw) * cp,
      y: -Math.sin(player.pitch),
      z: Math.cos(player.yaw) * cp,
    };
    const len = Math.hypot(back.x, back.y, back.z) || 1;
    back.x /= len; back.y /= len; back.z /= len;

    // pull the camera in if a wall is in the way
    const hit = raycastBoxes(focus, back, colliders, this.distance + C.collisionPad);
    let dist = this.distance;
    if (hit.hit) dist = Math.max(0.9, hit.distance - C.collisionPad);
    this.currentDist = damp(this.currentDist, dist, dist < this.currentDist ? 40 : 9, dt);

    let px = focus.x + back.x * this.currentDist;
    let py = focus.y + back.y * this.currentDist;
    let pz = focus.z + back.z * this.currentDist;

    // A single wall-ray is not enough indoors (corners, doorways, the focus
    // point itself inside geometry). If the camera still ends up inside a
    // solid, walk it back toward the player until it is clear.
    let guard = 0;
    while (guard++ < 6 && pointInsideBoxes({ x: px, y: py, z: pz }, colliders)) {
      this.currentDist *= 0.55;
      if (this.currentDist < 0.25) { this.currentDist = 0.25; }
      px = focus.x + back.x * this.currentDist;
      py = focus.y + back.y * this.currentDist;
      pz = focus.z + back.z * this.currentDist;
      if (this.currentDist <= 0.25) break;
    }
    if (py < 0.45) py = 0.45;

    if (this.shake > 0) {
      const s = this.shake * 0.22;
      px += (Math.random() - 0.5) * s;
      py += (Math.random() - 0.5) * s;
      pz += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 3.2);
    }
    this.camera.position.set(px, py, pz);
    this.camera.lookAt(focus.x, focus.y + 0.25, focus.z);
  }
  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}

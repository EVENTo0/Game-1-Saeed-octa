import * as THREE from 'three';

/**
 * Pooled combat VFX: muzzle flashes, tracers, impact sparks, damage popups.
 * Pooling matters here — a shotgun burst spawns 7 tracers per trigger pull and
 * allocating those per shot causes GC hitches on phones.
 */
const POOL = { tracer: 48, impact: 32, flash: 8 };

export class EffectsSystem {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;

    this.tracerGeo = new THREE.BoxGeometry(0.035, 0.035, 1);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
    this.tracers = [];
    for (let i = 0; i < POOL.tracer; i++) {
      const m = new THREE.Mesh(this.tracerGeo, this.tracerMat);
      m.visible = false; m.frustumCulled = false;
      scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }

    this.impactGeo = new THREE.SphereGeometry(0.11, 6, 4);
    this.impactMat = new THREE.MeshBasicMaterial({ color: 0xffc069, transparent: true });
    this.bloodMat = new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true });
    this.impacts = [];
    for (let i = 0; i < POOL.impact; i++) {
      const m = new THREE.Mesh(this.impactGeo, this.impactMat);
      m.visible = false;
      scene.add(m);
      this.impacts.push({ mesh: m, life: 0 });
    }

    this.flashGeo = new THREE.SphereGeometry(0.16, 6, 5);
    this.flashMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true });
    this.flashes = [];
    for (let i = 0; i < POOL.flash; i++) {
      const m = new THREE.Mesh(this.flashGeo, this.flashMat);
      m.visible = false;
      scene.add(m);
      this.flashes.push({ mesh: m, life: 0 });
    }

    // grenade / vehicle blasts: an additive fireball and a smoke shell, pooled
    this.blastGeo = new THREE.SphereGeometry(1, 14, 10);
    this.fireMat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.smokeMat = new THREE.MeshLambertMaterial({ color: 0x4a3c30, emissive: 0x2a1c10, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
    this.blasts = [];
    for (let i = 0; i < 3; i++) {
      const fire = new THREE.Mesh(this.blastGeo, this.fireMat.clone());
      const smoke = new THREE.Mesh(this.blastGeo, this.smokeMat.clone());
      fire.visible = smoke.visible = false;
      scene.add(fire, smoke);
      this.blasts.push({ fire, smoke, life: 0, r: 1 });
    }
  }
  /** A grenade or vehicle going off: fireball, smoke and a ring of sparks. */
  explosion(point, radius = 6) {
    const e = this.blasts.find((b) => b.life <= 0) ?? this.blasts[0];
    e.fire.position.set(point.x, point.y + 0.4, point.z);
    e.smoke.position.set(point.x, point.y + 0.8, point.z);
    e.fire.visible = e.smoke.visible = true;
    e.life = 1.4; e.r = radius;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.impact({ x: point.x + Math.cos(a) * radius * 0.35, y: point.y + 0.3 + Math.random() * 1.2, z: point.z + Math.sin(a) * radius * 0.35 }, false);
    }
  }
  _take(arr) {
    for (const e of arr) if (e.life <= 0) return e;
    return arr[0];
  }
  tracer(from, to) {
    const e = this._take(this.tracers);
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len = Math.max(0.2, Math.hypot(dx, dy, dz));
    e.mesh.position.set(from.x + dx / 2, from.y + dy / 2, from.z + dz / 2);
    e.mesh.scale.set(1, 1, len);
    e.mesh.lookAt(to.x, to.y, to.z);
    e.mesh.visible = true;
    e.life = 0.06;
  }
  impact(point, isFlesh = false) {
    const e = this._take(this.impacts);
    e.mesh.position.set(point.x, point.y, point.z);
    e.mesh.material = isFlesh ? this.bloodMat : this.impactMat;
    e.mesh.scale.setScalar(isFlesh ? 1.5 : 1);
    e.mesh.visible = true;
    e.life = 0.22;
  }
  muzzleFlash(worldPos, scale = 1) {
    const e = this._take(this.flashes);
    e.mesh.position.copy(worldPos);
    e.mesh.scale.setScalar(scale * (0.8 + Math.random() * 0.5));
    e.mesh.visible = true;
    e.life = 0.06;
  }
  update(dt) {
    for (const group of [this.tracers, this.impacts, this.flashes]) {
      for (const e of group) {
        if (e.life <= 0) continue;
        e.life -= dt;
        if (e.life <= 0) { e.mesh.visible = false; continue; }
      }
    }
    for (const e of this.impacts) {
      if (e.life > 0) e.mesh.scale.multiplyScalar(1 + dt * 3);
    }
    for (const e of this.blasts) {
      if (e.life <= 0) continue;
      e.life -= dt;
      const k = 1 - Math.max(0, e.life) / 1.4;             // 0 -> 1 over the blast
      const fk = Math.min(1, k * 6);
      e.fire.scale.setScalar(e.r * (0.25 + 0.5 * fk));
      e.fire.material.opacity = Math.max(0, 1 - k * 3.2);
      e.smoke.scale.setScalar(e.r * (0.3 + 0.7 * Math.sqrt(k)));
      e.smoke.position.y += dt * 1.4;
      e.smoke.material.opacity = 0.85 * (1 - k * k);
      if (e.life <= 0) e.fire.visible = e.smoke.visible = false;
    }
  }
  dispose() {
    [...this.tracers, ...this.impacts, ...this.flashes].forEach((e) => this.scene.remove(e.mesh));
    this.tracerGeo.dispose(); this.tracerMat.dispose();
    this.impactGeo.dispose(); this.impactMat.dispose(); this.bloodMat.dispose();
    this.flashGeo.dispose(); this.flashMat.dispose();
    for (const b of this.blasts) { this.scene.remove(b.fire, b.smoke); b.fire.material.dispose(); b.smoke.material.dispose(); }
    this.blastGeo.dispose(); this.fireMat.dispose(); this.smokeMat.dispose();
  }
}

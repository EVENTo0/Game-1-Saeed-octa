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
  }
  dispose() {
    [...this.tracers, ...this.impacts, ...this.flashes].forEach((e) => this.scene.remove(e.mesh));
    this.tracerGeo.dispose(); this.tracerMat.dispose();
    this.impactGeo.dispose(); this.impactMat.dispose(); this.bloodMat.dispose();
    this.flashGeo.dispose(); this.flashMat.dispose();
  }
}

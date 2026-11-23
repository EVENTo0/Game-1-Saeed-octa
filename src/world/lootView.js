import * as THREE from 'three';
import { WEAPONS } from '../weapons/weapons.js';

// Weapons are coloured by rarity so value reads at a glance, as in every modern BR.
const COLORS = {
  weapon_common: 0xb8c2d6, weapon_rare: 0x8a6bff, weapon_epic: 0xf2c14e,
  ammo: 0xe08a3c, medkit: 0x3fd68a, armor: 0x4aa8ff,
  grenade: 0x9bbf4a, dallah: 0xffcc33,
};
const keyFor = (it) => (it.type === 'weapon' ? `weapon_${WEAPONS[it.weaponId]?.rarity ?? 'common'}` : it.type);
const isBeamed = (it) => it.special || it.type === 'dallah' || keyFor(it) === 'weapon_epic';
const MAX_PER_KEY = 128;

/**
 * Loot pickups drawn as instanced meshes: one crate batch and one halo batch
 * per colour, whatever the item count. The 520 m map carries ~100 items and
 * drawing them one by one cost more draw calls than the whole world.
 */
export class LootView {
  constructor(scene) {
    this.scene = scene;
    this.geo = new THREE.BoxGeometry(0.42, 0.42, 0.42);
    this.haloGeo = new THREE.RingGeometry(0.42, 0.52, 14).rotateX(-Math.PI / 2);
    // open-ended, additive light pillar: visible from across the map
    this.beamGeo = new THREE.CylinderGeometry(0.16, 0.34, 14, 10, 1, true);
    this.beamGeo.translate(0, 7, 0);
    this.group = new THREE.Group();
    scene.add(this.group);
    this.batches = {};
    for (const [k, c] of Object.entries(COLORS)) {
      const mat = new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.35 });
      const haloMat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
      const beamMat = new THREE.MeshBasicMaterial({
        color: c, transparent: true, opacity: 0.32, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      });
      const boxes = new THREE.InstancedMesh(this.geo, mat, MAX_PER_KEY);
      const halos = new THREE.InstancedMesh(this.haloGeo, haloMat, MAX_PER_KEY);
      boxes.castShadow = true;
      boxes.count = 0; halos.count = 0;
      boxes.frustumCulled = false; halos.frustumCulled = false;   // instances span the map
      this.group.add(boxes, halos);
      this.batches[k] = { boxes, halos, mat, haloMat, beamMat, items: [] };
    }
    this.beams = new Map();          // item id -> beam mesh (few: epic + supply drop)
    this.items = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  sync(items) {
    this.items = items;
    for (const b of Object.values(this.batches)) b.items.length = 0;
    for (const it of items) {
      if (it.taken) {
        const beam = this.beams.get(it.id);
        if (beam) beam.visible = false;
        continue;
      }
      const b = this.batches[keyFor(it)];
      if (b && b.items.length < MAX_PER_KEY) b.items.push(it);
      if (isBeamed(it) && !this.beams.has(it.id)) {
        const beam = new THREE.Mesh(this.beamGeo, this.batches[keyFor(it)].beamMat);
        beam.position.set(it.x, it.y ?? 0, it.z);
        this.group.add(beam);
        this.beams.set(it.id, beam);
      }
    }
  }

  /** Loot beyond `range` is hidden (beamed loot carries three times as far). */
  update(dt, t, viewer = null, range = 55) {
    const m = this._m, q = this._q, sc = this._s, p = this._p;
    for (const b of Object.values(this.batches)) {
      let n = 0;
      for (const it of b.items) {
        const far = viewer && Math.hypot(it.x - viewer.x, it.z - viewer.z) > (isBeamed(it) ? range * 3 : range);
        if (far) continue;
        const y = it.y ?? 0;
        q.setFromAxisAngle(this._up, t * 1.4 + it.x);
        p.set(it.x, y + 0.45 + Math.sin(t * 2.4 + it.x) * 0.09, it.z);
        sc.set(1, 1, 1);
        m.compose(p, q, sc);
        b.boxes.setMatrixAt(n, m);
        q.identity();
        p.set(it.x, y + 0.06, it.z);
        m.compose(p, q, sc);
        b.halos.setMatrixAt(n, m);
        n++;
      }
      b.boxes.count = n; b.halos.count = n;
      b.boxes.visible = n > 0; b.halos.visible = n > 0;
      b.boxes.instanceMatrix.needsUpdate = true;
      b.halos.instanceMatrix.needsUpdate = true;
    }
    if (viewer) {
      for (const [id, beam] of this.beams) {
        const it = this.items.find((i) => i.id === id);
        beam.visible = !!it && !it.taken && Math.hypot(beam.position.x - viewer.x, beam.position.z - viewer.z) < range * 3;
      }
    }
  }

  clear() {
    for (const b of Object.values(this.batches)) { b.items.length = 0; b.boxes.count = 0; b.halos.count = 0; }
    for (const beam of this.beams.values()) this.group.remove(beam);
    this.beams.clear();
  }

  dispose() {
    this.clear();
    this.scene.remove(this.group);
    this.geo.dispose(); this.haloGeo.dispose(); this.beamGeo.dispose();
    for (const b of Object.values(this.batches)) {
      b.boxes.dispose(); b.halos.dispose();
      b.mat.dispose(); b.haloMat.dispose(); b.beamMat.dispose();
    }
  }
}

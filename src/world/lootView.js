import * as THREE from 'three';
import { WEAPONS } from '../weapons/weapons.js';

// Weapons are coloured by rarity so value reads at a glance, as in every modern BR.
const COLORS = {
  weapon_common: 0xb8c2d6, weapon_rare: 0x8a6bff, weapon_epic: 0xf2c14e,
  ammo: 0xe08a3c, medkit: 0x3fd68a, armor: 0x4aa8ff,
};
const keyFor = (it) => (it.type === 'weapon' ? `weapon_${WEAPONS[it.weaponId]?.rarity ?? 'common'}` : it.type);
const isBeamed = (it) => it.special || keyFor(it) === 'weapon_epic';

/** Instanced-free but shared-geometry loot pickups: a glowing crate + halo. */
export class LootView {
  constructor(scene) {
    this.scene = scene;
    this.geo = new THREE.BoxGeometry(0.42, 0.42, 0.42);
    this.haloGeo = new THREE.RingGeometry(0.42, 0.52, 14);
    // open-ended, additive light pillar: visible from across the map
    this.beamGeo = new THREE.CylinderGeometry(0.16, 0.34, 14, 10, 1, true);
    this.beamGeo.translate(0, 7, 0);
    this.mats = Object.fromEntries(Object.entries(COLORS).map(([k, c]) =>
      [k, new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.35 })]));
    this.haloMats = Object.fromEntries(Object.entries(COLORS).map(([k, c]) =>
      [k, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.45, side: THREE.DoubleSide })]));
    this.beamMats = Object.fromEntries(Object.entries(COLORS).map(([k, c]) =>
      [k, new THREE.MeshBasicMaterial({
        color: c, transparent: true, opacity: 0.32, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      })]));
    this.group = new THREE.Group();
    scene.add(this.group);
    this.entries = new Map();
  }
  sync(items) {
    for (const it of items) {
      let e = this.entries.get(it.id);
      if (!e) {
        const g = new THREE.Group();
        const key = keyFor(it);
        const box = new THREE.Mesh(this.geo, this.mats[key]);
        box.position.y = 0.45;
        box.castShadow = true;
        const halo = new THREE.Mesh(this.haloGeo, this.haloMats[key]);
        halo.rotation.x = -Math.PI / 2;
        halo.position.y = 0.06;
        g.add(box); g.add(halo);
        const beamed = isBeamed(it);
        if (beamed) g.add(new THREE.Mesh(this.beamGeo, this.beamMats[key]));
        g.position.set(it.x, it.y ?? 0, it.z);
        this.group.add(g);
        e = { group: g, box, beamed };
        this.entries.set(it.id, e);
      }
      e.taken = it.taken;
      if (it.taken) e.group.visible = false;
    }
  }
  /** Loot beyond `range` is hidden: it is a few pixels tall and costs two
   *  draw calls each, which is real money on a phone. */
  update(dt, t, viewer = null, range = 55) {
    for (const [id, e] of this.entries) {
      if (e.taken) continue;
      if (viewer) {
        const d = Math.hypot(e.group.position.x - viewer.x, e.group.position.z - viewer.z);
        e.group.visible = d < (e.beamed ? range * 3 : range);
      }
      if (!e.group.visible) continue;
      e.box.rotation.y += dt * 1.4;
      e.box.position.y = 0.45 + Math.sin(t * 2.4 + e.group.position.x) * 0.09;
    }
  }
  clear() {
    for (const e of this.entries.values()) this.group.remove(e.group);
    this.entries.clear();
  }
  dispose() {
    this.clear();
    this.scene.remove(this.group);
    this.geo.dispose(); this.haloGeo.dispose(); this.beamGeo.dispose();
    Object.values(this.beamMats).forEach((m) => m.dispose());
    Object.values(this.mats).forEach((m) => m.dispose());
    Object.values(this.haloMats).forEach((m) => m.dispose());
  }
}

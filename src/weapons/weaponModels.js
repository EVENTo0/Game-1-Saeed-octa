import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WEAPONS } from './weapons.js';

const shared = { geos: [], mats: [] };
const keep = (x, list) => { list.push(x); return x; };

// Shared PBR materials: gunmetal, polymer and per-weapon accent.
let base = null;
function baseMats() {
  if (base) return base;
  base = {
    metal: keep(new THREE.MeshStandardMaterial({ color: 0x2a2c33, roughness: 0.38, metalness: 0.75 }), shared.mats),
    polymer: keep(new THREE.MeshStandardMaterial({ color: 0x17161c, roughness: 0.82, metalness: 0.05 }), shared.mats),
    glass: keep(new THREE.MeshStandardMaterial({ color: 0x3fd0ff, roughness: 0.1, metalness: 0.2, emissive: 0x0a3a55, emissiveIntensity: 0.8 }), shared.mats),
  };
  return base;
}
const accents = new Map();
function accentMat(c) {
  if (!accents.has(c)) accents.set(c, keep(new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.35 }), shared.mats));
  return accents.get(c);
}

/**
 * Original weapon silhouettes built from primitives: receiver, rail,
 * handguard, magazine, grip, stock, optics. Parts merge to one mesh per
 * material, so a weapon costs three or four draw calls however detailed.
 * Modelled pointing down +Z.
 */
export function buildWeaponModel(id) {
  const def = WEAPONS[id];
  const root = new THREE.Group();
  const { metal, polymer, glass } = baseMats();
  const accent = accentMat(def.color);
  const box = (w, h, d, x, y, z, mat, rx = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z); mesh.rotation.x = rx;
    root.add(mesh); return mesh;
  };
  const tube = (r, len, x, y, z, mat, seg = 10) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
    mesh.rotation.x = Math.PI / 2; mesh.position.set(x, y, z);
    root.add(mesh); return mesh;
  };
  const scope = (len, r, z) => {
    tube(r, len, 0, 0.1, z, metal, 12);
    tube(r * 1.25, 0.07, 0, 0.1, z + len / 2, metal, 12);
    tube(r * 1.25, 0.07, 0, 0.1, z - len / 2, metal, 12);
    tube(r * 0.9, 0.01, 0, 0.1, z + len / 2 + 0.036, glass, 12);
    box(0.03, 0.05, 0.03, 0, 0.06, z - len * 0.25, metal);
    box(0.03, 0.05, 0.03, 0, 0.06, z + len * 0.25, metal);
  };
  let muzzleZ = 0.7;
  switch (def.class) {
    case 'rifle':
      box(0.07, 0.1, 0.36, 0, 0, 0.06, metal);              // receiver
      box(0.075, 0.09, 0.3, 0, 0.005, 0.38, accent);        // handguard
      box(0.03, 0.02, 0.6, 0, 0.06, 0.2, polymer);          // top rail
      tube(0.016, 0.24, 0, 0.01, 0.62, metal);              // barrel
      tube(0.026, 0.06, 0, 0.01, 0.76, metal);              // muzzle brake
      box(0.055, 0.17, 0.08, 0, -0.12, 0.13, polymer, 0.22); // curved-look mag
      box(0.045, 0.12, 0.06, 0, -0.1, -0.04, polymer, -0.35); // grip
      box(0.06, 0.09, 0.24, 0, -0.01, -0.24, polymer);      // stock
      box(0.04, 0.05, 0.08, 0, 0.1, 0.12, metal);           // red-dot housing
      box(0.03, 0.03, 0.005, 0, 0.11, 0.161, glass);
      muzzleZ = 0.8;
      break;
    case 'smg':
      box(0.07, 0.11, 0.3, 0, 0, 0.04, accent);
      box(0.03, 0.02, 0.32, 0, 0.065, 0.06, polymer);
      tube(0.018, 0.16, 0, 0.01, 0.27, metal);
      tube(0.03, 0.12, 0, 0.01, 0.38, polymer);             // suppressor
      box(0.05, 0.2, 0.05, 0, -0.14, 0.08, polymer);        // straight mag
      box(0.045, 0.11, 0.05, 0, -0.09, -0.06, polymer, -0.3);
      box(0.03, 0.03, 0.2, 0, -0.01, -0.2, metal);          // folding stock bar
      box(0.05, 0.07, 0.03, 0, -0.01, -0.31, polymer);
      muzzleZ = 0.45;
      break;
    case 'shotgun':
      box(0.08, 0.11, 0.34, 0, 0, 0.04, metal);
      tube(0.024, 0.42, 0, 0.025, 0.4, metal);              // barrel
      tube(0.022, 0.36, 0, -0.03, 0.38, polymer);           // tube magazine
      box(0.085, 0.07, 0.17, 0, -0.03, 0.3, accent);        // pump
      box(0.05, 0.11, 0.06, 0, -0.1, -0.06, polymer, -0.35);
      box(0.065, 0.1, 0.26, 0, -0.03, -0.26, polymer);
      muzzleZ = 0.62;
      break;
    case 'dmr':
      box(0.07, 0.1, 0.4, 0, 0, 0.1, metal);
      box(0.075, 0.085, 0.34, 0, 0.005, 0.46, accent);
      tube(0.016, 0.3, 0, 0.01, 0.76, metal);
      tube(0.028, 0.07, 0, 0.01, 0.93, metal);
      box(0.055, 0.12, 0.08, 0, -0.1, 0.16, polymer);       // short box mag
      box(0.045, 0.12, 0.06, 0, -0.1, -0.02, polymer, -0.35);
      box(0.06, 0.1, 0.28, 0, -0.01, -0.26, accent);
      scope(0.26, 0.026, 0.14);
      muzzleZ = 0.98;
      break;
    case 'marksman':
      box(0.07, 0.1, 0.42, 0, 0, 0.12, metal);
      tube(0.02, 0.62, 0, 0.01, 0.62, metal);               // long barrel
      tube(0.032, 0.09, 0, 0.01, 0.97, metal);
      box(0.06, 0.13, 0.08, 0, -0.1, 0.14, polymer);
      box(0.045, 0.12, 0.06, 0, -0.1, -0.03, polymer, -0.35);
      box(0.065, 0.12, 0.3, 0, -0.02, -0.28, accent);       // thumbhole stock
      box(0.02, 0.1, 0.02, 0.025, -0.08, 0.72, metal, 0.5); // bipod legs
      box(0.02, 0.1, 0.02, -0.025, -0.08, 0.72, metal, 0.5);
      scope(0.34, 0.032, 0.16);
      muzzleZ = 1.03;
      break;
    default: // melee
      box(0.025, 0.07, 0.56, 0, 0, 0.32, accent);
      box(0.01, 0.075, 0.5, 0, 0.01, 0.34, metal);
      box(0.12, 0.03, 0.04, 0, 0, 0.03, metal);             // guard
      box(0.04, 0.05, 0.14, 0, 0, -0.06, polymer);
      muzzleZ = 0.62;
      break;
  }
  const byMat = new Map();
  const parts = root.children.filter((c) => c.isMesh);
  for (const mesh of parts) {
    if (!byMat.has(mesh.material)) byMat.set(mesh.material, []);
    mesh.updateMatrix();
    const geo = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone());
    geo.applyMatrix4(mesh.matrix);
    byMat.get(mesh.material).push(geo);
    mesh.geometry.dispose();
  }
  parts.forEach((mesh) => root.remove(mesh));
  for (const [material, geos] of byMat) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    geos.forEach((x) => { if (x !== merged) x.dispose(); });
    if (merged) { keep(merged, shared.geos); const mm = new THREE.Mesh(merged, material); mm.castShadow = true; root.add(mm); }
  }

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, muzzleZ);
  root.add(muzzle);
  root.userData.muzzle = muzzle;
  root.rotation.set(0, 0.12, 0);
  root.position.set(0.02, 0, 0.06);
  return { root, muzzle };
}

export function disposeWeaponModels() {
  shared.geos.forEach((x) => x.dispose());
  shared.mats.forEach((x) => x.dispose());
  shared.geos.length = 0; shared.mats.length = 0;
  base = null; accents.clear();
}

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WEAPONS } from './weapons.js';

const shared = { geos: [], mats: [] };
const g = (geo) => { shared.geos.push(geo); return geo; };
const m = (mat) => { shared.mats.push(mat); return mat; };

const bodyMat = () => m(new THREE.MeshLambertMaterial({ color: 0x1b1a22 }));
const accentMat = (c) => m(new THREE.MeshLambertMaterial({ color: c }));

/** Original silhouettes — blocky, readable at phone size, ~40 tris each. */
export function buildWeaponModel(id) {
  const def = WEAPONS[id];
  const root = new THREE.Group();
  const body = bodyMat();
  const accent = accentMat(def.color);
  const box = (w, h, d, x, y, z, mat) => {
    const mesh = new THREE.Mesh(g(new THREE.BoxGeometry(w, h, d)), mat);
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  };
  switch (def.class) {
    case 'rifle':
      box(0.07, 0.11, 0.62, 0, 0, 0.16, body);
      box(0.05, 0.05, 0.42, 0, 0.02, 0.5, accent);          // barrel
      box(0.06, 0.16, 0.1, 0, -0.12, 0.08, body);           // mag
      box(0.06, 0.09, 0.2, 0, -0.02, -0.2, body);           // stock
      box(0.045, 0.05, 0.05, 0, 0.09, 0.1, accent);         // sight
      break;
    case 'shotgun':
      box(0.09, 0.12, 0.5, 0, 0, 0.14, body);
      box(0.07, 0.07, 0.4, 0, 0.01, 0.44, accent);
      box(0.08, 0.06, 0.16, 0, -0.06, 0.28, accent);        // pump
      box(0.07, 0.1, 0.22, 0, -0.03, -0.18, body);
      break;
    case 'marksman':
      box(0.06, 0.1, 0.8, 0, 0, 0.24, body);
      box(0.04, 0.04, 0.6, 0, 0.01, 0.78, accent);
      box(0.05, 0.06, 0.24, 0, 0.11, 0.22, accent);         // scope
      box(0.06, 0.13, 0.08, 0, -0.1, 0.1, body);
      box(0.06, 0.1, 0.26, 0, -0.02, -0.22, body);
      break;
    default: // melee
      box(0.03, 0.06, 0.62, 0, 0, 0.3, accent);
      box(0.07, 0.07, 0.12, 0, 0, -0.04, body);
      break;
  }
  // Collapse the parts into one mesh per material — six weapons are on screen
  // at once (Saeed plus five bots) and each one was costing four draw calls.
  const byMat = new Map();
  const parts = root.children.filter((c) => c.isMesh);
  for (const m of parts) {
    if (!byMat.has(m.material)) byMat.set(m.material, []);
    m.updateMatrix();
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone());
    g.applyMatrix4(m.matrix);
    byMat.get(m.material).push(g);
  }
  parts.forEach((m) => root.remove(m));
  for (const [material, geos] of byMat) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    geos.forEach((g) => { if (g !== merged) g.dispose(); });
    if (merged) root.add(new THREE.Mesh(merged, material));
  }

  // Muzzle marker so effects know where the barrel ends.
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, def.class === 'marksman' ? 1.06 : def.class === 'rifle' ? 0.72 : 0.64);
  root.add(muzzle);
  root.userData.muzzle = muzzle;
  // Held pointing forward out of the hand socket, tilted slightly inward so the
  // barrel clears the fist and stays readable from the chase camera.
  root.rotation.set(0, 0.12, 0);
  root.position.set(0.02, 0, 0.06);
  return { root, muzzle };
}

export function disposeWeaponModels() {
  shared.geos.forEach((x) => x.dispose());
  shared.mats.forEach((x) => x.dispose());
  shared.geos.length = 0; shared.mats.length = 0;
}

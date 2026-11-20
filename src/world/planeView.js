import * as THREE from 'three';

/** Cargo plane in EVENTO colours: fuselage, wings, tail, four engines. */
export function buildPlane() {
  const root = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0xd9d4e6, roughness: 0.45, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x5b3fd4, roughness: 0.5, metalness: 0.3 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xe8bd47, roughness: 0.4, metalness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1e1a2a, roughness: 0.6 });
  const mats = [body, accent, gold, dark];
  const geos = [];
  const mesh = (geo, mat, x, y, z) => { geos.push(geo); const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); root.add(m); return m; };
  // fuselage along +Z
  const fus = mesh(new THREE.CylinderGeometry(2.2, 2.2, 26, 16), body, 0, 0, 0); fus.rotation.x = Math.PI / 2;
  const nose = mesh(new THREE.SphereGeometry(2.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), body, 0, 0, 13); nose.rotation.x = Math.PI / 2;
  const tailCone = mesh(new THREE.ConeGeometry(2.2, 7, 16), body, 0, 0.6, -16.5); tailCone.rotation.x = -Math.PI / 2;
  mesh(new THREE.BoxGeometry(34, 0.5, 5), body, 0, 0.8, 1);              // wings
  mesh(new THREE.BoxGeometry(34.2, 0.55, 0.8), accent, 0, 0.8, -1.2);   // wing stripe
  mesh(new THREE.BoxGeometry(11, 0.35, 3), body, 0, 1.2, -17);           // tailplane
  mesh(new THREE.BoxGeometry(0.4, 6, 4), accent, 0, 3.6, -17.5);         // fin
  mesh(new THREE.BoxGeometry(0.45, 1.2, 2.2), gold, 0, 5.2, -17.6);
  mesh(new THREE.BoxGeometry(4.5, 0.6, 26.2), accent, 0, -0.4, 0).position.y = 1.9; // roof stripe
  for (const x of [-11, -6, 6, 11]) {
    const e = mesh(new THREE.CylinderGeometry(0.75, 0.85, 3.2, 12), dark, x, 0.1, 2.6); e.rotation.x = Math.PI / 2;
    const r = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.25, 12), gold, x, 0.1, 4.3); r.rotation.x = Math.PI / 2;
  }
  // cockpit windows
  mesh(new THREE.BoxGeometry(2.6, 0.7, 0.2), dark, 0, 1.1, 14.2);
  root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return {
    root,
    dispose() { geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); },
  };
}

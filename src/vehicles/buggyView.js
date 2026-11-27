import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Procedural dune buggy: tube roll cage, purple body panels with the OCTA gold
 * trim, fat sand tyres. Merged into four meshes (paint, metal, rubber, lights)
 * plus two steerable front wheels, so six buggies cost ~36 draw calls at most
 * and far ones are culled.
 */
const shared = {};
function mats() {
  if (shared.paint) return shared;
  shared.paint = new THREE.MeshStandardMaterial({ color: 0x5b3bc4, roughness: 0.42, metalness: 0.35 });
  shared.gold = new THREE.MeshStandardMaterial({ color: 0xe8bd47, roughness: 0.35, metalness: 0.7 });
  shared.metal = new THREE.MeshStandardMaterial({ color: 0x2b2a31, roughness: 0.5, metalness: 0.8 });
  shared.rubber = new THREE.MeshStandardMaterial({ color: 0x1d1b20, roughness: 0.92, metalness: 0 });
  shared.light = new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xffe9a0, emissiveIntensity: 1.4 });
  shared.wreck = new THREE.MeshStandardMaterial({ color: 0x222020, roughness: 0.95, metalness: 0.2 });
  return shared;
}

function tube(a, b, r = 0.045) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  const g = new THREE.CylinderGeometry(r, r, len, 6);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
  m.compose(new THREE.Vector3(a[0] + dx / 2, a[1] + dy / 2, a[2] + dz / 2), q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}
function boxAt(w, h, d, x, y, z, rx = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return g;
}
function wheelGeo() {
  const tyre = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 14);
  tyre.rotateZ(Math.PI / 2);
  return tyre;
}
function hubGeo() {
  const hub = new THREE.CylinderGeometry(0.2, 0.2, 0.36, 8);
  hub.rotateZ(Math.PI / 2);
  return hub;
}

export function buildBuggy() {
  const M = mats();
  const root = new THREE.Group();
  const body = new THREE.Group();          // everything that tilts with the suspension
  root.add(body);
  const owned = [];
  const add = (geos, mat, parent = body) => {
    const g = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    geos.forEach((x) => { if (x !== g) x.dispose(); });
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = true;
    parent.add(mesh);
    owned.push(g);
    return mesh;
  };

  // forward is -Z, like the player
  add([
    boxAt(1.5, 0.14, 2.9, 0, 0.55, 0),                     // floor pan
    boxAt(1.3, 0.34, 0.9, 0, 0.78, -1.2, -0.25),           // nose
    boxAt(1.55, 0.26, 0.7, 0, 0.82, 1.25),                 // engine deck
    boxAt(0.14, 0.32, 1.7, 0.78, 0.72, 0.05),              // side pods
    boxAt(0.14, 0.32, 1.7, -0.78, 0.72, 0.05),
  ], M.paint);
  add([
    boxAt(1.32, 0.05, 0.12, 0, 0.97, -1.0),                // gold trim
    boxAt(0.16, 0.06, 1.72, 0.79, 0.9, 0.05),
    boxAt(0.16, 0.06, 1.72, -0.79, 0.9, 0.05),
  ], M.gold);
  const cage = [];
  for (const s of [1, -1]) {
    cage.push(tube([0.62 * s, 0.6, -0.55], [0.5 * s, 1.75, -0.1]));     // A-pillar
    cage.push(tube([0.5 * s, 1.75, -0.1], [0.5 * s, 1.75, 0.65]));      // roof rail
    cage.push(tube([0.5 * s, 1.75, 0.65], [0.65 * s, 0.6, 1.0]));       // rear hoop
    cage.push(tube([0.72 * s, 0.6, 1.0], [0.72 * s, 0.8, 1.55]));       // rear arm
  }
  cage.push(tube([0.5, 1.75, -0.1], [-0.5, 1.75, -0.1]));
  cage.push(tube([0.5, 1.75, 0.65], [-0.5, 1.75, 0.65]));
  cage.push(tube([0.62, 0.62, -1.62], [-0.62, 0.62, -1.62], 0.06));    // bull bar
  cage.push(boxAt(0.5, 0.5, 0.12, -0.32, 1.0, 0.45, 0.2));            // seats
  cage.push(boxAt(0.5, 0.5, 0.12, 0.32, 1.0, 0.45, 0.2));
  cage.push(boxAt(0.5, 0.1, 0.5, -0.32, 0.72, 0.25));
  cage.push(boxAt(0.5, 0.1, 0.5, 0.32, 0.72, 0.25));
  const sw = new THREE.TorusGeometry(0.16, 0.025, 6, 14);              // steering wheel
  sw.rotateX(-0.9); sw.translate(-0.32, 1.12, -0.25);
  cage.push(sw);
  const spare = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12);     // spare tyre on the deck
  spare.translate(0, 1.08, 1.3);
  add(cage, M.metal);
  add([spare], M.rubber);
  add([boxAt(0.2, 0.12, 0.06, 0.45, 0.82, -1.64), boxAt(0.2, 0.12, 0.06, -0.45, 0.82, -1.64)], M.light);

  // wheels: rear ones merged into the body; the front pair steers
  const rear = [wheelGeo(), wheelGeo()];
  rear[0].translate(0.92, 0.42, 1.05); rear[1].translate(-0.92, 0.42, 1.05);
  add(rear, M.rubber, root);
  const front = [];
  for (const s of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.92 * s, 0.42, -1.1);
    root.add(pivot);
    add([wheelGeo()], M.rubber, pivot);
    add([hubGeo()], M.gold, pivot);
    front.push(pivot);
  }

  let wrecked = false;
  const original = new Map();
  root.traverse((o) => { if (o.isMesh) original.set(o, o.material); });
  return {
    root,
    /** Steer the front wheels, bounce the body with speed, blacken when destroyed. */
    update(b, t) {
      root.position.set(b.pos.x, b.pos.y, b.pos.z);
      root.rotation.y = b.yaw;
      for (const f of front) f.rotation.y = b.steerAngle;
      const sp = Math.abs(b.speed);
      body.position.y = Math.sin(t * 18 + b.pos.x) * Math.min(0.04, sp * 0.003);
      body.rotation.x = Math.max(-0.06, Math.min(0.06, -b.accelPitch || 0));
      if (b.destroyed && !wrecked) {
        wrecked = true;
        root.traverse((o) => { if (o.isMesh) o.material = M.wreck; });
      } else if (!b.destroyed && wrecked) {
        wrecked = false;          // a new match: original paint back
        root.traverse((o) => { if (o.isMesh) o.material = original.get(o); });
      }
    },
    dispose() { owned.forEach((g) => g.dispose()); },
  };
}

/** Frag grenade in the hand and in flight: olive body, gold lever. */
export function buildGrenadeMesh() {
  const M = mats();
  const g = new THREE.Group();
  const bodyGeo = new THREE.SphereGeometry(0.09, 10, 8);
  bodyGeo.scale(1, 1.2, 1);
  const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0x55633a, roughness: 0.7 }));
  const capGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.06, 8);
  capGeo.translate(0, 0.12, 0);
  const cap = new THREE.Mesh(capGeo, M.gold);
  body.castShadow = true;
  g.add(body, cap);
  return { root: g, dispose() { bodyGeo.dispose(); capGeo.dispose(); body.material.dispose(); } };
}

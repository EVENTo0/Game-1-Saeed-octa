import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getSharedTextures } from './textures.js';

/**
 * Turns the pure map data into geometry. Everything shares a handful of
 * materials and merges into as few draw calls as InstancedMesh allows, which is
 * what keeps this at 60fps on a mid-range phone.
 */
const C = {
  sand: 0xd9b382,
  sandDark: 0xc09a6b,
  mud: 0xc2a179,
  mudDark: 0x9c7d59,
  concrete: 0x8d8b84,
  tent: 0x6d5a44,
  rock: 0x9a8a78,
  wood: 0x7a5533,
  water: 0x2b8fa8,
  palmTrunk: 0x6b4a2f,
  palmLeaf: 0x3f7a3a,
  roof: 0xb08f66,
};

export function buildWorld(map, { quality = 'med' } = {}) {
  const group = new THREE.Group();
  const disposables = [];
  const textures = getSharedTextures(quality);
  const T = textures.maps;

  /**
   * Physically based material. Falls back to a plain colour on the LOW preset,
   * where no textures are generated at all.
   */
  const M = (color, surface, opts = {}) => {
    const t = surface ? T[surface] : null;
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: t ? t.roughness : (opts.roughness ?? 0.9),
      metalness: t ? t.metalness : (opts.metalness ?? 0.0),
      map: t ? t.map : null,
      normalMap: t ? t.normalMap : null,
      normalScale: t ? new THREE.Vector2(opts.normalScale ?? 1, opts.normalScale ?? 1) : undefined,
      ...opts.material,
    });
    disposables.push(m);
    return m;
  };

  const matMud = M(C.mud, 'mud'), matMudDark = M(C.mudDark, 'mud');
  const matConcrete = M(C.concrete, 'concrete');
  const matTent = M(C.tent, 'cloth'), matRock = M(C.rock, 'rock');
  const matWood = M(C.wood, 'wood');
  const matRoof = M(C.roof, 'mud');

  // ---------- ground ----------
  // A displaced plane, not a flat one: gentle dunes give the sun something to
  // rake across, which is most of what sells "desert" at a distance.
  const SEG = quality === 'low' ? 24 : 64;
  const groundGeo = new THREE.PlaneGeometry(260, 260, SEG, SEG);
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const d = Math.hypot(x, y);
    // keep the playable middle flat so dunes never fight the collision boxes
    const falloff = Math.min(1, Math.max(0, (d - 95) / 45));
    const dune = Math.sin(x * 0.035) * Math.cos(y * 0.028) * 3.2
      + Math.sin(x * 0.011 + y * 0.013) * 5.0;
    pos.setZ(i, dune * falloff);
  }
  groundGeo.computeVertexNormals();
  const matSand = M(C.sand, 'sand', { normalScale: 0.8 });
  const ground = new THREE.Mesh(groundGeo, matSand);
  ground.userData.worldUV = false;          // plane UVs already tile correctly
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  disposables.push(groundGeo);

  // darker, coarser sand under the village to break up the expanse
  const patchGeo = new THREE.CircleGeometry(46, 24);
  const matSandDark = M(C.sandDark, 'sand', { normalScale: 0.6 });
  const patch = new THREE.Mesh(patchGeo, matSandDark);
  patch.userData.worldUV = false;
  patch.rotation.x = -Math.PI / 2;
  patch.position.set(-30, 0.02, -40);
  patch.receiveShadow = true;
  group.add(patch);
  disposables.push(patchGeo);

  // ---------- buildings ----------
  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  disposables.push(wallGeo);
  const styleMat = { mud: matMud, concrete: matConcrete, tent: matTent };

  for (const c of map.colliders) {
    if (c.tag !== 'wall') continue;
    const m = new THREE.Mesh(wallGeo, matMud);
    m.position.set(c.x, (c.top + c.bottom) / 2, c.z);
    m.scale.set(c.hw * 2, c.top - c.bottom, c.hd * 2);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  // roofs (flat, Arabic-village style) with a parapet lip
  for (const b of map.buildings) {
    const roof = new THREE.Mesh(wallGeo, b.style === 'tent' ? matTent : matRoof);
    roof.position.set(b.x, b.h + 0.12, b.z);
    roof.scale.set(b.w + 0.5, 0.24, b.d + 0.5);
    roof.castShadow = true; roof.receiveShadow = true;
    group.add(roof);
    if (b.style === 'mud') {
      const trim = new THREE.Mesh(wallGeo, matMudDark);
      trim.position.set(b.x, b.h * 0.55, b.z);
      trim.scale.set(b.w + 0.12, 0.18, b.d + 0.12);
      group.add(trim);
    }
  }

  // ---------- props ----------
  const palmTrunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 5.2, 6);
  const palmLeafGeo = new THREE.ConeGeometry(1.5, 0.6, 5);
  const crateGeo = new THREE.BoxGeometry(1, 1, 1);
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const matPalmT = M(C.palmTrunk, 'wood', { normalScale: 0.7 });
  const matPalmL = M(C.palmLeaf, null, { roughness: 0.78 });
  disposables.push(palmTrunkGeo, palmLeafGeo, crateGeo, rockGeo);

  const addPalm = (p) => {
    const g = new THREE.Group();
    const t = new THREE.Mesh(palmTrunkGeo, matPalmT);
    t.position.y = 2.6; t.rotation.z = Math.sin(p.rot) * 0.06; t.castShadow = true;
    g.add(t);
    for (let i = 0; i < 5; i++) {
      const l = new THREE.Mesh(palmLeafGeo, matPalmL);
      l.position.set(0, 5.1, 0);
      l.rotation.set(0.8, (i / 5) * Math.PI * 2 + p.rot, 0);
      l.scale.setScalar(0.9);
      g.add(l);
    }
    g.position.set(p.x, 0, p.z);
    g.scale.setScalar(p.scale);
    group.add(g);
  };

  for (const p of map.props) {
    switch (p.kind) {
      case 'palm': addPalm(p); break;
      case 'crate': {
        const m = new THREE.Mesh(crateGeo, matWood);
        m.position.set(p.x, 0.6, p.z);
        m.scale.set(2.6, 1.2, 2.6);
        m.rotation.y = p.rot; m.castShadow = true; m.receiveShadow = true;
        group.add(m); break;
      }
      case 'rock': {
        const m = new THREE.Mesh(rockGeo, matRock);
        m.position.set(p.x, 0.7, p.z);
        m.scale.set(1.7, 1.1, 1.6);
        m.rotation.set(0.2, p.rot, 0.1); m.castShadow = true;
        group.add(m); break;
      }
      case 'rock-tier': {
        const m = new THREE.Mesh(wallGeo, p.i === 2 ? matRock : matMudDark);
        m.position.set(p.x, p.h / 2, p.z);
        m.scale.set(p.w, p.h, p.d);
        m.castShadow = true; m.receiveShadow = true;
        group.add(m); break;
      }
      case 'well': {
        const g = new THREE.Group();
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 1.1, 10), matMudDark);
        ring.position.y = 0.55; ring.castShadow = true;
        g.add(ring);
        const post = new THREE.Mesh(wallGeo, matWood);
        post.position.set(0, 1.6, 0); post.scale.set(0.16, 2.2, 0.16);
        g.add(post);
        g.position.set(p.x, 0, p.z);
        group.add(g); break;
      }
      case 'barrier': {
        const m = new THREE.Mesh(wallGeo, matConcrete);
        m.position.set(p.x, 0.65, p.z);
        m.scale.set(4.0, 1.3, 0.6);
        m.castShadow = true; m.receiveShadow = true;
        group.add(m); break;
      }
      case 'tower': {
        const g = new THREE.Group();
        const legs = new THREE.Mesh(wallGeo, matWood);
        legs.position.y = 2.5; legs.scale.set(3.4, 5.0, 3.4);
        legs.castShadow = true;
        g.add(legs);
        const deck = new THREE.Mesh(wallGeo, matConcrete);
        deck.position.y = 5.3; deck.scale.set(4.4, 0.3, 4.4);
        g.add(deck);
        g.position.set(p.x, 0, p.z);
        group.add(g); break;
      }
      case 'water': {
        const wg = new THREE.CircleGeometry(p.scale, 28);
        const wm = new THREE.MeshStandardMaterial({
          color: C.water, transparent: true, opacity: 0.82,
          roughness: 0.08, metalness: 0.1,       // water should actually reflect the sky
        });
        disposables.push(wg, wm);
        const w = new THREE.Mesh(wg, wm);
        w.rotation.x = -Math.PI / 2;
        w.position.set(p.x, 0.06, p.z);
        group.add(w);
        const bankG = new THREE.RingGeometry(p.scale, p.scale + 3.4, 28);
        const bank = new THREE.Mesh(bankG, M(0xa9c27a, null, { roughness: 0.85 }));
        bank.rotation.x = -Math.PI / 2;
        bank.position.set(p.x, 0.03, p.z);
        disposables.push(bankG);
        group.add(bank);
        break;
      }
      default: break;
    }
  }

  // ---------- boundary marker fence (visual only) ----------
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  disposables.push(bGeo);
  const bMat = M(0x8a7355, 'rock');
  for (const c of map.colliders) {
    if (c.tag !== 'bounds') continue;
    const m = new THREE.Mesh(bGeo, bMat);
    m.position.set(c.x, 1.2, c.z);
    m.scale.set(c.hw * 2, 2.4, c.hd * 2);
    group.add(m);
  }

  const stats = mergeStatics(group);

  return {
    group,
    stats,
    textures,
    dispose() {
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      disposables.forEach((d) => d.dispose?.());
      // textures are shared with the characters; the Game disposes them
    },
  };
}

/**
 * Re-project UVs from world position so texel density is constant everywhere.
 *
 * A BoxGeometry scaled into a 9m x 3.4m wall drags its 0..1 UVs across the
 * whole face, so brickwork smears. Picking the dominant axis of each face and
 * projecting world coordinates onto the other two fixes that for all the
 * axis-aligned architecture in this map, with no extra draw cost.
 */
function applyWorldUVs(geometry, scale = 1) {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  if (!pos || !nor) return;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) { u = x; v = z; }        // floor / ceiling
    else if (nx >= nz) { u = z; v = y; }               // wall facing X
    else { u = x; v = y; }                             // wall facing Z
    uv[i * 2] = u / scale;
    uv[i * 2 + 1] = v / scale;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/**
 * The map is static, so every mesh sharing a material can become ONE mesh.
 * This is the single biggest mobile win here: ~150 draw calls drop to ~10.
 * Transparent meshes (water, the zone wall) are left alone — merging them
 * would break their draw order.
 */
function mergeStatics(group) {
  group.updateMatrixWorld(true);
  const byMaterial = new Map();
  const originals = [];

  group.traverse((o) => {
    if (!o.isMesh || !o.geometry || Array.isArray(o.material)) return;
    if (o.material.transparent) return;
    if (!byMaterial.has(o.material)) byMaterial.set(o.material, []);
    // Box/Cylinder geometries are indexed, Dodecahedron is not — mergeGeometries
    // refuses mixed sets, so normalise everything to non-indexed first.
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
    g.applyMatrix4(o.matrixWorld);
    if (o.userData.worldUV !== false) applyWorldUVs(g);
    byMaterial.get(o.material).push(g);
    originals.push(o);
  });

  const before = originals.length;
  for (const o of originals) o.parent?.remove(o);

  let after = 0;
  for (const [material, geos] of byMaterial) {
    if (!geos.length) continue;
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    geos.forEach((g) => { if (g !== merged) g.dispose(); });
    if (!merged) continue;                       // attribute mismatch: skip, keep it safe
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    after += 1;
  }
  return { meshesBefore: before, meshesAfter: after };
}

/** Translucent cylinder marking the safe-zone boundary. */
export function buildZoneVisual() {
  // Kept deliberately short: a tall wall would tint the whole sky from the
  // inside and read as fog rather than as a boundary.
  const WALL_H = 22;
  const geo = new THREE.CylinderGeometry(1, 1, WALL_H, 48, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x7a5cff, transparent: true, opacity: 0.10,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = WALL_H / 2;
  const ringGeo = new THREE.RingGeometry(0.985, 1, 64);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xbda6ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  const group = new THREE.Group();
  group.add(mesh); group.add(ring);
  return {
    group,
    update(zone) {
      mesh.scale.set(zone.radius, 1, zone.radius);
      ring.scale.set(zone.radius, zone.radius, 1);
      group.position.set(zone.center.x, 0, zone.center.z);
      const danger = zone.state === 'shrinking';
      mat.color.setHex(danger ? 0xff4d6d : 0x7a5cff);
      ringMat.color.setHex(danger ? 0xff90a5 : 0xbda6ff);
    },
    dispose() { geo.dispose(); mat.dispose(); ringGeo.dispose(); ringMat.dispose(); },
  };
}

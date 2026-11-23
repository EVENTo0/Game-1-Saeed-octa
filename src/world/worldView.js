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
  plaster: 0xe2d6c0,
  stone: 0xb59c78,
  metal: 0x7d8790,
  barn: 0x8e3b2c,
  road: 0x9c8a6e,
  bush: 0x5e7a3a,
  sea: 0x1f7f9a,
  window: 0x2a2420,
  canopyA: 0xb5482f, canopyB: 0x2f6fa3, canopyC: 0xd9a63a,
  containers: [0xb3452f, 0x2f6aa0, 0x3e8a4a, 0xc9952e],
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
  const matPlaster = M(C.plaster, 'concrete', { normalScale: 0.5 });
  const matStone = M(C.stone, 'rock', { normalScale: 0.9 });
  const matMetal = M(C.metal, 'concrete', { metalness: 0.35, roughness: 0.55 });
  const matBarn = M(C.barn, 'wood');
  const matRoad = M(C.road, 'sand', { normalScale: 0.4 });
  const matBush = M(C.bush, null, { roughness: 0.9 });
  const matWindow = M(C.window, null, { roughness: 0.35, metalness: 0.1 });
  const matSandbag = M(0xb9a27a, 'cloth');
  const matContainer = C.containers.map((c) => M(c, 'concrete', { metalness: 0.3, roughness: 0.5 }));
  const matCanopy = [C.canopyA, C.canopyB, C.canopyC].map((c) => M(c, 'cloth'));
  const matHay = M(0xd8b45a, 'cloth');
  const matSteel = M(0x5a6068, null, { metalness: 0.6, roughness: 0.4 });
  const styleMat = { mud: matMud, concrete: matConcrete, tent: matTent, plaster: matPlaster, stone: matStone, metal: matMetal, barn: matBarn };
  const roofMat = { mud: matRoof, concrete: matConcrete, tent: matTent, plaster: matPlaster, stone: matStone, metal: matMetal, barn: matBarn };

  // ---------- ground ----------
  // A displaced plane reaching under the mountain ring (no sky gap from the air),
  // not a flat one: gentle dunes give the sun something to
  // rake across, which is most of what sells "desert" at a distance.
  const SEG = quality === 'low' ? 24 : 64;
  const HALF = map.half ?? 110;
  const groundGeo = new THREE.PlaneGeometry(HALF * 2 + 360, HALF * 2 + 360, SEG * 3, SEG * 3);
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const d = Math.hypot(x, y);
    // keep the playable middle flat so dunes never fight the collision boxes
    const falloff = Math.min(1, Math.max(0, (Math.max(Math.abs(x), Math.abs(y)) - HALF - 6) / 45));
    // gentle swell only: steep out-of-bounds dunes read as a dark band in front of the mountains
    const dune = Math.sin(x * 0.035) * Math.cos(y * 0.028) * 1.2
      + Math.sin(x * 0.011 + y * 0.013) * 1.6 + 0.6;
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

  // darker, packed ground under every named location to break up the expanse
  const patchGeo = new THREE.CircleGeometry(1, 28);
  const matSandDark = M(C.sandDark, 'sand', { normalScale: 0.6 });
  disposables.push(patchGeo);
  for (const p of map.pois ?? [{ x: -30, z: -40, r: 46 }]) {
    const patch = new THREE.Mesh(patchGeo, matSandDark);
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(p.x, 0.02, p.z);
    patch.scale.setScalar(p.r * 0.95);
    patch.receiveShadow = true;
    group.add(patch);
  }

  // ---------- buildings ----------
  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  disposables.push(wallGeo);
  const boxMesh = (mat, x, y, z, w, h, d, ry = 0) => {
    const m = new THREE.Mesh(wallGeo, mat);
    m.position.set(x, y, z); m.scale.set(w, h, d); m.rotation.y = ry;
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    return m;
  };
  // Every solid the map defines is drawn from its collider, so what you see is
  // exactly what blocks you.
  const drawnTags = new Set(['wall', 'stair', 'tower', 'ruin', 'container']);
  for (const c of map.colliders) {
    if (!drawnTags.has(c.tag)) continue;
    const mat = c.tag === 'container' ? matContainer[c.color ?? 0]
      : styleMat[c.style] ?? (c.tag === 'ruin' || c.tag === 'tower' ? matStone : matMud);
    boxMesh(mat, c.x, (c.top + c.bottom) / 2, c.z, c.hw * 2, c.top - c.bottom, c.hd * 2);
    if (c.tag === 'container') {
      // corrugation ribs and door bars read as a shipping container at any range
      const long = c.hw > c.hd;
      for (let i = -2; i <= 2; i++) {
        const o = i * (long ? c.hw : c.hd) * 0.38;
        boxMesh(matSteel, c.x + (long ? o : 0), (c.top + c.bottom) / 2, c.z + (long ? 0 : o),
          long ? 0.08 : c.hw * 2 + 0.06, c.top - c.bottom - 0.1, long ? c.hd * 2 + 0.06 : 0.08);
      }
    }
    if (c.tag === 'tower') {
      // crenellations on the fort towers
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
        boxMesh(matStone, c.x + dx * (c.hw - 0.4), c.top + 0.45, c.z + dz * (c.hd - 0.4), 0.8, 0.9, 0.8);
      }
    }
  }
  // roofs with a parapet lip, mid-wall trim and windows
  for (const b of map.buildings) {
    const rm = roofMat[b.style] ?? matRoof;
    boxMesh(rm, b.x, b.h + 0.12, b.z, b.w + 0.5, 0.24, b.d + 0.5);
    if (b.style !== 'tent' && b.style !== 'metal') {
      // parapet: four low lips round the roof edge
      const lipH = 0.45, y = b.h + 0.24 + lipH / 2;
      boxMesh(rm, b.x, y, b.z - b.d / 2 - 0.12, b.w + 0.5, lipH, 0.25);
      boxMesh(rm, b.x, y, b.z + b.d / 2 + 0.12, b.w + 0.5, lipH, 0.25);
      boxMesh(rm, b.x - b.w / 2 - 0.12, y, b.z, 0.25, lipH, b.d + 0.5);
      boxMesh(rm, b.x + b.w / 2 + 0.12, y, b.z, 0.25, lipH, b.d + 0.5);
    }
    if (b.style === 'mud' || b.style === 'plaster' || b.style === 'stone') {
      boxMesh(matMudDark, b.x, b.h * 0.55, b.z, b.w + 0.12, 0.18, b.d + 0.12);
    }
    if (b.style === 'metal') {
      // ribbed hangar roof
      for (let i = -3; i <= 3; i++) boxMesh(matSteel, b.x + (i * b.w) / 7.5, b.h + 0.32, b.z, 0.18, 0.16, b.d + 0.6);
    }
    if (b.style === 'tent') continue;
    // windows on every wall except the door side; two rows on tall buildings
    const rows = b.h > 5.4 ? [1.7, b.h - 1.6] : [1.7];
    for (const side of ['n', 's', 'e', 'w']) {
      if (side === b.door) continue;
      const horiz = side === 'n' || side === 's';
      const len = horiz ? b.w : b.d;
      const count = Math.max(1, Math.floor((len - 2) / 3.2));
      for (let i = 0; i < count; i++) {
        const off = -((count - 1) * 3.2) / 2 + i * 3.2;
        for (const wy of rows) {
          if (horiz) boxMesh(matWindow, b.x + off, wy, b.z + (side === 'n' ? -1 : 1) * (b.d / 2 + 0.19), 1.1, 1.2, 0.06);
          else boxMesh(matWindow, b.x + (side === 'w' ? -1 : 1) * (b.w / 2 + 0.19), wy, b.z + off, 0.06, 1.2, 1.1);
        }
      }
    }
    // a dark door frame so entrances read from across a street
    const dh = Math.min(2.4, b.h - 0.4);
    if (b.door === 'n' || b.door === 's') boxMesh(matWindow, b.x, dh / 2, b.z + (b.door === 'n' ? -1 : 1) * (b.d / 2), 1.9, dh, 0.38);
    else boxMesh(matWindow, b.x + (b.door === 'w' ? -1 : 1) * (b.w / 2), dh / 2, b.z, 0.38, dh, 1.9);
  }

  // ---------- props ----------
  const palmTrunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 5.2, 6);
  const palmLeafGeo = new THREE.ConeGeometry(1.5, 0.6, 5);
  const crateGeo = new THREE.BoxGeometry(1, 1, 1);
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const matPalmT = M(C.palmTrunk, 'wood', { normalScale: 0.7 });
  const matPalmL = M(C.palmLeaf, null, { roughness: 0.78 });
  const sandbagGeo = new THREE.CapsuleGeometry(0.17, 0.62, 3, 6).rotateZ(Math.PI / 2);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const hayGeo = new THREE.CylinderGeometry(0.85, 0.85, 1.7, 12);
  const bushGeo = new THREE.IcosahedronGeometry(0.75, 1);
  const roadGeo = new THREE.PlaneGeometry(1, 1);
  disposables.push(palmTrunkGeo, palmLeafGeo, crateGeo, rockGeo, sandbagGeo, wheelGeo, hayGeo, bushGeo, roadGeo);

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
        const h = p.h ?? 1.2;
        m.position.set(p.x, h / 2, p.z);
        m.scale.set(p.w ?? 2.6, h, p.d ?? 2.6);
        m.castShadow = true; m.receiveShadow = true;
        group.add(m); break;
      }
      case 'rock': {
        const m = new THREE.Mesh(rockGeo, matRock);
        const h = p.h ?? 1.6;
        m.position.set(p.x, h * 0.42, p.z);
        m.scale.set((p.w ?? 3.2) * 0.55, h * 0.68, (p.d ?? 3.0) * 0.55);
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
      case 'sandbag': {
        for (let r = 0; r < 3; r++) {
          for (let k = 0; k < 4 - r; k++) {
            const m = new THREE.Mesh(sandbagGeo, matSandbag);
            m.position.set(p.x + (k - (3 - r) / 2) * 0.9, 0.2 + r * 0.34, p.z);
            m.scale.set(1, 1, p.d ? p.d / 0.9 : 1);
            group.add(m);
          }
        }
        break;
      }
      case 'car': {
        const g = new THREE.Group();
        const body = new THREE.Mesh(wallGeo, matContainer[(Math.abs(Math.round(p.x)) % 4)]);
        body.position.y = 0.6; body.scale.set(4.4, 0.8, 1.9); g.add(body);
        const cab = new THREE.Mesh(wallGeo, matWindow);
        cab.position.set(-0.3, 1.25, 0); cab.scale.set(2.2, 0.6, 1.7); g.add(cab);
        for (const [dx, dz] of [[-1.4, 0.95], [1.4, 0.95], [-1.4, -0.95], [1.4, -0.95]]) {
          const w = new THREE.Mesh(wheelGeo, matWindow);
          w.position.set(dx, 0.35, dz); w.rotation.x = Math.PI / 2; g.add(w);
        }
        g.position.set(p.x, 0, p.z); g.rotation.y = p.rot ?? 0;
        group.add(g); break;
      }
      case 'cart': boxMesh(matWood, p.x, 0.6, p.z, 3, 1.2, 1.6); boxMesh(matCanopy[0], p.x, 1.9, p.z, 3.2, 0.12, 1.8); break;
      case 'stall': {
        boxMesh(matWood, p.x, 0.55, p.z, 3.2, 1.1, 1.2);
        boxMesh(matCanopy[p.canopy ?? 0], p.x, 2.5, p.z, 3.6, 0.1, 2.6);
        for (const dx of [-1.6, 1.6]) boxMesh(matWood, p.x + dx, 1.25, p.z + 1.1, 0.12, 2.5, 0.12);
        break;
      }
      case 'hay': {
        const m = new THREE.Mesh(hayGeo, matHay);
        m.position.set(p.x, 0.7, p.z); m.rotation.z = Math.PI / 2; m.castShadow = true;
        group.add(m); break;
      }
      case 'fountain': {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.2, 1, 16), matStone);
        ring.position.set(p.x, 0.5, p.z); ring.castShadow = true; group.add(ring);
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.6, 10), matStone);
        col.position.set(p.x, 1.6, p.z); group.add(col);
        break;
      }
      case 'clocktower': {
        boxMesh(matStone, p.x, 7, p.z, 3.4, 14, 3.4);
        boxMesh(matPlaster, p.x, 14.6, p.z, 3.9, 1.2, 3.9);
        for (const [dx, dz] of [[0, 1.96], [0, -1.96]]) boxMesh(matWindow, p.x + dx, 12.2, p.z + dz, 1.4, 1.4, 0.05);
        for (const [dx, dz] of [[1.96, 0], [-1.96, 0]]) boxMesh(matWindow, p.x + dx, 12.2, p.z + dz, 0.05, 1.4, 1.4);
        const spire = new THREE.Mesh(new THREE.ConeGeometry(2.2, 3.4, 4), matRoof);
        spire.position.set(p.x, 16.9, p.z); spire.rotation.y = Math.PI / 4; group.add(spire);
        break;
      }
      case 'dome': {
        const d = new THREE.Mesh(new THREE.SphereGeometry(p.scale * 0.55, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), matPlaster);
        d.position.set(p.x, p.h + 0.24, p.z); d.castShadow = true; group.add(d);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.4, 6), matSteel);
        tip.position.set(p.x, p.h + 0.24 + p.scale * 0.55 + 0.6, p.z); group.add(tip);
        break;
      }
      case 'silo': {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 10, 16), matMetal);
        c.position.set(p.x, 5, p.z); c.castShadow = true; group.add(c);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(2.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), matSteel);
        cap.position.set(p.x, 10, p.z); group.add(cap);
        break;
      }
      case 'mast': {
        for (let i = 0; i < 6; i++) {
          const w = 2.6 - i * 0.38;
          for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            boxMesh(matSteel, p.x + dx * w / 2, i * 5 + 2.5, p.z + dz * w / 2, 0.18, 5, 0.18);
          }
          boxMesh(matSteel, p.x, i * 5 + 5, p.z, w, 0.14, w);
        }
        boxMesh(matCanopy[0], p.x, 31, p.z, 0.4, 2, 0.4);
        break;
      }
      case 'crane': {
        boxMesh(matCanopy[2], p.x, 11, p.z, 1.6, 22, 1.6);
        boxMesh(matCanopy[2], p.x - 8, 22, p.z, 22, 1.2, 1.4);
        boxMesh(matSteel, p.x - 16, 17, p.z, 0.1, 10, 0.1);
        boxMesh(matContainer[1], p.x - 16, 12, p.z, 6, 2.4, 2.5);
        break;
      }
      case 'arch': {
        boxMesh(matStone, p.x, 6.3, p.z, 11.4, 1.2, 1.4);
        break;
      }
      case 'bush': {
        for (let k = 0; k < 3; k++) {
          const m = new THREE.Mesh(bushGeo, matBush);
          const a = p.rot + k * 2.1;
          m.position.set(p.x + Math.cos(a) * p.scale * 0.45, p.scale * 0.55, p.z + Math.sin(a) * p.scale * 0.45);
          m.scale.setScalar(p.scale * (0.8 + k * 0.12));
          group.add(m);
        }
        break;
      }
      case 'road': {
        const dx = p.x2 - p.x1, dz = p.z2 - p.z1;
        const len = Math.hypot(dx, dz);
        const m = new THREE.Mesh(roadGeo, matRoad);
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = -Math.atan2(dz, dx);
        m.position.set((p.x1 + p.x2) / 2, 0.025, (p.z1 + p.z2) / 2);
        m.scale.set(len, 6, 1);
        m.receiveShadow = true;
        group.add(m); break;
      }
      case 'sea': {
        const W = 180, D = (map.half ?? 260) * 2 + 200;
        const sg = new THREE.PlaneGeometry(W, D);
        const sm = new THREE.MeshStandardMaterial({ color: C.sea, transparent: true, opacity: 0.9, roughness: 0.06, metalness: 0.15 });
        disposables.push(sg, sm);
        const sea = new THREE.Mesh(sg, sm);
        sea.rotation.x = -Math.PI / 2;
        sea.position.set(p.x0 + W / 2, 0.35, p.z);
        group.add(sea); break;
      }
      default: break;
    }
  }

  // ---------- boundary marker fence (visual only) ----------
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  disposables.push(bGeo);
  const bMat = M(0xc7a273, 'sand');                // a low sand berm, not a dark wall
  for (const c of map.colliders) {
    if (c.tag !== 'bounds') continue;
    const m = new THREE.Mesh(bGeo, bMat);
    m.position.set(c.x, 0.5, c.z);
    m.scale.set(c.hw * 2 + 4, 1.0, c.hd * 2 + 4);
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

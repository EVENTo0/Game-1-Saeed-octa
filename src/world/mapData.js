// "قرية الواحة" — Oasis Village. Pure data + generators, no three.js here.
// Everything is axis-aligned so collision stays cheap on phones.

/** @typedef {{x:number,z:number,hw:number,hd:number,top:number,bottom:number,tag:string}} Collider */

export function box(x, z, w, d, top, tag = 'solid', bottom = 0) {
  return { x, z, hw: w / 2, hd: d / 2, top, bottom, tag };
}

/**
 * Hollow building with a doorway gap on one side. Returns wall colliders + a
 * descriptor the view layer turns into geometry.
 * @param {{x:number,z:number,w:number,d:number,h:number,door:'n'|'s'|'e'|'w',style?:string}} spec
 */
export function building(spec) {
  const { x, z, w, d, h, door, style = 'mud' } = spec;
  const t = 0.35;               // wall thickness
  const doorW = 1.9;
  const walls = [];
  const halfW = w / 2, halfD = d / 2;

  const spanWall = (side) => {
    const horizontal = side === 'n' || side === 's';
    const len = horizontal ? w : d;
    if (side !== door) {
      if (horizontal) walls.push(box(x, z + (side === 'n' ? -halfD : halfD), w, t, h, 'wall'));
      else walls.push(box(x + (side === 'e' ? halfW : -halfW), z, t, d, h, 'wall'));
      return;
    }
    // doorway: two stubs either side of the gap
    const stub = (len - doorW) / 2;
    if (stub <= 0.1) return;
    if (horizontal) {
      const zz = z + (side === 'n' ? -halfD : halfD);
      walls.push(box(x - (doorW / 2 + stub / 2), zz, stub, t, h, 'wall'));
      walls.push(box(x + (doorW / 2 + stub / 2), zz, stub, t, h, 'wall'));
    } else {
      const xx = x + (side === 'e' ? halfW : -halfW);
      walls.push(box(xx, z - (doorW / 2 + stub / 2), t, stub, h, 'wall'));
      walls.push(box(xx, z + (doorW / 2 + stub / 2), t, stub, h, 'wall'));
    }
  };
  ['n', 's', 'e', 'w'].forEach(spanWall);
  return { spec: { x, z, w, d, h, door, style }, walls };
}

export function buildMap() {
  /** @type {Collider[]} */
  const colliders = [];
  const buildings = [];
  const props = [];      // {kind,x,z,rot,scale}
  const lootSpots = [];  // {x,z,kind}
  const add = (b) => { buildings.push(b.spec); colliders.push(...b.walls); };

  // ---------- 1. Arabic village (north-west quadrant) ----------
  const villageHouses = [
    { x: -46, z: -44, w: 9, d: 8, h: 3.4, door: 's' },
    { x: -32, z: -50, w: 8, d: 8, h: 4.2, door: 'e' },
    { x: -20, z: -42, w: 11, d: 9, h: 3.6, door: 'w' },
    { x: -44, z: -28, w: 8, d: 10, h: 4.0, door: 'n' },
    { x: -28, z: -26, w: 10, d: 8, h: 3.2, door: 'n' },
    { x: -14, z: -58, w: 9, d: 9, h: 4.6, door: 's' },
  ];
  villageHouses.forEach((h) => add(building({ ...h, style: 'mud' })));

  // village well + palms + crates
  colliders.push(box(-33, -37, 3.0, 3.0, 1.1, 'prop'));
  props.push({ kind: 'well', x: -33, z: -37, rot: 0, scale: 1 });
  [[-40, -36], [-24, -34], [-38, -52], [-18, -50]].forEach(([x, z], i) =>
    props.push({ kind: 'palm', x, z, rot: i * 0.9, scale: 1 + (i % 3) * 0.12 }));
  [[-37, -45], [-25, -47], [-47, -34]].forEach(([x, z]) => {
    colliders.push(box(x, z, 1.4, 1.4, 1.2, 'cover'));
    props.push({ kind: 'crate', x, z, rot: 0.3, scale: 1 });
  });

  // village loot
  lootSpots.push(
    { x: -46, z: -44, kind: 'weapon:OCTA_AR' },
    { x: -20, z: -42, kind: 'weapon:DESERT_CLAW' },
    { x: -32, z: -50, kind: 'ammo' },
    { x: -28, z: -32, kind: 'medkit' },
    { x: -33, z: -34, kind: 'ammo' },
    { x: -44, z: -35, kind: 'medkit' },
    { x: -14, z: -51, kind: 'medkit' },
  );

  // ---------- 2. Oasis (centre-east) ----------
  // water is a non-solid decorative disc; palms ring it
  const oasis = { x: 38, z: -18, r: 16 };
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const px = oasis.x + Math.cos(a) * (oasis.r + 3.2);
    const pz = oasis.z + Math.sin(a) * (oasis.r + 3.2);
    props.push({ kind: 'palm', x: px, z: pz, rot: a, scale: 1.1 });
    colliders.push(box(px, pz, 0.8, 0.8, 5.5, 'prop'));
  }
  props.push({ kind: 'water', x: oasis.x, z: oasis.z, rot: 0, scale: oasis.r });
  lootSpots.push(
    { x: oasis.x + 12, z: oasis.z + 10, kind: 'weapon:SAEED_50' },
    { x: oasis.x - 11, z: oasis.z - 9, kind: 'medkit' },
    { x: oasis.x + 6, z: oasis.z - 14, kind: 'ammo' },
  );
  // small shaded rest-stop by the oasis
  add(building({ x: 22, z: -34, w: 9, d: 7, h: 3.2, door: 'e', style: 'tent' }));
  lootSpots.push({ x: 22, z: -34, kind: 'ammo' });
  lootSpots.push({ x: 29, z: -32, kind: 'medkit' });

  // ---------- 3. Rocky hill (south-east) ----------
  // stacked boxes you can actually climb/stand on
  const hill = { x: 44, z: 40 };
  const tiers = [
    { w: 34, d: 30, h: 2.2 },
    { w: 24, d: 21, h: 4.2 },
    { w: 14, d: 12, h: 6.0 },
  ];
  tiers.forEach((t, i) => {
    colliders.push(box(hill.x, hill.z, t.w, t.d, t.h, 'ground'));
    props.push({ kind: 'rock-tier', x: hill.x, z: hill.z, rot: 0, scale: 1, w: t.w, d: t.d, h: t.h, i });
  });
  lootSpots.push(
    { x: hill.x, z: hill.z, kind: 'weapon:SAEED_50' },
    { x: hill.x + 8, z: hill.z - 6, kind: 'ammo' },
    { x: hill.x - 9, z: hill.z + 7, kind: 'medkit' },
  );
  // scattered boulders for cover on the approach
  [[26, 30], [30, 52], [58, 24], [20, 46]].forEach(([x, z], i) => {
    colliders.push(box(x, z, 3.2, 3.0, 1.9, 'cover'));
    props.push({ kind: 'rock', x, z, rot: i * 1.1, scale: 1 });
  });

  // ---------- 4. Abandoned outpost (south-west) ----------
  const out = { x: -36, z: 38 };
  add(building({ x: out.x, z: out.z, w: 14, d: 12, h: 4.4, door: 'n', style: 'concrete' }));
  add(building({ x: out.x + 17, z: out.z + 9, w: 9, d: 9, h: 3.6, door: 'w', style: 'concrete' }));
  // perimeter barriers (gapped, so you can walk in)
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    colliders.push(box(out.x + i * 5, out.z - 12, 4.0, 0.6, 1.3, 'cover'));
    props.push({ kind: 'barrier', x: out.x + i * 5, z: out.z - 12, rot: 0, scale: 1 });
  }
  // watchtower platform
  colliders.push(box(out.x - 14, out.z + 4, 4, 4, 5.2, 'ground'));
  props.push({ kind: 'tower', x: out.x - 14, z: out.z + 4, rot: 0, scale: 1 });
  lootSpots.push(
    { x: out.x, z: out.z, kind: 'weapon:OCTA_AR' },
    { x: out.x, z: out.z + 3, kind: 'ammo' },
    { x: out.x + 17, z: out.z + 9, kind: 'weapon:DESERT_CLAW' },
    { x: out.x - 14, z: out.z + 4, kind: 'medkit' },
    { x: out.x + 8, z: out.z - 6, kind: 'ammo' },
  );

  // ---------- 5. Open desert middle: sparse cover so it isn't a killing field ----------
  [[0, 0], [-8, 12], [10, -8], [4, 22], [-14, -6], [16, 12], [-4, -18], [12, 34], [-18, 22]]
    .forEach(([x, z], i) => {
      colliders.push(box(x, z, 2.6, 2.6, 1.6, 'cover'));
      props.push({ kind: i % 2 ? 'rock' : 'crate', x, z, rot: i * 0.7, scale: 1 });
    });
  lootSpots.push(
    { x: 0, z: 0, kind: 'ammo' },
    { x: 10, z: -8, kind: 'medkit' },
    { x: -8, z: 12, kind: 'weapon:OCTA_AR' },
    { x: 4, z: 22, kind: 'medkit' },
  );

  // ---------- world boundary walls ----------
  const S = 110;
  colliders.push(box(0, -S, S * 2, 2, 12, 'bounds'));
  colliders.push(box(0, S, S * 2, 2, 12, 'bounds'));
  colliders.push(box(-S, 0, 2, S * 2, 12, 'bounds'));
  colliders.push(box(S, 0, 2, S * 2, 12, 'bounds'));

  // Loot rule: HEALING is always reachable in the open, so a player under
  // pressure can sustain without stopping to navigate a doorway. Better
  // WEAPONS stay inside buildings as the risk/reward for going in.
  const spawns = {
    player: { x: -4, z: 40 },
    npcMansour: { x: -30, z: -36 },
    bots: [
      { x: -40, z: -46, name: 'Fahad' },
      { x: 40, z: -24, name: 'Nasser' },
      { x: 66, z: 52, name: 'Layla' },
      { x: -56, z: 56, name: 'Salem' },
      { x: 6, z: -4, name: 'MansourBot' },
    ],
  };

  return { colliders, buildings, props, lootSpots, spawns, oasis, center: { x: 0, z: 0 } };
}

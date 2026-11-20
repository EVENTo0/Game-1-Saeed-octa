// "جزيرة سعيد" — a 520 m desert map with twelve named locations.
// Pure data + generators, no three.js here. Everything is axis-aligned so
// collision stays cheap on phones.

/** @typedef {{x:number,z:number,hw:number,hd:number,top:number,bottom:number,tag:string,style?:string}} Collider */

export const MAP_HALF = 260;

export function box(x, z, w, d, top, tag = 'solid', bottom = 0) {
  return { x, z, hw: w / 2, hd: d / 2, top, bottom, tag };
}

/** Small deterministic PRNG so the map is identical on every device. */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hollow building with a doorway gap on one side, a solid roof you can stand
 * on, and optional outside stairs up to it. Returns colliders plus a
 * descriptor the view layer turns into geometry.
 * @param {{x:number,z:number,w:number,d:number,h:number,door:'n'|'s'|'e'|'w',style?:string,stairs?:boolean}} spec
 */
export function building(spec) {
  const { x, z, w, d, h, door, style = 'mud', stairs = false } = spec;
  const t = 0.35;               // wall thickness
  const doorW = 1.9;
  const walls = [];
  const halfW = w / 2, halfD = d / 2;
  const wall = (b) => { b.style = style; walls.push(b); };

  const spanWall = (side) => {
    const horizontal = side === 'n' || side === 's';
    const len = horizontal ? w : d;
    if (side !== door) {
      if (horizontal) wall(box(x, z + (side === 'n' ? -halfD : halfD), w, t, h, 'wall'));
      else wall(box(x + (side === 'e' ? halfW : -halfW), z, t, d, h, 'wall'));
      return;
    }
    const stub = (len - doorW) / 2;
    if (stub <= 0.1) return;
    if (horizontal) {
      const zz = z + (side === 'n' ? -halfD : halfD);
      wall(box(x - (doorW / 2 + stub / 2), zz, stub, t, h, 'wall'));
      wall(box(x + (doorW / 2 + stub / 2), zz, stub, t, h, 'wall'));
    } else {
      const xx = x + (side === 'e' ? halfW : -halfW);
      wall(box(xx, z - (doorW / 2 + stub / 2), t, stub, h, 'wall'));
      wall(box(xx, z + (doorW / 2 + stub / 2), t, stub, h, 'wall'));
    }
  };
  ['n', 's', 'e', 'w'].forEach(spanWall);

  // Roof slab: its underside is at wall height, so people inside pass under it
  // and a parachute can land on top of it.
  const roof = box(x, z, w + 0.5, d + 0.5, h + 0.24, 'roof', h);
  roof.style = style;

  // Outside stairs run along the wall opposite the door, rising to the roof.
  const steps = [];
  if (stairs) {
    const rise = 0.42, run = 0.62, width = 1.3;
    const n = Math.ceil((h + 0.24 - 0.2) / rise);
    const back = { n: 's', s: 'n', e: 'w', w: 'e' }[door];
    for (let i = 0; i < n; i++) {
      const top = Math.min(h + 0.24 - 0.2, (i + 1) * rise);
      const along = -((n * run) / 2) + run * (i + 0.5);
      let s;
      if (back === 'n' || back === 's') {
        const zz = z + (back === 'n' ? -(halfD + width / 2 + 0.2) : halfD + width / 2 + 0.2);
        s = box(x + along, zz, run, width, top, 'stair');
      } else {
        const xx = x + (back === 'w' ? -(halfW + width / 2 + 0.2) : halfW + width / 2 + 0.2);
        s = box(xx, z + along, width, run, top, 'stair');
      }
      s.style = style;
      steps.push(s);
    }
  }
  return { spec: { x, z, w, d, h, door, style }, walls: [...walls, roof, ...steps] };
}

export function buildMap() {
  /** @type {Collider[]} */
  const colliders = [];
  const buildings = [];
  const props = [];      // {kind,x,z,rot,scale,...}
  const lootSpots = [];  // {x,z,kind}
  const bushes = [];     // {x,z,r} visual concealment
  const pois = [];       // named locations
  const rng = mulberry(20261120);

  const add = (b) => { buildings.push(b.spec); colliders.push(...b.walls); };
  const cover = (x, z, w, d, h, kind, extra = {}) => {
    colliders.push(box(x, z, w, d, h, 'cover'));
    props.push({ kind, x, z, w, d, h, rot: 0, scale: 1, ...extra });
  };
  const loot = (...spots) => lootSpots.push(...spots);
  const poi = (id, nameAr, nameEn, x, z, r) => { pois.push({ id, nameAr, nameEn, x, z, r }); return { x, z }; };
  const palm = (x, z, s = 1) => {
    props.push({ kind: 'palm', x, z, rot: rng() * 6.28, scale: s });
    colliders.push(box(x, z, 0.7, 0.7, 5.5, 'prop'));
  };
  const bush = (x, z, r = 1.5) => { bushes.push({ x, z, r }); props.push({ kind: 'bush', x, z, rot: rng() * 6.28, scale: r }); };

  // ---------- 1. البلدة القديمة — Old Town (north) ----------
  const town = poi('town', 'البلدة القديمة', 'Old Town', 0, -165, 62);
  const doors = ['s', 'e', 'n', 'w'];
  for (let gx = -2; gx <= 2; gx++) {
    for (let gz = -1; gz <= 1; gz++) {
      if (gx === 0 && gz === 0) continue;                       // town square
      const x = town.x + gx * 22, z = town.z + gz * 24;
      const w = 10 + Math.round(rng() * 4), d = 9 + Math.round(rng() * 4);
      const h = 3.4 + Math.round(rng() * 3) * 0.9;
      const door = doors[(gx + 2 + (gz + 1) * 5) % 4];
      add(building({ x, z, w, d, h, door, style: rng() < 0.7 ? 'mud' : 'plaster', stairs: (gx + gz) % 2 === 0 }));
      loot({ x, z, kind: rng() < 0.55 ? `weapon:${['OCTA_AR', 'SARB_9', 'DESERT_CLAW', 'SAQR_DMR'][Math.floor(rng() * 4)]}` : 'ammo' });
    }
  }
  // square: fountain and market carts
  colliders.push(box(town.x, town.z, 4, 4, 1.0, 'prop'));
  props.push({ kind: 'fountain', x: town.x, z: town.z, rot: 0, scale: 1 });
  cover(town.x - 7, town.z + 4, 3, 1.6, 1.2, 'cart');
  cover(town.x + 7, town.z - 4, 3, 1.6, 1.2, 'cart');
  // clock tower: a landmark you can find from the air
  colliders.push(box(town.x + 11, town.z + 11, 3.4, 3.4, 16, 'landmark'));
  props.push({ kind: 'clocktower', x: town.x + 11, z: town.z + 11, rot: 0, scale: 1 });
  loot({ x: town.x + 3, z: town.z - 3, kind: 'medkit' }, { x: town.x - 4, z: town.z + 6, kind: 'armor' },
    { x: town.x + 30, z: town.z + 12, kind: 'medkit' }, { x: town.x - 30, z: town.z - 12, kind: 'medkit' });
  [[-11, 12], [11, -12], [-33, 12], [33, -12], [-11, -36], [11, 36]].forEach(([dx, dz]) =>
    cover(town.x + dx, town.z + dz, 1.4, 1.4, 1.2, 'crate'));

  // ---------- 2. الحصن — The Fort (west) ----------
  const fort = poi('fort', 'الحصن', 'The Fort', -180, -20, 40);
  const F = 26, wallH = 6.5, wt = 1.4, gate = 5;
  for (const side of ['n', 's', 'e', 'w']) {
    const horiz = side === 'n' || side === 's';
    const off = side === 'n' || side === 'w' ? -F : F;
    const hasGate = side === 'e' || side === 'w';
    const seg = hasGate ? (2 * F - gate) / 2 : 2 * F;
    const parts = hasGate ? [-(gate / 2 + seg / 2), gate / 2 + seg / 2] : [0];
    for (const p of parts) {
      const c = horiz ? box(fort.x + p, fort.z + off, seg, wt, wallH, 'wall') : box(fort.x + off, fort.z + p, wt, seg, wallH, 'wall');
      c.style = 'stone';
      colliders.push(c);
    }
  }
  // corner towers you can climb
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const tx = fort.x + sx * F, tz = fort.z + sz * F;
    const tw = box(tx, tz, 7, 7, 9, 'tower'); tw.style = 'stone'; colliders.push(tw);
    // inner ramp of steps up to the tower top
    for (let i = 0; i < 18; i++) {
      const s = box(tx - sx * (4.2 + i * 0.6), tz - sz * 4.6, 0.62, 1.4, Math.min(8.8, (18 - i) * 0.5), 'stair');   // highest next to the tower
      s.style = 'stone';
      colliders.push(s);
    }
  }
  add(building({ x: fort.x, z: fort.z, w: 16, d: 12, h: 6, door: 'e', style: 'stone', stairs: true }));
  add(building({ x: fort.x - 12, z: fort.z + 14, w: 8, d: 7, h: 3.6, door: 'n', style: 'stone' }));
  add(building({ x: fort.x + 12, z: fort.z - 15, w: 8, d: 7, h: 3.6, door: 's', style: 'stone' }));
  loot({ x: fort.x, z: fort.z, kind: 'weapon:SAEED_50' }, { x: fort.x + 3, z: fort.z + 2, kind: 'armor' },
    { x: fort.x - 12, z: fort.z + 14, kind: 'weapon:SAQR_DMR' }, { x: fort.x + 12, z: fort.z - 15, kind: 'weapon:OCTA_AR' },
    { x: fort.x - 8, z: fort.z - 8, kind: 'medkit' }, { x: fort.x + 8, z: fort.z + 10, kind: 'ammo' },
    { x: fort.x - 20, z: fort.z - 20, kind: 'ammo' });
  [[-6, -16], [6, 16], [-16, 2], [16, -2]].forEach(([dx, dz]) => cover(fort.x + dx, fort.z + dz, 3.6, 1.0, 1.1, 'sandbag'));

  // ---------- 3. الميناء — The Port (east) ----------
  const port = poi('port', 'الميناء', 'The Port', 180, 40, 60);
  const palette = [0, 1, 2, 3];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      if ((row + col) % 4 === 3) continue;                        // aisles to move through
      const x = port.x - 30 + col * 13, z = port.z - 30 + row * 12;
      const stack = rng() < 0.35 ? 2 : 1;
      for (let k = 0; k < stack; k++) {
        const c = box(x, z, 6.1, 2.5, 2.6 * (k + 1), 'container', 2.6 * k);
        c.color = palette[Math.floor(rng() * palette.length)];
        colliders.push(c);
      }
    }
  }
  add(building({ x: port.x - 10, z: port.z + 30, w: 30, d: 16, h: 8, door: 'w', style: 'metal' }));
  add(building({ x: port.x + 22, z: port.z + 30, w: 10, d: 8, h: 3.6, door: 'n', style: 'plaster', stairs: true }));
  for (const cz of [-20, 10]) props.push({ kind: 'crane', x: port.x + 38, z: port.z + cz, rot: 0, scale: 1 });
  colliders.push(box(port.x + 47, port.z, 1.0, 140, 1.1, 'cover'));   // quay edge
  props.push({ kind: 'sea', x0: port.x + 48, z: 0 });            // open water east of the quay
  loot({ x: port.x - 10, z: port.z + 30, kind: 'weapon:SAQR_DMR' }, { x: port.x - 18, z: port.z + 28, kind: 'armor' },
    { x: port.x - 2, z: port.z + 33, kind: 'weapon:SARB_9' }, { x: port.x + 22, z: port.z + 30, kind: 'medkit' },
    { x: port.x - 23, z: port.z - 24, kind: 'ammo' }, { x: port.x + 3, z: port.z - 6, kind: 'weapon:OCTA_AR' },
    { x: port.x + 16, z: port.z + 6, kind: 'medkit' }, { x: port.x - 10, z: port.z + 12, kind: 'ammo' });

  // ---------- 4. السوق — The Souq (south) ----------
  const souq = poi('souq', 'السوق', 'The Souq', 10, 160, 50);
  for (let i = 0; i < 6; i++) {
    for (const side of [-1, 1]) {
      const x = souq.x - 30 + i * 12, z = souq.z + side * 10;
      add(building({ x, z: z + side * 5, w: 9, d: 7, h: 3.4, door: side < 0 ? 's' : 'n', style: i % 2 ? 'plaster' : 'mud', stairs: i === 2 }));
      cover(x, z - side * 1.5, 3.2, 1.2, 1.1, 'stall', { canopy: (i + (side > 0 ? 1 : 0)) % 3 });
    }
  }
  add(building({ x: souq.x + 44, z: souq.z, w: 12, d: 12, h: 7, door: 'w', style: 'plaster', stairs: true }));
  props.push({ kind: 'dome', x: souq.x + 44, z: souq.z, rot: 0, scale: 6, h: 7 });
  loot({ x: souq.x - 30, z: souq.z - 15, kind: 'weapon:SARB_9' }, { x: souq.x + 6, z: souq.z + 15, kind: 'weapon:DESERT_CLAW' },
    { x: souq.x + 30, z: souq.z - 15, kind: 'armor' }, { x: souq.x + 44, z: souq.z, kind: 'weapon:SAEED_50' },
    { x: souq.x - 12, z: souq.z, kind: 'medkit' }, { x: souq.x + 12, z: souq.z, kind: 'ammo' },
    { x: souq.x - 6, z: souq.z + 15, kind: 'ammo' }, { x: souq.x + 18, z: souq.z - 15, kind: 'medkit' });

  // ---------- 5. الوادي — The Wadi (north-east canyon) ----------
  const wadi = poi('wadi', 'الوادي', 'The Wadi', 165, -160, 55);
  const ridges = [
    [-40, -20, 46, 9, 7], [10, -32, 40, 8, 9], [-10, 4, 30, 7, 5], [36, 10, 9, 40, 8],
    [-38, 28, 34, 8, 6], [8, 34, 24, 7, 4.5], [-50, -2, 7, 22, 6],
  ];
  ridges.forEach(([dx, dz, w, d, h], i) => {
    colliders.push(box(wadi.x + dx, wadi.z + dz, w, d, h, 'ground'));
    props.push({ kind: 'rock-tier', x: wadi.x + dx, z: wadi.z + dz, w, d, h, i: i % 3, rot: 0, scale: 1 });
    // a lower ledge on one side so the ridge can be climbed
    colliders.push(box(wadi.x + dx, wadi.z + dz + d / 2 + 1.5, w * 0.6, 3, Math.min(2.2, h * 0.45), 'ground'));
    props.push({ kind: 'rock-tier', x: wadi.x + dx, z: wadi.z + dz + d / 2 + 1.5, w: w * 0.6, d: 3, h: Math.min(2.2, h * 0.45), i: 1, rot: 0, scale: 1 });
  });
  add(building({ x: wadi.x + 20, z: wadi.z - 8, w: 9, d: 8, h: 3.4, door: 'w', style: 'tent' }));
  loot({ x: wadi.x + 20, z: wadi.z - 8, kind: 'weapon:SAQR_DMR' }, { x: wadi.x - 10, z: wadi.z - 32, kind: 'armor' },
    { x: wadi.x - 20, z: wadi.z + 16, kind: 'medkit' }, { x: wadi.x + 20, z: wadi.z + 20, kind: 'ammo' },
    { x: wadi.x - 40, z: wadi.z - 20, kind: 'weapon:SAEED_50' });

  // ---------- 6. قرية الواحة — Oasis Village (north-west) ----------
  const vil = poi('village', 'قرية الواحة', 'Oasis Village', -160, -170, 42);
  [
    [-14, -8, 9, 8, 3.4, 's'], [2, -14, 8, 8, 4.2, 'e'], [14, -6, 11, 9, 3.6, 'w'],
    [-12, 12, 8, 10, 4.0, 'n'], [4, 14, 10, 8, 3.2, 'n'], [18, -24, 9, 9, 4.6, 's'],
  ].forEach(([dx, dz, w, d, h, door], i) =>
    add(building({ x: vil.x + dx, z: vil.z + dz, w, d, h, door, style: 'mud', stairs: i === 1 })));
  colliders.push(box(vil.x - 1, vil.z - 1, 3.0, 3.0, 1.1, 'prop'));
  props.push({ kind: 'well', x: vil.x - 1, z: vil.z - 1, rot: 0, scale: 1 });
  [[-8, 0], [8, 2], [-6, -18], [10, -18], [-22, 4], [22, 8]].forEach(([dx, dz]) => palm(vil.x + dx, vil.z + dz, 1 + rng() * 0.3));
  loot({ x: vil.x - 14, z: vil.z - 8, kind: 'weapon:OCTA_AR' }, { x: vil.x + 14, z: vil.z - 6, kind: 'weapon:DESERT_CLAW' },
    { x: vil.x + 2, z: vil.z - 14, kind: 'ammo' }, { x: vil.x + 4, z: vil.z + 4, kind: 'medkit' },
    { x: vil.x - 12, z: vil.z + 12, kind: 'medkit' }, { x: vil.x + 18, z: vil.z - 24, kind: 'armor' });

  // ---------- 7. الواحة — The Oasis (centre-east) ----------
  const oasis = { x: 75, z: -55, r: 20 };
  poi('oasis', 'الواحة', 'The Oasis', oasis.x, oasis.z, 34);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    palm(oasis.x + Math.cos(a) * (oasis.r + 3.4), oasis.z + Math.sin(a) * (oasis.r + 3.4), 1.05 + (i % 3) * 0.1);
  }
  props.push({ kind: 'water', x: oasis.x, z: oasis.z, rot: 0, scale: oasis.r });
  add(building({ x: oasis.x - 32, z: oasis.z - 14, w: 9, d: 7, h: 3.2, door: 'e', style: 'tent' }));
  add(building({ x: oasis.x + 30, z: oasis.z + 16, w: 9, d: 7, h: 3.2, door: 'w', style: 'tent' }));
  for (let i = 0; i < 8; i++) bush(oasis.x + Math.cos(i * 0.8) * (oasis.r + 8), oasis.z + Math.sin(i * 0.8) * (oasis.r + 8), 1.6);
  loot({ x: oasis.x + 26, z: oasis.z - 6, kind: 'weapon:SAEED_50' }, { x: oasis.x - 32, z: oasis.z - 14, kind: 'ammo' },
    { x: oasis.x + 30, z: oasis.z + 16, kind: 'armor' }, { x: oasis.x - 20, z: oasis.z + 20, kind: 'medkit' });

  // ---------- 8. التلال الصخرية — Rocky Hills (south-east) ----------
  const hill = poi('hills', 'التلال الصخرية', 'Rocky Hills', 150, 170, 45);
  [{ w: 44, d: 38, h: 2.2 }, { w: 30, d: 26, h: 4.4 }, { w: 18, d: 15, h: 6.6 }, { w: 8, d: 7, h: 8.8 }].forEach((t, i) => {
    colliders.push(box(hill.x, hill.z, t.w, t.d, t.h, 'ground'));
    props.push({ kind: 'rock-tier', x: hill.x, z: hill.z, rot: 0, scale: 1, w: t.w, d: t.d, h: t.h, i: Math.min(2, i) });
  });
  [[-32, -18], [30, -24], [-26, 26], [34, 22], [0, -34]].forEach(([dx, dz]) => cover(hill.x + dx, hill.z + dz, 3.4, 3.0, 2.0, 'rock'));
  loot({ x: hill.x, z: hill.z, kind: 'weapon:SAEED_50' }, { x: hill.x + 10, z: hill.z - 8, kind: 'ammo' },
    { x: hill.x - 11, z: hill.z + 9, kind: 'medkit' }, { x: hill.x + 5, z: hill.z + 4, kind: 'armor' });

  // ---------- 9. القاعدة العسكرية — Military Base (south-west) ----------
  const base = poi('base', 'القاعدة العسكرية', 'Military Base', -165, 160, 55);
  add(building({ x: base.x, z: base.z, w: 16, d: 12, h: 4.4, door: 'n', style: 'concrete', stairs: true }));
  add(building({ x: base.x + 22, z: base.z + 10, w: 10, d: 10, h: 3.6, door: 'w', style: 'concrete' }));
  add(building({ x: base.x - 24, z: base.z + 12, w: 22, d: 14, h: 7, door: 'e', style: 'metal' }));   // hangar
  for (let i = -4; i <= 4; i++) {
    if (i === 0) continue;
    cover(base.x + i * 6, base.z - 18, 4.0, 0.6, 1.3, 'barrier');
  }
  for (const [dx, dz] of [[-34, -20], [34, -20], [34, 30]]) {
    colliders.push(box(base.x + dx, base.z + dz, 4, 4, 5.2, 'ground'));
    props.push({ kind: 'tower', x: base.x + dx, z: base.z + dz, rot: 0, scale: 1 });
  }
  [[-8, -10], [8, -10], [0, 20]].forEach(([dx, dz]) => cover(base.x + dx, base.z + dz, 3.6, 1.0, 1.1, 'sandbag'));
  cover(base.x + 12, base.z - 26, 4.4, 2.0, 1.6, 'car');
  loot({ x: base.x, z: base.z, kind: 'weapon:OCTA_AR' }, { x: base.x + 22, z: base.z + 10, kind: 'weapon:SAQR_DMR' },
    { x: base.x - 24, z: base.z + 12, kind: 'weapon:SAEED_50' }, { x: base.x - 20, z: base.z + 8, kind: 'armor' },
    { x: base.x + 4, z: base.z + 3, kind: 'armor' }, { x: base.x - 34, z: base.z - 20, kind: 'medkit' },
    { x: base.x + 10, z: base.z - 14, kind: 'ammo' }, { x: base.x - 6, z: base.z + 24, kind: 'ammo' });

  // ---------- 10. الأطلال — Central Ruins ----------
  const ruins = poi('ruins', 'الأطلال', 'The Ruins', 0, 10, 38);
  [
    [-14, -10, 10, 0.8, 2.6], [-18, -4, 0.8, 12, 1.6], [12, -14, 0.8, 9, 3.0], [8, -18, 9, 0.8, 1.2],
    [-6, 14, 12, 0.8, 2.2], [16, 10, 0.8, 10, 1.8], [22, -2, 6, 0.8, 2.8], [-24, 16, 0.8, 7, 1.4],
  ].forEach(([dx, dz, w, d, h]) => { const c = box(ruins.x + dx, ruins.z + dz, w, d, h, 'ruin'); c.style = 'stone'; colliders.push(c); });
  for (const dx of [-5, 5]) { colliders.push(box(ruins.x + dx, ruins.z, 1.4, 1.4, 6, 'ruin')); colliders[colliders.length - 1].style = 'stone'; }
  props.push({ kind: 'arch', x: ruins.x, z: ruins.z, rot: 0, scale: 1 });
  [[-10, 4], [10, 2], [0, -8], [-14, 22], [18, 22]].forEach(([dx, dz]) => bush(ruins.x + dx, ruins.z + dz, 1.5));
  loot({ x: ruins.x, z: ruins.z + 4, kind: 'weapon:OCTA_AR' }, { x: ruins.x - 10, z: ruins.z - 6, kind: 'medkit' },
    { x: ruins.x + 14, z: ruins.z - 8, kind: 'ammo' }, { x: ruins.x + 4, z: ruins.z + 18, kind: 'armor' });

  // ---------- 11. المزرعة — The Farm (west-south) ----------
  const farm = poi('farm', 'المزرعة', 'The Farm', -85, 75, 36);
  add(building({ x: farm.x, z: farm.z, w: 16, d: 11, h: 5.5, door: 's', style: 'barn' }));
  add(building({ x: farm.x + 18, z: farm.z - 10, w: 8, d: 7, h: 3.4, door: 'w', style: 'plaster', stairs: true }));
  colliders.push(box(farm.x - 14, farm.z - 8, 5, 5, 11, 'landmark'));
  props.push({ kind: 'silo', x: farm.x - 14, z: farm.z - 8, rot: 0, scale: 1 });
  for (let i = 0; i < 10; i++) cover(farm.x - 20 + (i % 5) * 9, farm.z + 16 + Math.floor(i / 5) * 8, 1.8, 1.8, 1.4, 'hay');
  loot({ x: farm.x, z: farm.z, kind: 'weapon:DESERT_CLAW' }, { x: farm.x + 18, z: farm.z - 10, kind: 'weapon:SARB_9' },
    { x: farm.x - 6, z: farm.z + 20, kind: 'medkit' }, { x: farm.x + 6, z: farm.z + 4, kind: 'ammo' });

  // ---------- 12. برج الإرسال — Radio Tower ----------
  const radio = poi('radio', 'برج الإرسال', 'Radio Tower', 90, 95, 26);
  colliders.push(box(radio.x, radio.z, 3, 3, 30, 'landmark'));
  props.push({ kind: 'mast', x: radio.x, z: radio.z, rot: 0, scale: 1 });
  add(building({ x: radio.x + 10, z: radio.z + 6, w: 8, d: 7, h: 3.4, door: 'w', style: 'concrete', stairs: true }));
  [[-8, -6], [-10, 8], [12, -10]].forEach(([dx, dz]) => cover(radio.x + dx, radio.z + dz, 3.6, 1.0, 1.1, 'sandbag'));
  loot({ x: radio.x + 10, z: radio.z + 6, kind: 'weapon:SAQR_DMR' }, { x: radio.x - 4, z: radio.z + 4, kind: 'medkit' },
    { x: radio.x + 6, z: radio.z - 8, kind: 'ammo' });

  // ---------- roads between the locations (visual) ----------
  const link = [['town', 'ruins'], ['ruins', 'souq'], ['fort', 'ruins'], ['ruins', 'port'], ['town', 'village'],
    ['town', 'wadi'], ['souq', 'base'], ['souq', 'hills'], ['port', 'wadi'], ['fort', 'base'], ['farm', 'ruins'], ['radio', 'port']];
  const at = Object.fromEntries(pois.map((p) => [p.id, p]));
  for (const [a, b] of link) props.push({ kind: 'road', x1: at[a].x, z1: at[a].z, x2: at[b].x, z2: at[b].z, x: 0, z: 0 });
  // abandoned cars on the roads: cover in the open
  for (const [a, b] of link.slice(0, 8)) {
    const t = 0.35 + rng() * 0.3;
    const x = at[a].x + (at[b].x - at[a].x) * t + 4, z = at[a].z + (at[b].z - at[a].z) * t;
    cover(x, z, 4.4, 2.0, 1.6, 'car', { rot: rng() < 0.5 ? 0 : Math.PI / 2 });
  }

  // ---------- open ground: scattered cover and bushes so nothing is a killing field ----------
  const nearPoi = (x, z, pad) => pois.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + pad);
  let placed = 0;
  for (let i = 0; i < 900 && placed < 150; i++) {
    const x = (rng() * 2 - 1) * (MAP_HALF - 14), z = (rng() * 2 - 1) * (MAP_HALF - 14);
    if (x > 222) continue;                                       // the sea
    if (nearPoi(x, z, 6)) continue;
    const r = rng();
    if (r < 0.38) cover(x, z, 3.2, 3.0, 1.6 + rng() * 0.8, 'rock');
    else if (r < 0.58) { const c = box(x, z, 5 + rng() * 4, 0.8, 1.2 + rng() * 1.4, 'ruin'); c.style = 'stone'; colliders.push(c); }
    else if (r < 0.7) cover(x, z, 3.6, 1.0, 1.1, 'sandbag');
    else bush(x, z, 1.3 + rng() * 0.6);
    placed++;
  }
  // a little open-ground loot so a bad landing is recoverable
  for (let i = 0; i < 18; i++) {
    const x = (rng() * 2 - 1) * 200, z = (rng() * 2 - 1) * 200;
    if (nearPoi(x, z, 0)) continue;
    loot({ x, z, kind: i % 3 === 0 ? 'medkit' : 'ammo' });
  }

  // ---------- world boundary walls ----------
  const S = MAP_HALF;
  colliders.push(box(0, -S, S * 2, 2, 12, 'bounds'));
  colliders.push(box(0, S, S * 2, 2, 12, 'bounds'));
  colliders.push(box(-S, 0, 2, S * 2, 12, 'bounds'));
  colliders.push(box(S, 0, 2, S * 2, 12, 'bounds'));

  // Bot spawns, one per location by default. Candidates let the Game vary the
  // layout per match and keep bots off the player's landing point.
  const botNames = ['Fahad', 'Nasser', 'Layla', 'Salem', 'MansourBot', 'Huda', 'Majid', 'Rashid', 'Noura'];
  const botCandidates = [
    { x: town.x - 3, z: town.z + 9 }, { x: town.x + 12, z: town.z - 2 }, { x: fort.x + 6, z: fort.z + 8 },
    { x: port.x - 4, z: port.z - 12 }, { x: port.x - 24, z: port.z + 16 }, { x: souq.x - 18, z: souq.z },
    { x: souq.x + 26, z: souq.z }, { x: wadi.x + 4, z: wadi.z - 12 }, { x: vil.x - 4, z: vil.z + 4 },
    { x: oasis.x - 26, z: oasis.z + 4 }, { x: hill.x - 26, z: hill.z - 8 }, { x: base.x + 8, z: base.z - 12 },
    { x: ruins.x - 12, z: ruins.z + 4 }, { x: farm.x + 8, z: farm.z + 12 }, { x: radio.x - 12, z: radio.z },
  ];
  const defaults = [0, 2, 3, 5, 7, 8, 10, 11, 13];
  const spawns = {
    player: { x: -40, z: 40 },
    npcMansour: { x: vil.x + 2, z: vil.z + 2 },
    bots: defaults.map((i, k) => ({ ...botCandidates[i], name: botNames[k] })),
    botCandidates,
    botNames,
  };

  return { colliders, buildings, props, lootSpots, bushes, pois, spawns, oasis, half: MAP_HALF, center: { x: 0, z: 0 } };
}

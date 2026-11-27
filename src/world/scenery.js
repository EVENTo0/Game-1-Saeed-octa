import * as THREE from 'three';

/**
 * Everything that makes the island feel like a place rather than a test
 * level, and costs almost nothing: a ring of distant mountains, thousands of
 * instanced shrubs, grass and stones, a cloud layer and drifting dust. None of
 * it collides, and it adds ~6 draw calls in total.
 */

function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DENSITY = { low: 0.25, med: 1, high: 1.9 };

export function buildScenery(map, { quality = 'med', horizon = new THREE.Color(0xeee0c6) } = {}) {
  const group = new THREE.Group();
  const disposables = [];
  const rng = rngFrom(4242);
  const half = map.half ?? 260;
  const k = DENSITY[quality] ?? 1;

  // ---------- distant mountains: a jagged ring with aerial haze ----------
  {
    const SEG = 160, RINGS = 7;
    const r0 = half + 90, r1 = half + 300;
    const pos = [], col = [], idx = [];
    const rock = new THREE.Color(0xb48e66), sand = new THREE.Color(0xe0bb86);
    const hz = horizon.clone();
    const ridge = (a, t) => {
      const n = Math.sin(a * 5) * 0.5 + Math.sin(a * 11 + 1.3) * 0.3 + Math.sin(a * 23 + 0.7) * 0.15 + Math.sin(a * 47) * 0.06;
      // foothills first, peaks toward the back: no wall right at the map edge
      const peak = Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.85 + 0.05)), 1.6) * (0.35 + 0.65 * t);
      return Math.max(0, (95 + n * 70) * peak * (0.7 + 0.3 * Math.sin(a * 3 + 2)));
    };
    for (let j = 0; j < RINGS; j++) {
      const t = j / (RINGS - 1);
      const r = r0 + (r1 - r0) * t;
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * Math.PI * 2;
        const jitter = (Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1;
        const h = ridge(a, t) + (j > 0 && j < RINGS - 1 ? jitter * 6 : 0);
        pos.push(Math.cos(a) * r, h - 1, Math.sin(a) * r);
        const c = rock.clone().lerp(sand, Math.min(1, Math.max(0, 1 - h / 120)));
        c.lerp(hz, 0.45 + 0.3 * t);                       // further = hazier
        col.push(c.r, c.g, c.b);
      }
    }
    for (let j = 0; j < RINGS - 1; j++) {
      for (let i = 0; i < SEG; i++) {
        const a = j * (SEG + 1) + i, b = a + SEG + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false, flatShading: true });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.renderOrder = -0.5;
    group.add(m);
    disposables.push(geo, mat);
  }

  // ---------- ground cover: shrubs, grass and stones, instanced ----------
  const blocked = (x, z) => {
    if (x > half - 40) return true;                      // the sea and quay
    for (const c of map.colliders) {
      if (c.tag === 'bounds') continue;
      if (Math.abs(x - c.x) < c.hw + 0.9 && Math.abs(z - c.z) < c.hd + 0.9) return true;
    }
    for (const p of map.props) {
      if (p.kind !== 'road') continue;
      const dx = p.x2 - p.x1, dz = p.z2 - p.z1, L2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - p.x1) * dx + (z - p.z1) * dz) / L2));
      if (Math.hypot(x - (p.x1 + dx * t), z - (p.z1 + dz * t)) < 3.5) return true;
    }
    return false;
  };
  const scatter = (count, geo, mat, scale, yOff, opts = {}) => {
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const e = new THREE.Euler();
    const color = new THREE.Color();
    let n = 0;
    for (let tries = 0; n < count && tries < count * 6; tries++) {
      // cluster near the named locations and water, sparser in the open
      let x, z;
      if (opts.cluster && rng() < 0.55) {
        const poi = map.pois[Math.floor(rng() * map.pois.length)];
        const a = rng() * Math.PI * 2, d = poi.r * (0.6 + rng() * 0.9);
        x = poi.x + Math.cos(a) * d; z = poi.z + Math.sin(a) * d;
      } else {
        x = (rng() * 2 - 1) * (half - 6); z = (rng() * 2 - 1) * (half - 6);
      }
      if (blocked(x, z)) continue;
      const sc = scale[0] + rng() * (scale[1] - scale[0]);
      e.set((rng() - 0.5) * 0.2, rng() * Math.PI * 2, (rng() - 0.5) * 0.2);
      q.setFromEuler(e);
      s.set(sc * (0.8 + rng() * 0.4), sc * (opts.flat ?? 1), sc * (0.8 + rng() * 0.4));
      p.set(x, yOff * sc, z);
      m4.compose(p, q, s);
      mesh.setMatrixAt(n, m4);
      if (opts.tints) {
        color.set(opts.tints[Math.floor(rng() * opts.tints.length)]);
        color.offsetHSL(0, 0, (rng() - 0.5) * 0.08);
        mesh.setColorAt(n, color);
      }
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    group.add(mesh);
    disposables.push(geo, mat, mesh);
    return mesh;
  };

  // desert shrubs: a lumpy low dome in olive and dry gold
  const shrubGeo = new THREE.IcosahedronGeometry(0.6, 0);
  shrubGeo.scale(1, 0.62, 1);
  scatter(Math.round(900 * k), shrubGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), [0.6, 1.5], 0.3,
    { cluster: true, tints: [0x6e7f3e, 0x8a8a48, 0xa98f52, 0x5e7036] });

  // grass tufts: five thin blades merged into one geometry
  const blades = [];
  for (let i = 0; i < 5; i++) {
    const b = new THREE.ConeGeometry(0.05, 0.75, 3);
    b.translate(0, 0.37, 0);
    b.rotateZ((i - 2) * 0.22);
    b.rotateY(i * 1.3);
    blades.push(b);
  }
  const grassGeo = mergeLite(blades);
  scatter(Math.round(1600 * k), grassGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), [0.6, 1.3], 0,
    { cluster: true, tints: [0xb9a35c, 0xc8b06a, 0x9a9a52, 0xd2b878] });

  // loose stones
  const stoneGeo = new THREE.DodecahedronGeometry(0.35, 0);
  scatter(Math.round(700 * k), stoneGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), [0.4, 1.4], 0.1,
    { flat: 0.6, tints: [0x9a8a78, 0x857463, 0xa89478] });

  // ---------- clouds: soft puffs high above, drifting ----------
  const cloudGeo = new THREE.SphereGeometry(1, 10, 6);
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xc9c2b8, emissiveIntensity: 0.55, fog: false, transparent: true, opacity: 0.92 });
  const PUFFS = quality === 'low' ? 60 : 160;
  const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, PUFFS);
  {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let n = 0;
    const banks = Math.ceil(PUFFS / 8);
    for (let b = 0; b < banks && n < PUFFS; b++) {
      const cx = (rng() * 2 - 1) * 650, cz = (rng() * 2 - 1) * 650, cy = 250 + rng() * 80;   // above the plane
      const size = 14 + rng() * 16;
      for (let i = 0; i < 8 && n < PUFFS; i++) {
        p.set(cx + (rng() - 0.5) * size * 3, cy + (rng() - 0.5) * size * 0.4, cz + (rng() - 0.5) * size * 1.6);
        const r = size * (0.5 + rng() * 0.6);
        s.set(r * 1.4, r * 0.55, r);
        m4.compose(p, q, s);
        clouds.setMatrixAt(n++, m4);
      }
    }
    clouds.count = n;
  }
  clouds.frustumCulled = false;
  group.add(clouds);
  disposables.push(cloudGeo, cloudMat, clouds);

  // ---------- dust: a few hundred motes that follow the camera ----------
  const DUST = quality === 'low' ? 0 : 260;
  let dust = null;
  if (DUST) {
    const dg = new THREE.BufferGeometry();
    const arr = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) {
      arr[i * 3] = (rng() - 0.5) * 40; arr[i * 3 + 1] = rng() * 8; arr[i * 3 + 2] = (rng() - 0.5) * 40;
    }
    dg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const dm = new THREE.PointsMaterial({ color: 0xf0d9a8, size: 0.06, transparent: true, opacity: 0.55, depthWrite: false });
    dust = new THREE.Points(dg, dm);
    dust.frustumCulled = false;
    group.add(dust);
    disposables.push(dg, dm);
  }

  return {
    group,
    update(dt, camera, t) {
      clouds.position.x = Math.sin(t * 0.004) * 120;   // slow drift, no visible wrap
      if (dust) {
        // wrap motes in a 40 m box around the camera and let the wind carry them
        const a = dust.geometry.attributes.position;
        const cx = camera.position.x, cz = camera.position.z, cy = Math.max(0, camera.position.y - 4);
        for (let i = 0; i < a.count; i++) {
          let x = a.getX(i) + dt * 1.6, y = a.getY(i) + Math.sin(t + i) * dt * 0.3, z = a.getZ(i) + dt * 0.5;
          if (x - cx > 20) x -= 40; else if (cx - x > 20) x += 40;
          if (z - cz > 20) z -= 40; else if (cz - z > 20) z += 40;
          if (y - cy > 8) y -= 8; else if (y < cy) y += 8;
          a.setXYZ(i, x, y, z);
        }
        a.needsUpdate = true;
      }
    },
    dispose() { disposables.forEach((d) => d.dispose?.()); },
  };
}

/** Merge same-attribute geometries without pulling in the full utils module. */
function mergeLite(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  geos.forEach((g) => g.dispose());
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

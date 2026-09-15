import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Placeholder low-poly characters, built from primitives at runtime (zero asset
 * download, ~300 tris each). They expose the SAME rig part names a real GLB
 * skeleton would, so `Animator` keeps working when art is swapped in later —
 * see ARCHITECTURE.md "Replacing placeholder characters".
 */

export const PALETTE = {
  armor: 0x14121c,
  armorLight: 0x2a2240,
  purple: 0x6f3ff5,
  purpleLight: 0x9b7bff,
  gold: 0xd4a72c,
  skin: 0xb07a4e,
  cloth: 0x201a30,
  octa: 0x8b4cf0,
  visor: 0x39e0d0,
};

const mat = (color, opts = {}) =>
  new THREE.MeshLambertMaterial({ color, ...opts });

function part(geo, material, x, y, z) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/**
 * @param {{primary?:number, accent?:number, cloth?:number, emblem?:boolean, scale?:number}} opts
 * @returns {{root:THREE.Group, rig:Record<string,THREE.Object3D>, dispose:Function}}
 */
export function buildHumanoid(opts = {}) {
  const primary = opts.primary ?? PALETTE.armor;
  const accent = opts.accent ?? PALETTE.purple;
  const gold = opts.gold ?? PALETTE.gold;
  const cloth = opts.cloth ?? PALETTE.cloth;

  const root = new THREE.Group();
  const mArmor = mat(primary);
  const mAccent = mat(accent);
  const mGold = mat(gold);
  const mSkin = mat(PALETTE.skin);
  const mCloth = mat(cloth);
  const mVisor = new THREE.MeshBasicMaterial({ color: opts.visor ?? PALETTE.visor });
  const materials = [mArmor, mAccent, mGold, mSkin, mCloth, mVisor];

  // hips -> spine -> chest -> head, arms and legs hang off spine/hips
  const hips = new THREE.Group(); hips.position.y = 0.92; root.add(hips);
  const spine = new THREE.Group(); hips.add(spine);

  const torso = part(new THREE.BoxGeometry(0.52, 0.62, 0.3), mArmor, 0, 0.3, 0);
  spine.add(torso);
  // chest plate + gold trim
  spine.add(part(new THREE.BoxGeometry(0.44, 0.26, 0.34), mAccent, 0, 0.42, 0.01));
  spine.add(part(new THREE.BoxGeometry(0.46, 0.05, 0.33), mGold, 0, 0.26, 0.02));
  // shoulder pads
  spine.add(part(new THREE.BoxGeometry(0.18, 0.16, 0.28), mAccent, -0.33, 0.5, 0));
  spine.add(part(new THREE.BoxGeometry(0.18, 0.16, 0.28), mAccent, 0.33, 0.5, 0));

  const head = new THREE.Group(); head.position.y = 0.72; spine.add(head);
  head.add(part(new THREE.BoxGeometry(0.26, 0.28, 0.26), mSkin, 0, 0.02, 0));
  // shemagh-style hood
  head.add(part(new THREE.BoxGeometry(0.32, 0.16, 0.32), mCloth, 0, 0.16, 0));
  head.add(part(new THREE.BoxGeometry(0.30, 0.22, 0.10), mCloth, 0, -0.02, -0.14));
  // octopus goggles: visor band + two round lenses + tiny tentacle nubs
  head.add(part(new THREE.BoxGeometry(0.30, 0.09, 0.06), mArmor, 0, 0.04, 0.14));
  const lens = new THREE.SphereGeometry(0.055, 8, 6);
  head.add(part(lens, mVisor, -0.075, 0.045, 0.165));
  head.add(part(lens, mVisor, 0.075, 0.045, 0.165));
  if (opts.emblem !== false) {
    const nub = new THREE.SphereGeometry(0.022, 6, 4);
    for (let i = 0; i < 4; i++) {
      head.add(part(nub, mGold, -0.12 + i * 0.08, 0.10, 0.16));
    }
    // OCTA emblem on the chest
    spine.add(part(new THREE.SphereGeometry(0.06, 8, 6), mGold, 0, 0.42, 0.18));
  }

  const armGeo = new THREE.BoxGeometry(0.13, 0.5, 0.13);
  const legGeo = new THREE.BoxGeometry(0.16, 0.52, 0.17);

  const armL = new THREE.Group(); armL.position.set(-0.34, 0.5, 0); spine.add(armL);
  armL.add(part(armGeo, mArmor, 0, -0.25, 0));
  armL.add(part(new THREE.BoxGeometry(0.14, 0.08, 0.14), mGold, 0, -0.46, 0));
  const armR = new THREE.Group(); armR.position.set(0.34, 0.5, 0); spine.add(armR);
  armR.add(part(armGeo, mArmor, 0, -0.25, 0));
  armR.add(part(new THREE.BoxGeometry(0.14, 0.08, 0.14), mGold, 0, -0.46, 0));

  const legL = new THREE.Group(); legL.position.set(-0.14, 0, 0); hips.add(legL);
  legL.add(part(legGeo, mCloth, 0, -0.28, 0));
  legL.add(part(new THREE.BoxGeometry(0.18, 0.1, 0.24), mArmor, 0, -0.52, 0.03));
  const legR = new THREE.Group(); legR.position.set(0.14, 0, 0); hips.add(legR);
  legR.add(part(legGeo, mCloth, 0, -0.28, 0));
  legR.add(part(new THREE.BoxGeometry(0.18, 0.1, 0.24), mArmor, 0, -0.52, 0.03));

  // Weapon socket on the right hand. The arm hangs down the -Y axis, so the
  // socket is rotated a quarter turn: a weapon modelled pointing down its own
  // +Z then points wherever the arm points.
  const weaponSocket = new THREE.Group();
  weaponSocket.position.set(0, -0.44, 0.05);
  weaponSocket.rotation.x = Math.PI / 2;
  armR.add(weaponSocket);

  const scale = opts.scale ?? 1;
  root.scale.setScalar(scale);

  compactRig({ hips, spine, head, armL, armR, legL, legR });

  return {
    root,
    rig: { hips, spine, head, armL, armR, legL, legR, weaponSocket },
    materials,
    dispose() {
      root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      materials.forEach((m) => m.dispose());
    },
  };
}

/**
 * Collapse each animated rig node's own meshes down to one mesh per material.
 * The nodes still rotate independently, so animation is unaffected, but a
 * character drops from ~25 draw calls to ~12 — with six of them on screen that
 * is the difference between 30 and 60fps on a mid-range phone.
 */
function compactRig(rig) {
  for (const node of Object.values(rig)) {
    const meshes = node.children.filter((c) => c.isMesh && c.geometry && !Array.isArray(c.material));
    if (meshes.length < 2) continue;
    const byMat = new Map();
    for (const m of meshes) {
      if (!byMat.has(m.material)) byMat.set(m.material, []);
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone());
      m.updateMatrix();
      g.applyMatrix4(m.matrix);
      byMat.get(m.material).push(g);
    }
    for (const m of meshes) node.remove(m);
    for (const [material, geos] of byMat) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      geos.forEach((g) => { if (g !== merged) g.dispose(); });
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = true;
      node.add(mesh);
    }
  }
}

/** SAEED — hero colours: black/deep-purple tactical armour with gold detail. */
export function buildSaeed() {
  return buildHumanoid({
    primary: PALETTE.armor, accent: PALETTE.purple, gold: PALETTE.gold,
    cloth: PALETTE.cloth, emblem: true,
  });
}

const BOT_SKINS = [
  { primary: 0x3a2f28, accent: 0x8c5a2b, gold: 0xbfae7a },
  { primary: 0x24313a, accent: 0x2b7f8c, gold: 0xa8c0c4 },
  { primary: 0x33243a, accent: 0x8c2b6b, gold: 0xc4a0bb },
  { primary: 0x2c3a24, accent: 0x5a8c2b, gold: 0xb6c47a },
  { primary: 0x3a2424, accent: 0x8c2b2b, gold: 0xc47a7a },
];
export function buildBotModel(index) {
  const skin = BOT_SKINS[index % BOT_SKINS.length];
  return buildHumanoid({ ...skin, cloth: 0x1d1d22, emblem: false, visor: 0xff5a4a });
}

/** عم منصور — friendly villager, no armour, coffee pot in hand. */
export function buildMansour() {
  const h = buildHumanoid({
    primary: 0xe8e2d4, accent: 0xd8d0be, gold: 0x8c7a4a,
    cloth: 0xcfc6b2, emblem: false, visor: 0x4a3a2a, scale: 1.02,
  });
  const potMat = mat(0xd4a72c);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.2, 8), potMat);
  pot.position.set(0, -0.05, 0.02);
  h.rig.weaponSocket.add(pot);
  h.materials.push(potMat);
  return h;
}

/** OCTA — small purple octopus companion. */
export function buildOcta() {
  const root = new THREE.Group();
  const body = mat(PALETTE.octa);
  const eye = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pupil = new THREE.MeshBasicMaterial({ color: 0x140f22 });
  const goldM = mat(PALETTE.gold);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), body);
  head.scale.set(1, 1.15, 1);
  head.castShadow = true;
  root.add(head);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.022, 6, 14), goldM);
  band.position.y = 0.1;
  band.rotation.x = Math.PI / 2;
  head.add(band);

  const eL = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), eye);
  eL.position.set(-0.1, 0.06, 0.2); head.add(eL);
  const eR = eL.clone(); eR.position.x = 0.1; head.add(eR);
  const pL = new THREE.Mesh(new THREE.SphereGeometry(0.038, 6, 5), pupil);
  pL.position.set(-0.1, 0.06, 0.26); head.add(pL);
  const pR = pL.clone(); pR.position.x = 0.1; head.add(pR);

  const tentacles = [];
  const tgeo = new THREE.ConeGeometry(0.055, 0.34, 6);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const t = new THREE.Group();
    t.position.set(Math.cos(a) * 0.15, -0.2, Math.sin(a) * 0.15);
    const m = new THREE.Mesh(tgeo, body);
    m.position.y = -0.15;
    m.rotation.x = Math.PI;
    t.add(m);
    t.userData.phase = a;
    root.add(t);
    tentacles.push(t);
  }
  return {
    root,
    rig: { head, tentacles },
    materials: [body, eye, pupil, goldM],
    dispose() {
      root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    },
  };
}

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { getSharedTextures } from '../world/textures.js';

/**
 * Placeholder low-poly characters, built from primitives at runtime (zero asset
 * download, ~300 tris each). They expose the SAME rig part names a real GLB
 * skeleton would, so `Animator` keeps working when art is swapped in later —
 * see ARCHITECTURE.md "Replacing placeholder characters".
 */

export const PALETTE = {
  armor: 0x3a3452,
  armorLight: 0x3a3055,
  purple: 0x8250ff,
  purpleLight: 0x9b7bff,
  gold: 0xe8bd47,
  skin: 0xb07a4e,
  cloth: 0x463d63,
  octa: 0x8b4cf0,
  visor: 0x39e0d0,
};

/**
 * Characters use the same PBR pipeline as the world. With MeshLambertMaterial
 * they ignored the environment map entirely and read as flat black cut-outs
 * next to textured terrain.
 */
function mat(color, opts = {}) {
  const { surface, family = 'hard', ...rest } = opts;
  const t = surface ? getSharedTextures(CHAR_QUALITY).maps?.[surface] : null;
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: rest.roughness ?? (t ? t.roughness : 0.78),
    metalness: rest.metalness ?? (t ? t.metalness : 0.0),
    map: t ? t.map : null,
    normalMap: t ? t.normalMap : null,
    ...rest,
  });
  // Authoring material: its colour is baked into vertex colours at build time
  // and it is then thrown away (see compactRig).
  m.userData.family = family;
  return m;
}

/**
 * One material per SURFACE FAMILY, shared by every character on the map.
 *
 * Detailed characters were costing ~25 draw calls each (7 materials x 7
 * animated nodes), which put the frame at 178 calls with six of them on
 * screen. Baking each part's colour into vertex colours collapses that to two
 * materials per node without losing a single visual detail.
 */
let familyMaterials = null;
function getFamilyMaterials() {
  if (familyMaterials) return familyMaterials;
  const t = getSharedTextures(CHAR_QUALITY).maps ?? {};
  familyMaterials = {
    hard: new THREE.MeshStandardMaterial({
      // Metalness above ~0.2 turns dark tactical colours into pure silhouette,
      // because metals have no diffuse term.
      vertexColors: true, roughness: 0.48, metalness: 0.14,
      // colour comes from the vertex colours; the dark albedo map would
      // multiply every outfit towards black, so only the surface detail is used
      normalMap: t.armour?.normalMap ?? null,
    }),
    soft: new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.93, metalness: 0.0,
      normalMap: t.cloth?.normalMap ?? null,
    }),
  };
  return familyMaterials;
}
export function clearCharacterMaterials() {
  if (!familyMaterials) return;
  Object.values(familyMaterials).forEach((m) => m.dispose());
  familyMaterials = null;
}

/** Quality the character textures were built at; set once by the Game. */
let CHAR_QUALITY = 'med';
export function setCharacterQuality(q) { CHAR_QUALITY = q; }

/**
 * Bevelled box: the corner radius scales with the part, so limbs read as
 * rounded forms and thin trim keeps a crisp edge. Hard 90-degree corners are
 * what made the first-generation characters look like crates.
 */
function RB(w, h, d) {
  const r = Math.min(0.045, Math.min(w, h, d) * 0.34);
  return new RoundedBoxGeometry(w, h, d, 2, r);
}

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
  const mArmor = mat(primary, { family: 'hard' });
  const mAccent = mat(accent, { family: 'hard' });
  const mGold = mat(gold, { family: 'hard' });
  const mSkin = mat(PALETTE.skin, { family: 'soft' });
  const mCloth = mat(cloth, { family: 'soft' });
  const mRubber = mat(0x26242e, { family: 'hard' });
  // the visor glows, so it stays unlit and emissive
  const mVisor = new THREE.MeshStandardMaterial({
    color: opts.visor ?? PALETTE.visor,
    emissive: new THREE.Color(opts.visor ?? PALETTE.visor),
    emissiveIntensity: 1.4, roughness: 0.15, metalness: 0.1,
  });
  const materials = [mArmor, mAccent, mGold, mSkin, mCloth, mVisor, mRubber];

  // hips -> spine -> chest -> head, arms and legs hang off spine/hips.
  // v2.2 body: capsule limbs, a shaped torso, helmet, plate carrier and a
  // backpack. Same rig node names as before, so animation is unchanged.
  const hips = new THREE.Group(); hips.position.y = 0.92; root.add(hips);
  const spine = new THREE.Group(); hips.add(spine);
  const cap = (r, len, m, x, y, z, sx = 1, sz = 1) => {
    const mesh = part(new THREE.CapsuleGeometry(r, len, 3, 10), m, x, y, z);
    mesh.scale.set(sx, 1, sz);
    return mesh;
  };
  const ball = (r, m, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const mesh = part(new THREE.SphereGeometry(r, 12, 8), m, x, y, z);
    mesh.scale.set(sx, sy, sz);
    return mesh;
  };

  // pelvis and torso
  spine.add(part(RB(0.36, 0.2, 0.24), mCloth, 0, 0.06, 0));                    // pelvis
  spine.add(cap(0.19, 0.26, mCloth, 0, 0.38, 0, 1.28, 0.78));                  // shirt torso
  // plate carrier: front and back plates, side cummerbund, shoulder straps
  spine.add(part(RB(0.42, 0.36, 0.07), mArmor, 0, 0.42, 0.135));
  spine.add(part(RB(0.42, 0.38, 0.07), mArmor, 0, 0.43, -0.13));
  spine.add(part(RB(0.47, 0.16, 0.3), mArmor, 0, 0.3, 0));
  for (const sx of [-0.13, 0.13]) spine.add(part(RB(0.07, 0.05, 0.3), mArmor, sx, 0.62, 0));
  // magazine pouches and radio
  for (let i = -1; i <= 1; i++) spine.add(part(RB(0.1, 0.13, 0.06), mRubber, i * 0.12, 0.33, 0.18));
  spine.add(part(RB(0.06, 0.14, 0.06), mRubber, -0.2, 0.5, 0.15));
  spine.add(part(RB(0.44, 0.04, 0.32), mGold, 0, 0.215, 0));                  // trim
  spine.add(part(RB(0.4, 0.07, 0.27), mRubber, 0, 0.12, 0));                  // belt
  // backpack with a bedroll on top: the silhouette that reads "battle royale"
  spine.add(part(RB(0.34, 0.4, 0.17), mAccent, 0, 0.42, -0.25));
  spine.add(part(RB(0.26, 0.16, 0.08), mCloth, 0, 0.33, -0.36));
  const roll = part(new THREE.CylinderGeometry(0.07, 0.07, 0.36, 10), mCloth, 0, 0.67, -0.25);
  roll.rotation.z = Math.PI / 2; spine.add(roll);
  // shoulders
  spine.add(ball(0.1, mAccent, -0.29, 0.6, 0, 1.15, 0.85, 1.1));
  spine.add(ball(0.1, mAccent, 0.29, 0.6, 0, 1.15, 0.85, 1.1));
  // neck
  spine.add(cap(0.06, 0.06, mSkin, 0, 0.71, 0));

  const head = new THREE.Group(); head.position.y = 0.8; spine.add(head);
  head.add(ball(0.125, mSkin, 0, 0.02, 0, 0.95, 1.08, 1));                    // head
  head.add(ball(0.055, mSkin, 0, -0.06, 0.08, 1.1, 0.8, 0.9));               // jaw
  // shemagh round the neck and lower face
  head.add(part(new THREE.CylinderGeometry(0.115, 0.13, 0.1, 12), mCloth, 0, -0.09, 0));
  // helmet: shell, brim and side rails
  head.add(part(new THREE.SphereGeometry(0.152, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mArmor, 0, 0.04, -0.005));
  head.add(part(new THREE.CylinderGeometry(0.158, 0.158, 0.035, 14), mArmor, 0, 0.045, -0.005));
  for (const sx of [-1, 1]) head.add(part(RB(0.02, 0.05, 0.16), mRubber, sx * 0.152, 0.07, 0));
  // octopus goggles: band, two lenses, tentacle nubs
  head.add(part(RB(0.25, 0.055, 0.05), mRubber, 0, 0.03, 0.105));
  const lens = new THREE.SphereGeometry(0.045, 10, 8);
  head.add(part(lens, mVisor, -0.058, 0.032, 0.125));
  head.add(part(lens, mVisor, 0.058, 0.032, 0.125));
  if (opts.emblem !== false) {
    const nub = new THREE.SphereGeometry(0.02, 6, 4);
    for (let i = 0; i < 4; i++) head.add(part(nub, mGold, -0.09 + i * 0.06, 0.15, 0.1));
    spine.add(part(new THREE.SphereGeometry(0.05, 10, 8), mGold, 0, 0.5, 0.175));   // OCTA emblem
  }

  // Arms: sleeve, forearm, glove; pivot at the shoulder.
  const buildArm = (side) => {
    const g = new THREE.Group();
    g.position.set(side * 0.33, 0.6, 0);
    g.add(cap(0.068, 0.16, mCloth, 0, -0.14, 0));
    g.add(part(RB(0.15, 0.1, 0.15), mAccent, 0, -0.07, 0));                  // upper arm guard
    g.add(cap(0.058, 0.18, mCloth, 0, -0.37, 0));
    g.add(part(new THREE.CylinderGeometry(0.066, 0.066, 0.05, 10), mGold, 0, -0.475, 0));   // cuff
    g.add(ball(0.062, mRubber, 0, -0.545, 0.01, 1, 1.15, 1.1));              // glove
    spine.add(g);
    return g;
  };
  const armL = buildArm(-1);
  const armR = buildArm(1);

  // Legs: thigh, knee pad, shin, boot; pivot at the hip.
  const buildLeg = (side) => {
    const g = new THREE.Group();
    g.position.set(side * 0.12, 0, 0);
    g.add(cap(0.088, 0.2, mCloth, 0, -0.18, 0));
    g.add(part(RB(0.06, 0.12, 0.13), mRubber, side * 0.085, -0.2, 0.02));    // thigh pocket
    g.add(cap(0.072, 0.2, mCloth, 0, -0.45, 0));
    g.add(ball(0.07, mArmor, 0, -0.32, 0.055, 1.05, 1.05, 0.7));             // knee pad
    g.add(part(RB(0.15, 0.12, 0.26), mRubber, 0, -0.615, 0.035));            // boot
    g.add(part(RB(0.155, 0.035, 0.27), mArmor, 0, -0.665, 0.035));           // sole
    hips.add(g);
    return g;
  };
  const legL = buildLeg(-1);
  const legR = buildLeg(1);

  // Weapon socket on the right hand. The arm hangs down the -Y axis, so the
  // socket is rotated a quarter turn: a weapon modelled pointing down its own
  // +Z then points wherever the arm points.
  const weaponSocket = new THREE.Group();
  weaponSocket.position.set(0, -0.56, 0.05);
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
  const fam = getFamilyMaterials();
  for (const node of Object.values(rig)) {
    const meshes = node.children.filter((c) => c.isMesh && c.geometry && !Array.isArray(c.material));
    if (!meshes.length) continue;
    const groups = new Map();                 // family key -> geometries
    const keep = [];
    for (const m of meshes) {
      const family = m.material.userData?.family;
      if (!family || !fam[family]) { keep.push(m); continue; }   // e.g. the emissive visor
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone());
      m.updateMatrix();
      g.applyMatrix4(m.matrix);
      // bake this part's colour into the geometry
      const c = m.material.color.clone().convertSRGBToLinear();
      const n = g.attributes.position.count;
      const colors = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      if (!groups.has(family)) groups.set(family, []);
      groups.get(family).push(g);
    }
    if (!groups.size) continue;
    for (const m of meshes) { if (!keep.includes(m)) node.remove(m); }
    for (const [family, geos] of groups) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      geos.forEach((g) => { if (g !== merged) g.dispose(); });
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, fam[family]);
      mesh.castShadow = true;
      node.add(mesh);
    }
  }
}

/** SAEED — hero colours: black/deep-purple tactical armour with gold detail. */
export function buildSaeed(skin = null) {
  return buildHumanoid({
    primary: skin?.primary ?? PALETTE.armor, accent: skin?.accent ?? PALETTE.purple,
    gold: skin?.gold ?? PALETTE.gold, cloth: skin?.cloth ?? PALETTE.cloth,
    visor: skin?.visor, emblem: true,
  });
}

/**
 * Parachute canopy in EVENTO purple and gold panels, with rigging lines down
 * to the harness. One shared material and vertex colours: two draw calls.
 */
export function buildParachute() {
  const root = new THREE.Group();
  const geo = new THREE.SphereGeometry(2.6, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2.4);
  geo.scale(1, 0.5, 1);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const purple = new THREE.Color(0x7a4dff).convertSRGBToLinear();
  const gold = new THREE.Color(0xe8bd47).convertSRGBToLinear();
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getZ(i), pos.getX(i)) + Math.PI;
    const c = Math.floor(a / (Math.PI * 2) * 8) % 2 ? gold : purple;
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const canopyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide });
  const canopy = new THREE.Mesh(geo, canopyMat);
  canopy.position.y = 4.2;
  canopy.castShadow = true;
  root.add(canopy);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x2a2238 });
  const lines = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const top = new THREE.Vector3(Math.cos(a) * 2.2, 4.4, Math.sin(a) * 2.2);
    const bottom = new THREE.Vector3(0, 1.45, 0);
    const len = top.distanceTo(bottom);
    const g = new THREE.CylinderGeometry(0.012, 0.012, len, 3);
    g.translate(0, len / 2, 0);
    const dir = top.clone().sub(bottom).normalize();
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    g.translate(bottom.x, bottom.y, bottom.z);
    lines.push(g);
  }
  const rig = new THREE.Mesh(mergeGeometries(lines, false), lineMat);
  lines.forEach((g) => g.dispose());
  root.add(rig);
  root.visible = false;
  return {
    root,
    dispose() { geo.dispose(); rig.geometry.dispose(); canopyMat.dispose(); lineMat.dispose(); },
  };
}

// Distinct tactical palettes so ten players read apart at a glance: desert
// tan, urban grey, olive, navy, maroon, multicam-ish brown...
const BOT_SKINS = [
  { primary: 0x8a7350, accent: 0x5c4a30, gold: 0xc9b07a, cloth: 0x6e5d43 },
  { primary: 0x5d6670, accent: 0x2b7f8c, gold: 0xa8c0c4, cloth: 0x4a5058 },
  { primary: 0x56613f, accent: 0x3d4a2a, gold: 0xb6c47a, cloth: 0x4b5536 },
  { primary: 0x2f3e5c, accent: 0x4a6aa0, gold: 0xa0b4d8, cloth: 0x2a3550 },
  { primary: 0x6a2f34, accent: 0x9a3b3b, gold: 0xd9a08a, cloth: 0x4f2a2d },
  { primary: 0x7a6248, accent: 0x9a7a4a, gold: 0xd8c08a, cloth: 0x5a4a38 },
  { primary: 0x40464c, accent: 0xc9772b, gold: 0xe8b060, cloth: 0x33383d },
  { primary: 0x4a3b5c, accent: 0x7a5aa0, gold: 0xc4a0e0, cloth: 0x3a2f48 },
  { primary: 0x5a5a48, accent: 0x8a8a5a, gold: 0xd0d0a0, cloth: 0x484838 },
];
export function buildBotModel(index) {
  const skin = BOT_SKINS[index % BOT_SKINS.length];
  return buildHumanoid({ ...skin, emblem: false, visor: 0xff5a4a });
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

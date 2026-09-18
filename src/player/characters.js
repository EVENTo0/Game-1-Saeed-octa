import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getSharedTextures } from '../world/textures.js';

/**
 * Placeholder low-poly characters, built from primitives at runtime (zero asset
 * download, ~300 tris each). They expose the SAME rig part names a real GLB
 * skeleton would, so `Animator` keeps working when art is swapped in later —
 * see ARCHITECTURE.md "Replacing placeholder characters".
 */

export const PALETTE = {
  armor: 0x24212f,
  armorLight: 0x3a3055,
  purple: 0x8250ff,
  purpleLight: 0x9b7bff,
  gold: 0xe8bd47,
  skin: 0xb07a4e,
  cloth: 0x2b2440,
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
      map: t.armour?.map ?? null, normalMap: t.armour?.normalMap ?? null,
    }),
    soft: new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.93, metalness: 0.0,
      map: t.cloth?.map ?? null, normalMap: t.cloth?.normalMap ?? null,
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
  const mRubber = mat(0x14141a, { family: 'hard' });
  // the visor glows, so it stays unlit and emissive
  const mVisor = new THREE.MeshStandardMaterial({
    color: opts.visor ?? PALETTE.visor,
    emissive: new THREE.Color(opts.visor ?? PALETTE.visor),
    emissiveIntensity: 1.4, roughness: 0.15, metalness: 0.1,
  });
  const materials = [mArmor, mAccent, mGold, mSkin, mCloth, mVisor, mRubber];

  // hips -> spine -> chest -> head, arms and legs hang off spine/hips
  const hips = new THREE.Group(); hips.position.y = 0.92; root.add(hips);
  const spine = new THREE.Group(); hips.add(spine);

  // Tapered torso: narrow waist under a broad chest reads as a person rather
  // than a crate, which is most of what a silhouette needs at phone size.
  spine.add(part(new THREE.BoxGeometry(0.40, 0.24, 0.26), mCloth, 0, 0.14, 0));      // waist
  const torso = part(new THREE.BoxGeometry(0.50, 0.40, 0.29), mArmor, 0, 0.42, 0);   // ribcage
  spine.add(torso);
  spine.add(part(new THREE.BoxGeometry(0.54, 0.16, 0.31), mArmor, 0, 0.58, 0));      // upper chest
  // plate carrier, magazine pouches and gold trim
  spine.add(part(new THREE.BoxGeometry(0.40, 0.30, 0.345), mAccent, 0, 0.47, 0.005));
  spine.add(part(new THREE.BoxGeometry(0.42, 0.045, 0.35), mGold, 0, 0.31, 0.01));
  for (let i = -1; i <= 1; i++) {
    spine.add(part(new THREE.BoxGeometry(0.10, 0.12, 0.07), mRubber, i * 0.12, 0.30, 0.18));
  }
  // belt
  spine.add(part(new THREE.BoxGeometry(0.44, 0.07, 0.29), mRubber, 0, 0.05, 0));
  // shoulder pads, angled outward
  const padL = part(new THREE.BoxGeometry(0.17, 0.17, 0.27), mAccent, -0.33, 0.60, 0);
  padL.rotation.z = 0.18; spine.add(padL);
  const padR = part(new THREE.BoxGeometry(0.17, 0.17, 0.27), mAccent, 0.33, 0.60, 0);
  padR.rotation.z = -0.18; spine.add(padR);
  // neck
  spine.add(part(new THREE.CylinderGeometry(0.075, 0.085, 0.10, 8), mSkin, 0, 0.70, 0));

  const head = new THREE.Group(); head.position.y = 0.78; spine.add(head);
  head.add(part(new THREE.BoxGeometry(0.235, 0.27, 0.245), mSkin, 0, 0.02, 0));
  head.add(part(new THREE.BoxGeometry(0.16, 0.09, 0.06), mSkin, 0, -0.05, 0.13));   // jaw/chin
  // shemagh wrapped over the crown and down the back of the neck
  head.add(part(new THREE.BoxGeometry(0.30, 0.15, 0.30), mCloth, 0, 0.16, 0));
  head.add(part(new THREE.BoxGeometry(0.28, 0.24, 0.10), mCloth, 0, -0.03, -0.135));
  const drape = part(new THREE.BoxGeometry(0.30, 0.18, 0.05), mCloth, 0, -0.14, -0.10);
  drape.rotation.x = -0.35; head.add(drape);
  // octopus goggles: visor band + two round lenses + tiny tentacle nubs
  head.add(part(new THREE.BoxGeometry(0.275, 0.085, 0.055), mRubber, 0, 0.045, 0.125));
  const lens = new THREE.SphereGeometry(0.052, 10, 8);
  head.add(part(lens, mVisor, -0.068, 0.048, 0.15));
  head.add(part(lens, mVisor, 0.068, 0.048, 0.15));
  head.add(part(new THREE.BoxGeometry(0.30, 0.05, 0.26), mRubber, 0, 0.055, -0.01));  // strap
  if (opts.emblem !== false) {
    const nub = new THREE.SphereGeometry(0.022, 6, 4);
    for (let i = 0; i < 4; i++) {
      head.add(part(nub, mGold, -0.105 + i * 0.07, 0.10, 0.145));
    }
    // OCTA emblem on the chest
    spine.add(part(new THREE.SphereGeometry(0.055, 10, 8), mGold, 0, 0.50, 0.185));
  }

  // Arms: upper arm, forearm, glove — a two-segment taper reads far better than
  // one straight box, even without a skeleton.
  const buildArm = (side) => {
    const g = new THREE.Group();
    g.position.set(side * 0.345, 0.60, 0);
    g.add(part(new THREE.BoxGeometry(0.135, 0.26, 0.135), mArmor, 0, -0.13, 0));
    g.add(part(new THREE.BoxGeometry(0.115, 0.24, 0.115), mCloth, 0, -0.37, 0));
    g.add(part(new THREE.BoxGeometry(0.125, 0.06, 0.125), mGold, 0, -0.505, 0));   // cuff
    g.add(part(new THREE.BoxGeometry(0.115, 0.10, 0.13), mRubber, 0, -0.565, 0.01)); // glove
    spine.add(g);
    return g;
  };
  const armL = buildArm(-1);
  const armR = buildArm(1);

  // Legs: thigh, shin, boot.
  const buildLeg = (side) => {
    const g = new THREE.Group();
    g.position.set(side * 0.135, 0, 0);
    g.add(part(new THREE.BoxGeometry(0.175, 0.30, 0.185), mCloth, 0, -0.16, 0));
    g.add(part(new THREE.BoxGeometry(0.145, 0.26, 0.16), mCloth, 0, -0.44, 0));
    g.add(part(new THREE.BoxGeometry(0.165, 0.09, 0.17), mArmor, 0, -0.30, 0.02));  // knee pad
    g.add(part(new THREE.BoxGeometry(0.175, 0.11, 0.26), mRubber, 0, -0.615, 0.035)); // boot
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

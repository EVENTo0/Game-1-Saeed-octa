import * as THREE from 'three';
import { CONFIG } from './config.js';
import { EventBus } from './events.js';
import { makeRng, damp, clamp } from './mathx.js';
import { buildMap } from '../world/mapData.js';
import { buildWorld, buildZoneVisual } from '../world/worldView.js';
import { createSky } from '../world/sky.js';
import { buildScenery } from '../world/scenery.js';
import { LootView } from '../world/lootView.js';
import { Player } from '../player/player.js';
import { Bot } from '../ai/bot.js';
import { buildSaeed, buildBotModel, buildOcta, buildMansour, buildParachute, setCharacterQuality } from '../player/characters.js';
import { clearSharedTextures } from '../world/textures.js';
import { clearCharacterMaterials } from '../player/characters.js';
import { ProceduralAnimator, AnimState, resolveState } from '../player/animator.js';
import { ThirdPersonCamera } from '../camera/thirdPersonCamera.js';
import { EffectsSystem } from '../combat/effects.js';
import { traceShot, spreadDir } from '../combat/hitscan.js';
import { computeAimAssist, viewFromPlayer } from '../combat/aimAssist.js';
import { haptics } from '../ui/haptics.js';
import { botShotDamage } from '../combat/botFire.js';
import { buildWeaponModel } from '../weapons/weaponModels.js';
import { WEAPONS } from '../weapons/weapons.js';
import { SafeZone } from '../zone/zone.js';
import { LootManager, makeLootItem } from '../loot/loot.js';
import { Airdrop } from '../loot/airdrop.js';
import { planRoute, routePoint, closestT, overMap } from '../world/flight.js';
import { buildPlane } from '../world/planeView.js';
import { segmentBlocked, resolveXZ } from '../world/collision.js';
import { Grenade, GRENADE, throwVelocity, blastDamage, predictArc } from '../combat/grenade.js';
import { Buggy, BUGGY } from '../vehicles/buggy.js';
import { buildBuggy, buildGrenadeMesh } from '../vehicles/buggyView.js';

/** Highest solid surface under a point that loot can rest on (not roofs or walls). */
function lootGround(x, z, colliders) {
  let top = 0;
  for (const c of colliders) {
    if (c.tag !== 'ground' && c.tag !== 'stair' && c.tag !== 'tower') continue;
    if (Math.abs(x - c.x) > c.hw || Math.abs(z - c.z) > c.hd) continue;
    if (c.top > top) top = c.top;
  }
  return top;
}

export const MatchState = { IDLE: 'idle', PLAYING: 'playing', PAUSED: 'paused', WON: 'won', LOST: 'lost' };

const QUALITY = {
  low:  { shadows: false, pixelRatio: 1.0,  fogNear: 60,  fogFar: 150, shadowMap: 512,  soft: false, env: false },
  med:  { shadows: true,  pixelRatio: 1.35, fogNear: 110, fogFar: 240, shadowMap: 1024, soft: false, env: true },
  high: { shadows: true,  pixelRatio: 2.0,  fogNear: 150, fogFar: 320, shadowMap: 2048, soft: true,  env: true },
};

/** Sun direction, shared by the light and the sky shader so they agree. */
// Late-afternoon sun: lower and warmer, so buildings throw long readable shadows.
const SUN_DIR = { x: 0.52, y: 0.46, z: 0.34 };

export class Game {
  constructor(canvas, { audio, hud, i18n, quality = 'med', mobile = false } = {}) {
    this.mobile = mobile;
    this.canvas = canvas;
    this.audio = audio;
    this.hud = hud;
    this.i18n = i18n;
    this.events = new EventBus();
    this.rng = makeRng(20260915);
    this.state = MatchState.IDLE;
    this.time = 0;
    this.matchTime = 0;
    this.quality = quality;

    setCharacterQuality(quality);
    this.map = buildMap();
    this.colliders = this.map.colliders;

    this._initRenderer();
    this._initScene();

    this.player = new Player(this.map.spawns.player);
    this.bots = [];
    this.zone = new SafeZone(this.map.center);
    this.loot = new LootManager(this.map.lootSpots);
    this.airdrop = new Airdrop();
    this.nearbyLoot = null;
    this.mansourNear = false;
    this._shotTargets = [];
    this._fireHeld = false;
    this._zoneWarned = -1;
    this.aimAssistEnabled = false;   // main.js enables this on touch devices
    this.assistTargetId = null;
    this.stats = Game.freshStats();
    this.killer = null;
    this._landedAt = 0;
    this._lastKillAt = -99;
    this._streak = 0;
    this._proj = new THREE.Vector3();
    this.skin = null;
    this.route = null;
    this.planeT = 0;
    this.cinematic = null;      // { pos, look } for story shots
    this.timeScale = 1;         // slow motion on defeat
    this.dropTarget = null;
    this.pixelRatioMax = this._pixelCap(quality);
    this.pixelRatio = this.pixelRatioMax;
    this._resTimer = 0;
  }

  static freshStats() {
    return {
      shots: 0, hits: 0, damage: 0, kills: 0, placement: 0, time: 0, won: false, killer: null,
      coffee: false, grenadeKills: 0, driven: 0, airdrops: 0,
    };
  }

  // ---------------------------------------------------------------- renderer
  /**
   * Phones get a lighter GPU budget: no MSAA (its multisample buffers are the
   * single biggest allocation on a 3x-density screen) and a lower pixel cap.
   * Running out of GPU memory is what makes mobile browsers kill the tab.
   */
  _pixelCap(quality) {
    const q = QUALITY[quality] ?? QUALITY.med;
    return Math.min(window.devicePixelRatio || 1, this.mobile ? Math.min(q.pixelRatio, 1.25) : q.pixelRatio);
  }

  _initRenderer() {
    const q = QUALITY[this.quality] ?? QUALITY.med;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: this.quality !== 'low' && !this.mobile, powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(this._pixelCap(this.quality));
    // A phone can drop the GL context under memory pressure or when the tab is
    // backgrounded. Keep the page alive and let three.js restore it.
    this.contextLost = false;
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      this.events.emit('gl:lost');
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.events.emit('gl:restored');
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    // Filmic response + sRGB output. Without this, bright desert sun clips to
    // flat white and everything reads as poster paint.
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
  }
  setQuality(name) {
    const q = QUALITY[name] ?? QUALITY.med;
    this.quality = name;
    this.pixelRatioMax = this._pixelCap(name);
    this.pixelRatio = this.pixelRatioMax;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.scene.fog.near = q.fogNear;
    this.scene.fog.far = q.fogFar;
    this.sun.castShadow = q.shadows;
    this.scene.environment = q.env ? this.envMap : null;
    // Texture resolution is baked at load, so changing it needs a reload; the
    // settings UI says so rather than silently doing nothing.
    this.qualityNeedsReload = (name === 'low') !== (this.builtQuality === 'low');
  }

  _initScene() {
    const q = QUALITY[this.quality] ?? QUALITY.med;
    this.builtQuality = this.quality;
    this.scene = new THREE.Scene();

    // ---- sky: both the backdrop and the source of ambient light ----
    this.sky = createSky({ sunDirection: new THREE.Vector3(SUN_DIR.x, SUN_DIR.y, SUN_DIR.z) });
    this.scene.add(this.sky.mesh);
    const horizon = this.sky.horizonColor();
    this.scene.fog = new THREE.Fog(horizon, q.fogNear, q.fogFar);

    this.envMap = q.env ? this.sky.buildEnvironment(this.renderer) : null;
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 1.15;

    // ---- direct sun ----
    // Still only two light sources; the rest of the ambient comes from the
    // environment map, which is both cheaper and far more convincing.
    this.sun = new THREE.DirectionalLight(0xffe6c2, 3.2);
    this.sun.position.set(SUN_DIR.x * 100, SUN_DIR.y * 100, SUN_DIR.z * 100);
    this.sun.castShadow = q.shadows;
    this.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    const s = 55;
    Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 260 });
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    // Interiors get no sun at all, so the hemisphere fill has to carry them.
    this.scene.add(new THREE.HemisphereLight(0xbfd8ff, 0xc9a97c, 0.9));

    this.world = buildWorld(this.map, { quality: this.quality });
    this.scene.add(this.world.group);
    this.scenery = buildScenery(this.map, { quality: this.quality, horizon: this.sky.horizonColor() });
    this.scene.add(this.scenery.group);

    this.zoneVisual = buildZoneVisual();
    this.scene.add(this.zoneVisual.group);

    this.effects = new EffectsSystem(this.scene);
    this.lootView = new LootView(this.scene);

    this.cam = new ThirdPersonCamera(window.innerWidth / Math.max(1, window.innerHeight));

    // ---- actors ----
    this.playerView = buildSaeed();
    this.playerAnim = new ProceduralAnimator(this.playerView.rig);
    this.scene.add(this.playerView.root);
    this.weaponMesh = null;

    // Soft key light for the lobby showcase only; the match is lit by the sun.
    this.lobbyLight = new THREE.DirectionalLight(0xfff0dd, 2.2);
    this.lobbyLight.visible = false;
    this.scene.add(this.lobbyLight);
    this.scene.add(this.lobbyLight.target);

    this.parachute = buildParachute();
    this.scene.add(this.parachute.root);

    // supply drop: gold-banded crate under its own canopy
    this.dropView = new THREE.Group();
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x3a2a66, roughness: 0.55, metalness: 0.2 });
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xe8bd47, roughness: 0.4, metalness: 0.5,
      emissive: 0x5a4210, emissiveIntensity: 0.6 });
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.0, 1.3), crateMat);
    crate.position.y = 0.5; crate.castShadow = true;
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.18, 1.36), bandMat);
    band.position.y = 0.5;
    this.dropView.add(crate, band);
    this.dropChute = buildParachute();
    this.dropChute.root.scale.setScalar(0.8);
    this.dropChute.root.position.y = -0.6;
    this.dropView.add(this.dropChute.root);
    this.dropView.visible = false;
    this.scene.add(this.dropView);

    this.plane = buildPlane();
    this.plane.root.visible = false;
    this.scene.add(this.plane.root);

    this.octa = buildOcta();
    this.scene.add(this.octa.root);
    this.octaMood = 0;

    this.mansour = buildMansour();
    this.mansourAnim = new ProceduralAnimator(this.mansour.rig);
    const ms = this.map.spawns.npcMansour;
    this.mansour.root.position.set(ms.x, 0, ms.z);
    this.mansour.root.rotation.y = 2.2 + Math.PI;
    this.scene.add(this.mansour.root);

    this.botViews = [];

    // ---- dune buggies ----
    this.buggies = (this.map.spawns.vehicles ?? []).map((v) => new Buggy(v.x, v.z, v.yaw));
    this.buggyViews = this.buggies.map(() => { const v = buildBuggy(); this.scene.add(v.root); return v; });

    // ---- grenades: flying meshes (pooled) and the aiming arc ----
    this.grenades = [];
    this.grenadeViews = Array.from({ length: 6 }, () => {
      const g = buildGrenadeMesh(); g.root.visible = false; this.scene.add(g.root); return g;
    });
    // the throw arc as a row of glowing beads: a 1 px line vanishes on a phone
    this.arcDots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95, depthTest: false }), 28);
    this.arcDots.frustumCulled = false;
    this.arcDots.renderOrder = 10;
    this.arcDots.visible = false;
    this.arcLine = this.arcDots;            // tests and HUD read arcLine.visible
    this.arcRing = new THREE.Mesh(new THREE.RingGeometry(GRENADE.radius * 0.92, GRENADE.radius, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff7a4a, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
    this.arcRing.visible = false;
    this.scene.add(this.arcDots, this.arcRing);
  }

  // ---------------------------------------------------------------- match
  /** A fresh flight path for the lobby map to show before the match. */
  planRoute(through = null) {
    this.route = planRoute(this.rng, this.map.half ?? 110, through);
    return this.route;
  }

  /**
   * @param {{drop?: {x:number, z:number} | null, route?: object, ground?: boolean}} [opts]
   *   drop: marked landing spot (auto-jump near it, glide toward it); route:
   *   the flight path shown in the lobby; ground: skip the plane (dev/test).
   */
  startMatch(opts = {}) {
    this.matchTime = 0;
    this.cinematic = null;
    this.timeScale = 1;
    this._orbit = undefined;
    this.player.reset();
    this.player.pos.x = this.map.spawns.player.x;
    this.player.pos.z = this.map.spawns.player.z;
    this.dropTarget = opts.drop ?? null;
    if (opts.ground) {
      this.player.pos.x = opts.drop?.x ?? this.player.pos.x;
      this.player.pos.z = opts.drop?.z ?? this.player.pos.z;
      this.route = null;
      this.plane.root.visible = false;
    } else {
      this.route = opts.route ?? this.route ?? planRoute(this.rng, this.map.half ?? 110);
      const span = overMap(this.route, this.map.half ?? 110);
      this.planeT = span.first;
      this.planeEnd = span.last;
      // auto-jump over the marked spot, or somewhere along the middle of the route
      this.jumpAt = this.dropTarget
        ? Math.min(span.last, Math.max(span.first, closestT(this.route, this.dropTarget)))
        : span.first + (span.last - span.first) * (0.3 + this.rng() * 0.4);
      const p0 = routePoint(this.route, this.planeT);
      this.player.inPlane = true;
      this.player.pos = { x: p0.x, y: CONFIG.drop.planeHeight, z: p0.z };
      this.player.yaw = Math.atan2(-this.route.dir.x, -this.route.dir.z);
      this.player.pitch = -0.35;
      this.plane.root.visible = true;
    }
    // Spawn protection is counted from touchdown, so a long glide never eats it.
    this._landedAt = opts.ground ? 0 : Infinity;
    this.stats = Game.freshStats();
    this.killer = null;
    this._deathCause = null;
    this._lastKillAt = -99;
    this._streak = 0;
    this.playerAnim = new ProceduralAnimator(this.playerView.rig);
    this.zone.reset();
    this.airdrop.reset();
    this.dropView.visible = false;
    this.loot.reset(this.map.lootSpots);
    this._groundLoot(this.loot.items);
    this.lootView.clear();
    this.lootView.sync(this.loot.items);
    this._zoneWarned = -1;
    this.nearbyLoot = null;
    this.nearbyBuggy = null;
    this.player.vehicle = null;
    this.buggies.forEach((b) => b.reset());
    this.grenades.length = 0;
    this._aimingGrenade = false;
    this._warnedGrenades = new WeakSet();
    this._placeDallah();

    // Start with a sidearm-grade rifle so the first 10 seconds are playable
    this.player.inventory.addWeapon('OCTA_AR');
    this.player.inventory.addMedkit();
    this._equipWeaponModel();

    // bots
    this.bots.forEach((b) => b.reset());
    if (this.bots.length === 0) {
      const loadouts = ['OCTA_AR', 'SARB_9', 'DESERT_CLAW', 'OCTA_AR', 'SAQR_DMR', 'SARB_9', 'OCTA_AR', 'SAEED_50', 'DESERT_CLAW'];
      this.map.spawns.bots.slice(0, CONFIG.bots.count).forEach((s, i) => {
        const bot = new Bot({ ...s, weaponId: loadouts[i % loadouts.length] });
        this.bots.push(bot);
        const view = buildBotModel(i);
        const anim = new ProceduralAnimator(view.rig);
        const wm = buildWeaponModel(bot.weapon.id);
        view.rig.weaponSocket.add(wm.root);
        this.scene.add(view.root);
        this.botViews.push({ view, anim, weapon: wm });
      });
    }
    // A different layout every match: each bot takes a random location.
    const cands = [...(this.map.spawns.botCandidates ?? this.map.spawns.bots)];
    for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    this.bots.forEach((b, i) => {
      const c = cands[i % cands.length];
      b.spawn = { x: c.x, z: c.z };
      b.pos.x = c.x; b.pos.z = c.z; b.pos.y = 0;
      b.target = { x: c.x, z: c.z };
    });
    this.bots.forEach((b) => {
      b.visibleToPlayer = false;
      b.grenades = this.rng() < 0.6 ? 1 : 0;     // some rivals carry a frag
      b.grenadeCd = 8;
    });
    this.botViews.forEach(({ view }) => { view.root.visible = true; });

    this.state = MatchState.PLAYING;
    this.events.emit('match:start');
  }

  _groundLoot(items) {
    for (const it of items) { it.ground = lootGround(it.x, it.z, this.colliders); it.y = it.ground; }
  }

  /**
   * Uncle Mansour's side quest: his dallah (coffee pot) is somewhere on the
   * island. Bring it back to him for a reward. A different location each match.
   */
  _placeDallah() {
    const pois = (this.map.pois ?? []).filter((p) => p.id !== 'village');
    const poi = pois[Math.floor(this.rng() * pois.length)];
    this.quest = { state: 'find', poi: poi?.id ?? null, item: null };
    if (!poi) return;
    let spot = null;
    for (let i = 0; i < 30 && !spot; i++) {
      const a = this.rng() * Math.PI * 2, d = this.rng() * poi.r * 0.6;
      const x = poi.x + Math.cos(a) * d, z = poi.z + Math.sin(a) * d;
      const blocked = this.colliders.some((c) => ['wall', 'container', 'prop', 'cover', 'ruin', 'landmark', 'tower'].includes(c.tag)
        && Math.abs(x - c.x) < c.hw + 0.6 && Math.abs(z - c.z) < c.hd + 0.6 && c.bottom < 1);
      if (!blocked) spot = { x, z };
    }
    spot ??= { x: poi.x, z: poi.z };
    const item = makeLootItem({ kind: 'dallah', x: spot.x, z: spot.z });
    this._groundLoot([item]);
    this.loot.items.push(item);
    this.quest.item = item;
  }

  /** Where the quest points now: the dallah, then Mansour. Null when done. */
  questTarget() {
    const q = this.quest;
    if (!q || q.state === 'done') return null;
    if (q.state === 'find') return q.item && !q.item.taken ? { x: q.item.x, z: q.item.z, kind: 'dallah' } : null;
    const m = this.map.spawns.npcMansour;
    return { x: m.x, z: m.z, kind: 'mansour' };
  }

  _deliverCoffee() {
    const inv = this.player.inventory;
    this.quest.state = 'done';
    this.stats.coffee = true;
    inv.armor = CONFIG.armor.max;
    inv.addGrenade(2);
    inv.addMedkit();
    this.player.health.heal(this.player.health.max);
    this.hud.banner(this.i18n.t('coffeeDone'), this.i18n.t('coffeeReward'));
    this.hud.mansourLine?.(this.i18n.t('mansourThanks'));
    this.audio.victory();
    this.octaMood = 3;
    this.events.emit('quest:done');
  }

  // ---------------------------------------------------------------- grenades
  _grenadeOrigin() {
    const p = this.player;
    const r = { x: Math.cos(p.yaw), z: -Math.sin(p.yaw) };
    return { x: p.pos.x + r.x * 0.35, y: p.pos.y + p.height * 0.92, z: p.pos.z + r.z * 0.35 };
  }
  _grenadeVelocity() {
    const p = this.player;
    const aim = p.aimDir();
    // a little extra loft: the camera looks over the shoulder, slightly down
    const pitch = Math.min(1.2, p.pitch + 0.18);
    const cp = Math.cos(pitch);
    return throwVelocity({ x: aim.x / Math.max(1e-3, Math.cos(p.pitch)) * cp, y: Math.sin(pitch), z: aim.z / Math.max(1e-3, Math.cos(p.pitch)) * cp }, p.vel);
  }
  _updateGrenadeAim() {
    const pts = predictArc(this._grenadeOrigin(), this._grenadeVelocity(), this.colliders);
    const dots = this.arcDots, m = this._arcM ??= new THREE.Matrix4();
    const N = dots.count;
    for (let i = 0; i < N; i++) {
      const q = pts[Math.min(pts.length - 1, Math.round((i / (N - 1)) * (pts.length - 1) * 0.85))];
      const sc = 1.3 + (i / N) * 2.4;                    // grow along the arc so far beads still read
      m.makeScale(sc, sc, sc).setPosition(q.x, q.y, q.z);
      dots.setMatrixAt(i, m);
    }
    dots.instanceMatrix.needsUpdate = true;
    dots.visible = true;
    const end = pts[pts.length - 1];
    this.arcRing.position.set(end.x, Math.max(0.05, end.y - GRENADE.size + 0.05), end.z);
    this.arcRing.visible = true;
  }
  _throwGrenade() {
    if (!this.player.inventory.useGrenade()) return;
    this.grenades.push(new Grenade(this._grenadeOrigin(), this._grenadeVelocity(), 'player'));
    this.playerAnim.play(AnimState.RELOAD, 0.35);
    this.audio.throwGrenade?.();
    haptics.hitDealt();
  }
  /** A rival lobs its frag at where it last saw Saeed. */
  _botThrow(bot, target) {
    const T = 1.5;
    const from = { x: bot.pos.x, y: bot.pos.y + 1.6, z: bot.pos.z };
    const tx = target.x + (this.rng() - 0.5) * 4, tz = target.z + (this.rng() - 0.5) * 4;
    const v = { x: (tx - from.x) / T, y: (0.3 - from.y - 0.5 * GRENADE.gravity * T * T) / T, z: (tz - from.z) / T };
    bot.grenades -= 1;
    bot.grenadeCd = 12;
    this.grenades.push(new Grenade(from, v, bot.id));
  }
  _updateGrenades(dt) {
    for (const g of this.grenades) {
      const ev = g.update(dt, this.colliders);
      if (ev === 'bounce') this.audio.tick?.(Math.hypot(g.pos.x - this.player.pos.x, g.pos.z - this.player.pos.z));
      if (ev === 'explode') this._explode(g.pos, g.owner, GRENADE.radius);
      else if (g.owner !== 'player' && !this._warnedGrenades.has(g)
        && Math.hypot(g.pos.x - this.player.pos.x, g.pos.z - this.player.pos.z) < GRENADE.radius + 2 && g.fuse < 2) {
        this._warnedGrenades.add(g);
        this.hud.toast(this.i18n.t('grenadeWarn'), 'bad');
        this.audio.zoneWarn();
        haptics.zone();
      }
    }
    this.grenades = this.grenades.filter((g) => !g.exploded);
  }
  /**
   * Blast at `pos`: damages everyone (and every buggy) in reach that has a
   * clear line from the centre. `owner` is 'player' or a bot id.
   */
  _explode(pos, owner, radius = GRENADE.radius, power = 1) {
    this.effects.explosion(pos, radius * 0.8);
    const pd = Math.hypot(pos.x - this.player.pos.x, pos.y - this.player.pos.y, pos.z - this.player.pos.z);
    this.cam.addShake(Math.max(0, 1 - pd / 40));
    this.audio.explosion?.(pd);
    const cfg = { ...GRENADE, radius };
    const c0 = { x: pos.x, y: pos.y + 0.4, z: pos.z };
    const clear = (t) => !segmentBlocked(c0.x, c0.z, c0.y, t.x, t.z, t.y, this.colliders);
    const ownerBot = owner === 'player' ? null : this.bots.find((b) => b.id === owner) ?? null;
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      const ch = bot.chest;
      const dmg = blastDamage(Math.hypot(ch.x - c0.x, ch.y - c0.y, ch.z - c0.z), cfg) * power;
      if (dmg <= 0 || !clear(ch)) continue;
      if (owner === 'player') {
        if (this._damageBot(bot, dmg, ch, 'GRENADE')) this.stats.grenadeKills += 1;
      } else {
        bot.health.damage(dmg, this.time);
        if (!bot.alive) this._onBotDeath(bot, 'bot', 'GRENADE', ownerBot);
      }
    }
    const p = this.player;
    if (p.alive) {
      const ch = p.chest;
      const dmg = blastDamage(Math.hypot(ch.x - c0.x, ch.y - c0.y, ch.z - c0.z), cfg) * power * (p.vehicle ? 0.6 : 1);
      if (dmg > 0 && clear(ch)) {
        p.takeDamage(dmg, this.time);
        this.hud.flashDamage();
        this.hud.showDamageFrom(this._screenAngleTo(pos));
        haptics.hitTaken();
        if (!p.alive) { this.killer = ownerBot; this._deathCause = 'deathGrenade'; this._lose(); }
      }
    }
    for (const b of this.buggies) {
      if (b.destroyed) continue;
      const d = Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z);
      const dmg = blastDamage(d, cfg) * power * 1.6;
      if (dmg > 0 && b.damage(dmg)) this._wreckBuggy(b, owner);
    }
  }

  // ---------------------------------------------------------------- vehicles
  _enterBuggy(b) {
    const p = this.player;
    p.vehicle = b; b.driver = 'player';
    p.yaw = b.yaw; p.pitch = -0.18;
    this._healing = false; p.healTimer = 0;
    this.audio.pickup();
    this.events.emit('vehicle:enter');
  }
  _exitBuggy() {
    const p = this.player, b = p.vehicle;
    if (!b) return;
    const e = b.exitPoint();
    p.vehicle = null; b.driver = null;
    p.pos.x = e.x; p.pos.z = e.z; p.pos.y = 0;
    p.vel.x = 0; p.vel.z = 0; p.vel.y = 0;
    resolveXZ(p.pos, CONFIG.player.radius, this.colliders, 0, CONFIG.player.height, CONFIG.player.stepHeight);
    this.events.emit('vehicle:exit');
  }
  _wreckBuggy(b, owner) {
    if (this.player.vehicle === b) this._exitBuggy();
    this._explode({ x: b.pos.x, y: 0.4, z: b.pos.z }, owner, 6.5, 0.9);
  }
  _updateDriving(dt, input) {
    const p = this.player, b = p.vehicle;
    const before = b.distance;
    const res = b.update(dt, { throttle: input.moveZ ?? 0, steer: input.moveX ?? 0 }, this.colliders);
    this.stats.driven += b.distance - before;
    // the camera drifts back behind the bonnet unless the thumb is looking around
    if (Math.abs(input.lookDX) < 1e-4) {
      let d = b.yaw - p.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      p.yaw += d * Math.min(1, dt * 2.2);
    }
    const f = b.forward();
    p.pos.x = b.pos.x - f.z * 0.32; p.pos.z = b.pos.z + f.x * 0.32; p.pos.y = BUGGY.seat.y;
    if (res.impact > 4) {
      this.cam.addShake(Math.min(0.8, res.impact / 25));
      this.audio.hit(false);
      haptics.hitTaken();
      if (res.impact > 12) {
        p.takeDamage((res.impact - 12) * 1.6, this.time);
        this.hud.flashDamage();
        if (!p.alive) { this.killer = null; this._deathCause = 'deathCrash'; this._lose(); }
      }
    }
    // running someone over
    const sp = Math.abs(b.speed);
    if (sp > BUGGY.runOverSpeed) {
      for (const bot of this.bots) {
        if (!bot.alive) continue;
        const d = Math.hypot(bot.pos.x - b.pos.x, bot.pos.z - b.pos.z);
        if (d > BUGGY.radius + bot.radius) continue;
        this._damageBot(bot, sp * 6, bot.chest, 'BUGGY');
        bot.pos.x += f.x * 2.5; bot.pos.z += f.z * 2.5;
        b.speed *= 0.6;
        b.damage(6);
      }
    }
    if (b.destroyed) this._wreckBuggy(b, 'player');
  }

  /**
   * After touchdown, keep the landing fair: at most one bot within 60 m, the
   * rest move to locations further out (they have not been seen yet).
   */
  _spreadBotsFrom(p) {
    const cands = this.map.spawns.botCandidates ?? [];
    let near = 0;
    for (const b of this.bots) {
      if (!b.alive) continue;
      if (Math.hypot(b.pos.x - p.x, b.pos.z - p.z) >= 60) continue;
      if (near++ === 0) continue;                         // one rival nearby is fair game
      const far = cands.filter((c) => Math.hypot(c.x - p.x, c.z - p.z) > 110
        && !this.bots.some((o) => o !== b && Math.hypot(o.pos.x - c.x, o.pos.z - c.z) < 20));
      const c = far[Math.floor(this.rng() * far.length)];
      if (!c) continue;
      b.pos.x = c.x; b.pos.z = c.z; b.spawn = { x: c.x, z: c.z }; b.target = { x: c.x, z: c.z };
    }
  }

  /** Named location under a point, for the landing call-out. */
  locationAt(x, z) {
    let best = null, bd = Infinity;
    for (const p of this.map.pois ?? []) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r + 15 && d < bd) { bd = d; best = p; }
    }
    return best;
  }

  _equipWeaponModel() {
    const socket = this.playerView.rig.weaponSocket;
    if (this.weaponMesh) { socket.remove(this.weaponMesh.root); this.weaponMesh.dispose?.(); this.weaponMesh = null; }
    const w = this.player.inventory.weapon;
    if (!w) return;
    this.weaponMesh = buildWeaponModel(w.id);
    socket.add(this.weaponMesh.root);
  }

  get aliveBots() { return this.bots.filter((b) => b.alive).length; }

  lootLabel(item) {
    const lang = this.i18n?.lang ?? 'ar';
    if (item.type === 'weapon') {
      const d = WEAPONS[item.weaponId];
      if (!d) return this.i18n.t(String(item.weaponId).toLowerCase());   // GRENADE, BUGGY
      return lang === 'ar' ? d.nameAr : d.nameEn;
    }
    if (item.type === 'medkit') return this.i18n.t('medkit');
    if (item.type === 'armor') return this.i18n.t('armor');
    if (item.type === 'grenade') return this.i18n.t('grenade');
    if (item.type === 'dallah') return this.i18n.t('dallah');
    return this.i18n.t('ammo');
  }

  // ---------------------------------------------------------------- loop
  update(dt, input) {
    this.time += dt;
    if (this.state !== MatchState.PLAYING) {
      this._updateVisualsOnly(dt);
      return;
    }
    this.matchTime += dt;

    // --- look ---
    this.player.look(input.lookDX, input.lookDY);

    // Touch aim assist. Applied after the raw look so it bends where the thumb
    // put the crosshair rather than fighting it.
    if (this.aimAssistEnabled && !this._aimingGrenade) {   // no tug while lining up a throw
      const a = computeAimAssist(
        viewFromPlayer(this.player), this._targets(), this.colliders, CONFIG.aim, dt,
      );
      this.player.yaw += a.dYaw;
      this.player.pitch = clamp(
        this.player.pitch + a.dPitch, CONFIG.camera.minPitch, CONFIG.camera.maxPitch,
      );
      this.assistTargetId = a.targetId;
    }

    // --- plane ---
    let pin = input;
    if (this.player.inPlane) {
      this.planeT += (CONFIG.drop.planeSpeed * dt) / this.route.length;
      const q = routePoint(this.route, this.planeT);
      this.player.pos.x = q.x; this.player.pos.z = q.z; this.player.pos.y = CONFIG.drop.planeHeight;
      if (input.jump || this.planeT >= this.jumpAt) {
        const carry = { x: this.route.dir.x * 14, z: this.route.dir.z * 14 };
        this.player.startDrop(q.x, q.z, CONFIG.drop.planeHeight - 4, carry);
        this.player.dropTarget = this.dropTarget;
        this.player.pitch = -0.6;
        pin = { ...input, jump: false };                  // the jump tap must not also open the canopy
        this.audio.zoneWarn();
        this.events.emit('player:jumped');
      }
    } else if (this.route && this.planeT <= 1.05) {
      this.planeT += (CONFIG.drop.planeSpeed * dt) / this.route.length;   // the plane flies on
    }

    // --- vehicles: get in / out ---
    const p = this.player;
    const onFoot = !p.vehicle && !p.inPlane && !p.dropping && p.alive;
    this.nearbyBuggy = null;
    if (onFoot) {
      let bd = 3.4;
      for (const b of this.buggies) {
        if (b.destroyed || b.driver) continue;
        const d = Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
        if (d < bd && p.pos.y < 1.2) { bd = d; this.nearbyBuggy = b; }
      }
    }
    let interact = input.interact;
    if (interact && p.vehicle) { this._exitBuggy(); interact = false; }

    // --- movement / physics ---
    this.player.update(dt, pin, this.colliders);
    if (p.vehicle) this._updateDriving(dt, input);
    const held = this.player.inventory.weapon;
    this.player.scopeFov = this.player.aiming && held?.def.scope && !held.reloading ? held.def.scope.fov : 0;
    this.player.concealed = this.player.crouching && (this.map.bushes ?? []).some(
      (b) => Math.hypot(b.x - this.player.pos.x, b.z - this.player.pos.z) < b.r + 0.4);
    if (this.player.justLanded) {
      this._landedAt = this.matchTime;
      this.effects.impact({ x: this.player.pos.x, y: this.player.pos.y + 0.1, z: this.player.pos.z }, false);
      this.cam.addShake(0.3);
      this.audio.pickup();
      haptics.hitDealt();
      this._spreadBotsFrom(this.player.pos);
      const loc = this.locationAt(this.player.pos.x, this.player.pos.z);
      this.events.emit('player:landed', { location: loc?.id ?? null });
    }

    // --- weapon ---
    const w = this.player.inventory.weapon;
    if (w) w.update(dt);
    if (input.weapon === 1) this._switchWeapon(0);
    if (input.weapon === 2) this._switchWeapon(1);
    if (input.swap) this._switchWeapon((this.player.inventory.active + 1) % Math.max(1, this.player.inventory.slots.length));
    if (input.reload && w?.startReload()) {
      this.audio.reload();
      this.playerAnim.play(AnimState.RELOAD, w.def.reloadTime);
    }
    if (input.fire && !p.vehicle) this._tryFire();
    this._fireHeld = input.fire;

    // --- grenades: hold to aim (arc preview), release to throw ---
    const canThrow = !p.vehicle && !p.inPlane && !p.dropping && p.inventory.grenades > 0;
    if (input.grenade && canThrow) {
      this._aimingGrenade = true;
      this._updateGrenadeAim();
    } else {
      if (this._aimingGrenade && canThrow) this._throwGrenade();
      this._aimingGrenade = false;
      this.arcLine.visible = false;
      this.arcRing.visible = false;
    }

    // --- healing ---
    if (input.use) this._tryHeal();
    if (this._healing && this.player.healTimer <= 0) {
      this._healing = false;
      const healed = this.player.finishHeal();
      if (healed > 0) {
        this.audio.heal();
        this.hud.toast(`+${Math.round(healed)} ${this.i18n.t('health')}`, '');
      }
    }

    // --- loot ---
    this.nearbyLoot = (this.player.dropping || this.player.inPlane || p.vehicle) ? null
      : this.loot.nearest(this.player.pos.x, this.player.pos.z, undefined, this.player.pos.y);
    if (interact && this.nearbyLoot) this._pickup(this.nearbyLoot);
    else if (interact && this.nearbyBuggy) this._enterBuggy(this.nearbyBuggy);

    // --- bots ---
    const botCtx = {
      player: this.player, colliders: this.colliders, zone: this.zone, time: this.time,
      // Brief spawn protection so the round does not open with the player being
      // shot before they have even looked around.
      holdFire: this.player.inPlane || this.player.dropping || this.matchTime - this._landedAt < CONFIG.match.spawnGrace,
      onShoot: (bot, accurate, dist) => this._botShoot(bot, accurate, dist),
      rivals: this.bots,
      onShootBot: (bot, rival, accurate, dist) => this._botShootBot(bot, rival, accurate, dist),
    };
    for (const bot of this.bots) {
      const wasAlive = bot.alive;
      if (!this.freezeBots) bot.update(dt, botCtx);   // QA switch, never set in play
      bot.visibleToPlayer = bot.alive && this._playerCanSee(bot);
      if (wasAlive && !bot.alive) this._onBotDeath(bot, 'zone');
    }

    // --- rival grenades ---
    if (!this.freezeBots && this.matchTime - this._landedAt > CONFIG.match.spawnGrace + 6) {
      for (const bot of this.bots) {
        if (!bot.alive || !bot.grenades) continue;
        bot.grenadeCd -= dt;
        if (bot.grenadeCd > 0 || !bot.lastKnown || bot.lostTimer < 0.8 || bot.lostTimer > 3.2) continue;
        const d = Math.hypot(bot.lastKnown.x - bot.pos.x, bot.lastKnown.z - bot.pos.z);
        if (d > 9 && d < 30) this._botThrow(bot, bot.lastKnown);
      }
    }
    this._updateGrenades(dt);
    // parked buggies still need ticking when empty (they coast to a stop)
    for (const b of this.buggies) if (b !== p.vehicle && Math.abs(b.speed) > 0) b.update(dt, { throttle: 0, steer: 0 }, this.colliders);

    // --- supply drop ---
    const ev = this.airdrop.update(dt, this.matchTime, this.zone, this.colliders, this.rng);
    if (ev === 'incoming') {
      this.hud.banner(this.i18n.t('airdropIncoming'), this.i18n.t('airdropSub'));
      this.audio.zoneWarn();
      haptics.zone();
    } else if (ev === 'landed') {
      const fresh = this.airdrop.lootSpots().map((spot) => makeLootItem(spot));
      this._groundLoot(fresh);
      this.loot.items.push(...fresh);
      this.lootView.sync(this.loot.items);
      this.effects.impact({ x: this.airdrop.pos.x, y: this.airdrop.pos.y + 0.2, z: this.airdrop.pos.z }, false);
      this.hud.toast(this.i18n.t('airdropLanded'), 'kill');
      this._airdropIds = new Set(fresh.map((f) => f.id));
    }

    // --- zone ---
    this.zone.update(dt);
    if (this.zone.state === 'shrinking' && this._zoneWarned !== this.zone.phase) {
      this._zoneWarned = this.zone.phase;
      this.audio.zoneWarn();
      this.hud.toast(this.i18n.both('zoneClosing'), 'bad');
    }
    const airborne = this.player.inPlane || this.player.dropping;
    const zd = airborne ? 0 : this.zone.damageFor(this.player.pos.x, this.player.pos.z, dt);
    if (zd > 0) {
      this.player.takeDamage(zd, this.time);
      this._zoneTick = (this._zoneTick ?? 0) + dt;
      if (this._zoneTick > 0.85) {
        this._zoneTick = 0;
        this.hud.flashDamage();
        haptics.zone();
        this.audio.hurt();
      }
      if (!this.player.alive) this._lose();
    }

    // --- Uncle Mansour ---
    const ms = this.map.spawns.npcMansour;
    const near = Math.hypot(this.player.pos.x - ms.x, this.player.pos.z - ms.z) < 6;
    if (near !== this.mansourNear) {
      this.mansourNear = near;
      this.hud.showMansour(near, this.quest?.state);
      if (near) this.audio.pickup();
    }
    if (near && this.quest?.state === 'carry') this._deliverCoffee();

    // --- win / lose ---
    if (this.state === MatchState.PLAYING) {
      if (!this.player.alive) this._lose();
      else if (this.aliveBots === 0) this._win();
    }

    this._updateVisualsOnly(dt);
  }

  _updateVisualsOnly(dt) {
    // player model
    const p = this.player;
    const root = this.playerView.root;
    root.position.set(p.pos.x, p.pos.y, p.pos.z);
    const lobby = this.state === MatchState.IDLE;
    // lobby turntable; otherwise the model faces away from the chase camera
    root.rotation.y = lobby ? this.time * 0.35 : p.yaw + Math.PI;
    if (this.state === MatchState.LOST && this.killer) {
      // kill-cam: swing the chase camera round to look at whoever got Saeed
      const k = this.killer.pos;
      const want = Math.atan2(-(k.x - p.pos.x), -(k.z - p.pos.z));
      let d = want - p.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      p.yaw += d * Math.min(1, dt * 3);
      p.pitch = damp(p.pitch, -0.08, 3, dt);
    }
    const ad = this.airdrop;
    this.dropView.visible = ad.active;
    if (ad.active) {
      this.dropView.position.set(ad.pos.x, ad.pos.y, ad.pos.z);
      this.dropChute.root.visible = ad.state === 'falling';
      if (ad.state === 'falling') this.dropView.rotation.y += dt * 0.4;
    }
    const pr = this.plane.root;
    pr.visible = !!this.route && this.planeT < 1.05 && this.state !== MatchState.IDLE;
    if (pr.visible) {
      const q = routePoint(this.route, Math.min(1.05, this.planeT));
      pr.position.set(q.x, CONFIG.drop.planeHeight + 3, q.z);
      pr.rotation.set(0, Math.atan2(this.route.dir.x, this.route.dir.z), Math.sin(this.time * 0.8) * 0.03);
    }
    root.visible = !p.inPlane && !p.scopeFov;
    if (p.vehicle) root.rotation.y = p.vehicle.yaw + Math.PI;
    // buggies (distance-culled like the bots) and grenades in flight
    const cpos = this.cam.camera.position;
    this.buggies.forEach((b, i) => {
      const v = this.buggyViews[i];
      v.root.visible = Math.hypot(b.pos.x - cpos.x, b.pos.z - cpos.z) < 150 && this.state !== MatchState.IDLE;
      if (v.root.visible) v.update(b, this.time);
    });
    this.grenadeViews.forEach((v, i) => {
      const g = this.grenades[i];
      v.root.visible = !!g;
      if (g) { v.root.position.set(g.pos.x, g.pos.y, g.pos.z); v.root.rotation.x += dt * 9; }
    });
    // Fog thins with altitude so the map is readable from the plane and the fall.
    const q = QUALITY[this.quality] ?? QUALITY.med;
    const lift = Math.max(0, this.cam.camera.position.y - 12);
    this.scene.fog.near = q.fogNear + lift * 1.2;
    this.scene.fog.far = q.fogFar + lift * 2.4;
    const chute = this.parachute.root;
    chute.visible = p.dropping && p.chute;
    if (chute.visible) {
      chute.position.set(p.pos.x, p.pos.y, p.pos.z);
      chute.rotation.y = p.yaw;
    }
    const w = p.inventory.weapon;
    const anim = this.playerAnim;
    if (!p.alive) anim.play(AnimState.DEATH);
    else if (this.state === MatchState.WON) anim.play(AnimState.VICTORY);
    else if (anim.oneShot <= 0) {
      anim.play(resolveState({
        alive: p.alive, reloading: !!w?.reloading, firing: false,
        grounded: p.grounded, crouching: p.crouching || !!p.vehicle, aiming: p.aiming, speed: p.speed,
      }));
    }
    anim.update(dt, { speed: p.speed, aiming: p.aiming, pitch: p.pitch, armed: !!w });

    // bots
    this.bots.forEach((bot, i) => {
      const bv = this.botViews[i];
      if (!bv) return;
      bv.view.root.position.set(bot.pos.x, bot.pos.y, bot.pos.z);
      // distance cull: past the fog a character is a few pixels and ~15 draw calls
      const cp = this.cam.camera.position;
      const camDist = Math.hypot(bot.pos.x - cp.x, bot.pos.z - cp.z);
      bv.view.root.visible = camDist < Math.min(120, this.scene.fog.far * 0.75);
      // shadows only up close, where they read; each one is another draw call
      const shadow = camDist < 40;
      if (bv.shadow !== shadow) { bv.shadow = shadow; bv.view.root.traverse((o) => { if (o.isMesh) o.castShadow = shadow; }); }
      bv.view.root.rotation.y = bot.yaw + Math.PI;
      const st = resolveState({
        alive: bot.alive, reloading: bot.weapon.reloading, firing: false,
        grounded: true, crouching: false,
        aiming: bot.state === 'engage' || bot.state === 'chase',
        speed: bot.moving ? Math.hypot(bot.vel.x, bot.vel.z) : 0,
      });
      if (bv.anim.oneShot <= 0) bv.anim.play(st);
      bv.anim.update(dt, { speed: Math.hypot(bot.vel.x, bot.vel.z), aiming: st === AnimState.AIM, armed: true });
    });

    // OCTA companion: floats at Saeed's shoulder, bobs, celebrates
    this._updateOcta(dt);

    // Mansour idles
    this.mansourAnim.update(dt, { speed: 0 });

    this.zoneVisual.update(this.zone);
    this.lootView.sync(this.loot.items);
    this.lootView.update(dt, this.time, this.player.pos);
    this.effects.update(dt);
    this.lobbyLight.visible = this.state === MatchState.IDLE;
    if (this.cinematic) this._cinematicCamera(dt);
    else if (this.state === MatchState.IDLE) this._showcaseCamera();
    else if (this.state === MatchState.WON) this._victoryCamera(dt);
    else this.cam.update(dt, this.player, this.colliders);
    // Follow the player so the shadow frustum stays tight (= sharp shadows on a
    // small map without a huge shadow map).
    this.sun.target.position.set(this.player.pos.x, 0, this.player.pos.z);
    this.sun.position.set(
      this.player.pos.x + SUN_DIR.x * 120,
      SUN_DIR.y * 120,
      this.player.pos.z + SUN_DIR.z * 120,
    );
    this.sky.mesh.position.copy(this.cam.camera.position);
    this.scenery.update(dt, this.cam.camera, this.time);
  }

  /** Story shots: glide the camera to a framed position and hold. */
  _cinematicCamera(dt) {
    const c = this.cam.camera, k = this.cinematic;
    const a = Math.min(1, dt * 1.6);
    if (!k.started) { c.position.set(k.pos.x, k.pos.y, k.pos.z); k.started = true; k.cur = { ...k.look }; }
    c.position.x += (k.pos.x - c.position.x) * a; c.position.y += (k.pos.y - c.position.y) * a; c.position.z += (k.pos.z - c.position.z) * a;
    k.cur.x += (k.look.x - k.cur.x) * a; k.cur.y += (k.look.y - k.cur.y) * a; k.cur.z += (k.look.z - k.cur.z) * a;
    c.fov = 50; c.updateProjectionMatrix();
    c.lookAt(k.cur.x, k.cur.y, k.cur.z);
  }

  /** Victory: a slow orbit round Saeed while OCTA celebrates. */
  _victoryCamera(dt) {
    const c = this.cam.camera, p = this.player.pos;
    this._orbit = (this._orbit ?? Math.atan2(c.position.x - p.x, c.position.z - p.z)) + dt * 0.45;
    const r = 4.6;
    c.position.set(p.x + Math.sin(this._orbit) * r, p.y + 1.9, p.z + Math.cos(this._orbit) * r);
    c.fov = 55; c.updateProjectionMatrix();
    c.lookAt(p.x, p.y + 1.1, p.z);
  }

  /** Story camera shots, by panel. */
  storyShot(i) {
    const v = this.map.pois.find((x) => x.id === 'village') ?? { x: -160, z: -170 };
    const town = this.map.pois.find((x) => x.id === 'town') ?? { x: 0, z: -165 };
    const m = this.map.spawns.npcMansour, s = this.player.pos;
    const shots = [
      { pos: { x: v.x + 22, y: 7, z: v.z + 24 }, look: { x: v.x - 2, y: 2.5, z: v.z - 2 } },
      { pos: { x: 40, y: 190, z: 330 }, look: { x: 0, y: 0, z: -20 } },
      { pos: { x: town.x + 20, y: 9, z: town.z + 34 }, look: { x: town.x, y: 4, z: town.z } },
      { pos: { x: m.x + 2.6, y: 1.8, z: m.z + 3.4 }, look: { x: m.x, y: 1.4, z: m.z } },
      { pos: { x: s.x - 1.4, y: 1.5, z: s.z + 3.2 }, look: { x: s.x, y: 1.25, z: s.z } },
    ];
    this.cinematic = shots[Math.max(0, Math.min(shots.length - 1, i))];
  }

  /** Lobby framing: Saeed on a slow turntable, offset away from the menu panel. */
  _showcaseCamera() {
    const p = this.player.pos;
    const c = this.cam.camera;
    const side = this.i18n?.rtl ? 1 : -1;      // panel sits on the start side
    c.fov = 40;
    c.updateProjectionMatrix();
    c.position.set(p.x - side * 1.1, p.y + 1.45, p.z + 4.3);
    c.lookAt(p.x - side * 0.05 + side * 0.95, p.y + 1.0, p.z);
    this.lobbyLight.position.set(p.x - side * 2, p.y + 3, p.z + 5);
    this.lobbyLight.target.position.set(p.x, p.y + 1, p.z);
  }

  _updateOcta(dt) {
    const p = this.player;
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    const right = { x: cos, z: -sin };
    const fwd = { x: -sin, z: -cos };
    // Keep OCTA off the aiming shoulder and behind the player, otherwise the
    // companion sits exactly where the over-the-shoulder camera is looking.
    const side = p.aiming ? -1.7 : -1.15;
    const back = p.aiming ? -1.3 : -0.7;
    const tx = p.pos.x + right.x * side + fwd.x * back;
    const tz = p.pos.z + right.z * side + fwd.z * back;
    const ty = p.pos.y + (p.aiming ? 1.15 : 1.45) + Math.sin(this.time * 2.2) * 0.12;
    const o = this.octa.root;
    o.position.x = damp(o.position.x, tx, 5, dt);
    o.position.z = damp(o.position.z, tz, 5, dt);
    o.position.y = damp(o.position.y, ty, 6, dt);
    this.octaMood = Math.max(0, this.octaMood - dt);
    const celebrating = this.state === MatchState.WON || this.octaMood > 0;
    o.rotation.y += dt * (celebrating ? 5.5 : 0.6);
    const wig = celebrating ? 0.6 : 0.22;
    this.octa.rig.tentacles.forEach((t, i) => {
      t.rotation.x = Math.sin(this.time * (celebrating ? 9 : 3) + i) * wig;
      t.rotation.z = Math.cos(this.time * (celebrating ? 8 : 2.6) + i) * wig;
    });
    const baseScale = p.aiming ? 0.72 : 1;
    this.octa.root.scale.setScalar(celebrating ? baseScale + Math.sin(this.time * 12) * 0.08 : baseScale);
    o.visible = this.player.alive || this.state === MatchState.WON;
  }

  // ---------------------------------------------------------------- combat
  _switchWeapon(index) {
    if (this.player.inventory.switchTo(index)) {
      this._equipWeaponModel();
      this.audio.reload();
      this.playerAnim.play(AnimState.RELOAD, 0.4);
    }
  }
  _tryHeal() {
    if (this._healing) return;
    if (this.player.beginHeal()) {
      this._healing = true;
      this.audio.reload();
      this.hud.toast(this.i18n.t('healing'));
    }
  }

  _muzzleWorldPos() {
    if (!this.weaponMesh) return new THREE.Vector3(this.player.pos.x, this.player.eyeY, this.player.pos.z);
    const v = new THREE.Vector3();
    this.weaponMesh.muzzle.getWorldPosition(v);
    return v;
  }

  _tryFire() {
    const p = this.player;
    if (!p.alive || p.dropping) return;
    const w = p.inventory.weapon;
    if (!w) return;
    if (w.reloading) return;
    if (!w.isMelee && w.mag <= 0) {
      if (w.cooldown <= 0) {
        w.cooldown = 0.35;
        this.audio.empty();
        if (w.needsReload()) { w.startReload(); this.playerAnim.play(AnimState.RELOAD, w.def.reloadTime); }
      }
      return;
    }
    if (!w.def.auto && this._fireHeld) return;      // semi-auto needs a re-press
    if (!w.fire()) return;

    const def = w.def;
    const origin = { x: p.pos.x, y: p.eyeY, z: p.pos.z };
    const baseDir = p.aimDir();
    const targets = this._targets();
    const spread = w.spreadFor(p.aiming);
    const muzzle = this._muzzleWorldPos();

    this.stats.shots += 1;
    let connected = false;
    this.audio.shot(def.class, 0);
    this.effects.muzzleFlash(muzzle, def.class === 'shotgun' ? 1.4 : 1);
    this.cam.addShake(def.class === 'marksman' ? 0.55 : def.class === 'shotgun' ? 0.4 : 0.18);
    this.playerAnim.play(AnimState.FIRE);
    p.pitch = Math.min(CONFIG.camera.maxPitch, p.pitch + def.recoil * (p.aiming ? 0.6 : 1));

    for (let i = 0; i < def.pellets; i++) {
      const dir = spreadDir(baseDir, spread, this.rng);
      const hit = traceShot(origin, dir, this.colliders, targets, def);
      this.effects.tracer(muzzle, hit.point);
      if (hit.kind === 'actor') {
        const bot = this.bots.find((b) => b.id === hit.targetId);
        if (bot) this._damageBot(bot, hit.damage, hit.point, w.id);
        this.effects.impact(hit.point, true);
        connected = true;
      } else if (hit.kind === 'world') {
        this.effects.impact(hit.point, false);
      }
    }
    if (connected) this.stats.hits += 1;
  }

  _targets() {
    this._shotTargets.length = 0;
    for (const b of this.bots) {
      if (!b.alive) continue;
      this._shotTargets.push({ id: b.id, center: b.chest, radius: 0.62, alive: true });
    }
    return this._shotTargets;
  }

  _damageBot(bot, amount, point = null, weaponId = null) {
    const before = bot.alive;
    const hpBefore = bot.health.value;
    bot.health.damage(amount, this.time);
    const dealt = Math.max(0, hpBefore - bot.health.value);
    this.stats.damage += dealt;
    const killed = before && !bot.alive;
    const at = point ?? bot.chest;
    const scr = this._toScreen(at);
    if (scr) this.hud.damageNumber(scr.x, scr.y, dealt, killed);
    this.hud.markHit(killed);
    this.audio.hit(true);
    haptics.hitDealt();
    // being shot at pulls the bot's attention even if it did not see the shooter
    bot.lastKnown = { x: this.player.pos.x, z: this.player.pos.z };
    bot.lostTimer = 0;
    if (killed) {
      this.player.kills += 1;
      this.stats.kills = this.player.kills;
      this._onBotDeath(bot, 'player', weaponId);
    }
    return killed;
  }

  /** World point -> CSS pixel position, or null when behind the camera. */
  _toScreen(point) {
    const v = this._proj.set(point.x, point.y, point.z).project(this.cam.camera);
    if (v.z > 1 || v.z < -1) return null;
    return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
  }

  /** Look sensitivity multiplier: scopes slow aim in proportion to zoom. */
  lookScale() {
    return this.player.scopeFov ? this.player.scopeFov / CONFIG.camera.fov : 1;
  }

  botName(bot) { return bot ? this.i18n.t(`bot_${bot.name}`) : ''; }

  _onBotDeath(bot, cause, weaponId = null, killer = null) {
    const t = (k) => this.i18n.t(k);
    const name = this.botName(bot);
    if (cause === 'player') {
      const wname = weaponId ? this.lootLabel({ type: 'weapon', weaponId }) : '';
      this.hud.killFeed(t('saeed'), name, wname, true);
      // a kill inside 4s of the previous one extends the streak
      this._streak = this.matchTime - this._lastKillAt < 4 ? this._streak + 1 : 1;
      this._lastKillAt = this.matchTime;
      const title = this._streak >= 3 ? t('tripleKill') : this._streak === 2 ? t('doubleKill') : t('elimination');
      this.hud.banner(title, name);
      this.audio.pickup(); haptics.kill();
    } else if (cause === 'bot' && killer) {
      const wname = weaponId ? this.lootLabel({ type: 'weapon', weaponId }) : '';
      this.hud.killFeed(this.botName(killer), name, wname, false);
    } else {
      this.hud.killFeed(t('zoneKiller'), name, '', false);
    }
    this.octaMood = 1.6;
    const i = this.bots.indexOf(bot);
    const bv = this.botViews[i];
    if (bv) bv.anim.play(AnimState.DEATH);
    this.events.emit('bot:death', { bot, cause });
  }

  /** Angle of a world point relative to the player's facing: 0 = ahead, +x = right. */
  _screenAngleTo(point) {
    const p = this.player;
    const dx = point.x - p.pos.x, dz = point.z - p.pos.z;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    return Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
  }

  _playerCanSee(bot) {
    const e = { x: this.player.pos.x, y: this.player.eyeY, z: this.player.pos.z };
    const c = bot.chest;
    if (Math.hypot(c.x - e.x, c.z - e.z) > 90) return false;
    return !segmentBlocked(e.x, e.z, e.y, c.x, c.z, c.y, this.colliders);
  }

  /** Bot vs bot fire: same damage rule as against the player. */
  _botShootBot(bot, rival, accurate, dist) {
    const def = bot.weapon.def;
    const muzzle = { x: bot.pos.x, y: bot.pos.y + 1.4, z: bot.pos.z };
    const c = rival.chest;
    const to = accurate ? c : { x: c.x + (this.rng() - 0.5) * 3, y: c.y + (this.rng() - 0.5) * 1.5, z: c.z + (this.rng() - 0.5) * 3 };
    const ear = Math.hypot(bot.pos.x - this.player.pos.x, bot.pos.z - this.player.pos.z);
    if (ear < 90) {
      this.effects.muzzleFlash(new THREE.Vector3(muzzle.x, muzzle.y, muzzle.z), 0.8);
      this.effects.tracer(muzzle, to);
      this.audio.shot(def.class, ear);
    }
    if (!accurate || !rival.alive) return;
    rival.health.damage(botShotDamage(def, dist), this.time);
    rival.lastKnown = null;
    rival.rival = bot;                            // shoot back at whoever is shooting
    if (!rival.alive) this._onBotDeath(rival, 'bot', bot.weapon.id, bot);
  }

  _botShoot(bot, accurate, dist) {
    const p = this.player;
    const def = bot.weapon.def;
    const muzzle = { x: bot.pos.x, y: bot.pos.y + 1.4, z: bot.pos.z };
    this.effects.muzzleFlash(new THREE.Vector3(muzzle.x, muzzle.y, muzzle.z), 0.8);
    this.audio.shot(def.class, dist);
    const to = accurate
      ? { x: p.pos.x, y: p.pos.y + p.height * 0.6, z: p.pos.z }
      : {
          x: p.pos.x + (this.rng() - 0.5) * 3.5,
          y: p.pos.y + p.height * 0.6 + (this.rng() - 0.5) * 1.8,
          z: p.pos.z + (this.rng() - 0.5) * 3.5,
        };
    this.effects.tracer(muzzle, to);
    if (!accurate || !p.alive) return;
    let dmg = botShotDamage(def, dist);
    if (p.vehicle) {                       // the buggy's cage takes part of it
      if (p.vehicle.damage(dmg * 0.8)) { this._wreckBuggy(p.vehicle, bot.id); return; }
      dmg *= 0.6;
    }
    p.takeDamage(dmg, this.time);
    if (!p.alive) this.killer = bot;
    this._healing = false;
    this.hud.flashDamage();
    this.hud.showDamageFrom(this._screenAngleTo(bot.pos));
    haptics.hitTaken();
    this.audio.hurt();
    this.cam.addShake(0.35);
    this.playerAnim.play(AnimState.HIT);
    if (!p.alive) this._lose();
  }

  _pickup(item) {
    const inv = this.player.inventory;
    const before = inv.weapon?.id;
    const res = this.loot.pickup(item, inv);
    if (!res) return;
    this.audio.pickup();
    this.octaMood = 1.2;
    if (res.type === 'weapon') {
      if (res.replaced) this.loot.dropWeapon(res.replaced, item.x + 0.8, item.z + 0.8);
      this._equipWeaponModel();
      this.hud.toast(`${this.i18n.t('weaponFound')}: ${this.lootLabel(item)}`, 'kill');
    } else if (res.type === 'armor') {
      this.hud.toast(this.i18n.t('armorFound'), 'kill');
    } else if (res.type === 'ammo') {
      this.hud.toast(`+${res.amount} ${this.i18n.t('ammoFound')}`);
    } else if (res.type === 'grenade') {
      this.hud.toast(`+1 ${this.i18n.t('grenade')}`);
    } else if (res.type === 'dallah') {
      this.quest.state = 'carry';
      this.hud.banner(this.i18n.t('dallahFound'), this.i18n.t('dallahSub'));
      this.octaMood = 2;
    } else {
      this.hud.toast(`+1 ${this.i18n.t('medkitFound')}`);
    }
    if (this._airdropIds?.has(item.id)) { this._airdropIds = null; this.stats.airdrops += 1; }
    if (before !== inv.weapon?.id) this._equipWeaponModel();
    this.lootView.sync(this.loot.items);
  }

  // ---------------------------------------------------------------- results
  _summary(won) {
    const s = this.stats;
    s.kills = this.player.kills;
    s.time = this.matchTime;
    s.won = won;
    s.placement = won ? 1 : this.aliveBots + 1;
    s.killer = won ? null : (this.killer ? this.botName(this.killer) : this.i18n.t(this._deathCause ?? 'zoneKiller'));
    s.accuracy = s.shots ? s.hits / s.shots : 0;
    return { ...s };
  }
  _win() {
    if (this.state !== MatchState.PLAYING) return;
    this.state = MatchState.WON;
    this.octaMood = 6;
    this.audio.victory();
    haptics.victory();
    this.events.emit('match:win', this._summary(true));
  }
  _lose() {
    if (this.state !== MatchState.PLAYING) return;
    this.state = MatchState.LOST;
    this.audio.defeat();
    haptics.death();
    const sum = this._summary(false);
    this.timeScale = 0.3;                         // slow motion while the kill-cam turns
    this.hud.killFeed(sum.killer, this.i18n.t('saeed'), '', false);
    this.hud.banner(this.i18n.t('eliminatedBy'), sum.killer, 'bad');
    this.events.emit('match:lose', sum);
  }

  /** Swap Saeed's outfit (lobby skin picker). Rebuilds only his model. */
  setSkin(skin) {
    this.skin = skin;
    const old = this.playerView;
    const fresh = buildSaeed(skin);
    fresh.root.position.copy(old.root.position);
    fresh.root.rotation.copy(old.root.rotation);
    this.scene.remove(old.root);
    old.dispose();
    this.playerView = fresh;
    this.playerAnim = new ProceduralAnimator(fresh.rig);
    this.scene.add(fresh.root);
    if (this.weaponMesh) { this.weaponMesh = null; this._equipWeaponModel(); }
  }

  /**
   * Dynamic resolution: drop render scale when frames run long, recover when
   * there is headroom. Keeps phones near their refresh rate instead of
   * stuttering when the fight gets busy.
   */
  adaptResolution(fps, dt) {
    if (!this.dynamicResolution) return;
    this._resTimer += dt;
    if (this._resTimer < 1.5) return;
    this._resTimer = 0;
    let next = this.pixelRatio;
    if (fps < 42) next = Math.max(0.6, this.pixelRatio - 0.15);
    else if (fps > 56) next = Math.min(this.pixelRatioMax, this.pixelRatio + 0.1);
    if (Math.abs(next - this.pixelRatio) > 0.01) {
      this.pixelRatio = next;
      this.renderer.setPixelRatio(next);
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    }
  }
  pause() { if (this.state === MatchState.PLAYING) { this.state = MatchState.PAUSED; return true; } return false; }
  resume() { if (this.state === MatchState.PAUSED) { this.state = MatchState.PLAYING; return true; } return false; }

  render() { if (!this.contextLost) this.renderer.render(this.scene, this.cam.camera); }
  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.cam.resize(w / Math.max(1, h));
  }
  dispose() {
    clearCharacterMaterials();
    clearSharedTextures();
    this.sky?.dispose();
    this.envMap?.dispose();
    this.effects.dispose();
    this.lootView.dispose();
    this.world.dispose();
    this.scenery?.dispose();
    this.zoneVisual.dispose();
    this.renderer.dispose();
  }
}

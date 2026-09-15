import * as THREE from 'three';
import { CONFIG } from './config.js';
import { EventBus } from './events.js';
import { makeRng, damp } from './mathx.js';
import { buildMap } from '../world/mapData.js';
import { buildWorld, buildZoneVisual } from '../world/worldView.js';
import { LootView } from '../world/lootView.js';
import { Player } from '../player/player.js';
import { Bot } from '../ai/bot.js';
import { buildSaeed, buildBotModel, buildOcta, buildMansour } from '../player/characters.js';
import { ProceduralAnimator, AnimState, resolveState } from '../player/animator.js';
import { ThirdPersonCamera } from '../camera/thirdPersonCamera.js';
import { EffectsSystem } from '../combat/effects.js';
import { traceShot, spreadDir } from '../combat/hitscan.js';
import { falloff } from '../combat/damage.js';
import { buildWeaponModel } from '../weapons/weaponModels.js';
import { WEAPONS } from '../weapons/weapons.js';
import { SafeZone } from '../zone/zone.js';
import { LootManager } from '../loot/loot.js';
import { segmentBlocked } from '../world/collision.js';

export const MatchState = { IDLE: 'idle', PLAYING: 'playing', PAUSED: 'paused', WON: 'won', LOST: 'lost' };

const QUALITY = {
  low:  { shadows: false, pixelRatio: 1.0, fogNear: 60, fogFar: 150 },
  med:  { shadows: true,  pixelRatio: 1.35, fogNear: 90, fogFar: 200 },
  high: { shadows: true,  pixelRatio: 2.0, fogNear: 130, fogFar: 260 },
};

export class Game {
  constructor(canvas, { audio, hud, i18n, quality = 'med' } = {}) {
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

    this.map = buildMap();
    this.colliders = this.map.colliders;

    this._initRenderer();
    this._initScene();

    this.player = new Player(this.map.spawns.player);
    this.bots = [];
    this.zone = new SafeZone(this.map.center);
    this.loot = new LootManager(this.map.lootSpots);
    this.nearbyLoot = null;
    this.mansourNear = false;
    this._shotTargets = [];
    this._fireHeld = false;
    this._zoneWarned = -1;
  }

  // ---------------------------------------------------------------- renderer
  _initRenderer() {
    const q = QUALITY[this.quality] ?? QUALITY.med;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: false, powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0xe8c99a);
  }
  setQuality(name) {
    const q = QUALITY[name] ?? QUALITY.med;
    this.quality = name;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.shadowMap.enabled = q.shadows;
    this.scene.fog.near = q.fogNear;
    this.scene.fog.far = q.fogFar;
    this.sun.castShadow = q.shadows;
  }

  _initScene() {
    const q = QUALITY[this.quality] ?? QUALITY.med;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe8c99a);
    this.scene.fog = new THREE.Fog(0xe8c99a, q.fogNear, q.fogFar);

    // Two lights only: one directional sun + hemisphere fill. Cheap on mobile.
    this.sun = new THREE.DirectionalLight(0xfff0d0, 1.5);
    this.sun.position.set(48, 70, 30);
    this.sun.castShadow = q.shadows;
    this.sun.shadow.mapSize.set(1024, 1024);
    const s = 70;
    Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 200 });
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.scene.add(new THREE.HemisphereLight(0xffe9c4, 0x8a6a45, 0.9));

    this.world = buildWorld(this.map, { quality: this.quality });
    this.scene.add(this.world.group);

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

    this.octa = buildOcta();
    this.scene.add(this.octa.root);
    this.octaMood = 0;

    this.mansour = buildMansour();
    this.mansourAnim = new ProceduralAnimator(this.mansour.rig);
    const ms = this.map.spawns.npcMansour;
    this.mansour.root.position.set(ms.x, 0, ms.z);
    this.mansour.root.rotation.y = 2.2;
    this.scene.add(this.mansour.root);

    this.botViews = [];
  }

  // ---------------------------------------------------------------- match
  startMatch() {
    this.matchTime = 0;
    this.player.reset();
    this.player.pos.x = this.map.spawns.player.x;
    this.player.pos.z = this.map.spawns.player.z;
    this.playerAnim = new ProceduralAnimator(this.playerView.rig);
    this.zone.reset();
    this.loot.reset(this.map.lootSpots);
    this.lootView.clear();
    this.lootView.sync(this.loot.items);
    this._zoneWarned = -1;
    this.nearbyLoot = null;

    // Start with a sidearm-grade rifle so the first 10 seconds are playable
    this.player.inventory.addWeapon('OCTA_AR');
    this.player.inventory.addMedkit();
    this._equipWeaponModel();

    // bots
    this.bots.forEach((b) => b.reset());
    if (this.bots.length === 0) {
      const loadouts = ['OCTA_AR', 'DESERT_CLAW', 'OCTA_AR', 'SAEED_50', 'OCTA_AR'];
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
    this.bots.forEach((b) => { b.visibleToPlayer = false; });
    this.botViews.forEach(({ view }) => { view.root.visible = true; });

    this.state = MatchState.PLAYING;
    this.events.emit('match:start');
  }

  _equipWeaponModel() {
    const socket = this.playerView.rig.weaponSocket;
    if (this.weaponMesh) { socket.remove(this.weaponMesh.root); this.weaponMesh = null; }
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
      return lang === 'ar' ? d.nameAr : d.nameEn;
    }
    if (item.type === 'medkit') return this.i18n.t('medkit');
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

    // --- movement / physics ---
    this.player.update(dt, input, this.colliders);

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
    if (input.fire) this._tryFire();
    this._fireHeld = input.fire;

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
    this.nearbyLoot = this.loot.nearest(this.player.pos.x, this.player.pos.z);
    if (input.interact && this.nearbyLoot) this._pickup(this.nearbyLoot);

    // --- bots ---
    const botCtx = {
      player: this.player, colliders: this.colliders, zone: this.zone, time: this.time,
      // Brief spawn protection so the round does not open with the player being
      // shot before they have even looked around.
      holdFire: this.matchTime < CONFIG.match.spawnGrace,
      onShoot: (bot, accurate, dist) => this._botShoot(bot, accurate, dist),
    };
    for (const bot of this.bots) {
      const wasAlive = bot.alive;
      bot.update(dt, botCtx);
      bot.visibleToPlayer = bot.alive && this._playerCanSee(bot);
      if (wasAlive && !bot.alive) this._onBotDeath(bot, 'zone');
    }

    // --- zone ---
    this.zone.update(dt);
    if (this.zone.state === 'shrinking' && this._zoneWarned !== this.zone.phase) {
      this._zoneWarned = this.zone.phase;
      this.audio.zoneWarn();
      this.hud.toast(this.i18n.both('zoneClosing'), 'bad');
    }
    const zd = this.zone.damageFor(this.player.pos.x, this.player.pos.z, dt);
    if (zd > 0) {
      this.player.takeDamage(zd, this.time);
      this._zoneTick = (this._zoneTick ?? 0) + dt;
      if (this._zoneTick > 0.85) { this._zoneTick = 0; this.hud.flashDamage(); this.audio.hurt(); }
      if (!this.player.alive) this._lose();
    }

    // --- Uncle Mansour ---
    const ms = this.map.spawns.npcMansour;
    const near = Math.hypot(this.player.pos.x - ms.x, this.player.pos.z - ms.z) < 6;
    if (near !== this.mansourNear) {
      this.mansourNear = near;
      this.hud.showMansour(near);
      if (near) this.audio.pickup();
    }

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
    root.rotation.y = p.yaw;
    const w = p.inventory.weapon;
    const anim = this.playerAnim;
    if (!p.alive) anim.play(AnimState.DEATH);
    else if (this.state === MatchState.WON) anim.play(AnimState.VICTORY);
    else if (anim.oneShot <= 0) {
      anim.play(resolveState({
        alive: p.alive, reloading: !!w?.reloading, firing: false,
        grounded: p.grounded, crouching: p.crouching, aiming: p.aiming, speed: p.speed,
      }));
    }
    anim.update(dt, { speed: p.speed, aiming: p.aiming, pitch: p.pitch, armed: !!w });
    root.visible = true;

    // bots
    this.bots.forEach((bot, i) => {
      const bv = this.botViews[i];
      if (!bv) return;
      bv.view.root.position.set(bot.pos.x, bot.pos.y, bot.pos.z);
      bv.view.root.rotation.y = bot.yaw;
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
    this.cam.update(dt, this.player, this.colliders);
    this.sun.target.position.set(this.player.pos.x, 0, this.player.pos.z);
    this.sun.position.set(this.player.pos.x + 48, 70, this.player.pos.z + 30);
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
    if (!p.alive) return;
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
        if (bot) this._damageBot(bot, hit.damage);
        this.effects.impact(hit.point, true);
        this.hud.markHit();
      } else if (hit.kind === 'world') {
        this.effects.impact(hit.point, false);
      }
    }
  }

  _targets() {
    this._shotTargets.length = 0;
    for (const b of this.bots) {
      if (!b.alive) continue;
      this._shotTargets.push({ id: b.id, center: b.chest, radius: 0.62, alive: true });
    }
    return this._shotTargets;
  }

  _damageBot(bot, amount) {
    const before = bot.alive;
    bot.health.damage(amount, this.time);
    this.audio.hit(true);
    // being shot at pulls the bot's attention even if it did not see the shooter
    bot.lastKnown = { x: this.player.pos.x, z: this.player.pos.z };
    bot.lostTimer = 0;
    if (before && !bot.alive) {
      this.player.kills += 1;
      this._onBotDeath(bot, 'player');
    }
  }

  _onBotDeath(bot, cause) {
    const label = `${this.i18n.t('killed')}: ${bot.name}`;
    this.hud.toast(label, cause === 'player' ? 'kill' : '');
    this.octaMood = 1.6;
    if (cause === 'player') this.audio.pickup();
    const i = this.bots.indexOf(bot);
    const bv = this.botViews[i];
    if (bv) bv.anim.play(AnimState.DEATH);
    this.events.emit('bot:death', { bot, cause });
  }

  _playerCanSee(bot) {
    const e = { x: this.player.pos.x, y: this.player.eyeY, z: this.player.pos.z };
    const c = bot.chest;
    if (Math.hypot(c.x - e.x, c.z - e.z) > 90) return false;
    return !segmentBlocked(e.x, e.z, e.y, c.x, c.z, c.y, this.colliders);
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
    const dmg = CONFIG.bots.damage * falloff(dist, def.range) * (def.class === 'shotgun' ? 1.4 : 1);
    p.takeDamage(dmg, this.time);
    this._healing = false;
    this.hud.flashDamage();
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
    } else if (res.type === 'ammo') {
      this.hud.toast(`+${res.amount} ${this.i18n.t('ammoFound')}`);
    } else {
      this.hud.toast(`+1 ${this.i18n.t('medkitFound')}`);
    }
    if (before !== inv.weapon?.id) this._equipWeaponModel();
    this.lootView.sync(this.loot.items);
  }

  // ---------------------------------------------------------------- results
  _win() {
    if (this.state !== MatchState.PLAYING) return;
    this.state = MatchState.WON;
    this.octaMood = 6;
    this.audio.victory();
    this.events.emit('match:win', { kills: this.player.kills, time: this.matchTime });
  }
  _lose() {
    if (this.state !== MatchState.PLAYING) return;
    this.state = MatchState.LOST;
    this.audio.defeat();
    this.events.emit('match:lose', { kills: this.player.kills, time: this.matchTime });
  }
  pause() { if (this.state === MatchState.PLAYING) { this.state = MatchState.PAUSED; return true; } return false; }
  resume() { if (this.state === MatchState.PAUSED) { this.state = MatchState.PLAYING; return true; } return false; }

  render() { this.renderer.render(this.scene, this.cam.camera); }
  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.cam.resize(w / Math.max(1, h));
  }
  dispose() {
    this.effects.dispose();
    this.lootView.dispose();
    this.world.dispose();
    this.zoneVisual.dispose();
    this.renderer.dispose();
  }
}

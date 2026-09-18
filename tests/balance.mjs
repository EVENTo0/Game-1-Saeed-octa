/**
 * Headless balance harness.
 *
 * Plays complete SAEED ROYALE matches with no browser and no three.js, by
 * driving the SAME pure modules the shipped game drives: Player, Bot, SafeZone,
 * LootManager, traceShot, botShotDamage. The only thing written here is the
 * *player's decisions* — i.e. a scripted stand-in for a human thumb.
 *
 *   node tests/balance.mjs [matches] [--skill=0.55] [--json]
 *
 * Numbers it reports are therefore measurements of the real systems, not of a
 * copy of them. What it cannot measure: how the game FEELS to a thumb.
 */
import { Player } from '../src/player/player.js';
import { Bot } from '../src/ai/bot.js';
import { SafeZone } from '../src/zone/zone.js';
import { LootManager } from '../src/loot/loot.js';
import { buildMap } from '../src/world/mapData.js';
import { traceShot, spreadDir } from '../src/combat/hitscan.js';
import { botShotDamage } from '../src/combat/botFire.js';
import { segmentBlocked } from '../src/world/collision.js';
import { makeRng, normalize2, clamp } from '../src/core/mathx.js';
import { CONFIG } from '../src/core/config.js';
import { createInputState } from '../src/ui/input.js';

const DT = 1 / 30;
const MAX_SECONDS = 15 * 60;

/**
 * A scripted "average player": rotates toward threats at a human rate, has
 * reaction delay and aim error, takes cover-free fights, loots on the way,
 * heals when hurt, and walks to the zone centre. `skill` 0..1 scales aim.
 */
class ScriptedPlayer {
  constructor(player, rng, skill = 0.55, style = 'aggressive') {
    this.p = player;
    this.rng = rng;
    this.skill = skill;
    // How close a threat must be before the player stops looting and fights.
    // 'aggressive' engages anything it can see; 'cautious' gears up first. A
    // human sits between the two, so both are reported rather than one being
    // treated as the truth.
    this.commitRange = style === 'cautious' ? 35 : 70;
    this.style = style;
    this.target = null;
    this.reaction = 0;
    this.lootTarget = null;
    this.aimErr = 0;
    this.lastPos = { x: player.pos.x, z: player.pos.z };
    this.slideTimer = 0;
    this.slideDir = 1;
    this.stats = { shots: 0, hits: 0, kills: 0, dmgFromBots: 0, dmgFromZone: 0, heals: 0, pickups: 0, dryShots: 0, pellets: 0 };
  }
  /** Turn rate a thumb can actually manage (rad/s). */
  get turnRate() { return 2.4 + this.skill * 2.2; }

  visibleBots(bots, colliders) {
    const eye = { x: this.p.pos.x, y: this.p.eyeY, z: this.p.pos.z };
    return bots.filter((b) => {
      if (!b.alive) return false;
      const c = b.chest;
      const d = Math.hypot(c.x - eye.x, c.z - eye.z);
      if (d > 70) return false;
      return !segmentBlocked(eye.x, eye.z, eye.y, c.x, c.z, c.y, colliders);
    });
  }

  decide(dt, { bots, colliders, zone, loot }) {
    const input = createInputState();
    const p = this.p;
    if (!p.alive) return input;

    const seen = this.visibleBots(bots, colliders);
    // nearest visible enemy
    let near = null, nd = Infinity;
    for (const b of seen) {
      const d = Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
      if (d < nd) { nd = d; near = b; }
    }
    if (near && near !== this.target) { this.target = near; this.reaction = 0.28 + this.rng() * 0.25; }
    if (!near) this.target = null;
    if (this.reaction > 0) this.reaction -= dt;

    const w = p.inventory.weapon;

    // --- healing: only when hurt and nothing in sight ---
    if (!near && p.health.value < 55 && p.inventory.medkits > 0 && p.healTimer <= 0) {
      input.use = true;
      this.stats.heals += 1;
      return input;
    }
    // --- reload when there is a lull ---
    if (w && !w.reloading && w.mag === 0) input.reload = true;
    if (w && !near && !w.reloading && w.mag < w.def.magSize * 0.4) input.reload = true;

    // --- where are we going? ---
    let goal = null;
    const safe = zone.safePoint(p.pos.x, p.pos.z, 0.75);
    const committed = near && nd < this.commitRange;
    if (safe) {
      goal = safe;                                  // ring first, always
    } else if (committed && this.reaction <= 0) {
      goal = null;                                  // stand and fight
    } else {
      // loot run, else drift toward the middle of the ring
      if (!this.lootTarget || this.lootTarget.taken) {
        let best = null, bd = 45;
        for (const it of loot.items) {
          if (it.taken) continue;
          if (it.type === 'medkit' && p.inventory.medkits >= CONFIG.match.maxMedkits) continue;
          const d = Math.hypot(it.x - p.pos.x, it.z - p.pos.z);
          if (d < bd) { bd = d; best = it; }
        }
        this.lootTarget = best;
      }
      goal = this.lootTarget
        ? { x: this.lootTarget.x, z: this.lootTarget.z }
        : { x: zone.center.x, z: zone.center.z };
    }

    // --- aiming: turn toward the target at a human rate ---
    const lookAt = near ? { x: near.pos.x, z: near.pos.z } : goal;
    if (lookAt) {
      const want = Math.atan2(-(lookAt.x - p.pos.x), -(lookAt.z - p.pos.z));
      let diff = want - p.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const step = clamp(diff, -this.turnRate * dt, this.turnRate * dt);
      p.yaw += step;
      // vertical: aim at the chest
      if (near) {
        const d = Math.max(0.5, nd);
        const wantPitch = Math.atan2((near.chest.y - p.eyeY), d);
        p.pitch += clamp(wantPitch - p.pitch, -2 * dt, 2 * dt);
      }
    }

    // --- movement ---
    // same wall-slide a human does: if the last step went nowhere, try sideways
    const stepped = Math.hypot(p.pos.x - this.lastPos.x, p.pos.z - this.lastPos.z);
    this.lastPos = { x: p.pos.x, z: p.pos.z };
    if (this.slideTimer > 0) this.slideTimer -= dt;
    if (goal && stepped < CONFIG.player.walkSpeed * dt * 0.4) {
      if (this.slideTimer <= 0) { this.slideDir = this.rng() < 0.5 ? 1 : -1; this.slideTimer = 0.9; }
    }
    if (goal) {
      let n = normalize2(goal.x - p.pos.x, goal.z - p.pos.z);
      if (this.slideTimer > 0) {
        const a = this.slideDir * 1.15, ca = Math.cos(a), sa = Math.sin(a);
        n = { x: n.x * ca - n.z * sa, z: n.x * sa + n.z * ca };
      }
      // convert world direction to stick space (inverse of the player's yaw)
      const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
      input.moveX = n.x * cos - n.z * sin;
      input.moveZ = -n.x * sin - n.z * cos;
      const m = Math.hypot(input.moveX, input.moveZ) || 1;
      input.moveX /= m; input.moveZ /= m;
      input.run = !committed || !!safe;
    }

    // --- shooting ---
    // A real player does not hold the trigger while still swinging onto target,
    // and does not open up at 90m with a rifle. Both were making the scripted
    // player look far worse than a human, which would have hidden the real
    // balance picture behind a bad script.
    if (near && this.reaction <= 0 && w && !w.reloading && w.mag > 0) {
      const engageRange = Math.min(w.def.range * 0.6, w.def.class === 'shotgun' ? 18 : 48);
      if (nd <= engageRange) {
        const want = Math.atan2(-(near.pos.x - p.pos.x), -(near.pos.z - p.pos.z));
        let off = want - p.yaw;
        while (off > Math.PI) off -= Math.PI * 2;
        while (off < -Math.PI) off += Math.PI * 2;
        const onTarget = Math.abs(off) < 0.09;     // ~5 degrees
        input.aim = nd > 12;                       // ADS at distance, hipfire up close
        input.fire = onTarget;
      }
    }
    // --- interact with loot we are standing on ---
    const item = loot.nearest(p.pos.x, p.pos.z);
    if (item) {
      const wantIt = item.type !== 'medkit' || p.inventory.medkits < CONFIG.match.maxMedkits;
      if (wantIt) input.interact = true;
    }
    return input;
  }
}

export function simulateMatch(seed = 1, { skill = 0.55, style = 'aggressive' } = {}) {
  const rng = makeRng(seed);
  const map = buildMap();
  const colliders = map.colliders;

  const player = new Player(map.spawns.player);
  player.reset();
  player.inventory.addWeapon('OCTA_AR');
  player.inventory.addMedkit();

  const zone = new SafeZone(map.center);
  const loot = new LootManager(map.lootSpots);
  const loadouts = ['OCTA_AR', 'DESERT_CLAW', 'OCTA_AR', 'SAEED_50', 'OCTA_AR'];
  const bots = map.spawns.bots.slice(0, CONFIG.bots.count).map((s, i) =>
    new Bot({ ...s, weaponId: loadouts[i % loadouts.length], id: `bot_${i}_${s.name}` }));

  const brain = new ScriptedPlayer(player, rng, skill, style);
  const ttk = [];                       // seconds from first damage to death, per bot
  const firstHitAt = new Map();
  let t = 0;
  let outcome = 'timeout';

  const targets = [];
  const refreshTargets = () => {
    targets.length = 0;
    for (const b of bots) if (b.alive) targets.push({ id: b.id, center: b.chest, radius: 0.62, alive: true });
    return targets;
  };

  let fireHeld = false;

  while (t < MAX_SECONDS) {
    const input = brain.decide(DT, { bots, colliders, zone, loot });

    player.look(0, 0);
    player.update(DT, input, colliders);

    const w = player.inventory.weapon;
    if (w) w.update(DT);
    if (input.reload && w) w.startReload();

    // --- player shoots (mirrors Game._tryFire's rules) ---
    if (input.fire && w && !w.reloading && w.mag > 0 && !(!w.def.auto && fireHeld)) {
      if (w.fire()) {
        brain.stats.shots += 1;
        brain.stats.pellets += w.def.pellets;
        const origin = { x: player.pos.x, y: player.eyeY, z: player.pos.z };
        const base = player.aimDir();
        const spread = w.spreadFor(player.aiming);
        // human aim error on top of weapon spread: worse when moving/unskilled
        const moveErr = Math.min(1, player.speed / CONFIG.player.runSpeed) * 0.045;
        const err = (1 - brain.skill) * 0.05 + moveErr;
        const aimed = spreadDir(base, err, rng);
        for (let i = 0; i < w.def.pellets; i++) {
          const dir = spreadDir(aimed, spread, rng);
          const hit = traceShot(origin, dir, colliders, refreshTargets(), w.def);
          if (hit.kind === 'actor') {
            const bot = bots.find((b) => b.id === hit.targetId);
            if (bot?.alive) {
              brain.stats.hits += 1;
              if (!firstHitAt.has(bot.id)) firstHitAt.set(bot.id, t);
              bot.health.damage(hit.damage, t);
              bot.lastKnown = { x: player.pos.x, z: player.pos.z };
              bot.lostTimer = 0;
              if (!bot.alive) {
                brain.stats.kills += 1;
                ttk.push(t - firstHitAt.get(bot.id));
              }
            }
          }
        }
      }
    }
    if (input.fire && w && w.mag === 0 && w.reserve === 0) brain.stats.dryShots += 1;
    fireHeld = !!input.fire;

    // --- healing completion (mirrors Game.update) ---
    if (player.healTimer <= 0 && brain._healing) {
      brain._healing = false;
      player.finishHeal();
    }
    if (input.use && player.beginHeal()) brain._healing = true;

    // --- loot ---
    if (input.interact) {
      const item = loot.nearest(player.pos.x, player.pos.z);
      if (item && loot.pickup(item, player.inventory)) brain.stats.pickups += 1;
    }

    // --- bots ---
    const botCtx = {
      player, colliders, zone, time: t,
      holdFire: t < CONFIG.match.spawnGrace,
      onShoot: (bot, accurate, dist) => {
        if (!accurate || !player.alive) return;
        const dmg = botShotDamage(bot.weapon.def, dist);
        brain.stats.dmgFromBots += player.takeDamage(dmg, t);
        brain._healing = false;
      },
    };
    for (const bot of bots) bot.update(DT, botCtx);

    // --- zone ---
    zone.update(DT);
    const zd = zone.damageFor(player.pos.x, player.pos.z, DT);
    if (zd > 0) brain.stats.dmgFromZone += player.takeDamage(zd, t);

    t += DT;
    if (!player.alive) { outcome = 'defeat'; break; }
    if (bots.every((b) => !b.alive)) { outcome = 'victory'; break; }
  }

  const wEnd = player.inventory.weapon;
  return {
    outcome,
    seconds: t,
    endMag: wEnd ? wEnd.mag : 0,
    endReserve: wEnd ? wEnd.reserve : 0,
    endMedkits: player.inventory.medkits,
    dryShots: brain.stats.dryShots,
    kills: brain.stats.kills,
    botsAlive: bots.filter((b) => b.alive).length,
    accuracy: brain.stats.pellets ? brain.stats.hits / brain.stats.pellets : 0,
    shots: brain.stats.shots,
    ttk,
    dmgFromBots: brain.stats.dmgFromBots,
    dmgFromZone: brain.stats.dmgFromZone,
    pickups: brain.stats.pickups,
    heals: brain.stats.heals,
    heals: brain.stats.heals,
    hpLeft: player.health.value,
    zonePhase: zone.phase,
  };
}

export function runSuite(n = 200, skill = 0.55, style = 'aggressive') {
  const runs = [];
  for (let i = 0; i < n; i++) runs.push(simulateMatch(1000 + i * 37, { skill, style }));
  const win = runs.filter((r) => r.outcome === 'victory');
  const loss = runs.filter((r) => r.outcome === 'defeat');
  const timeout = runs.filter((r) => r.outcome === 'timeout');
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const pct = (xs, q) => {
    if (!xs.length) return 0;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(q * s.length))];
  };
  const allTtk = runs.flatMap((r) => r.ttk);
  return {
    matches: n, skill, style,
    winRate: win.length / n,
    lossRate: loss.length / n,
    timeoutRate: timeout.length / n,
    avgMatchSec: avg(runs.map((r) => r.seconds)),
    medMatchSec: pct(runs.map((r) => r.seconds), 0.5),
    p90MatchSec: pct(runs.map((r) => r.seconds), 0.9),
    avgKills: avg(runs.map((r) => r.kills)),
    avgAccuracy: avg(runs.map((r) => r.accuracy)),
    medTtk: pct(allTtk, 0.5),
    p90Ttk: pct(allTtk, 0.9),
    avgDmgFromBots: avg(runs.map((r) => r.dmgFromBots)),
    avgDmgFromZone: avg(runs.map((r) => r.dmgFromZone)),
    avgPickups: avg(runs.map((r) => r.pickups)),
    avgHeals: avg(runs.map((r) => r.heals)),
    avgHpLeftOnWin: avg(win.map((r) => r.hpLeft)),
    avgZonePhase: avg(runs.map((r) => r.zonePhase)),
  };
}

// ---- CLI ----
if (process.argv[1] && process.argv[1].endsWith('balance.mjs')) {
  const n = Number(process.argv[2]) || 200;
  const skillArg = process.argv.find((a) => a.startsWith('--skill='));
  const json = process.argv.includes('--json');
  const skills = skillArg ? [Number(skillArg.split('=')[1])] : [0.35, 0.55, 0.75];
  const out = skills.map((s) => runSuite(n, s));
  if (json) { console.log(JSON.stringify(out, null, 2)); }
  else {
    for (const r of out) {
      console.log(`\n=== skill ${r.skill}  (${r.matches} matches) ===`);
      console.log(`  win ${(r.winRate * 100).toFixed(1)}%   loss ${(r.lossRate * 100).toFixed(1)}%   timeout ${(r.timeoutRate * 100).toFixed(1)}%`);
      console.log(`  match length   median ${r.medMatchSec.toFixed(0)}s   avg ${r.avgMatchSec.toFixed(0)}s   p90 ${r.p90MatchSec.toFixed(0)}s`);
      console.log(`  kills ${r.avgKills.toFixed(2)}/5   accuracy ${(r.avgAccuracy * 100).toFixed(1)}%   pickups ${r.avgPickups.toFixed(1)}`);
      console.log(`  time-to-kill   median ${r.medTtk.toFixed(2)}s   p90 ${r.p90Ttk.toFixed(2)}s`);
      console.log(`  damage taken   bots ${r.avgDmgFromBots.toFixed(0)}   zone ${r.avgDmgFromZone.toFixed(0)}`);
      console.log(`  hp left on win ${r.avgHpLeftOnWin.toFixed(0)}   avg zone phase reached ${r.avgZonePhase.toFixed(1)}/4`);
    }
  }
}

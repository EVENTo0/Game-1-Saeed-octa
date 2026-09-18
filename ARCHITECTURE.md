# ARCHITECTURE

## Stack and why

| Choice | Reason |
|---|---|
| **three.js** | The smallest reliable 3D stack that runs on every phone browser today, with a clear path to native via Capacitor/Cordova later. |
| **Vite** | Zero-config dev server that binds to `0.0.0.0`, so a phone on the same Wi-Fi can load the game seconds after a code change. |
| **Vanilla JS modules** | No framework, no build magic, no TypeScript step. The whole game is ~4 500 lines you can read. |
| **Vitest** | Runs the pure-logic modules headlessly in under a second. |
| **Playwright** | Drives the *real* build in a real browser for the end-to-end smoke test. |

No backend, no database, no accounts, no analytics. The production build is a
static folder.

---

## The one rule: simulation is separate from rendering

Every gameplay system is plain JavaScript with **no three.js import**. The
three.js layer reads that state and draws it.

```
src/
├── core/
│   ├── config.js      all gameplay tunables in one object
│   ├── game.js        orchestrator: owns the scene, entities and the loop
│   ├── events.js      tiny event bus (match:start, match:win, bot:death…)
│   └── mathx.js       clamp / lerp / damp / seeded RNG
├── player/
│   ├── player.js      ← pure sim: movement, physics, health, healing
│   ├── characters.js  three.js placeholder models (Saeed, bots, OCTA, Mansour)
│   └── animator.js    animation state machine + procedural poses
├── camera/
│   └── thirdPersonCamera.js   over-the-shoulder chase cam with wall avoidance
├── combat/
│   ├── damage.js      ← pure: Health, distance falloff
│   ├── hitscan.js     ← pure: spread cones and shot tracing
│   ├── botFire.js     ← pure: what one bot bullet does to the player
│   ├── aimAssist.js   ← pure: touch aim magnetism
│   └── effects.js     pooled muzzle flashes / tracers / impacts
├── weapons/
│   ├── weapons.js     ← pure: weapon table + WeaponInstance (ammo, reload)
│   └── weaponModels.js
├── ai/
│   └── bot.js         ← pure: the bot state machine
├── world/
│   ├── mapData.js     ← pure: the map as data (colliders, props, spawns, loot)
│   ├── collision.js   ← pure: circle-vs-AABB, ground height, raycasts, LOS
│   ├── worldView.js   three.js geometry built from mapData
│   └── lootView.js
├── zone/
│   └── zone.js        ← pure: the shrinking ring
├── loot/
│   ├── loot.js        ← pure: world pickups
│   └── inventory.js   ← pure: two weapon slots + med kits
├── ui/
│   ├── i18n.js        AR/EN strings, RTL handling
│   ├── hud.js         all HUD DOM reads/writes + minimap canvas
│   ├── input.js       unified input state; keyboard/mouse producer
│   ├── touchControls.js   touch producer (joystick, look drag, buttons)
│   ├── haptics.js         guarded navigator.vibrate wrapper
│   └── style.css
├── audio/
│   └── audio.js       WebAudio synthesis — no sample files
└── main.js            bootstrap, screen routing, the rAF loop
```

The modules marked ← are what the 87 unit tests exercise. They need no DOM, no
canvas and no WebGL, which is why the test suite runs in under a second and why
bugs in movement, damage, loot and the zone get caught before they reach a device.

### The frame

```
main.js rAF
  └─ input.consume()          one snapshot; edge-triggered buttons cleared
      └─ game.update(dt, cmd)
           player.update      → collision.resolveXZ / groundHeightAt
           weapon.update      → cooldown, reload timers
           _tryFire           → hitscan.traceShot → bot.health.damage
           bot.update ×5      → canSee → steer → shoot (ctx.onShoot)
           zone.update        → damage anyone outside
           win / lose checks
           _updateVisualsOnly → models, animators, effects, camera
      └─ hud.update(game)     DOM + minimap
      └─ game.render()
```

`_updateVisualsOnly` also runs while paused/won/lost, so the world keeps
rendering behind the menus.

---

## Measuring balance without a browser

Because the simulation has no three.js import, **complete matches can be played
headlessly**. `tests/balance.mjs` does exactly that: it drives the real `Player`,
`Bot`, `SafeZone`, `LootManager`, `traceShot` and `botShotDamage` and only
scripts the *player's decisions* — a stand-in for a human thumb.

```bash
npm run balance             # 200 matches at three skill levels
node tests/balance.mjs 500 --skill=0.55
```

`botShotDamage` was extracted into its own module for this reason: a balance
number measured against a *copy* of the damage formula is worthless, so the
harness and the shipped game must share the code.

It reports two play styles, because a single scripted policy is not "the
player": `aggressive` fights anything it can see, `cautious` gears up first. A
human sits between them.

**What this can and cannot tell you** is important — see TEST_REPORT.md. It
resolved several real bugs decisively, and it hit a hard limit on questions
about bot lethality, where its own crude healing policy dominates the result.

---

## Extension points (deliberately left open, not built)

| Later feature | Where it attaches |
|---|---|
| **Multiplayer** | `Player` and `Bot` are pure state objects updated from an input command each tick. Replace the local `input.consume()` with a network command stream and run `game.update` on a server tick; nothing in the sim touches the DOM. `EventBus` already emits the events a netcode layer would replicate. |
| **More players (20–50)** | `Bot` has no per-instance geometry; add pooling in `botViews` and an LOD/visibility check mirroring `LootView`'s distance cull. |
| **Larger maps** | `mapData.buildMap()` returns plain data. Swap it for a loader or a generator; `worldView` and collision consume whatever it returns. Add spatial hashing to `collision.js` when the collider count passes a few hundred. |
| **Parachute drop** | A new match phase before `MatchState.PLAYING` that drives `player.pos.y` — the gravity branch in `Player.update` is the only thing to gate. |
| **Vehicles** | New pure sim module + a view; reuse `collision.resolveXZ`. |
| **Real 3D characters** | See below. |
| **OCTA abilities** | `game.octaMood` is already the hook for companion reactions. |
| **Native Android/iOS** | The build is static; wrap `dist/` with Capacitor. Touch controls and landscape handling are already in place. |

---

## Replacing the placeholder characters

The placeholders exist so gameplay could be finished without waiting for art.
Swapping them in is a contained change:

1. `buildHumanoid()` in `src/player/characters.js` returns
   `{ root, rig, materials, dispose }`. The `rig` object is the contract:

   ```js
   rig = { hips, spine, head, armL, armR, legL, legR, weaponSocket }
   ```

2. Write `buildSaeedFromGltf(gltf)` that returns the same shape, mapping those
   seven names onto the real skeleton's bones and parenting `weaponSocket` to
   the right hand bone. Nothing else in the game refers to the model.

3. For skeletal clips, implement the `Animator` interface — `play(state)` and
   `update(dt, ctx)` — on top of `THREE.AnimationMixer`:

   ```js
   class GltfAnimator {
     play(state) { /* crossfade to the clip named `state` */ }
     update(dt, ctx) { this.mixer.update(dt); }
   }
   ```

   `AnimState` already names the required clips: `Idle, Walk, Run, Jump, Crouch,
   Aim, Fire, Reload, Hit, Death, Victory`. `resolveState()` maps gameplay flags
   to those names and stays unchanged.

4. Keep `weaponSocket` oriented so a weapon modelled along its own **+Z** points
   where the arm points (the placeholder rotates the socket a quarter turn about
   X for exactly this reason).

Gameplay, tests, HUD, AI and networking-readiness are all unaffected.

---

## Performance notes

Decisions made specifically for phones, and what they cost/save:

- **Static geometry merging.** Every map mesh sharing a material is merged into
  one at load: **180 meshes → 13**. Characters are merged per animated rig node
  (~25 → ~12 draw calls each), and weapon models into one mesh per material.
  Whole frame: **~93 draw calls, ~5 000 triangles** including the shadow pass.
- **Two lights only** — one directional sun (1024² shadow map that follows the
  player) plus a hemisphere fill. No point lights, no post-processing.
- **Flat-colour Lambert materials.** No textures at all, so there is nothing to
  atlas or compress yet, and no texture memory pressure.
- **Object pooling** for tracers (48), impacts (32) and muzzle flashes (8).
  A shotgun blast spawns seven tracers per trigger pull; allocating those per
  shot causes GC hitches.
- **Loot culling** beyond 55 m.
- **Quality presets** change pixel ratio and shadows, not geometry, so switching
  is instant and cannot break the scene.
- **Fog** doubles as the far clip, hiding the map edge cheaply.
- `dt` is clamped to 100 ms so a backgrounded tab cannot teleport anyone through
  a wall on resume.

# Changelog

## 2.2.1

Stability fix for "the game closes while playing" on phones.

- **GPU memory leak fixed**: every weapon pickup or swap built a new weapon
  model and the old one's buffers stayed on the GPU for the life of the page.
  A 7-match soak now holds GPU geometries at the scene count (249 of 250) and
  the JS heap flat at ~39 MB, with zero script errors.
- **Lighter phone budget**: no MSAA on touch devices (its multisample buffers
  are the largest single allocation on a high-density screen) and a 1.25
  pixel-ratio cap.
- **GPU context loss survived**: the match pauses, three.js restores the
  context, play carries on (tested by forcing a loss mid-match).
- **Crash recovery**: if a match is cut off without a clean exit, the next
  launch switches to performance mode and says why.
- **Error guard**: one failing frame is recorded and skipped instead of ending
  the session; the last error shows in Settings for diagnosis.

## 2.2.0

Answers the owner's phone test: looking around did not work, landings dropped
you among enemies, and the map was too small.

- **Fix: touch look on real phones.** The HUD is click-through, so a real
  finger on open screen reached the canvas and never the touch handler; tests
  had dispatched events straight onto the HUD and missed it. Touch is now
  read at document level, and smoke drives look with real (CDP) touches.
- **Fire-and-look**: dragging from the fire button keeps aiming. Look has a
  response curve and slows when aiming or scoped.
- **Saeed Island**: 520 m map (5.6x the area) with 12 named locations, climbable
  roofs and fort towers, shipping containers, ruins, sandbags, bushes, roads,
  windows and per-material buildings.
- **Plane and landing**: ride the plane along a route shown in the lobby, jump
  anywhere or auto-jump over the marked spot, ~15 s freefall with a manual or
  automatic canopy, and a glide that steers to the marker. Landing names the
  location; at most one bot is left within 60 m.
- **Ten players**: 9 bots that loot their landing spot, rotate to the next
  zone and fight each other too. Crouch in a bush to stay hidden.
- **Weapons**: SARB-9 SMG and SAQR DMR; new PBR weapon models; first-person
  scopes on the DMR and SAEED-50.
- **Characters**: capsule-built bodies with helmet, plate carrier and backpack;
  nine distinct bot palettes; fixed outfits being darkened to black.
- **Performance**: 7x faster raycasts, instanced loot, bot culling: 102 draw
  calls per frame against 176 before the optimisation.
- **Balance** (tests/balance.mjs, N=120, aggressive script): win 15.0/17.5/19.2%
  by skill, median 183 s after landing. Two harness bugs fixed on the way
  (semi-automatics never re-fired; it swapped rifles for shotguns).

## 2.1.0

In-match depth.

- **Armour vest**: new pickup at four spots; soaks half of each hit until its
  40 points are gone. Blue bar above health.
- **Supply drop**: announced at 0:50, falls under a canopy inside the next
  zone, opens into an epic SAEED-50, a vest, a med kit and ammo. Always marked
  in gold on the minimap.
- **Loot rarity**: weapon crates coloured common / rare / epic; epic and
  supply-drop loot get a light beam visible from three times farther.
- **Zone guidance**: outside the safe zone an arrow and distance point back.
- **Balance** (tests/balance.mjs, N=200 per skill): win rate 26.5/22.5/19.5%
  on 2.0 → 32.5/30.0/22.5% on 2.1. The new map spots alone account for about
  half of that; the vest was softened from 50 pts/60% to 40 pts/50%.

## 2.0.0

Full match loop rebuilt to current mobile battle-royale expectations. v1.0.0
(commit `c70c43c`, SKU SAEED-ROYALE-WEB-V1) is unchanged and stays the sellable baseline.

- **Lobby**: Saeed on a lit turntable, account level and XP bar, outfit picker
  (4 outfits unlocked by level), tap-to-choose drop-zone map, build version.
- **Skydive**: every match opens with a steerable freefall and parachute; bots
  hold fire until touchdown plus the spawn grace.
- **Combat feedback**: floating damage numbers, X hitmarker (red on a kill),
  kill feed, elimination / double / triple kill banner.
- **Death**: kill-cam turns to face the opponent who eliminated Saeed.
- **Results**: placement, kills, damage, accuracy and time; itemised XP,
  animated level bar, level-up and outfit unlock call-outs. Progress is saved.
- **Onboarding**: first-match coaching lines that wait for the player to do
  each step (steer, move, look, fire).
- **Performance**: dynamic resolution keeps frame rate steady on busy fights.
- **Localisation**: opponent names in Arabic; all new strings in AR and EN.
- **Fixes**: XP counter direction in RTL; landing event no longer repeats if
  Saeed dies on touchdown.
- **Tooling**: `npm run build:single` for a one-file test build;
  `npm run preview:report` records the whole loop (video + 20 scenes).

# Changelog

## 3.1.0

The owner rated v3.0 at 2/10. The main complaint was the play screen: it was
all buttons, the buttons were big and covered the view, and health and the
other indicators were unclear. They also asked for display settings. Compared
against how 2026 mobile shooters handle this (PUBG Mobile, CoD Mobile, Delta
Force, Blood Strike), and rebuilt to match.

- **Minimal HUD**:
  - Small, translucent outline buttons with line icons replace the filled
    purple discs.
  - Default size is 50 px (46 px on short screens). Fire is 1.5×.
  - Buttons are 70% opaque by default.
- **Contextual controls**: a button shows only while it can do something.
  - RELOAD appears when the magazine isn't full.
  - The frag button needs a grenade. The med kit button needs a kit and
    missing health.
  - Weapon buttons stand down while flying, skydiving or driving.
  - The ✋ and ⇄ buttons are gone. Picking up and riding use a tappable pill
    that names the item, and you swap weapons by tapping the second slot.
- **Vitals bottom-centre**: weapon slots with ammo and a rarity edge sit over
  a thin armour line and health bar, as in PUBG Mobile. The kill feed moved
  top-right. Chips, minimap, compass and quest text are smaller and quieter.
- **Joystick**: a faint ring marks its home position and follows the thumb.
- **Left fire button**, as in CoD Mobile (can be turned off).
- **Auto pick-up** (on by default): supplies are collected by walking over
  them. Weapons auto-fill an empty slot; otherwise they wait for a tap.
- **Settings, rebuilt with tabs**:
  - Graphics: quality, frame-rate cap 30/60/max, third- or first-person
    camera, brightness, FPS counter.
  - Controls: look, ADS and scope sensitivity, aim assist, auto pick-up,
    left fire, vibration.
  - HUD: button size, button opacity, HUD size, damage numbers, and the
    layout editor.
  - Sound and language, and reset all.
  - Settings are now also reachable from the pause menu.
- **HUD layout editor**: the real HUD with every control showing. Drag any
  button to move it, select one to resize it. Saved per button, with a reset
  to defaults.
- **First-person camera**: a gun in hand that bobs and kicks, and no
  character model in the way. The scope, the plane and driving stay as
  before.
- **Tests**:
  - 138 unit tests. The 7 new ones cover the settings schema, clamping,
    storage, layout bounds and frame pacing.
  - New smoke checks for settings, the layout editor drag, auto pick-up,
    contextual buttons and first person.

## 3.0.0

The owner rated v2.2 at 1/10 and asked for every part to reach 10/10: interface,
environment, gameplay, characters, presentation and story. This release
covers all six.

- **Story**: five illustrated panels over live camera shots of the island:
  Saeed, OCTA, Uncle Mansour's coffee house and the tournament. It plays
  once on first launch and any time from the lobby (STORY).
- **Presentation**:
  - A round title card names the landing location.
  - Victory: a slow orbit shot of Saeed and OCTA under confetti.
  - Defeat: the kill-cam runs in slow motion with the colour drained.
- **Environment**:
  - A ring of distant mountains with aerial haze.
  - Thousands of instanced shrubs, grass tufts and stones.
  - A drifting cloud layer, wind-blown dust and golden-hour light.
  - The ground reaches under the mountains, so the sky no longer shows
    through from the plane.
- **Interface**:
  - A compass bar with zone, supply drop and objective markers.
  - Centre chips for zone, alive and kills.
  - Weapon rarity colours.
  - A speedometer while driving.
  - A daily challenge card in the lobby.
- **Frag grenades**:
  - Hold the ◆ button to see the throw arc and blast ring. Release to throw.
  - Grenades bounce off walls and roofs, and the blast is blocked by cover.
  - Some rivals carry one and lob it where they last saw you. A warning
    shows when one lands close.
- **Dune buggies**:
  - Six are parked beside the roads.
  - Driving: the stick throttles and steers, and steering tightens with
    speed. Crashes hurt the buggy and, at high speed, the driver.
  - Running a rival over takes them out.
  - Rifle fire is partly absorbed by the roll cage. A wrecked buggy explodes.
- **Uncle Mansour's coffee (side quest)**:
  - His dallah is hidden at a different location each match.
  - Bring it back to him for full armour, full health, two frags and a med
    kit, plus a thank-you line.
- **Daily challenges**:
  - Three a day from a pool of nine, the same for everyone on a given date.
  - Examples: 5 eliminations, a grenade kill, drive 800 m, deliver the
    coffee, top 3 twice.
  - Progress carries across matches, and XP is paid on the results screen.
- **Tests**:
  - 131 unit tests. 13 are new: grenade arc, bounce and falloff; buggy
    driving and crashes; challenge rotation and payout.
  - 110 smoke checks. 18 are new, covering the story, victory and defeat
    presentation, grenade kill, driving and the coffee quest end to end.

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

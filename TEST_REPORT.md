# TEST REPORT — SAEED ROYALE

Date: 2026-09-18 (polish & balance pass; MVP report below it)
Build under test: production build (`npm run build`) served by `vite preview`
Browser: Chromium (Playwright), software WebGL (SwiftShader)
Phone profile: Pixel 5, **landscape**, `hasTouch: true`, `isMobile: true`

---

## Summary

```
BUILD:            PASS
UNIT TESTS:       87/87 PASS
SMOKE (E2E):      63/63 PASS
BALANCE HARNESS:  2 400 headless matches
MOBILE CONTROLS:  PASS
ARABIC RTL:       PASS
COMBAT:           PASS
AI:               PASS
ZONE:             PASS
VICTORY LOOP:     PASS
CONSOLE ERRORS:   none
```

Nothing below was marked PASS from code reading. Every line was executed —
unit tests through Vitest, everything else by driving the real build in a real
browser with real touch events.

---

## 1. Unit tests — `npm test`

73 tests, 6 files, ~1s. These cover the pure simulation modules (no DOM, no WebGL).

| File | Tests | Covers |
|---|---|---|
| `tests/weapons.test.js` | 15 | Ammo consumption, fire-rate cooldown, dry fire, reload timing, partial reload from a low reserve, melee, damage falloff, hitscan hits/blocks/misses, spread cone bounds, shotgun pellets |
| `tests/player.test.js` | 19 | Spawn state, forward/camera-relative movement, walk vs run vs crouch vs aim speeds, jump arc and landing, pitch clamping, wall blocking, movement stops on death, med-kit heal and interruption, standing on boxes, step-height limits, circle push-out, line of sight, map integrity (spawns clear of geometry, loot in bounds), camera never inside a wall |
| `tests/ai.test.js` | 12 | Wandering, detection, LOS blocked by a wall, firing, spawn-grace hold-fire, reaction delay, reload instead of dry fire, death stops the bot, fleeing the ring, zone damage, round reset, no sinking through map geometry |
| `tests/zone.test.js` | 6 | Opening radius, no shrink during the wait, phase-by-phase shrink, final ring, damage only outside and scaled by dt, safe-point calculation, reset |
| `tests/loot.test.js` | 13 | Two-slot cap and swap, duplicate weapon becomes ammo, switching/cycling, med-kit cap, pickup range, taking a weapon/ammo/med kit, refusing ammo with no weapon, dropping a replaced weapon, reset |
| `tests/i18n.test.js` | 8 | AR is default, AR/EN key parity, no empty strings, Arabic script present, the required Arabic lines verbatim, RTL flag, fallback, bilingual HUD lines |

**Result: 73/73 PASS.**

---

## 2. End-to-end smoke test — `npm run smoke`

56 checks against the production build in a browser. Full output below.

### Boot and menus
| # | Check | Result |
|---|---|---|
| 1 | Game boots without a page error | PASS |
| 2 | Splash screen shown | PASS |
| 3 | Main menu opens from splash | PASS |
| 4 | Splash tap does not fall through onto a menu button | PASS |

### Arabic / RTL
| # | Check | Result |
|---|---|---|
| 5 | Arabic is default, `dir=rtl`, title renders `سعيد رويال` | PASS |
| 6 | EN toggle switches to `dir=ltr`, `SAEED ROYALE` | PASS |
| 7 | Toggling back restores Arabic | PASS |
| 35 | Zone warning shows Arabic text (`أنت خارج المنطقة الآمنة!`) | PASS |
| 39 | Victory headline is exactly `مبروك يا سعيد!` | PASS |
| 40 | Victory sub-line is exactly `أنت بطل الجولة` | PASS |
| 44 | Defeat headline is exactly `انتهت الجولة` | PASS |

### World and rendering
| # | Check | Result |
|---|---|---|
| 8 | HUD visible in-game | PASS |
| 9 | Map loads, player spawns alive, 86+ colliders present | PASS |
| 10 | Five named opponents alive | PASS |
| 11 | 20 loot pickups placed | PASS |
| 12 | Canvas renders actual pixels (readPixels at screen centre) | PASS — `[227,196,159,255]` |

### Mobile controls
| # | Check | Result |
|---|---|---|
| 13 | Touch controls active on a phone profile | PASS |
| 14 | Movement stick stays on the **left** in Arabic RTL | PASS |
| 15 | Action buttons stay on the **right** in Arabic RTL | PASS |
| 16 | Virtual joystick moves Saeed | PASS — moved 6.54 m |
| 17 | Drag on the right turns the camera | PASS — Δyaw 0.403 |
| 18 | JUMP button leaves the ground | PASS |
| 19 | CROUCH button lowers Saeed | PASS |
| 20 | AIM button enters aim mode | PASS |
| 21 | FIRE button shoots and spends ammo | PASS — 30 → 28 |
| 22 | RELOAD button starts a reload | PASS |

### Loot, inventory, healing
| # | Check | Result |
|---|---|---|
| 23 | Standing on loot shows the `التقاط` prompt | PASS |
| 24 | INTERACT picks up the med kit | PASS |
| 25 | Second weapon fills the free slot | PASS — `OCTA_AR, DESERT_CLAW` |
| 26 | Weapon switch changes the active weapon | PASS |
| 27 | Med kit restores health | PASS — 40 → 85 |

### Combat and AI
| # | Check | Result |
|---|---|---|
| 28 | Match still running after the duel | PASS |
| 29 | Shooting damages an enemy | PASS — 100 → 0 HP |
| 30 | Enough hits eliminate an enemy | PASS |
| 31 | Enemy counter updates on the HUD | PASS — 5 → 4 |
| 32 | AI detects the player and lands shots | PASS — player 100 → 87.4 HP |

### Safe zone
| # | Check | Result |
|---|---|---|
| 33 | Zone shrinks over time | PASS — 118.0 → 116.4 |
| 34 | Standing outside costs health | PASS — 100 → 96.9 |
| 35 | ZONE CLOSING warning appears | PASS |

### Match loop
| # | Check | Result |
|---|---|---|
| 36 | Pause opens and freezes the match | PASS |
| 37 | Resume returns to play | PASS |
| 38 | Victory triggers when all five are down | PASS |
| 41 | PLAY AGAIN restarts **in place** (no page reload) | PASS |
| 42 | Restart resets bots (5), health (100) and loot (20) | PASS |
| 43 | Defeat triggers when Saeed dies | PASS |
| 45 | Retry starts a fresh round | PASS |

### Easter egg
| # | Check | Result |
|---|---|---|
| 46 | Uncle Mansour greets Saeed near the village | PASS |
| 47 | He says `يا سعيد... خل عنك البطولة، وين القهوة؟` | PASS |

### Performance budget
| # | Check | Result |
|---|---|---|
| 48 | Static world merged into few draw calls | PASS — 180 meshes → 13 |
| 49 | Frame inside the mobile draw-call budget | PASS — 93 draw calls, 4 990 triangles |

### Desktop path
| # | Check | Result |
|---|---|---|
| 51 | WASD moves the player | PASS — 3.95 m |
| 52 | `C` toggles crouch | PASS |
| 53 | Left click fires | PASS |
| 54 | `R` reloads | PASS |
| 55 | `Esc` pauses | PASS |
| 56 | No console errors on the desktop run | PASS |
| 57 | No runtime console errors across the whole session | PASS |

**Result: 56/56 PASS.**

Screenshots are written to `tests/screenshots/` on every run (git-ignored — run
`npm run smoke` to regenerate them).

---

## 2b. Balance & feel pass (2026-09-18)

### The instrument

`tests/balance.mjs` plays complete matches with no browser, driving the real
`Player`, `Bot`, `SafeZone`, `LootManager`, `traceShot` and `botShotDamage`.
Only the *player's decisions* are scripted. Two play styles are reported, since
one scripted policy is not "the player":

- **aggressive** — fights anything it can see
- **cautious** — gears up and loots before committing

A human sits between them and plays the heal/disengage loop far better than
either.

### Shipped configuration (N = 200 matches per cell)

| style | skill | win | median | p90 | kills | pellet acc | heals | timeout |
|---|---|---|---|---|---|---|---|---|
| aggressive | 0.35 | 26.5% | 96s | 115s | 2.44 | 35% | 0.48 | 0% |
| aggressive | 0.55 | 22.5% | 97s | 134s | 2.16 | 52% | 0.33 | 0% |
| aggressive | 0.75 | 19.5% | 94s | 115s | 2.27 | 75% | 0.33 | 0% |
| cautious | 0.35 | 11.5% | 97s | 115s | 1.92 | 28% | 0.63 | 0% |
| cautious | 0.55 | 9.0% | 95s | 115s | 1.93 | 36% | 0.44 | 0.5% |
| cautious | 0.75 | 13.0% | 95s | 115s | 1.98 | 44% | 0.41 | 0% |

### The headline find: line of sight did not agree with bullets

`segmentBlocked` — the function the AI used to decide whether it could see you —
marched the line in ~1.2m steps. Map walls are **0.35m thick**. It stepped clean
over them.

Consequences, all confirmed in the simulator:

- **Bots saw and shot the player through buildings.** Their damage is applied on
  a successful sight check, so walls did not protect you.
- The player's own bullets *did* stop at walls. In one instrumented match,
  **110 of 120 player shots hit world geometry** — 97 of them at 10–20m, while
  the player believed it had a clear shot.
- Net effect: **0% win rate**, matches over in 26 seconds, 4.7% accuracy.

It now uses the same continuous raycast the bullets use. One fix:

| metric | before | after |
|---|---|---|
| win rate (aggressive, skill 0.55) | 0% | ~30% |
| median match length | 26s | 138s |
| player accuracy | 4.7% | 38.9% |
| kills per match | 0.97 | 3.90 |

Locked down by two regression tests: a thin wall must block sight at every
angle and distance, and sight must agree with a bullet fired along the same line
over 400 random lines across the real map.

### Other changes this pass, and why

| change | evidence |
|---|---|
| **Bots slide around walls** instead of grinding into them | A chasing bot pinned itself against a building the moment the player broke line of sight. Now tested: it rounds a wall and gets through a doorway gap. |
| **Zone 253s → 172s** | The old ring barely compressed the map before a match ended. At N=200 the faster ring **doubled the cautious player's win rate (7.5% → 15.0%, ±2.5)**, left the aggressive player unchanged, and pulled median match length 122s → 93s. |
| **Healing moved out of buildings** | Most loot sat behind a specific doorway; total pickups were 1.5/match with 9 med kits on the map. New rule: healing is always reachable in the open, better weapons stay inside as the risk/reward. |
| **Touch aim assist** (new) | Not measurable in simulation — verified in-browser instead: it closes a 0.10 rad aiming error to 0.003 rad in 0.7s while ADS, is off on desktop, and is toggleable. |
| **Directional damage indicator** (new) | The player absorbs ~90 damage a match from bots they cannot locate. Verified: an attacker behind renders at 3.14 rad, to the right at 1.57 rad. |
| **Crosshair reflects live spread** (new) | Verified: 8.1px hip-fire → 5.4px aiming. |
| **Haptics** (new) | Guarded `navigator.vibrate`; no-ops where unsupported, including iOS Safari. |

### What the harness could NOT establish — and what I did about it

I tried to tune bot lethality and **failed to resolve it**, so I shipped no
change to it. Stated plainly because it matters for how much the table above is
worth:

- Bot damage 9 → 7 → 6, reaction 0.45s → 1.05s, view range 62m → 38m, and
  `loseSightTime` 3.5s → 1.4s **all produced win rates inside noise** of each
  other (~20–26%).
- Win rate does **not** rise with player skill (26.5% → 22.5% → 19.5%), which is
  backwards.
- The cause is the scripted player itself: it heals **0.3–0.6 times per match**
  and dies holding med kits, because its policy only heals when no enemy is
  visible and it is almost always in contact. Cumulative damage to death is
  therefore ~100 regardless of the bots' damage *rate* — which is exactly why
  every lethality knob looked identical.

So: **the absolute win rates above describe a mediocre scripted player, not a
human.** A person who heals between fights and uses cover should do considerably
better. Treat the table as a regression baseline and a comparison between
configurations, not as a prediction of how hard the game is for you.

Deciding this needs real play data, not more simulation.

---

## 3. Bugs found and fixed during testing

These were all found by the tests, not by inspection.

| # | Bug | How it surfaced | Fix |
|---|---|---|---|
| 1 | Bot **Layla** spawned inside the rocky hill volume | Unit test asserting no spawn is inside geometry | Moved her spawn to open ground; assertion kept as a regression test |
| 2 | **Bots could never notice a player standing right behind them.** A wandering bot faced its waypoint, and detection required a ~100° front cone, so it could be shot in the back indefinitely without reacting | AI unit test was flaky across RNG seeds — the bot wandered away from a player 14 m in front of it | Added `awarenessRange` (18 m): inside that distance a bot notices the player regardless of facing, while line of sight is still required |
| 3 | **Touch controls mirrored in Arabic.** The HUD used CSS logical properties, so switching to RTL moved the movement stick to the right and the fire button to the left | E2E look-drag test produced Δyaw 0.000 — the drag was landing in the joystick zone | All thumb-facing UI moved to physical `left`/`right`. Text still flips; controls never do. Two regression checks added |
| 4 | **Tapping the splash activated a menu button underneath it.** The splash closed on `pointerdown`, so the follow-up `click` hit whatever was now under the finger — on a short landscape screen, the SETTINGS button | E2E run failed to reach the main menu after a layout change made the geometry line up | Splash closes on `click`; new screens get a 300–500 ms `pointer-events: none` guard. Regression check added |
| 5 | **The player was shot ~27 HP before they could react at round start** | E2E restart check found HP 73 instead of 100 immediately after PLAY AGAIN | 3-second spawn grace where bots hunt but hold fire, plus one bot spawn moved further from the player start. Unit test added |
| 6 | **The rifle pointed at the sky.** The hand socket's forward axis is the arm's -Y, not its +Z | Visual review of a screenshot | Socket rotated a quarter turn about X; documented in ARCHITECTURE.md so future GLB rigs get it right |
| 7 | **The weapon was invisible in third person** — arms hung at the sides with the gun tucked behind the body | Visual review | Added an armed low-ready carry pose to the animator |
| 8 | **OCTA blocked the aim view**, sitting exactly where the over-the-shoulder camera looks | Visual review | Companion moved to the off-shoulder side and behind, and shrinks while aiming |
| 9 | **Camera clipped through walls indoors** — a single wall-ray misses corners and cannot help when the focus point is itself inside geometry | Visual review of a village screenshot | Added an inside-geometry fallback that walks the camera in until clear; unit test sweeps six interiors × 12 angles |
| 10 | **Geometry merge crashed** with mixed indexed/non-indexed geometries (Dodecahedron vs Box) | Console error assertion in the E2E run | Normalise everything to non-indexed before merging |
| 11 | **Victory screen's PLAY AGAIN button fell below the fold** on a 293 px-tall landscape phone | Screenshot review | Compact menu layout under `max-height: 460px` |
| 12 | **Weapon panel overlapped the action buttons** | Screenshot review | Panel moved to the top-right, beside the pause button |

---

## 4. Not covered by automated tests

Honest gaps, so nobody mistakes this report for more than it is:

- **Real device performance.** The smoke test renders through SwiftShader
  (software), so its ~14 FPS figure means nothing. What *is* asserted is the
  draw-call and triangle budget (93 / 4 990), which is what governs phone
  performance. Frame rate on actual hardware has not been measured.
- **iOS Safari** specifically. Chromium only. The audio-unlock-on-tap and
  `viewport-fit=cover` handling are written for it but untested there.
- **Touch gestures beyond the implemented set** — pinch, three-finger, stylus.
- **Long-session stability.** The longest automated run is about 90 seconds.
- **Audio output.** The WebAudio graph is built and its calls execute without
  error, but nothing verifies what it sounds like.
- **Accessibility** beyond `aria-label`s on the buttons.
- **Whether the balance actually feels right to a human.** The harness measures
  systems, not fun. Its win rates come from a scripted player with a poor
  healing policy (see 2b).
- **Haptics firing on real hardware** — the calls are guarded and executed, but
  no test can feel a phone vibrate.
- **Whether aim assist feels too strong or too weak** under a real thumb. It is
  deliberately toggleable and its strength lives in `CONFIG.aim`.

---

## 5. Reproducing this report

```bash
npm ci            # or: npm install
npm run build     # BUILD
npm test          # UNIT TESTS
npm run smoke     # E2E (requires the build above)
npm run balance   # headless balance simulation
```

The smoke test starts its own `vite preview` server on port 4173, runs both a
phone context and a desktop context, writes screenshots to `tests/screenshots/`,
and exits non-zero if any check fails.

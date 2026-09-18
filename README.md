# SAEED ROYALE — سعيد رويال

**EVENTO Project Development**

An original Arabic third-person survival/action MVP. One small map, five AI
opponents, a shrinking safe zone, and a touchscreen-first control scheme.
Runs in any modern mobile browser — no install, no account, no backend.

> SAEED ROYALE is an original work. It shares a genre with mobile battle-royale
> games but contains no third-party maps, art, audio, names, branding or code.

---

## PLAY NOW

**https://saeed-royale.vercel.app** — open it on your phone, turn to landscape,
tap the splash, press **ابدأ / PLAY**. Nothing to install.

Every push to `claude/saeed-royale-mobile-mvp-tmtzxi` (the repo's production
branch) redeploys automatically.

---

## QUICK START

```bash
git clone https://github.com/EVENTo0/Game-1-Saeed-octa.git
cd Game-1-Saeed-octa
npm install
npm run dev
```

Open the printed **Network** URL (e.g. `http://192.168.1.20:5173`) on your phone,
turn it to landscape, tap the splash, press **ابدأ / PLAY**.

That is the whole route from clone to play.

---

## Run commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies (three.js + Vite + test tooling) |
| `npm run dev` | Dev server on `0.0.0.0:5173` — reachable from your phone |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build on `0.0.0.0:4173` |
| `npm test` | 87 unit tests (Vitest, headless, no browser) |
| `npm run smoke` | 63-check end-to-end browser test (needs `npm run build` first) |
| `npm run balance` | Headless balance simulation — plays real matches with no browser |

### Exact local run command

```bash
npm install && npm run dev
```

### Exact production build command

```bash
npm run build          # output: dist/  (static files, host anywhere)
npm run preview        # to check the built version locally
```

---

## MOBILE TESTING — exact steps

1. Put your phone and computer on the **same Wi-Fi network**.
2. On the computer: `npm run dev`
3. Vite prints two URLs. Copy the one labelled **Network**:
   ```
   ➜  Local:   http://localhost:5173/
   ➜  Network: http://192.168.x.x:5173/     <-- this one
   ```
4. Type that URL into your phone's browser (Chrome on Android, Safari on iOS).
5. **Rotate the phone to landscape.** A hint appears if you are in portrait.
6. Tap anywhere on the splash screen (this also unlocks audio — mobile browsers
   require a tap before any sound can play).
7. Press **ابدأ / PLAY**.
8. Left thumb on the lower-left = move. Right thumb anywhere on the right = look.
   Buttons are bottom-right.

**Add to home screen** (optional) for a fullscreen, browser-chrome-free session:
Android Chrome → ⋮ → *Add to Home screen*; iOS Safari → Share → *Add to Home Screen*.

If your phone cannot reach the computer, the network likely blocks device-to-device
traffic (common on guest/corporate Wi-Fi). Use a phone hotspot, or deploy `dist/`
to any static host — it is a plain folder of files with no server requirements.

---

## How to play

You are **SAEED — سعيد**, dropped into the oasis village with your octopus
companion **OCTA — أوكتا**. Five opponents are on the map. The safe zone
shrinks in four phases. Last one standing wins.

- Loot glows: purple = weapon, gold = ammo, green = med kit. **Healing is always
  out in the open; the better weapons are inside buildings** — going in is the
  risk you take for them.
- You carry **two weapons** and up to **three med kits**. That is the whole inventory.
- Standing outside the ring costs health, and it hurts more each phase.
- Eliminate all five to see **مبروك يا سعيد!**
- The crosshair opens with your real shot cone — wide means your bullets are
  going wide. Red arcs point at whoever just shot you.
- On a phone, **aim assist** is on by default (a gentle pull when the crosshair
  is already near an enemy). Both it and haptics can be turned off in settings.

Find **عم منصور** near the village well. He has opinions about coffee.

### Weapons

| Weapon | Class | Damage | Mag | Notes |
|---|---|---|---|---|
| OCTA-AR / أوكتا-إيه آر | Rifle | 17 | 30 | Full-auto, the reliable all-rounder |
| DESERT CLAW / مخلب الصحراء | Shotgun | 11 × 7 pellets | 6 | Devastating under 15m, useless past 30m |
| SAEED-50 / سعيد-٥٠ | Marksman | 78 | 5 | Two body shots. Aim before firing or it sprays |
| OCTA BLADE / نصل أوكتا | Melee | 55 | ∞ | Silent, no ammo, 2.6m reach |

---

## Language

Arabic is the **default**, with full RTL layout. Toggle **AR | EN** on the main
menu. The choice is remembered.

Note: text direction flips with the language, but the **thumb controls never
mirror** — the movement stick stays on the left and the action buttons on the
right in both languages. This is covered by a test.

---

## Documentation

- [`CONTROLS.md`](CONTROLS.md) — every touch and keyboard control
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — how the code is laid out and how to extend it
- [`TEST_REPORT.md`](TEST_REPORT.md) — what was tested and the results
- [`LICENSES.md`](LICENSES.md) — dependencies and asset provenance

---

## Known limitations

These are deliberate MVP boundaries, not bugs:

- **Single player only.** No networking, no matchmaking, no accounts, no backend.
- **Five bots**, simple state machine (wander → chase → engage → flee-zone). No
  squad tactics, no navmesh — they steer toward a point and slide along walls,
  which gets them around a building and through a doorway but will not solve a
  maze. They do not use cover deliberately and they never loot.
- **Placeholder characters.** Saeed, the bots, OCTA and Mansour are built from
  primitives at runtime to match the concept silhouette and palette. They are
  designed to be swapped for real GLB models without touching gameplay —
  see ARCHITECTURE.md.
- **Procedural animation**, not skeletal clips. The animation state machine is
  the real one; only the poses are faked.
- **Synthesised audio** (WebAudio oscillators/noise). No music.
- **No LOD and no texture atlas** — the map is small and untextured (flat
  colours), so neither earns its complexity yet.
- **Bots do not loot.** They spawn with a fixed weapon and unlimited reserve ammo.
- **Bot difficulty is not verified against human play.** The headless balance
  harness (`npm run balance`) resolved several real bugs, but it could not
  resolve how lethal the bots should be — every setting landed inside noise
  because the scripted player heals badly. Its win rates describe that scripted
  player, not you. See TEST_REPORT.md §2b. Real play data is the next step.
- The **safe zone drifts deterministically**, not randomly, so runs are reproducible.
- **Portrait is not supported** — the game asks you to rotate.
- iOS Safari needs the initial tap before it will play any audio (browser policy).
- FPS on the CI smoke test is meaningless: it renders through SwiftShader
  (software). Real phone performance is governed by the draw-call and triangle
  budget, which the test does assert.

## Not built yet (clean extension points exist)

Multiplayer, larger maps, 20–50 players, parachute drop, vehicles, character
customisation, OCTA abilities, ranked, teams, voice, native store builds.
`ARCHITECTURE.md` lists where each would attach.

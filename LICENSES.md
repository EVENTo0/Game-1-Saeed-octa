# LICENSES

## Project

**SAEED ROYALE — سعيد رويال** © EVENTO Project Development.
All game code, design, characters, weapon designs, names and UI in this
repository are original work created for this project.

---

## Third-party dependencies

| Package | Version | License | Used for | Ships in the build? |
|---|---|---|---|---|
| [three.js](https://github.com/mrdoob/three.js) | 0.180.0 | MIT | 3D rendering, math, WebGL abstraction | **Yes** (runtime) |
| [Vite](https://github.com/vitejs/vite) | 7.3.6 | MIT | Dev server, production bundler | No (dev only) |
| [Vitest](https://github.com/vitest-dev/vitest) | 5.0.1 | MIT | Unit tests | No (dev only) |
| [Playwright](https://github.com/microsoft/playwright) | 1.63.0 | Apache-2.0 | End-to-end browser smoke test | No (dev only) |

three.js is the only dependency that reaches a player's device. Its MIT license
text is in `node_modules/three/LICENSE` and is reproduced in the bundled output
by way of this notice:

> Copyright © 2010-2025 three.js authors — MIT License

`mergeGeometries` is imported from `three/examples/jsm/utils/BufferGeometryUtils.js`,
which ships inside the three.js package under the same MIT license.

---

## Assets

**There are no external asset files in this project.** No downloaded models,
textures, sprites, fonts, sound files or music. This was a deliberate choice: it
keeps the build tiny, keeps loading instant, and leaves nothing to license.

| Asset type | How it is produced | Provenance |
|---|---|---|
| Characters (Saeed, the five bots, OCTA, Uncle Mansour) | Built at runtime from three.js primitives in `src/player/characters.js` | Original |
| Weapons (OCTA-AR, DESERT CLAW, SAEED-50, OCTA BLADE) | Built at runtime from primitives in `src/weapons/weaponModels.js` | Original designs and names |
| Map (village, oasis, hill, outpost, props) | Generated from data in `src/world/mapData.js` | Original |
| VFX (muzzle flash, tracers, impacts) | Pooled primitive meshes in `src/combat/effects.js` | Original |
| All audio (shots, hits, reload, pickup, heal, zone warning, victory, defeat) | Synthesised live with WebAudio oscillators and noise buffers in `src/audio/audio.js` | Original — no sample files |
| Fonts | System font stack (`Noto Kufi Arabic`, `Segoe UI`, `Tahoma`, system-ui). Nothing is downloaded; whichever the device already has is used. | N/A |
| Icons | Unicode characters and one emoji (🐙) rendered by the device font | N/A |

### If art is added later

Anything dropped into a future `public/assets/` folder must be added to this file
with its source and license before it is committed. Prefer CC0 / CC-BY sources
(Kenney, Poly Pizza, OpenGameArt, Freesound) and record the attribution here.

---

## Genre reference statement

SAEED ROYALE is a third-person mobile battle-royale-genre game. No code, art,
audio, maps, characters, names, branding, UI or proprietary mechanics were taken
from PUBG, PUBG Mobile, or any other commercial title. The genre is a reference;
every asset and system here was written from scratch for EVENTO.

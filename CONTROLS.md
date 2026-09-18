# CONTROLS — التحكم

SAEED ROYALE is built touch-first. Both input paths write into the *same*
input state, so gameplay code never branches on device type.

---

## 📱 Touch (phone / tablet) — landscape

```
┌──────────────────────────────────────────────────────────────┐
│ [minimap] [zone] [enemies]                  [weapon] [pause]  │
│                                                               │
│                            ✛                     ( ⇄ ) ( ✋ )  │
│                        crosshair              ( ● FIRE )      │
│                                                               │
│    ◎ stick zone                          ( ⟳ ) ( ⤓ ) ( ⤒ ) ( ◎ )│
│ [✚][═══ health ═══]                                           │
└──────────────────────────────────────────────────────────────┘
   LEFT: move                                RIGHT: look + act
```

| Control | Where | Action |
|---|---|---|
| **Virtual joystick** | Lower-left 46% × 62% of the screen | Move. The stick is *floating* — it appears wherever your thumb lands, so you never have to find it. |
| **Push the stick fully** | — | Sprint (no separate run button) |
| **Drag** | Anywhere on the right that is not a button | Look / turn the camera |
| **● FIRE** | Big button, bottom-right | Fire (hold for automatic weapons) |
| **◎ AIM** | Button | Toggle aim — tighter spread, closer camera, slower movement |
| **⤒ JUMP** | Button | Jump |
| **⤓ CROUCH** | Toggle button | Crouch — smaller profile, slower, steadier |
| **⟳ RELOAD** | Button | Reload |
| **✋ INTERACT** | Button | Pick up the loot you are standing on |
| **⇄ SWITCH** | Button | Swap between your two weapon slots |
| **✚ MED KIT** | Bottom-left, next to health | Use a med kit (+45 HP over 1.6s) |
| **❚❚** | Top-right | Pause |

### Reading the HUD in a fight

- **The crosshair opens and closes with your real shot cone** — it widens while
  you move and while hip firing, and tightens the moment you aim. If it is wide,
  your bullets are going wide.
- **Red arcs around the crosshair point at whoever just shot you.** An arc at
  the bottom means the shot came from behind you.

Design notes:
- Every touch target is at least 52 px, and 60 px on normal-height screens.
- Multi-touch is tracked per pointer id — move, look and fire work simultaneously.
- AIM, CROUCH and sprint are **toggles**, not holds, because holding a button
  while also moving and looking needs a third thumb.
- Buttons and the stick use **physical** left/right positions and do **not**
  mirror when the UI switches to Arabic RTL.

---

## 🖥 Desktop (development)

| Key | Action |
|---|---|
| `W` `A` `S` `D` | Move |
| Mouse | Look (click the canvas once to capture the pointer) |
| `Shift` | Sprint |
| Left Click | Fire |
| Right Click | Aim (hold) |
| `Space` | Jump |
| `C` | Crouch (toggle) |
| `R` | Reload |
| `E` | Interact / pick up |
| `1` / `2` | Weapon slot 1 / 2 |
| `Q` | Cycle weapon |
| `F` or `H` | Use med kit |
| `Esc` | Pause / resume (also releases the mouse) |
| `P` | Toggle the FPS counter |

Losing pointer lock (Esc, alt-tab, switching tabs) pauses the match automatically.

---

## Settings

Main menu → **الإعدادات / SETTINGS**

- **Look sensitivity** — applies to both mouse and touch drag
- **Graphics quality** — LOW (no shadows, 1.0× pixel ratio), MED (default),
  HIGH (2.0× pixel ratio). Drop to LOW if your phone struggles.
- **Volume**
- **Aim assist / مساعدة التصويب** — on by default on touch devices, off on
  desktop (a mouse does not need it). It only pulls when the crosshair is
  already within ~9° of an enemy you can actually see, pulls harder the closer
  you already are, and never snaps. Much weaker when hip firing than when
  aiming down sights. Turn it off here if you would rather aim unaided.
- **Haptics / الاهتزاز** — short vibration when you are hit, land a hit, take
  zone damage, or win. Silently does nothing on devices without support
  (including iOS Safari).

Settings and the language choice persist in `localStorage`.

// SAEED ROYALE — central tunables. Keep gameplay numbers here, not in systems.
export const CONFIG = {
  world: {
    size: 220,            // playable square, metres
    gravity: -22,
    groundY: 0,
  },
  player: {
    maxHealth: 100,
    radius: 0.42,
    height: 1.75,
    crouchHeight: 1.1,
    stepHeight: 0.55,
    walkSpeed: 4.2,
    runSpeed: 7.4,
    crouchSpeed: 2.1,
    aimSpeed: 2.6,
    jumpSpeed: 8.0,
    accel: 55,
    airAccel: 14,
    friction: 12,
    eyeOffset: 0.62,      // eye height below top of head
  },
  camera: {
    distance: 5.0,
    aimDistance: 2.6,
    height: 1.75,
    shoulder: 0.95,
    minPitch: -1.15,
    maxPitch: 0.72,
    fov: 68,
    aimFov: 52,
    collisionPad: 0.35,
    lerp: 14,
  },
  bots: {
    count: 5,
    maxHealth: 100,
    radius: 0.45,
    viewRange: 62,
    fovCos: -0.15,        // ~100 deg half-cone (dot threshold)
    awarenessRange: 18,   // inside this, the bot notices the player regardless of facing
    walkSpeed: 3.0,
    chaseSpeed: 5.0,
    fireInterval: 0.55,
    burst: 3,
    reactionTime: 0.45,
    accuracy: 0.72,       // 0..1 chance the shot is "aimed"
    damage: 9,
    loseSightTime: 3.5,
  },
  zone: {
    // Tuned against tests/balance.mjs (N=200/cell). The old 253s ring barely
    // compressed the map before a match ended, so a cautious player wandered
    // instead of meeting anyone: shortening it to 172s doubled that player's
    // win rate (7.5% -> 15.0%) and pulled median match length 122s -> 93s,
    // with no measurable effect on an aggressive player.
    startRadius: 118,
    phases: [
      { wait: 28, shrink: 26, radius: 70, dps: 2 },
      { wait: 22, shrink: 22, radius: 40, dps: 4 },
      { wait: 20, shrink: 20, radius: 18, dps: 7 },
      { wait: 16, shrink: 18, radius: 7,  dps: 11 },
    ],
  },
  aim: {
    // Touch aim assist. Gentle by design: a narrow cone, strength that scales
    // with how close the crosshair already is, and never a hard snap.
    enabled: true,
    cone: 0.16,           // rad (~9 deg) half-angle the assist can act inside
    rate: 6.0,            // how fast it closes the remaining angle, per second
    hipFireScale: 0.45,   // assist is much weaker when not aiming down sights
    maxPerFrame: 0.5,     // never close more than half the gap in one frame
    range: 60,            // metres
  },

  loot: {
    pickupRange: 2.4,
  },
  match: {
    spawnGrace: 3.0,      // seconds at the start of a round where bots hold fire
    maxWeapons: 2,
    maxMedkits: 3,
    medkitHeal: 45,
    medkitUseTime: 1.6,
  },
};

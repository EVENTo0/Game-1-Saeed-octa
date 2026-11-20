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
    dropDistance: 8.5,
    planeDistance: 34,
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
    count: 9,             // ten players a match on the 520 m map
    maxHealth: 100,
    radius: 0.45,
    viewRange: 62,
    fovCos: -0.15,        // ~100 deg half-cone (dot threshold)
    awarenessRange: 18,
    concealedRange: 7,
    lootTime: [45, 100],  // seconds a bot spends looting its landing spot
    rivalRange: 62,       // bots spot each other as far as they spot you    // spotting range for a player crouched in a bush   // inside this, the bot notices the player regardless of facing
    walkSpeed: 3.0,
    chaseSpeed: 5.0,
    fireInterval: 0.55,
    burst: 3,
    reactionTime: 0.6,
    accuracy: 0.56,       // 0..1 chance the shot is "aimed"; tuned for 10 players (tests/balance.mjs)
    damage: 9,
    loseSightTime: 3.5,
  },
  zone: {
    // Tuned against tests/balance.mjs (N=200/cell). The old 253s ring barely
    // compressed the map before a match ended, so a cautious player wandered
    // instead of meeting anyone: shortening it to 172s doubled that player's
    // win rate (7.5% -> 15.0%) and pulled median match length 122s -> 93s,
    // with no measurable effect on an aggressive player.
    // v2.2: the map grew from 220 m to 520 m. The first wait is long enough
    // to loot after landing; later rings close faster so a match lands in the
    // 5-7 minute window of mobile battle royales.
    startRadius: 330,
    phases: [
      { wait: 50, shrink: 40, radius: 190, dps: 2 },
      { wait: 35, shrink: 32, radius: 110, dps: 3 },
      { wait: 28, shrink: 26, radius: 60, dps: 5 },
      { wait: 22, shrink: 22, radius: 28, dps: 8 },
      { wait: 16, shrink: 18, radius: 9, dps: 12 },
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

  drop: {
    // Match start: ride the plane, jump where you like, freefall, then glide
    // under the canopy. About 15 s from jump to touchdown and up to ~170 m of
    // travel, so the landing spot is a real choice.
    planeHeight: 170,
    planeSpeed: 42,
    height: 170,
    freefallSpeed: 24,
    chuteSpeed: 6,
    chuteAt: 45,          // metres above ground where the canopy opens on its own
    glideFree: 17,        // horizontal steering speed in freefall
    glideChute: 9,
  },

  armor: {
    max: 40,              // vest points
    absorb: 0.5,          // share of each hit; tuned with tests/balance.mjs (N=200)
  },
  airdrop: {
    // One supply drop per match, announced, falling slowly enough to race for.
    at: 110,              // match seconds when it is announced
    height: 70,
    fallSpeed: 4.5,
    loot: ['weapon:SAEED_50', 'armor', 'medkit', 'ammo'],
  },

  loot: {
    pickupRange: 2.4,
  },
  match: {
    spawnGrace: 4.0,      // seconds at the start of a round where bots hold fire
    maxWeapons: 2,
    maxMedkits: 3,
    medkitHeal: 45,
    medkitUseTime: 1.6,
  },
};

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
    startRadius: 118,
    phases: [
      { wait: 45, shrink: 35, radius: 78, dps: 2 },
      { wait: 35, shrink: 30, radius: 46, dps: 4 },
      { wait: 30, shrink: 28, radius: 22, dps: 7 },
      { wait: 25, shrink: 25, radius: 9,  dps: 11 },
    ],
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

// Health/damage rules shared by player and bots.
export class Health {
  constructor(max = 100) { this.max = max; this.value = max; this.alive = true; this.lastHitAt = -99; }
  damage(amount, t = 0) {
    if (!this.alive || amount <= 0) return 0;
    const applied = Math.min(amount, this.value);
    this.value -= applied;
    this.lastHitAt = t;
    if (this.value <= 0) { this.value = 0; this.alive = false; }
    return applied;
  }
  heal(amount) {
    if (!this.alive) return 0;
    const applied = Math.min(amount, this.max - this.value);
    this.value += applied;
    return applied;
  }
  reset() { this.value = this.max; this.alive = true; }
  get ratio() { return this.value / this.max; }
}

/** Distance falloff: full damage to 60% of range, then tapers to 45%. */
export function falloff(distance, range) {
  const near = range * 0.6;
  if (distance <= near) return 1;
  if (distance >= range) return 0.45;
  const t = (distance - near) / (range - near);
  return 1 - t * 0.55;
}

// Original fictional weapons for SAEED ROYALE. Pure logic — no rendering.

export const WEAPONS = {
  OCTA_AR: {
    id: 'OCTA_AR', nameAr: 'أوكتا-إيه آر', nameEn: 'OCTA-AR', class: 'rifle',
    damage: 17, rpm: 620, magSize: 30, reserveStart: 90, reloadTime: 2.0,
    spread: 0.018, aimSpread: 0.006, range: 120, pellets: 1, auto: true,
    recoil: 0.014, ammoType: 'rifle', color: 0x7a5cff,
  },
  DESERT_CLAW: {
    id: 'DESERT_CLAW', nameAr: 'مخلب الصحراء', nameEn: 'DESERT CLAW', class: 'shotgun',
    damage: 11, rpm: 95, magSize: 6, reserveStart: 24, reloadTime: 2.6,
    spread: 0.085, aimSpread: 0.055, range: 34, pellets: 7, auto: false,
    recoil: 0.05, ammoType: 'shell', color: 0xc9a227,
  },
  SAEED_50: {
    id: 'SAEED_50', nameAr: 'سعيد-٥٠', nameEn: 'SAEED-50', class: 'marksman',
    damage: 78, rpm: 48, magSize: 5, reserveStart: 20, reloadTime: 3.0,
    spread: 0.05, aimSpread: 0.0012, range: 220, pellets: 1, auto: false,
    recoil: 0.08, ammoType: 'heavy', color: 0x2fd4c4,
  },
  OCTA_BLADE: {
    id: 'OCTA_BLADE', nameAr: 'نصل أوكتا', nameEn: 'OCTA BLADE', class: 'melee',
    damage: 55, rpm: 110, magSize: Infinity, reserveStart: 0, reloadTime: 0,
    spread: 0, aimSpread: 0, range: 2.6, pellets: 1, auto: false,
    recoil: 0.02, ammoType: 'none', color: 0x9b7bff,
  },
};

export const AMMO_PICKUP = { rifle: 30, shell: 8, heavy: 5, none: 0 };

export class WeaponInstance {
  constructor(id, ammoInMag = null, reserve = null) {
    const def = WEAPONS[id];
    if (!def) throw new Error(`unknown weapon ${id}`);
    this.def = def;
    this.id = id;
    this.mag = ammoInMag ?? def.magSize;
    this.reserve = reserve ?? def.reserveStart;
    this.cooldown = 0;
    this.reloadTimer = 0;
  }
  get isMelee() { return this.def.class === 'melee'; }
  get reloading() { return this.reloadTimer > 0; }
  get shotInterval() { return 60 / this.def.rpm; }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer = Math.max(0, this.reloadTimer - dt);
      if (this.reloadTimer === 0) this.finishReload();
    }
  }
  canFire() {
    return this.cooldown <= 0 && !this.reloading && (this.isMelee || this.mag > 0);
  }
  /** @returns {boolean} true if a shot was actually fired */
  fire() {
    if (!this.canFire()) return false;
    if (!this.isMelee) this.mag -= 1;
    this.cooldown = this.shotInterval;
    return true;
  }
  needsReload() { return !this.isMelee && this.mag < this.def.magSize && this.reserve > 0; }
  startReload() {
    if (this.reloading || !this.needsReload()) return false;
    this.reloadTimer = this.def.reloadTime;
    return true;
  }
  finishReload() {
    const want = this.def.magSize - this.mag;
    const take = Math.min(want, this.reserve);
    this.mag += take;
    this.reserve -= take;
    this.reloadTimer = 0;
  }
  addAmmo(n) { this.reserve += n; return this.reserve; }
  spreadFor(aiming) { return aiming ? this.def.aimSpread : this.def.spread; }
}

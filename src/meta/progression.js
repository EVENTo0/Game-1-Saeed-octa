/**
 * Player progression: XP per match, levels and cosmetic unlocks. Pure and
 * storage-agnostic so it is unit tested without a browser. Rewards are tied to
 * play quality (placement, kills, damage), not grinding: one good match is
 * worth more than several idle ones.
 */

export const XP_RULES = {
  base: 40,            // finishing a match at all
  perKill: 60,
  perDamage: 0.4,      // per point of damage dealt
  perSecond: 0.5,      // survival time
  win: 250,
  topThree: 80,
  maxSurvivalXp: 120,
};

/** Cosmetic skins. `level` is the account level that unlocks it. */
export const SKINS = [
  { id: 'classic', level: 1, nameAr: 'الكلاسيكي', nameEn: 'Classic',
    primary: 0x3a3452, accent: 0x8250ff, gold: 0xe8bd47, cloth: 0x463d63, visor: 0x39e0d0 },
  { id: 'dune', level: 2, nameAr: 'كثبان ذهبية', nameEn: 'Golden Dune',
    primary: 0x8a6a3c, accent: 0xd9b26a, gold: 0xf4d27a, cloth: 0x6b5232, visor: 0xffb347 },
  { id: 'night', level: 3, nameAr: 'عمليات ليلية', nameEn: 'Night Ops',
    primary: 0x15181f, accent: 0x2f3a4a, gold: 0x7fd1ff, cloth: 0x1c2029, visor: 0x5cff9d },
  { id: 'royal', level: 5, nameAr: 'أوكتا الملكي', nameEn: 'Royal Octa',
    primary: 0x2a1458, accent: 0xb07cff, gold: 0xffd24a, cloth: 0x3a1d70, visor: 0xff6ad5 },
];

/** XP needed to go from `level` to `level + 1`. Gentle curve, ~2 matches per early level. */
export function xpToNext(level) {
  return 300 + (level - 1) * 150;
}

/** Turn a lifetime XP total into { level, into, need }. */
export function levelFromXp(totalXp) {
  let level = 1;
  let rest = Math.max(0, Math.floor(totalXp));
  while (rest >= xpToNext(level)) { rest -= xpToNext(level); level++; }
  return { level, into: rest, need: xpToNext(level) };
}

/**
 * XP earned for one match, as an itemised list for the results screen.
 * @param {{won:boolean, placement:number, kills:number, damage:number, time:number}} s
 */
export function xpForMatch(s) {
  const R = XP_RULES;
  const items = [{ key: 'xpMatch', xp: R.base }];
  if (s.kills > 0) items.push({ key: 'xpKills', xp: s.kills * R.perKill });
  const dmg = Math.round(Math.max(0, s.damage) * R.perDamage);
  if (dmg > 0) items.push({ key: 'xpDamage', xp: dmg });
  const surv = Math.min(R.maxSurvivalXp, Math.round(Math.max(0, s.time) * R.perSecond));
  if (surv > 0) items.push({ key: 'xpSurvival', xp: surv });
  if (s.won) items.push({ key: 'xpWin', xp: R.win });
  else if (s.placement > 0 && s.placement <= 3) items.push({ key: 'xpTop3', xp: R.topThree });
  return { items, total: items.reduce((a, i) => a + i.xp, 0) };
}

export function skinsUnlockedAt(level) {
  return SKINS.filter((k) => k.level <= level).map((k) => k.id);
}

const DEFAULT_PROFILE = { xp: 0, skin: 'classic', matches: 0, wins: 0, kills: 0, bestPlacement: 0, tutorialDone: false };

/**
 * Persistent profile. `storage` is anything with getItem/setItem (localStorage
 * in the browser); failures fall back to an in-memory profile so a private
 * window still plays.
 */
export class Profile {
  constructor(storage = null, key = 'saeed_profile_v2') {
    this.storage = storage;
    this.key = key;
    this.data = { ...DEFAULT_PROFILE };
    try {
      const raw = storage?.getItem(key);
      if (raw) this.data = { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
    } catch { /* corrupt or blocked storage: start fresh */ }
    if (!this.isUnlocked(this.data.skin)) this.data.skin = 'classic';
  }
  get level() { return levelFromXp(this.data.xp).level; }
  get progress() { return levelFromXp(this.data.xp); }
  isUnlocked(skinId) {
    const s = SKINS.find((k) => k.id === skinId);
    return !!s && s.level <= levelFromXp(this.data.xp).level;
  }
  setSkin(id) {
    if (!this.isUnlocked(id)) return false;
    this.data.skin = id;
    this.save();
    return true;
  }
  /** Apply a finished match. Returns everything the results screen needs. */
  recordMatch(stats) {
    const before = levelFromXp(this.data.xp);
    const reward = xpForMatch(stats);
    this.data.xp += reward.total;
    this.data.matches += 1;
    this.data.kills += stats.kills;
    if (stats.won) this.data.wins += 1;
    if (stats.placement > 0 && (this.data.bestPlacement === 0 || stats.placement < this.data.bestPlacement)) {
      this.data.bestPlacement = stats.placement;
    }
    const after = levelFromXp(this.data.xp);
    const newSkins = SKINS.filter((k) => k.level > before.level && k.level <= after.level);
    this.save();
    return { reward, before, after, leveledUp: after.level > before.level, newSkins };
  }
  completeTutorial() { this.data.tutorialDone = true; this.save(); }
  save() {
    try { this.storage?.setItem(this.key, JSON.stringify(this.data)); } catch { /* storage full or blocked */ }
  }
}

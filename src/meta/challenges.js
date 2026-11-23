/**
 * Daily challenges: three goals a day, picked deterministically from the date
 * so every player sees the same set, with progress that carries across
 * matches until the day rolls over. Pure and storage-agnostic.
 */

export const CHALLENGES = [
  { id: 'kills5', stat: 'kills', goal: 5, xp: 180 },
  { id: 'damage600', stat: 'damage', goal: 600, xp: 140 },
  { id: 'survive600', stat: 'time', goal: 600, xp: 120 },
  { id: 'top3', stat: 'top3', goal: 2, xp: 160 },
  { id: 'coffee', stat: 'coffee', goal: 1, xp: 200 },
  { id: 'grenade', stat: 'grenadeKills', goal: 1, xp: 160 },
  { id: 'drive', stat: 'driven', goal: 800, xp: 110 },
  { id: 'airdrop', stat: 'airdrops', goal: 1, xp: 140 },
  { id: 'win', stat: 'wins', goal: 1, xp: 300 },
];

/** Days since the epoch in local time, the key the daily set rolls on. */
export function dayIndex(date = new Date()) {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 86400000);
}

/** The day's three challenges: a stable shuffle seeded by the day. */
export function dailySet(day, n = 3) {
  let a = (day * 2654435761) >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pool = CHALLENGES.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

/** What one match contributes to each challenge stat. */
export function matchStats(sum) {
  return {
    kills: sum.kills ?? 0,
    damage: Math.round(sum.damage ?? 0),
    time: Math.round(sum.time ?? 0),
    top3: sum.placement > 0 && sum.placement <= 3 ? 1 : 0,
    coffee: sum.coffee ? 1 : 0,
    grenadeKills: sum.grenadeKills ?? 0,
    driven: Math.round(sum.driven ?? 0),
    airdrops: sum.airdrops ?? 0,
    wins: sum.won ? 1 : 0,
  };
}

/**
 * Fold a finished match into the stored state. Returns the new state (the
 * input is not mutated), the challenges completed by this match and their XP.
 * @param {?{day:number, progress:Object<string,number>, done:string[]}} state
 */
export function applyMatch(state, sum, day) {
  const fresh = !state || state.day !== day;
  const next = {
    day,
    progress: fresh ? {} : { ...state.progress },
    done: fresh ? [] : [...state.done],
  };
  const s = matchStats(sum);
  const completed = [];
  for (const c of dailySet(day)) {
    if (next.done.includes(c.id)) continue;
    next.progress[c.id] = Math.min(c.goal, (next.progress[c.id] ?? 0) + (s[c.stat] ?? 0));
    if (next.progress[c.id] >= c.goal) { next.done.push(c.id); completed.push(c); }
  }
  return { state: next, completed, xp: completed.reduce((a, c) => a + c.xp, 0) };
}

/** Rows for the lobby card. */
export function challengeView(state, day) {
  const cur = state && state.day === day ? state : { progress: {}, done: [] };
  return dailySet(day).map((c) => ({
    ...c,
    progress: cur.progress[c.id] ?? 0,
    done: cur.done.includes(c.id),
  }));
}

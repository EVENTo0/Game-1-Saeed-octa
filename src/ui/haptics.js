/**
 * Tiny haptics wrapper. `navigator.vibrate` is unsupported on iOS Safari and
 * can throw in some embedded webviews, so every call is guarded and the whole
 * thing is a no-op when the user turns it off.
 */
let enabled = true;

export function setHaptics(on) { enabled = !!on; }
export function hapticsEnabled() { return enabled; }

function buzz(pattern) {
  if (!enabled) return false;
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
    return navigator.vibrate(pattern);
  } catch { return false; }
}

export const haptics = {
  hitTaken: () => buzz(28),
  hitDealt: () => buzz(12),
  kill: () => buzz([18, 40, 30]),
  zone: () => buzz([10, 60, 10]),
  death: () => buzz([60, 50, 120]),
  victory: () => buzz([30, 60, 30, 60, 90]),
};

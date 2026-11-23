/**
 * Short vibrations on phones for moments that matter (a line paying, a win). A no-op where
 * the Vibration API is missing (desktop, iOS Safari) or the user prefers reduced motion.
 */
export function buzz(pattern: number | number[]): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ) {
    return;
  }
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw when vibration is blocked by a permissions policy.
  }
}

export const BUZZ_LINE = 25;
export const BUZZ_WIN = [30, 50, 80];

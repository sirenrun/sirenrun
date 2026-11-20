import { LaneMotion } from "./motion";

/**
 * Local driving state shared by the scene (which draws the predicted lane) and the input
 * handlers (which record presses). Module scope: one scene per page.
 */
export const laneMotion = new LaneMotion();

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

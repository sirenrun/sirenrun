/**
 * How the landing page hero shows the attract run:
 * - live: the 3D bot run plays behind the headline
 * - paused: mounted but not rendering, because the hero is scrolled out of view
 * - poster: a still gradient instead, for browsers without WebGL or visitors who asked for
 *   reduced motion (an endless car chase is exactly the motion they opted out of)
 */
export type HeroMode = "live" | "paused" | "poster";

export function heroMode(opts: {
  webgl: boolean;
  reducedMotion: boolean;
  visible: boolean;
}): HeroMode {
  if (!opts.webgl || opts.reducedMotion) return "poster";
  return opts.visible ? "live" : "paused";
}

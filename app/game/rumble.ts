/**
 * Camera rumble amplitude in metres. It comes from the road, so it is zero unless the run is
 * live and the car is moving: during the countdown the sim already holds its launch speed,
 * and a rumble there shook the whole parked scene.
 */
export function cameraRumble(
  speedNorm: number,
  status: string,
  busted: boolean,
  reduced: boolean,
): number {
  if (reduced || busted || status !== "live") return 0;
  return speedNorm * 0.012 + speedNorm * speedNorm * 0.05;
}

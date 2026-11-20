/**
 * One semi-implicit Euler step of a damped spring toward `target`. `omega` is the natural
 * frequency (rad/s), `zeta` the damping ratio: below 1 overshoots a little, which is what
 * makes the camera and the car body read as having mass. Returns [position, velocity].
 */
export function spring(
  x: number,
  v: number,
  target: number,
  omega: number,
  zeta: number,
  dt: number,
): [number, number] {
  const a = -omega * omega * (x - target) - 2 * zeta * omega * v;
  const nv = v + a * dt;
  return [x + nv * dt, nv];
}

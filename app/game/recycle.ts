/** `a mod n`, always in [0, n). */
export const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * World z of an object that repeats every `span` metres along the road at offset `offset`,
 * placed in the window (carZ + behind - span, carZ + behind]. The object stays fixed in the
 * world while visible and is recycled to the far end once the car passes it.
 */
export function recycledZ(offset: number, carZ: number, span: number, behind: number): number {
  return carZ + behind - mod(carZ + behind + offset, span);
}

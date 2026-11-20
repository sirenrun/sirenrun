"use client";

import { useFrame } from "@react-three/fiber";
import { LANES, ROW_GAP, rowHash } from "@sirenrun/sim";
import { useMemo, useRef } from "react";
import { AdditiveBlending, Color, Matrix4, Quaternion, Vector3, type InstancedMesh } from "three";
import { Course } from "./course";
import { frame } from "./frame";
import { glowTexture } from "./glow";
import { NEON } from "./palette";
import { laneX, rowZ, worldZ } from "./world";

/** Rows drawn behind and ahead of the car: 14 rows is 350 m, just inside the fog. */
const BEHIND = 1;
const AHEAD = 14;
const MAX = (BEHIND + AHEAD) * LANES;
/**
 * Traffic is drawn driving the same way at this share of the player's speed: its offset from
 * the car shrinks by this factor, so it still meets the car exactly when the program checks
 * the row. Roadblocks and spikes stay put.
 */
const TRAFFIC_DRIFT = 0.3;
/** Anything closer to the camera plane than this is dropped instead of being sliced open. */
const CAMERA_CLEARANCE = 3;
const WHEEL_TURN = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);

type Kind = "car" | "roadblock" | "spikes";

/** Traffic paints: bright enough to stand out on dark asphalt. Cosmetic; picked from hash bits. */
/** No pink or white: those belong to the player's car. */
const PAINTS = ["#ffc93c", "#19c3b3", "#4aa3ff", "#8a5cff", "#ff7a3d"].map((c) => new Color(c));
const RED = new Color(NEON.red);
const AMBER = new Color(NEON.amber);
const GLASS = new Color("#141022");
const STRIPE = new Color("#f4f1ff");
const DARK = new Color("#26202f");
/** Wheel offsets (x, z) under a traffic car body. */
const TRAFFIC_WHEELS = [
  [-0.86, -1.3],
  [0.86, -1.3],
  [-0.86, 1.3],
  [0.86, 1.3],
] as const;

const m4 = new Matrix4();
const pos = new Vector3();
const scl = new Vector3();
const IDENTITY = new Quaternion();

/** Uses hash bits 48..62, which the program never reads (lane bytes are bits 8..47). */
function kindOf(hash: bigint, lane: number): { kind: Kind; paint: number } {
  const bits = Number((hash >> BigInt(48 + lane * 3)) & 7n);
  const paint = Number((hash >> BigInt(lane * 2 + 1)) & 3n) + (bits & 1);
  if (bits < 5) return { kind: "car", paint: paint % PAINTS.length };
  return { kind: bits < 7 ? "roadblock" : "spikes", paint: 0 };
}

/**
 * Obstacle rows from the VRF seed, exactly as the program generates them. Every obstacle
 * carries its own fog-proof light (tail lights, amber beacons, a glowing spike strip) so the
 * blocked lanes read from the far end of the road, like traffic at night.
 */
export function Obstacles() {
  const bodies = useRef<InstancedMesh>(null);
  const tops = useRef<InstancedMesh>(null);
  const lights = useRef<InstancedMesh>(null);
  const halos = useRef<InstancedMesh>(null);
  const wheels = useRef<InstancedMesh>(null);
  const state = useRef<{ course: Course | null }>({ course: null });
  const glow = useMemo(() => glowTexture(), []);

  useFrame((three) => {
    const b = bodies.current;
    const t = tops.current;
    const l = lights.current;
    const h = halos.current;
    const w = wheels.current;
    if (b === null || t === null || l === null || h === null || w === null) return;
    if (!frame.ready || !frame.seedReady) {
      b.count = t.count = l.count = h.count = w.count = 0;
      return;
    }
    const s = state.current;
    if (s.course === null || s.course.seed !== frame.seed) s.course = new Course(frame.seed);
    const first = Math.max(0, Math.floor(frame.distance / ROW_GAP) - BEHIND);
    const carZ = worldZ(frame.distance);
    const cam = three.camera.position;
    const cutoff = cam.z - CAMERA_CLEARANCE;
    // The bust shot swings the camera sideways, so also clear anything right beside it.
    const nearCamera = (x: number, z: number) =>
      frame.busted && Math.hypot(x - cam.x, z - cam.z) < 7;

    let nb = 0;
    let nt = 0;
    let nl = 0;
    let nh = 0;
    let nw = 0;
    const put = (
      mesh: InstancedMesh,
      i: number,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      c: Color,
      q: Quaternion = IDENTITY,
    ) => {
      m4.compose(pos.set(x, y, z), q, scl.set(sx, sy, sz));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, c);
    };

    for (let row = first; row < first + BEHIND + AHEAD; row += 1) {
      const blocked = s.course.row(row).blocked;
      const hash = rowHash(frame.seed, row);
      const rz = rowZ(row);
      for (let lane = 0; lane < LANES; lane += 1) {
        if (!blocked[lane]) continue;
        const x = laneX(lane);
        const { kind, paint } = kindOf(hash, lane);
        if (kind === "car") {
          const z = carZ + (rz - carZ) * (1 - TRAFFIC_DRIFT);
          if (z - 2 > cutoff || nearCamera(x, z)) continue;
          put(b, nb++, x, 0.62, z, 1.8, 0.62, 3.9, PAINTS[paint] as Color);
          put(t, nt++, x, 1.12, z + 0.3, 1.5, 0.42, 2.0, GLASS);
          // Tail lights face the player (+z).
          put(l, nl++, x - 0.6, 0.76, z + 1.97, 0.42, 0.14, 0.06, RED);
          put(l, nl++, x + 0.6, 0.76, z + 1.97, 0.42, 0.14, 0.06, RED);
          put(h, nh++, x, 0.78, z + 2.05, 3.4, 1.4, 1, RED);
          for (const [wx, wz] of TRAFFIC_WHEELS)
            put(w, nw++, x + wx, 0.34, z + wz, 0.34, 0.26, 0.34, DARK, WHEEL_TURN);
        } else {
          const z = rz;
          if (z - 1 > cutoff || nearCamera(x, z)) continue;
          if (kind === "roadblock") {
            put(b, nb++, x, 0.5, z, 2.2, 0.9, 0.45, STRIPE);
            put(t, nt++, x, 0.5, z + 0.05, 2.24, 0.3, 0.42, RED);
            put(l, nl++, x - 0.85, 1.08, z, 0.22, 0.22, 0.22, AMBER);
            put(l, nl++, x + 0.85, 1.08, z, 0.22, 0.22, 0.22, AMBER);
            put(h, nh++, x, 1.0, z + 0.3, 3.6, 1.6, 1, AMBER);
          } else {
            put(b, nb++, x, 0.06, z, 2.1, 0.12, 0.9, DARK);
            put(l, nl++, x, 0.14, z + 0.3, 2.0, 0.06, 0.12, RED);
            put(h, nh++, x, 0.3, z + 0.5, 3.2, 0.9, 1, RED);
          }
        }
      }
    }
    b.count = nb;
    t.count = nt;
    l.count = nl;
    h.count = nh;
    w.count = nw;
    for (const mesh of [b, t, l, h, w]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh ref={bodies} args={[undefined, undefined, MAX]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.35} metalness={0.4} />
      </instancedMesh>
      <instancedMesh ref={tops} args={[undefined, undefined, MAX]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.15} metalness={0.8} />
      </instancedMesh>
      <instancedMesh ref={lights} args={[undefined, undefined, MAX * 2]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} fog={false} />
      </instancedMesh>
      <instancedMesh ref={wheels} args={[undefined, undefined, MAX * 4]} frustumCulled={false}>
        <cylinderGeometry args={[1, 1, 1, 12]} />
        <meshStandardMaterial roughness={0.7} metalness={0.2} />
      </instancedMesh>
      <instancedMesh ref={halos} args={[undefined, undefined, MAX]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={glow}
          transparent
          opacity={0.75}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
          fog={false}
        />
      </instancedMesh>
    </>
  );
}

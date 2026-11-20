"use client";

import { useFrame } from "@react-three/fiber";
import { LANES, ROW_GAP, rowHash } from "@sirenrun/sim";
import { useMemo, useRef } from "react";
import { AdditiveBlending, Color, Matrix4, Quaternion, Vector3, type InstancedMesh } from "three";
import { TRAFFIC_MODELS } from "./car-fit";
import { Course } from "./course";
import { frame } from "./frame";
import { glowTexture } from "./glow";
import { useCarKit } from "./models";
import { hot, NEON } from "./palette";
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
type Kind = "car" | "roadblock" | "spikes";

/** Lamps are pushed past the bloom threshold; halos stay plain so the fog cannot hide them. */
const RED = new Color(NEON.red);
const AMBER = new Color(NEON.amber);
const RED_LAMP = hot(NEON.red, 5);
const AMBER_LAMP = hot(NEON.amber, 5);
const STRIPE = new Color("#f4f1ff");
const DARK = new Color("#26202f");
const WHITE = new Color("#ffffff");

const m4 = new Matrix4();
const pos = new Vector3();
const scl = new Vector3();
const IDENTITY = new Quaternion();

/**
 * Kind from hash bits 48..62, which the program never reads (lane bytes are bits 8..47). The
 * model is cosmetic, so it may reuse any bits.
 */
function kindOf(hash: bigint, lane: number): { kind: Kind; model: number } {
  const bits = Number((hash >> BigInt(48 + lane * 3)) & 7n);
  const model = Number((hash >> BigInt(lane * 8 + 3)) & 0xffn) % TRAFFIC_MODELS.length;
  if (bits < 5) return { kind: "car", model };
  return { kind: bits < 7 ? "roadblock" : "spikes", model: 0 };
}

/**
 * Obstacle rows from the VRF seed, exactly as the program generates them. Every obstacle
 * carries its own fog-proof light (tail lights, amber beacons, a glowing spike strip) so the
 * blocked lanes read from the far end of the road, like traffic at night.
 */
export function Obstacles() {
  const kit = useCarKit();
  const cars = useRef<(InstancedMesh | null)[]>([]);
  const bodies = useRef<InstancedMesh>(null);
  const tops = useRef<InstancedMesh>(null);
  const lights = useRef<InstancedMesh>(null);
  const halos = useRef<InstancedMesh>(null);
  const state = useRef<{ course: Course | null }>({ course: null });
  const glow = useMemo(() => glowTexture(), []);

  useFrame((three) => {
    const b = bodies.current;
    const t = tops.current;
    const l = lights.current;
    const h = halos.current;
    const traffic = cars.current;
    if (b === null || t === null || l === null || h === null) return;
    if (!frame.ready || !frame.seedReady) {
      b.count = t.count = l.count = h.count = 0;
      for (const c of traffic) if (c) c.count = 0;
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
    const nc = kit.traffic.map(() => 0);
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
    ) => {
      m4.compose(pos.set(x, y, z), IDENTITY, scl.set(sx, sy, sz));
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
        const { kind, model } = kindOf(hash, lane);
        if (kind === "car") {
          const z = carZ + (rz - carZ) * (1 - TRAFFIC_DRIFT);
          const car = kit.traffic[model];
          const mesh = traffic[model];
          if (car === undefined || mesh == null) continue;
          if (z - car.length / 2 > cutoff || nearCamera(x, z)) continue;
          // The model carries its own lit tail lights; the halo keeps them visible in the fog.
          const slot = nc[model] ?? 0;
          nc[model] = slot + 1;
          put(mesh, slot, x, 0, z, 1, 1, 1, WHITE);
          put(h, nh++, x, 0.72, z + car.length / 2 + 0.08, 3.4, 1.4, 1, RED);
        } else {
          const z = rz;
          if (z - 1 > cutoff || nearCamera(x, z)) continue;
          if (kind === "roadblock") {
            put(b, nb++, x, 0.5, z, 2.2, 0.9, 0.45, STRIPE);
            put(t, nt++, x, 0.5, z + 0.05, 2.24, 0.3, 0.42, RED);
            put(l, nl++, x - 0.85, 1.08, z, 0.22, 0.22, 0.22, AMBER_LAMP);
            put(l, nl++, x + 0.85, 1.08, z, 0.22, 0.22, 0.22, AMBER_LAMP);
            put(h, nh++, x, 1.0, z + 0.3, 3.6, 1.6, 1, AMBER);
          } else {
            put(b, nb++, x, 0.06, z, 2.1, 0.12, 0.9, DARK);
            put(l, nl++, x, 0.14, z + 0.3, 2.0, 0.06, 0.12, RED_LAMP);
            put(h, nh++, x, 0.3, z + 0.5, 3.2, 0.9, 1, RED);
          }
        }
      }
    }
    b.count = nb;
    t.count = nt;
    l.count = nl;
    h.count = nh;
    traffic.forEach((c, i) => {
      if (c) c.count = nc[i] ?? 0;
    });
    for (const mesh of [b, t, l, h, ...traffic]) {
      if (mesh === null) continue;
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
      {kit.traffic.map((car, i) => (
        <instancedMesh
          key={i}
          ref={(m) => void (cars.current[i] = m)}
          args={[car.whole, kit.material, MAX]}
          frustumCulled={false}
        />
      ))}
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

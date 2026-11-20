"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { INVULN_TICKS, NITRO_TICKS } from "@sirenrun/sim";
import { useEffect, useMemo, useRef } from "react";
import {
  MathUtils,
  Matrix4,
  Vector3,
  type InstancedMesh,
  type Mesh,
  type PerspectiveCamera,
} from "three";
import { useArena } from "../stores/arena";
import { PlayerCar, Police } from "./Cars";
import { laneMotion, prefersReducedMotion } from "./controls";
import { frame, resetFrame } from "./frame";
import { Obstacles } from "./Obstacles";
import { PlaybackClock, sample } from "./playback";
import { Road } from "./Road";
import { worldX, worldZ } from "./world";

const FOG = { color: "#1a0d2c", near: 18, far: 150 };

/** Runs first each frame: advances the playback clock and fills the shared `Frame`. */
function FrameDriver() {
  const clock = useMemo(() => new PlaybackClock(), []);
  const seen = useRef({ nonce: -1, t: -1, invuln: 0 });

  useFrame((_, delta) => {
    frame.time += delta;
    frame.hit = false;
    const { timeline } = useArena.getState();
    const latest = timeline.latest;
    if (latest === undefined) {
      frame.ready = false;
      return;
    }
    const arena = latest.arena;
    const now = performance.now();
    const seenRun = seen.current;
    if (arena.nonce !== seenRun.nonce) {
      seenRun.nonce = arena.nonce;
      seenRun.t = -1;
      seenRun.invuln = 0;
      clock.reset();
      laneMotion.reset();
    }
    // A hit sets invuln to INVULN_TICKS; any rise between snapshots means a new hit.
    if (arena.sim.t !== seenRun.t) {
      if (arena.sim.invuln > seenRun.invuln && arena.sim.invuln >= INVULN_TICKS - 2)
        frame.hit = true;
      seenRun.t = arena.sim.t;
      seenRun.invuln = arena.sim.invuln;
    }

    const playing = arena.status === "live" || arena.status === "settled";
    const tick = playing ? clock.advance(delta * 1000, arena.sim.t, latest.at, now) : arena.sim.t;
    const s = sample(timeline, tick);
    if (s === null) return;
    const shown = s.arena.sim;

    frame.ready = true;
    frame.status = arena.status;
    frame.seed = arena.seed;
    frame.seedReady = arena.seedReady;
    frame.tick = tick;
    frame.distance = s.distance;
    frame.carX = s.carX;
    frame.speed = s.speed;
    frame.policeGap = s.policeGap;
    frame.nitro = shown.nitroTicks > 0 && shown.nitroTicks <= NITRO_TICKS;
    frame.invuln = shown.invuln;
    frame.busted = shown.busted;
    frame.targetLane = laneMotion.targetLane(arena.sim.targetLane);
    frame.displayX = laneMotion.update(delta * 1000, s.carX, arena.sim.targetLane, now);
  }, -1);

  return null;
}

const look = new Vector3();

/** Chase camera: behind and above, lags on lane changes, widens on nitro, shakes on a hit. */
function CameraRig() {
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const state = useRef({ x: 0, shake: 0, fov: 62 });

  useFrame((three, delta) => {
    const camera = three.camera as PerspectiveCamera;
    const s = state.current;
    const carX = worldX(frame.displayX);
    const carZ = worldZ(frame.distance);
    s.x = MathUtils.lerp(s.x, carX * 0.6, 1 - Math.exp(-delta * 5));
    if (frame.hit && !reduced) s.shake = 1;
    s.shake = Math.max(0, s.shake - delta / 0.15);
    const jitter = s.shake * 0.22;
    // Z follows exactly: any lag along the road reads as stutter at speed.
    camera.position.set(
      s.x + (Math.random() - 0.5) * jitter,
      3.9 + (Math.random() - 0.5) * jitter,
      carZ + 10.5,
    );
    camera.lookAt(look.set(MathUtils.lerp(s.x, carX, 0.5), 0.2, carZ - 16));
    const targetFov = frame.nitro && !reduced ? 70 : 62;
    s.fov = MathUtils.lerp(s.fov, targetFov, 1 - Math.exp(-delta * 4));
    if (Math.abs(camera.fov - s.fov) > 0.01) {
      camera.fov = s.fov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

const SKYLINE = 48;
const mod = (a: number, n: number) => ((a % n) + n) % n;
const building = new Matrix4();

/** Distant towers on both shores, recycled along the road so the skyline never ends. */
function Skyline() {
  const mesh = useRef<InstancedMesh>(null);
  const layout = useMemo(
    () =>
      Array.from({ length: SKYLINE }, (_, i) => {
        const r = Math.sin(i * 12.9898) * 43758.5453;
        const rand = r - Math.floor(r);
        const r2 = Math.sin(i * 78.233) * 12543.123;
        const rand2 = r2 - Math.floor(r2);
        return {
          side: i % 2 === 0 ? -1 : 1,
          offset: Math.floor(i / 2) * 14 + rand2 * 6,
          height: 14 + rand * rand * 52,
          width: 5 + rand2 * 8,
          distance: 60 + rand2 * 70,
        };
      }),
    [],
  );
  const span = (SKYLINE / 2) * 14;

  useFrame(() => {
    const m = mesh.current;
    if (m === null) return;
    const carZ = worldZ(frame.distance);
    layout.forEach((b, i) => {
      // A tower's world z is -offset plus a whole number of spans: fixed in the world, and
      // recycled into the window (carZ + 20 - span, carZ + 20] as the car passes.
      const z = carZ + 20 - mod(carZ + 20 + b.offset, span);
      building.makeScale(b.width, b.height, b.width);
      building.setPosition(b.side * b.distance, b.height / 2 - 1, z);
      m.setMatrixAt(i, building);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, SKYLINE]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color="#120c22"
        emissive="#2a0e3d"
        emissiveIntensity={0.6}
        roughness={0.9}
      />
    </instancedMesh>
  );
}

function World() {
  return (
    <>
      <color attach="background" args={["#0b0717"]} />
      <fog attach="fog" args={[FOG.color, FOG.near, FOG.far]} />
      <hemisphereLight args={["#5b3a8a", "#07060f", 0.9]} />
      <directionalLight position={[-6, 12, 4]} intensity={0.8} color="#c9b8ff" />
      <Water />
      <Skyline />
      <Road fog={FOG} />
      <Obstacles />
      <PlayerCar />
      <Police />
      <CameraRig />
    </>
  );
}

/** Dark water on both sides of the causeway; follows the car so it never ends. */
function Water() {
  const mesh = useRef<Mesh>(null);
  useFrame(() => {
    if (mesh.current !== null) mesh.current.position.z = worldZ(frame.distance) - 60;
  });
  return (
    <mesh ref={mesh} rotation-x={-Math.PI / 2} position={[0, -0.6, 0]}>
      <planeGeometry args={[400, 320]} />
      <meshStandardMaterial color="#05040c" roughness={0.15} metalness={0.8} />
    </mesh>
  );
}

export default function Scene({ className }: { className?: string }) {
  useEffect(() => resetFrame(), []);
  return (
    <Canvas
      className={className}
      style={{ position: "absolute", inset: 0 }}
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ fov: 62, near: 0.1, far: 260, position: [0, 3.9, 10.5] }}
    >
      <FrameDriver />
      <World />
    </Canvas>
  );
}

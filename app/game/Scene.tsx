"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { INVULN_TICKS, NITRO_TICKS, SPEED_MAX } from "@sirenrun/sim";
import { useEffect, useMemo, useRef, useState } from "react";
import { MathUtils, Vector3, type PerspectiveCamera } from "three";
import { useArena } from "../stores/arena";
import { PlayerCar, Police } from "./Cars";
import { laneMotion, prefersReducedMotion } from "./controls";
import { frame, resetFrame } from "./frame";
import { Obstacles } from "./Obstacles";
import { PlaybackClock, sample } from "./playback";
import { FOG_FAR, FOG_NEAR, NEON } from "./palette";
import { Road } from "./Road";
import { Roadside } from "./Roadside";
import { Sky } from "./Sky";
import { webglAvailable } from "./webgl";
import { worldX, worldZ } from "./world";

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
  const state = useRef({ x: 0, shake: 0, fov: 60 });

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
    // Higher than a plain chase cam, so the road reads ~18 rows ahead and dodges can be
    // planned; z follows exactly, since any lag along the road reads as stutter at speed.
    camera.position.set(
      s.x + (Math.random() - 0.5) * jitter,
      5.4 + (Math.random() - 0.5) * jitter,
      carZ + 11.5,
    );
    camera.lookAt(look.set(MathUtils.lerp(s.x, carX, 0.5), 0, carZ - 24));
    // Wider with speed, and a kick on nitro: the main sense of pace.
    const speedFov = 58 + Math.min(1, frame.speed / SPEED_MAX) * 6;
    const targetFov = reduced ? 60 : speedFov + (frame.nitro ? 8 : 0);
    s.fov = MathUtils.lerp(s.fov, targetFov, 1 - Math.exp(-delta * 4));
    if (Math.abs(camera.fov - s.fov) > 0.01) {
      camera.fov = s.fov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

function World() {
  return (
    <>
      <fog attach="fog" args={[NEON.fog, FOG_NEAR, FOG_FAR]} />
      {/* Warm sunset fill from ahead, violet sky light, dark ground bounce. */}
      <hemisphereLight args={["#9a72e0", "#1c1028", 1.3]} />
      {/* Key light from behind the camera: the faces the player sees (car rears) are lit. */}
      <directionalLight position={[8, 16, 30]} intensity={1.4} color="#ffd2e8" />
      <directionalLight position={[0, 6, -40]} intensity={0.5} color={NEON.skyGlow} />
      <ambientLight intensity={0.25} color="#ff9ad5" />
      <Sky />
      <Roadside />
      <Road />
      <Obstacles />
      <PlayerCar />
      <Police />
      <CameraRig />
    </>
  );
}

/** Shown instead of the scene when the browser cannot render WebGL. The HUD still works. */
function NoWebgl({ lost }: { lost: boolean }) {
  return (
    <div className="absolute inset-x-4 top-16 flex justify-center">
      <div
        className="max-w-md rounded-xl border border-amber/30 bg-black/70 p-4 text-sm"
        role="status"
      >
        <p className="font-semibold">
          {lost
            ? "The 3D view stopped (graphics reset)"
            : "Your browser has 3D graphics turned off"}
        </p>
        <p className="mt-2 text-muted">
          {lost
            ? "Reload the page to bring it back. The timer, gap meter and controls keep working."
            : "Turn on graphics acceleration in your browser settings and relaunch it. In Chrome: Settings → System → “Use graphics acceleration when available”. The timer, gap meter and controls still work without it."}
        </p>
        {lost && (
          <button type="button" className="btn-primary mt-3" onClick={() => location.reload()}>
            Reload
          </button>
        )}
      </div>
    </div>
  );
}

export default function Scene({ className }: { className?: string }) {
  useEffect(() => resetFrame(), []);
  const [available] = useState(webglAvailable);
  const [lost, setLost] = useState(false);
  if (!available || lost) return <NoWebgl lost={lost} />;
  return (
    <Canvas
      className={className}
      style={{ position: "absolute", inset: 0 }}
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ fov: 60, near: 0.1, far: 700, position: [0, 5.4, 11.5] }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", () => setLost(true), { once: true });
      }}
    >
      <FrameDriver />
      <World />
    </Canvas>
  );
}

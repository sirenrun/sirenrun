"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { INVULN_TICKS, NITRO_BOOST, NITRO_TICKS, SPEED_MAX } from "@sirenrun/sim";
import { useEffect, useMemo, useRef, useState } from "react";
import { MathUtils, Vector3, type PerspectiveCamera } from "three";
import { useArena } from "../stores/arena";
import { PlayerCar, Police } from "./Cars";
import { laneMotion, prefersReducedMotion } from "./controls";
import { frame, resetFrame } from "./frame";
import { Sparks, SpeedLines } from "./Effects";
import { Obstacles } from "./Obstacles";
import { PlaybackClock, sample } from "./playback";
import { FOG_FAR, FOG_NEAR, NEON } from "./palette";
import { Road } from "./Road";
import { Roadside } from "./Roadside";
import { Sky } from "./Sky";
import { webglAvailable } from "./webgl";
import { spring } from "./spring";
import { metresPerSecond, worldX, worldZ } from "./world";

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

/** Chase camera geometry (metres): behind and above the car, aimed down the road. */
const CAM_BEHIND = 10.5;
const CAM_HEIGHT = 4.3;
const LOOK_AHEAD = 24;
const LOOK_Y = 0.7;

/**
 * Chase camera with weight. Everything that moves it is a spring, so it reads as momentum:
 * it falls back under acceleration and nitro and lurches toward the car when a hit kills
 * speed, follows lane changes with a slight lag and roll, rumbles harder with speed, jolts on
 * a hit, and swings around the car once the run is busted.
 */
function CameraRig() {
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const state = useRef({
    x: 0,
    vx: 0,
    lag: 0,
    vlag: 0,
    roll: 0,
    fov: 62,
    shake: 0,
    punch: 0,
    mps: 0,
    accel: 0,
    lastCarX: 0,
    bust: 0,
    time: 0,
  });

  useFrame((three, rawDelta) => {
    const camera = three.camera as PerspectiveCamera;
    const s = state.current;
    const dt = Math.min(rawDelta, 0.05);
    s.time += dt;
    const carX = worldX(frame.displayX);
    const carZ = worldZ(frame.distance);
    const eff = frame.speed + (frame.nitro ? NITRO_BOOST : 0);
    const mps = metresPerSecond(eff);

    // Smoothed acceleration in m/s². A hit drops speed by 60% in one tick, which shows up
    // here as a hard negative spike.
    if (dt > 0) {
      const raw = MathUtils.clamp((mps - s.mps) / dt, -400, 400);
      s.accel = MathUtils.lerp(s.accel, raw, 1 - Math.exp(-dt / 0.12));
    }
    s.mps = mps;
    const lateral = dt > 0 ? (carX - s.lastCarX) / dt : 0;
    s.lastCarX = carX;

    // Pushes in only a little on a hit: any further and the camera would pass the police.
    const lagTarget = reduced
      ? 0
      : MathUtils.clamp(s.accel * 0.09, -1.3, 2.4) + (frame.nitro ? 1.6 : 0);
    [s.lag, s.vlag] = spring(s.lag, s.vlag, lagTarget, 5.5, 0.55, dt);
    [s.x, s.vx] = spring(s.x, s.vx, carX * 0.72, 5, 0.85, dt);
    const rollTarget = reduced ? 0 : MathUtils.clamp(-lateral * 0.01, -0.045, 0.045);
    s.roll = MathUtils.lerp(s.roll, rollTarget, 1 - Math.exp(-dt * 6));

    if (frame.hit && !reduced) {
      s.shake = 1;
      s.punch = 1;
    }
    s.punch = Math.max(0, s.punch - dt / 0.5);
    s.shake = Math.max(0, s.shake - dt / 0.4);
    const speedNorm = Math.min(1, eff / (SPEED_MAX + NITRO_BOOST));
    const rumble = reduced ? 0 : 0.012 + speedNorm * speedNorm * 0.05;
    const hitAmp = s.shake * s.shake * 0.45;
    const t = s.time;
    const shakeX = (Math.sin(t * 31.7) + Math.sin(t * 17.3)) * 0.5 * (rumble + hitAmp);
    const shakeY = (Math.sin(t * 27.1) + Math.sin(t * 41.9)) * 0.5 * (rumble * 0.7 + hitAmp);

    s.bust = frame.busted && frame.status !== "idle" ? s.bust + dt : 0;
    if (s.bust > 0) {
      // Rise and swing a little to the side, like a helicopter shot, high enough to look down
      // over the cruisers boxing the car in instead of cutting through them.
      const k = 1 - Math.exp(-s.bust * 0.7);
      const angle = k * 0.5;
      const radius = CAM_BEHIND - k * 1.5;
      camera.position.set(
        carX + Math.sin(angle) * radius,
        CAM_HEIGHT + k * 5,
        carZ + Math.cos(angle) * radius,
      );
      camera.lookAt(look.set(carX, 0.9, carZ));
    } else {
      camera.position.set(
        s.x + shakeX,
        CAM_HEIGHT + shakeY - s.lag * 0.08,
        carZ + CAM_BEHIND + s.lag,
      );
      camera.lookAt(look.set(MathUtils.lerp(s.x, carX, 0.55), LOOK_Y, carZ - LOOK_AHEAD));
      camera.rotateZ(s.roll);
    }

    // Wider with speed and a hard kick on nitro: the main sense of pace.
    const targetFov = reduced ? 62 : 60 + speedNorm * 10 + (frame.nitro ? 9 : 0);
    s.fov = MathUtils.lerp(s.fov, targetFov, 1 - Math.exp(-dt * 3.5));
    // A hit snaps the lens in for a moment, then lets it breathe back out.
    const fov = s.fov - s.punch * s.punch * 7;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
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
      <Sparks />
      <SpeedLines />
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
      camera={{ fov: 62, near: 0.3, far: 900, position: [0, 4.3, 10.5] }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", () => setLost(true), { once: true });
      }}
    >
      <FrameDriver />
      <World />
    </Canvas>
  );
}

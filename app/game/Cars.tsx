"use client";

import { useFrame } from "@react-three/fiber";
import { GAP_MAX, LANE_WIDTH, LANES, NITRO_BOOST } from "@sirenrun/sim";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  DoubleSide,
  MathUtils,
  Object3D,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type PointLight,
  type SpotLight,
} from "three";
import { frame } from "./frame";
import { glowTexture } from "./glow";
import { NEON } from "./palette";
import { spring } from "./spring";
import {
  LANE_W,
  metresPerSecond,
  POLICE_CONTACT,
  POLICE_FAR,
  policeDistance,
  worldX,
  worldZ,
} from "./world";

const WHEEL_RADIUS = 0.34;
/** Wheel positions (x, z) under the 1.9 x 4.1 m body; wheels sit just proud of the sides. */
const WHEELS = [
  [-0.92, -1.3],
  [0.92, -1.3],
  [-0.92, 1.3],
  [0.92, 1.3],
] as const;

function Halo({
  position,
  size,
  color,
  opacity = 0.8,
}: {
  position: [number, number, number];
  size: number;
  color: string;
  opacity?: number;
}) {
  const glow = useMemo(() => glowTexture(), []);
  return (
    <mesh position={position}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial
        map={glow}
        color={color}
        transparent
        opacity={opacity}
        blending={AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
        fog={false}
      />
    </mesh>
  );
}

/**
 * The player's car: hot pink body with white trim (no traffic uses either), real headlights that light the road and
 * the traffic ahead, and a strong underglow, so it never reads as one of the obstacles.
 * Leans into lane changes and blinks while invulnerable after a hit.
 */
export function PlayerCar() {
  const group = useRef<Group>(null);
  const body = useRef<Group>(null);
  const left = useRef<SpotLight>(null);
  const right = useRef<SpotLight>(null);
  const targets = useMemo(() => [new Object3D(), new Object3D()], []);
  const flames = useRef<Group>(null);
  const exhaust = useRef<PointLight>(null);
  const wheels = useRef<(Mesh | null)[]>([]);
  const dyn = useRef({
    lastX: null as number | null,
    lastVx: 0,
    mps: 0,
    accel: 0,
    pitch: 0,
    vpitch: 0,
    roll: 0,
    vroll: 0,
    spin: 0,
    flame: 0,
  });

  useEffect(() => {
    if (left.current) left.current.target = targets[0] as Object3D;
    if (right.current) right.current.target = targets[1] as Object3D;
  }, [targets]);

  useFrame((_, rawDelta) => {
    const g = group.current;
    const b = body.current;
    if (g === null || b === null) return;
    const dt = Math.min(rawDelta, 0.05);
    const d = dyn.current;
    const x = worldX(frame.displayX);
    const z = worldZ(frame.distance);
    g.position.set(x, 0, z);
    (targets[0] as Object3D).position.set(x - 0.6, 0, z - 26);
    (targets[1] as Object3D).position.set(x + 0.6, 0, z - 26);
    (targets[0] as Object3D).updateMatrixWorld();
    (targets[1] as Object3D).updateMatrixWorld();

    const eff = frame.speed + (frame.nitro ? NITRO_BOOST : 0);
    const mps = metresPerSecond(eff);
    if (dt > 0) {
      const raw = MathUtils.clamp((mps - d.mps) / dt, -400, 400);
      d.accel = MathUtils.lerp(d.accel, raw, 1 - Math.exp(-dt / 0.1));
    }
    d.mps = mps;
    const vx = d.lastX === null || dt === 0 ? 0 : (x - d.lastX) / dt;
    const ax = dt === 0 ? 0 : (vx - d.lastVx) / dt;
    d.lastX = x;
    d.lastVx = vx;

    // Weight transfer: nose up under throttle and nitro, hard dive when a hit kills speed;
    // body rolls away from the turn and settles with a little overshoot.
    const pitchTarget = MathUtils.clamp(d.accel * 0.0028, -0.09, 0.06);
    [d.pitch, d.vpitch] = spring(d.pitch, d.vpitch, pitchTarget, 9, 0.45, dt);
    const rollTarget = MathUtils.clamp(-vx * 0.022 - ax * 0.0012, -0.12, 0.12);
    [d.roll, d.vroll] = spring(d.roll, d.vroll, rollTarget, 11, 0.4, dt);
    const buzz = Math.sin(frame.time * 57) * Math.sin(frame.time * 23) * 0.012 * (mps / 50);
    b.rotation.x = d.pitch;
    b.rotation.z = d.roll;
    b.rotation.y = MathUtils.clamp(-vx * 0.028, -0.1, 0.1);
    b.position.y = buzz - Math.abs(d.roll) * 0.25;
    b.visible = frame.invuln === 0 || Math.floor(frame.time * 12) % 2 === 0;

    d.spin -= (mps / WHEEL_RADIUS) * dt;
    for (const w of wheels.current) if (w) w.rotation.x = d.spin;

    // Nitro flames: snap on, flicker, and snuff out when a hit cancels the burn.
    d.flame = MathUtils.lerp(
      d.flame,
      frame.nitro ? 1 : 0,
      1 - Math.exp(-dt * (frame.nitro ? 18 : 10)),
    );
    const f = flames.current;
    if (f) {
      f.visible = d.flame > 0.02;
      const flicker = 0.8 + Math.sin(frame.time * 63) * 0.12 + Math.sin(frame.time * 97) * 0.08;
      f.scale.set(d.flame, d.flame, d.flame * flicker);
    }
    const e = exhaust.current;
    if (e) e.intensity = d.flame * 40 * (0.85 + Math.sin(frame.time * 50) * 0.15);
  });

  return (
    <>
      <group ref={group}>
        <group ref={body}>
          {/* Body: low wedge with a raised rear deck */}
          <mesh position={[0, 0.42, 0]}>
            <boxGeometry args={[1.9, 0.5, 4.1]} />
            <meshStandardMaterial
              color="#ff2e88"
              emissive="#ff2e88"
              emissiveIntensity={0.35}
              roughness={0.25}
              metalness={0.4}
            />
          </mesh>
          <mesh position={[0, 0.82, 0.35]}>
            <boxGeometry args={[1.5, 0.38, 1.8]} />
            <meshStandardMaterial color="#120d1f" roughness={0.1} metalness={0.9} />
          </mesh>
          <mesh position={[0, 0.72, 1.85]}>
            <boxGeometry args={[1.9, 0.12, 0.5]} />
            <meshStandardMaterial color="#ffffff" roughness={0.3} metalness={0.3} />
          </mesh>
          {/* White racing stripes and side trims */}
          {[-0.28, 0.28].map((side) => (
            <mesh key={side} position={[side, 0.68, -1.1]}>
              <boxGeometry args={[0.22, 0.02, 1.8]} />
              <meshBasicMaterial color="#ffffff" toneMapped={false} />
            </mesh>
          ))}
          {[-0.96, 0.96].map((side) => (
            <mesh key={side} position={[side, 0.3, 0]}>
              <boxGeometry args={[0.05, 0.08, 3.9]} />
              <meshBasicMaterial color={NEON.cyan} toneMapped={false} />
            </mesh>
          ))}
          <mesh position={[0, 0.55, 2.06]}>
            <boxGeometry args={[1.6, 0.1, 0.04]} />
            <meshBasicMaterial color={NEON.red} toneMapped={false} />
          </mesh>
          <Halo position={[0, 0.55, 2.12]} size={2.6} color={NEON.red} opacity={0.7} />
          {/* Headlights */}
          {[-0.62, 0.62].map((side) => (
            <mesh key={side} position={[side, 0.5, -2.06]}>
              <boxGeometry args={[0.4, 0.12, 0.04]} />
              <meshBasicMaterial color="#fff6e0" toneMapped={false} />
            </mesh>
          ))}
          {/* Wheels: spin at the true road speed. */}
          {WHEELS.map(([wx, wz], i) => (
            <mesh
              key={i}
              ref={(m) => void (wheels.current[i] = m)}
              position={[wx, WHEEL_RADIUS, wz]}
              rotation-z={Math.PI / 2}
            >
              <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, 0.3, 14]} />
              <meshStandardMaterial color="#0a0910" roughness={0.6} metalness={0.3} />
              {/* Hub bars on both faces, so the spin is visible. */}
              {[-0.152, 0.152].map((face) => (
                <mesh key={face} position={[0, face, 0]}>
                  <boxGeometry args={[0.46, 0.01, 0.08]} />
                  <meshBasicMaterial color="#8a82a3" />
                </mesh>
              ))}
            </mesh>
          ))}
          {/* Nitro: twin exhaust flames, hot amber core fading to blue. */}
          <group ref={flames} position={[0, 0.32, 2.08]} visible={false}>
            {[-0.5, 0.5].map((side) => (
              <group key={side} position={[side, 0, 0]}>
                <mesh position={[0, 0, 0.55]} rotation-x={Math.PI / 2}>
                  <coneGeometry args={[0.2, 1.1, 10, 1, true]} />
                  <meshBasicMaterial
                    color="#5a8cff"
                    transparent
                    opacity={0.7}
                    blending={AdditiveBlending}
                    depthWrite={false}
                    toneMapped={false}
                    side={DoubleSide}
                  />
                </mesh>
                <mesh position={[0, 0, 0.32]} rotation-x={Math.PI / 2}>
                  <coneGeometry args={[0.11, 0.62, 8, 1, true]} />
                  <meshBasicMaterial
                    color="#ffd27a"
                    transparent
                    opacity={0.95}
                    blending={AdditiveBlending}
                    depthWrite={false}
                    toneMapped={false}
                    side={DoubleSide}
                  />
                </mesh>
              </group>
            ))}
            <Halo position={[0, 0, 0.5]} size={2.4} color={NEON.amber} opacity={0.75} />
          </group>
          {/* Underglow */}
          <mesh position={[0, 0.03, 0]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[3.2, 5.6]} />
            <meshBasicMaterial
              map={glowTexture()}
              color={NEON.pink}
              transparent
              opacity={0.9}
              blending={AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
        <pointLight
          ref={exhaust}
          position={[0, 0.5, 3]}
          distance={14}
          decay={1.6}
          intensity={0}
          color={NEON.amber}
        />
        <spotLight
          ref={left}
          position={[-0.62, 0.7, -2]}
          angle={0.38}
          penumbra={0.6}
          distance={70}
          decay={1.2}
          intensity={60}
          color="#fff1d6"
        />
        <spotLight
          ref={right}
          position={[0.62, 0.7, -2]}
          angle={0.38}
          penumbra={0.6}
          distance={70}
          decay={1.2}
          intensity={60}
          color="#fff1d6"
        />
      </group>
      <primitive object={targets[0] as Object3D} />
      <primitive object={targets[1] as Object3D} />
    </>
  );
}

const CRUISERS = [
  { lane: 0, back: 0 },
  { lane: -1, back: 4.5 },
  { lane: 1, back: 6.5 },
] as const;

/**
 * Police are a number onchain (`police_gap`), so these cruisers are a picture of it: the lead
 * one sits behind the car at a distance mapped from the gap and follows its lane with a lag.
 */
export function Police() {
  const groups = useRef<(Group | null)[]>([]);
  const lamps = useRef<{ red: MeshBasicMaterial | null; blue: MeshBasicMaterial | null }[]>([]);
  const light = useRef<PointLight>(null);
  const follow = useRef(0);

  useFrame((three, delta) => {
    const visible = frame.ready && frame.status !== "idle";
    const carZ = worldZ(frame.distance);
    const lead = policeDistance(frame.policeGap);
    const closeness = 1 - Math.min(1, Math.max(0, frame.policeGap) / GAP_MAX);
    // They hunt your lane harder the closer they get.
    const chase = 1.6 + closeness * closeness * 4;
    follow.current = MathUtils.lerp(follow.current, frame.displayX, 1 - Math.exp(-delta * chase));
    const flash = Math.sin(frame.time * 14) > 0;
    // A cruiser is drawn only while its rear bumper is in front of the camera; otherwise
    // the camera plane slices it open.
    const cutoff = three.camera.position.z - 0.8;

    CRUISERS.forEach((cruiser, i) => {
      const g = groups.current[i];
      if (g == null) return;
      const x = MathUtils.clamp(
        follow.current + cruiser.lane * LANE_WIDTH,
        0,
        (LANES - 1) * LANE_WIDTH,
      );
      // Close in, the wing cruisers pull up beside the lead one rather than between the
      // camera and the car.
      const spread = MathUtils.clamp(
        (lead - POLICE_CONTACT) / (POLICE_FAR - POLICE_CONTACT),
        0.15,
        1,
      );
      if (frame.busted) {
        // Caught: the lead cruiser pins the rear bumper and the wings pull up alongside.
        const bx = worldX(frame.displayX) + cruiser.lane * LANE_W * 1.05;
        const bz = carZ + (cruiser.lane === 0 ? POLICE_CONTACT : 1.2);
        const k = 1 - Math.exp(-delta * 2.5);
        g.position.set(MathUtils.lerp(g.position.x, bx, k), 0, MathUtils.lerp(g.position.z, bz, k));
        g.rotation.y = MathUtils.lerp(g.rotation.y, -cruiser.lane * 0.35, k);
        g.visible = visible;
      } else {
        const z = carZ + lead + cruiser.back * spread;
        g.position.set(worldX(x), 0, z);
        g.rotation.y = 0;
        g.visible = visible && z + 2.1 < cutoff;
      }
      const pair = lamps.current[i];
      if (pair?.red && pair.blue) {
        const alt = i % 2 === 0 ? flash : !flash;
        pair.red.opacity = alt ? 1 : 0.12;
        pair.blue.opacity = alt ? 0.12 : 1;
      }
    });
    const l = light.current;
    if (l !== null) {
      l.visible = visible;
      l.position.set(worldX(follow.current), 2.6, carZ + lead - 1.5);
      l.color.set(flash ? NEON.policeRed : NEON.policeBlue);
      l.intensity = 25 + closeness * 55;
    }
  });

  return (
    <>
      {CRUISERS.map((cruiser, i) => (
        <group key={cruiser.lane} ref={(g) => void (groups.current[i] = g)} visible={false}>
          <mesh position={[0, 0.42, 0]}>
            <boxGeometry args={[1.85, 0.55, 4.1]} />
            <meshStandardMaterial color="#0d0c12" roughness={0.35} metalness={0.5} />
          </mesh>
          {/* White doors */}
          <mesh position={[0, 0.42, 0.1]}>
            <boxGeometry args={[1.87, 0.4, 1.7]} />
            <meshStandardMaterial color="#f4f2fa" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.84, 0.2]}>
            <boxGeometry args={[1.45, 0.38, 1.9]} />
            <meshStandardMaterial color="#0c0b14" roughness={0.15} metalness={0.8} />
          </mesh>
          <mesh position={[-0.4, 1.1, 0.2]}>
            <boxGeometry args={[0.62, 0.16, 0.34]} />
            <meshBasicMaterial
              ref={(m) => void ((lamps.current[i] ??= { red: null, blue: null }).red = m)}
              color={NEON.policeRed}
              transparent
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0.4, 1.1, 0.2]}>
            <boxGeometry args={[0.62, 0.16, 0.34]} />
            <meshBasicMaterial
              ref={(m) => void ((lamps.current[i] ??= { red: null, blue: null }).blue = m)}
              color={NEON.policeBlue}
              transparent
              toneMapped={false}
            />
          </mesh>
          <Halo position={[-0.4, 1.15, -0.1]} size={2.4} color={NEON.policeRed} opacity={0.6} />
          <Halo position={[0.4, 1.15, -0.1]} size={2.4} color={NEON.policeBlue} opacity={0.6} />
        </group>
      ))}
      <pointLight ref={light} distance={30} decay={1.3} visible={false} />
    </>
  );
}

"use client";

import { useFrame } from "@react-three/fiber";
import { LANE_WIDTH, LANES } from "@sirenrun/sim";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  MathUtils,
  Object3D,
  type Group,
  type MeshBasicMaterial,
  type PointLight,
  type SpotLight,
} from "three";
import { frame } from "./frame";
import { glowTexture } from "./glow";
import { NEON } from "./palette";
import { policeDistance, worldX, worldZ } from "./world";

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
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (left.current) left.current.target = targets[0] as Object3D;
    if (right.current) right.current.target = targets[1] as Object3D;
  }, [targets]);

  useFrame((_, delta) => {
    const g = group.current;
    const b = body.current;
    if (g === null || b === null) return;
    const x = worldX(frame.displayX);
    const z = worldZ(frame.distance);
    g.position.set(x, 0, z);
    (targets[0] as Object3D).position.set(x - 0.6, 0, z - 22);
    (targets[1] as Object3D).position.set(x + 0.6, 0, z - 22);
    (targets[0] as Object3D).updateMatrixWorld();
    (targets[1] as Object3D).updateMatrixWorld();
    const vx = last.current === null || delta === 0 ? 0 : (x - last.current) / delta;
    last.current = x;
    const k = 1 - Math.exp(-delta * 12);
    b.rotation.z = MathUtils.lerp(b.rotation.z, MathUtils.clamp(-vx * 0.035, -0.14, 0.14), k);
    b.rotation.y = MathUtils.lerp(b.rotation.y, MathUtils.clamp(-vx * 0.03, -0.12, 0.12), k);
    b.visible = frame.invuln === 0 || Math.floor(frame.time * 12) % 2 === 0;
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

  useFrame((_, delta) => {
    const visible = frame.ready && frame.status !== "idle";
    const carZ = worldZ(frame.distance);
    const lead = policeDistance(frame.policeGap);
    follow.current = MathUtils.lerp(follow.current, frame.displayX, 1 - Math.exp(-delta * 1.8));
    const flash = Math.sin(frame.time * 14) > 0;

    CRUISERS.forEach((cruiser, i) => {
      const g = groups.current[i];
      if (g == null) return;
      g.visible = visible;
      const x = MathUtils.clamp(
        follow.current + cruiser.lane * LANE_WIDTH,
        0,
        (LANES - 1) * LANE_WIDTH,
      );
      // Close in, the wing cruisers pull up beside the lead one rather than between the
      // camera and the car.
      const spread = MathUtils.clamp((lead - 2.6) / 12, 0.15, 1);
      g.position.set(worldX(x), 0, carZ + lead + cruiser.back * spread);
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
      l.position.set(worldX(follow.current), 2.4, carZ + lead - 1);
      l.color.set(flash ? NEON.policeRed : NEON.policeBlue);
      l.intensity = 25 + (1 - Math.min(1, frame.policeGap / 2500)) * 70;
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
      <pointLight ref={light} distance={22} decay={1.4} visible={false} />
    </>
  );
}

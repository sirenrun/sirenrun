"use client";

import { useFrame } from "@react-three/fiber";
import { LANE_WIDTH, LANES } from "@sirenrun/sim";
import { useRef } from "react";
import { MathUtils, type Group, type MeshBasicMaterial, type PointLight } from "three";
import { frame } from "./frame";
import { policeDistance, worldX, worldZ } from "./world";

/** The player's car: body, cabin, neon trim, tail lights, underglow. Leans into lane changes. */
export function PlayerCar() {
  const group = useRef<Group>(null);
  const body = useRef<Group>(null);
  const last = useRef<number | null>(null);

  useFrame((_, delta) => {
    const g = group.current;
    const b = body.current;
    if (g === null || b === null) return;
    const x = worldX(frame.displayX);
    g.position.set(x, 0, worldZ(frame.distance));
    // Lean and yaw from lateral speed, smoothed so a lane change reads as a swerve.
    const vx = last.current === null || delta === 0 ? 0 : (x - last.current) / delta;
    last.current = x;
    const k = 1 - Math.exp(-delta * 12);
    b.rotation.z = MathUtils.lerp(b.rotation.z, MathUtils.clamp(-vx * 0.035, -0.14, 0.14), k);
    b.rotation.y = MathUtils.lerp(b.rotation.y, MathUtils.clamp(-vx * 0.03, -0.12, 0.12), k);
    // Blink while invulnerable after a hit.
    b.visible = frame.invuln === 0 || Math.floor(frame.time * 12) % 2 === 0;
  });

  return (
    <group ref={group}>
      <group ref={body}>
        <mesh position={[0, 0.42, 0]} castShadow={false}>
          <boxGeometry args={[1.8, 0.55, 3.9]} />
          <meshStandardMaterial color="#14121f" roughness={0.35} metalness={0.6} />
        </mesh>
        <mesh position={[0, 0.86, 0.25]}>
          <boxGeometry args={[1.45, 0.42, 1.9]} />
          <meshStandardMaterial color="#1d1a2e" roughness={0.2} metalness={0.8} />
        </mesh>
        {/* Neon side trims */}
        {[-0.91, 0.91].map((side) => (
          <mesh key={side} position={[side, 0.38, 0]}>
            <boxGeometry args={[0.04, 0.08, 3.7]} />
            <meshBasicMaterial color="#ff2e88" toneMapped={false} />
          </mesh>
        ))}
        {/* Tail lights */}
        {[-0.6, 0.6].map((side) => (
          <mesh key={side} position={[side, 0.5, 1.96]}>
            <boxGeometry args={[0.45, 0.1, 0.04]} />
            <meshBasicMaterial color="#ff3b3b" toneMapped={false} />
          </mesh>
        ))}
        {/* Underglow */}
        <mesh position={[0, 0.03, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[2.6, 4.6]} />
          <meshBasicMaterial color="#ff2e88" transparent opacity={0.22} depthWrite={false} />
        </mesh>
      </group>
    </group>
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
    // The lead cruiser drifts toward the car's lane, slower than the car can swerve.
    follow.current = MathUtils.lerp(follow.current, frame.displayX, 1 - Math.exp(-delta * 1.8));
    const flash = Math.sin(frame.time * 14) > 0;

    CRUISERS.forEach((cruiser, i) => {
      const g = groups.current[i];
      if (g == null) return;
      g.visible = visible;
      const laneOffset = cruiser.lane * LANE_WIDTH;
      const x = MathUtils.clamp(follow.current + laneOffset, 0, (LANES - 1) * LANE_WIDTH);
      // Close in, the wing cruisers pull up beside the lead one (boxing the car in) rather
      // than sitting between the camera and the car.
      const spread = MathUtils.clamp((lead - 2.6) / 12, 0.15, 1);
      g.position.set(worldX(x), 0, carZ + lead + cruiser.back * spread);
      const pair = lamps.current[i];
      if (pair?.red && pair.blue) {
        const alt = i % 2 === 0 ? flash : !flash;
        pair.red.opacity = alt ? 1 : 0.15;
        pair.blue.opacity = alt ? 0.15 : 1;
      }
    });
    const l = light.current;
    if (l !== null) {
      l.visible = visible;
      l.position.set(worldX(follow.current), 2.2, carZ + lead - 1);
      l.color.set(flash ? "#ff3b3b" : "#3b6bff");
      // Brighter as they close in.
      l.intensity = 18 + (1 - Math.min(1, frame.policeGap / 2500)) * 40;
    }
  });

  return (
    <>
      {CRUISERS.map((cruiser, i) => (
        <group key={cruiser.lane} ref={(g) => void (groups.current[i] = g)} visible={false}>
          <mesh position={[0, 0.42, 0]}>
            <boxGeometry args={[1.8, 0.55, 4]} />
            <meshStandardMaterial color="#e9e7f2" roughness={0.4} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0.84, 0.2]}>
            <boxGeometry args={[1.45, 0.4, 1.9]} />
            <meshStandardMaterial color="#0c0b14" roughness={0.2} metalness={0.7} />
          </mesh>
          <mesh position={[-0.38, 1.12, 0.2]}>
            <boxGeometry args={[0.6, 0.14, 0.32]} />
            <meshBasicMaterial
              ref={(m) => void ((lamps.current[i] ??= { red: null, blue: null }).red = m)}
              color="#ff3b3b"
              transparent
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0.38, 1.12, 0.2]}>
            <boxGeometry args={[0.6, 0.14, 0.32]} />
            <meshBasicMaterial
              ref={(m) => void ((lamps.current[i] ??= { red: null, blue: null }).blue = m)}
              color="#3b6bff"
              transparent
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
      <pointLight ref={light} distance={16} decay={1.6} visible={false} />
    </>
  );
}

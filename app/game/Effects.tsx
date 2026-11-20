"use client";

import { useFrame } from "@react-three/fiber";
import { NITRO_BOOST, SPEED_MAX } from "@sirenrun/sim";
import { useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Matrix4,
  Quaternion,
  Vector3,
  type InstancedMesh,
  type Points,
} from "three";
import { prefersReducedMotion } from "./controls";
import { frame } from "./frame";
import { glowTexture } from "./glow";
import { recycledZ } from "./recycle";
import { metresPerSecond, ROAD_HALF, worldX, worldZ } from "./world";

const m4 = new Matrix4();
const pos = new Vector3();
const scl = new Vector3();
const IDENTITY = new Quaternion();

const STREAKS = 70;
const STREAK_SPAN = 140;

/**
 * Wind streaks along both road edges. They are fixed in the world and recycled,
 * so they pass at the true speed; their length and brightness grow with speed and jump on
 * nitro. Below cruise speed they are almost invisible.
 */
export function SpeedLines() {
  const mesh = useRef<InstancedMesh>(null);
  // Streaks rushing past are exactly the motion a reduced-motion visitor asked to avoid.
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const layout = useMemo(
    () =>
      Array.from({ length: STREAKS }, (_, i) => {
        const r = (n: number) => {
          const v = Math.sin(i * 47.13 + n * 9.71) * 43758.5453;
          return v - Math.floor(v);
        };
        const side = i % 2 === 0 ? -1 : 1;
        return {
          x: side * (ROAD_HALF + 0.8 + r(2) * 4),
          y: 0.5 + r(3) * 2.6,
          offset: r(4) * STREAK_SPAN,
        };
      }),
    [],
  );

  useFrame(() => {
    if (reduced) {
      if (mesh.current) mesh.current.visible = false;
      return;
    }
    const m = mesh.current;
    if (m === null) return;
    const eff = frame.speed + (frame.nitro ? NITRO_BOOST : 0);
    const k = Math.max(0, (eff - SPEED_MAX * 0.55) / (SPEED_MAX + NITRO_BOOST - SPEED_MAX * 0.55));
    const live = frame.ready && frame.status === "live" && !frame.busted;
    m.visible = live && k > 0.01;
    if (!m.visible) return;
    const length = 1 + k * k * (frame.nitro ? 14 : 7);
    const carZ = worldZ(frame.distance);
    layout.forEach((s, i) => {
      // Recycled just behind the car, before they get near the camera, where they would
      // smear across the screen.
      const z = recycledZ(s.offset, carZ, STREAK_SPAN, 1);
      m4.compose(pos.set(s.x, s.y, z), IDENTITY, scl.set(0.025, 0.025, length));
      m.setMatrixAt(i, m4);
    });
    m.instanceMatrix.needsUpdate = true;
    const mat = m.material as { opacity: number };
    mat.opacity = Math.min(0.45, k * (frame.nitro ? 0.6 : 0.22));
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, STREAKS]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial
        color="#cfe9ff"
        transparent
        opacity={0}
        blending={AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
        fog={false}
      />
    </instancedMesh>
  );
}

const SPARKS = 90;
const SPARK_LIFE = 0.75;
const HOT = new Color("#fff2c4");
const COOL = new Color("#ff6a1a");

/**
 * Sparks and debris thrown off the front of the car when a hit lands. They leave at a share
 * of the car's speed, so they trail behind it and bounce off the road.
 */
export function Sparks() {
  const points = useRef<Points>(null);
  // Mutated every frame, so it lives in a ref rather than memoised render state.
  const state = useRef({
    p: new Float32Array(SPARKS * 3),
    v: new Float32Array(SPARKS * 3),
    age: new Float32Array(SPARKS).fill(SPARK_LIFE),
  });
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(SPARKS * 3), 3));
    g.setAttribute("color", new BufferAttribute(new Float32Array(SPARKS * 3), 3));
    return g;
  }, []);
  const glow = useMemo(() => glowTexture(), []);
  const c = useMemo(() => new Color(), []);

  useFrame((_, rawDelta) => {
    const sim = state.current;
    const dt = Math.min(rawDelta, 0.05);
    const carX = worldX(frame.displayX);
    const carZ = worldZ(frame.distance);
    const mps = metresPerSecond(frame.speed);
    if (frame.hit) {
      for (let i = 0; i < SPARKS; i += 1) {
        const j = i * 3;
        sim.p[j] = carX + (Math.random() - 0.5) * 1.8;
        sim.p[j + 1] = 0.3 + Math.random() * 0.7;
        sim.p[j + 2] = carZ - 2.1;
        sim.v[j] = (Math.random() - 0.5) * 14;
        sim.v[j + 1] = 2 + Math.random() * 7;
        // Forward speed between a third and the car's own, so most fall behind it.
        sim.v[j + 2] = -mps * (0.35 + Math.random() * 0.6);
        sim.age[i] = Math.random() * 0.15;
      }
    }
    const pos = geometry.getAttribute("position") as BufferAttribute;
    const col = geometry.getAttribute("color") as BufferAttribute;
    let alive = false;
    for (let i = 0; i < SPARKS; i += 1) {
      const j = i * 3;
      const age = (sim.age[i] = Math.min(SPARK_LIFE, (sim.age[i] ?? 0) + dt));
      const life = 1 - age / SPARK_LIFE;
      if (life > 0) {
        alive = true;
        sim.v[j + 1] = (sim.v[j + 1] ?? 0) - 18 * dt;
        sim.p[j] = (sim.p[j] ?? 0) + (sim.v[j] ?? 0) * dt;
        sim.p[j + 1] = (sim.p[j + 1] ?? 0) + (sim.v[j + 1] ?? 0) * dt;
        sim.p[j + 2] = (sim.p[j + 2] ?? 0) + (sim.v[j + 2] ?? 0) * dt;
        if ((sim.p[j + 1] ?? 0) < 0.03) {
          sim.p[j + 1] = 0.03;
          sim.v[j + 1] = Math.abs(sim.v[j + 1] ?? 0) * 0.35;
        }
      }
      // Additive blending: fading the colour to black fades the spark out.
      c.copy(COOL)
        .lerp(HOT, life)
        .multiplyScalar(life * life * 2.2);
      pos.setXYZ(i, sim.p[j] ?? 0, sim.p[j + 1] ?? 0, sim.p[j + 2] ?? 0);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    if (points.current) points.current.visible = alive;
  });

  return (
    <points ref={points} geometry={geometry} frustumCulled={false} visible={false}>
      <pointsMaterial
        map={glow}
        size={0.35}
        sizeAttenuation
        vertexColors
        transparent
        blending={AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
        fog={false}
      />
    </points>
  );
}

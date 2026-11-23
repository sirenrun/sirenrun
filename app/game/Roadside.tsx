"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, Euler, Matrix4, Quaternion, Vector3, type InstancedMesh } from "three";
import { Billboards } from "./Billboards";
import { frame } from "./frame";
import { glowTexture } from "./glow";
import { Guardrails } from "./Guardrails";
import { Skyline } from "./Skyline";
import { Water } from "./Water";
import { LAMP_HEAD_X, LAMP_SPACING, PALM_MIN_X, POLE_X } from "./layout";
import { NEON } from "./palette";
import { recycledZ } from "./recycle";
import { worldZ } from "./world";

const LAMPS_PER_SIDE = 17;
const LAMP_SPAN = LAMP_SPACING * LAMPS_PER_SIDE;
const POLE_HEIGHT = 7;

const m4 = new Matrix4();
const pos = new Vector3();
const scl = new Vector3();
const rot = new Quaternion();
const eul = new Euler();
const IDENTITY = new Quaternion();

/** Poles, arms over the road and lamp heads with additive halos. */
function Streetlights() {
  const poles = useRef<InstancedMesh>(null);
  const heads = useRef<InstancedMesh>(null);
  const halos = useRef<InstancedMesh>(null);
  const count = LAMPS_PER_SIDE * 2;

  useFrame(() => {
    const p = poles.current;
    const h = heads.current;
    const g = halos.current;
    if (p === null || h === null || g === null) return;
    const carZ = worldZ(frame.distance);
    for (let i = 0; i < count; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = recycledZ(Math.floor(i / 2) * LAMP_SPACING, carZ, LAMP_SPAN, 16);
      // Pole + arm as one stretched box each would need two meshes; an L reads fine as
      // a tall pole plus a short arm instance in the heads mesh.
      m4.compose(
        pos.set(side * POLE_X, POLE_HEIGHT / 2, z),
        IDENTITY,
        scl.set(0.14, POLE_HEIGHT, 0.14),
      );
      p.setMatrixAt(i, m4);
      m4.compose(
        pos.set(side * (POLE_X - 1.1), POLE_HEIGHT, z),
        IDENTITY,
        scl.set(2.3, 0.14, 0.32),
      );
      p.setMatrixAt(count + i, m4);
      m4.compose(
        pos.set(side * LAMP_HEAD_X, POLE_HEIGHT - 0.12, z),
        IDENTITY,
        scl.set(0.7, 0.12, 0.4),
      );
      h.setMatrixAt(i, m4);
      m4.compose(
        pos.set(side * LAMP_HEAD_X, POLE_HEIGHT - 0.25, z + 0.05),
        IDENTITY,
        scl.set(3.2, 3.2, 1),
      );
      g.setMatrixAt(i, m4);
    }
    p.instanceMatrix.needsUpdate = true;
    h.instanceMatrix.needsUpdate = true;
    g.instanceMatrix.needsUpdate = true;
  });

  const glow = useMemo(() => glowTexture(), []);
  return (
    <>
      <instancedMesh ref={poles} args={[undefined, undefined, count * 2]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#1a1426" roughness={0.6} metalness={0.5} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, count]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color={NEON.lamp} toneMapped={false} fog={false} />
      </instancedMesh>
      <instancedMesh ref={halos} args={[undefined, undefined, count]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={glow}
          color={NEON.lamp}
          transparent
          opacity={0.55}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
          fog={false}
        />
      </instancedMesh>
    </>
  );
}

const PALMS_PER_SIDE = 21;
const PALM_SPACING = 19;
const PALM_SPAN = PALMS_PER_SIDE * PALM_SPACING;
const LEAVES = 7;

/** Palm silhouettes on both shores, dark against the sunset. */
function Palms() {
  const trunks = useRef<InstancedMesh>(null);
  const leaves = useRef<InstancedMesh>(null);
  const layout = useMemo(
    () =>
      Array.from({ length: PALMS_PER_SIDE * 2 }, (_, i) => {
        const r = (n: number) => {
          const v = Math.sin(i * 91.7 + n * 13.3) * 43758.5453;
          return v - Math.floor(v);
        };
        return {
          side: i % 2 === 0 ? -1 : 1,
          offset: Math.floor(i / 2) * PALM_SPACING + r(1) * 8,
          x: PALM_MIN_X + r(2) * 7,
          height: 7 + r(3) * 5,
          lean: (r(4) - 0.5) * 0.35,
          spin: r(5) * Math.PI,
        };
      }),
    [],
  );

  useFrame(() => {
    const t = trunks.current;
    const l = leaves.current;
    if (t === null || l === null) return;
    const carZ = worldZ(frame.distance);
    layout.forEach((p, i) => {
      const z = recycledZ(p.offset, carZ, PALM_SPAN, 20);
      const x = p.side * p.x;
      rot.setFromEuler(eul.set(0, 0, p.lean * p.side));
      m4.compose(pos.set(x, p.height / 2 - 0.5, z), rot, scl.set(0.32, p.height, 0.32));
      t.setMatrixAt(i, m4);
      const topX = x - Math.sin(p.lean * p.side) * p.height * 0.5;
      for (let k = 0; k < LEAVES; k += 1) {
        const yaw = p.spin + (k / LEAVES) * Math.PI * 2;
        rot.setFromEuler(eul.set(0.55, yaw, 0, "YXZ"));
        const dx = Math.sin(yaw) * 1.4;
        const dz = Math.cos(yaw) * 1.4;
        m4.compose(pos.set(topX + dx, p.height - 0.9, z + dz), rot, scl.set(0.55, 0.08, 3.2));
        l.setMatrixAt(i * LEAVES + k, m4);
      }
    });
    t.instanceMatrix.needsUpdate = true;
    l.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh
        ref={trunks}
        args={[undefined, undefined, layout.length]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[0.6, 1, 1, 6]} />
        <meshStandardMaterial color="#0d0814" roughness={1} />
      </instancedMesh>
      <instancedMesh
        ref={leaves}
        args={[undefined, undefined, layout.length * LEAVES]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#0b0712" roughness={1} />
      </instancedMesh>
    </>
  );
}

/** Everything beside the road. */
export function Roadside() {
  return (
    <>
      <Water />
      <Skyline />
      <Palms />
      <Guardrails />
      <Streetlights />
      <Billboards />
    </>
  );
}

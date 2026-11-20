"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  Color,
  ExtrudeGeometry,
  Matrix4,
  Quaternion,
  Shape,
  Vector3,
  type Group,
  type InstancedMesh,
} from "three";
import { frame } from "./frame";
import { RAIL_POST_SPACING, RAIL_X } from "./layout";
import { hot, NEON } from "./palette";
import { recycledZ } from "./recycle";
import { worldZ } from "./world";

/** The rail travels with the car like the road plane; its look does not change along z. */
const LENGTH = 460;
const POSTS_PER_SIDE = 100;
const POST_SPAN = POSTS_PER_SIDE * RAIL_POST_SPACING;
const REFLECTOR_EVERY = 3;
const RAIL_Y = 0.48;
const POST_HEIGHT = 0.78;
/** Reflectors glow amber-white, bright enough to bloom. */
const REFLECTOR: Color = hot("#ffd9a8", 3);

const m4 = new Matrix4();
const pos = new Vector3();
const scl = new Vector3();
const IDENTITY = new Quaternion();

/**
 * W-beam cross-section (x out from the road, y up), extruded along the road. Two folds catch
 * the light as separate bright lines, which is what makes it read as a steel barrier.
 */
function beamGeometry(): ExtrudeGeometry {
  const depth = 0.07;
  const t = 0.025;
  const front: [number, number][] = [
    [0, 0],
    [-depth, 0.06],
    [-depth, 0.1],
    [0, 0.16],
    [-depth, 0.22],
    [-depth, 0.26],
    [0, 0.32],
  ];
  const shape = new Shape();
  shape.moveTo(front[0]?.[0] ?? 0, front[0]?.[1] ?? 0);
  for (const [x, y] of front.slice(1)) shape.lineTo(x, y);
  for (const [x, y] of [...front].reverse()) shape.lineTo(x + t, y);
  const g = new ExtrudeGeometry(shape, { depth: LENGTH, bevelEnabled: false });
  // Extruded along +z from 0; centre it so the mesh can sit around the car.
  g.translate(0, 0, -LENGTH / 2);
  return g;
}

/**
 * Steel guardrails along both edges of the causeway, with posts and reflectors that catch the
 * headlights. Each rail is tinted by the neon line beside it.
 */
export function Guardrails() {
  const rails = useRef<Group>(null);
  const posts = useRef<InstancedMesh>(null);
  const reflectors = useRef<InstancedMesh>(null);
  const beam = useMemo(() => beamGeometry(), []);
  const count = POSTS_PER_SIDE * 2;
  const reflectorCount = Math.ceil(POSTS_PER_SIDE / REFLECTOR_EVERY) * 2;

  useFrame(() => {
    const r = rails.current;
    const p = posts.current;
    const f = reflectors.current;
    if (r === null || p === null || f === null) return;
    const carZ = worldZ(frame.distance);
    r.position.z = carZ - LENGTH / 2 + 30;
    let nf = 0;
    for (let i = 0; i < count; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const k = Math.floor(i / 2);
      const z = recycledZ(k * RAIL_POST_SPACING, carZ, POST_SPAN, 20);
      m4.compose(
        pos.set(side * (RAIL_X + 0.12), POST_HEIGHT / 2, z),
        IDENTITY,
        scl.set(0.12, POST_HEIGHT, 0.12),
      );
      p.setMatrixAt(i, m4);
      if (k % REFLECTOR_EVERY === 0) {
        m4.compose(
          pos.set(side * (RAIL_X - 0.02), RAIL_Y + 0.34, z + 0.07),
          IDENTITY,
          scl.set(0.1, 0.12, 0.03),
        );
        f.setMatrixAt(nf++, m4);
      }
    }
    f.count = nf;
    p.instanceMatrix.needsUpdate = true;
    f.instanceMatrix.needsUpdate = true;
  });

  const steel = { color: "#6a6779", roughness: 0.38, metalness: 0.55 };
  return (
    <>
      <group ref={rails}>
        <mesh geometry={beam} position={[-RAIL_X, RAIL_Y, 0]} rotation-y={Math.PI}>
          <meshStandardMaterial {...steel} emissive={NEON.pink} emissiveIntensity={0.035} />
        </mesh>
        <mesh geometry={beam} position={[RAIL_X, RAIL_Y, 0]}>
          <meshStandardMaterial {...steel} emissive={NEON.cyan} emissiveIntensity={0.03} />
        </mesh>
      </group>
      <instancedMesh ref={posts} args={[undefined, undefined, count]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#2a2735" roughness={0.6} metalness={0.4} />
      </instancedMesh>
      <instancedMesh
        ref={reflectors}
        args={[undefined, undefined, reflectorCount]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color={REFLECTOR} toneMapped={false} />
      </instancedMesh>
    </>
  );
}

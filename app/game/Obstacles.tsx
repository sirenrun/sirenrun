"use client";

import { useFrame } from "@react-three/fiber";
import { LANES, ROW_GAP, rowHash } from "@sirenrun/sim";
import { useMemo, useRef } from "react";
import { Color, Matrix4, Quaternion, Vector3, type InstancedMesh } from "three";
import { Course } from "./course";
import { frame } from "./frame";
import { laneX, rowZ } from "./world";

/** Rows drawn behind and ahead of the car. Ahead reaches into the fog. */
const BEHIND = 2;
const AHEAD = 16;
const MAX = (BEHIND + AHEAD) * LANES;

/** Cosmetic obstacle kinds; the program only knows "blocked". Picked from spare hash bits. */
const KINDS = [
  { size: [1.7, 1.1, 3.6], color: "#2d2a44" }, // traffic car
  { size: [1.7, 1.1, 3.6], color: "#3a2440" }, // traffic car, other paint
  { size: [2.2, 0.9, 0.5], color: "#ffb020" }, // roadblock
  { size: [2.0, 0.14, 0.9], color: "#8c86a6" }, // spike strip
] as const;

const matrix = new Matrix4();
const position = new Vector3();
const scale = new Vector3();
const rotation = new Quaternion();
const color = new Color();

export function Obstacles() {
  const mesh = useRef<InstancedMesh>(null);
  const state = useRef<{ course: Course | null; first: number }>({ course: null, first: -1 });
  const colors = useMemo(() => KINDS.map((k) => new Color(k.color)), []);

  useFrame(() => {
    const instances = mesh.current;
    if (instances === null) return;
    if (!frame.ready || !frame.seedReady) {
      instances.count = 0;
      state.current.first = -1;
      return;
    }
    const s = state.current;
    if (s.course === null || s.course.seed !== frame.seed) {
      s.course = new Course(frame.seed);
      s.first = -1;
    }
    const first = Math.max(0, Math.floor(frame.distance / ROW_GAP) - BEHIND);
    if (first === s.first) return; // rows are static in the world; rebuild only when the window moves
    s.first = first;

    let count = 0;
    for (let row = first; row < first + BEHIND + AHEAD; row += 1) {
      const blocked = s.course.row(row).blocked;
      const hash = rowHash(frame.seed, row);
      for (let lane = 0; lane < LANES; lane += 1) {
        if (!blocked[lane]) continue;
        const kindIndex = Number((hash >> BigInt(48 + lane * 2)) & 3n);
        const kind = KINDS[kindIndex] ?? KINDS[0];
        position.set(laneX(lane), kind.size[1] / 2, rowZ(row));
        scale.set(kind.size[0], kind.size[1], kind.size[2]);
        matrix.compose(position, rotation, scale);
        instances.setMatrixAt(count, matrix);
        instances.setColorAt(count, color.copy(colors[kindIndex] ?? (colors[0] as Color)));
        count += 1;
      }
    }
    instances.count = count;
    instances.instanceMatrix.needsUpdate = true;
    if (instances.instanceColor !== null) instances.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MAX]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.55} metalness={0.25} />
    </instancedMesh>
  );
}

"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  Euler,
  Matrix4,
  NearestFilter,
  Quaternion,
  RepeatWrapping,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  type InstancedMesh,
  type Mesh,
} from "three";
import { frame } from "./frame";
import { glowTexture } from "./glow";
import { FOG_FAR, FOG_NEAR, NEON } from "./palette";
import { recycledZ } from "./recycle";
import { ROAD_HALF, worldZ } from "./world";

/** Streetlights repeat every 24 m on both edges; the road shader draws their light pools. */
export const LAMP_SPACING = 24;
const LAMPS_PER_SIDE = 17;
const LAMP_SPAN = LAMP_SPACING * LAMPS_PER_SIDE;
const POLE_X = ROAD_HALF + 1.4;
const POLE_HEIGHT = 7;
/** Lamp heads hang over the outer lanes on arms; the road mirrors them from here. */
export const LAMP_HEAD_X = POLE_X - 2.1;

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
          x: ROAD_HALF + 4 + r(2) * 7,
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

/** Lit-window texture for the towers: a grid with a random mix of warm, pink and dark windows. */
function windowTexture(): CanvasTexture {
  const w = 64;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx !== null) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    for (let y = 2; y < h; y += 6) {
      for (let x = 2; x < w; x += 5) {
        const r = Math.random();
        if (r < 0.55) continue;
        ctx.fillStyle = r < 0.8 ? "#ffcf8a" : r < 0.92 ? "#ff5fa8" : "#5fe6ff";
        ctx.globalAlpha = 0.5 + Math.random() * 0.5;
        ctx.fillRect(x, y, 3, 3);
      }
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.magFilter = NearestFilter;
  return tex;
}

const TOWERS = 60;
const TOWER_SPAN = (TOWERS / 2) * 16;

/** Distant towers on both shores with lit windows, recycled along the road. */
function Skyline() {
  const mesh = useRef<InstancedMesh>(null);
  const windows = useMemo(() => windowTexture(), []);
  const layout = useMemo(
    () =>
      Array.from({ length: TOWERS }, (_, i) => {
        const r = (n: number) => {
          const v = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
          return v - Math.floor(v);
        };
        return {
          side: i % 2 === 0 ? -1 : 1,
          offset: Math.floor(i / 2) * 16 + r(1) * 6,
          height: 18 + r(2) * r(2) * 70,
          width: 7 + r(3) * 9,
          distance: 70 + r(4) * 80,
        };
      }),
    [],
  );

  useFrame(() => {
    const m = mesh.current;
    if (m === null) return;
    const carZ = worldZ(frame.distance);
    layout.forEach((b, i) => {
      const z = recycledZ(b.offset, carZ, TOWER_SPAN, 30);
      m4.compose(
        pos.set(b.side * b.distance, b.height / 2 - 1, z),
        IDENTITY,
        scl.set(b.width, b.height, b.width),
      );
      m.setMatrixAt(i, m4);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, TOWERS]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={NEON.building}
        emissive="#ffffff"
        emissiveMap={windows}
        emissiveIntensity={0.9}
        roughness={0.9}
      />
    </instancedMesh>
  );
}

/** Dark bay water with the sun's reflection as a glittering column down the middle. */
function Water() {
  const mesh = useRef<Mesh>(null);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: /* glsl */ `
          varying vec3 vWorld;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vWorld = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uWater;
          uniform vec3 uSun;
          uniform vec3 uHorizon;
          uniform vec3 uFog;
          uniform vec3 uCamera;
          uniform float uTime;
          uniform float uNear;
          uniform float uFar;
          varying vec3 vWorld;
          void main() {
            float depth = distance(vWorld, uCamera);
            vec3 c = mix(uWater, uHorizon * 0.5, smoothstep(30.0, 250.0, depth));
            // Sun glitter: a column toward -z around the camera's x, broken by ripples.
            float lateral = abs(vWorld.x - uCamera.x) / max(8.0, depth * 0.12);
            float ripple = step(0.62, fract(sin(floor(vWorld.z * 1.6 - uTime * 3.0) * 12.9898 + floor(vWorld.x * 0.8) * 78.233) * 43758.5453));
            c += uSun * ripple * exp(-lateral * lateral * 3.0) * smoothstep(20.0, 120.0, depth) * 0.9;
            float fog = smoothstep(uNear, uFar, depth);
            gl_FragColor = vec4(mix(c, uFog, fog * 0.6), 1.0);
            // Colours here are tuned as display colours; hand three.js linear light so tone mapping,
            // bloom and the final sRGB conversion treat this surface like every other material.
            gl_FragColor = sRGBTransferEOTF(gl_FragColor);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
        uniforms: {
          uWater: { value: new Color(NEON.water) },
          uSun: { value: new Color(NEON.sunTop) },
          uHorizon: { value: new Color(NEON.skyHorizon) },
          uFog: { value: new Color(NEON.fog) },
          uCamera: { value: null },
          uTime: { value: 0 },
          uNear: { value: FOG_NEAR },
          uFar: { value: FOG_FAR + 60 },
        },
      }),
    [],
  );

  useFrame((state, delta) => {
    const m = mesh.current;
    if (m === null) return;
    m.position.z = worldZ(frame.distance) - 140;
    ((m.material as ShaderMaterial).uniforms.uCamera as { value: unknown }).value =
      state.camera.position;
    ((m.material as ShaderMaterial).uniforms.uTime as { value: number }).value += delta;
  });

  return (
    <mesh ref={mesh} rotation-x={-Math.PI / 2} position={[0, -0.8, 0]} material={material}>
      <planeGeometry args={[700, 560]} />
    </mesh>
  );
}

/** Everything beside the road. */
export function Roadside() {
  return (
    <>
      <Water />
      <Skyline />
      <Palms />
      <Streetlights />
    </>
  );
}

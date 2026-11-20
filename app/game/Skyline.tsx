"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  CanvasTexture,
  Color,
  Matrix4,
  MeshStandardMaterial,
  NearestFilter,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type InstancedMesh,
  type MeshBasicMaterial,
} from "three";
import { frame } from "./frame";
import { hot, NEON } from "./palette";
import { recycledZ } from "./recycle";
import {
  LAYER_ORDER,
  LAYERS,
  layerSpan,
  prng,
  skylineLayout,
  type Building,
  type LayerName,
} from "./skyline";
import { worldZ } from "./world";

/** One window texture tile covers this much facade (12 x 21 windows, about 3 x 3.5 m each). */
const TILE_W = 36;
const TILE_H = 73;
/** How far behind the car each layer keeps its buildings before recycling them ahead. */
const BEHIND: Record<LayerName, number> = { near: 40, mid: 30, far: 80 };
/** Window glow per layer: the far city is mostly haze. */
const WINDOWS: Record<LayerName, number> = { near: 1.1, mid: 0.9, far: 0.3 };
const SIGN_PALETTE = [hot(NEON.pink, 3), hot(NEON.cyan, 3), hot(NEON.amber, 2.4)];
const BEACON_ON = hot(NEON.red, 5);
const BEACON_OFF = new Color(NEON.red).multiplyScalar(0.12);

const m4 = new Matrix4();
const pos = new Vector3();
const scl = new Vector3();
const IDENTITY = new Quaternion();

/** Lit windows: a grid with a mix of warm, pink and dark windows, the same on every load. */
function windowTexture(): CanvasTexture {
  const w = 64;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const r = prng(0xc17);
  if (ctx !== null) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    for (let y = 2; y < h; y += 6) {
      for (let x = 2; x < w; x += 5) {
        const v = r();
        if (v < 0.55) continue;
        ctx.fillStyle = v < 0.8 ? "#ffcf8a" : v < 0.92 ? "#ff5fa8" : "#5fe6ff";
        ctx.globalAlpha = 0.5 + r() * 0.5;
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

/**
 * Building material whose windows keep one real-world size on every facade: the window UVs are
 * scaled by each instance's size in the vertex shader, and shifted by its position so
 * neighbours do not show the same pattern.
 */
function buildingMaterial(windows: CanvasTexture, glow: number): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: NEON.building,
    emissive: "#ffffff",
    emissiveMap: windows,
    emissiveIntensity: glow,
    roughness: 0.9,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <uv_vertex>",
      /* glsl */ `#include <uv_vertex>
      #if defined( USE_INSTANCING ) && defined( USE_EMISSIVEMAP )
        vec3 size = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        float across = abs(normal.x) > 0.5 ? size.z : size.x;
        vEmissiveMapUv = vEmissiveMapUv * vec2(across / ${TILE_W.toFixed(1)}, size.y / ${TILE_H.toFixed(1)})
          + fract(instanceMatrix[3].xz * 0.0137);
      #endif`,
    );
  };
  return material;
}

/** Where a building stands this frame. */
function place(b: Building, carZ: number) {
  const layer = LAYERS[b.layer];
  return {
    x: b.side * b.x,
    z: recycledZ(b.offset, carZ, layerSpan(layer), BEHIND[b.layer]),
  };
}

/**
 * The city on both shores in three layers: low waterfront hotels with neon signs, towers with
 * neon crowns and aircraft beacons, and tall silhouettes fading into the haze behind them.
 */
export function Skyline() {
  const city = useMemo(() => skylineLayout(), []);
  const byLayer = useMemo(
    () => Object.fromEntries(LAYER_ORDER.map((l) => [l, city.filter((b) => b.layer === l)])),
    [city],
  ) as Record<LayerName, Building[]>;
  const signed = useMemo(() => city.filter((b) => b.sign >= 0), [city]);
  const beacons = useMemo(() => city.filter((b) => b.beacon), [city]);
  const materials = useMemo(() => {
    const windows = windowTexture();
    return Object.fromEntries(
      LAYER_ORDER.map((l) => [l, buildingMaterial(windows, WINDOWS[l])]),
    ) as Record<LayerName, MeshStandardMaterial>;
  }, []);

  const blocks = useRef<Partial<Record<LayerName, InstancedMesh | null>>>({});
  const signs = useRef<InstancedMesh>(null);
  const lights = useRef<InstancedMesh>(null);
  const beaconMaterial = useRef<MeshBasicMaterial>(null);

  useFrame(() => {
    const carZ = worldZ(frame.distance);
    for (const name of LAYER_ORDER) {
      const mesh = blocks.current[name];
      if (mesh == null) continue;
      byLayer[name].forEach((b, i) => {
        const { x, z } = place(b, carZ);
        m4.compose(pos.set(x, b.height / 2 - 1, z), IDENTITY, scl.set(b.width, b.height, b.depth));
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }

    const s = signs.current;
    if (s !== null) {
      signed.forEach((b, i) => {
        const { x, z } = place(b, carZ);
        if (b.layer === "near") {
          // A lit strip along the top of the facade that faces the road.
          const face = x - b.side * (b.width / 2 + 0.12);
          m4.compose(pos.set(face, b.height - 1.6, z), IDENTITY, scl.set(0.2, 1.1, b.depth * 0.75));
        } else {
          // A neon crown around the top of the tower.
          m4.compose(
            pos.set(x, b.height - 1.6, z),
            IDENTITY,
            scl.set(b.width * 1.03, 0.6, b.depth * 1.03),
          );
        }
        s.setMatrixAt(i, m4);
        s.setColorAt(i, SIGN_PALETTE[b.sign] ?? (SIGN_PALETTE[0] as Color));
      });
      s.instanceMatrix.needsUpdate = true;
      if (s.instanceColor !== null) s.instanceColor.needsUpdate = true;
    }

    const l = lights.current;
    if (l !== null) {
      beacons.forEach((b, i) => {
        const { x, z } = place(b, carZ);
        m4.compose(pos.set(x, b.height - 0.6, z), IDENTITY, scl.set(0.7, 0.7, 0.7));
        l.setMatrixAt(i, m4);
      });
      l.instanceMatrix.needsUpdate = true;
    }
    // Aircraft beacons: a short flash every 1.6 s.
    const bm = beaconMaterial.current;
    if (bm !== null) bm.color.copy((frame.time % 1.6) / 1.6 < 0.18 ? BEACON_ON : BEACON_OFF);
  });

  return (
    <>
      {LAYER_ORDER.map((name) => (
        <instancedMesh
          key={name}
          ref={(m) => void (blocks.current[name] = m)}
          args={[undefined, materials[name], byLayer[name].length]}
          frustumCulled={false}
        >
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
      ))}
      <instancedMesh ref={signs} args={[undefined, undefined, signed.length]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={lights}
        args={[undefined, undefined, beacons.length]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial ref={beaconMaterial} color={BEACON_OFF} toneMapped={false} />
      </instancedMesh>
    </>
  );
}

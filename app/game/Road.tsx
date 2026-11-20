"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color, ShaderMaterial, type Mesh } from "three";
import { frame } from "./frame";
import { LANE_W, ROAD_HALF, worldZ } from "./world";

const LENGTH = 260;
const SHOULDER = 1.4;

/**
 * One plane that travels with the car. Lane markings are computed from world z in the
 * shader, so the road looks infinite with no tiles to recycle.
 */
const vertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragment = /* glsl */ `
  uniform float uHalf;
  uniform float uLane;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec3 vWorld;

  float band(float d, float w) { return 1.0 - smoothstep(w * 0.5, w * 0.5 + fwidth(d) * 1.5, abs(d)); }

  void main() {
    float x = vWorld.x;
    float z = vWorld.z;
    vec3 asphalt = vec3(0.078, 0.071, 0.122);
    // Faint lengthwise grain so speed reads even between obstacles.
    float grain = fract(sin(floor(z * 1.7) * 91.7 + floor(x * 3.0) * 13.1) * 4375.5);
    vec3 color = asphalt + (grain - 0.5) * 0.012;

    float onRoad = step(abs(x), uHalf);
    // Dashed lane dividers: 3 m on, 3 m off.
    float dash = step(0.5, fract(z / 6.0));
    float lanes = 0.0;
    for (int i = 1; i < 5; i++) {
      float lx = -uHalf + float(i) * uLane;
      lanes = max(lanes, band(x - lx, 0.12) * dash);
    }
    color = mix(color, vec3(0.231, 0.212, 0.329) * 1.6, lanes * onRoad);

    // Neon edge lines: pink on the left, cyan on the right.
    float left = band(x + uHalf, 0.16);
    float right = band(x - uHalf, 0.16);
    color = mix(color, vec3(1.0, 0.18, 0.53), left);
    color = mix(color, vec3(0.13, 0.88, 1.0), right);

    // Shoulders fade to the water.
    color = mix(color, vec3(0.03, 0.025, 0.06), (1.0 - onRoad) * (1.0 - max(left, right)));

    float depth = gl_FragCoord.z / gl_FragCoord.w;
    float fog = smoothstep(uFogNear, uFogFar, depth);
    gl_FragColor = vec4(mix(color, uFogColor, fog), 1.0);
  }
`;

export function Road({ fog }: { fog: { color: string; near: number; far: number } }) {
  const mesh = useRef<Mesh>(null);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          uHalf: { value: ROAD_HALF },
          uLane: { value: LANE_W },
          uFogColor: { value: new Color(fog.color) },
          uFogNear: { value: fog.near },
          uFogFar: { value: fog.far },
        },
      }),
    [fog.color, fog.near, fog.far],
  );

  useFrame(() => {
    if (mesh.current === null) return;
    mesh.current.position.z = worldZ(frame.distance) - LENGTH / 2 + 30;
  });

  return (
    <mesh ref={mesh} rotation-x={-Math.PI / 2} material={material}>
      <planeGeometry args={[ROAD_HALF * 2 + SHOULDER * 2, LENGTH]} />
    </mesh>
  );
}

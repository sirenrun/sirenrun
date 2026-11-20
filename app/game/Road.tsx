"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color, ShaderMaterial, type Mesh } from "three";
import { frame } from "./frame";
import { FOG_FAR, FOG_NEAR, NEON } from "./palette";
import { LAMP_SPACING } from "./Roadside";
import { LANE_W, ROAD_HALF, worldZ } from "./world";

const LENGTH = 460;
const SHOULDER = 2.2;

/**
 * One plane that travels with the car; everything on it comes from world position in the
 * shader, so the road is endless with nothing to recycle. Wet asphalt reflects the sunset more
 * with distance, each streetlight leaves a warm pool, and the neon edges bleed onto the wet road.
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
  uniform float uLampSpacing;
  uniform vec3 uAsphalt;
  uniform vec3 uLine;
  uniform vec3 uPink;
  uniform vec3 uCyan;
  uniform vec3 uLamp;
  uniform vec3 uReflect;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec3 uCamera;
  varying vec3 vWorld;

  float band(float d, float w) { return 1.0 - smoothstep(w * 0.5, w * 0.5 + fwidth(d) * 1.5, abs(d)); }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

  void main() {
    float x = vWorld.x;
    float z = vWorld.z;
    float depth = distance(vWorld, uCamera);
    float onRoad = step(abs(x), uHalf);

    // Asphalt with coarse grain so speed reads between obstacles.
    vec3 color = uAsphalt * (0.9 + 0.2 * hash(floor(vec2(x * 2.0, z * 1.2))));

    // Wet surface: reflects the sunset more as the angle flattens toward the horizon.
    float wet = smoothstep(8.0, 140.0, depth);
    color = mix(color, uReflect, wet * 0.55 * onRoad);

    // Warm pools under the streetlights on both edges.
    float lampZ = (fract(z / uLampSpacing + 0.5) - 0.5) * uLampSpacing;
    float edge = min(abs(x - uHalf), abs(x + uHalf));
    float pool = exp(-(lampZ * lampZ) / 18.0) * exp(-(edge * edge) / 9.0);
    color += uLamp * pool * 0.5;

    // Lane dividers: 3 m dashes, bright enough to read at speed.
    float dash = step(0.45, fract(z / 6.0));
    float lanes = 0.0;
    for (int i = 1; i < 5; i++) {
      float lx = -uHalf + float(i) * uLane;
      lanes = max(lanes, band(x - lx, 0.14) * dash);
    }
    color = mix(color, uLine, lanes * onRoad * 0.85);

    // Neon edges, with a soft bleed onto the wet asphalt.
    float left = band(x + uHalf, 0.18);
    float right = band(x - uHalf, 0.18);
    color = mix(color, uPink * 1.6, left);
    color = mix(color, uCyan * 1.6, right);
    color += uPink * 0.35 * exp(-abs(x + uHalf) * 1.6) * onRoad;
    color += uCyan * 0.35 * exp(-abs(x - uHalf) * 1.6) * onRoad;

    // Shoulders: dark kerb beyond the neon.
    color = mix(color, uAsphalt * 0.45, (1.0 - onRoad) * (1.0 - max(left, right)));

    float fog = smoothstep(uFogNear, uFogFar, depth);
    gl_FragColor = vec4(mix(color, uFogColor, fog), 1.0);
  }
`;

export function Road() {
  const mesh = useRef<Mesh>(null);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          uHalf: { value: ROAD_HALF },
          uLane: { value: LANE_W },
          uLampSpacing: { value: LAMP_SPACING },
          uAsphalt: { value: new Color(NEON.asphalt) },
          uLine: { value: new Color(NEON.laneLine) },
          uPink: { value: new Color(NEON.pink) },
          uCyan: { value: new Color(NEON.cyan) },
          uLamp: { value: new Color(NEON.lamp) },
          uReflect: { value: new Color(NEON.skyHorizon).multiplyScalar(0.45) },
          uFogColor: { value: new Color(NEON.fog) },
          uFogNear: { value: FOG_NEAR },
          uFogFar: { value: FOG_FAR },
          uCamera: { value: null },
        },
      }),
    [],
  );

  useFrame((state) => {
    const m = mesh.current;
    if (m === null) return;
    m.position.z = worldZ(frame.distance) - LENGTH / 2 + 30;
    ((m.material as ShaderMaterial).uniforms.uCamera as { value: unknown }).value =
      state.camera.position;
  });

  return (
    <mesh ref={mesh} rotation-x={-Math.PI / 2} material={material}>
      <planeGeometry args={[ROAD_HALF * 2 + SHOULDER * 2, LENGTH]} />
    </mesh>
  );
}

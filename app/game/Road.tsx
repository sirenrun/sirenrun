"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color, ShaderMaterial, Vector4, type Mesh } from "three";
import { frame } from "./frame";
import { policeLights, reflections } from "./lights";
import { FOG_FAR, FOG_NEAR, hot, NEON } from "./palette";
import { LAMP_HEAD_X, LAMP_SPACING } from "./layout";
import { LANE_W, ROAD_HALF, worldZ } from "./world";

const LENGTH = 460;
const SHOULDER = 2.2;

/** A palette colour as the sRGB values the UI shows, for shaders that work in display space. */
const displayColor = (hex: string) => new Color().setStyle(hex, "srgb-linear");

/** The two tail lights and the two police lamps sit this far either side of centre (m). */
const TAIL_SPREAD = 0.62;
const POLICE_SPREAD = 0.31;

/**
 * One plane that travels with the car; everything on it comes from world position in the
 * shader, so the road is endless with nothing to recycle. Wet asphalt reflects the sunset more
 * with distance, each streetlight leaves a warm pool, and the neon edges bleed onto the wet road.
 *
 * Reflections are faked, not rendered: a rough wet road smears each light into a streak that
 * runs from under the light toward the viewer, so the shader draws those streaks directly for
 * the sun, the streetlights, the player's tail lights and the police bar. A real mirror pass
 * would render the scene twice for much the same picture.
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
  uniform float uLampX;
  uniform vec3 uSun;
  uniform vec3 uTailColor;
  uniform vec4 uTail;
  uniform vec4 uPolice;
  uniform vec3 uPoliceRed;
  uniform vec3 uPoliceBlue;
  uniform float uTailSpread;
  uniform float uPoliceSpread;
  varying vec3 vWorld;

  float band(float d, float w) { return 1.0 - smoothstep(w * 0.5, w * 0.5 + fwidth(d) * 1.5, abs(d)); }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

  // A light standing at road position (light.x, light.y = z), smeared toward the camera: it
  // starts under the light, bends toward the viewer's line and fades over len metres.
  float streak(vec2 p, vec2 light, float len, float width) {
    float span = uCamera.z - light.y;
    float dz = p.y - light.y;
    float t = clamp(dz / max(span, 0.001), 0.0, 1.0);
    float cx = mix(light.x, uCamera.x, t);
    float w = width * (1.0 + dz * 0.025);
    float dx = (p.x - cx) / w;
    return exp(-dx * dx) * exp(-max(dz, 0.0) / len) * step(0.0, dz) * step(0.0, span);
  }

  void main() {
    float x = vWorld.x;
    float z = vWorld.z;
    float depth = distance(vWorld, uCamera);
    float onRoad = step(abs(x), uHalf);

    // Asphalt with coarse grain so speed reads between obstacles.
    vec3 color = uAsphalt * (0.9 + 0.2 * hash(floor(vec2(x * 2.0, z * 1.2))));

    // Wet surface: reflects the sunset more as the angle flattens toward the horizon.
    float wet = smoothstep(8.0, 140.0, depth);
    // Kept low: a strong pink sheen hides the lane lines and the cars ahead.
    color = mix(color, uReflect, wet * 0.3 * onRoad);

    // Warm pools under the streetlights on both edges.
    float lampZ = (fract(z / uLampSpacing + 0.5) - 0.5) * uLampSpacing;
    float edge = min(abs(x - uHalf), abs(x + uHalf));
    float pool = exp(-(lampZ * lampZ) / 18.0) * exp(-(edge * edge) / 9.0);
    color += uLamp * pool * 0.5;

    // Mirrored lights. The sun lays a broken column straight down the road.
    vec2 p = vec2(x, z);
    float across = (x - uCamera.x) / (0.35 + depth * 0.011);
    float shimmer = 0.6 + 0.4 * sin(z * 0.8 + hash(vec2(floor(z * 0.4), 3.0)) * 6.28);
    color += uSun * exp(-across * across) * smoothstep(12.0, 160.0, depth) * shimmer * 0.22 * onRoad;
    // Each streetlight (both edges, the next two ahead of this point) smears toward the camera.
    float lamps = 0.0;
    for (int k = 0; k < 2; k++) {
      float lz = (floor(z / uLampSpacing) - float(k)) * uLampSpacing;
      lamps += streak(p, vec2(-uLampX, lz), 7.0, 0.2);
      lamps += streak(p, vec2(uLampX, lz), 7.0, 0.2);
    }
    color += uLamp * lamps * 0.6 * onRoad;
    // The player's tail lights and the lead cruiser's flashing bar.
    float tails = streak(p, vec2(uTail.x - uTailSpread, uTail.y), 5.0, 0.28)
      + streak(p, vec2(uTail.x + uTailSpread, uTail.y), 5.0, 0.28);
    color += uTailColor * tails * uTail.z * onRoad;
    float red = streak(p, vec2(uPolice.x - uPoliceSpread, uPolice.y), 7.0, 0.45);
    float blue = streak(p, vec2(uPolice.x + uPoliceSpread, uPolice.y), 7.0, 0.45);
    color += (uPoliceRed * red * uPolice.w + uPoliceBlue * blue * (1.0 - uPolice.w)) * uPolice.z * onRoad;

    // Lane dividers: 3 m dashes, bright enough to read at speed.
    float dash = step(0.45, fract(z / 6.0));
    float lanes = 0.0;
    for (int i = 1; i < 5; i++) {
      float lx = -uHalf + float(i) * uLane;
      lanes = max(lanes, band(x - lx, 0.18) * dash);
    }
    color = mix(color, uLine, lanes * onRoad * 0.95);

    // Neon edges, with a soft bleed onto the wet asphalt.
    float left = band(x + uHalf, 0.18);
    float right = band(x - uHalf, 0.18);
    // Bright enough to bloom, not so bright that tone mapping turns the pink red.
    color = mix(color, uPink * 1.12, left);
    color = mix(color, uCyan * 1.12, right);
    color += uPink * 0.35 * exp(-abs(x + uHalf) * 1.6) * onRoad;
    color += uCyan * 0.35 * exp(-abs(x - uHalf) * 1.6) * onRoad;

    // Shoulders: dark kerb beyond the neon.
    color = mix(color, uAsphalt * 0.3, (1.0 - onRoad) * (1.0 - max(left, right)));

    float fog = smoothstep(uFogNear, uFogFar, depth);
    gl_FragColor = vec4(mix(color, uFogColor, fog), 1.0);
    // Colours here are tuned as display colours; hand three.js linear light so tone mapping,
    // bloom and the final sRGB conversion treat this surface like every other material.
    gl_FragColor = sRGBTransferEOTF(gl_FragColor);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
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
          // The shader works in display colours; the brand edges must match the UI exactly.
          uPink: { value: displayColor(NEON.pink) },
          uCyan: { value: displayColor(NEON.cyan) },
          uLamp: { value: new Color(NEON.lamp) },
          uReflect: { value: new Color(NEON.skyHorizon).multiplyScalar(0.45) },
          uFogColor: { value: new Color(NEON.fog) },
          uFogNear: { value: FOG_NEAR },
          uFogFar: { value: FOG_FAR },
          uCamera: { value: null },
          uLampX: { value: LAMP_HEAD_X },
          uSun: { value: new Color(NEON.sunBottom).lerp(new Color(NEON.skyGlow), 0.5) },
          uTailColor: { value: hot(NEON.red, 1.1) },
          uTail: { value: new Vector4() },
          uPolice: { value: new Vector4() },
          uPoliceRed: { value: hot(NEON.policeRed, 1.3) },
          uPoliceBlue: { value: hot(NEON.policeBlue, 1.6) },
          uTailSpread: { value: TAIL_SPREAD },
          uPoliceSpread: { value: POLICE_SPREAD },
        },
      }),
    [],
  );

  useFrame((state) => {
    const m = mesh.current;
    if (m === null) return;
    m.position.z = worldZ(frame.distance) - LENGTH / 2 + 30;
    const u = (m.material as ShaderMaterial).uniforms;
    (u.uCamera as { value: unknown }).value = state.camera.position;
    const r = reflections(frame, policeLights);
    (u.uTail as { value: Vector4 }).value.set(r.tail.x, r.tail.z, r.tail.on, 0);
    (u.uPolice as { value: Vector4 }).value.set(
      r.police.x,
      r.police.z,
      r.police.strength,
      r.police.red,
    );
  });

  return (
    <mesh ref={mesh} rotation-x={-Math.PI / 2} material={material}>
      <planeGeometry args={[ROAD_HALF * 2 + SHOULDER * 2, LENGTH]} />
    </mesh>
  );
}

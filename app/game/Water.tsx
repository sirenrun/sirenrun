"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color, ShaderMaterial, Vector3, type Mesh } from "three";
import { frame } from "./frame";
import { FOG_FAR, FOG_NEAR, NEON } from "./palette";
import { LAYERS } from "./skyline";
import { worldZ } from "./world";

const vertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

/**
 * The bay. Rippled normals mirror the sunset sky (more at grazing angles), the sun glitters
 * off the ripples, and the towers lay broken coloured streaks across the water toward the
 * viewer. Like the road, colours are worked out as display colours and converted at the end.
 */
const fragment = /* glsl */ `
  uniform vec3 uWater;
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  uniform vec3 uSun;
  uniform vec3 uFog;
  uniform vec3 uCamera;
  uniform vec3 uCityA;
  uniform vec3 uCityB;
  uniform vec3 uCityC;
  uniform float uCityX;
  uniform float uCitySpacing;
  uniform float uTime;
  uniform float uNear;
  uniform float uFar;
  varying vec3 vWorld;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    vec3 toP = vWorld - uCamera;
    float depth = length(toP);
    vec3 view = toP / depth;
    vec2 q = vWorld.xz;

    // Two scrolling ripple octaves; flatter far away so the horizon stays calm.
    float a = noise(q * 0.22 + vec2(0.0, uTime * 0.35));
    float b = noise(q * 0.9 - vec2(uTime * 0.5, uTime * 0.2));
    float calm = 1.0 - smoothstep(60.0, 320.0, depth) * 0.7;
    vec3 n = normalize(vec3((a - 0.5) * 0.07 + (b - 0.5) * 0.04, 1.0, (b - 0.5) * 0.06) * vec3(calm, 1.0, calm));
    vec3 r = reflect(view, n);

    // Mirror of the sky gradient (the same bands as Sky.tsx), strongest at grazing angles.
    float h = r.y;
    vec3 sky = mix(uMid, uTop, smoothstep(0.08, 0.55, h));
    sky = mix(uHorizon, sky, smoothstep(0.0, 0.16, h));
    sky = mix(uGlow, sky, smoothstep(-0.01, 0.05, h));
    float fresnel = pow(1.0 - clamp(dot(-view, n), 0.0, 1.0), 5.0);
    // The glow sits toward the sun; to the sides the bay stays dark so the city lights read.
    float sunward = mix(0.15, 1.0, pow(max(-r.z, 0.0), 6.0));
    vec3 c = mix(uWater, sky * 0.5, clamp(fresnel * sunward, 0.0, 0.7));

    // Sun glitter: ripples that tilt the sun's reflection into the eye.
    vec3 sunDir = normalize(vec3(0.0, 0.055, -1.0));
    float glint = pow(max(dot(r, sunDir), 0.0), 900.0) * 2.4 + pow(max(dot(r, sunDir), 0.0), 60.0) * 0.25;
    c += uSun * glint;

    // City lights: follow the line from the eye through this point out to the tower line and
    // light it if a lit building stands there. Anchored to the tower spacing, so the streaks
    // stay put in the world as the camera moves and only the ripples break them up.
    float side = sign(vWorld.x);
    float toLine = side * uCityX - uCamera.x;
    float across = vWorld.x - uCamera.x;
    float reach = toLine / (abs(across) < 0.01 ? 0.01 : across);
    float zb = uCamera.z + (vWorld.z - uCamera.z) * reach + (a - 0.5) * 6.0;
    float id = floor(zb / uCitySpacing);
    float within = fract(zb / uCitySpacing);
    float column = smoothstep(0.08, 0.2, within) * smoothstep(0.85, 0.6, within);
    float lit = step(0.4, hash(vec2(id, side)));
    float pick = hash(vec2(id, side + 5.0));
    vec3 tint = pick < 0.55 ? uCityA : (pick < 0.8 ? uCityB : uCityC);
    float dashes = smoothstep(0.35, 0.65, noise(vec2(abs(vWorld.x) * 0.7, id * 3.1) + vec2(uTime * 0.6, 0.0)));
    float shore = smoothstep(14.0, uCityX * 0.85, abs(vWorld.x)) * step(abs(vWorld.x), uCityX) * step(0.0, reach - 1.0);
    c += tint * column * lit * dashes * shore * (0.3 + fresnel) * 0.7;

    float fog = smoothstep(uNear, uFar, depth);
    gl_FragColor = vec4(mix(c, uFog, fog * 0.6), 1.0);
    // Display colours to linear light, then the same tone mapping and output as every material.
    gl_FragColor = sRGBTransferEOTF(gl_FragColor);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Plane size: wide enough to reach past the far skyline on both shores. */
const WIDTH = 700;
const LENGTH = 560;

export function Water() {
  const mesh = useRef<Mesh>(null);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          uWater: { value: new Color(NEON.water) },
          uTop: { value: new Color(NEON.skyTop) },
          uMid: { value: new Color(NEON.skyMid) },
          uHorizon: { value: new Color(NEON.skyHorizon) },
          uGlow: { value: new Color(NEON.skyGlow) },
          uSun: { value: new Color(NEON.sunTop) },
          uFog: { value: new Color(NEON.fog) },
          // A real vector from the start: <Preload> may compile this material before the
          // first frame sets the camera, and a null vec3 uniform crashes the upload.
          uCamera: { value: new Vector3() },
          uCityA: { value: new Color("#ffcf8a") },
          uCityB: { value: new Color(NEON.pink) },
          uCityC: { value: new Color(NEON.cyan) },
          uCityX: { value: LAYERS.mid.x[0] },
          uCitySpacing: { value: LAYERS.mid.spacing },
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
    const u = (m.material as ShaderMaterial).uniforms;
    (u.uCamera as { value: unknown }).value = state.camera.position;
    (u.uTime as { value: number }).value += delta;
  });

  return (
    <mesh ref={mesh} rotation-x={-Math.PI / 2} position={[0, -0.8, 0]} material={material}>
      <planeGeometry args={[WIDTH, LENGTH]} />
    </mesh>
  );
}

"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BackSide, Color, ShaderMaterial, type Mesh } from "three";
import { NEON } from "./palette";

/**
 * Sunset sky with a striped retro sun sitting on the horizon straight down the road. The dome
 * follows the camera, so the sun always marks the vanishing point the car is racing toward.
 */
const vertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // always at the far plane
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  uniform vec3 uSunTop;
  uniform vec3 uSunBottom;
  uniform float uTime;
  varying vec3 vDir;

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;

    // Gradient: deep violet overhead, magenta band, hot orange right at the horizon.
    vec3 sky = mix(uMid, uTop, smoothstep(0.08, 0.55, h));
    sky = mix(uHorizon, sky, smoothstep(0.0, 0.16, h));
    sky = mix(uGlow, sky, smoothstep(-0.01, 0.05, h));
    // A few faint high stars.
    float star = step(0.9985, fract(sin(dot(floor(d.xz * 420.0), vec2(12.9898, 78.233))) * 43758.5453));
    sky += star * smoothstep(0.25, 0.6, h) * 0.6;

    // Sun: a disc toward -z, slightly above the horizon, with synthwave stripes in its lower half.
    vec3 sunDir = normalize(vec3(0.0, 0.055, -1.0));
    float ang = acos(clamp(dot(d, sunDir), -1.0, 1.0));
    float radius = 0.16;
    float disc = 1.0 - smoothstep(radius - 0.004, radius, ang);
    float v = (d.y - sunDir.y) / radius; // -1 bottom .. 1 top of the disc
    float band = step(0.0, sin((v + uTime * 0.02) * 38.0) + mix(1.0, -0.9, smoothstep(0.35, -0.9, v)));
    vec3 sun = mix(uSunBottom, uSunTop, smoothstep(-0.9, 0.8, v));
    sky = mix(sky, sun * 1.25, disc * (v > 0.1 ? 1.0 : band));
    // Halo around the sun.
    sky += uSunBottom * 0.35 * exp(-ang * 6.0) * smoothstep(-0.05, 0.02, h);

    // Below the horizon the water covers this; fade to the glow colour to avoid seams.
    sky = mix(uGlow * 0.35, sky, smoothstep(-0.03, 0.0, h));
    gl_FragColor = vec4(sky, 1.0);
    // Colours here are tuned as display colours; hand three.js linear light so tone mapping,
    // bloom and the final sRGB conversion treat this surface like every other material.
    gl_FragColor = sRGBTransferEOTF(gl_FragColor);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function Sky() {
  const mesh = useRef<Mesh>(null);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new Color(NEON.skyTop) },
          uMid: { value: new Color(NEON.skyMid) },
          uHorizon: { value: new Color(NEON.skyHorizon) },
          uGlow: { value: new Color(NEON.skyGlow) },
          uSunTop: { value: new Color(NEON.sunTop) },
          uSunBottom: { value: new Color(NEON.sunBottom) },
          uTime: { value: 0 },
        },
      }),
    [],
  );

  useFrame((state, delta) => {
    const m = mesh.current;
    if (m === null) return;
    m.position.copy(state.camera.position);
    ((m.material as ShaderMaterial).uniforms.uTime as { value: number }).value += delta;
  });

  return (
    <mesh ref={mesh} material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[300, 48, 24]} />
    </mesh>
  );
}

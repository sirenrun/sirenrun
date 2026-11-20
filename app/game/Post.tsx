"use client";

import { useFrame } from "@react-three/fiber";
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import { ToneMappingMode, type ChromaticAberrationEffect } from "postprocessing";
import { useMemo, useRef } from "react";
import { Vector2 } from "three";
import { prefersReducedMotion } from "./controls";
import { frame } from "./frame";

/** Colour split at the peak of a hit, as a share of the screen. */
const HIT_SPLIT = new Vector2(0.007, 0.004);
const HIT_SECONDS = 0.45;

/**
 * Splits the colour channels for a moment when a hit lands, then lets them settle. Skipped under
 * reduced motion. Runs at the default priority so the composer keeps control of rendering.
 */
function useHitAberration() {
  const effect = useRef<ChromaticAberrationEffect>(null);
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const pulse = useRef(0);
  useFrame((_, delta) => {
    const e = effect.current;
    if (e === null) return;
    if (frame.hit && !reduced) pulse.current = 1;
    pulse.current = Math.max(0, pulse.current - delta / HIT_SECONDS);
    const k = pulse.current * pulse.current;
    e.offset.set(HIT_SPLIT.x * k, HIT_SPLIT.y * k);
  });
  return effect;
}

/**
 * Bloom over an HDR frame, then Khronos PBR Neutral tone mapping, which keeps the brand pink
 * and cyan on hue where ACES pushed them toward red and AgX greyed them out. Lights are
 * authored brighter than 1 (see `hot` in palette.ts) so only they cross the bloom threshold.
 */
export function Post() {
  const aberration = useHitAberration();
  return (
    <EffectComposer multisampling={4}>
      {/* A tight radius: lights get halos without a haze over the whole road. */}
      <Bloom
        mipmapBlur
        intensity={0.8}
        radius={0.5}
        levels={6}
        luminanceThreshold={1}
        luminanceSmoothing={0.2}
      />
      <ChromaticAberration
        ref={aberration}
        offset={[0, 0]}
        radialModulation={false}
        modulationOffset={0}
      />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <Vignette offset={0.32} darkness={0.55} />
    </EffectComposer>
  );
}

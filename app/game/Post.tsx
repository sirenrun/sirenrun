"use client";

import { Bloom, EffectComposer, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";

/**
 * Bloom over an HDR frame, then Khronos PBR Neutral tone mapping, which keeps the brand pink
 * and cyan on hue where ACES pushed them toward red and AgX greyed them out. Lights are
 * authored brighter than 1 (see `hot` in palette.ts) so only they cross the bloom threshold.
 */
export function Post() {
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
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <Vignette offset={0.32} darkness={0.55} />
    </EffectComposer>
  );
}

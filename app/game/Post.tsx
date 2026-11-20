"use client";

import { Bloom, EffectComposer, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";

/**
 * Bloom over an HDR frame, then ACES tone mapping (AgX greyed the neon out). Lights are
 * authored brighter than 1 (see `hot` in palette.ts) so only they cross the threshold; the road
 * and bodies stay crisp. The canvas renders `flat` while this runs, and tone maps by itself
 * with the same ACES curve when post is off.
 */
export function Post() {
  return (
    <EffectComposer multisampling={4}>
      <Bloom mipmapBlur intensity={0.85} luminanceThreshold={1} luminanceSmoothing={0.25} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.32} darkness={0.55} />
    </EffectComposer>
  );
}

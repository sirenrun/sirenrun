"use client";

import { useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useEffect } from "react";
import { ACESFilmicToneMapping, NoToneMapping } from "three";

/**
 * Bloom over an HDR frame, then ACES tone mapping (AgX greyed the neon out). Lights are authored brighter than 1
 * (see `hot` in palette.ts) so only they cross the threshold; the road and bodies stay crisp.
 * With post off, the renderer tone maps instead so the same colours still fit the screen.
 */
export function Post({ enabled }: { enabled: boolean }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMapping = enabled ? NoToneMapping : ACESFilmicToneMapping;
  }, [gl, enabled]);

  if (!enabled) return null;
  return (
    <EffectComposer multisampling={4}>
      <Bloom mipmapBlur intensity={0.85} luminanceThreshold={1} luminanceSmoothing={0.25} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.32} darkness={0.55} />
    </EffectComposer>
  );
}

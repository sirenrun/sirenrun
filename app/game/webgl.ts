/**
 * Whether this browser can create a WebGL context right now. Browsers with graphics
 * acceleration turned off, or a blocklisted GPU, report WebGL as present but fail to create a
 * context; trying first avoids a renderer error and lets the page explain what to do.
 */
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (gl === null) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

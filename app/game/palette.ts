/** "Neon Key": an original coastal city at sunset. One place for every scene colour. */
export const NEON = {
  skyTop: "#0b0420",
  skyMid: "#3b0a5c",
  skyHorizon: "#ff3d7f",
  skyGlow: "#ff9a3c",
  sunTop: "#ffd66b",
  sunBottom: "#ff2e88",
  fog: "#3a1050",
  asphalt: "#16121f",
  laneLine: "#d9d2ff",
  pink: "#ff2e88",
  cyan: "#22e1ff",
  amber: "#ffb020",
  lamp: "#ffc98a",
  red: "#ff2a3a",
  policeRed: "#ff3b3b",
  policeBlue: "#3b6bff",
  water: "#0a0618",
  building: "#100a1e",
} as const;

/** Fog distances: obstacles must read well before they reach the car (16 rows = 160 m). */
export const FOG_NEAR = 40;
export const FOG_FAR = 260;

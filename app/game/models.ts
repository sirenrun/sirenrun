"use client";

import { useGLTF } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import {
  Box3,
  BufferGeometry,
  CanvasTexture,
  Color,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Object3D,
  type Texture,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  ALL_MODELS,
  ATLAS_URL,
  CAR_LENGTH,
  CAR_WIDTH,
  fitCar,
  LAMP_SWATCHES,
  modelUrl,
  SWATCH,
  swatchRect,
  type Fit,
} from "./car-fit";
import { NEON } from "./palette";

/** A car ready to draw facing -z (the way the road runs), sitting on y = 0. */
export interface CarModel {
  /** Body and every non-wheel part, merged, scaled to fit. */
  body: BufferGeometry;
  /** One geometry per wheel, centred on its axle, with where that axle sits on the body. */
  wheels: { geometry: BufferGeometry; position: Vector3 }[];
  /** Body and wheels merged, for instanced traffic whose wheels need not turn. */
  whole: BufferGeometry;
  fit: Fit;
  /** Bumper to bumper, metres. */
  length: number;
}

const TURN = new Matrix4().makeRotationY(Math.PI);
const CAR_FOOTPRINT = { width: CAR_WIDTH, length: CAR_LENGTH };

function stripped(mesh: Mesh): BufferGeometry {
  const g = mesh.geometry.clone();
  // The kit ships tangents nothing here uses; dropping them keeps merged buffers small.
  g.deleteAttribute("tangent");
  return g;
}

function prepare(scene: Object3D, target?: { width: number; length: number }): CarModel {
  scene.updateMatrixWorld(true);
  const size = new Box3().setFromObject(scene).getSize(new Vector3());
  const fit = fitCar(size, target);
  const stretch = new Matrix4().makeScale(fit.x, fit.y, fit.z);
  const place = new Matrix4().multiplyMatrices(stretch, TURN);

  const parts: BufferGeometry[] = [];
  const wheels: CarModel["wheels"] = [];
  const position = new Vector3();
  scene.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const g = stripped(o);
    if (o.name.startsWith("wheel")) {
      // A wheel turns about its own axle, so it is kept round and centred on that axle.
      o.matrixWorld.decompose(position, new Quaternion(), new Vector3());
      g.applyMatrix4(TURN).scale(fit.wheel, fit.wheel, fit.wheel);
      wheels.push({ geometry: g, position: position.clone().applyMatrix4(place) });
    } else {
      parts.push(g.applyMatrix4(new Matrix4().multiplyMatrices(place, o.matrixWorld)));
    }
  });
  const body = mergeGeometries(parts);
  if (body === null) throw new Error("car model parts do not merge");
  const placed = wheels.map((w) =>
    w.geometry.clone().translate(w.position.x, w.position.y, w.position.z),
  );
  const whole = mergeGeometries([body, ...placed]);
  if (whole === null) throw new Error("car model wheels do not merge");
  return { body, wheels, whole, fit, length: size.z * fit.z };
}

function atlasCanvas(
  atlas: Texture,
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
) {
  const image = atlas.image as HTMLImageElement;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (ctx !== null) paint(ctx, canvas.width, canvas.height);
  const texture = new CanvasTexture(canvas);
  // glTF UVs put v = 0 at the top of the image.
  texture.flipY = false;
  texture.colorSpace = SRGBColorSpace;
  // No mipmaps: at a distance they would blend neighbouring swatches into each other.
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  return texture;
}

/** The atlas with the paint swatch repainted in the player's pink. */
function playerAtlas(atlas: Texture) {
  return atlasCanvas(atlas, (ctx, w, h) => {
    ctx.drawImage(atlas.image as HTMLImageElement, 0, 0);
    const r = swatchRect(SWATCH.paint, w, h);
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, "#ff7ab8");
    g.addColorStop(1, new Color(NEON.pink).multiplyScalar(0.95).getStyle());
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  });
}

/** The atlas with the grey trim turned near-black: the police read as a black-and-white cruiser. */
function policeAtlas(atlas: Texture) {
  return atlasCanvas(atlas, (ctx, w, h) => {
    ctx.drawImage(atlas.image as HTMLImageElement, 0, 0);
    const r = swatchRect(SWATCH.trim, w, h);
    ctx.fillStyle = "#15131c";
    ctx.fillRect(r.x, r.y, r.w, r.h);
  });
}

/** Black except the lamp swatches, which keep their colour: lamps glow, nothing else does. */
function lampMask(atlas: Texture) {
  return atlasCanvas(atlas, (ctx, w, h) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    for (const s of LAMP_SWATCHES) {
      const r = swatchRect(s, w, h);
      ctx.drawImage(atlas.image as HTMLImageElement, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    }
  });
}

/** Lamp brightness: well past the bloom threshold so tail lights read through the fog. */
export const LAMP_INTENSITY = 5;

/**
 * Body lift against the slate road: MeshStandard + Neutral tone mapping otherwise reads the
 * atlas paints as near-black silhouettes, player and traffic alike. Lamps stay on the emissive
 * map, so this only lifts the paint the camera sees.
 */
const BODY_LIFT = new Color("#ffffff").multiplyScalar(1.35);

function carMaterial(map: Texture, lamps: Texture) {
  return new MeshStandardMaterial({
    map,
    color: BODY_LIFT,
    emissive: "#ffffff",
    emissiveMap: lamps,
    emissiveIntensity: LAMP_INTENSITY,
    // A bit glossier than matte so the sunset key light catches the rears the camera faces.
    roughness: 0.48,
    metalness: 0.12,
  });
}

export interface CarKit {
  player: CarModel;
  police: CarModel;
  traffic: CarModel[];
  playerMaterial: MeshStandardMaterial;
  policeMaterial: MeshStandardMaterial;
  material: MeshStandardMaterial;
}

/** One kit per loaded atlas: every car component shares the same geometry and materials. */
const kits = new WeakMap<Texture, CarKit>();

function buildKit(atlas: Texture, scenes: Object3D[]): CarKit {
  // The player and police (first two) share the footprint the chase layout assumes.
  const [player, police, ...traffic] = scenes.map((scene, i) =>
    prepare(scene, i < 2 ? CAR_FOOTPRINT : undefined),
  ) as [CarModel, CarModel, ...CarModel[]];
  const lamps = lampMask(atlas);
  const shared = atlasCanvas(atlas, (ctx) => ctx.drawImage(atlas.image as HTMLImageElement, 0, 0));
  return {
    player,
    police,
    traffic,
    playerMaterial: carMaterial(playerAtlas(atlas), lamps),
    policeMaterial: carMaterial(policeAtlas(atlas), lamps),
    material: carMaterial(shared, lamps),
  };
}

/** Loads (suspends) and prepares every car once; later callers share the same objects. */
export function useCarKit(): CarKit {
  const atlas = useLoader(TextureLoader, ATLAS_URL);
  const gltfs = useGLTF(
    ALL_MODELS.map((m) => modelUrl(m)),
    false,
    false,
  );
  const cached = kits.get(atlas);
  if (cached !== undefined) return cached;
  const kit = buildKit(
    atlas,
    gltfs.map((g) => g.scene),
  );
  kits.set(atlas, kit);
  return kit;
}

/** Starts the downloads as soon as the scene module loads, before the first frame needs them. */
export function preloadCars() {
  for (const m of ALL_MODELS) useGLTF.preload(modelUrl(m), false, false);
  useLoader.preload(TextureLoader, ATLAS_URL);
}

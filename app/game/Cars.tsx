"use client";

import { useFrame } from "@react-three/fiber";
import { GAP_MAX, LANE_WIDTH, LANES, NITRO_BOOST } from "@sirenrun/sim";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  MathUtils,
  Object3D,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type PointLight,
  type SpotLight,
} from "three";
import { policeLamp } from "./car-fit";
import { frame } from "./frame";
import { glowTexture } from "./glow";
import { policeLights, sirenIntensity, sirenRed } from "./lights";
import { useCarKit } from "./models";
import { hot, NEON } from "./palette";
import { spring } from "./spring";
import {
  LANE_W,
  metresPerSecond,
  POLICE_CONTACT,
  POLICE_FAR,
  policeDistance,
  worldX,
  worldZ,
} from "./world";

/** The kit's wheels are 0.6 units across before fitting. */
const KIT_WHEEL_RADIUS = 0.3;

function Halo({
  position,
  size,
  color,
  opacity = 0.8,
}: {
  position: [number, number, number];
  size: number;
  color: string;
  opacity?: number;
}) {
  const glow = useMemo(() => glowTexture(), []);
  return (
    <mesh position={position}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial
        map={glow}
        color={color}
        transparent
        opacity={opacity}
        blending={AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
        fog={false}
      />
    </mesh>
  );
}

/**
 * The player's car: the kit's sports sedan in hot pink (no traffic is pink), real headlights
 * that light the road and the traffic ahead, and a strong underglow, so it never reads as one
 * of the obstacles. Leans into lane changes and blinks while invulnerable after a hit.
 */
export function PlayerCar() {
  const kit = useCarKit();
  const wheelRadius = KIT_WHEEL_RADIUS * kit.player.fit.wheel;
  const group = useRef<Group>(null);
  const body = useRef<Group>(null);
  const left = useRef<SpotLight>(null);
  const right = useRef<SpotLight>(null);
  const targets = useMemo(() => [new Object3D(), new Object3D()], []);
  const flames = useRef<Group>(null);
  const exhaust = useRef<PointLight>(null);
  const wheels = useRef<(Mesh | null)[]>([]);
  const dyn = useRef({
    lastX: null as number | null,
    lastVx: 0,
    mps: 0,
    accel: 0,
    pitch: 0,
    vpitch: 0,
    roll: 0,
    vroll: 0,
    spin: 0,
    flame: 0,
  });

  useEffect(() => {
    if (left.current) left.current.target = targets[0] as Object3D;
    if (right.current) right.current.target = targets[1] as Object3D;
  }, [targets]);

  useFrame((_, rawDelta) => {
    const g = group.current;
    const b = body.current;
    if (g === null || b === null) return;
    const dt = Math.min(rawDelta, 0.05);
    const d = dyn.current;
    const x = worldX(frame.displayX);
    const z = worldZ(frame.distance);
    g.position.set(x, 0, z);
    (targets[0] as Object3D).position.set(x - 0.6, 0, z - 26);
    (targets[1] as Object3D).position.set(x + 0.6, 0, z - 26);
    (targets[0] as Object3D).updateMatrixWorld();
    (targets[1] as Object3D).updateMatrixWorld();

    const eff = frame.speed + (frame.nitro ? NITRO_BOOST : 0);
    const mps = metresPerSecond(eff);
    // The sim holds its launch speed through the countdown; the parked car must not buzz or
    // spin its wheels until the run is live.
    const rolling = frame.status === "live" && !frame.busted ? mps : 0;
    if (dt > 0) {
      const raw = MathUtils.clamp((mps - d.mps) / dt, -400, 400);
      d.accel = MathUtils.lerp(d.accel, raw, 1 - Math.exp(-dt / 0.1));
    }
    d.mps = mps;
    const vx = d.lastX === null || dt === 0 ? 0 : (x - d.lastX) / dt;
    const ax = dt === 0 ? 0 : (vx - d.lastVx) / dt;
    d.lastX = x;
    d.lastVx = vx;

    // Weight transfer: nose up under throttle and nitro, hard dive when a hit kills speed;
    // body rolls away from the turn and settles with a little overshoot.
    const pitchTarget = MathUtils.clamp(d.accel * 0.0028, -0.09, 0.06);
    [d.pitch, d.vpitch] = spring(d.pitch, d.vpitch, pitchTarget, 9, 0.45, dt);
    const rollTarget = MathUtils.clamp(-vx * 0.022 - ax * 0.0012, -0.12, 0.12);
    [d.roll, d.vroll] = spring(d.roll, d.vroll, rollTarget, 11, 0.4, dt);
    const buzz = Math.sin(frame.time * 57) * Math.sin(frame.time * 23) * 0.012 * (rolling / 50);
    b.rotation.x = d.pitch;
    b.rotation.z = d.roll;
    b.rotation.y = MathUtils.clamp(-vx * 0.028, -0.1, 0.1);
    b.position.y = buzz - Math.abs(d.roll) * 0.25;
    b.visible = frame.invuln === 0 || Math.floor(frame.time * 12) % 2 === 0;

    d.spin -= (rolling / wheelRadius) * dt;
    for (const w of wheels.current) if (w) w.rotation.x = d.spin;

    // Nitro flames: snap on, flicker, and snuff out when a hit cancels the burn.
    d.flame = MathUtils.lerp(
      d.flame,
      frame.nitro ? 1 : 0,
      1 - Math.exp(-dt * (frame.nitro ? 18 : 10)),
    );
    const f = flames.current;
    if (f) {
      f.visible = d.flame > 0.02;
      const flicker = 0.8 + Math.sin(frame.time * 63) * 0.12 + Math.sin(frame.time * 97) * 0.08;
      f.scale.set(d.flame, d.flame, d.flame * flicker);
    }
    const e = exhaust.current;
    if (e) e.intensity = d.flame * 40 * (0.85 + Math.sin(frame.time * 50) * 0.15);
  });

  return (
    <>
      <group ref={group}>
        <group ref={body}>
          <mesh geometry={kit.player.body} material={kit.playerMaterial} />
          {/* Wheels: spin at the true road speed. */}
          {kit.player.wheels.map((w, i) => (
            <mesh
              key={i}
              ref={(m) => void (wheels.current[i] = m)}
              position={w.position}
              geometry={w.geometry}
              material={kit.playerMaterial}
            />
          ))}
          {/* Nitro: twin exhaust flames, hot amber core fading to blue. */}
          <group ref={flames} position={[0, 0.32, 2.08]} visible={false}>
            {[-0.5, 0.5].map((side) => (
              <group key={side} position={[side, 0, 0]}>
                <mesh position={[0, 0, 0.55]} rotation-x={Math.PI / 2}>
                  <coneGeometry args={[0.2, 1.1, 10, 1, true]} />
                  <meshBasicMaterial
                    color="#5a8cff"
                    transparent
                    opacity={0.7}
                    blending={AdditiveBlending}
                    depthWrite={false}
                    toneMapped={false}
                    side={DoubleSide}
                  />
                </mesh>
                <mesh position={[0, 0, 0.32]} rotation-x={Math.PI / 2}>
                  <coneGeometry args={[0.11, 0.62, 8, 1, true]} />
                  <meshBasicMaterial
                    color="#ffd27a"
                    transparent
                    opacity={0.95}
                    blending={AdditiveBlending}
                    depthWrite={false}
                    toneMapped={false}
                    side={DoubleSide}
                  />
                </mesh>
              </group>
            ))}
            <Halo position={[0, 0, 0.5]} size={2.4} color={NEON.amber} opacity={0.75} />
          </group>
          {/* Underglow */}
          <mesh position={[0, 0.03, 0]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[3.2, 5.6]} />
            <meshBasicMaterial
              map={glowTexture()}
              color={NEON.pink}
              transparent
              opacity={0.9}
              blending={AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
        <pointLight
          ref={exhaust}
          position={[0, 0.5, 3]}
          distance={14}
          decay={1.6}
          intensity={0}
          color={NEON.amber}
        />
        <spotLight
          ref={left}
          position={[-0.62, 0.7, -2]}
          angle={0.38}
          penumbra={0.6}
          distance={70}
          decay={1.2}
          intensity={60}
          color="#fff1d6"
        />
        <spotLight
          ref={right}
          position={[0.62, 0.7, -2]}
          angle={0.38}
          penumbra={0.6}
          distance={70}
          decay={1.2}
          intensity={60}
          color="#fff1d6"
        />
      </group>
      <primitive object={targets[0] as Object3D} />
      <primitive object={targets[1] as Object3D} />
    </>
  );
}

/** Light bar colours: well past the bloom threshold when lit, a dull glass when not. */
const LAMP_ON = { red: hot(NEON.policeRed, 6), blue: hot(NEON.policeBlue, 7) };
const LAMP_OFF = { red: hot(NEON.policeRed, 0.18), blue: hot(NEON.policeBlue, 0.18) };
const SIREN_RED = new Color(NEON.policeRed);
const SIREN_BLUE = new Color(NEON.policeBlue);

const CRUISERS = [
  { lane: 0, back: 0 },
  { lane: -1, back: 4.5 },
  { lane: 1, back: 6.5 },
] as const;

/**
 * Police are a number onchain (`police_gap`), so these cruisers are a picture of it: the lead
 * one sits behind the car at a distance mapped from the gap and follows its lane with a lag.
 */
export function Police() {
  const kit = useCarKit();
  const groups = useRef<(Group | null)[]>([]);
  const lamps = useRef<{ red: MeshBasicMaterial | null; blue: MeshBasicMaterial | null }[]>([]);
  const wheels = useRef<(Mesh | null)[]>([]);
  const light = useRef<PointLight>(null);
  const follow = useRef(0);
  const spin = useRef(0);
  const red = policeLamp(kit.police.fit, "red");
  const blue = policeLamp(kit.police.fit, "blue");

  useFrame((three, delta) => {
    // The cruisers keep pace with the car, so their wheels turn at its speed.
    const mps =
      frame.status === "live" ? metresPerSecond(frame.speed + (frame.nitro ? NITRO_BOOST : 0)) : 0;
    spin.current -= (mps / (KIT_WHEEL_RADIUS * kit.police.fit.wheel)) * Math.min(delta, 0.05);
    for (const w of wheels.current) if (w) w.rotation.x = frame.busted ? 0 : spin.current;
    const visible = frame.ready && frame.status !== "idle";
    const carZ = worldZ(frame.distance);
    const lead = policeDistance(frame.policeGap);
    const closeness = 1 - Math.min(1, Math.max(0, frame.policeGap) / GAP_MAX);
    // They hunt your lane harder the closer they get.
    const chase = 1.6 + closeness * closeness * 4;
    follow.current = MathUtils.lerp(follow.current, frame.displayX, 1 - Math.exp(-delta * chase));
    const red = sirenRed(frame.time);
    // The small light bars keep a crisp flash; only the light they throw cross-fades.
    const flash = red > 0.5;
    // A cruiser is drawn only while its rear bumper is in front of the camera; otherwise
    // the camera plane slices it open.
    const cutoff = three.camera.position.z - 0.8;

    CRUISERS.forEach((cruiser, i) => {
      const g = groups.current[i];
      if (g == null) return;
      const x = MathUtils.clamp(
        follow.current + cruiser.lane * LANE_WIDTH,
        0,
        (LANES - 1) * LANE_WIDTH,
      );
      // Close in, the wing cruisers pull up beside the lead one rather than between the
      // camera and the car.
      const spread = MathUtils.clamp(
        (lead - POLICE_CONTACT) / (POLICE_FAR - POLICE_CONTACT),
        0.15,
        1,
      );
      if (frame.busted) {
        // Caught: the lead cruiser pins the rear bumper and the wings pull up alongside.
        const bx = worldX(frame.displayX) + cruiser.lane * LANE_W * 1.05;
        const bz = carZ + (cruiser.lane === 0 ? POLICE_CONTACT : 1.2);
        const k = 1 - Math.exp(-delta * 2.5);
        g.position.set(MathUtils.lerp(g.position.x, bx, k), 0, MathUtils.lerp(g.position.z, bz, k));
        g.rotation.y = MathUtils.lerp(g.rotation.y, -cruiser.lane * 0.35, k);
        g.visible = visible;
      } else {
        const z = carZ + lead + cruiser.back * spread;
        g.position.set(worldX(x), 0, z);
        g.rotation.y = 0;
        g.visible = visible && z + 2.1 < cutoff;
      }
      if (i === 0) {
        policeLights.visible = g.visible;
        policeLights.x = g.position.x;
        policeLights.z = g.position.z;
        policeLights.red = red;
        policeLights.closeness = closeness;
      }
      const pair = lamps.current[i];
      if (pair?.red && pair.blue) {
        const alt = i % 2 === 0 ? flash : !flash;
        pair.red.color.copy(alt ? LAMP_ON.red : LAMP_OFF.red);
        pair.blue.color.copy(alt ? LAMP_OFF.blue : LAMP_ON.blue);
      }
    });
    const l = light.current;
    if (l !== null) {
      // Dimmed, never hidden: a light that appears or disappears changes the scene's light
      // count, which recompiles every lit material at once (a visible freeze at run start
      // and at the bust).
      l.position.set(worldX(follow.current), 2.6, carZ + lead - 1.5);
      l.color.copy(SIREN_BLUE).lerp(SIREN_RED, red);
      l.intensity = visible ? sirenIntensity(frame.status, closeness) : 0;
    }
  });

  return (
    <>
      {CRUISERS.map((cruiser, i) => (
        <group key={cruiser.lane} ref={(g) => void (groups.current[i] = g)} visible={false}>
          <mesh geometry={kit.police.body} material={kit.policeMaterial} />
          {kit.police.wheels.map((w, k) => (
            <mesh
              key={k}
              ref={(m) => void (wheels.current[i * 4 + k] = m)}
              position={w.position}
              geometry={w.geometry}
              material={kit.policeMaterial}
            />
          ))}
          {/* Flashing lamps over the model's own light bar. */}
          <mesh position={red.centre}>
            <boxGeometry args={red.size} />
            <meshBasicMaterial
              ref={(m) => void ((lamps.current[i] ??= { red: null, blue: null }).red = m)}
              color={LAMP_ON.red}
              toneMapped={false}
            />
          </mesh>
          <mesh position={blue.centre}>
            <boxGeometry args={blue.size} />
            <meshBasicMaterial
              ref={(m) => void ((lamps.current[i] ??= { red: null, blue: null }).blue = m)}
              color={LAMP_ON.blue}
              toneMapped={false}
            />
          </mesh>
          <Halo
            position={[red.centre[0], red.centre[1] + 0.05, red.centre[2] + 0.3]}
            size={2.4}
            color={NEON.policeRed}
            opacity={0.45}
          />
          <Halo
            position={[blue.centre[0], blue.centre[1] + 0.05, blue.centre[2] + 0.3]}
            size={2.4}
            color={NEON.policeBlue}
            opacity={0.45}
          />
        </group>
      ))}
      <pointLight ref={light} distance={30} decay={1.3} intensity={0} />
    </>
  );
}

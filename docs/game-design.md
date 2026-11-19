# Game design and simulation rules

This file defines the simulation exactly. The Rust module `programs/sirenrun/src/sim/` and
the TS port `packages/sim/` implement **this** and nothing else. All numbers are starting
values for playtesting; change them only in `constants.rs` + `constants.ts` together.

## Why lane-based

The authoritative state advances at 10 Hz on the ER, and a driver's input reaches it after
roughly 50–150 ms of network time plus up to 100 ms of tick wait. A free-steering car would
feel laggy. Discrete lanes with a 300 ms lane change hide that latency, keep state tiny,
and keep the math integer-only.

## World

- Top-down/chase view of a straight 5-lane causeway at night, running forever.
- The car moves "up" the road. Distance is measured in **units**.
- Rows of obstacles (traffic cars, roadblocks, spike strips) sit every `ROW_GAP` units.
- Police chase from behind. They are not physical objects; they are a single number:
  `police_gap` (units between the car and the lead cruiser). Gap ≤ 0 = **BUSTED**.

## Units and constants

| Constant | Value | Meaning |
|---|---|---|
| `TICK_MS` | 100 | One sim step = 100 ms (10 Hz) |
| `STAGING_TICKS` | 100 | 10 s countdown before live |
| `SETTLE_TICKS` | 30 | 3 s results hold before the arena goes idle |
| `MAX_LIVE_TICKS` | 1500 | Hard stop at 150 s (counts as busted) |
| `LANES` | 5 | Lanes 0..4 |
| `LANE_WIDTH` | 240 | Lane i centre is at `x = i * 240` |
| `LANE_SPEED` | 80 | x units per tick during a lane change (3 ticks per lane) |
| `SPEED_START` | 100 | Units per tick at go |
| `SPEED_MAX` | 200 | Cruise cap without nitro |
| `ACCEL` | 2 | Units per tick per tick |
| `NITRO_CHARGES` | 3 | Per run |
| `NITRO_BOOST` | 60 | Extra speed while active |
| `NITRO_TICKS` | 20 | 2 s per charge |
| `CRASH_SPEED_PCT` | 50 | Speed after a hit = speed × 50 / 100 |
| `INVULN_TICKS` | 10 | No new hits for 1 s after a hit |
| `ROW_GAP` | 1000 | Units between obstacle rows |
| `EMPTY_ROWS` | 3 | First 3 rows are always clear |
| `GAP_START` | 3000 | Police start 3000 units behind |
| `GAP_MAX` | 4000 | You can't get further ahead than this |
| `POLICE_BASE` | 95 | Police speed at live tick 0 |
| `POLICE_ACCEL_NUM / DEN` | 12 / 100 | Police speed += 0.12 per tick |
| `BLOCK_BASE` | 40 | Base block threshold (out of 256) |
| `BLOCK_CAP` | 190 | Max block threshold |
| `LINES` | [300, 600, 900] | Market lines in live ticks (30 s, 60 s, 90 s) |

Sanity check of the curve: police reach the car's cruise speed (200) at tick 875 (87.5 s).
After that the gap shrinks by an ever-growing amount; with perfect play and no nitro the
car is caught around tick ~1138 (~114 s). Nitro adds ~10 s, but only if used once the
gap is below its cap; nitro fired while the gap is already 4000 is wasted. So every run
ends by ~125 s, and the 90 s line is hard but reachable. Tune with playtests.

Checked with a prototype of these exact rules: a perfect bot that always steers to the
next row's safe lane takes zero hits on every seed tried, and is caught at 113.8 s
without nitro and 123.6 s with nitro fired when the gap drops below 1500. The sim tests
use these two numbers as expectations.

## State the sim needs (per run)

```
seed: u64             // first 8 bytes (LE) of the VRF randomness
t: u32                // live ticks elapsed
car_x: u16            // 0 ..= 4*LANE_WIDTH
target_lane: u8       // 0..4, set by input
speed: u16            // base speed, before nitro
nitro_left: u8
nitro_ticks: u8       // >0 while boosting
invuln: u8
distance: u32
row: u32              // next row index to be checked
safe_lane: u8         // lane guaranteed clear in the last generated row
police_gap: i32
busted: bool
```

Inputs, stored between ticks: `target_lane: u8`, `nitro_pressed: bool` (consumed by the tick).

## Course generation (deterministic from seed)

```
splitmix64(x):
  x = x + 0x9E3779B97F4A7C15 (wrapping)
  z = x
  z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9 (wrapping)
  z = (z ^ (z >> 27)) * 0x94D049BB133111EB (wrapping)
  return z ^ (z >> 31)

row_hash(seed, r) = splitmix64(seed ^ (r * 0x9E3779B97F4A7C15 wrapping))

next_safe_lane(prev_safe, h):
  d = h & 0b11            // 0 → -1, 1 → 0, 2 → 0, 3 → +1
  return clamp(prev_safe + delta(d), 0, 4)

blocked(r, lane, safe_lane, h):
  if r < EMPTY_ROWS: false
  if lane == safe_lane: false
  threshold = min(BLOCK_CAP, BLOCK_BASE + r / 2)
  byte = (h >> (8 * (lane + 1))) & 0xFF
  return byte < threshold
```

`safe_lane` starts at 2. For each row r in order: `h = row_hash(seed, r)`,
`safe_lane = next_safe_lane(safe_lane, h)`, then evaluate `blocked` for each lane.
The safe lane moves at most one lane per row, and a lane change takes 3 ticks while a row
passes every ≥ 3.8 ticks even at top nitro speed (1000 / 260), so a clear path always
exists. The client renders upcoming rows by running the same function forward from the
current `row` and `safe_lane`. No obstacle data is stored onchain.

Obstacle *type* (traffic car, roadblock, spike strip) is cosmetic: the client picks it
from spare hash bits. The program only knows "blocked or not".

## Tick order (live phase)

Each `tick` while live runs exactly these steps:

1. **Input.** If `nitro_pressed && nitro_left > 0 && nitro_ticks == 0`: `nitro_left -= 1`,
   `nitro_ticks = NITRO_TICKS`. Clear `nitro_pressed`.
2. **Lane.** Move `car_x` toward `target_lane * LANE_WIDTH` by at most `LANE_SPEED`.
3. **Speed.** `speed = min(SPEED_MAX, speed + ACCEL)`.
   `eff = speed + (nitro_ticks > 0 ? NITRO_BOOST : 0)`; if `nitro_ticks > 0`, decrement.
4. **Move.** `distance += eff`.
5. **Rows.** While `distance >= (row + 1) * ROW_GAP`: generate row `row` (updates
   `safe_lane`); if `invuln == 0` and the car's lane is blocked → **hit**; `row += 1`.
   Car's lane = `(car_x + LANE_WIDTH / 2) / LANE_WIDTH`.
6. **Hit.** `speed = speed * CRASH_SPEED_PCT / 100`, `invuln = INVULN_TICKS`,
   end nitro (`nitro_ticks = 0`). At most one hit per tick.
   Otherwise if `invuln > 0`, decrement.
7. **Police.** `police_speed = POLICE_BASE + t * NUM / DEN`.
   `police_gap = min(GAP_MAX, police_gap + eff - police_speed)`.
8. **Clock.** `t += 1`.
9. **End.** If `police_gap <= 0` or `t >= MAX_LIVE_TICKS` → `busted = true`.

Markets react to the new state after the sim step (see [onchain-program.md](onchain-program.md)): a market whose line
`<= t` and is still open resolves YES; if busted, all still-open markets resolve NO.

## Inputs

- Driver UI: ← / → (or A / D, or swipe) change `target_lane` by one. Space / tap the nitro
  button presses nitro. Each press sends one `set_input` transaction via session key.
- Client clamps `target_lane` to 0..4 before sending. Program clamps again.
- `set_input(target_lane, nitro)` sets `nitro_pressed |= nitro`: a press stays pending until
  the next tick consumes it, even if a later input before that tick only changes lane.
- Only the run's driver (or their session key) may call `set_input`.

## Feel targets (playtest checklist)

- First 10 s: easy, learn the controls, a few cars.
- 20–40 s: two blocked lanes common, first real dodges.
- 60 s+: three blocked lanes common, police lights in the mirror, one hit hurts.
- 85 s+: police faster than you; nitro decides whether you make 90 s.
- A run should rarely end in under 15 s for a careful player.

## Parity tests

`packages/test-vectors/sim.json` holds cases `{ name, seed, inputs, checkpoints }`:

- `seed` is a decimal string (u64 does not fit a JS number).
- `inputs` are `{ tick, targetLane, nitro }`, applied with `set_input` before the step
  that runs while `t == tick`.
- `checkpoints` are the full state at the start, every 50 ticks, and when busted.

Cases cover seeds above 2^53, out-of-range lanes, nitro, crashes, and the perfect bot with
and without nitro. The Rust tests (`programs/sirenrun/tests/sim.rs`) and the TS tests
(`packages/sim`) replay every case and must match every checkpoint. After a rule change,
regenerate with `cargo test -p sirenrun -- --ignored gen_vectors` and commit the file.

A TS test also fails if `packages/sim/src/constants.ts` drifts from
`programs/sirenrun/src/constants.rs`. `pnpm --filter @sirenrun/sim play [--seed N] [--nitro]`
prints a perfect-bot run as ASCII lanes.

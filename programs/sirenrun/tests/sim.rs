use serde::{Deserialize, Serialize};
use sirenrun::constants::{INVULN_TICKS, MAX_LIVE_TICKS};
use sirenrun::sim::{generate_row, splitmix64, step, SimState};
use std::path::PathBuf;

const CHECKPOINT_EVERY: u32 = 50;
const NITRO_BELOW_GAP: i32 = 1500;
const BOT_SEEDS: [u64; 5] = [1, 2, 3, 42, 1_234_567];

#[derive(Serialize, Deserialize, PartialEq, Debug)]
struct VectorFile {
    cases: Vec<Case>,
}

#[derive(Serialize, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
struct Case {
    name: String,
    seed: String,
    inputs: Vec<InputEvent>,
    checkpoints: Vec<Snapshot>,
}

#[derive(Serialize, Deserialize, PartialEq, Debug, Clone, Copy)]
#[serde(rename_all = "camelCase")]
struct InputEvent {
    tick: u32,
    target_lane: u8,
    nitro: bool,
}

#[derive(Serialize, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    t: u32,
    car_x: u16,
    target_lane: u8,
    speed: u16,
    nitro_left: u8,
    nitro_ticks: u8,
    invuln: u8,
    distance: u32,
    row: u32,
    safe_lane: u8,
    police_gap: i32,
    busted: bool,
    nitro_pressed: bool,
}

impl From<SimState> for Snapshot {
    fn from(s: SimState) -> Self {
        Self {
            t: s.t,
            car_x: s.car_x,
            target_lane: s.target_lane,
            speed: s.speed,
            nitro_left: s.nitro_left,
            nitro_ticks: s.nitro_ticks,
            invuln: s.invuln,
            distance: s.distance,
            row: s.row,
            safe_lane: s.safe_lane,
            police_gap: s.police_gap,
            busted: s.busted,
            nitro_pressed: s.nitro_pressed,
        }
    }
}

fn vectors_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packages/test-vectors/sim.json")
}

fn replay(seed: u64, inputs: &[InputEvent]) -> Vec<Snapshot> {
    let mut state = SimState::start();
    let mut checkpoints = vec![Snapshot::from(state)];
    let mut pending = inputs.iter().peekable();
    while !state.busted {
        while let Some(input) = pending.next_if(|input| input.tick == state.t) {
            state.set_input(input.target_lane, input.nitro);
        }
        step(&mut state, seed);
        if state.t.is_multiple_of(CHECKPOINT_EVERY) || state.busted {
            checkpoints.push(Snapshot::from(state));
        }
    }
    checkpoints
}

/// Steers to the safe lane of the next row; fires nitro once the gap is below its threshold.
fn bot_input(state: &SimState, seed: u64, use_nitro: bool) -> (u8, bool) {
    let next = generate_row(seed, state.row, state.safe_lane);
    let nitro = use_nitro
        && state.police_gap < NITRO_BELOW_GAP
        && state.nitro_left > 0
        && state.nitro_ticks == 0;
    (next.safe_lane, nitro)
}

/// Returns the bot's recorded inputs, the final state and the number of hits taken.
fn run_bot(seed: u64, use_nitro: bool) -> (Vec<InputEvent>, SimState, u32) {
    let mut state = SimState::start();
    let mut inputs = Vec::new();
    let mut hits = 0;
    while !state.busted {
        let (target_lane, nitro) = bot_input(&state, seed, use_nitro);
        if target_lane != state.target_lane || nitro {
            inputs.push(InputEvent {
                tick: state.t,
                target_lane,
                nitro,
            });
        }
        state.set_input(target_lane, nitro);
        step(&mut state, seed);
        if state.invuln == INVULN_TICKS {
            hits += 1;
        }
    }
    (inputs, state, hits)
}

/// A clumsy driver: random lane presses (including out-of-range lanes) and random nitro.
fn scripted_inputs(seed: u64) -> Vec<InputEvent> {
    let mut rng = seed;
    (0..MAX_LIVE_TICKS)
        .filter_map(|tick| {
            rng = splitmix64(rng);
            rng.is_multiple_of(5).then_some(InputEvent {
                tick,
                target_lane: ((rng >> 8) % 7) as u8,
                nitro: (rng >> 16).is_multiple_of(13),
            })
        })
        .collect()
}

fn build_vectors() -> VectorFile {
    let scripted = [1, 42, 1_234_567, 0xDEAD_BEEF_CAFE_F00D, u64::MAX]
        .into_iter()
        .map(|seed| ("scripted", seed, scripted_inputs(seed)));
    let bots = [(7, false), (0x0123_4567_89AB_CDEF, true)]
        .into_iter()
        .map(|(seed, nitro)| {
            let name = if nitro { "bot-nitro" } else { "bot" };
            (name, seed, run_bot(seed, nitro).0)
        });
    let cases = scripted
        .chain(bots)
        .map(|(name, seed, inputs)| Case {
            name: format!("{name}-{seed}"),
            seed: seed.to_string(),
            checkpoints: replay(seed, &inputs),
            inputs,
        })
        .collect();
    VectorFile { cases }
}

#[test]
fn perfect_bot_survives_expected_time_without_hits() {
    for seed in BOT_SEEDS {
        let (_, plain, plain_hits) = run_bot(seed, false);
        assert_eq!((plain.t, plain_hits), (900, 0), "seed {seed} without nitro");
        assert!(plain.police_gap <= 0);

        let (_, boosted, boosted_hits) = run_bot(seed, true);
        assert_eq!(
            (boosted.t, boosted_hits),
            (901, 0),
            "seed {seed} with nitro"
        );
        assert!(boosted.police_gap <= 0);
    }
}

#[test]
fn committed_vectors_match_the_sim() {
    let file = std::fs::read_to_string(vectors_path()).expect("read sim.json");
    let committed: VectorFile = serde_json::from_str(&file).expect("parse sim.json");
    assert_eq!(
        committed,
        build_vectors(),
        "run `cargo test -p sirenrun -- --ignored gen_vectors`"
    );
    for case in &committed.cases {
        let seed: u64 = case.seed.parse().expect("seed");
        assert_eq!(
            replay(seed, &case.inputs),
            case.checkpoints,
            "{}",
            case.name
        );
    }
}

#[test]
#[ignore = "writes packages/test-vectors/sim.json"]
fn gen_vectors() {
    let json = serde_json::to_string_pretty(&build_vectors()).expect("serialize");
    std::fs::write(vectors_path(), json + "\n").expect("write sim.json");
}

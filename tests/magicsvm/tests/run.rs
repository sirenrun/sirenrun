mod common;

use common::{custom_code, key, Base, Ephemeral, World, HOUSE_FUNDS, TUSDC};
use sirenrun::constants::LINES;
use sirenrun::errors::SirenrunError;
use sirenrun::market::open_pool;
use sirenrun::sim::{step, SimState};
use sirenrun::state::{ArenaStatus, MarketStatus, RunSim};

const CONSTRAINT_ADDRESS: u32 = 2012;

#[test]
fn init_arena_is_admin_only_and_bounded() {
    let mut world = World::ready();
    let (admin, stranger) = (world.admin.insecure_clone(), world.stranger());

    assert_eq!(
        custom_code(world.init_arena(&stranger, 0)),
        u32::from(SirenrunError::Unauthorized)
    );
    assert_eq!(
        custom_code(world.init_arena(&admin, 3)),
        u32::from(SirenrunError::InvalidArena)
    );

    world.init_arena(&admin, 2).expect("init_arena");
    let arena = world.arena(Base, 2);
    assert_eq!(arena.id, 2);
    assert_eq!(arena.status, ArenaStatus::Idle);
    let lines: Vec<u32> = arena.markets.iter().map(|m| u32::from(m.line)).collect();
    assert_eq!(lines, LINES);
}

#[test]
fn start_run_stakes_the_runner_and_seeds_the_course() {
    let mut world = World::ready();
    world.ready_for_runs(40 * TUSDC);
    let user = world.user.insecure_clone();
    let (runner, house) = (key(&user), key(&world.admin));

    let mut randomness = [0u8; 32];
    randomness[..8].copy_from_slice(&0xDEAD_BEEF_u64.to_le_bytes());
    world.svm.set_vrf_randomness(Some(randomness));

    world.start_run(&user, &runner, 0).expect("start_run");
    assert_eq!(world.balance(Ephemeral, &runner).available, 14 * TUSDC);
    assert_eq!(
        world.balance(Ephemeral, &house).available,
        HOUSE_FUNDS - 150 * TUSDC + TUSDC
    );
    // Each line opens at its configured RIDE price, not a free 50/50.
    let open_bps = world.params().open_bps;
    for (m, bps) in world.arena(Ephemeral, 0).markets.iter().zip(open_bps) {
        let o = open_pool(50 * TUSDC, bps).expect("opening");
        assert_eq!(m.status, MarketStatus::Open);
        assert_eq!(
            (m.yes_r, m.no_r, m.house_yes, m.house_no),
            (o.yes_r, o.no_r, o.house_yes, o.house_no)
        );
    }

    let arena = world.arena(Ephemeral, 0);
    assert_eq!(arena.status, ArenaStatus::Staging);
    assert_eq!(arena.nonce, 1);
    assert_eq!(arena.runner, runner);
    assert_eq!(arena.bond, 25 * TUSDC);
    assert_eq!(arena.sim, RunSim::from(SimState::start()));
    assert!(!arena.seed_ready);

    world.advance_slot();
    let arena = world.arena(Ephemeral, 0);
    assert!(arena.seed_ready);
    assert_eq!(arena.seed, 0xDEAD_BEEF);

    assert_eq!(
        custom_code(world.start_run(&user, &runner, 0)),
        u32::from(SirenrunError::ArenaBusy)
    );
}

#[test]
fn start_run_requires_the_stake_and_the_owner() {
    let mut world = World::ready();
    world.ready_for_runs(20 * TUSDC);
    let user = world.user.insecure_clone();
    let runner = key(&user);
    let stranger = world.stranger();

    assert_eq!(
        custom_code(world.start_run(&stranger, &runner, 0)),
        u32::from(SirenrunError::Unauthorized)
    );
    assert_eq!(
        custom_code(world.start_run(&user, &runner, 0)),
        u32::from(SirenrunError::InsufficientBalance)
    );
    assert_eq!(world.arena(Ephemeral, 0).status, ArenaStatus::Idle);
}

#[test]
fn only_the_runner_steers_and_only_during_a_run() {
    let mut world = World::ready();
    world.ready_for_runs(40 * TUSDC);
    let user = world.user.insecure_clone();
    let runner = key(&user);
    let stranger = world.stranger();

    assert_eq!(
        custom_code(world.set_input(&user, 0, 3, false)),
        u32::from(SirenrunError::Unauthorized)
    );

    world.start_run(&user, &runner, 0).expect("start_run");
    assert_eq!(
        custom_code(world.set_input(&stranger, 0, 1, true)),
        u32::from(SirenrunError::Unauthorized)
    );

    world.set_input(&user, 0, 9, true).expect("set_input");
    let sim = world.arena(Ephemeral, 0).sim;
    assert_eq!(sim.target_lane, 4);
    assert!(sim.nitro_pressed);
}

#[test]
fn crank_drives_a_full_run_that_matches_the_pure_sim() {
    let mut world = World::ready();
    world.ready_for_runs(40 * TUSDC);
    let user = world.user.insecure_clone();
    let (runner, house) = (key(&user), key(&world.admin));

    let mut randomness = [0u8; 32];
    randomness[..8].copy_from_slice(&42u64.to_le_bytes());
    world.svm.set_vrf_randomness(Some(randomness));
    world.start_run(&user, &runner, 0).expect("start_run");

    let inputs = world.drive_with_bot(&user);

    let mut expected = SimState::start();
    let mut pending = inputs.iter().peekable();
    while !expected.busted {
        while let Some((_, lane)) = pending.next_if(|(t, _)| *t == expected.t) {
            expected.set_input(*lane, false);
        }
        step(&mut expected, 42);
    }

    let arena = world.arena(Ephemeral, 0);
    assert_eq!(arena.sim, RunSim::from(expected));
    assert_eq!(arena.sim.t, 900);
    assert!(arena
        .markets
        .iter()
        .zip(LINES)
        .all(|(m, line)| m.status == MarketStatus::Yes && m.resolved_tick == line));
    assert_eq!(arena.results[0].nonce, 1);
    assert_eq!(arena.results[0].outcomes, 0b01_01_01);
    assert_eq!(arena.results_head, 1);

    // The bot passes all three lines, but nobody traded: the house won nothing on them, so the
    // pass share is zero and the driver only gets the bond back.
    assert_eq!(world.balance(Ephemeral, &runner).available, 39 * TUSDC);
    assert_eq!(
        world.balance(Ephemeral, &house).available,
        HOUSE_FUNDS + TUSDC
    );
}

#[test]
fn tick_only_accepts_the_crank_and_old_cranks_do_not_double_tick() {
    let mut world = World::ready();
    world.ready_for_runs(80 * TUSDC);
    let user = world.user.insecure_clone();
    let runner = key(&user);
    let stranger = world.stranger();

    world.start_run(&user, &runner, 0).expect("first run");
    assert_eq!(
        custom_code(world.tick_directly(&stranger, 0, 1)),
        CONSTRAINT_ADDRESS
    );

    world.drive_with_bot(&user);
    world.start_run(&user, &runner, 0).expect("second run");
    while world.arena(Ephemeral, 0).status != ArenaStatus::Live {
        world.advance_slot();
    }
    let t0 = world.arena(Ephemeral, 0).sim.t;
    for _ in 0..40 {
        world.advance_slot();
    }
    let arena = world.arena(Ephemeral, 0);
    assert_eq!(arena.nonce, 2);
    assert_eq!(
        arena.sim.t - t0,
        20,
        "one tick per 100 ms despite the first run's crank"
    );
}

#[test]
fn start_run_and_tick_fit_the_compute_budget() {
    let mut world = World::ready();
    world.ready_for_runs(40 * TUSDC);
    let user = world.user.insecure_clone();
    let runner = key(&user);

    world.start_run(&user, &runner, 0).expect("start_run");
    let start_run = world.last_compute_units;

    let mut tick_max = 0;
    while world.arena(Ephemeral, 0).sim.t < 50 {
        tick_max = world.advance_slot().into_iter().fold(tick_max, u64::max);
    }
    println!("start_run {start_run} CU, tick max {tick_max} CU");
    assert!(start_run < 100_000, "start_run used {start_run} CU");
    assert!(tick_max < 50_000, "tick used {tick_max} CU");
}

#[test]
fn nitro_charges_the_driver_once_per_charge_fired() {
    let mut world = World::ready();
    world.ready_for_runs(40 * TUSDC);
    let user = world.user.insecure_clone();
    let (runner, house) = (key(&user), key(&world.admin));
    let mut randomness = [0u8; 32];
    randomness[..8].copy_from_slice(&42u64.to_le_bytes());
    world.svm.set_vrf_randomness(Some(randomness));
    world.start_run(&user, &runner, 0).expect("start_run");
    while world.arena(Ephemeral, 0).status != ArenaStatus::Live {
        world.advance_slot();
    }
    let staked = world.balance(Ephemeral, &runner).available;
    let house_before = world.balance(Ephemeral, &house).available;

    world.set_input(&user, 0, 2, true).expect("nitro");
    // A second press while the charge burns does not fire, so it is free.
    world.advance_slot();
    world.set_input(&user, 0, 2, true).expect("nitro again");
    world.advance_slot();

    let arena = world.arena(Ephemeral, 0);
    assert_eq!(arena.sim.nitro_left, 2);
    let fee = world.params().nitro_fee;
    assert_eq!(world.balance(Ephemeral, &runner).available, staked - fee);
    assert_eq!(
        world.balance(Ephemeral, &house).available,
        house_before + fee
    );
}

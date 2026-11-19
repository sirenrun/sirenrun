mod common;

use common::{custom_code, key, Base, Ephemeral, World, TUSDC};
use sirenrun::constants::LINES;
use sirenrun::errors::SirenrunError;
use sirenrun::sim::SimState;
use sirenrun::state::{ArenaStatus, RunSim};

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
    assert_eq!(world.balance(Ephemeral, &house).available, TUSDC);

    let arena = world.arena(Ephemeral, 0);
    assert_eq!(arena.status, ArenaStatus::Staging);
    assert_eq!(arena.nonce, 1);
    assert_eq!(arena.runner, runner);
    assert_eq!(arena.bond, 25 * TUSDC);
    assert_eq!(arena.sim, RunSim::from(SimState::start()));
    assert!(!arena.seed_ready);

    assert_eq!(world.fulfill_randomness(), 1);
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

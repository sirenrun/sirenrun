//! A run's crank writes the runner's and the house's balances on every tick. If either is
//! undelegated before the arena is idle again, every later tick fails and the arena is stuck
//! (seen on devnet). These tests pin the guard in `undelegate_balance` and the admin
//! `recover_arena` escape hatch.

mod common;

use common::*;
use sirenrun::errors::SirenrunError;
use sirenrun::state::ArenaStatus;
use solana_keypair::Keypair;

const BALANCE_IN_USE: u32 = 6000 + SirenrunError::BalanceInUse as u32;

fn seeded(world: &mut World, seed: u64) {
    let mut randomness = [0u8; 32];
    randomness[..8].copy_from_slice(&seed.to_le_bytes());
    world.svm.set_vrf_randomness(Some(randomness));
}

#[test]
fn balances_a_run_writes_stay_delegated_until_the_arena_is_idle() {
    let mut world = World::ready();
    world.ready_for_runs(40 * TUSDC);
    let (user, admin) = (world.user.insecure_clone(), world.admin.insecure_clone());
    let (runner, house) = (key(&user), key(&admin));
    let bystander = Keypair::new();
    world.join(&bystander, 5 * TUSDC);

    seeded(&mut world, 42);
    world.start_run(&user, &runner, 0).expect("start_run");

    // Staging, then live: neither the runner nor the house may leave the rollup.
    for _ in 0..2 {
        assert_eq!(
            custom_code(world.undelegate_balance(&user, &runner)),
            BALANCE_IN_USE
        );
        assert_eq!(
            custom_code(world.undelegate_balance(&admin, &house)),
            BALANCE_IN_USE
        );
        for _ in 0..120 {
            world.advance_slot();
        }
    }
    assert_eq!(world.arena(Ephemeral, 0).status, ArenaStatus::Live);

    // Anyone else can still withdraw mid-run.
    world
        .undelegate_balance(&bystander, &key(&bystander))
        .expect("bystander undelegates during a run");

    world.drive_with_bot(&user);
    assert_eq!(world.arena(Ephemeral, 0).status, ArenaStatus::Idle);
    world
        .undelegate_balance(&user, &runner)
        .expect("runner undelegates once the arena is idle");
    world
        .undelegate_balance(&admin, &house)
        .expect("house undelegates once every arena is idle");
}

#[test]
fn admin_recovers_a_settled_arena_and_it_runs_again() {
    let mut world = World::ready();
    world.ready_for_runs(80 * TUSDC);
    let (user, admin) = (world.user.insecure_clone(), world.admin.insecure_clone());
    let runner = key(&user);
    let stranger = world.stranger();

    seeded(&mut world, 7);
    world.start_run(&user, &runner, 0).expect("start_run");
    // Nobody steers, so the run ends early; stop as soon as it settles.
    for _ in 0..5_000 {
        if world.arena(Ephemeral, 0).status == ArenaStatus::Settled {
            break;
        }
        world.advance_slot();
    }
    let settled = world.arena(Ephemeral, 0);
    assert_eq!(settled.status, ArenaStatus::Settled);

    assert_eq!(
        custom_code(world.recover_arena(&stranger, 0)),
        u32::from(SirenrunError::Unauthorized)
    );
    world.recover_arena(&admin, 0).expect("recover_arena");
    let recovered = world.arena(Ephemeral, 0);
    assert_eq!(
        (recovered.status, recovered.phase_ticks),
        (ArenaStatus::Idle, 0)
    );
    assert_eq!(recovered.nonce, settled.nonce);
    assert_eq!(recovered.results, settled.results);

    assert_eq!(
        custom_code(world.recover_arena(&admin, 0)),
        u32::from(SirenrunError::ArenaNotSettled)
    );

    // The old run's remaining crank ticks are no-ops, and a new run starts.
    for _ in 0..40 {
        world.advance_slot();
    }
    assert_eq!(world.arena(Ephemeral, 0).status, ArenaStatus::Idle);
    world.start_run(&user, &runner, 0).expect("second run");
    assert_eq!(world.arena(Ephemeral, 0).nonce, settled.nonce + 1);
}

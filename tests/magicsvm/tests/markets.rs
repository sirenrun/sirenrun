mod common;

use common::{custom_code, key, Ephemeral, World, TUSDC};
use sirenrun::errors::SirenrunError;
use sirenrun::sim::generate_row;
use sirenrun::state::{ArenaStatus, MarketStatus, Side, ENTRY_EMPTY, ENTRY_YES};
use solana_keypair::Keypair;

fn world_with_spectator() -> (World, Keypair) {
    let mut world = World::ready();
    world.ready_for_runs(40 * TUSDC);
    let spectator = Keypair::new();
    world.join(&spectator, 50 * TUSDC);
    (world, spectator)
}

#[test]
fn buys_wait_for_the_seed_and_the_runner_cannot_trade() {
    let (mut world, spectator) = world_with_spectator();
    let user = world.user.insecure_clone();
    let (runner, fan) = (key(&user), key(&spectator));

    world.start_run(&user, &runner, 0).expect("start_run");
    assert_eq!(
        custom_code(world.buy(&spectator, &fan, 0, 0, Side::Yes, TUSDC, 0)),
        u32::from(SirenrunError::SeedNotReady)
    );

    world.advance_slot();
    assert!(world.arena(Ephemeral, 0).seed_ready);
    assert_eq!(
        custom_code(world.buy(&user, &runner, 0, 0, Side::No, TUSDC, 0)),
        u32::from(SirenrunError::RunnerCannotTrade)
    );
    assert_eq!(
        custom_code(world.buy(&user, &fan, 0, 0, Side::Yes, TUSDC, 0)),
        u32::from(SirenrunError::Unauthorized)
    );
    world
        .buy(&spectator, &fan, 0, 0, Side::Yes, TUSDC, 0)
        .expect("buy");
}

/// Solvency: every buy mints `net` complete sets, so a resolved pool's winning reserve
/// plus the winners' shares equals the collateral the market took in. The house is
/// credited the reserve; winners will claim their shares. So the vault must equal the sum
/// of all balances plus the unclaimed winning shares, to the unit.
#[test]
fn trades_and_resolution_conserve_every_unit() {
    let (mut world, spectator) = world_with_spectator();
    let user = world.user.insecure_clone();
    let (runner, fan, house) = (key(&user), key(&spectator), key(&world.admin));

    world.start_run(&user, &runner, 0).expect("start_run");
    world.advance_slot();
    let house_before = world.balance(Ephemeral, &house).available;

    world
        .buy(&spectator, &fan, 0, 0, Side::Yes, 10 * TUSDC, 1)
        .expect("buy YES 30s");
    world
        .buy(&spectator, &fan, 0, 2, Side::No, 5 * TUSDC, 1)
        .expect("buy NO 90s");

    let spent = world.balance(Ephemeral, &fan);
    assert_eq!(spent.available, 35 * TUSDC);
    let fees = 15 * TUSDC * 2 / 100;
    let runner_fees = 15 * TUSDC / 100;
    assert_eq!(world.arena(Ephemeral, 0).runner_fees, runner_fees);
    assert_eq!(
        world.balance(Ephemeral, &house).available,
        house_before + fees - runner_fees
    );
    let yes_entry = spent.entries[0];
    assert_eq!((yes_entry.market, yes_entry.side), (0, ENTRY_YES));

    world.drive_with_bot(&user);
    let arena = world.arena(Ephemeral, 0);
    assert_eq!(arena.status, ArenaStatus::Idle);
    assert!(arena.markets.iter().all(|m| m.status == MarketStatus::Yes));

    let available = |world: &World| -> u64 {
        [runner, fan, house]
            .iter()
            .map(|owner| world.balance(Ephemeral, owner).available)
            .sum()
    };
    let unclaimed_winning_shares = yes_entry.shares;
    assert_eq!(
        world.token_amount(world.vault),
        available(&world) + unclaimed_winning_shares
    );

    let stranger = world.stranger();
    assert_eq!(
        custom_code(world.claim(&stranger, &fan, 0, 0)),
        u32::from(SirenrunError::Unauthorized)
    );
    world.claim(&spectator, &fan, 0, 0).expect("claim YES win");
    world.claim(&spectator, &fan, 0, 1).expect("claim NO loss");
    assert_eq!(
        world.balance(Ephemeral, &fan).available,
        35 * TUSDC + yes_entry.shares
    );
    assert!(world
        .balance(Ephemeral, &fan)
        .entries
        .iter()
        .all(|e| e.side == ENTRY_EMPTY));
    assert_eq!(
        custom_code(world.claim(&spectator, &fan, 0, 0)),
        u32::from(SirenrunError::NoEntry)
    );
    assert_eq!(world.token_amount(world.vault), available(&world));
}

/// Steers into the next row's blocked lanes until the police catch the car.
fn crash_on_purpose(world: &mut World, runner: &Keypair) {
    for _ in 0..10_000 {
        let arena = world.arena(Ephemeral, 0);
        if arena.status == ArenaStatus::Idle {
            return;
        }
        if arena.status == ArenaStatus::Live && !arena.sim.busted {
            let next = generate_row(arena.seed, arena.sim.row, arena.sim.safe_lane);
            if let Some(lane) = (0..5u8).find(|&l| next.blocked[usize::from(l)]) {
                if lane != arena.sim.target_lane {
                    world.set_input(runner, 0, lane, false).expect("set_input");
                }
            }
        }
        world.advance_slot();
    }
    panic!("run never finished");
}

#[test]
fn a_bust_pays_bust_from_the_pool_and_refunds_ride_from_the_bond() {
    let (mut world, spectator) = world_with_spectator();
    let user = world.user.insecure_clone();
    let (runner, fan, house) = (key(&user), key(&spectator), key(&world.admin));

    world.start_run(&user, &runner, 0).expect("start_run");
    world.advance_slot();
    world
        .buy(&spectator, &fan, 0, 0, Side::Yes, 10 * TUSDC, 1)
        .expect("buy RIDE 30s");
    world
        .buy(&spectator, &fan, 0, 0, Side::No, TUSDC, 1)
        .expect("buy BUST 30s");
    let staked = world.balance(Ephemeral, &runner).available;
    let arena = world.arena(Ephemeral, 0);
    let (owed, ride_cost) = (arena.markets[0].no_profit, arena.markets[0].ride_cost);
    let runner_fees = arena.runner_fees;
    assert!(owed > 0 && owed < arena.bond);

    crash_on_purpose(&mut world, &user);
    let arena = world.arena(Ephemeral, 0);
    let outcome = arena.results[0];
    assert_eq!(outcome.outcomes & 0b11, MarketStatus::No as u8);
    // The bond covered exactly what BUST won; the driver got the rest back with the fees.
    assert_eq!(
        world.balance(Ephemeral, &runner).available,
        staked + arena.bond - owed + runner_fees
    );
    let bps = u64::from(outcome.ride_back_bps[0]);
    assert_eq!(bps, owed * 10_000 / ride_cost);

    let entries = world.balance(Ephemeral, &fan).entries;
    let before = world.balance(Ephemeral, &fan).available;
    world.claim(&spectator, &fan, 0, 0).expect("claim RIDE");
    world.claim(&spectator, &fan, 0, 1).expect("claim BUST");
    let ride_back = entries[0].cost * bps / 10_000;
    assert_eq!(
        world.balance(Ephemeral, &fan).available,
        before + ride_back + entries[1].shares
    );

    let available: u64 = [runner, fan, house]
        .iter()
        .map(|owner| world.balance(Ephemeral, owner).available)
        .sum();
    assert_eq!(world.token_amount(world.vault), available);
}

use anchor_lang::prelude::{Error, Pubkey};
use sirenrun::constants::{LINES, MAX_ENTRIES};
use sirenrun::errors::SirenrunError;
use sirenrun::sim::{splitmix64, SimState};
use sirenrun::state::{
    Arena, ArenaStatus, Balance, BuyTerms, Market, PositionEntry, RunResult, RunTerms, Side,
    TickTerms, ENTRY_EMPTY, MARKETS, RESULTS,
};

const TUSDC: u64 = 1_000_000;
const RUNS: usize = 60;
const BUY_TERMS: BuyTerms = BuyTerms {
    fee_bps: 200,
    runner_fee_bps: 100,
    max_buy: 50 * TUSDC,
};
const RUN_TERMS: RunTerms = RunTerms {
    entry_fee: TUSDC,
    bond: 25 * TUSDC,
    liquidity: 50 * TUSDC,
    open_bps: [8_500, 4_500, 1_500],
};
const NITRO_FEE: u64 = TUSDC / 2;

struct Rng(u64);

impl Rng {
    fn below(&mut self, n: u64) -> u64 {
        self.0 = splitmix64(self.0);
        self.0 % n
    }

    fn chance(&mut self, one_in: u64) -> bool {
        self.below(one_in) == 0
    }
}

/// Player 0 never claims until the end, so its old positions outlive the results ring.
const SLEEPER: usize = 0;

#[derive(Default, Debug)]
struct Coverage {
    runs: u32,
    trades: u32,
    wins: u32,
    refunds: u32,
    expired: u32,
    aborted_runs: u32,
    cap_hits: u32,
    ride_backs: u32,
    nitro_paid: u32,
}

fn balance(available: u64) -> Balance {
    Balance {
        owner: Pubkey::new_unique(),
        available,
        entries: [PositionEntry::default(); MAX_ENTRIES],
        bump: 255,
    }
}

fn idle_arena() -> Arena {
    let mut markets = [Market::default(); MARKETS];
    for (market, line) in markets.iter_mut().zip(LINES) {
        market.line = line as u16;
    }
    Arena {
        id: 0,
        bump: 255,
        status: ArenaStatus::Idle,
        phase_ticks: 0,
        nonce: 0,
        runner: Pubkey::default(),
        seed_ready: false,
        seed: 0,
        sim: SimState::start().into(),
        bond: 0,
        runner_fees: 0,
        markets,
        results: [RunResult::default(); RESULTS],
        results_head: 0,
    }
}

fn is(err: &Error, expected: SirenrunError) -> bool {
    *err == expected.into()
}

fn total(house: &Balance, players: &[Balance]) -> u64 {
    house.available + players.iter().map(|p| p.available).sum::<u64>()
}

fn claim_entries(
    arena: &Arena,
    players: &mut [Balance],
    house: &mut Balance,
    rng: &mut Rng,
    skip_one_in: u64,
    include_sleeper: bool,
    seen: &mut Coverage,
) {
    for (i, player) in players.iter_mut().enumerate() {
        if i == SLEEPER && !include_sleeper {
            continue;
        }
        for index in 0..MAX_ENTRIES as u8 {
            let entry = player.entries[usize::from(index)];
            if entry.side == ENTRY_EMPTY || (skip_one_in > 0 && rng.chance(skip_one_in)) {
                continue;
            }
            let cost = entry.cost;
            match arena.claim(player, house, index) {
                Ok(paid) if paid == cost && paid != entry.shares => seen.refunds += 1,
                Ok(paid) if paid > 0 && paid < cost => seen.ride_backs += 1,
                Ok(paid) if paid > 0 => seen.wins += 1,
                Ok(_) => {}
                Err(e) if is(&e, SirenrunError::ResultExpired) => {
                    seen.expired += 1;
                    player.entries[usize::from(index)] = PositionEntry::default();
                }
                Err(e) if is(&e, SirenrunError::NotResolved) => {}
                Err(e) => panic!("unexpected claim error {e:?}"),
            }
        }
    }
}

/// Solvency argument (docs/onchain-program.md): every buy mints `net` complete sets, so
/// per market the winning-side tokens equal `liquidity + Σ net`, the collateral taken in.
/// The pool's share, plus the tokens the house kept at an uneven opening, is credited to the
/// house and winners claim theirs. VOID and cooldown refunds come out of the house's own
/// balance (a refunded winner's shares go to the house), a busted driver's forfeit goes to
/// the house before it refunds RIDE holders out of it, and unpaid shares are never paid.
/// So no mix of runs, trades and claims can make the balances add up to more than was
/// deposited. This drives many random runs through the same pure logic the instructions
/// call and checks that after every run.
#[test]
fn balances_never_exceed_deposits() {
    let mut rng = Rng(2026);
    let mut seen = Coverage::default();
    let mut arena = idle_arena();
    let mut house = balance(100_000 * TUSDC);
    let mut players: Vec<Balance> = (0..6).map(|_| balance(20_000 * TUSDC)).collect();
    let deposits = total(&house, &players);

    for run in 0..RUNS {
        let stake = RUN_TERMS.entry_fee + RUN_TERMS.bond;
        let can_drive: Vec<usize> = (0..players.len())
            .filter(|&i| players[i].available >= stake)
            .collect();
        let Some(&runner) = can_drive.get(rng.below(can_drive.len().max(1) as u64) as usize) else {
            break;
        };
        arena
            .start(&mut players[runner], &mut house, RUN_TERMS)
            .expect("start");
        if rng.chance(8) {
            seen.aborted_runs += 1;
        } else {
            arena.seed = rng.below(u64::MAX);
            arena.seed_ready = true;
        }

        while arena.status != ArenaStatus::Idle {
            if arena.status == ArenaStatus::Live && rng.chance(3) {
                let mut sim = SimState::from(arena.sim);
                sim.set_input(rng.below(5) as u8, rng.chance(40));
                arena.sim = sim.into();
            }
            let trader = rng.below(players.len() as u64) as usize;
            if trader != runner && rng.chance(2) {
                let side = if rng.chance(2) { Side::Yes } else { Side::No };
                let amount = 1 + rng.below(BUY_TERMS.max_buy);
                let market = rng.below(MARKETS as u64) as u8;
                match arena.buy(
                    &mut players[trader],
                    &mut house,
                    BUY_TERMS,
                    market,
                    side,
                    amount,
                    0,
                ) {
                    Ok(_) => seen.trades += 1,
                    Err(e) if is(&e, SirenrunError::NoInterestCapReached) => seen.cap_hits += 1,
                    Err(e)
                        if [
                            SirenrunError::SeedNotReady,
                            SirenrunError::MarketClosed,
                            SirenrunError::NoFreeEntry,
                            SirenrunError::InsufficientBalance,
                            SirenrunError::ArenaNotLive,
                        ]
                        .into_iter()
                        .any(|code| is(&e, code)) => {}
                    Err(e) => panic!("unexpected buy error {e:?}"),
                }
            }

            let effects = arena
                .advance(TickTerms {
                    entry_fee: RUN_TERMS.entry_fee,
                    nitro_fee: NITRO_FEE,
                    runner_available: players[runner].available,
                })
                .expect("advance");
            seen.nitro_paid += u32::from(effects.runner_out > 0);
            effects
                .apply(&mut players[runner], &mut house)
                .expect("apply");

            if rng.chance(10) {
                claim_entries(
                    &arena,
                    &mut players,
                    &mut house,
                    &mut rng,
                    0,
                    false,
                    &mut seen,
                );
            }
        }

        claim_entries(
            &arena,
            &mut players,
            &mut house,
            &mut rng,
            3,
            false,
            &mut seen,
        );
        seen.runs += 1;
        assert!(
            total(&house, &players) <= deposits,
            "run {run}: balances exceed deposits"
        );
    }

    claim_entries(
        &arena,
        &mut players,
        &mut house,
        &mut rng,
        0,
        true,
        &mut seen,
    );
    assert!(players
        .iter()
        .all(|p| p.entries.iter().all(|e| e.side == ENTRY_EMPTY)));
    assert!(total(&house, &players) <= deposits);

    println!("{seen:?}");
    assert_eq!(seen.runs, RUNS as u32, "{seen:?}");
    assert!(seen.trades > 1_000 && seen.expired > 0, "{seen:?}");
    assert!(
        seen.wins > 0 && seen.refunds > 0 && seen.aborted_runs > 0,
        "{seen:?}"
    );
    assert!(seen.cap_hits > 0, "{seen:?}");
    assert!(seen.ride_backs > 0 && seen.nitro_paid > 0, "{seen:?}");
}

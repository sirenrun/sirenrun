use anchor_lang::prelude::*;

use super::Balance;
use crate::constants::{LINES, SEED_TIMEOUT_TICKS, SETTLE_TICKS, STAGING_TICKS};
use crate::errors::SirenrunError;
use crate::market::{forfeit, open_pool, ride_back_bps};
use crate::sim::{step, SimState};

pub const ARENA_SEED: &[u8] = b"arena";
pub const MARKETS: usize = LINES.len();
pub const RESULTS: usize = 16;

#[derive(
    AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, Default, Debug, PartialEq, Eq,
)]
pub enum ArenaStatus {
    #[default]
    Idle,
    Staging,
    Live,
    Settled,
}

#[derive(
    AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, Default, Debug, PartialEq, Eq,
)]
pub enum MarketStatus {
    #[default]
    Open,
    Yes,
    No,
    Void,
}

impl MarketStatus {
    /// Inverse of the 2-bit encoding in `RunResult::outcomes`.
    pub fn from_bits(bits: u8) -> Self {
        match bits & 0b11 {
            1 => Self::Yes,
            2 => Self::No,
            3 => Self::Void,
            _ => Self::Open,
        }
    }
}

#[derive(
    AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, Default, Debug, PartialEq, Eq,
)]
pub struct Market {
    pub line: u16,
    pub status: MarketStatus,
    pub yes_r: u64,
    pub no_r: u64,
    pub resolved_tick: u32,
    /// Tokens the house minted at the opening but kept out of the pool (see `open_pool`).
    pub house_yes: u64,
    pub house_no: u64,
    /// What BUST holders would win here on a bust: sum of `shares - net` over NO buys.
    pub no_profit: u64,
    /// Sum of `net` over RIDE buys, to share a forfeited bond between them.
    pub ride_cost: u64,
    /// Share of a losing RIDE position's cost refunded from the driver's bond, set on bust.
    pub ride_back_bps: u16,
}

impl Market {
    /// The house's tokens on `side`: the pool's reserve plus what it kept at the opening.
    fn house_tokens(&self, yes: bool) -> Result<u64> {
        let (pool, kept) = if yes {
            (self.yes_r, self.house_yes)
        } else {
            (self.no_r, self.house_no)
        };
        Ok(pool.checked_add(kept).ok_or(SirenrunError::MathOverflow)?)
    }
}

#[derive(
    AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, Default, Debug, PartialEq, Eq,
)]
pub struct RunResult {
    pub nonce: u32,
    pub outcomes: u8,
    pub resolved_ticks: [u32; MARKETS],
    pub ride_back_bps: [u16; MARKETS],
}

/// Borsh copy of `sim::SimState`, so the pure sim module stays free of Anchor.
#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, Debug, PartialEq, Eq)]
pub struct RunSim {
    pub t: u32,
    pub car_x: u16,
    pub target_lane: u8,
    pub speed: u16,
    pub nitro_left: u8,
    pub nitro_ticks: u8,
    pub invuln: u8,
    pub distance: u32,
    pub row: u32,
    pub safe_lane: u8,
    pub police_gap: i32,
    pub busted: bool,
    pub nitro_pressed: bool,
}

impl From<SimState> for RunSim {
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

impl From<RunSim> for SimState {
    fn from(s: RunSim) -> Self {
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

#[account]
#[derive(InitSpace)]
pub struct Arena {
    pub id: u8,
    pub bump: u8,
    pub status: ArenaStatus,
    pub phase_ticks: u16,
    pub nonce: u32,
    pub runner: Pubkey,
    pub seed_ready: bool,
    pub seed: u64,
    pub sim: RunSim,
    pub bond: u64,
    pub runner_fees: u64,
    pub markets: [Market; MARKETS],
    pub results: [RunResult; RESULTS],
    pub results_head: u8,
}

/// What one tick changes outside the arena: balance moves (applied by the handler with
/// checked math) and the lines crossed, as bit `i` for market `i` (for `LineCrossed`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct TickEffects {
    pub runner: u64,
    /// Nitro fee taken from the runner this tick.
    pub runner_out: u64,
    pub house_in: u64,
    pub house_out: u64,
    pub crossed: u8,
}

impl TickEffects {
    pub fn apply(&self, runner: &mut Balance, house: &mut Balance) -> Result<()> {
        runner.credit(self.runner)?;
        runner.debit(self.runner_out)?;
        house.credit(self.house_in)?;
        house.debit(self.house_out)
    }
}

/// What a tick reads from `Config` and the runner's balance.
#[derive(Clone, Copy, Debug)]
pub struct TickTerms {
    pub entry_fee: u64,
    pub nitro_fee: u64,
    /// The runner's spendable balance before this tick, to decide if a nitro can be paid.
    pub runner_available: u64,
}

/// Stake and liquidity for a new run, copied from `Config`.
#[derive(Clone, Copy, Debug)]
pub struct RunTerms {
    pub entry_fee: u64,
    pub bond: u64,
    pub liquidity: u64,
    pub open_bps: [u16; MARKETS],
}

impl Arena {
    pub const SPACE: usize = 8 + Self::INIT_SPACE;

    /// True while this arena's crank still writes `owner`'s balance: as the runner of a run
    /// that is not idle yet, or as the house while any run is not idle. Undelegating such a
    /// balance would make every later `tick` fail and leave the arena stuck.
    pub fn uses_balance(&self, owner: &Pubkey, house: &Pubkey) -> bool {
        self.status != ArenaStatus::Idle && (self.runner == *owner || owner == house)
    }

    /// Admin recovery for an arena whose crank can no longer run. Only a Settled arena may be
    /// reset: its payouts were applied when it settled, so this only skips the results hold.
    pub fn recover(&mut self) -> Result<()> {
        require!(
            self.status == ArenaStatus::Settled,
            SirenrunError::ArenaNotSettled
        );
        self.status = ArenaStatus::Idle;
        self.phase_ticks = 0;
        Ok(())
    }

    /// Starts a run: checks everything first, then takes the runner's stake, funds the pools
    /// from the house and resets the arena.
    pub fn start(
        &mut self,
        runner: &mut Balance,
        house: &mut Balance,
        terms: RunTerms,
    ) -> Result<()> {
        require!(self.status == ArenaStatus::Idle, SirenrunError::ArenaBusy);
        let stake = terms
            .entry_fee
            .checked_add(terms.bond)
            .ok_or(SirenrunError::MathOverflow)?;
        let pools = terms
            .liquidity
            .checked_mul(MARKETS as u64)
            .ok_or(SirenrunError::MathOverflow)?;
        require!(house.available >= pools, SirenrunError::HouseInsufficient);
        require!(
            runner.available >= stake,
            SirenrunError::InsufficientBalance
        );

        house.debit(pools)?;
        house.credit(terms.entry_fee)?;
        runner.debit(stake)?;
        self.begin(runner.owner, terms.bond, terms.liquidity, terms.open_bps)
    }

    /// Resets an idle arena for a new run and opens each market at its opening price, backed
    /// by `liquidity` complete sets from the house.
    pub fn begin(
        &mut self,
        runner: Pubkey,
        bond: u64,
        liquidity: u64,
        open_bps: [u16; MARKETS],
    ) -> Result<()> {
        require!(self.status == ArenaStatus::Idle, SirenrunError::ArenaBusy);
        let mut openings = [None; MARKETS];
        for (slot, bps) in openings.iter_mut().zip(open_bps) {
            *slot = Some(open_pool(liquidity, bps).ok_or(SirenrunError::InvalidConfig)?);
        }
        self.nonce = self
            .nonce
            .checked_add(1)
            .ok_or(SirenrunError::MathOverflow)?;
        self.runner = runner;
        self.status = ArenaStatus::Staging;
        self.phase_ticks = 0;
        self.seed_ready = false;
        self.seed = 0;
        self.sim = SimState::start().into();
        self.bond = bond;
        self.runner_fees = 0;
        for (market, opening) in self.markets.iter_mut().zip(openings.into_iter().flatten()) {
            market.status = MarketStatus::Open;
            market.yes_r = opening.yes_r;
            market.no_r = opening.no_r;
            market.house_yes = opening.house_yes;
            market.house_no = opening.house_no;
            market.resolved_tick = 0;
            market.no_profit = 0;
            market.ride_cost = 0;
            market.ride_back_bps = 0;
        }
        Ok(())
    }

    /// One crank tick of the run lifecycle: Staging, Live, Settled, Idle.
    pub fn advance(&mut self, terms: TickTerms) -> Result<TickEffects> {
        match self.status {
            ArenaStatus::Idle => Ok(TickEffects::default()),
            ArenaStatus::Staging => self.advance_staging(terms.entry_fee),
            ArenaStatus::Live => self.advance_live(terms),
            ArenaStatus::Settled => {
                self.phase_ticks = self.phase_ticks.saturating_add(1);
                if u32::from(self.phase_ticks) >= SETTLE_TICKS {
                    self.status = ArenaStatus::Idle;
                    self.phase_ticks = 0;
                }
                Ok(TickEffects::default())
            }
        }
    }

    /// Two bits per market, market 0 in the lowest bits: 0 open, 1 YES, 2 NO, 3 VOID.
    pub fn outcomes(&self) -> u8 {
        self.markets
            .iter()
            .enumerate()
            .fold(0, |acc, (i, m)| acc | ((m.status as u8) << (2 * i)))
    }

    fn advance_staging(&mut self, entry_fee: u64) -> Result<TickEffects> {
        self.phase_ticks = self.phase_ticks.saturating_add(1);
        let ticks = u32::from(self.phase_ticks);
        if ticks >= STAGING_TICKS && self.seed_ready {
            self.status = ArenaStatus::Live;
            self.phase_ticks = 0;
            return Ok(TickEffects::default());
        }
        if ticks < STAGING_TICKS + SEED_TIMEOUT_TICKS {
            return Ok(TickEffects::default());
        }
        // `buy` requires the seed, so an aborted run has no trades: each market's YES pool plus
        // the YES tokens the house kept is exactly the liquidity it put in.
        let mut pools: u64 = 0;
        for market in &mut self.markets {
            market.status = MarketStatus::Void;
            pools = pools
                .checked_add(market.house_tokens(true)?)
                .ok_or(SirenrunError::MathOverflow)?;
        }
        self.finish();
        let refund = entry_fee
            .checked_add(self.bond)
            .ok_or(SirenrunError::MathOverflow)?;
        Ok(TickEffects {
            runner: refund,
            house_in: pools,
            house_out: entry_fee,
            ..TickEffects::default()
        })
    }

    fn advance_live(&mut self, terms: TickTerms) -> Result<TickEffects> {
        let mut effects = TickEffects::default();
        let mut sim = SimState::from(self.sim);
        // Nitro costs the driver only when a charge actually fires. A press the driver cannot
        // pay for is dropped, so the run plays on without it.
        if sim.nitro_will_fire() {
            if terms.runner_available >= terms.nitro_fee {
                effects.runner_out = terms.nitro_fee;
                effects.house_in = terms.nitro_fee;
            } else {
                sim.nitro_pressed = false;
            }
        }
        step(&mut sim, self.seed);
        self.sim = sim.into();

        // The house is the LP: a resolved market's winning tokens in the pool, plus those it
        // kept at the opening, are its share.
        for (i, market) in self.markets.iter_mut().enumerate() {
            if market.status == MarketStatus::Open && sim.t >= u32::from(market.line) {
                market.status = MarketStatus::Yes;
                market.resolved_tick = sim.t;
                effects.house_in = effects
                    .house_in
                    .checked_add(market.house_tokens(true)?)
                    .ok_or(SirenrunError::MathOverflow)?;
                effects.crossed |= 1 << i;
            }
        }
        if !sim.busted {
            return Ok(effects);
        }
        let mut bust_profit: u64 = 0;
        for market in &mut self.markets {
            if market.status == MarketStatus::Open {
                market.status = MarketStatus::No;
                market.resolved_tick = sim.t;
                effects.house_in = effects
                    .house_in
                    .checked_add(market.house_tokens(false)?)
                    .ok_or(SirenrunError::MathOverflow)?;
                bust_profit = bust_profit
                    .checked_add(market.no_profit)
                    .ok_or(SirenrunError::MathOverflow)?;
            }
        }

        // The bond covers what BUST holders won on the lines this bust closed, never more.
        // That part goes to the house, which pays it out to those lines' RIDE holders as they
        // claim; the rest of the bond goes back to the driver.
        let taken = forfeit(self.bond, bust_profit);
        for market in &mut self.markets {
            if market.status == MarketStatus::No && market.resolved_tick == sim.t {
                market.ride_back_bps =
                    ride_back_bps(taken, market.no_profit, bust_profit, market.ride_cost);
            }
        }
        effects.house_in = effects
            .house_in
            .checked_add(taken)
            .ok_or(SirenrunError::MathOverflow)?;
        effects.runner = self
            .runner_fees
            .checked_add(self.bond - taken)
            .ok_or(SirenrunError::MathOverflow)?;
        self.finish();
        Ok(effects)
    }

    fn finish(&mut self) {
        let head = usize::from(self.results_head) % RESULTS;
        self.results[head] = RunResult {
            nonce: self.nonce,
            outcomes: self.outcomes(),
            resolved_ticks: self.markets.map(|m| m.resolved_tick),
            ride_back_bps: self.markets.map(|m| m.ride_back_bps),
        };
        self.results_head = ((head + 1) % RESULTS) as u8;
        self.status = ArenaStatus::Settled;
        self.phase_ticks = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn space_matches_spec() {
        assert_eq!(Market::INIT_SPACE, 57);
        assert_eq!(RunResult::INIT_SPACE, 23);
        assert_eq!(RunSim::INIT_SPACE, 27);
        assert_eq!(Arena::SPACE, 641);
    }

    const EVEN: [u16; MARKETS] = [5_000; MARKETS];

    fn terms() -> TickTerms {
        TickTerms {
            entry_fee: 1,
            nitro_fee: 0,
            runner_available: 0,
        }
    }

    fn staged(seed_ready: bool) -> Arena {
        let mut markets = [Market::default(); MARKETS];
        for (market, line) in markets.iter_mut().zip(LINES) {
            market.line = line as u16;
            market.yes_r = 50;
            market.no_r = 50;
        }
        Arena {
            id: 0,
            bump: 255,
            status: ArenaStatus::Staging,
            phase_ticks: 0,
            nonce: 7,
            runner: Pubkey::new_unique(),
            seed_ready,
            seed: 42,
            sim: SimState::start().into(),
            bond: 25,
            runner_fees: 3,
            markets,
            results: [RunResult::default(); RESULTS],
            results_head: 0,
        }
    }

    fn run_until(arena: &mut Arena, status: ArenaStatus) -> TickEffects {
        let mut total = TickEffects::default();
        for _ in 0..5_000 {
            let p = arena.advance(terms()).unwrap();
            total.runner += p.runner;
            total.runner_out += p.runner_out;
            total.house_in += p.house_in;
            total.house_out += p.house_out;
            total.crossed |= p.crossed;
            if arena.status == status {
                return total;
            }
        }
        panic!("never reached {status:?}");
    }

    #[test]
    fn staging_waits_for_countdown_and_seed() {
        let mut arena = staged(true);
        for _ in 1..STAGING_TICKS {
            arena.advance(terms()).unwrap();
            assert_eq!(arena.status, ArenaStatus::Staging);
        }
        arena.advance(terms()).unwrap();
        assert_eq!(arena.status, ArenaStatus::Live);
        assert_eq!(arena.sim.t, 0);
    }

    #[test]
    fn missing_seed_aborts_and_refunds() {
        let mut arena = staged(false);
        let payouts = run_until(&mut arena, ArenaStatus::Settled);
        assert_eq!(arena.phase_ticks, 0);
        assert_eq!(
            payouts,
            TickEffects {
                runner: 1 + 25,
                house_in: 3 * 50,
                house_out: 1,
                ..TickEffects::default()
            }
        );
        assert!(arena.markets.iter().all(|m| m.status == MarketStatus::Void));
        assert_eq!(arena.results[0].nonce, 7);
        assert_eq!(arena.results[0].outcomes, 0b11_11_11);
        assert_eq!(arena.results_head, 1);
    }

    fn bust_now(arena: &mut Arena) -> TickEffects {
        arena.status = ArenaStatus::Live;
        arena.sim.police_gap = 1;
        arena.sim.speed = 0;
        arena.advance(terms()).unwrap()
    }

    #[test]
    fn a_bust_nobody_bet_on_returns_the_whole_bond() {
        let mut arena = staged(true);
        let payouts = bust_now(&mut arena);
        let t = arena.sim.t;
        assert_eq!((arena.status, t), (ArenaStatus::Settled, 1));
        assert!(arena
            .markets
            .iter()
            .all(|m| m.status == MarketStatus::No && m.resolved_tick == t));
        assert_eq!(
            payouts,
            TickEffects {
                runner: 3 + 25,
                house_in: 3 * 50,
                ..TickEffects::default()
            }
        );
        assert_eq!(arena.results[0].outcomes, 0b10_10_10);
        assert_eq!(arena.results[0].ride_back_bps, [0; MARKETS]);
    }

    #[test]
    fn a_bust_forfeits_what_bust_won_and_shares_it_with_ride() {
        let mut arena = staged(true);
        arena.markets[0].no_profit = 4;
        arena.markets[0].ride_cost = 20;
        arena.markets[1].no_profit = 2;
        arena.markets[1].ride_cost = 6;
        let payouts = bust_now(&mut arena);
        // 6 owed, under the bond: the driver keeps 19, the house takes 6 to refund RIDE.
        assert_eq!(payouts.runner, 3 + 25 - 6);
        assert_eq!(payouts.house_in, 3 * 50 + 6);
        // Market 0 gets 4 of the 6 over 20 RIDE cost, market 1 gets 2 over 6.
        assert_eq!(arena.results[0].ride_back_bps, [2_000, 3_333, 0]);
    }

    #[test]
    fn the_forfeit_never_exceeds_the_bond() {
        let mut arena = staged(true);
        arena.markets[0].no_profit = 40;
        arena.markets[0].ride_cost = 100;
        let payouts = bust_now(&mut arena);
        assert_eq!(payouts.runner, 3);
        assert_eq!(payouts.house_in, 3 * 50 + 25);
        assert_eq!(arena.results[0].ride_back_bps[0], 2_500);
    }

    #[test]
    fn bust_profit_on_a_passed_line_is_not_owed() {
        let mut arena = staged(true);
        arena.status = ArenaStatus::Live;
        arena.sim.police_gap = 4_000;
        arena.sim.t = LINES[0] - 1;
        arena.markets[0].no_profit = 20;
        arena.advance(terms()).unwrap();
        assert_eq!(arena.markets[0].status, MarketStatus::Yes);
        arena.markets[1].no_profit = 5;
        let payouts = bust_now(&mut arena);
        assert_eq!(payouts.runner, 3 + 25 - 5);
    }

    #[test]
    fn crossing_the_last_line_returns_the_bond() {
        let mut arena = staged(true);
        arena.status = ArenaStatus::Live;
        arena.sim.police_gap = 4_000;
        arena.sim.t = LINES[2] - 1;
        let payouts = arena.advance(terms()).unwrap();
        assert!(arena.markets.iter().all(|m| m.status == MarketStatus::Yes));
        assert_eq!(arena.markets[2].resolved_tick, LINES[2]);
        assert_eq!(
            payouts,
            TickEffects {
                house_in: 3 * 50,
                crossed: 0b111,
                ..TickEffects::default()
            }
        );
        // BUST holders on passed lines are owed nothing, so the bond comes back whole.
        arena.markets[2].no_profit = 9;

        arena.sim.police_gap = 1;
        arena.sim.speed = 0;
        let payouts = run_until(&mut arena, ArenaStatus::Settled);
        assert_eq!(payouts.runner, 3 + 25);
        assert_eq!(payouts.house_in, 0);
        assert_eq!(arena.results[0].outcomes, 0b01_01_01);
    }

    #[test]
    fn begin_opens_markets_and_requires_idle() {
        let mut arena = staged(true);
        assert!(arena.begin(Pubkey::new_unique(), 25, 50, EVEN).is_err());
        arena.status = ArenaStatus::Idle;
        arena.markets[1].status = MarketStatus::No;
        arena.markets[1].no_profit = 9;
        arena.markets[1].ride_back_bps = 9;
        let runner = Pubkey::new_unique();
        arena.begin(runner, 30, 70, EVEN).unwrap();
        assert_eq!((arena.nonce, arena.runner, arena.bond), (8, runner, 30));
        assert_eq!(arena.status, ArenaStatus::Staging);
        assert!(arena.markets.iter().all(|m| m.status == MarketStatus::Open
            && m.yes_r == 70
            && m.no_r == 70
            && m.no_profit == 0
            && m.ride_back_bps == 0));
    }

    #[test]
    fn begin_opens_each_line_at_its_price() {
        let mut arena = staged(true);
        arena.status = ArenaStatus::Idle;
        arena
            .begin(Pubkey::new_unique(), 25, 100, [8_000, 5_000, 2_000])
            .unwrap();
        let m = arena.markets;
        assert_eq!(
            (m[0].yes_r, m[0].no_r, m[0].house_yes, m[0].house_no),
            (25, 100, 75, 0)
        );
        assert_eq!((m[1].yes_r, m[1].no_r), (100, 100));
        assert_eq!(
            (m[2].yes_r, m[2].no_r, m[2].house_yes, m[2].house_no),
            (100, 25, 0, 75)
        );
        arena.status = ArenaStatus::Idle;
        assert!(arena
            .begin(Pubkey::new_unique(), 25, 100, [0, 5_000, 5_000])
            .is_err());
    }

    #[test]
    fn an_uneven_opening_still_returns_the_liquidity_on_abort() {
        let mut arena = staged(false);
        arena.status = ArenaStatus::Idle;
        arena
            .begin(arena.runner, 25, 100, [8_500, 4_500, 1_500])
            .unwrap();
        let payouts = run_until(&mut arena, ArenaStatus::Settled);
        assert_eq!(payouts.house_in, 3 * 100);
    }

    #[test]
    fn nitro_costs_the_fee_only_when_a_charge_fires() {
        let mut arena = staged(true);
        arena.status = ArenaStatus::Live;
        let paid = TickTerms {
            entry_fee: 1,
            nitro_fee: 5,
            runner_available: 5,
        };
        let p = arena.advance(paid).unwrap();
        assert_eq!((p.runner_out, p.house_in), (0, 0));
        arena.sim.nitro_pressed = true;
        let p = arena.advance(paid).unwrap();
        assert_eq!((p.runner_out, p.house_in), (5, 5));
        assert_eq!(arena.sim.nitro_left, 2);
        // A press while a charge is burning does not fire, so it is free.
        arena.sim.nitro_pressed = true;
        let p = arena.advance(paid).unwrap();
        assert_eq!(p.runner_out, 0);
        assert_eq!(arena.sim.nitro_left, 2);
    }

    #[test]
    fn a_nitro_the_driver_cannot_pay_for_does_not_fire() {
        let mut arena = staged(true);
        arena.status = ArenaStatus::Live;
        arena.sim.nitro_pressed = true;
        let broke = TickTerms {
            entry_fee: 1,
            nitro_fee: 5,
            runner_available: 4,
        };
        let p = arena.advance(broke).unwrap();
        assert_eq!(p.runner_out, 0);
        assert_eq!((arena.sim.nitro_left, arena.sim.nitro_ticks), (3, 0));
        assert!(!arena.sim.nitro_pressed);
    }

    #[test]
    fn settled_returns_to_idle_and_idle_is_a_no_op() {
        let mut arena = staged(true);
        arena.status = ArenaStatus::Settled;
        run_until(&mut arena, ArenaStatus::Idle);
        let before = arena.clone();
        assert_eq!(arena.advance(terms()).unwrap(), TickEffects::default());
        assert_eq!(arena.status, before.status);
        assert_eq!(arena.phase_ticks, before.phase_ticks);
    }

    #[test]
    fn results_ring_wraps() {
        let mut arena = staged(false);
        arena.results_head = (RESULTS - 1) as u8;
        run_until(&mut arena, ArenaStatus::Settled);
        assert_eq!(arena.results[RESULTS - 1].nonce, 7);
        assert_eq!(arena.results_head, 0);
    }

    #[test]
    fn sim_round_trips_through_the_account_copy() {
        let mut state = SimState::start();
        state.set_input(4, true);
        state.police_gap = -12;
        assert_eq!(SimState::from(RunSim::from(state)), state);
    }

    #[test]
    fn a_run_holds_the_runner_and_house_balances_until_idle() {
        let mut arena = staged(true);
        let runner = arena.runner;
        let house = Pubkey::new_unique();
        let other = Pubkey::new_unique();
        for status in [
            ArenaStatus::Staging,
            ArenaStatus::Live,
            ArenaStatus::Settled,
        ] {
            arena.status = status;
            assert!(arena.uses_balance(&runner, &house));
            assert!(arena.uses_balance(&house, &house));
            assert!(!arena.uses_balance(&other, &house));
        }
        arena.status = ArenaStatus::Idle;
        assert!(!arena.uses_balance(&runner, &house));
        assert!(!arena.uses_balance(&house, &house));
    }

    #[test]
    fn recover_only_resets_a_settled_arena() {
        let mut arena = staged(true);
        for status in [ArenaStatus::Idle, ArenaStatus::Staging, ArenaStatus::Live] {
            arena.status = status;
            let before = arena.status;
            assert!(arena.recover().is_err());
            assert_eq!(arena.status, before);
        }
        arena.status = ArenaStatus::Settled;
        arena.phase_ticks = 28;
        let nonce = arena.nonce;
        arena.recover().unwrap();
        assert_eq!(
            (arena.status, arena.phase_ticks, arena.nonce),
            (ArenaStatus::Idle, 0, nonce)
        );
    }
}

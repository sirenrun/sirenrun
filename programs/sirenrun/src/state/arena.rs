use anchor_lang::prelude::*;

use crate::constants::{LINES, SEED_TIMEOUT_TICKS, SETTLE_TICKS, STAGING_TICKS};
use crate::errors::SirenrunError;
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

#[derive(
    AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, Default, Debug, PartialEq, Eq,
)]
pub struct Market {
    pub line: u16,
    pub status: MarketStatus,
    pub yes_r: u64,
    pub no_r: u64,
    pub resolved_tick: u32,
}

#[derive(
    AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, Default, Debug, PartialEq, Eq,
)]
pub struct RunResult {
    pub nonce: u32,
    pub outcomes: u8,
    pub resolved_ticks: [u32; MARKETS],
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
    pub no_profit_oi: u64,
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
    pub house_in: u64,
    pub house_out: u64,
    pub crossed: u8,
}

impl Arena {
    pub const SPACE: usize = 8 + Self::INIT_SPACE;

    /// Resets an idle arena for a new run and opens each market with `liquidity` per side.
    pub fn begin(&mut self, runner: Pubkey, bond: u64, liquidity: u64) -> Result<()> {
        require!(self.status == ArenaStatus::Idle, SirenrunError::ArenaBusy);
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
        self.no_profit_oi = 0;
        self.runner_fees = 0;
        for market in &mut self.markets {
            market.status = MarketStatus::Open;
            market.yes_r = liquidity;
            market.no_r = liquidity;
            market.resolved_tick = 0;
        }
        Ok(())
    }

    /// One crank tick of the run lifecycle: Staging, Live, Settled, Idle.
    pub fn advance(&mut self, entry_fee: u64) -> Result<TickEffects> {
        match self.status {
            ArenaStatus::Idle => Ok(TickEffects::default()),
            ArenaStatus::Staging => self.advance_staging(entry_fee),
            ArenaStatus::Live => self.advance_live(),
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
        // `buy` requires the seed, so an aborted run has no trades and each pool still holds
        // exactly the house's liquidity.
        let mut pools: u64 = 0;
        for market in &mut self.markets {
            market.status = MarketStatus::Void;
            pools = pools
                .checked_add(market.yes_r)
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
            crossed: 0,
        })
    }

    fn advance_live(&mut self) -> Result<TickEffects> {
        let mut sim = SimState::from(self.sim);
        step(&mut sim, self.seed);
        self.sim = sim.into();

        // The house is the LP: a resolved pool's winning-side reserve is its share.
        let mut effects = TickEffects::default();
        for (i, market) in self.markets.iter_mut().enumerate() {
            if market.status == MarketStatus::Open && sim.t >= u32::from(market.line) {
                market.status = MarketStatus::Yes;
                market.resolved_tick = sim.t;
                effects.house_in = effects
                    .house_in
                    .checked_add(market.yes_r)
                    .ok_or(SirenrunError::MathOverflow)?;
                effects.crossed |= 1 << i;
            }
        }
        if !sim.busted {
            return Ok(effects);
        }
        for market in &mut self.markets {
            if market.status == MarketStatus::Open {
                market.status = MarketStatus::No;
                market.resolved_tick = sim.t;
                effects.house_in = effects
                    .house_in
                    .checked_add(market.no_r)
                    .ok_or(SirenrunError::MathOverflow)?;
            }
        }

        effects.runner = self.runner_fees;
        if self.markets[MARKETS - 1].status == MarketStatus::Yes {
            effects.runner = effects
                .runner
                .checked_add(self.bond)
                .ok_or(SirenrunError::MathOverflow)?;
        } else {
            effects.house_in = effects
                .house_in
                .checked_add(self.bond)
                .ok_or(SirenrunError::MathOverflow)?;
        }
        self.finish();
        Ok(effects)
    }

    fn finish(&mut self) {
        let head = usize::from(self.results_head) % RESULTS;
        self.results[head] = RunResult {
            nonce: self.nonce,
            outcomes: self.outcomes(),
            resolved_ticks: self.markets.map(|m| m.resolved_tick),
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
        assert_eq!(Market::INIT_SPACE, 23);
        assert_eq!(RunResult::INIT_SPACE, 17);
        assert_eq!(RunSim::INIT_SPACE, 27);
        assert_eq!(Arena::SPACE, 451);
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
            no_profit_oi: 0,
            runner_fees: 3,
            markets,
            results: [RunResult::default(); RESULTS],
            results_head: 0,
        }
    }

    fn run_until(arena: &mut Arena, status: ArenaStatus) -> TickEffects {
        let mut total = TickEffects::default();
        for _ in 0..5_000 {
            let p = arena.advance(1).unwrap();
            total.runner += p.runner;
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
            arena.advance(1).unwrap();
            assert_eq!(arena.status, ArenaStatus::Staging);
        }
        arena.advance(1).unwrap();
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
                crossed: 0
            }
        );
        assert!(arena.markets.iter().all(|m| m.status == MarketStatus::Void));
        assert_eq!(arena.results[0].nonce, 7);
        assert_eq!(arena.results[0].outcomes, 0b11_11_11);
        assert_eq!(arena.results_head, 1);
    }

    #[test]
    fn bust_before_any_line_forfeits_the_bond() {
        let mut arena = staged(true);
        arena.status = ArenaStatus::Live;
        arena.sim.police_gap = 1;
        arena.sim.speed = 0;
        let payouts = arena.advance(1).unwrap();
        let t = arena.sim.t;
        assert_eq!((arena.status, t), (ArenaStatus::Settled, 1));
        assert!(arena
            .markets
            .iter()
            .all(|m| m.status == MarketStatus::No && m.resolved_tick == t));
        assert_eq!(
            payouts,
            TickEffects {
                runner: 3,
                house_in: 3 * 50 + 25,
                house_out: 0,
                crossed: 0
            }
        );
        assert_eq!(arena.results[0].outcomes, 0b10_10_10);
    }

    #[test]
    fn crossing_the_last_line_returns_the_bond() {
        let mut arena = staged(true);
        arena.status = ArenaStatus::Live;
        arena.sim.police_gap = 4_000;
        arena.sim.t = LINES[2] - 1;
        let payouts = arena.advance(1).unwrap();
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
        assert!(arena.begin(Pubkey::new_unique(), 25, 50).is_err());
        arena.status = ArenaStatus::Idle;
        arena.markets[1].status = MarketStatus::No;
        let runner = Pubkey::new_unique();
        arena.begin(runner, 30, 70).unwrap();
        assert_eq!((arena.nonce, arena.runner, arena.bond), (8, runner, 30));
        assert_eq!(arena.status, ArenaStatus::Staging);
        assert!(arena
            .markets
            .iter()
            .all(|m| m.status == MarketStatus::Open && m.yes_r == 70 && m.no_r == 70));
    }

    #[test]
    fn settled_returns_to_idle_and_idle_is_a_no_op() {
        let mut arena = staged(true);
        arena.status = ArenaStatus::Settled;
        run_until(&mut arena, ArenaStatus::Idle);
        let before = arena.clone();
        assert_eq!(arena.advance(1).unwrap(), TickEffects::default());
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
}

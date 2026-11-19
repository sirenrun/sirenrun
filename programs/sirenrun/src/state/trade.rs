use anchor_lang::prelude::*;

use super::{Arena, ArenaStatus, Balance, MarketStatus, PositionEntry, MARKETS};
use crate::errors::SirenrunError;
use crate::market::{buy, mul_bps, Fill};

/// `PositionEntry::side` values. 0 marks a free slot.
pub const ENTRY_EMPTY: u8 = 0;
pub const ENTRY_YES: u8 = 1;
pub const ENTRY_NO: u8 = 2;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side {
    Yes,
    No,
}

impl Side {
    pub fn entry_code(self) -> u8 {
        match self {
            Side::Yes => ENTRY_YES,
            Side::No => ENTRY_NO,
        }
    }
}

/// Fee and size limits for a buy, copied from `Config`.
#[derive(Clone, Copy, Debug)]
pub struct BuyTerms {
    pub fee_bps: u16,
    pub runner_fee_bps: u16,
    pub max_buy: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Trade {
    pub net: u64,
    pub fill: Fill,
}

impl Balance {
    /// The entry already holding this position, else the first free slot.
    fn entry_slot(&self, arena_id: u8, nonce: u32, market: u8, side: u8) -> Option<usize> {
        let same = |e: &PositionEntry| {
            e.side == side && e.arena_id == arena_id && e.nonce == nonce && e.market == market
        };
        self.entries
            .iter()
            .position(same)
            .or_else(|| self.entries.iter().position(|e| e.side == ENTRY_EMPTY))
    }
}

impl Arena {
    #[allow(clippy::too_many_arguments)]
    pub fn buy(
        &mut self,
        trader: &mut Balance,
        house: &mut Balance,
        terms: BuyTerms,
        market: u8,
        side: Side,
        amount: u64,
        min_shares: u64,
    ) -> Result<Trade> {
        require!(
            matches!(self.status, ArenaStatus::Staging | ArenaStatus::Live),
            SirenrunError::ArenaNotLive
        );
        require!(self.seed_ready, SirenrunError::SeedNotReady);
        let index = usize::from(market);
        require!(
            index < MARKETS && self.markets[index].status == MarketStatus::Open,
            SirenrunError::MarketClosed
        );
        require_keys_neq!(trader.owner, self.runner, SirenrunError::RunnerCannotTrade);
        require!(amount <= terms.max_buy, SirenrunError::TooLarge);

        let fee = mul_bps(amount, terms.fee_bps).ok_or(SirenrunError::MathOverflow)?;
        let runner_fee =
            mul_bps(amount, terms.runner_fee_bps).ok_or(SirenrunError::MathOverflow)?;
        let net = amount.checked_sub(fee).ok_or(SirenrunError::MathOverflow)?;
        let pool = &self.markets[index];
        let fill = buy(pool.yes_r, pool.no_r, side == Side::Yes, net)
            .ok_or(SirenrunError::MathOverflow)?;
        require!(fill.shares >= min_shares, SirenrunError::Slippage);

        // NO buyers profit if the run ends early; capping their total profit at the bond means
        // a driver cannot win by crashing on purpose.
        if side == Side::No {
            self.no_profit_oi = self
                .no_profit_oi
                .checked_add(fill.shares - net)
                .ok_or(SirenrunError::MathOverflow)?;
            require!(
                self.no_profit_oi <= self.bond,
                SirenrunError::NoInterestCapReached
            );
        }

        let code = side.entry_code();
        let slot = trader
            .entry_slot(self.id, self.nonce, market, code)
            .ok_or(SirenrunError::NoFreeEntry)?;
        trader.debit(amount)?;
        house.credit(fee - runner_fee)?;
        self.runner_fees = self
            .runner_fees
            .checked_add(runner_fee)
            .ok_or(SirenrunError::MathOverflow)?;

        let entry = &mut trader.entries[slot];
        entry.shares = entry
            .shares
            .checked_add(fill.shares)
            .ok_or(SirenrunError::MathOverflow)?;
        entry.cost = entry
            .cost
            .checked_add(net)
            .ok_or(SirenrunError::MathOverflow)?;
        entry.arena_id = self.id;
        entry.nonce = self.nonce;
        entry.market = market;
        entry.side = code;
        entry.tick = self.sim.t;

        let pool = &mut self.markets[index];
        pool.yes_r = fill.yes;
        pool.no_r = fill.no;
        Ok(Trade { net, fill })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::{LINES, MAX_ENTRIES};
    use crate::sim::SimState;
    use crate::state::{Market, RunResult, RESULTS};

    const TERMS: BuyTerms = BuyTerms {
        fee_bps: 200,
        runner_fee_bps: 100,
        max_buy: 50_000_000,
    };

    fn balance(available: u64) -> Balance {
        Balance {
            owner: Pubkey::new_unique(),
            available,
            entries: [PositionEntry::default(); MAX_ENTRIES],
            bump: 255,
        }
    }

    fn live_arena(liquidity: u64, bond: u64) -> Arena {
        let mut arena = Arena {
            id: 1,
            bump: 255,
            status: ArenaStatus::Idle,
            phase_ticks: 0,
            nonce: 0,
            runner: Pubkey::new_unique(),
            seed_ready: false,
            seed: 0,
            sim: SimState::start().into(),
            bond: 0,
            no_profit_oi: 0,
            runner_fees: 0,
            markets: [Market::default(); MARKETS],
            results: [RunResult::default(); RESULTS],
            results_head: 0,
        };
        for (market, line) in arena.markets.iter_mut().zip(LINES) {
            market.line = line as u16;
        }
        let runner = arena.runner;
        arena.begin(runner, bond, liquidity).unwrap();
        arena.seed_ready = true;
        arena.status = ArenaStatus::Live;
        arena.sim.t = 40;
        arena
    }

    fn code(result: Result<Trade>, expected: SirenrunError) {
        assert_eq!(result.unwrap_err(), expected.into());
    }

    #[test]
    fn buy_moves_money_and_records_the_position() {
        let mut arena = live_arena(50_000_000, 25_000_000);
        let (mut trader, mut house) = (balance(20_000_000), balance(0));
        let trade = arena
            .buy(&mut trader, &mut house, TERMS, 1, Side::Yes, 10_000_000, 0)
            .unwrap();

        assert_eq!(trade.net, 9_800_000);
        assert_eq!(trader.available, 10_000_000);
        assert_eq!(house.available, 100_000);
        assert_eq!(arena.runner_fees, 100_000);
        assert_eq!(
            (arena.markets[1].yes_r, arena.markets[1].no_r),
            (trade.fill.yes, trade.fill.no)
        );
        let entry = trader.entries[0];
        assert_eq!(
            (entry.arena_id, entry.nonce, entry.market, entry.side),
            (1, 1, 1, ENTRY_YES)
        );
        assert_eq!(
            (entry.shares, entry.cost, entry.tick),
            (trade.fill.shares, 9_800_000, 40)
        );
    }

    #[test]
    fn repeat_buys_merge_and_reset_the_cooldown_tick() {
        let mut arena = live_arena(50_000_000, 25_000_000);
        let (mut trader, mut house) = (balance(20_000_000), balance(0));
        let first = arena
            .buy(&mut trader, &mut house, TERMS, 0, Side::Yes, 1_000_000, 0)
            .unwrap();
        arena.sim.t = 90;
        let second = arena
            .buy(&mut trader, &mut house, TERMS, 0, Side::Yes, 1_000_000, 0)
            .unwrap();
        let entry = trader.entries[0];
        assert_eq!(entry.shares, first.fill.shares + second.fill.shares);
        assert_eq!(entry.tick, 90);
        assert_eq!(trader.entries[1].side, ENTRY_EMPTY);
    }

    #[test]
    fn buy_rejects_bad_state_and_limits() {
        let mut arena = live_arena(50_000_000, 25_000_000);
        let (mut trader, mut house) = (balance(100_000_000), balance(0));

        arena.seed_ready = false;
        code(
            arena.buy(&mut trader, &mut house, TERMS, 0, Side::Yes, 1, 0),
            SirenrunError::SeedNotReady,
        );
        arena.seed_ready = true;

        code(
            arena.buy(&mut trader, &mut house, TERMS, 3, Side::Yes, 1, 0),
            SirenrunError::MarketClosed,
        );
        arena.markets[0].status = MarketStatus::Yes;
        code(
            arena.buy(&mut trader, &mut house, TERMS, 0, Side::Yes, 1, 0),
            SirenrunError::MarketClosed,
        );

        code(
            arena.buy(&mut trader, &mut house, TERMS, 1, Side::Yes, 50_000_001, 0),
            SirenrunError::TooLarge,
        );
        code(
            arena.buy(
                &mut trader,
                &mut house,
                TERMS,
                1,
                Side::Yes,
                1_000_000,
                u64::MAX,
            ),
            SirenrunError::Slippage,
        );

        let mut runner = balance(10_000_000);
        runner.owner = arena.runner;
        code(
            arena.buy(&mut runner, &mut house, TERMS, 1, Side::No, 1_000_000, 0),
            SirenrunError::RunnerCannotTrade,
        );

        let mut poor = balance(10);
        code(
            arena.buy(&mut poor, &mut house, TERMS, 1, Side::Yes, 1_000, 0),
            SirenrunError::InsufficientBalance,
        );

        arena.status = ArenaStatus::Settled;
        code(
            arena.buy(&mut trader, &mut house, TERMS, 1, Side::Yes, 1, 0),
            SirenrunError::ArenaNotLive,
        );
    }

    #[test]
    fn no_side_profit_is_capped_by_the_bond() {
        let mut arena = live_arena(50_000_000, 1_000_000);
        let (mut trader, mut house) = (balance(100_000_000), balance(0));
        arena
            .buy(&mut trader, &mut house, TERMS, 2, Side::No, 1_000_000, 0)
            .unwrap();
        assert!(arena.no_profit_oi > 0 && arena.no_profit_oi <= arena.bond);
        code(
            arena.buy(&mut trader, &mut house, TERMS, 2, Side::No, 50_000_000, 0),
            SirenrunError::NoInterestCapReached,
        );
        arena
            .buy(&mut trader, &mut house, TERMS, 2, Side::Yes, 50_000_000, 0)
            .unwrap();
    }

    #[test]
    fn entries_run_out() {
        let mut arena = live_arena(50_000_000, 25_000_000);
        let (mut trader, mut house) = (balance(100_000_000), balance(0));
        for nonce in 0..MAX_ENTRIES as u32 {
            arena.nonce = nonce;
            arena
                .buy(&mut trader, &mut house, TERMS, 0, Side::Yes, 1_000, 0)
                .unwrap();
        }
        arena.nonce = 99;
        code(
            arena.buy(&mut trader, &mut house, TERMS, 0, Side::Yes, 1_000, 0),
            SirenrunError::NoFreeEntry,
        );
    }
}

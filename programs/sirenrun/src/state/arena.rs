use anchor_lang::prelude::*;

use crate::constants::LINES;
use crate::sim::SimState;

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

impl Arena {
    pub const SPACE: usize = 8 + Self::INIT_SPACE;
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

    #[test]
    fn sim_round_trips_through_the_account_copy() {
        let mut state = SimState::start();
        state.set_input(4, true);
        state.police_gap = -12;
        assert_eq!(SimState::from(RunSim::from(state)), state);
    }
}

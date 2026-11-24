use anchor_lang::prelude::*;

use super::MARKETS;
use crate::errors::SirenrunError;

pub const CONFIG_SEED: &[u8] = b"config";
pub const VAULT_SEED: &[u8] = b"vault";

const BPS_DENOMINATOR: u16 = 10_000;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub house: Pubkey,
    pub fee_bps: u16,
    pub runner_fee_bps: u16,
    pub entry_fee: u64,
    pub bond: u64,
    pub liquidity: u64,
    pub max_buy: u64,
    /// Charged to the driver each time a nitro charge fires; unused charges cost nothing.
    pub nitro_fee: u64,
    /// Opening RIDE (YES) price per line in bps, so no market opens at a free 50/50.
    pub open_bps: [u16; MARKETS],
    pub bump: u8,
    pub vault_bump: u8,
    /// Fewest ER slots between two ticks that advance an arena; 0 turns the guard off. `tick`
    /// is open to anyone, so this is what stops a run being played faster than the crank.
    /// Slot length differs between validators (10 ms on 2.0, 50 ms on 1.x), hence a setting.
    /// Last field, so `resize_config` can grow a Config written before it existed.
    pub min_tick_slots: u8,
}

/// Size of a Config written before `min_tick_slots`; `resize_config` grows it to `SPACE`.
pub const CONFIG_V1_SPACE: usize = 188;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct ConfigParams {
    pub house: Pubkey,
    pub fee_bps: u16,
    pub runner_fee_bps: u16,
    pub entry_fee: u64,
    pub bond: u64,
    pub liquidity: u64,
    pub max_buy: u64,
    pub nitro_fee: u64,
    pub open_bps: [u16; MARKETS],
    pub min_tick_slots: u8,
}

impl ConfigParams {
    pub fn validate(&self) -> Result<()> {
        require!(
            self.fee_bps <= BPS_DENOMINATOR
                && self.runner_fee_bps <= self.fee_bps
                && self.liquidity > 0
                && self.max_buy > 0
                && self
                    .open_bps
                    .iter()
                    .all(|&bps| bps > 0 && bps < BPS_DENOMINATOR),
            SirenrunError::InvalidConfig
        );
        Ok(())
    }
}

impl Config {
    pub const SPACE: usize = 8 + Self::INIT_SPACE;

    pub fn apply(&mut self, params: &ConfigParams) {
        self.house = params.house;
        self.fee_bps = params.fee_bps;
        self.runner_fee_bps = params.runner_fee_bps;
        self.entry_fee = params.entry_fee;
        self.bond = params.bond;
        self.liquidity = params.liquidity;
        self.max_buy = params.max_buy;
        self.nitro_fee = params.nitro_fee;
        self.open_bps = params.open_bps;
        self.min_tick_slots = params.min_tick_slots;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params() -> ConfigParams {
        ConfigParams {
            house: Pubkey::new_unique(),
            fee_bps: 200,
            runner_fee_bps: 100,
            entry_fee: 1_000_000,
            bond: 25_000_000,
            liquidity: 50_000_000,
            max_buy: 50_000_000,
            nitro_fee: 500_000,
            open_bps: [8_500, 4_500, 1_500],
            min_tick_slots: 8,
        }
    }

    #[test]
    fn space_matches_spec() {
        assert_eq!(Config::SPACE, 189);
        assert_eq!(Config::SPACE, CONFIG_V1_SPACE + 1);
    }

    #[test]
    fn accepts_spec_example() {
        assert!(params().validate().is_ok());
    }

    #[test]
    fn rejects_inconsistent_params() {
        let cases = [
            ConfigParams {
                fee_bps: 10_001,
                ..params()
            },
            ConfigParams {
                runner_fee_bps: 201,
                ..params()
            },
            ConfigParams {
                liquidity: 0,
                ..params()
            },
            ConfigParams {
                max_buy: 0,
                ..params()
            },
            ConfigParams {
                open_bps: [8_500, 0, 1_500],
                ..params()
            },
            ConfigParams {
                open_bps: [10_000, 4_500, 1_500],
                ..params()
            },
        ];
        for case in cases {
            assert!(case.validate().is_err(), "{case:?}");
        }
    }
}

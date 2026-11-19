use anchor_lang::prelude::*;

use crate::constants::MAX_ENTRIES;
use crate::errors::SirenrunError;

pub const BALANCE_SEED: &[u8] = b"balance";

#[derive(
    AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, Default, Debug, PartialEq, Eq,
)]
pub struct PositionEntry {
    pub arena_id: u8,
    pub nonce: u32,
    pub market: u8,
    pub side: u8,
    pub shares: u64,
    pub cost: u64,
    pub tick: u32,
}

#[account]
#[derive(InitSpace)]
pub struct Balance {
    pub owner: Pubkey,
    pub available: u64,
    pub entries: [PositionEntry; MAX_ENTRIES],
    pub bump: u8,
}

impl Balance {
    pub const SPACE: usize = 8 + Self::INIT_SPACE;

    pub fn credit(&mut self, amount: u64) -> Result<()> {
        self.available = self
            .available
            .checked_add(amount)
            .ok_or(SirenrunError::MathOverflow)?;
        Ok(())
    }

    pub fn debit(&mut self, amount: u64) -> Result<()> {
        self.available = self
            .available
            .checked_sub(amount)
            .ok_or(SirenrunError::InsufficientBalance)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn balance(available: u64) -> Balance {
        Balance {
            owner: Pubkey::new_unique(),
            available,
            entries: [PositionEntry::default(); MAX_ENTRIES],
            bump: 255,
        }
    }

    #[test]
    fn space_matches_spec() {
        assert_eq!(PositionEntry::INIT_SPACE, 27);
        assert_eq!(Balance::SPACE, 265);
    }

    #[test]
    fn credit_and_debit_are_checked() {
        let mut b = balance(10);
        b.credit(5).unwrap();
        b.debit(15).unwrap();
        assert_eq!(b.available, 0);
        assert!(b.debit(1).is_err());

        let mut full = balance(u64::MAX);
        assert!(full.credit(1).is_err());
        assert_eq!(full.available, u64::MAX);
    }
}

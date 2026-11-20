//! Pure market math. Defined by `docs/onchain-program.md`; no Anchor imports.

mod fpmm;
mod settle;

pub use fpmm::{buy, mul_bps, Fill};
pub use settle::{forfeit, open_pool, ride_back_bps, Opening};

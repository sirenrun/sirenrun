//! Pure market math. Defined by `docs/onchain-program.md`; no Anchor imports.

mod fpmm;

pub use fpmm::{buy, mul_bps, Fill};

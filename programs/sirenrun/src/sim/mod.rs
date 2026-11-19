//! Pure, deterministic game simulation. Defined by `docs/game-design.md`; mirrored in
//! `packages/sim`. No Anchor, no clock, no randomness beyond the seed.

mod course;
mod state;
mod step;

pub use course::{blocked, generate_row, next_safe_lane, row_hash, splitmix64, Row};
pub use state::SimState;
pub use step::step;

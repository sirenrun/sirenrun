use anchor_lang::prelude::*;

#[error_code]
pub enum SirenrunError {
    #[msg("Arena is busy")]
    ArenaBusy,
    #[msg("Arena is not live")]
    ArenaNotLive,
    #[msg("Market is closed")]
    MarketClosed,
    #[msg("Insufficient balance")]
    InsufficientBalance,
    #[msg("House balance is too low")]
    HouseInsufficient,
    #[msg("Amount is too large")]
    TooLarge,
    #[msg("Slippage limit exceeded")]
    Slippage,
    #[msg("NO interest cap reached")]
    NoInterestCapReached,
    #[msg("The driver cannot trade their own run")]
    RunnerCannotTrade,
    #[msg("No free position entry")]
    NoFreeEntry,
    #[msg("Market is not resolved")]
    NotResolved,
    #[msg("Run result has expired")]
    ResultExpired,
    #[msg("Invalid lane")]
    InvalidLane,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Seed is not ready")]
    SeedNotReady,
    #[msg("Invalid config parameters")]
    InvalidConfig,
    #[msg("Invalid arena id")]
    InvalidArena,
    #[msg("No position in this entry")]
    NoEntry,
    #[msg("Balance is in use by a run")]
    BalanceInUse,
    #[msg("Arena is not settled")]
    ArenaNotSettled,
}

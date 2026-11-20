use anchor_lang::prelude::*;

use crate::errors::SirenrunError;
use crate::state::{Arena, Config, ARENA_SEED, CONFIG_SEED};

/// Admin-only, on the ER: moves a Settled arena whose crank can no longer run back to Idle.
#[derive(Accounts)]
pub struct RecoverArena<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ SirenrunError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [ARENA_SEED, &[arena.id]], bump = arena.bump)]
    pub arena: Account<'info, Arena>,
}

pub fn recover_arena(ctx: Context<RecoverArena>) -> Result<()> {
    ctx.accounts.arena.recover()
}

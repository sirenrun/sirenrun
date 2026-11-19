use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;

use crate::errors::SirenrunError;
use crate::state::{Config, ARENA_SEED, CONFIG_SEED};

#[delegate]
#[derive(Accounts)]
#[instruction(id: u8)]
pub struct DelegateArena<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ SirenrunError::Unauthorized)]
    pub config: Account<'info, Config>,
    /// CHECK: the arena PDA, checked by seeds and handed to the delegation program
    #[account(mut, del, seeds = [ARENA_SEED, &[id]], bump)]
    pub arena: UncheckedAccount<'info>,
}

/// The first remaining account, if any, is the ER validator identity to delegate to.
pub fn delegate_arena(ctx: Context<DelegateArena>, id: u8) -> Result<()> {
    ctx.accounts.delegate_arena(
        &ctx.accounts.admin,
        &[ARENA_SEED, &[id]],
        DelegateConfig {
            validator: ctx.remaining_accounts.first().map(|a| a.key()),
            ..Default::default()
        },
    )?;
    Ok(())
}

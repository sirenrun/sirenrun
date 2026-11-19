use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;

use crate::state::BALANCE_SEED;

#[delegate]
#[derive(Accounts)]
pub struct DelegateBalance<'info> {
    pub owner: Signer<'info>,
    /// CHECK: the owner's balance PDA, checked by seeds and handed to the delegation program
    #[account(mut, del, seeds = [BALANCE_SEED, owner.key().as_ref()], bump)]
    pub balance: UncheckedAccount<'info>,
}

/// The first remaining account, if any, is the ER validator identity to delegate to.
pub fn delegate_balance(ctx: Context<DelegateBalance>) -> Result<()> {
    let owner = ctx.accounts.owner.key();
    ctx.accounts.delegate_balance(
        &ctx.accounts.owner,
        &[BALANCE_SEED, owner.as_ref()],
        DelegateConfig {
            validator: ctx.remaining_accounts.first().map(|a| a.key()),
            ..Default::default()
        },
    )?;
    Ok(())
}

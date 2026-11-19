use anchor_lang::prelude::*;

use crate::state::{Balance, BALANCE_SEED};

#[derive(Accounts)]
pub struct InitBalance<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        space = Balance::SPACE,
        seeds = [BALANCE_SEED, owner.key().as_ref()],
        bump,
    )]
    pub balance: Account<'info, Balance>,
    pub system_program: Program<'info, System>,
}

pub fn init_balance(ctx: Context<InitBalance>) -> Result<()> {
    let balance = &mut ctx.accounts.balance;
    balance.owner = ctx.accounts.owner.key();
    balance.bump = ctx.bumps.balance;
    Ok(())
}

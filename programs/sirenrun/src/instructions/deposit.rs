use anchor_lang::prelude::*;
use anchor_spl::token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked};

use crate::errors::SirenrunError;
use crate::state::{Balance, Config, BALANCE_SEED, CONFIG_SEED};

/// `balance` is an `Account<Balance>`, so Anchor's owner check rejects a delegated balance.
#[derive(Accounts)]
pub struct Deposit<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [BALANCE_SEED, owner.key().as_ref()],
        bump = balance.bump,
        has_one = owner @ SirenrunError::Unauthorized,
    )]
    pub balance: Account<'info, Balance>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = mint, has_one = vault)]
    pub config: Account<'info, Config>,
    pub mint: Account<'info, Mint>,
    #[account(mut, token::mint = mint, token::authority = owner)]
    pub owner_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    let accounts = &ctx.accounts;
    transfer_checked(
        CpiContext::new(
            accounts.token_program.key(),
            TransferChecked {
                from: accounts.owner_token.to_account_info(),
                mint: accounts.mint.to_account_info(),
                to: accounts.vault.to_account_info(),
                authority: accounts.owner.to_account_info(),
            },
        ),
        amount,
        accounts.mint.decimals,
    )?;
    ctx.accounts.balance.credit(amount)
}

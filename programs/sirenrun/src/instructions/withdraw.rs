use anchor_lang::prelude::*;
use anchor_spl::token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked};

use crate::errors::SirenrunError;
use crate::state::{Balance, Config, BALANCE_SEED, CONFIG_SEED};

#[derive(Accounts)]
pub struct Withdraw<'info> {
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
    #[account(mut, token::mint = mint)]
    pub owner_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    ctx.accounts.balance.debit(amount)?;
    let accounts = &ctx.accounts;
    let signer_seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, &[accounts.config.bump]]];
    transfer_checked(
        CpiContext::new_with_signer(
            accounts.token_program.key(),
            TransferChecked {
                from: accounts.vault.to_account_info(),
                mint: accounts.mint.to_account_info(),
                to: accounts.owner_token.to_account_info(),
                authority: accounts.config.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
        accounts.mint.decimals,
    )
}

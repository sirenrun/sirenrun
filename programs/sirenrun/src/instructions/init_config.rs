use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::state::{Config, ConfigParams, CONFIG_SEED, VAULT_SEED};

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = Config::SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = admin,
        seeds = [VAULT_SEED],
        bump,
        token::mint = mint,
        token::authority = config,
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn init_config(ctx: Context<InitConfig>, params: ConfigParams) -> Result<()> {
    params.validate()?;
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.mint = ctx.accounts.mint.key();
    config.vault = ctx.accounts.vault.key();
    config.bump = ctx.bumps.config;
    config.vault_bump = ctx.bumps.vault;
    config.apply(&params);
    Ok(())
}

use anchor_lang::prelude::*;

use crate::errors::SirenrunError;
use crate::state::{Config, ConfigParams, CONFIG_SEED};

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ SirenrunError::Unauthorized,
    )]
    pub config: Account<'info, Config>,
}

pub fn update_config(ctx: Context<UpdateConfig>, params: ConfigParams) -> Result<()> {
    params.validate()?;
    ctx.accounts.config.apply(&params);
    Ok(())
}

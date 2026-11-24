use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use anchor_lang::Discriminator;

use crate::errors::SirenrunError;
use crate::state::{Config, CONFIG_SEED, CONFIG_V1_SPACE};

/// Byte range of `Config.admin`, right after the discriminator.
const ADMIN: std::ops::Range<usize> = 8..40;

#[derive(Accounts)]
pub struct ResizeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: a Config written before `min_tick_slots` is too short to load as `Config`, so the
    /// owner, discriminator and admin are checked by hand; the seeds pin the address.
    #[account(mut, seeds = [CONFIG_SEED], bump)]
    pub config: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

/// Admin only, base layer, once: grows a Config written before `min_tick_slots` to the current
/// size, with the guard off (0) until `update_config` sets it. A no-op on a current Config.
pub fn resize_config(ctx: Context<ResizeConfig>) -> Result<()> {
    let config = ctx.accounts.config.to_account_info();
    require_keys_eq!(*config.owner, crate::ID, SirenrunError::InvalidConfig);
    {
        let data = config.try_borrow_data()?;
        require!(
            data.len() >= CONFIG_V1_SPACE && data[..8] == *Config::DISCRIMINATOR,
            SirenrunError::InvalidConfig
        );
        let admin = Pubkey::try_from(&data[ADMIN]).map_err(|_| SirenrunError::InvalidConfig)?;
        require_keys_eq!(admin, ctx.accounts.admin.key(), SirenrunError::Unauthorized);
        if data.len() == Config::SPACE {
            return Ok(());
        }
        require!(data.len() == CONFIG_V1_SPACE, SirenrunError::InvalidConfig);
    }

    let rent = Rent::get()?.minimum_balance(Config::SPACE);
    let missing = rent.saturating_sub(config.lamports());
    if missing > 0 {
        transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                Transfer {
                    from: ctx.accounts.admin.to_account_info(),
                    to: config.clone(),
                },
            ),
            missing,
        )?;
    }
    config.resize(Config::SPACE)?;
    config.try_borrow_mut_data()?[CONFIG_V1_SPACE..].fill(0);
    Ok(())
}

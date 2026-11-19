use anchor_lang::prelude::*;

use crate::constants::{ARENAS, LINES};
use crate::errors::SirenrunError;
use crate::state::{Arena, Config, ARENA_SEED, CONFIG_SEED};

#[derive(Accounts)]
#[instruction(id: u8)]
pub struct InitArena<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ SirenrunError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(init, payer = admin, space = Arena::SPACE, seeds = [ARENA_SEED, &[id]], bump)]
    pub arena: Account<'info, Arena>,
    pub system_program: Program<'info, System>,
}

pub fn init_arena(ctx: Context<InitArena>, id: u8) -> Result<()> {
    require!(id < ARENAS, SirenrunError::InvalidArena);
    let arena = &mut ctx.accounts.arena;
    arena.id = id;
    arena.bump = ctx.bumps.arena;
    for (market, line) in arena.markets.iter_mut().zip(LINES) {
        market.line = line as u16;
    }
    Ok(())
}
